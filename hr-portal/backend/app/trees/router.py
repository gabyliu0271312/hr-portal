"""树结构查询路由

- GET /trees/cost-center        成本中心树
- GET /trees/org                组织架构树
- GET /trees/employment-type    用工类型 distinct 值（用于人员范围筛选下拉）
- GET /trees/employment-entity  用工主体 distinct 值
- GET /trees/persons            人员姓名 distinct 值（支持 keyword 搜索）
"""
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user
from app.data.models import CostCenterNode, EmpRealtimeRoster, OrgNode
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
    """组织架构树（FR-TREE-002 含离职员工开关 — 此处含义=含 inactive 节点）"""
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


async def _distinct_values_by_field(
    field: str, include_inactive: bool, db: AsyncSession
) -> list[DistinctValueOut]:
    """通用 distinct 查询：从 emp_realtime_roster.raw 取某字段的 distinct 值

    - include_inactive=False（默认）：只返回 active_count > 0 的值
    - 按 active 倒序、value 升序
    """
    sql = text(
        """
        SELECT raw->>:field AS value,
               COUNT(*) FILTER (WHERE raw->>'人员状态' != '离职') AS active_count,
               COUNT(*) AS total_count
        FROM emp_realtime_roster
        WHERE raw->>:field IS NOT NULL AND raw->>:field != ''
        GROUP BY raw->>:field
        ORDER BY active_count DESC, value ASC
        """
    )
    rows = (await db.execute(sql, {"field": field})).all()
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
    """用工类型 distinct 值（来源：emp_realtime_roster.员工类型）"""
    return await _distinct_values_by_field("员工类型", include_inactive, db)


@router.get("/employment-entity", response_model=list[DistinctValueOut])
async def get_employment_entities(
    include_inactive: bool = False,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[DistinctValueOut]:
    """用工主体 distinct 值（来源：emp_realtime_roster.公司名称）"""
    return await _distinct_values_by_field("公司名称", include_inactive, db)


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
    """人员姓名 distinct 值（来源：emp_realtime_roster.姓名）

    支持远程搜索：keyword 同时匹配姓名 / 公司级组织
    默认只返回在职人员；勾选 include_inactive 含离职
    """
    limit = max(1, min(limit, 500))
    kw = f"%{keyword.strip()}%" if keyword and keyword.strip() else None

    base = """
        SELECT raw->>'姓名' AS value,
               raw->>'公司级组织' AS department,
               bool_or(raw->>'人员状态' != '离职') AS active
        FROM emp_realtime_roster
        WHERE raw->>'姓名' IS NOT NULL AND raw->>'姓名' != ''
    """
    if not include_inactive:
        base += " AND raw->>'人员状态' != '离职'"
    if kw:
        base += " AND (raw->>'姓名' ILIKE :kw OR raw->>'公司级组织' ILIKE :kw)"
    base += " GROUP BY raw->>'姓名', raw->>'公司级组织' ORDER BY active DESC, value ASC LIMIT :limit"

    params: dict[str, Any] = {"limit": limit}
    if kw:
        params["kw"] = kw

    rows = (await db.execute(text(base), params)).all()
    return [
        PersonOut(value=v, label=v, department=dep, active=bool(act))
        for v, dep, act in rows
    ]
