"""UCP 资产写入的树资产专用分支（方案乙-1：直写树表，无中间表）。

树资产与普通实体宽表的差异：
- 树表没有 pk_hash 列（写入器不能按通用分支算 hash 直写）；
- 树结构列（parent_id/level/is_leaf/path/source_mode/synced_at）不能由
  UCP 映射提供，必须服务端按"编码唯一、挂根、默认启用"规则计算；
- 增量语义：同 code 更新/复用旧 ID，新 code 插入，不删除已有节点
  （含 local 节点），不执行缺行清理。

识别：目标资产的 table_columns 存在 tree_role 元数据即为树资产。
两棵树（org_tree / cost_center_tree）共用本分支，列角色由
table_columns.tree_role 配置（沿 0303 模式），不硬编码列名。

挂点：WarehouseAssetSink.write 在通用分支之前检测目标资产是否树，
是则走本模块；否则保持通用分支不变。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.ddl import validate_column_name
from app.data.models import CostCenterNode, OrgNode
from app.datasources.sync_service import (
    _ORG_ROOT_CODE,
    _resolve_tree_roles,
    _TREE_ROLE_CODE,
    _TREE_ROLE_NAME,
    _TREE_ROLE_PARENT,
    _TREE_ROLE_ACTIVE,
)

# 组织树默认 active 值（沿 _sync_org_tree 现有口径）
_ORG_ACTIVE_VALUES = ("启用", "生效", "正常")

# 成本中心树固定技术根（沿 app.trees.service.CC_ROOT_CODE）
_CC_ROOT_CODE = "root costcenter"

# 已接入 UCP 树资产直写的树表白名单（方案乙-1）。
# 新树资产接入时在此登记，并补齐 table_columns.tree_role 元数据。
TREE_ASSET_NAMES = frozenset({"org_tree", "cost_center_tree"})

# 树结构重算（写后调用，保持 level/path/is_leaf 一致）——延迟导入避免环
_TREE_RECOMPUTE = {
    "org_tree": None,          # 经 _recompute_tree_paths + 结构现算
    "cost_center_tree": None,  # 经 recompute_cost_center_structure
}


def _is_tree_asset(table_name: str, tree_roles: dict[str, str]) -> bool:
    """是否树资产：存在 tree_role 元数据且至少解析出 code 角色。"""
    return bool(tree_roles.get(_TREE_ROLE_CODE))


async def is_tree_target(table_name: str, db: AsyncSession) -> bool:
    """入口级树资产检测（幂等）：读 table_columns.tree_role，有 tree_code 即树资产。"""
    roles = await _resolve_tree_roles(table_name, db)
    return _is_tree_asset(table_name, roles)


def _active_from(value: Any, default_active: bool) -> bool:
    """解析启用状态列；空/未知值回退默认（成本中心源无状态 → 默认启用）。"""
    if value is None:
        return default_active
    text = str(value).strip()
    if not text:
        return default_active
    return text in _ORG_ACTIVE_VALUES


async def _write_tree_upsert(
    db: AsyncSession,
    *,
    table_name: str,
    rows: list[dict],
    field_whitelist: list[str],
    default_active: bool = True,
) -> dict:
    """树资产增量 upsert：按业务编码列复用旧 ID / 更新 / 新建，不删已有节点。

    - 编码列 / 名称列来自 tree_role 配置（table_columns），不硬编码列名。
    - 父节点：仅当源行提供父编码列且命中树内已有节点时挂父；否则挂固定根。
      （成本中心源无父字段 → 全部挂根；组织源可带 parent 列。）
    - 启用态：源行提供启用列时按启用值解析；否则默认启用。
    - 结构列（level/path/is_leaf）由树结构重算函数在写后统一计算。
    - source_mode 统一 external_sync；已有节点不改变其 source_mode。
    """
    whitelist = {validate_column_name(field) for field in field_whitelist}
    tree_roles = await _resolve_tree_roles(table_name, db)
    col_code = tree_roles.get(_TREE_ROLE_CODE)
    col_name = tree_roles.get(_TREE_ROLE_NAME)
    col_parent = tree_roles.get(_TREE_ROLE_PARENT)
    col_active = tree_roles.get(_TREE_ROLE_ACTIVE)
    if not col_code:
        raise ValueError(f"树资产 {table_name} 未配置 tree_code 角色")

    if table_name == "cost_center_tree":
        model = CostCenterNode
        root_code = _CC_ROOT_CODE
        # 确保固定根存在
        from app.trees.service import ensure_cc_root
        await ensure_cc_root(db)
        await db.flush()
    else:
        model = OrgNode
        root_code = _ORG_ROOT_CODE

    now = datetime.now(timezone.utc)

    existing = (await db.execute(select(model).execution_options(populate_existing=True))).scalars().all()
    existing_by_code = {node.code: node for node in existing}
    root = existing_by_code.get(root_code)

    # 根不存在（非成本中心树且无 RootOrg）→ 系统固定根
    if root is None:
        root = model(
            code=root_code,
            name="根",
            parent_id=None,
            level=0,
            is_leaf=False,
            is_active=True,
            synced_at=now,
        )
        db.add(root)
        await db.flush()
        existing_by_code[root_code] = root

    # 收集有效行（编码/名称为空跳过）
    parsed: list[dict[str, Any]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        code = str(r.get(col_code) or "").strip()
        name = str(r.get(col_name) or "").strip() if col_name else ""
        if not code:
            continue
        if code == root_code:
            continue  # 固定根由系统维护，源端同名行忽略
        parent_code = str(r.get(col_parent) or "").strip() if col_parent else ""
        parsed.append({
            "code": code,
            "name": name or code,
            "parent_code": parent_code,
            "is_active": _active_from(r.get(col_active) if col_active else None, default_active),
        })

    if len({item["code"] for item in parsed}) != len(parsed):
        raise ValueError(f"外部 {table_name} 编码重复")

    # 挂父：源提供父编码且命中树内已有节点 → 挂父；否则挂固定根
    code_to_node: dict[str, Any] = {}
    for item in parsed:
        node = existing_by_code.get(item["code"])
        if node is None:
            kwargs = {
                "code": item["code"],
                "name": item["name"],
                "parent_id": None,
                "level": 1,
                "is_leaf": False,
                "is_active": item["is_active"],
                "synced_at": now,
            }
            # source_mode 仅 cost_center_tree 有（0304）；org_tree 无此列
            if hasattr(model, "source_mode"):
                kwargs["source_mode"] = "external_sync"
            node = model(**kwargs)
            db.add(node)
        else:
            node.name = item["name"]
            node.is_active = item["is_active"]
            node.synced_at = now
            # 已有节点不改变 source_mode（local 保留 local）
        code_to_node[item["code"]] = node
    await db.flush()

    # 第二遍连父（此时所有 id 已分配）
    for item in parsed:
        node = code_to_node[item["code"]]
        pcode = item["parent_code"]
        if pcode and pcode in code_to_node and pcode != item["code"]:
            node.parent_id = code_to_node[pcode].id
        else:
            node.parent_id = root.id

    # is_leaf / level / path 统一重算
    if table_name == "cost_center_tree":
        from app.trees.service import recompute_cost_center_structure
        all_nodes = (await db.execute(
            select(model).execution_options(populate_existing=True)
        )).scalars().all()
        recompute_cost_center_structure(all_nodes)
    else:
        from app.datasources.sync_service import _recompute_tree_paths
        # 组织树 level 由父链深度推算（Root 下第一个业务组织=1），path 全量重算
        by_id = {n.id: n for n in code_to_node.values()} | {root.id: root}
        def _level_of(node) -> int:
            depth = 1
            cur = node.parent_id
            seen = set()
            while cur is not None and cur not in seen and cur in by_id:
                seen.add(cur)
                parent = by_id[cur]
                if parent.code == _ORG_ROOT_CODE:
                    break
                depth += 1
                cur = parent.parent_id
            return depth
        for n in code_to_node.values():
            n.level = _level_of(n)
        root.level = 0
        await _recompute_tree_paths(model, db)

    await db.flush()
    written = len(parsed)
    return {
        "target_asset": table_name,
        "write_mode": "upsert",
        "written_count": written,
        "inserted_count": None,
        "updated_count": None,
        "deleted_count": 0,
        "field_whitelist": sorted(whitelist),
        "tree_asset": True,
    }
