from app.data.column_roles import is_technical_column


def test_technical_columns_by_code_rule():
    for code in ("id", "pk_hash", "synced_at", "row_hash", "raw_payload", "src_value", "_tmp"):
        assert is_technical_column(code) is True
    for code in ("employee_no", "cost_period", "code", "headcount", "department"):
        assert is_technical_column(code) is False
    assert is_technical_column("") is True
    assert is_technical_column(None) is True
