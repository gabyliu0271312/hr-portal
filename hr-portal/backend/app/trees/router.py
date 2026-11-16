"""树结构查询路由

- GET /trees/cost-center        成本中心树
- GET /trees/org                组织架构树
- GET /trees/employment-type    用工类型 distinct 值（用于人员范围筛选下拉）
- GET /trees/employment-entity  用工主体 distinct 值
- GET /trees/persons            人员姓名 distinct 值（支持 keyword 搜索）
"""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import String, cast, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.models import CostCenterNode, DATA_TABLES, OrgNode
from app.users.models import User
from app.warehouse.schemas import TreeHealthIssueOut


router = APIRouter(prefix="/trees", tags=["trees"])


# 成本中心目录结构性硬阻断：这些规则意味着树无法安全构图 / 权限锚点歧义，
# 展示入口也必须 fail-closed。其余（层级不连续、启停冲突、同名路径等）降级为
# warning，读权限入口不被数据形态阻断；授权/执行链（d_execution 等）仍严格 eligible。
_CC_STRUCTURAL_ISSUES = {
    "duplicate_node_id",  # 节点身份重复 → by_id 覆盖丢节点
    "cycle",              # 循环引用 → 构图错乱
    "orphan_parent",      # 父缺失 → 节点悬浮，构图失真
    "empty_tree",         # 空树
    "root_missing",       # 无根 → 全部悬浮
    "duplicate_code",     # 编码重复 → 权限键歧义
}


class TreeNodeOut(BaseModel):
    id: int
    code: str
    name: str
    parent_id: int | None
    level: int
    is_leaf: bool
    is_active: bool
    synced_at: str | None = None
    children: list["TreeNodeOut"] = []


TreeNodeOut.model_rebuild()


class TreeDirectoryOut(BaseModel):
    """目录树响应：tree + warnings。

    warnings 为健康校验的非阻断问题（层级不连续 / 启停冲突 / 同名路径等），
    仅提示不阻断展示；结构性问题（孤儿 / 循环 / 重复身份 / 重复编码）仍 409。
    """
    tree: list[TreeNodeOut]
    warnings: list[TreeHealthIssueOut] = []


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
            synced_at=getattr(r, "synced_at", None).isoformat() if getattr(r, "synced_at", None) else None,
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


@router.get("/cost-center/directory", response_model=TreeDirectoryOut)
async def get_cc_directory(
    include_inactive: bool = False,
    _: User = Depends(require_op("people.cost_center", "V")),
    db: AsyncSession = Depends(get_session),
) -> TreeDirectoryOut:
    """成本中心目录树（B20.b 通用入口复用）。

    仅菜单授权用户可访问（require_op people.cost_center V）。
    以 tree_health.analyze_tree 做健康校验，按问题类别分级：
    - 空目录返回空树，供首次创建根节点使用；
    - 非空树结构性问题（孤儿 / 循环 / 重复身份 / 重复编码 / 无根）→ 409，
      绝不静默构树扩大授权；
    - 规范性问题（层级不连续 / 启停冲突 / 同名路径 / 深度不一致等）→ 降级为
      warnings 随树返回，读权限入口不被数据形态阻断（执行/授权链仍严格校验）。
    """
    from app.trees.service import CC_ROOT_EXEMPT_CODES
    from app.warehouse.service.tree_health import analyze_tree

    stmt = select(CostCenterNode).order_by(CostCenterNode.level, CostCenterNode.code)
    rows = (await db.execute(stmt)).scalars().all()
    if not rows:
        return TreeDirectoryOut(tree=[], warnings=[])
    health = analyze_tree("cost_center", rows, CC_ROOT_EXEMPT_CODES)
    structural = [issue for issue in health.issues if issue.code in _CC_STRUCTURAL_ISSUES]
    if structural:
        raise HTTPException(status_code=409, detail={
            "code": "cost_center_tree_invalid",
            "message": "成本中心树未通过结构校验，已拒绝返回目录",
            "issues": [issue.__dict__ for issue in structural],
        })
    warnings = [issue for issue in health.issues if issue.code not in _CC_STRUCTURAL_ISSUES]
    if include_inactive:
        kept = rows
    else:
        kept = [row for row in rows if row.is_active]
    return TreeDirectoryOut(tree=_build_tree(kept), warnings=warnings)


class CostCenterCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    parent_id: int | None = Field(default=None, gt=0)


@router.post(
    "/cost-center/directory", response_model=TreeNodeOut, status_code=201,
    dependencies=[Depends(require_op("people.cost_center", "V"))],
)
async def create_cc_directory(
    body: CostCenterCreate,
    _: User = Depends(require_op("people.cost_center", "C")),
    db: AsyncSession = Depends(get_session),
) -> TreeNodeOut:
    from app.trees.service import (
        business_path_of, chain_depth, cost_center_structure,
        lock_cost_center_tree, recompute_cost_center_structure,
    )

    try:
        await lock_cost_center_tree(db)
        if body.code == "root costcenter":
            raise HTTPException(status_code=409, detail="成本中心编码已存在")
        rows = (await db.execute(select(CostCenterNode).execution_options(populate_existing=True))).scalars().all()
        if any(node.code == body.code for node in rows):
            raise HTTPException(status_code=409, detail="成本中心编码已存在")
        try:
            structure = cost_center_structure(rows)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        # 未指定上级时挂到固定根下（固定根存在时）；否则直接作为业务根
        parent_id = body.parent_id
        if parent_id is None:
            root = next((node for node in rows if node.code == "root costcenter"), None)
            parent_id = root.id if root else None
        parent = next((node for node in rows if node.id == parent_id), None)
        if parent_id is not None and parent is None:
            raise HTTPException(status_code=422, detail="上级成本中心不存在")
        chain = structure[parent.id][2] if parent is not None else []
        if any(not node.is_active for node in chain):
            raise HTTPException(status_code=409, detail="上级成本中心及其祖先必须启用")
        if chain_depth(chain) >= 50:
            raise HTTPException(status_code=422, detail="成本中心树超过现有路径计算支持的50级深度")
        path = business_path_of(parent, body.name, structure)
        if len(path) > 1024:
            raise HTTPException(status_code=422, detail="成本中心路径不能超过1024个字符")
        if "/" in body.name or any(value[1] == path for value in structure.values()):
            raise HTTPException(status_code=409, detail="成本中心名称产生重复或有歧义的路径")
        node = CostCenterNode(
            code=body.code, name=body.name, parent_id=parent_id,
            level=chain_depth(chain) + 1, path=path, is_leaf=True, is_active=True,
            source_mode="local", synced_at=datetime.now(timezone.utc),
        )
        db.add(node)
        await db.flush()
        recompute_cost_center_structure([*rows, node])
        out = TreeNodeOut(
            id=node.id, code=node.code, name=node.name, parent_id=node.parent_id,
            level=node.level, is_leaf=node.is_leaf, is_active=node.is_active,
            synced_at=node.synced_at.isoformat(), children=[],
        )
        await db.commit()
        return out
    except IntegrityError as exc:
        await db.rollback()
        if "uq_cc_tree_code" in str(exc.orig):
            raise HTTPException(status_code=409, detail="成本中心编码已存在") from exc
        raise
    except Exception:
        await db.rollback()
        raise


class CostCenterUpdate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    parent_id: int | None = Field(default=None, gt=0)


def _descendant_ids(rows: list[Any], node_id: int) -> set[int]:
    """返回 node_id 在整棵树中的全部后代 id（不含自身）。"""
    children: dict[int | None, list[Any]] = {}
    for node in rows:
        children.setdefault(node.parent_id, []).append(node)
    out: set[int] = set()
    stack = list(children.get(node_id, []))
    while stack:
        current = stack.pop()
        if current.id in out:
            continue
        out.add(current.id)
        stack.extend(children.get(current.id, []))
    return out


@router.put("/cost-center/{node_id}", response_model=TreeNodeOut)
async def update_cc_directory(
    node_id: int,
    body: CostCenterUpdate,
    _: User = Depends(require_op("people.cost_center", "U")),
    db: AsyncSession = Depends(get_session),
) -> TreeNodeOut:
    """编辑成本中心（改名称 / 重新挂接上级）。

    编码为稳定业务标识，不可修改。新增场景同名冲突 / 路径超长 / 环 / 挂到
    停用祖先链下均拒绝；成功后重算整树 level/path/is_leaf。
    """
    from app.trees.service import (
        business_path_of, chain_depth, cost_center_structure,
        lock_cost_center_tree, recompute_cost_center_structure,
    )

    try:
        await lock_cost_center_tree(db)
        rows = (await db.execute(select(CostCenterNode).execution_options(populate_existing=True))).scalars().all()
        node = next((item for item in rows if item.id == node_id), None)
        if node is None:
            raise HTTPException(status_code=404, detail="成本中心不存在")
        try:
            structure = cost_center_structure(rows)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if node.code == "root costcenter":
            # 固定根：仅可改名称，不允许重新挂接上级
            if body.parent_id is not None:
                raise HTTPException(status_code=422, detail="固定根节点不能重新挂接上级")
        if body.parent_id is not None:
            if body.parent_id == node.id:
                raise HTTPException(status_code=422, detail="上级成本中心不能是自身")
            if body.parent_id in _descendant_ids(rows, node.id):
                raise HTTPException(status_code=422, detail="上级成本中心不能是自己的下级")
            parent = next((item for item in rows if item.id == body.parent_id), None)
            if parent is None:
                raise HTTPException(status_code=422, detail="上级成本中心不存在")
            if any(not item.is_active for item in structure[parent.id][2]):
                raise HTTPException(status_code=409, detail="上级成本中心及其祖先必须启用")
            if chain_depth(structure[parent.id][2]) >= 50:
                raise HTTPException(status_code=422, detail="成本中心树超过现有路径计算支持的50级深度")
        parent_for_path = next((item for item in rows if item.id == body.parent_id), None) if body.parent_id is not None else None
        path = business_path_of(parent_for_path, body.name, structure)
        if len(path) > 1024:
            raise HTTPException(status_code=422, detail="成本中心路径不能超过1024个字符")
        if "/" in body.name or any(
            item_id != node.id and value[1] == path for item_id, value in structure.items()
        ):
            raise HTTPException(status_code=409, detail="成本中心名称产生重复或有歧义的路径")
        node.name = body.name
        node.parent_id = body.parent_id
        await db.flush()
        recompute_cost_center_structure(rows)
        out = TreeNodeOut(
            id=node.id, code=node.code, name=node.name, parent_id=node.parent_id,
            level=node.level, is_leaf=node.is_leaf, is_active=node.is_active,
            synced_at=node.synced_at.isoformat(), children=[],
        )
        await db.commit()
        return out
    except Exception:
        await db.rollback()
        raise


@router.delete("/cost-center/{node_id}", status_code=204)
async def delete_cc_directory(
    node_id: int,
    _: User = Depends(require_op("people.cost_center", "D")),
    db: AsyncSession = Depends(get_session),
) -> None:
    """删除成本中心叶子节点。

    含下级成本中心时拒绝删除（409）；叶子删除后重算父级 is_leaf。
    编码唯一约束由 uq_cc_tree_code 兜底，删除不会破坏约束。
    """
    from app.trees.service import (
        lock_cost_center_tree, recompute_cost_center_structure,
    )

    try:
        await lock_cost_center_tree(db)
        rows = (await db.execute(select(CostCenterNode).execution_options(populate_existing=True))).scalars().all()
        node = next((item for item in rows if item.id == node_id), None)
        if node is None:
            raise HTTPException(status_code=404, detail="成本中心不存在")
        if node.code == "root costcenter":
            raise HTTPException(status_code=409, detail="固定根节点不允许删除")
        if any(item.parent_id == node.id for item in rows):
            raise HTTPException(status_code=409, detail="该成本中心包含下级成本中心，不允许删除")
        db.delete(node)
        remaining = [item for item in rows if item.id != node_id]
        recompute_cost_center_structure(remaining)
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise


@router.get("/org/directory", response_model=list[TreeNodeOut])
async def get_org_directory(
    include_inactive: bool = False,
    _: User = Depends(require_op("people.organization", "V")),
    db: AsyncSession = Depends(get_session),
) -> list[TreeNodeOut]:
    """组织目录树（B20.a 通用入口）。

    仅菜单授权用户可访问（require_op people.organization V）。
    以 resolve_org_hierarchy 做 fail-closed 健康校验：孤儿 / 循环 / 跨树父 /
    重复编码 / 超深度等任意问题存在时返回 409 + issues，绝不静默构树扩大授权。
    """
    from app.warehouse.service.org_hierarchy import resolve_org_hierarchy

    stmt = select(OrgNode).order_by(OrgNode.level, OrgNode.code)
    rows = (await db.execute(stmt)).scalars().all()
    projections, issues = resolve_org_hierarchy(rows, max_depth=10)
    if issues:
        raise HTTPException(status_code=409, detail={
            "code": "org_hierarchy_invalid",
            "message": "组织树未通过健康校验，已拒绝返回目录",
            "issues": [issue.__dict__ for issue in issues],
        })
    active_codes = {item["node_code"] for item in projections if item["is_active"]}
    inactive_codes = {item["node_code"] for item in projections if not item["is_active"]}
    kept: list[OrgNode] = [
        row for row in rows
        if row.code in {*active_codes, *inactive_codes, "RootOrg"}
        and (include_inactive or row.code not in inactive_codes)
    ]
    # 根组织（RootOrg）作为 level-0 返回；前端默认仅展开根组织，一级可见、更深收起
    return _build_tree(kept)


class OrgHierarchyLevelOut(BaseModel):
    node_id: int
    node_code: str
    depth: int
    is_active: bool
    levels: dict[str, Any]


@router.get("/org/hierarchy-levels", response_model=list[OrgHierarchyLevelOut])
async def get_org_hierarchy_levels(
    include_inactive: bool = False,
    max_depth: int = 10,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[OrgHierarchyLevelOut]:
    """返回组织节点到一级至十级的系统派生层级投影。"""
    from app.warehouse.service.org_hierarchy import resolve_org_hierarchy

    if max_depth < 1 or max_depth > 10:
        raise HTTPException(status_code=422, detail="max_depth 必须在1到10之间")
    rows = (await db.execute(select(OrgNode).order_by(OrgNode.level, OrgNode.code))).scalars().all()
    projections, issues = resolve_org_hierarchy(rows, max_depth=max_depth)
    if issues:
        raise HTTPException(status_code=409, detail={
            "code": "org_hierarchy_invalid",
            "message": "组织树未通过层级解析",
            "issues": [issue.__dict__ for issue in issues],
        })
    return [OrgHierarchyLevelOut(
        node_id=item["node_id"], node_code=item["node_code"], depth=item["depth"],
        is_active=item["is_active"],
        levels={key: value for key, value in item.items() if key.startswith("org_level_")},
    ) for item in projections if include_inactive or item["is_active"]]


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
_STATUS_COLUMN_CANDIDATES = ("employment_status", "employee_status", "active_status")


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


def _roster_status_column(model):
    for column_code in _STATUS_COLUMN_CANDIDATES:
        if column_code in model.__table__.columns:
            return model.__table__.c[column_code]
    raise RuntimeError(
        "????????????????: "
        + " / ".join(_STATUS_COLUMN_CANDIDATES)
    )


async def _distinct_values_by_column(
    column_code: str, include_inactive: bool, db: AsyncSession
) -> list[DistinctValueOut]:
    """通用 distinct 查询：从 emp_realtime_roster 实体列取某字段的 distinct 值

    - include_inactive=False（默认）：只返回 active_count > 0 的值
    - 按 active 倒序、value 升序
    """
    model = _roster_model()
    value_expr = cast(_entity_column(model, column_code), String)
    status_expr = cast(_roster_status_column(model), String)
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
    status_expr = cast(_roster_status_column(model), String)
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
