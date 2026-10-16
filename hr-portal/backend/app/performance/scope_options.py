"""Shared organization-tree data shaping for performance scope selectors."""
from __future__ import annotations

from typing import Any

from app.data.employee_roster_contract import ORGANIZATION_FIELDS


def build_organization_tree(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    roots: dict[str, dict[str, Any]] = {}
    for row in rows:
        path: list[str] = []
        siblings = roots
        for field in ORGANIZATION_FIELDS:
            label = str(row.get(field) or "").strip()
            if not label:
                continue
            path.append(label)
            node = siblings.setdefault(label, {"path": list(path), "children": {}})
            siblings = node["children"]

    def serialize(nodes: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "value": "/".join(node["path"]),
                "label": label,
                "level": len(node["path"]),
                "children": serialize(node["children"]),
            }
            for label, node in sorted(nodes.items())
        ]

    return serialize(roots)
