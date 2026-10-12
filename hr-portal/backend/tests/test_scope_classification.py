from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from pydantic import ValidationError

from app.core.db import get_session
from app.core.deps import current_user
from app.data.models import RegisteredTable
from app.warehouse import schemas
from app.warehouse import router as warehouse_router


def test_registered_table_has_controlled_default_and_consistency_constraints():
    columns = RegisteredTable.__table__.columns
    assert columns["security_classification"].server_default.arg == "controlled_fact"
    assert columns["scope_classification_version"].server_default.arg == "0"
    constraints = {constraint.name for constraint in RegisteredTable.__table__.constraints}
    assert "ck_registered_table_security_classification" in constraints
    assert "ck_registered_table_scope_approval" in constraints


def test_scope_classification_request_requires_reason_version_and_known_role():
    schema = schemas.ScopeClassificationIn
    payload = schema(security_classification="person_bridge", reason="  reviewed  ", expected_version=0)
    assert payload.reason == "reviewed"
    for changes in (
        {"security_classification": "public_dim"},
        {"reason": "  "},
        {"expected_version": -1},
        {"approved_by": 99},
    ):
        with pytest.raises(ValidationError):
            schema(**{**payload.model_dump(), **changes})


class _Result:
    def __init__(self, row):
        self.row = row

    def first(self):
        return self.row

    def scalar_one_or_none(self):
        return self.row


class _ClassificationDb:
    def __init__(self):
        self.allowed = {"V", "U"}
        self.table = RegisteredTable(
            id=15, table_name="test_fact", table_label="test", scope_strategy="person_first",
            roster_join_col="employee_no", security_classification="controlled_fact",
            scope_classification_version=0,
        )
        self.logs = []
        self.statements = []
        self.commits = 0
        self.rollbacks = 0
        self.fail_commit = False
        self._snapshot = self._state()

    def _state(self):
        if self.table is None:
            return None
        return {key: getattr(self.table, key) for key in (
            "security_classification", "scope_classification_version", "scope_approved_by",
            "scope_approved_at", "scope_approval_reason",
        )}

    async def execute(self, stmt):
        self.statements.append(stmt)
        entity = stmt.column_descriptions[0]["entity"]
        if entity.__name__ == "RoleMenu":
            op = "U" if "role_menus.can_update" in str(stmt).split("WHERE", 1)[-1] else "V"
            return _Result(object() if op in self.allowed else None)
        assert entity is RegisteredTable
        return _Result(self.table)

    def add(self, row):
        from app.system.models import SystemLog
        assert isinstance(row, SystemLog)
        self.logs.append(row)

    async def commit(self):
        if self.fail_commit:
            raise RuntimeError("commit failed")
        self.commits += 1
        self._snapshot = self._state()

    async def rollback(self):
        self.rollbacks += 1
        if self.table is not None and self._snapshot is not None:
            for key, value in self._snapshot.items():
                setattr(self.table, key, value)
        self.logs.clear()


@pytest.fixture
def classification_api():
    app = FastAPI()
    for route in warehouse_router.router.routes:
        if route.path == "/warehouse/scope-classifications/{table_name}":
            app.add_api_route(
                "/api/v1" + route.path, route.endpoint, methods=list(route.methods),
                dependencies=route.dependencies, response_model=route.response_model,
            )
    db = _ClassificationDb()

    async def session():
        yield db

    async def user():
        return SimpleNamespace(id=7)

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[current_user] = user
    return app, db


@pytest.mark.asyncio
async def test_get_default_classification_does_not_write(classification_api):
    app, db = classification_api
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-classifications/test_fact")
    assert response.status_code == 200
    assert response.json() == {
        "table_name": "test_fact", "security_classification": "controlled_fact", "version": 0,
        "approved_by": None, "approved_at": None, "reason": None, "runtime_filter_exemption": False,
    }
    assert db.commits == 0 and not db.logs


@pytest.mark.asyncio
@pytest.mark.parametrize("classification", ["controlled_fact", "sensitive_fact", "person_bridge", "public_reference"])
async def test_approve_classification_records_identity_and_metadata_only_audit(classification_api, classification):
    from app.system.models import SystemLog
    app, db = classification_api
    reason = "review note contains private example 123456.78"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.put("/api/v1/warehouse/scope-classifications/test_fact", json={
            "security_classification": classification, "reason": reason, "expected_version": 0,
        })
    assert response.status_code == 200
    body = response.json()
    assert body["approved_by"] == 7 and body["approved_at"]
    assert body["version"] == 1 and body["security_classification"] == classification
    assert body["reason"] == reason and body["runtime_filter_exemption"] is False
    assert db.commits == 1
    assert db.table.scope_strategy == "person_first" and db.table.roster_join_col == "employee_no"
    assert "FOR UPDATE" in str(db.statements[-1])
    log = db.logs[0]
    assert isinstance(log, SystemLog) and log.user_id == 7
    assert log.metadata_json["previous_classification"] == "controlled_fact"
    assert "123456.78" not in repr(log.metadata_json)
    assert reason not in repr(log.__dict__)
    assert log.metadata_json["runtime_filter_exemption"] is False


@pytest.mark.asyncio
async def test_stale_version_does_not_overwrite_approval(classification_api):
    app, db = classification_api
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        payload = {"security_classification": "person_bridge", "reason": "approved", "expected_version": 0}
        assert (await client.put("/api/v1/warehouse/scope-classifications/test_fact", json=payload)).status_code == 200
        payload["security_classification"] = "public_reference"
        response = await client.put("/api/v1/warehouse/scope-classifications/test_fact", json=payload)
    assert response.status_code == 409
    assert db.table.security_classification == "person_bridge"
    assert db.table.scope_classification_version == 1
    assert db.commits == 1 and db.rollbacks == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("method,permission", [("get", "V"), ("put", "U")])
async def test_scope_classification_permission_denial_is_403(classification_api, method, permission):
    app, db = classification_api
    db.allowed.remove(permission)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(method, "/api/v1/warehouse/scope-classifications/test_fact", json={
            "security_classification": "person_bridge", "reason": "approved", "expected_version": 0,
        } if method == "put" else None)
    assert response.status_code == 403
    assert len(db.statements) == 1 and db.commits == 0 and not db.logs
    assert "scope_approval_reason" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["get", "put"])
async def test_scope_classification_missing_asset_is_404(classification_api, method):
    app, db = classification_api
    db.table = None
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(method, "/api/v1/warehouse/scope-classifications/missing", json={
            "security_classification": "person_bridge", "reason": "approved", "expected_version": 0,
        } if method == "put" else None)
    assert response.status_code == 404
    assert not db.logs and db.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("changes", [
    {"security_classification": "public_dim"}, {"reason": "  "}, {"expected_version": -1},
    {"expected_version": True}, {"approved_by": 99}, {"scope_strategy": "cc_first"},
])
async def test_scope_classification_rejects_invalid_or_forged_payload(classification_api, changes):
    app, db = classification_api
    payload = {"security_classification": "person_bridge", "reason": "approved", "expected_version": 0, **changes}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.put("/api/v1/warehouse/scope-classifications/test_fact", json=payload)
    assert response.status_code == 422
    assert not db.logs and db.commits == 0


@pytest.mark.asyncio
async def test_scope_classification_invalid_identifier_is_422(classification_api):
    app, db = classification_api
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-classifications/test-fact")
    assert response.status_code == 422
    assert len(db.statements) == 1


@pytest.mark.asyncio
async def test_scope_classification_requires_login(classification_api):
    app, db = classification_api
    app.dependency_overrides.pop(current_user)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-classifications/test_fact")
    assert response.status_code == 401 and not db.statements


@pytest.mark.asyncio
async def test_scope_classification_failed_commit_rolls_back_state_and_audit(classification_api):
    from app.reports.scope_classification import approve_scope_classification
    _, db = classification_api
    db.fail_commit = True
    payload = schemas.ScopeClassificationIn(security_classification="public_reference", reason="approved", expected_version=0)
    with pytest.raises(RuntimeError, match="commit failed"):
        await approve_scope_classification(db, "test_fact", payload, SimpleNamespace(id=7))
    assert db.rollbacks == 1 and db.commits == 0 and not db.logs
    assert db.table.security_classification == "controlled_fact" and db.table.scope_classification_version == 0


def _migration():
    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path
    path = Path(__file__).parents[1] / "alembic/versions/0253_table_scope_classification.py"
    spec = spec_from_file_location("table_scope_classification_migration", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_classification_migration_emits_only_additive_upgrade_and_scoped_downgrade():
    from io import StringIO
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    migration = _migration()
    assert migration.down_revision == "0252_performance_metric_field_display_ids"
    upgrade_sql = StringIO()
    migration.op = Operations(MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": upgrade_sql}
    ))
    migration.upgrade()
    sql = upgrade_sql.getvalue()
    assert "DEFAULT 'controlled_fact' NOT NULL" in sql
    assert "scope_classification_version INTEGER DEFAULT '0' NOT NULL" in sql
    assert "ck_registered_table_scope_approval" in sql
    assert "REFERENCES users (id) ON DELETE RESTRICT" in sql
    assert "UPDATE " not in sql and "DELETE FROM " not in sql and "DROP " not in sql

    downgrade_sql = StringIO()
    migration.op = Operations(MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": downgrade_sql}
    ))
    migration.downgrade()
    sql = downgrade_sql.getvalue()
    assert "DROP TABLE" not in sql and "DELETE " not in sql
    assert "DROP COLUMN security_classification" in sql
    assert "DROP COLUMN scope_classification_version" in sql
    assert "system_logs" not in sql


@pytest.fixture
def classification_sqlite():
    from sqlalchemy import BigInteger, Column, MetaData, Table, create_engine
    metadata = MetaData()
    users = Table("users", metadata, Column("id", BigInteger, primary_key=True))
    registered = RegisteredTable.__table__.to_metadata(metadata)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        metadata.create_all(conn)
        conn.execute(users.insert().values(id=7))
        conn.execute(registered.insert().values(id=15, table_name="test_fact", table_label="test"))
    yield engine, registered, users
    engine.dispose()


def test_classification_sqlite_model_default_is_controlled(classification_sqlite):
    from sqlalchemy import select
    engine, table, _ = classification_sqlite
    with engine.connect() as conn:
        row = conn.execute(select(table)).mappings().one()
    assert row["security_classification"] == "controlled_fact"
    assert row["scope_classification_version"] == 0
    assert row["scope_approved_by"] is None


@pytest.mark.parametrize("changes", [
    {"security_classification": "public_reference"},
    {"scope_classification_version": -1},
    {"security_classification": "public_dim"},
    {"scope_classification_version": 1},
    {"scope_classification_version": 1, "scope_approved_by": 7,
     "scope_approved_at": "NOW", "scope_approval_reason": "  "},
    {"scope_classification_version": 1, "scope_approved_by": 999,
     "scope_approved_at": "NOW", "scope_approval_reason": "reviewed"},
])
def test_classification_sqlite_constraints_reject_incomplete_or_unknown_approval(classification_sqlite, changes):
    from datetime import UTC, datetime
    from sqlalchemy.exc import IntegrityError
    engine, table, _ = classification_sqlite
    if changes.get("scope_approved_at") == "NOW":
        changes = {**changes, "scope_approved_at": datetime.now(UTC)}
    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(table.update().where(table.c.id == 15).values(**changes))


def test_classification_sqlite_keeps_approver_reference_and_existing_asset(classification_sqlite):
    from datetime import UTC, datetime
    from sqlalchemy import func, select
    from sqlalchemy.exc import IntegrityError
    engine, table, users = classification_sqlite
    with engine.begin() as conn:
        conn.execute(table.update().where(table.c.id == 15).values(
            security_classification="public_reference", scope_classification_version=1,
            scope_approved_by=7, scope_approved_at=datetime.now(UTC), scope_approval_reason="reviewed",
        ))
    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(users.delete().where(users.c.id == 7))
    with engine.connect() as conn:
        assert conn.scalar(select(func.count()).select_from(table)) == 1
        assert conn.scalar(select(table.c.security_classification)) == "public_reference"


@pytest.mark.asyncio
async def test_public_classification_does_not_bypass_existing_scope_filter(classification_api, monkeypatch):
    from unittest.mock import AsyncMock
    from sqlalchemy.sql.elements import False_
    from app.data.models import DATA_TABLES
    from app.permissions import scope_filter
    from app.reports.scope_classification import approve_scope_classification

    _, db = classification_api
    await approve_scope_classification(
        db, "test_fact",
        schemas.ScopeClassificationIn(security_classification="public_reference", reason="reviewed", expected_version=0),
        SimpleNamespace(id=7),
    )
    monkeypatch.setitem(DATA_TABLES, "test_fact", SimpleNamespace())
    monkeypatch.setattr(scope_filter, "_is_super_admin", AsyncMock(return_value=False))
    monkeypatch.setattr(scope_filter, "_get_role_columns", AsyncMock(return_value={}))
    monkeypatch.setattr(scope_filter, "_get_roster_join_col", AsyncMock(return_value=None))
    clause = await scope_filter.build_scope_filter(SimpleNamespace(id=4), "test_fact", db, strategy="person_first")
    assert isinstance(clause, False_)
    assert db.table.security_classification == "public_reference"


@pytest_asyncio.fixture
async def postgres_classification_schema():
    import uuid
    from sqlalchemy import BigInteger, Column, MetaData, Table, text
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool
    from app.core.config import settings
    from app.system.models import SystemLog

    assert settings.DB_HOST == "127.0.0.1" and settings.DB_PORT == 55432
    assert settings.DB_NAME.startswith("hr021_") and settings.DB_USER == "hr021_test"
    url = make_url(settings.db_url_async).set(database="hr021_migration")
    schema = "hr021_scope_" + uuid.uuid4().hex
    admin = create_async_engine(url, poolclass=NullPool)
    engine = create_async_engine(url, poolclass=NullPool, connect_args={
        "server_settings": {"search_path": schema, "statement_timeout": "15000"},
    })
    try:
        async with admin.begin() as conn:
            assert await conn.scalar(text("SELECT current_database()")) == "hr021_migration"
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        metadata = MetaData()
        users = Table("users", metadata, Column("id", BigInteger, primary_key=True))
        registered = RegisteredTable.__table__.to_metadata(metadata)
        SystemLog.__table__.to_metadata(metadata)
        async with engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
            await conn.execute(users.insert().values(id=7))
            await conn.execute(registered.insert().values(
                id=15, table_name="test_fact", table_label="preserved", scope_strategy="person_first",
            ))
        yield engine, async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin.dispose()


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_postgres_migration_round_trip_and_concurrent_approval(postgres_classification_schema):
    import asyncio
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from fastapi import HTTPException
    from sqlalchemy import func, select, text
    from app.reports.scope_classification import approve_scope_classification
    from app.system.models import SystemLog

    engine, factory = postgres_classification_schema
    migration = _migration()
    def apply(conn, operation):
        migration.op = Operations(MigrationContext.configure(conn))
        getattr(migration, operation)()

    async with engine.begin() as conn:
        await conn.run_sync(apply, "downgrade")
        assert await conn.scalar(text("SELECT table_label FROM registered_tables WHERE id=15")) == "preserved"
    async with engine.begin() as conn:
        await conn.run_sync(apply, "upgrade")
        row = (await conn.execute(text("SELECT security_classification,scope_classification_version,scope_strategy FROM registered_tables WHERE id=15"))).one()
        assert tuple(row) == ("controlled_fact", 0, "person_first")

    async def approve(role):
        async with factory() as session:
            return await approve_scope_classification(session, "test_fact", schemas.ScopeClassificationIn(
                security_classification=role, expected_version=0, reason="isolated concurrent review",
            ), SimpleNamespace(id=7))
    outcomes = await asyncio.gather(approve("person_bridge"), approve("sensitive_fact"), return_exceptions=True)
    successes = [result for result in outcomes if isinstance(result, schemas.ScopeClassificationOut)]
    conflicts = [result for result in outcomes if isinstance(result, HTTPException) and result.status_code == 409]
    assert len(successes) == len(conflicts) == 1, outcomes
    async with factory() as session:
        asset = await session.get(RegisteredTable, 15)
        assert asset.scope_classification_version == 1
        assert asset.security_classification == successes[0].security_classification
        assert await session.scalar(select(func.count()).select_from(SystemLog)) == 1
    async with engine.begin() as conn:
        await conn.run_sync(apply, "downgrade")
        assert await conn.scalar(text("SELECT count(*) FROM registered_tables")) == 1
        assert await conn.scalar(text("SELECT count(*) FROM system_logs")) == 1
        assert await conn.scalar(text("SELECT scope_strategy FROM registered_tables WHERE id=15")) == "person_first"
    async with engine.begin() as conn:
        await conn.run_sync(apply, "upgrade")
        assert await conn.scalar(text("SELECT security_classification FROM registered_tables WHERE id=15")) == "controlled_fact"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_postgres_classification_and_audit_commit_atomically(postgres_classification_schema):
    from sqlalchemy import func, select, text
    from sqlalchemy.exc import IntegrityError
    from app.reports.scope_classification import approve_scope_classification
    from app.system.models import SystemLog

    engine, factory = postgres_classification_schema
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE system_logs ADD CONSTRAINT hr021_forced_audit_failure CHECK (status <> 'success')"))
    async with factory() as session:
        with pytest.raises(IntegrityError):
            await approve_scope_classification(session, "test_fact", schemas.ScopeClassificationIn(
                security_classification="public_reference", expected_version=0, reason="isolated review",
            ), SimpleNamespace(id=7))
    async with factory() as session:
        asset = await session.get(RegisteredTable, 15)
        assert asset.scope_classification_version == 0
        assert asset.security_classification == "controlled_fact" and asset.scope_approved_by is None
        assert await session.scalar(select(func.count()).select_from(SystemLog)) == 0


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_postgres_scope_audit_survives_business_rollback(postgres_classification_schema, monkeypatch):
    from sqlalchemy import select, text
    from app.reports import audit
    from app.system.models import SystemLog

    _, factory = postgres_classification_schema
    monkeypatch.setattr(audit, "get_session_factory", lambda: factory)
    async with factory() as business:
        await business.execute(text("UPDATE registered_tables SET table_label='rolled_back' WHERE id=15"))
        await audit.record_scope_audit(
            user=SimpleNamespace(id=7), dataset_id=15, report_id=17, channel="run", query_status="failed",
            requested_aggregate=True, decisions=[{
                "alias": "r", "table_name": "allocation", "strategy": "person_first",
                "decision": "restricted", "reason_code": "ROW_SCOPE_APPLIED", "restricted": True,
            }],
        )
        await business.rollback()
    async with factory() as session:
        assert (await session.get(RegisteredTable, 15)).table_label == "preserved"
        log = (await session.execute(select(SystemLog))).scalars().one()
        assert log.status == "failed" and log.user_id == 7
        assert log.metadata_json["authorization_contract"] == "legacy_scope_strategy"
