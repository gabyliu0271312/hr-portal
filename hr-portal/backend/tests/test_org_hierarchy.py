from types import SimpleNamespace

import pytest

from app.warehouse.service.org_hierarchy import resolve_org_hierarchy


def _nodes():
    return [
        SimpleNamespace(id=1, code="RootOrg", name="Root", parent_id=None, level=1, is_active=True),
        SimpleNamespace(id=2, code="A", name="A", parent_id=1, level=2, is_active=True),
        SimpleNamespace(id=3, code="A1", name="A1", parent_id=2, level=3, is_active=True),
        SimpleNamespace(id=4, code="A1x", name="A1x", parent_id=3, level=4, is_active=False),
    ]


def test_org_hierarchy_excludes_virtual_root_and_derives_levels():
    rows, issues = resolve_org_hierarchy(_nodes())
    assert issues == []
    leaf = next(row for row in rows if row["node_code"] == "A1x")
    assert leaf["depth"] == 3
    assert leaf["org_level_1_code"] == "A"
    assert leaf["org_level_2_code"] == "A1"
    assert leaf["org_level_3_code"] == "A1x"
    assert leaf["org_level_4_code"] is None


def test_org_hierarchy_rejects_cycle_and_missing_parent():
    cycle = [
        SimpleNamespace(id=1, code="RootOrg", name="Root", parent_id=None, level=1, is_active=True),
        SimpleNamespace(id=2, code="A", name="A", parent_id=3, level=2, is_active=True),
        SimpleNamespace(id=3, code="B", name="B", parent_id=2, level=2, is_active=True),
    ]
    _, issues = resolve_org_hierarchy(cycle)
    assert any(issue.code == "org_tree_cycle" for issue in issues)

    missing = [
        SimpleNamespace(id=1, code="RootOrg", name="Root", parent_id=None, level=1, is_active=True),
        SimpleNamespace(id=2, code="A", name="A", parent_id=99, level=2, is_active=True),
    ]
    _, issues = resolve_org_hierarchy(missing)
    assert any(issue.code == "org_tree_parent_missing" for issue in issues)


def test_org_hierarchy_rejects_depth_overflow():
    rows = [SimpleNamespace(id=1, code="RootOrg", name="Root", parent_id=None, level=1, is_active=True)]
    parent = 1
    for i in range(1, 12):
        rows.append(SimpleNamespace(id=i + 1, code=f"N{i}", name=f"N{i}", parent_id=parent, level=i + 1, is_active=True))
        parent = i + 1
    _, issues = resolve_org_hierarchy(rows, max_depth=10)
    assert any(issue.code == "org_tree_depth_exceeded" for issue in issues)
