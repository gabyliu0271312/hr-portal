import asyncio
import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings


def test_actual_migration_upgrade_downgrade_and_existing_user_preservation():
    if settings.APP_ENV.lower() == "prod" or settings.DB_HOST not in ("localhost", "127.0.0.1", "::1"):
        pytest.skip("requires local non-production PostgreSQL")
    asyncio.run(_scenario())


async def _scenario():
    schema = "pm_t008_migration_" + uuid4().hex
    admin = create_async_engine(settings.db_url_async, poolclass=NullPool)
    engine = None
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0280_app_identity_switch.py"
    spec = importlib.util.spec_from_file_location("identity_switch_migration_under_test", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0279_performance_live_guard"
    try:
        async with admin.begin() as db:
            await db.execute(text(f'CREATE SCHEMA "{schema}"'))
        engine = create_async_engine(settings.db_url_async, poolclass=NullPool, connect_args={"server_settings": {"search_path": schema}})
        async with engine.begin() as db:
            await db.execute(text("CREATE TABLE users (id bigint PRIMARY KEY, login_name text UNIQUE NOT NULL)"))
            await db.execute(text("INSERT INTO users VALUES (23, 'admin')"))
        def apply(connection, operation):
            with Operations.context(MigrationContext.configure(connection)):
                operation()
        async with engine.begin() as db:
            await db.run_sync(lambda connection: apply(connection, migration.upgrade))
            row = (await db.execute(text("SELECT admin_operator_user_id, others_enabled, generation, revision, test_delivery_enabled FROM app_identity_switch_settings"))).one()
            assert tuple(row) == (23, False, 0, 1, False)
            assert await db.scalar(text("SELECT count(*) FROM app_identity_switch_sessions")) == 0
            assert await db.scalar(text("SELECT count(*) FROM app_identity_switch_notification_runs")) == 0
        async with engine.begin() as db:
            await db.run_sync(lambda connection: apply(connection, migration.downgrade))
            assert await db.scalar(text("SELECT count(*) FROM users WHERE id=23")) == 1
            assert await db.scalar(text("SELECT to_regclass('app_identity_switch_settings')")) is None
        async with engine.begin() as db:
            await db.run_sync(lambda connection: apply(connection, migration.upgrade))
            assert await db.scalar(text("SELECT admin_operator_user_id FROM app_identity_switch_settings")) == 23
        # A failed transaction must not partially clear settings.
        with pytest.raises(RuntimeError):
            async with engine.begin() as db:
                await db.execute(text("UPDATE app_identity_switch_settings SET others_enabled=true"))
                raise RuntimeError("injected failure")
        async with engine.connect() as db:
            assert await db.scalar(text("SELECT others_enabled FROM app_identity_switch_settings")) is False
    finally:
        if engine:
            await engine.dispose()
        async with admin.begin() as db:
            await db.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin.dispose()
