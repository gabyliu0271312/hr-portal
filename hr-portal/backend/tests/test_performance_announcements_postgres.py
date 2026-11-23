import asyncio
import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings

pytestmark = pytest.mark.postgres_acceptance


@pytest.mark.asyncio
async def test_announcement_migration_legacy_roles_concurrent_ack_and_lossless_downgrade():
    schema = "announcement_test_" + uuid4().hex
    engine = create_async_engine(settings.db_url_async)
    module_path = Path(__file__).resolve().parents[1] / "alembic/versions/0323_pm_workbench_announcements.py"
    spec = importlib.util.spec_from_file_location("announcement_migration", module_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    def run_migration(connection, action):
        with Operations.context(MigrationContext.configure(connection)):
            getattr(migration, action)()

    try:
        async with engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            await connection.execute(text("CREATE TABLE performance_cycles (cycle_ref varchar(64) PRIMARY KEY)"))
            await connection.execute(text("""CREATE TABLE performance_workbench_announcements (
                id bigint PRIMARY KEY, visibility varchar(128) NOT NULL, visibility_role varchar(32))"""))
            await connection.execute(text("INSERT INTO performance_cycles VALUES ('A'), ('B')"))
            await connection.execute(text("""INSERT INTO performance_workbench_announcements VALUES
                (1, '指定人员', 'HRBP'), (2, '指定人员', 'REAL_LINE_MANAGER'), (3, '所有人', NULL)"""))
            await connection.run_sync(run_migration, "upgrade")
            rows = (await connection.execute(text("SELECT visibility, visibility_roles FROM performance_workbench_announcements ORDER BY id"))).all()
            assert rows == [("指定角色", ["HRBP"]), ("指定角色", ["REAL_LINE_MANAGER"]), ("所有人", [])]
            assert not (await connection.execute(text("SELECT 1 FROM information_schema.columns WHERE table_schema=:schema AND table_name='performance_workbench_announcements' AND column_name='visibility_role'"), {"schema": schema})).first()

        async def acknowledge(cycle_ref):
            async with engine.begin() as connection:
                await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                await connection.execute(text("""INSERT INTO performance_announcement_acknowledgements (announcement_id, employee_no, cycle_ref)
                    VALUES (1, 'EMPLOYEE', :cycle_ref) ON CONFLICT ON CONSTRAINT uq_performance_announcement_ack DO NOTHING"""), {"cycle_ref": cycle_ref})

        await asyncio.gather(acknowledge("A"), acknowledge("A"))
        await acknowledge("B")
        async with engine.begin() as connection:
            await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            assert (await connection.execute(text("SELECT count(*) FROM performance_announcement_acknowledgements"))).scalar() == 2
            transaction = await connection.begin_nested()
            with pytest.raises(RuntimeError, match="ANNOUNCEMENT_DOWNGRADE_WOULD_LOSE_DATA"):
                await connection.run_sync(run_migration, "downgrade")
            await transaction.rollback()
            assert (await connection.execute(text("SELECT count(*) FROM performance_announcement_acknowledgements"))).scalar() == 2
            await connection.execute(text("DELETE FROM performance_workbench_announcements WHERE id=1"))
            assert (await connection.execute(text("SELECT count(*) FROM performance_announcement_acknowledgements"))).scalar() == 0
            await connection.run_sync(run_migration, "downgrade")
            assert (await connection.execute(text("SELECT visibility, visibility_role FROM performance_workbench_announcements WHERE id=2"))).one() == ("指定人员", "REAL_LINE_MANAGER")
    finally:
        async with engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await engine.dispose()
