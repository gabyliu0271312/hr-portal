"""Organization hierarchy projection helpers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class HierarchyIssue:
    code: str
    node_code: str | None
    message: str


def _value(row: Any, name: str):
    if isinstance(row, dict):
        return row.get(name)
    return getattr(row, name, None)


def resolve_org_hierarchy(rows: list[Any], *, max_depth: int = 10) -> tuple[list[dict[str, Any]], list[HierarchyIssue]]:
    """Resolve current org nodes into level_1..level_N projections.

    RootOrg is a technical root and is not emitted as business level 1.
    The function never silently attaches an orphan or truncates an over-depth node.
    """
    nodes = {}
    for row in rows or []:
        code = str(_value(row, "code") or "").strip()
        if code:
            nodes[code] = row
    issues: list[HierarchyIssue] = []
    projections: list[dict[str, Any]] = []
    for code, row in nodes.items():
        if code == "RootOrg":
            continue
        chain = []
        seen: set[str] = set()
        current = code
        while current and current != "RootOrg":
            if current in seen:
                issues.append(HierarchyIssue("org_tree_cycle", code, "组织树存在循环"))
                chain = []
                break
            seen.add(current)
            node = nodes.get(current)
            if node is None:
                issues.append(HierarchyIssue("org_tree_parent_missing", code, "组织树父节点不存在"))
                chain = []
                break
            chain.append(node)
            parent_id = _value(node, "parent_id")
            if parent_id is None:
                current = "RootOrg"
                continue
            parent = next((candidate_code for candidate_code, candidate in nodes.items()
                           if _value(candidate, "id") == parent_id), None)
            if parent is None:
                issues.append(HierarchyIssue("org_tree_parent_missing", code, "组织树父节点不存在"))
                chain = []
                break
            current = parent
        if not chain:
            continue
        chain.reverse()
        if len(chain) > max_depth:
            issues.append(HierarchyIssue("org_tree_depth_exceeded", code, f"组织层级超过{max_depth}级"))
            continue
        projection: dict[str, Any] = {
            "node_id": _value(row, "id"),
            "node_code": code,
            "depth": len(chain),
            "is_active": bool(_value(row, "is_active")),
        }
        for index in range(1, max_depth + 1):
            node = chain[index - 1] if index <= len(chain) else None
            projection[f"org_level_{index}_id"] = _value(node, "id") if node else None
            projection[f"org_level_{index}_code"] = str(_value(node, "code")) if node else None
            projection[f"org_level_{index}_name"] = str(_value(node, "name")) if node else None
        projections.append(projection)
    return projections, issues
