import importlib.util
from pathlib import Path


class _MigrationRecorder:
    def __init__(self):
        self.created_tables = []
        self.created_indexes = []
        self.dropped_tables = []
        self.dropped_indexes = []

    def create_table(self, name, *args, **kwargs):
        self.created_tables.append(name)

    def create_index(self, name, table_name, columns, **kwargs):
        self.created_indexes.append((name, table_name, tuple(columns), kwargs))

    def drop_table(self, name):
        self.dropped_tables.append(name)

    def drop_index(self, name, table_name):
        self.dropped_indexes.append((name, table_name))


def _migration_module():
    path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "0169_performance_authorization_foundation.py"
    )
    spec = importlib.util.spec_from_file_location("performance_authorization_migration", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_performance_authorization_migration_targets_current_head():
    migration = _migration_module()

    assert migration.revision == "0169_performance_authorization_foundation"
    assert migration.down_revision == "0168_remove_invalid_dataset_relations"


def test_performance_authorization_migration_declares_expected_schema():
    migration = _migration_module()
    recorder = _MigrationRecorder()
    migration.op = recorder

    migration.upgrade()

    assert recorder.created_tables == [
        "performance_system_accounts",
        "performance_roles",
        "performance_permissions",
        "performance_role_permissions",
        "performance_role_assignments",
    ]
    super_admin_index = next(
        item
        for item in recorder.created_indexes
        if item[0] == "uq_performance_system_accounts_single_super_admin"
    )
    assert super_admin_index[1] == "performance_system_accounts"
    assert super_admin_index[2] == ("account_type",)
    assert super_admin_index[3]["unique"] is True
    assert str(super_admin_index[3]["postgresql_where"]) == "account_type = 'PERFORMANCE_SUPER_ADMIN'"


def test_performance_authorization_migration_downgrade_removes_schema_in_reverse_order():
    migration = _migration_module()
    recorder = _MigrationRecorder()
    migration.op = recorder

    migration.downgrade()

    assert recorder.dropped_tables == [
        "performance_role_assignments",
        "performance_role_permissions",
        "performance_permissions",
        "performance_roles",
        "performance_system_accounts",
    ]
    assert recorder.dropped_indexes == [
        ("ix_performance_role_assignments_subject", "performance_role_assignments"),
        ("uq_performance_system_accounts_single_super_admin", "performance_system_accounts"),
    ]


def test_snapshot_lock_guard_migration_protects_structural_data():
    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "0173_performance_snapshot_lock_guards.py"
    )
    migration = migration_path.read_text(encoding="utf-8")

    assert 'down_revision = "0172_performance_feature_authorization_baseline"' in migration
    assert "trg_performance_snapshot_people_locked_guard" in migration
    assert "trg_performance_dynamic_identities_locked_guard" in migration
    assert "only allow employment status updates" in migration
