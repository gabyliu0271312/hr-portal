from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


def test_pending_employee_dynamic_schema_migration_follows_pk_hash_migration():
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0146_pending_employee_dynamic_schema.py"
    spec = spec_from_file_location("pending_employee_dynamic_schema_migration", path)
    assert spec and spec.loader
    module = module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.down_revision == "0145_pending_employee_pk_hash"
    assert module.LEGACY_APPLICATION_ID_CONSTRAINT == "uq_pending_employee_application_id"
