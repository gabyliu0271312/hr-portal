"""分摊结果页：字段清单 + 行查询（人员 D/脱敏/成本中心树校验）。"""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.allocation_result.router import list_allocation_fields
from app.allocation_result.service import MASK, _build_item


# ─── 字段清单 ────────────────────────────────────────────────────────────────


def _field(id, code, name, data_type="string", order=0, active=True):
    field = MagicMock()
    field.id = id
    field.field_code = code
    field.display_name = name
    field.data_type = data_type
    field.display_order = order
    field.is_active = active
    return field


@pytest.mark.asyncio
async def test_list_allocation_fields_returns_form_bound_fields_in_order():
    fields = [
        _field(1, "cost_period", "月份", order=0),
        _field(2, "employee_no", "工号", order=10),
        _field(3, "full_name", "姓名", order=20),
        _field(4, "allocation_percentage", "分摊比例", order=30),
    ]
    with patch(
        "app.warehouse.service.standard_fields.list_form_fields",
        new=AsyncMock(return_value=fields),
    ):
        result = await list_allocation_fields(user=None, db=MagicMock())
    assert result.total == 4
    assert [f.field_code for f in result.items] == ["cost_period", "employee_no", "full_name", "allocation_percentage"]


@pytest.mark.asyncio
async def test_list_allocation_fields_empty_when_no_bindings():
    with patch(
        "app.warehouse.service.standard_fields.list_form_fields",
        new=AsyncMock(return_value=[]),
    ):
        result = await list_allocation_fields(user=None, db=MagicMock())
    assert result.total == 0
    assert result.items == []


# ─── 单行组装（纯函数） ───────────────────────────────────────────────────────


class _RowObj:
    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


def _row(**kw):
    defaults = {
        "id": 1,
        "synced_at": datetime(2026, 10, 1, tzinfo=UTC),
        "cost_period": "202610",
        "employee_no": "E001",
        "code": "CC01",
        "headcount": 0.5,
        "employee": "快照名",
    }
    defaults.update(kw)
    return _RowObj(**defaults)


CC_CODES = {"CC01", "CC02"}
CC_NAMES = {"CC01": "华东中心", "CC02": "华北中心"}
ROSTER_NAMES = {"E001": "张三"}


def _build(row, hidden=(), masked=(), cc_codes=None, cc_names=None, roster=None):
    return _build_item(
        row,
        cc_codes if cc_codes is not None else CC_CODES,
        cc_names if cc_names is not None else CC_NAMES,
        roster if roster is not None else ROSTER_NAMES,
        set(hidden),
        set(masked),
    )


def test_build_item_uses_roster_name_and_cc_tree_name():
    item = _build(_row())
    assert item["employee_name"] == "张三"  # 花名册当前值优先
    assert item["_employee_name_source"] == "roster"
    assert item["cc_name"] == "华东中心"  # 成本中心树权威名称
    assert item["_cc_valid"] is True


def test_build_item_marks_invalid_cc_code():
    item = _build(_row(code="NO_SUCH"))
    assert item["_cc_valid"] is False  # 树外编码 → 主数据校验失败
    assert item["cc_name"] is None  # 无权威名称


def test_build_item_falls_back_to_snapshot_name_when_not_in_roster():
    item = _build(_row(employee_no="E099", employee="离职快照名"), roster={})
    assert item["employee_name"] == "离职快照名"
    assert item["_employee_name_source"] == "snapshot"


def test_build_item_masks_sensitive_fields():
    item = _build(_row(), masked={"employee_no"})
    assert item["employee_no"] == MASK
    assert item["employee_name"] == MASK  # 工号 masked → 姓名也掩码
    assert item["code"] == "CC01"  # code 未 mask，仍可校验
    assert item["_cc_valid"] is True


def test_build_item_hides_fields():
    item = _build(_row(), hidden={"cost_period"})
    assert "cost_period" not in item
    assert item["employee_no"] == "E001"


def test_build_item_masks_code_and_cc_name_together():
    item = _build(_row(), masked={"code"})
    assert item["code"] == MASK
    assert item["cc_name"] == MASK  # 编码掩码 → 名称掩码，不泄露对应关系


def test_build_item_keeps_snapshot_when_code_masked():
    item = _build(_row(code="CC01"), masked={"code"})
    assert item["_cc_valid"] is True  # 树校验基于原始 code，掩码只影响展示


def test_build_item_percentage_equals_headcount():
    item = _build(_row(headcount=0.75))
    assert item["allocation_percentage"] == 0.75
