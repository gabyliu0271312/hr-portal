import asyncio
import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.sql.dml import Insert

from app.core.db import get_session
from app.performance import other_settings_router as module
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context
from app.performance.models import PerformanceOtherSetting

URL = "/api/v1/performance/system-settings/other"


class MemoryDb:
    def __init__(self):
        self.setting = None
        self.commits = 0

    async def get(self, *_args):
        return self.setting

    async def execute(self, statement):
        if isinstance(statement, Insert) and self.setting is None:
            self.setting = PerformanceOtherSetting(id=1, **module.OtherSettingsOut().model_dump())
        return self

    def scalar_one(self):
        return self.setting

    async def commit(self):
        self.commits += 1

    async def refresh(self, _setting):
        pass


def context(allowed=True):
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT", subject_id=1, display_name="配置管理员",
        account_type="PERFORMANCE_ADMIN", portal_entry_permissions=(), role_grants=(),
        permission_codes=("performance.configuration.manage",) if allowed else (),
    )


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
        def __init__(self, _db):
            pass

        def append_event(self, event):
            result.append(event)

    async def actor(_db, _context):
        from app.performance.auth_context import TrustedPerformanceActor
        return TrustedPerformanceActor(actor_type="SYSTEM_ACCOUNT", actor_ref="1")

    monkeypatch.setattr(module, "PerformanceAuditService", Audit)
    monkeypatch.setattr(module, "resolve_trusted_performance_actor", actor)
    return result


def test_get_defaults_does_not_write():
    db = MemoryDb()
    response = client(db).get(URL)
    assert response.status_code == 200
    assert response.json() == module.OtherSettingsOut().model_dump()
    assert db.setting is None
    assert db.commits == 0


@pytest.mark.parametrize("authenticated,allowed,status", [(False, False, 401), (True, False, 403)])
def test_real_permission_dependency_rejects_get_and_patch(authenticated, allowed, status):
    api = client(MemoryDb(), allowed=allowed, authenticated=authenticated)
    assert api.get(URL).status_code == status
    assert api.patch(URL, json={"calibration_import_enabled": False}).status_code == status


@pytest.mark.parametrize("values", [{}, {"unknown": True}, {"actor_ref": "1"},
    {"calibration_import_enabled": None}, {"calibration_import_enabled": "false"},
    {"calibration_import_enabled": 0}, {"calibration_import_enabled": []}])
def test_patch_validation_rejects_invalid_inputs(values):
    db = MemoryDb()
    assert client(db).patch(URL, json=values).status_code == 422
    assert db.setting is None
    assert db.commits == 0


def test_each_field_round_trips_and_noop_does_not_audit(events):
    db = MemoryDb()
    api = client(db)
    expected = module.OtherSettingsOut().model_dump()
    for key in expected:
        expected[key] = not expected[key]
        response = api.patch(URL, json={key: expected[key]})
        assert response.status_code == 200
        assert response.json() == expected
        assert api.get(URL).json() == expected
    assert len(events) == 8
    assert all(event.event_type == "PERFORMANCE_OTHER_SETTING_UPDATED" for event in events)
    assert all(event.subject_type == "OTHER_SETTINGS" and event.actor_ref == "1" for event in events)
    assert events[0].before_state == module.OtherSettingsOut().model_dump()
    assert events[-1].after_state == expected
    assert api.patch(URL, json=expected).status_code == 200
    assert len(events) == 8
    assert db.setting.updated_by_type == "SYSTEM_ACCOUNT"


def test_settings_model_has_matching_nonnull_server_defaults():
    defaults = module.OtherSettingsOut().model_dump()
    for key, value in defaults.items():
        column = PerformanceOtherSetting.__table__.c[key]
        assert column.nullable is False
        assert column.default.arg is value
        assert str(column.server_default.arg) == str(value).lower()


@pytest.mark.postgres_acceptance
def test_postgres_migration_roundtrip_persistence_concurrency_and_audit_rollback():
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import select, text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import settings
    from app.performance.models import PerformanceAuditEvent

    path = Path(__file__).resolve().parents[1] / "alembic/versions/0260_performance_other_settings.py"
    spec = importlib.util.spec_from_file_location("other_settings_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    schema = "pm_other_acceptance_" + uuid4().hex[:12]
    engine = create_async_engine(settings.db_url_async, poolclass=NullPool)

    async def run():
        async with engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        scoped = create_async_engine(
            settings.db_url_async, poolclass=NullPool,
            connect_args={"server_settings": {"search_path": schema}},
        )
        factory = async_sessionmaker(scoped, expire_on_commit=False)

        def migrate(conn, action):
            with Operations.context(MigrationContext.configure(conn)):
                getattr(migration, action)()

        try:
            async with scoped.begin() as conn:
                await conn.run_sync(lambda c: migrate(c, "upgrade"))
                await conn.run_sync(lambda c: PerformanceAuditEvent.__table__.create(c))
                await conn.execute(text("CREATE TABLE preserved_record (id integer primary key)"))
                await conn.execute(text("INSERT INTO preserved_record VALUES (1)"))
            async with factory() as db:
                assert (await module.get_other_settings(context(), db)).model_dump() == module.OtherSettingsOut().model_dump()
                assert await db.get(PerformanceOtherSetting, 1) is None

            async def patch(values):
                async with factory() as db:
                    return await module.update_other_settings(module.OtherSettingsPatch(**values), context(), db)

            await asyncio.gather(
                patch({"calibration_import_enabled": False}),
                patch({"performance_coefficient_enabled": True}),
            )
            async with factory() as db:
                value = await module.get_other_settings(context(), db)
                assert value.calibration_import_enabled is False
                assert value.performance_coefficient_enabled is True
                assert value.manual_result_opening_enabled is True
                assert len((await db.execute(select(PerformanceAuditEvent))).scalars().all()) == 2
            await patch({"calibration_import_enabled": False})
            async with factory() as db:
                assert len((await db.execute(select(PerformanceAuditEvent))).scalars().all()) == 2
            for key, value in module.OtherSettingsOut().model_dump().items():
                await patch({key: not value})
                async with factory() as db:
                    assert getattr(await module.get_other_settings(context(), db), key) is not value

            async with scoped.begin() as conn:
                await conn.execute(text("ALTER TABLE performance_audit_events ADD CONSTRAINT reject_other_setting_audit CHECK (event_type <> 'PERFORMANCE_OTHER_SETTING_UPDATED') NOT VALID"))
            async with factory() as db:
                from sqlalchemy.exc import IntegrityError
                with pytest.raises(IntegrityError):
                    await module.update_other_settings(module.OtherSettingsPatch(calibration_import_enabled=True), context(), db)
                await db.rollback()
            async with factory() as db:
                assert (await module.get_other_settings(context(), db)).calibration_import_enabled is False

            async with scoped.begin() as conn:
                await conn.run_sync(lambda c: migrate(c, "downgrade"))
                assert (await conn.execute(text("SELECT to_regclass('performance_other_settings')"))).scalar_one() is None
                assert (await conn.execute(text("SELECT count(*) FROM preserved_record"))).scalar_one() == 1
                await conn.run_sync(lambda c: migrate(c, "upgrade"))
                assert (await conn.execute(text("SELECT count(*) FROM performance_other_settings"))).scalar_one() == 0
                await conn.execute(text("INSERT INTO performance_other_settings (id) VALUES (1)"))
            async with factory() as db:
                assert (await module.get_other_settings(context(), db)).model_dump() == module.OtherSettingsOut().model_dump()
        finally:
            await scoped.dispose()
            async with engine.begin() as conn:
                await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            await engine.dispose()

    asyncio.run(run())
