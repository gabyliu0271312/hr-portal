import importlib.util
from pathlib import Path


def _migration_module():
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0153_repair_pending_hire_runtime_config.py"
    spec = importlib.util.spec_from_file_location("pending_hire_runtime_config_migration", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_runtime_pipeline_migration_normalizes_flattened_step_configs():
    migration = _migration_module()
    steps = [
        {"step_id": "read_pending", "type": "CONNECTOR", "data_object_id": 9},
        {"step_id": "lookup_offer", "type": "CAPABILITY_LOOKUP", "lookup_field": "feishu_applicaiton_id"},
        {"step_id": "write_asset", "type": "WAREHOUSE_ASSET_SINK", "primary_key": "employ_no", "field_whitelist": ["employ_no", "name"]},
    ]

    normalized, data_object_ids, changed = migration._normalize_steps(steps)

    assert changed is True
    assert data_object_ids == {9}
    assert normalized[1]["lookup_field"] == "feishu_submission_id"
    assert normalized[2]["primary_key"] == "employee_number"
    assert normalized[2]["field_whitelist"] == ["employee_number", "full_name"]
