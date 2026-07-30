import importlib.util
from pathlib import Path


def _migration_module():
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0155_use_offer_salary_adapter.py"
    spec = importlib.util.spec_from_file_location("offer_salary_adapter_migration", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_offer_salary_migration_sets_bonus_field_without_overriding_existing_params():
    migration = _migration_module()
    nodes = [
        {"id": "lookup_offer", "config": {"params": {}}},
        {"id": "other", "config": {}},
    ]

    normalized, changed = migration._ensure_bonus_lookup_params(nodes)

    assert changed is True
    assert normalized[0]["config"]["params"] == {
        "target_bonus_custom_field_ids": ["6909390106738821390"],
    }

    existing = [{"step_id": "lookup_offer", "params": {"target_bonus_custom_field_ids": ["custom-id"]}}]
    normalized, changed = migration._ensure_bonus_lookup_params(existing)
    assert changed is False
    assert normalized[0]["params"]["target_bonus_custom_field_ids"] == ["custom-id"]
