"""资产写入校验器（设计 B：按字段分组权威源分派）。"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.warehouse.asset_sink_validation import (
    MAX_ORG_LEVEL,
    WarehouseValidationError,
    _load_group_sources,
    _resolve_level_path,
    validate_rows_for_asset,
)


# ─── _resolve_level_path（parent_id 链回溯，RootOrg 不计） ─────────────────────


def test_resolve_level_path_walks_parent_chain_excluding_root():
    tree = {
        "RootOrg": {"id": 1, "name": "根", "parent_id": None, "level": 0},
        "A": {"id": 2, "name": "公司级组织", "parent_id": 1, "level": 1},
        "A1": {"id": 3, "name": "中心", "parent_id": 2, "level": 2},
        "A1x": {"id": 4, "name": "组", "parent_id": 3, "level": 3},
    }
    by_id = {1: "RootOrg", 2: "A", 3: "A1", 4: "A1x"}
    assert _resolve_level_path("A1x", tree, by_id) == ["A", "A1", "A1x"]
    assert _resolve_level_path("A1", tree, by_id) == ["A", "A1"]
    assert _resolve_level_path("A", tree, by_id) == ["A"]


def test_resolve_level_path_handles_orphan_safely():
    tree = {"X": {"id": 5, "name": "孤立", "parent_id": 999, "level": 1}}
    by_id = {5: "X"}
    # 父缺失：不抛异常，回退到该节点自身
    assert _resolve_level_path("X", tree, by_id) == ["X"]


# ─── _load_group_sources ────────────────────────────────────────────────────────


class _FakeDB:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _stmt):
        class _Result:
            def __init__(self, rows):
                self._rows = rows
            def all(self):
                return self._rows
        return _Result(self._rows)


def _fake_db(*, rows=None):
    return _FakeDB(rows or [])

@pytest.mark.asyncio
async def test_load_group_sources_filters_none():
    # mock 数据模拟 SQL 已按 is_not(None) 过滤后的结果
    db = _fake_db(rows=[
        (1, "org_tree"),
        (2, "roster"),
    ])
    out = await _load_group_sources(db)
    assert out == {1: "org_tree", 2: "roster"}


# ─── validate_rows_for_asset 端到端（mock 数据源） ─────────────────────────────

ORG_TREE = {
    "RootOrg": {"id": 1, "name": "根", "parent_id": None, "level": 0},
    "A": {"id": 2, "name": "公司级组织", "parent_id": 1, "level": 1},
    "A1": {"id": 3, "name": "中心", "parent_id": 2, "level": 2},
    "A1x": {"id": 4, "name": "组", "parent_id": 3, "level": 3},
}
TREE_BY_ID = {1: "RootOrg", 2: "A", 3: "A1", 4: "A1x"}
ROSTER_NAMES = {"E001": "张三", "E002": "李四"}
ROSTER_EMPS = {"E001", "E002"}

# 工资表列 → 权威源（模拟 _load_asset_field_groups 结果）
PAYROLL_COL_SOURCE = {
    "employee_no": "roster",
    "full_name": "roster",
    "org_node_code": "org_tree",
    "org_name": "org_tree",
}


def _fake_db(*, rows=None):
    return _FakeDB(rows or [])


@pytest.mark.asyncio
async def test_validate_ok_org_and_roster_project_levels(monkeypatch):
    from app.warehouse import asset_sink_validation as mod

    async def fake_load_asset_field_groups(db, asset):
        return PAYROLL_COL_SOURCE, {}
    async def fake_load_org_tree(db):
        return ORG_TREE, TREE_BY_ID
    async def fake_load_roster(db):
        return ROSTER_NAMES, ROSTER_EMPS

    monkeypatch.setattr(mod, "_load_asset_field_groups", fake_load_asset_field_groups)
    monkeypatch.setattr(mod, "_load_org_tree", fake_load_org_tree)
    monkeypatch.setattr(mod, "_load_roster", fake_load_roster)

    rows = [{
        "employee_no": "E001",
        "full_name": "张三",
        "org_node_code": "A1x",
        "org_name": "组",
    }]
    out = await validate_rows_for_asset(_fake_db(), "emp_monthly_salary", rows)
    assert out[0]["org_level_1_code"] == "A"
    assert out[0]["org_level_2_code"] == "A1"
    assert out[0]["org_level_3_code"] == "A1x"
    assert out[0]["org_level_4_code"] is None


@pytest.mark.asyncio
async def test_validate_rejects_org_code_not_in_tree(monkeypatch):
    from app.warehouse import asset_sink_validation as mod

    async def fake_load_asset_field_groups(db, asset):
        return PAYROLL_COL_SOURCE, {}
    async def fake_load_org_tree(db):
        return ORG_TREE, TREE_BY_ID
    async def fake_load_roster(db):
        return ROSTER_NAMES, ROSTER_EMPS

    monkeypatch.setattr(mod, "_load_asset_field_groups", fake_load_asset_field_groups)
    monkeypatch.setattr(mod, "_load_org_tree", fake_load_org_tree)
    monkeypatch.setattr(mod, "_load_roster", fake_load_roster)

    with pytest.raises(WarehouseValidationError):
        await validate_rows_for_asset(_fake_db(), "emp_monthly_salary", [{
            "employee_no": "E001",
            "full_name": "张三",
            "org_node_code": "NO_SUCH",
            "org_name": "某部门",
        }])


@pytest.mark.asyncio
async def test_validate_rejects_org_name_mismatch(monkeypatch):
    from app.warehouse import asset_sink_validation as mod

    async def fake_load_asset_field_groups(db, asset):
        return PAYROLL_COL_SOURCE, {}
    async def fake_load_org_tree(db):
        return ORG_TREE, TREE_BY_ID
    async def fake_load_roster(db):
        return ROSTER_NAMES, ROSTER_EMPS

    monkeypatch.setattr(mod, "_load_asset_field_groups", fake_load_asset_field_groups)
    monkeypatch.setattr(mod, "_load_org_tree", fake_load_org_tree)
    monkeypatch.setattr(mod, "_load_roster", fake_load_roster)

    with pytest.raises(WarehouseValidationError):
        await validate_rows_for_asset(_fake_db(), "emp_monthly_salary", [{
            "employee_no": "E001",
            "full_name": "张三",
            "org_node_code": "A1",
            "org_name": "错误名称",  # 树名是「中心」
        }])


@pytest.mark.asyncio
async def test_validate_rejects_employee_not_in_roster(monkeypatch):
    from app.warehouse import asset_sink_validation as mod

    async def fake_load_asset_field_groups(db, asset):
        return PAYROLL_COL_SOURCE, {}
    async def fake_load_org_tree(db):
        return ORG_TREE, TREE_BY_ID
    async def fake_load_roster(db):
        return ROSTER_NAMES, ROSTER_EMPS

    monkeypatch.setattr(mod, "_load_asset_field_groups", fake_load_asset_field_groups)
    monkeypatch.setattr(mod, "_load_org_tree", fake_load_org_tree)
    monkeypatch.setattr(mod, "_load_roster", fake_load_roster)

    with pytest.raises(WarehouseValidationError):
        await validate_rows_for_asset(_fake_db(), "emp_monthly_salary", [{
            "employee_no": "E999",
            "full_name": "不存在",
            "org_node_code": "A1",
            "org_name": "中心",
        }])


@pytest.mark.asyncio
async def test_validate_rejects_employee_name_mismatch(monkeypatch):
    from app.warehouse import asset_sink_validation as mod

    async def fake_load_asset_field_groups(db, asset):
        return PAYROLL_COL_SOURCE, {}
    async def fake_load_org_tree(db):
        return ORG_TREE, TREE_BY_ID
    async def fake_load_roster(db):
        return ROSTER_NAMES, ROSTER_EMPS

    monkeypatch.setattr(mod, "_load_asset_field_groups", fake_load_asset_field_groups)
    monkeypatch.setattr(mod, "_load_org_tree", fake_load_org_tree)
    monkeypatch.setattr(mod, "_load_roster", fake_load_roster)

    with pytest.raises(WarehouseValidationError):
        await validate_rows_for_asset(_fake_db(), "emp_monthly_salary", [{
            "employee_no": "E001",
            "full_name": "错名",  # 花名册是「张三」
            "org_node_code": "A1",
            "org_name": "中心",
        }])


@pytest.mark.asyncio
async def test_validate_allows_empty_org_code(monkeypatch):
    """组织编码为空（无组织归属）不阻断，人员校验仍执行。"""
    from app.warehouse import asset_sink_validation as mod

    async def fake_load_asset_field_groups(db, asset):
        return PAYROLL_COL_SOURCE, {}
    async def fake_load_org_tree(db):
        return ORG_TREE, TREE_BY_ID
    async def fake_load_roster(db):
        return ROSTER_NAMES, ROSTER_EMPS

    monkeypatch.setattr(mod, "_load_asset_field_groups", fake_load_asset_field_groups)
    monkeypatch.setattr(mod, "_load_org_tree", fake_load_org_tree)
    monkeypatch.setattr(mod, "_load_roster", fake_load_roster)

    out = await validate_rows_for_asset(_fake_db(), "emp_monthly_salary", [{
        "employee_no": "E001",
        "full_name": "张三",
        "org_node_code": None,
        "org_name": None,
    }])
    # 组织编码为空：不投影回填（键不存在），人员校验通过
    assert "org_level_1_code" not in out[0]


@pytest.mark.asyncio
async def test_validate_skips_assets_without_authority_sources(monkeypatch):
    from app.warehouse import asset_sink_validation as mod

    async def fake_load_asset_field_groups(db, asset):
        return {}, {}

    monkeypatch.setattr(mod, "_load_asset_field_groups", fake_load_asset_field_groups)
    rows = [{"any": "value"}]
    out = await validate_rows_for_asset(_fake_db(), "some_other_table", rows)
    assert out == rows

