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
from app.performance.models import PerformanceFilterConditionSetting

BASE = "/api/v1/performance/system-settings/fields"
URL = BASE + "/filter-conditions"


def context(allowed=True):
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT", subject_id=17, display_name="配置管理员",
        account_type="PERFORMANCE_ADMIN", portal_entry_permissions=(), role_grants=(),
        permission_codes=("performance.configuration.manage",) if allowed else (),
    )


def state(order=None, overrides=None):
    overrides = overrides or {}
    items = [
        {"filter_key": key, "default": overrides.get(key, key in module.DEFAULT_FILTER_KEYS)}
        for key in (order or [key for key, _, _ in module.FILTER_CONDITION_CATALOG])
    ]
    return {"filter_conditions": items}


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
            self.setting = PerformanceFilterConditionSetting(id=1, filter_conditions=module._default_filter_state())
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


def test_defaults_are_returned_without_writing():
    db = MemoryDb()
    response = client(db).get(URL)
    assert response.status_code == 200
    items = response.json()["filter_conditions"]
    assert len(items) == 32
    assert sum(item["default"] for item in items) == 7
    assert [item["filter_key"] for item in items] == [key for key, _, _ in module.FILTER_CONDITION_CATALOG]
    assert {item["filter_key"] for item in items if item["disable_set_default"]} == {
        "finalReviewScoreFilterKey", "currentSemesterAssessmentItemComparisonFilterKey",
        "inviteReviewScoreFilterKey", "otherStageScoreFilterKey", "historySemesterFinalScore",
        "stageStatusFilterKey",
    }
    assert db.setting is None and db.commits == 0


@pytest.mark.parametrize("authenticated,allowed,status", [(False, False, 401), (True, False, 403)])
def test_routes_require_configuration_permission(authenticated, allowed, status):
    db = MemoryDb()
    api = client(db, allowed, authenticated)
    assert api.get(URL).status_code == status
    assert api.put(URL, json=state()).status_code == status
    assert db.statements == [] and db.commits == 0


def test_payload_validation_prevents_writes():
    base = state()["filter_conditions"]
    invalid = [
        {},
        {"filter_conditions": base[:-1]},
        {"filter_conditions": base + [base[0]]},
        {"filter_conditions": base + [{"filter_key": "unknown", "default": False}]},
        {"filter_conditions": [{**item, "label": "伪造"} for item in base]},
        {"filter_conditions": [{**item, "default": 1} for item in base]},
        {"filter_conditions": [{**item, "default": "true"} for item in base]},
        {"filter_conditions": [{**item, "disable_set_default": True} for item in base]},
    ]
    for payload in invalid:
        db = MemoryDb()
        assert client(db).put(URL, json=payload).status_code == 422, payload
        assert db.setting is None and db.commits == 0


def test_disabled_condition_cannot_be_default():
    db = MemoryDb()
    payload = state(overrides={"finalReviewScoreFilterKey": True})
    assert client(db).put(URL, json=payload).status_code == 422
    assert db.setting is None and db.commits == 0


def test_save_reopen_order_and_audit(events):
    db = MemoryDb()
    api = client(db)
    order = [key for key, _, _ in reversed(module.FILTER_CONDITION_CATALOG)]
    payload = state(order=order, overrides={"dottedLeaders": True})
    saved = api.put(URL, json=payload)
    assert saved.status_code == 200
    items = saved.json()["filter_conditions"]
    assert [item["filter_key"] for item in items] == order
    assert next(item for item in items if item["filter_key"] == "dottedLeaders")["default"] is True
    assert next(item for item in items if item["filter_key"] == "finalReviewScoreFilterKey")["default"] is False
    assert all(item["label"] for item in items)
    assert api.get(URL).json() == saved.json()
    assert db.setting.updated_by_type == "SYSTEM_ACCOUNT"
    assert db.setting.updated_by_ref == "17"
    assert events[0].event_type == "PERFORMANCE_FILTER_CONDITIONS_UPDATED"
    assert events[0].subject_type == "FILTER_CONDITION_SETTINGS"
    assert events[0].actor_ref == "17"
    assert events[0].after_state["filter_conditions"][0]["filter_key"] == order[0]
    insert_statement, locked_select = db.statements[0:2]
    assert "ON CONFLICT (id) DO NOTHING" in str(insert_statement.compile(dialect=postgresql.dialect()))
    assert locked_select._for_update_arg is not None
    assert api.put(URL, json=payload).status_code == 200
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
        client(db).put(URL, json=state(overrides={"dottedLeaders": True}))
    assert db.commits == 0


def test_trusted_actor_failure_prevents_initialization(monkeypatch):
    from fastapi import HTTPException
    db = MemoryDb()

    async def reject(_db, _context):
        raise HTTPException(status_code=403, detail="actor unavailable")

    monkeypatch.setattr(module, "resolve_trusted_performance_actor", reject)
    assert client(db).put(URL, json=state()).status_code == 403
    assert db.statements == [] and db.setting is None and db.commits == 0


def migration_module():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0328_performance_filter_conditions.py"
    spec = importlib.util.spec_from_file_location("filter_condition_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_migration_offline_ddl_and_model_agree():
    migration = migration_module()
    assert migration.revision == "0328_performance_filter_conditions"
    assert migration.down_revision == "0327_member_filter_presets"
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "CREATE TABLE performance_filter_condition_settings" in sql
    assert "DROP TABLE performance_filter_condition_settings" in sql
    table = PerformanceFilterConditionSetting.__table__
    for constraint in table.constraints:
        if hasattr(constraint, "sqltext"):
            assert str(constraint.sqltext) in sql
    assert table.c.filter_conditions.default.arg(None) == []
