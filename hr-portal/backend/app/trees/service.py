from sqlalchemy import text


async def lock_cost_center_tree(db):
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
        {"lock_key": "cost_center_tree:write"},
    )


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
        path = "/" + "/".join(item.name for item in reversed(chain)) + "/"
        if len(path) > 1024:
            raise ValueError("成本中心路径不能超过1024个字符")
        structure[node.id] = (len(chain), path, chain)
    return structure


def recompute_cost_center_structure(rows):
    structure = cost_center_structure(rows)
    parents = {node.parent_id for node in rows if node.parent_id is not None}
    for node in rows:
        node.level, node.path, _ = structure[node.id]
        node.is_leaf = node.id not in parents
