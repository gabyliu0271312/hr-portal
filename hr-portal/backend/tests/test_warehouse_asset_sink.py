from app.warehouse.asset_sink import _business_key_hash


def test_business_key_hash_is_stable_and_business_key_specific():
    assert _business_key_hash({"employ_no": "107130", "name": "A"}, "employ_no") == _business_key_hash(
        {"employ_no": "107130", "name": "B"}, "employ_no"
    )
    assert _business_key_hash({"employ_no": "107130"}, "employ_no") != _business_key_hash(
        {"employ_no": "107131"}, "employ_no"
    )