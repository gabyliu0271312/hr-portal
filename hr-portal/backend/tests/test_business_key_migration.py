from app.datasources.business_key_migration import _collision_count, _new_hash


def test_one_to_one_key_migration_has_unique_new_hashes():
    rows = [
        {"id": 1, "month": "202608", "code": "001"},
        {"id": 2, "month": "202608", "code": "002"},
    ]

    assert _collision_count(rows, ["month", "code"]) == 0
    assert _new_hash(rows[0], ["month", "code"]) != _new_hash(rows[1], ["month", "code"])


def test_key_migration_blocks_many_to_one_collisions():
    rows = [
        {"id": 1, "month": "202608", "code": "001", "name": "旧名称"},
        {"id": 2, "month": "202608", "code": "001", "name": "新名称"},
    ]

    assert _collision_count(rows, ["month", "code"]) == 1
