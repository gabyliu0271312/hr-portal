from datetime import datetime, timezone

from sqlalchemy import text

# 成本中心固定技术根（对齐组织树 RootOrg）：编码锁定，名称可改，level=0 不计业务层级。
CC_ROOT_CODE = "root costcenter"
CC_ROOT_DEFAULT_NAME = "成本中心"

# 成本中心树健康校验豁免集（固定根不计业务层级）
CC_ROOT_EXEMPT_CODES = frozenset({CC_ROOT_CODE})


async def lock_cost_center_tree(db):
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
        {"lock_key": "cost_center_tree:write"},
    )


async def ensure_cc_root(db) -> int:
    """幂等确保成本中心固定根存在，返回其 id。

    树为空时创建根；树已有节点但缺固定根时创建，并把现有业务根
    （parent_id 为空）挂到固定根下。固定根编码不可变。
    """
    from app.data.models import CostCenterNode
    from sqlalchemy import select

    rows = (await db.execute(select(CostCenterNode).execution_options(populate_existing=True))).scalars().all()
    root = next((node for node in rows if node.code == CC_ROOT_CODE), None)
    now = datetime.now(timezone.utc)
    if root is None:
        root = CostCenterNode(
            code=CC_ROOT_CODE,
            name=CC_ROOT_DEFAULT_NAME,
            parent_id=None,
            level=0,
            is_leaf=False,
            is_active=True,
            source_mode="local",
            synced_at=now,
        )
        db.add(root)
        await db.flush()
    else:
        # 固定根必须作为树容器：复位 parent/level/is_active
        root.parent_id = None
        root.level = 0
        root.is_leaf = False
        root.is_active = True
        root.synced_at = now
    # 现有业务根（parent_id 为空）挂到固定根下；固定根 path 按当前名称
    business_roots = [node for node in rows if node.parent_id is None and node.code != CC_ROOT_CODE]
    for node in business_roots:
        node.parent_id = root.id
    root.path = f"/{root.name}/" if root.name else ""
    return root.id


def cost_center_structure(rows):
    by_id = {node.id: node for node in rows}
    if len(by_id) != len(rows) or len({node.code for node in rows}) != len(rows):
        raise ValueError("成本中心节点身份或编码重复")
    structure = {}
    for node in rows:
        chain = []
        seen = set()
        current = node
        while current is not None:
            if current.id in seen:
                raise ValueError("成本中心树存在循环引用")
            seen.add(current.id)
            chain.append(current)
            if len(chain) > 50:
                raise ValueError("成本中心树超过现有路径计算支持的50级深度")
            if current.parent_id is None:
                break
            current = by_id.get(current.parent_id)
            if current is None:
                raise ValueError("成本中心父节点不存在")
        # 固定技术根不计业务层级：业务链 = chain 去掉固定根
        business_chain = [item for item in chain if item.code != CC_ROOT_CODE]
        depth = len(business_chain)
        if depth == 0:
            # 固定根自身：path 仅含自身名称（无前缀）
            path = f"/{node.name}/"
        else:
            path = "/" + "/".join(item.name for item in reversed(business_chain)) + "/"
        if len(path) > 1024:
            raise ValueError("成本中心路径不能超过1024个字符")
        structure[node.id] = (depth, path, chain)
    return structure


def business_path_of(parent, name: str, structure) -> str:
    """计算挂在 parent 下的新节点 path（业务 path 不拼固定技术根前缀）。"""
    if parent is None or parent.code == CC_ROOT_CODE:
        return f"/{name}/"
    return structure[parent.id][1] + name + "/"


def chain_depth(chain: list) -> int:
    """业务层级深度：chain 去掉固定技术根后的节点数。"""
    return len([item for item in chain if item.code != CC_ROOT_CODE])


def recompute_cost_center_structure(rows):
    structure = cost_center_structure(rows)
    parents = {node.parent_id for node in rows if node.parent_id is not None}
    for node in rows:
        node.level, node.path, _ = structure[node.id]
        node.is_leaf = node.id not in parents
