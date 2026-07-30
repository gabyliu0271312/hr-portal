from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from app.datasources.sync_service import _calc_pk_hash


def _migration_module():
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0145_pending_employee_pk_hash.py"
    spec = spec_from_file_location("pending_employee_pk_hash_migration", path)
    assert spec and spec.loader
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_pending_employee_migration_backfill_matches_sync_upsert_hash():
    migration = _migration_module()

    assert migration._application_id_hash("7660851709103311147") == _calc_pk_hash(
        {"application_id": "7660851709103311147"}, ["application_id"]
    )
