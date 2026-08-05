from app.automation.action_registry import _dwd_row_values


def test_passthrough_dwd_write_does_not_copy_source_id():
    row = {
        "id": 11258,
        "pk_hash": "538880ec15f172082d2c3ae1dbba50cb",
        "synced_at": "2026-08-05T10:24:33Z",
        "cost_period": "202607",
        "employee_no": "E001",
    }

    values = _dwd_row_values(row)

    assert "id" not in values
    assert values["pk_hash"] == row["pk_hash"]
    assert values["employee_no"] == row["employee_no"]