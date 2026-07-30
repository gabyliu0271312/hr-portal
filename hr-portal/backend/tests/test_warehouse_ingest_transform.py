from decimal import Decimal

import pytest

from app.ucp.warehouse_ingest_transform import (
    WarehouseIngestValidationError,
    map_and_validate_rows,
)


MAPPING = [
    {"source": "period", "target": "cost_period", "transform": "yyyy_mm_to_yyyymm", "required": True},
    {"source": "employee_no", "target": "employee_no", "transform": "string", "required": True},
    {"source": "project_code", "target": "code", "transform": "string", "required": True},
    {"source": "percentage", "target": "headcount", "transform": "decimal_divide_100", "required": True, "minimum": 0, "maximum": 1},
]
VALIDATIONS = [{"type": "group_sum_equals", "group_by": ["cost_period", "employee_no"], "sum_field": "headcount", "expected": 1, "tolerance": "0.0001"}]


def test_map_and_validate_rows_converts_locked_allocation_records():
    rows = map_and_validate_rows(
        [
            {"period": "2026-07", "employee_no": "00123", "project_code": "A", "percentage": "60.00"},
            {"period": "2026-07", "employee_no": "00123", "project_code": "B", "percentage": "40.00"},
        ],
        MAPPING,
        VALIDATIONS,
    )

    assert rows == [
        {"cost_period": "202607", "employee_no": "00123", "code": "A", "headcount": Decimal("0.6")},
        {"cost_period": "202607", "employee_no": "00123", "code": "B", "headcount": Decimal("0.4")},
    ]


@pytest.mark.parametrize(
    ("rows", "message"),
    [
        ([], "不能为空"),
        ([{"period": "202607", "employee_no": "00123", "project_code": "A", "percentage": "100"}], "YYYY-MM"),
        ([{"period": "2026-07", "employee_no": "", "project_code": "A", "percentage": "100"}], "employee_no 必填"),
        ([{"period": "2026-07", "employee_no": "00123", "project_code": "A", "percentage": "101"}], "大于最大值"),
        ([{"period": "2026-07", "employee_no": "00123", "project_code": "A", "percentage": "70"}], "聚合校验失败"),
    ],
)
def test_map_and_validate_rows_rejects_invalid_data(rows, message):
    with pytest.raises(WarehouseIngestValidationError, match=message):
        map_and_validate_rows(rows, MAPPING, VALIDATIONS)


@pytest.mark.asyncio
async def test_period_snapshot_rejects_duplicate_registered_business_key(monkeypatch):
    from app.warehouse.asset_sink import WarehouseAssetSink

    class Result:
        def __init__(self, values): self.values = values
        def scalars(self): return self
        def __iter__(self): return iter(self.values)

    class Session:
        bind = None
        async def scalar(self, _statement):
            return type("Asset", (), {"asset_status": "published", "is_period": True, "period_col": "cost_period"})()
        async def execute(self, _statement):
            return Result([
                type("Column", (), {"column_code": "cost_period", "display_order": 1, "is_pk_part": True})(),
                type("Column", (), {"column_code": "employee_no", "display_order": 2, "is_pk_part": True})(),
                type("Column", (), {"column_code": "code", "display_order": 3, "is_pk_part": True})(),
                type("Column", (), {"column_code": "headcount", "display_order": 4, "is_pk_part": False})(),
            ])

    rows = [
        {"cost_period": "202607", "employee_no": "00123", "code": "A", "headcount": Decimal("0.5")},
        {"cost_period": "202607", "employee_no": "00123", "code": "A", "headcount": Decimal("0.5")},
    ]
    with pytest.raises(ValueError, match="重复业务主键"):
        await WarehouseAssetSink(Session()).write(
            target_asset="emp_monthly_allocation",
            rows=rows,
            write_mode="period_full_snapshot",
            primary_key=None,
            field_whitelist=["cost_period", "employee_no", "code", "headcount"],
            period_field="cost_period",
        )
