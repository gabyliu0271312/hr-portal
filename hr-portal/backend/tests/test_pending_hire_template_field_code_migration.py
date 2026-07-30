import importlib.util
from pathlib import Path


def _migration_module():
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0151_repair_pending_hire_template_field_codes.py"
    spec = importlib.util.spec_from_file_location("pending_hire_field_code_migration", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_pending_hire_migration_replaces_only_legacy_field_code_values():
    migration = _migration_module()

    normalized, changed = migration._replace_legacy_codes({
        "lookup_field": "feishu_applicaiton_id",
        "primary_key": "employ_no",
        "field_whitelist": ["employ_no", "name", "chinese_name", "base_salary"],
        "mapping": [{"source": "employee_no", "target": "employ_no"}],
    })

    assert changed is True
    assert normalized == {
        "lookup_field": "feishu_submission_id",
        "primary_key": "employee_number",
        "field_whitelist": ["employee_number", "full_name", "chinese_name", "base_salary"],
        "mapping": [{"source": "employee_no", "target": "employee_number"}],
    }
