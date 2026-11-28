import importlib.util
from io import StringIO
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Insert

from app.core.db import get_session
from app.performance import field_settings_router as module
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context
from app.performance.models import PerformanceDetailFieldSetting

BASE = "/api/v1/performance/system-settings/fields"
OPTIONS_URL = BASE + "/detail-field-options"
URL = BASE + "/detail-visible-fields"
ALL_IDS = [field_id for field_id, _, _, _ in module.DETAIL_FIELD_CATALOG]


def context(allowed=True):
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT", subject_id=17, display_name="配置管理员",
        account_type="PERFORMANCE_ADMIN", portal_entry_permissions=(), role_grants=(),
        permission_codes=("performance.configuration.manage",) if allowed else (),
    )


class MemoryDb:
    def __init__(self):
        self.setting = None
        self.commits = 0
        self.statements = []

    async def get(self, *_args):
        return self.setting

    async def execute(self, statement):
        self.statements.append(statement)
        if isinstance(statement, Insert) and self.setting is None:
            self.setting = PerformanceDetailFieldSetting(id=1, field=list(module.DEFAULT_DETAIL_FIELD_IDS))
        return self

    def scalar_one(self):
        return self.setting

    async def commit(self):
        self.commits += 1

    async def refresh(self, _setting):
        pass


def client(db, allowed=True, authenticated=True):
    app = FastAPI()
    app.include_router(module.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: db
    if authenticated:
        app.dependency_overrides[get_performance_access_context] = lambda: context(allowed)
    return TestClient(app)


@pytest.fixture
def events(monkeypatch):
    result = []

    class Audit:
        def __init__(self, db):
            self.db = db

        def append_event(self, event):
            result.append(event)

    monkeypatch.setattr(module, "PerformanceAuditService", Audit)
    return result


def test_options_follow_the_captured_catalog_order():
    db = MemoryDb()
    response = client(db).get(OPTIONS_URL)
    assert response.status_code == 200
    options = response.json()["options"]
    assert [option["id"] for option in options] == ALL_IDS
    assert options[0] == {"id": "department", "name": "部门", "preview_name": "部门", "disabled": True}
    assert next(option for option in options if option["id"] == "joinDate")["preview_name"] == "2021-01-01入职日期"
    assert sum(option["disabled"] for option in options) == 1
    assert db.setting is None and db.commits == 0


def test_defaults_are_returned_without_writing():
    db = MemoryDb()
    response = client(db).get(URL)
    assert response.status_code == 200
    assert response.json()["field"] == list(module.DEFAULT_DETAIL_FIELD_IDS)
    assert db.setting is None and db.commits == 0


@pytest.mark.parametrize("authenticated,allowed,status", [(False, False, 401), (True, False, 403)])
def test_routes_require_configuration_permission(authenticated, allowed, status):
    db = MemoryDb()
    api = client(db, allowed, authenticated)
    assert api.get(OPTIONS_URL).status_code == status
    assert api.get(URL).status_code == status
    assert api.put(URL, json={"field": ["department"]}).status_code == status
    assert db.statements == [] and db.commits == 0


def test_payload_validation_prevents_writes():
    invalid = [
        {},
        {"field": "department"},
        {"field": ["department", "unknown"]},
        {"field": ["department", 1]},
        {"field": ["department"], "extra": True},
    ]
    for payload in invalid:
        db = MemoryDb()
        assert client(db).put(URL, json=payload).status_code == 422, payload
        assert db.setting is None and db.commits == 0


def test_save_normalizes_order_keeps_department_and_audits(events):
    db = MemoryDb()
    api = client(db)
    saved = api.put(URL, json={"field": ["employeeType", "joinDate", "level", "level"]})
    assert saved.status_code == 200
    assert saved.json()["field"] == ["department", "level", "joinDate", "employeeType"]
    assert api.get(URL).json() == saved.json()
    assert db.setting.updated_by_type == "SYSTEM_ACCOUNT"
    assert db.setting.updated_by_ref == "17"
    assert len(events) == 1
    assert events[0].event_type == "PERFORMANCE_DETAIL_VISIBLE_FIELDS_UPDATED"
    assert events[0].subject_type == "DETAIL_FIELD_SETTINGS"
    assert events[0].after_state["field"] == ["department", "level", "joinDate", "employeeType"]
    insert_statement, locked_select = db.statements[0:2]
    assert "ON CONFLICT (id) DO NOTHING" in str(insert_statement.compile(dialect=postgresql.dialect()))
    assert locked_select._for_update_arg is not None
    assert api.put(URL, json={"field": ["department", "level", "joinDate", "employeeType"]}).status_code == 200
    assert len(events) == 1


def test_audit_failure_prevents_commit(monkeypatch):
    db = MemoryDb()

    class FailingAudit:
        def __init__(self, session):
            assert session is db

        def append_event(self, _event):
            raise RuntimeError("audit unavailable")

    monkeypatch.setattr(module, "PerformanceAuditService", FailingAudit)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        client(db).put(URL, json={"field": ["department", "jobTitle"]})
    assert db.commits == 0


def test_trusted_actor_failure_prevents_initialization(monkeypatch):
    from fastapi import HTTPException
    db = MemoryDb()

    async def reject(_db, _context):
        raise HTTPException(status_code=403, detail="actor unavailable")

    monkeypatch.setattr(module, "resolve_trusted_performance_actor", reject)
    assert client(db).put(URL, json={"field": ["department"]}).status_code == 403
    assert db.statements == [] and db.setting is None and db.commits == 0


def migration_module():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0329_performance_detail_fields.py"
    spec = importlib.util.spec_from_file_location("detail_field_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_migration_offline_ddl_and_model_agree():
    migration = migration_module()
    assert migration.revision == "0329_performance_detail_fields"
    assert migration.down_revision == "0328_performance_filter_conditions"
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "CREATE TABLE performance_detail_field_settings" in sql
    assert "DROP TABLE performance_detail_field_settings" in sql
    table = PerformanceDetailFieldSetting.__table__
    for constraint in table.constraints:
        if hasattr(constraint, "sqltext"):
            assert str(constraint.sqltext) in sql
    assert table.c.field.default.arg(None) == []
