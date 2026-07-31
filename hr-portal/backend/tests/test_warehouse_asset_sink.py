from app.warehouse.asset_sink import _business_key_hash


def test_business_key_hash_is_stable_and_business_key_specific():
    assert _business_key_hash({"employ_no": "107130", "name": "A"}, "employ_no") == _business_key_hash(
        {"employ_no": "107130", "name": "B"}, "employ_no"
    )
    assert _business_key_hash({"employ_no": "107130"}, "employ_no") != _business_key_hash(
        {"employ_no": "107131"}, "employ_no"
    )


def test_business_key_hash_uses_all_declared_key_columns_and_keeps_leading_zero():
    row = {"cost_period": "202607", "employee_no": "00123", "code": "PRJ-A001"}

    assert _business_key_hash(row, ["cost_period", "employee_no", "code"]) == _business_key_hash(
        {**row, "employee_no": "00123", "name": "张三"},
        ("cost_period", "employee_no", "code"),
    )
    assert _business_key_hash(row, ["cost_period", "employee_no", "code"]) != _business_key_hash(
        {**row, "employee_no": "123"},
        ["cost_period", "employee_no", "code"],
    )