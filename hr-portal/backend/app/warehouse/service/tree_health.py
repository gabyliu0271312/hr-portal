from collections import defaultdict

from app.warehouse.schemas import TreeHealthIssueOut, TreeHealthOut


def analyze_tree(
    kind: str, nodes: list, exempt_level_zero_codes: frozenset[str] = frozenset(),
) -> TreeHealthOut:
    """健康校验。

    `exempt_level_zero_codes`：固定技术根（如成本中心 root costcenter，level=0）豁免
    根节点层级/路径/深度检查——它们不计业务层级，仅作树容器。
    """
    ids = {node.id for node in nodes}
    codes = defaultdict(list)
    paths = defaultdict(list)
    children = defaultdict(list)
    by_id = {node.id: node for node in nodes}
    issues = []
    if len(by_id) != len(nodes):
        issues.append(TreeHealthIssueOut(code="duplicate_node_id", message="权限树节点身份重复"))
    if not nodes:
        issues.append(TreeHealthIssueOut(code="empty_tree", message="权限树为空"))
    if nodes and not any(node.parent_id is None for node in nodes):
        issues.append(TreeHealthIssueOut(code="root_missing", message="权限树缺少根节点"))
    for node in nodes:
        is_exempt_root = (
            node.parent_id is None and node.level == 0
            and node.code in exempt_level_zero_codes
        )
        codes[node.code].append(node.id)
        if node.path:
            paths[node.path].append(node.id)
        segments = [segment for segment in (node.path or "").split("/") if segment]
        if is_exempt_root:
            # 固定技术根：level=0、path 为空，不计业务层级、不参与业务 path 前缀。
            # 子节点仍按 parent_id 挂它下面（children 登记，层级/路径按无前缀根校验）。
            children[node.id] = []
            continue
        if node.parent_id is None:
            if node.level != 1:
                issues.append(TreeHealthIssueOut(code="root_level_invalid", node_id=node.id, node_code=node.code, message="根节点层级必须为1"))
            expected_path = f"/{node.name}/"
            if node.path != expected_path:
                issues.append(TreeHealthIssueOut(code="root_path_invalid", node_id=node.id, node_code=node.code, message="根节点路径与名称不一致"))
        else:
            children[node.parent_id].append(node.id)
            parent = by_id.get(node.parent_id)
            if parent is None:
                issues.append(TreeHealthIssueOut(code="orphan_parent", node_id=node.id, node_code=node.code, message="父节点不存在"))
                expected_path = None
            else:
                if node.level != parent.level + 1:
                    issues.append(TreeHealthIssueOut(code="level_mismatch", node_id=node.id, node_code=node.code, message="子节点层级与父节点不连续"))
                parent_is_exempt_root = (
                    parent.parent_id is None and parent.level == 0
                    and parent.code in exempt_level_zero_codes
                )
                # 父为固定技术根时业务 path 不拼固定根前缀（固定根不计业务层级）
                expected_path = f"/{node.name}/" if parent_is_exempt_root else (f"{parent.path}{node.name}/" if parent.path else None)
                if node.path != expected_path:
                    issues.append(TreeHealthIssueOut(code="parent_path_mismatch", node_id=node.id, node_code=node.code, message="子节点路径与父节点及自身名称不一致"))
                if node.is_active and not parent.is_active:
                    issues.append(TreeHealthIssueOut(code="active_under_inactive", node_id=node.id, node_code=node.code, message="启用节点不能挂在停用父节点下"))
        if node.level < 1:
            issues.append(TreeHealthIssueOut(code="invalid_level", node_id=node.id, node_code=node.code, message="层级必须为正数"))
        if not node.path or (expected_path is not None and node.path != expected_path):
            issues.append(TreeHealthIssueOut(code="path_mismatch", node_id=node.id, node_code=node.code, message="path与名称路径不一致"))
        if node.path and len(segments) != node.level:
            issues.append(TreeHealthIssueOut(code="path_depth_mismatch", node_id=node.id, node_code=node.code, message="路径层级深度不一致"))
    for code, rows in codes.items():
        if len(rows) > 1:
            issues.append(TreeHealthIssueOut(code="duplicate_code", node_id=rows[0], node_code=code, message="编码重复"))
    for path, rows in paths.items():
        if len(rows) > 1:
            issues.append(TreeHealthIssueOut(code="duplicate_path", node_id=rows[0], message="名称路径重复，后代展开可能扩大授权"))
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
