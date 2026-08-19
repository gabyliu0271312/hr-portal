import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select, text

from app.core.db import get_session_factory
from app.warehouse.models import WarehouseQualityRule, WarehouseQualityRun, WarehouseQualityStatus
from app.warehouse.quality_service import run_quality_rule, upsert_quality_status


async def _require_postgres():
    try:
        async with get_session_factory()() as db:
            await db.execute(select(1))
            has_sequence_column = await db.scalar(text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'warehouse_quality_status' "
                "AND column_name = 'source_sync_sequence'"
            ))
            if not has_sequence_column:
                pytest.skip(
                    "PostgreSQL integration test requires migration "
                    "0194_quality_status_batch_sequence"
                )
    except Exception as exc:
        pytest.skip(f"PostgreSQL integration test requires an available database: {exc}")


@pytest.mark.asyncio
async def test_quality_status_upsert_is_safe_across_two_postgres_workers():
    await _require_postgres()
    asset_code = f"test_quality_status_{uuid4().hex}"
    start = asyncio.Event()

    async def worker():
        async with get_session_factory()() as db:
            await start.wait()
            await upsert_quality_status(
                db,
                asset_type="table",
                asset_code=asset_code,
                period="202607",
                status="passed",
                source_sync_batch_id="sync_run:42",
            )
            await db.commit()

    try:
        workers = [asyncio.create_task(worker()) for _ in range(2)]
        start.set()
        await asyncio.gather(*workers)
        async with get_session_factory()() as db:
            count = await db.scalar(select(func.count()).select_from(WarehouseQualityStatus).where(
                WarehouseQualityStatus.asset_type == "table",
                WarehouseQualityStatus.asset_key == f"code:{asset_code}",
                WarehouseQualityStatus.period == "202607",
            ))
        assert count == 1
    finally:
        async with get_session_factory()() as db:
            await db.execute(delete(WarehouseQualityStatus).where(
                WarehouseQualityStatus.asset_type == "table",
                WarehouseQualityStatus.asset_key == f"code:{asset_code}",
            ))
            await db.commit()


@pytest.mark.asyncio
async def test_quality_run_is_single_flight_across_two_postgres_workers(monkeypatch):
    await _require_postgres()
    asset_code = f"test_quality_run_{uuid4().hex}"
    batch_id = f"sync_run:{uuid4().int % 1_000_000}"
    async with get_session_factory()() as db:
        rule = WarehouseQualityRule(
            asset_type="table",
            asset_code=asset_code,
            rule_type="not_null",
            rule_config={"column": "employee_no"},
            severity="warn",
        )
        db.add(rule)
        await db.commit()
        rule_id = rule.id

    engine_calls = 0

    async def slow_quality_rule(*args, **kwargs):
        nonlocal engine_calls
        engine_calls += 1
        await asyncio.sleep(0.1)
        return {
            "status": "pass",
            "checked_count": 1,
            "failed_count": 0,
            "sample_key_hashes": [],
            "message": "ok",
        }

    monkeypatch.setattr("app.warehouse.quality_service.execute_quality_rule", slow_quality_rule)
    start = asyncio.Event()

    async def worker():
        async with get_session_factory()() as db:
            await start.wait()
            run, _ = await run_quality_rule(
                db,
                rule_id,
                source_sync_batch_id=batch_id,
                user=None,
            )
            await db.commit()
            return run.id

    try:
        workers = [asyncio.create_task(worker()) for _ in range(2)]
        start.set()
        run_ids = await asyncio.gather(*workers)
        assert engine_calls == 1
        assert run_ids[0] == run_ids[1]
        async with get_session_factory()() as db:
            count = await db.scalar(select(func.count()).select_from(WarehouseQualityRun).where(
                WarehouseQualityRun.dedupe_key == f"{rule_id}::{batch_id}",
            ))
        assert count == 1
    finally:
        async with get_session_factory()() as db:
            await db.execute(delete(WarehouseQualityRun).where(WarehouseQualityRun.rule_id == rule_id))
            await db.execute(delete(WarehouseQualityStatus).where(
                WarehouseQualityStatus.asset_type == "table",
                WarehouseQualityStatus.asset_key == f"code:{asset_code}",
            ))
            await db.execute(delete(WarehouseQualityRule).where(WarehouseQualityRule.id == rule_id))
            await db.commit()
