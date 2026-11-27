import asyncio
import importlib.util
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Column, MetaData, String, Table, select, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Insert

from app.core.db import get_session
from app.data.models import DATA_TABLES
from app.performance import field_settings_router as module
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context
from app.performance.models import PerformanceManagerStandardSetting

BASE = "/api/v1/performance/system-settings/fields"
URL = BASE + "/manager-standard"
TYPES_URL = BASE + "/employee-types"
FIRST = {"manager_standard": "inservice_direct_underling", "specific_employee_types": []}
SECOND = {"manager_standard": "specific_employee_type_underling", "specific_employee_types": ["正式员工"]}


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
        self.types = ["正式员工", "实习生", " 正式员工 ", None, "", "  "]

    async def get(self, *_args):
        return self.setting

    async def execute(self, statement):
        self.statements.append(statement)
        if isinstance(statement, Insert) and self.setting is None:
            self.setting = PerformanceManagerStandardSetting(id=1, **FIRST)
        return self

    def scalar_one(self):
        return self.setting

    def scalars(self):
        return self

    def all(self):
        return self.types

    async def commit(self):
        self.commits += 1

    async def refresh(self, _setting):
        pass


@pytest.fixture(autouse=True)
def roster(monkeypatch):
    table = Table("emp_realtime_roster", MetaData(), Column("employee_type", String))
    model = type("Roster", (), {"__table__": table})
    monkeypatch.setitem(DATA_TABLES, "emp_realtime_roster", model)
    return table


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


def test_defaults_and_live_options_do_not_write(roster):
    db = MemoryDb()
    api = client(db)
    assert api.get(URL).json() == FIRST
    expected = [{"value": value, "label": value} for value in sorted(["正式员工", "实习生"])]
    assert api.get(TYPES_URL).json() == expected
    statement = db.statements[-1]
    assert list(statement.selected_columns) == [roster.c.employee_type]
    assert "emp_realtime_roster.employee_type" in str(statement)
    db.types = ["外包"]
    assert api.get(TYPES_URL).json() == [{"value": "外包", "label": "外包"}]
    db.types = []
    assert api.get(TYPES_URL).json() == []
    assert db.setting is None and db.commits == 0


@pytest.mark.parametrize("authenticated,allowed,status", [(False, False, 401), (True, False, 403)])
def test_all_routes_require_configuration_permission(authenticated, allowed, status):
    db = MemoryDb()
    api = client(db, allowed, authenticated)
    assert api.get(URL).status_code == status
    assert api.get(TYPES_URL).status_code == status
    assert api.put(URL, json=FIRST).status_code == status
    assert db.statements == [] and db.commits == 0


@pytest.mark.parametrize("payload", [
    {}, {"manager_standard": "inservice_direct_underling"},
    {**FIRST, "actor_ref": "spoof"}, {**FIRST, "unknown": 1},
    {**FIRST, "manager_standard": "unknown"}, {**FIRST, "manager_standard": None},
    {**FIRST, "specific_employee_types": None}, {**FIRST, "specific_employee_types": "正式员工"},
    {**SECOND, "specific_employee_types": []}, {**SECOND, "specific_employee_types": [1]},
    {**SECOND, "specific_employee_types": [True]}, {**SECOND, "specific_employee_types": [None]},
])
def test_payload_validation_prevents_writes(payload):
    db = MemoryDb()
    assert client(db).put(URL, json=payload).status_code == 422
    assert db.setting is None and db.commits == 0


@pytest.mark.parametrize("value", ["不存在", "", "  ", " 正式员工 ", "1", "'; DROP TABLE users; --"])
def test_unknown_types_are_rejected_without_initialization(value):
    db = MemoryDb()
    response = client(db).put(URL, json={**SECOND, "specific_employee_types": [value]})
    assert response.status_code == 422
    assert db.setting is None and db.commits == 0
    assert len(db.statements) == 1


def test_save_reopen_deduplicate_clear_noop_and_trusted_actor(events):
    db = MemoryDb()
    api = client(db)
    saved = api.put(URL, json={**SECOND, "specific_employee_types": ["正式员工", "正式员工"]})
    assert saved.status_code == 200 and saved.json() == SECOND
    assert api.get(URL).json() == SECOND
    assert db.setting.updated_by_type == "SYSTEM_ACCOUNT"
    assert db.setting.updated_by_ref == "17"
    assert events[0].before_state == FIRST and events[0].after_state == SECOND
    assert events[0].actor_ref == "17"
    assert events[0].subject_type == "MANAGER_STANDARD_SETTINGS"
    assert events[0].event_type == "PERFORMANCE_MANAGER_STANDARD_UPDATED"
    insert_statement, locked_select = db.statements[1:3]
    assert "ON CONFLICT (id) DO NOTHING" in str(insert_statement.compile(dialect=postgresql.dialect()))
    assert locked_select._for_update_arg is not None
    assert api.put(URL, json=SECOND).json() == SECOND
    assert len(events) == 1
    db.types = ["外包"]
    assert api.get(URL).json() == SECOND
    assert api.put(URL, json=SECOND).status_code == 422
    assert api.get(URL).json() == SECOND
    assert api.put(URL, json={**FIRST, "specific_employee_types": ["已消失的类型"]}).json() == FIRST
    assert api.get(URL).json() == FIRST
    assert len(events) == 2 and events[-1].before_state == SECOND


def test_audit_failure_prevents_commit(monkeypatch):
    db = MemoryDb()

    class FailingAudit:
        def __init__(self, session):
            assert session is db

        def append_event(self, _event):
            raise RuntimeError("audit unavailable")

    monkeypatch.setattr(module, "PerformanceAuditService", FailingAudit)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        client(db).put(URL, json=SECOND)
    assert db.commits == 0


def test_trusted_actor_failure_prevents_initialization(monkeypatch):
    from fastapi import HTTPException
    db = MemoryDb()

    async def reject(_db, _context):
        raise HTTPException(status_code=403, detail="actor unavailable")

    monkeypatch.setattr(module, "resolve_trusted_performance_actor", reject)
    assert client(db).put(URL, json=SECOND).status_code == 403
    assert db.statements == [] and db.setting is None and db.commits == 0


@pytest.mark.parametrize("missing", ["table", "column"])
def test_missing_roster_contract_fails_closed(monkeypatch, missing):
    if missing == "table":
        monkeypatch.delitem(DATA_TABLES, "emp_realtime_roster")
    else:
        table = Table("emp_realtime_roster", MetaData(), Column("not_employee_type", String))
        monkeypatch.setitem(DATA_TABLES, "emp_realtime_roster", type("Roster", (), {"__table__": table}))
    db = MemoryDb()
    api = client(db)
    assert api.get(TYPES_URL).status_code == 503
    assert api.put(URL, json=SECOND).status_code == 503
    assert api.get(URL).json() == FIRST
    assert db.setting is None and db.commits == 0


def migration_module():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0326_performance_manager_standard.py"
    spec = importlib.util.spec_from_file_location("manager_standard_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_migration_offline_ddl_and_model_agree():
    migration = migration_module()
    assert migration.revision == "0326_performance_manager_standard"
    assert migration.down_revision == "0325_performance_report_notes"
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "CREATE TABLE performance_manager_standard_settings" in sql
    assert "DROP TABLE performance_manager_standard_settings" in sql
    assert "performance_other_settings" not in sql
    table = PerformanceManagerStandardSetting.__table__
    for constraint in table.constraints:
        if hasattr(constraint, "sqltext"):
            assert str(constraint.sqltext) in sql
    assert table.c.manager_standard.default.arg == FIRST["manager_standard"]
    assert table.c.specific_employee_types.default.arg(None) == []


@pytest.mark.postgres_acceptance
def test_postgres_migration_persistence_concurrency_and_audit_rollback():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool
    from sqlalchemy.exc import IntegrityError
    from app.core.config import settings
    from app.performance.models import PerformanceAuditEvent

    migration = migration_module()
    schema = "pm_manager_standard_" + uuid4().hex[:12]

    async def run():
        engine = create_async_engine(settings.db_url_async, poolclass=NullPool)
        async with engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        scoped = create_async_engine(settings.db_url_async, poolclass=NullPool,
            connect_args={"server_settings": {"search_path": schema}})
        factory = async_sessionmaker(scoped, expire_on_commit=False)

        def migrate(conn, action):
            with Operations.context(MigrationContext.configure(conn)):
                getattr(migration, action)()

        async def save(payload):
            async with factory() as db:
                return await module.update_manager_standard(module.ManagerStandardPayload(**payload), context(), db)

        try:
            async with scoped.begin() as conn:
                await conn.run_sync(lambda c: migrate(c, "upgrade"))
                await conn.run_sync(lambda c: PerformanceAuditEvent.__table__.create(c))
                await conn.execute(text("CREATE TABLE emp_realtime_roster (employee_type text)"))
                await conn.execute(text("INSERT INTO emp_realtime_roster VALUES ('正式员工'), ('实习生')"))
                await conn.execute(text("CREATE TABLE preserved_record (id integer primary key)"))
                await conn.execute(text("INSERT INTO preserved_record VALUES (1)"))
            async with factory() as db:
                assert (await module.get_manager_standard(context(), db)).model_dump() == FIRST
                assert await db.get(PerformanceManagerStandardSetting, 1) is None
            alternate = {**SECOND, "specific_employee_types": ["实习生"]}
            await asyncio.gather(save(SECOND), save(alternate))
            async with factory() as db:
                saved = (await module.get_manager_standard(context(), db)).model_dump()
                assert saved in (SECOND, alternate)
                audits = (await db.execute(select(PerformanceAuditEvent).order_by(PerformanceAuditEvent.id))).scalars().all()
                assert len(audits) == 2
                assert audits[0].before_state == FIRST
                assert audits[1].before_state == audits[0].after_state
                assert audits[1].after_state == saved
                assert all(event.actor_ref == "17" for event in audits)
            await save(saved)
            async with scoped.begin() as conn:
                assert (await conn.execute(text("SELECT count(*) FROM performance_audit_events"))).scalar_one() == 2
                await conn.execute(text("ALTER TABLE performance_audit_events ADD CONSTRAINT reject_manager_standard_audit CHECK (event_type <> 'PERFORMANCE_MANAGER_STANDARD_UPDATED') NOT VALID"))
            with pytest.raises(IntegrityError):
                await save(FIRST)
            async with factory() as db:
                assert (await module.get_manager_standard(context(), db)).model_dump() == saved
            async with scoped.begin() as conn:
                await conn.run_sync(lambda c: migrate(c, "downgrade"))
                assert (await conn.execute(text("SELECT count(*) FROM preserved_record"))).scalar_one() == 1
                assert (await conn.execute(text("SELECT to_regclass('performance_manager_standard_settings')"))).scalar_one() is None
                await conn.run_sync(lambda c: migrate(c, "upgrade"))
                await conn.execute(text("INSERT INTO performance_manager_standard_settings (id) VALUES (1)"))
            async with factory() as db:
                assert (await module.get_manager_standard(context(), db)).model_dump() == FIRST
        finally:
            await scoped.dispose()
            async with engine.begin() as conn:
                await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            await engine.dispose()

    asyncio.run(run())
