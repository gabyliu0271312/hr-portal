from collections import defaultdict

from app.warehouse.schemas import TreeHealthIssueOut, TreeHealthOut


def analyze_tree(kind: str, nodes: list) -> TreeHealthOut:
    ids = {node.id for node in nodes}
    codes = defaultdict(list)
    children = defaultdict(list)
    issues = []
    for node in nodes:
        codes[node.code].append(node.id)
        if node.parent_id is not None:
            children[node.parent_id].append(node.id)
            if node.parent_id not in ids:
                issues.append(TreeHealthIssueOut(code="orphan_parent", node_id=node.id, node_code=node.code, message="父节点不存在"))
        if node.level < 1:
            issues.append(TreeHealthIssueOut(code="invalid_level", node_id=node.id, node_code=node.code, message="层级必须为正数"))
        if node.path and node.code not in node.path.split("/"):
            issues.append(TreeHealthIssueOut(code="path_mismatch", node_id=node.id, node_code=node.code, message="path不包含自身编码"))
    for code, rows in codes.items():
        if len(rows) > 1:
            issues.append(TreeHealthIssueOut(code="duplicate_code", node_id=rows[0], node_code=code, message="编码重复"))
    state = {}
    def visit(node_id, chain):
        if node_id in chain:
            issues.append(TreeHealthIssueOut(code="cycle", node_id=node_id, message="树存在循环引用"))
            return
        if node_id in state:
            return
        state[node_id] = "visiting"
        for child_id in children.get(node_id, []):
            visit(child_id, {*chain, node_id})
        state[node_id] = "done"
    for node_id in ids:
        visit(node_id, set())
    return TreeHealthOut(
        kind=kind, node_count=len(nodes), active_count=sum(bool(node.is_active) for node in nodes),
        root_count=sum(node.parent_id is None for node in nodes),
        eligible=not issues,
        issues=issues,
    )
