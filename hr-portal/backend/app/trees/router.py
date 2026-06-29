"""树结构查询路由

- GET /trees/cost-center        成本中心树
- GET /trees/org                组织架构树
- GET /trees/employment-type    用工类型 distinct 值（用于人员范围筛选下拉）
- GET /trees/employment-entity  用工主体 distinct 值
- GET /trees/persons            人员姓名 distinct 值（支持 keyword 搜索）
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.core.db import get_session
from app.core.deps import current_user
from app.data.models import CostCenterNode, DATA_TABLES, OrgNode
from app.users.models import User


router = APIRouter(prefix="/trees", tags=["trees"])


class TreeNodeOut(BaseModel):
    id: int
    code: str
    name: str
    parent_id: int | None
    level: int
    is_leaf: bool
    is_active: bool
    children: list["TreeNodeOut"] = []


TreeNodeOut.model_rebuild()


def _build_tree(rows: list[Any]) -> list[TreeNodeOut]:
    """把扁平 list 组装成树（按 parent_id）"""
    by_id: dict[int, TreeNodeOut] = {}
    for r in rows:
        by_id[r.id] = TreeNodeOut(
            id=r.id,
            code=r.code,
            name=r.name,
            parent_id=r.parent_id,
            level=r.level,
            is_leaf=r.is_leaf,
            is_active=r.is_active,
            children=[],
        )
    roots: list[TreeNodeOut] = []
    for r in rows:
        node = by_id[r.id]
        if r.parent_id and r.parent_id in by_id:
            by_id[r.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


@router.get("/cost-center", response_model=list[TreeNodeOut])
async def get_cc_tree(
    include_inactive: bool = False,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[TreeNodeOut]:
    """成本中心树（FR-TREE-004 含失效成本中心开关）"""
    stmt = select(CostCenterNode).order_by(CostCenterNode.level, CostCenterNode.code)
    if not include_inactive:
        stmt = stmt.where(CostCenterNode.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    return _build_tree(rows)


@router.get("/org", response_model=list[TreeNodeOut])
async def get_org_tree(
    include_inactive: bool = False,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[TreeNodeOut]:
    """组织架构树（include_inactive=含停用组织：勾选后返回状态非启用的组织单元节点）"""
    stmt = select(OrgNode).order_by(OrgNode.level, OrgNode.code)
    if not include_inactive:
        stmt = stmt.where(OrgNode.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    return _build_tree(rows)


# ===== distinct 值枚举（给「管理人员范围」筛选下拉用）=====


class DistinctValueOut(BaseModel):
    value: str
    active_count: int
    total_count: int


_ROSTER_TABLE = "emp_realtime_roster"
_STATUS_COL = "active_status"


def _roster_model():
    model = DATA_TABLES.get(_ROSTER_TABLE)
    if model is None:
        raise RuntimeError("员工实时花名册未注册，请先完成实体表反射加载")
    if "raw" in model.__table__.columns:
        raise RuntimeError("员工实时花名册不是实体列结构，请先重建为实体列业务表")
    return model


def _entity_column(model, column_code: str):
    if column_code not in model.__table__.columns:
        raise RuntimeError(f"员工实时花名册缺少实体列: {column_code}")
    return model.__table__.c[column_code]


async def _distinct_values_by_column(
    column_code: str, include_inactive: bool, db: AsyncSession
) -> list[DistinctValueOut]:
    """通用 distinct 查询：从 emp_realtime_roster 实体列取某字段的 distinct 值

    - include_inactive=False（默认）：只返回 active_count > 0 的值
    - 按 active 倒序、value 升序
    """
    model = _roster_model()
    value_expr = cast(_entity_column(model, column_code), String)
    status_expr = cast(_entity_column(model, _STATUS_COL), String)
    active_count = func.count().filter(status_expr != "离职").label("active_count")
    total_count = func.count().label("total_count")
    stmt = (
        select(value_expr.label("value"), active_count, total_count)
        .where(value_expr.is_not(None), value_expr != "")
        .group_by(value_expr)
        .order_by(active_count.desc(), value_expr.asc())
    )
    rows = (await db.execute(stmt)).all()
    out: list[DistinctValueOut] = []
    for value, active_count, total_count in rows:
        if not include_inactive and active_count == 0:
            continue
        out.append(
            DistinctValueOut(
                value=value, active_count=active_count, total_count=total_count
            )
        )
    return out


@router.get("/employment-type", response_model=list[DistinctValueOut])
async def get_employment_types(
    include_inactive: bool = False,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[DistinctValueOut]:
    """用工类型 distinct 值（来源：emp_realtime_roster.employee_type）"""
    return await _distinct_values_by_column("employee_type", include_inactive, db)


@router.get("/employment-entity", response_model=list[DistinctValueOut])
async def get_employment_entities(
    include_inactive: bool = False,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[DistinctValueOut]:
    """用工主体 distinct 值（来源：emp_realtime_roster.company_name）"""
    return await _distinct_values_by_column("company_name", include_inactive, db)


class PersonOut(BaseModel):
    value: str  # 姓名（用于权限匹配）
    label: str  # 展示文案（默认 = 姓名）
    department: str | None
    active: bool


@router.get("/persons", response_model=list[PersonOut])
async def get_persons(
    include_inactive: bool = False,
    keyword: str | None = None,
    limit: int = 200,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[PersonOut]:
    """人员姓名 distinct 值（来源：emp_realtime_roster.full_name）

    支持远程搜索：keyword 同时匹配姓名 / 公司级组织
    默认只返回在职人员；勾选 include_inactive 含离职
    """
    limit = max(1, min(limit, 500))
    kw = f"%{keyword.strip()}%" if keyword and keyword.strip() else None

    model = _roster_model()
    name_expr = cast(_entity_column(model, "full_name"), String)
    department_expr = cast(_entity_column(model, "company_org"), String)
    status_expr = cast(_entity_column(model, _STATUS_COL), String)
    active_expr = func.bool_or(status_expr != "离职").label("active")
    stmt = (
        select(name_expr.label("value"), department_expr.label("department"), active_expr)
        .where(name_expr.is_not(None), name_expr != "")
        .group_by(name_expr, department_expr)
        .order_by(active_expr.desc(), name_expr.asc())
        .limit(limit)
    )
    if not include_inactive:
        stmt = stmt.where(status_expr != "离职")
    if kw:
        stmt = stmt.where(name_expr.ilike(kw) | department_expr.ilike(kw))

    rows = (await db.execute(stmt)).all()
    return [
        PersonOut(value=v, label=v, department=dep, active=bool(act))
        for v, dep, act in rows
    ]
