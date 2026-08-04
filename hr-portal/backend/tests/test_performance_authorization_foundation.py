from types import SimpleNamespace

import pytest

from app.auth.password import hash_password, verify_password
from app.performance import models
from app.performance import seed as performance_seed
from app.performance.seed import (
    PERFORMANCE_SUPER_ADMIN_ROLE_CODE,
    PERMISSION_MANAGE_ADMIN_ACCOUNTS,
    PERMISSION_DEFAULTS,
    ROLE_DEFAULTS,
    seed_performance_authorization_defaults,
)


class _ScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


class _SeedDb:
    def __init__(self):
        self.rows = {
            models.PerformanceRole: [],
            models.PerformancePermission: [],
            models.PerformanceRolePermission: [],
            models.PerformanceSystemAccount: [],
            models.PerformanceRoleAssignment: [],
            models.PerformanceAuditEvent: [],
        }
        self.commits = 0
        self._next_id = 1

    async def execute(self, statement):
        entity = statement.column_descriptions[0]["entity"]
        return _ScalarResult(self.rows[entity])

    def add(self, item):
        self.rows[type(item)].append(item)

    async def flush(self):
        for entity_rows in self.rows.values():
            for item in entity_rows:
                if getattr(item, "id", None) is None:
                    item.id = self._next_id
                    self._next_id += 1

    async def commit(self):
        self.commits += 1


def test_performance_authorization_models_register_expected_tables():
    table_names = models.Base.metadata.tables

    assert "performance_system_accounts" in table_names
    assert "performance_roles" in table_names
    assert "performance_permissions" in table_names
    assert "performance_role_permissions" in table_names
    assert "performance_role_assignments" in table_names


def test_super_admin_role_is_limited_to_admin_account_management():
    super_admin = next(
        role for role in ROLE_DEFAULTS if role["code"] == PERFORMANCE_SUPER_ADMIN_ROLE_CODE
    )

    assert super_admin["permissions"] == (PERMISSION_MANAGE_ADMIN_ACCOUNTS,)
    assert PERMISSION_MANAGE_ADMIN_ACCOUNTS in {
        permission[0] for permission in PERMISSION_DEFAULTS
    }


def test_system_account_uses_bcrypt_password_hashing():
    password_hash = hash_password("Performance@2026")

    assert password_hash != "Performance@2026"
    assert verify_password("Performance@2026", password_hash) is True
    assert verify_password("WrongPassword@2026", password_hash) is False


def test_system_account_enforces_single_super_admin_partial_index():
    index = next(
        item
        for item in models.PerformanceSystemAccount.__table__.indexes
        if item.name == "uq_performance_system_accounts_single_super_admin"
    )

    assert index.unique is True
    assert "PERFORMANCE_SUPER_ADMIN" in str(index.dialect_options["postgresql"]["where"])


def test_role_assignment_scope_uniqueness_covers_subject_role_and_scope():
    constraint = next(
        item
        for item in models.PerformanceRoleAssignment.__table__.constraints
        if item.name == "uq_performance_role_assignment_scope"
    )

    assert tuple(constraint.columns.keys()) == (
        "subject_type",
        "subject_id",
        "role_id",
        "scope_type",
        "scope_ref",
    )


@pytest.mark.asyncio
async def test_performance_seed_is_idempotent_and_limits_super_admin_permissions(monkeypatch):
    monkeypatch.setattr(
        performance_seed.settings,
        "PERFORMANCE_SUPER_ADMIN_INIT_PASSWORD",
        "SecurePerformanceRoot@2026",
    )
    db = _SeedDb()

    await seed_performance_authorization_defaults(db)
    await seed_performance_authorization_defaults(db)

    super_accounts = [
        account
        for account in db.rows[models.PerformanceSystemAccount]
        if account.account_type == models.SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN
    ]
    super_role = next(
        role
        for role in db.rows[models.PerformanceRole]
        if role.code == PERFORMANCE_SUPER_ADMIN_ROLE_CODE
    )
    super_permission_ids = {
        link.permission_id
        for link in db.rows[models.PerformanceRolePermission]
        if link.role_id == super_role.id
    }
    super_permission_codes = {
        permission.code
        for permission in db.rows[models.PerformancePermission]
        if permission.id in super_permission_ids
    }

    assert len(super_accounts) == 1
    assert verify_password(
        "SecurePerformanceRoot@2026", super_accounts[0].password_hash
    ) is True
    assert super_permission_codes == {PERMISSION_MANAGE_ADMIN_ACCOUNTS}
    assert len(db.rows[models.PerformanceRoleAssignment]) == 1
    assert [event.event_type for event in db.rows[models.PerformanceAuditEvent]] == [
        "PERFORMANCE_SUPER_ADMIN_CREATED",
        "PERFORMANCE_SUPER_ADMIN_ROLE_GRANTED",
    ]
    assert db.commits == 2


def test_performance_bootstrap_password_rejects_legacy_default(monkeypatch):
    monkeypatch.setattr(
        performance_seed.settings,
        "PERFORMANCE_SUPER_ADMIN_INIT_PASSWORD",
        "Performance@2026",
    )

    with pytest.raises(performance_seed.PerformanceBootstrapConfigurationError):
        performance_seed._require_bootstrap_password()
