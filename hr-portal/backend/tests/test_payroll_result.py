"""薪资结果页：字段清单 + 行查询（人员 D/脱敏/组织投影透出）。"""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.payroll_result.router import list_payroll_fields
from app.payroll_result.service import MASK, _build_item


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
async def test_list_payroll_fields_returns_form_bound_fields_in_order():
    fields = [
        _field(1, "pay_month", "月份", order=0),
        _field(2, "employee_no", "工号", order=10),
        _field(3, "full_name", "姓名", order=20),
        _field(4, "org_node_code", "末级组织编码", order=30),
    ]
    with patch(
        "app.warehouse.service.standard_fields.list_form_fields",
        new=AsyncMock(return_value=fields),
    ):
        result = await list_payroll_fields(user=None, db=MagicMock())
    assert result.total == 4
    assert [f.field_code for f in result.items] == ["pay_month", "employee_no", "full_name", "org_node_code"]


@pytest.mark.asyncio
async def test_list_payroll_fields_empty_when_no_bindings():
    with patch(
        "app.warehouse.service.standard_fields.list_form_fields",
        new=AsyncMock(return_value=[]),
    ):
        result = await list_payroll_fields(user=None, db=MagicMock())
    assert result.total == 0
    assert result.items == []


# ─── 单行组装（纯函数） ───────────────────────────────────────────────────────


class _RowObj:
    def __init__(self, **kw):
        self._mapping = dict(kw)
        for k, v in kw.items():
            setattr(self, k, v)


class _Col:
    def __init__(self, name):
        self.name = name


class _Table:
    def __init__(self, *col_names):
        self.columns = [_Col(n) for n in col_names]


# 工资表模型物理列（含 id/pk_hash/raw 内部列 + 业务列 + 投影列）
_MODEL = type("M", (), {"__table__": _Table(
    "id", "pk_hash", "raw", "synced_at", "pay_month", "employee_no",
    "full_name", "org_node_code", "org_level_1_code", "org_level_2_code",
    "org_level_3_code", "org_level_4_code", "base_salary",
)})()
_MODEL.__table__._model = _MODEL


def _row(**kw):
    defaults = {
        "id": 1,
        "synced_at": datetime(2026, 10, 1, tzinfo=UTC),
        "pay_month": "202610",
        "employee_no": "E001",
        "full_name": "张三",
        "org_node_code": "A1x",
        "org_level_1_code": "A",
        "org_level_2_code": "A1",
        "org_level_3_code": "A1x",
        "org_level_4_code": None,
        "base_salary": 8000,
    }
    defaults.update(kw)
    return _RowObj(**defaults)


def _build(row, hidden=(), masked=()):
    return _build_item(row, _MODEL, set(hidden), set(masked))


def test_build_item_keeps_values_and_projection():
    item = _build(_row())
    assert item["employee_no"] == "E001"
    assert item["full_name"] == "张三"
    assert item["org_level_1_code"] == "A"  # 校验器回填的投影列透出
    assert item["org_level_3_code"] == "A1x"
    assert item["org_level_4_code"] is None
    assert item["base_salary"] == 8000


def test_build_item_masks_sensitive_fields():
    item = _build(_row(), masked={"base_salary", "employee_no"})
    assert item["base_salary"] == MASK
    assert item["employee_no"] == MASK
    assert item["full_name"] == "张三"  # 姓名未 mask
    assert item["org_level_1_code"] == "A"


def test_build_item_hides_fields():
    item = _build(_row(), hidden={"pay_month"})
    assert "pay_month" not in item
    assert item["employee_no"] == "E001"


def test_build_item_skips_internal_columns():
    item = _build(_row())
    assert "id" not in item
    assert "pk_hash" not in item
