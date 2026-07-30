import importlib.util
from pathlib import Path


def _migration_module():
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0154_seed_pending_hire_report_field_mapping.py"
    spec = importlib.util.spec_from_file_location("pending_hire_report_field_mapping_migration", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_pending_hire_source_mapping_and_lookup_field_use_current_codes():
    migration = _migration_module()
    nodes = [
        {"id": "read_pending", "type": "CONNECTOR", "config": {"data_object_id": 1}},
        {"id": "lookup_offer", "type": "CAPABILITY_LOOKUP", "config": {"lookup_field": "application_id", "parameter_name": "application_id"}},
    ]

    normalized, data_object_ids, changed = migration._normalize_pipeline_steps(nodes)

    assert changed is True
    assert data_object_ids == {1}
    assert normalized[1]["config"]["lookup_field"] == "feishu_submission_id"
    assert normalized[1]["config"]["parameter_name"] == "application_id"
    assert migration.PENDING_HIRE_REPORT_MAPPING == {
        "工号": "employee_number",
        "姓名": "employee_name",
        "英文名": "english_name",
        "姓名（中文名）": "chinese_name",
        "飞书投递id": "feishu_submission_id",
    }
