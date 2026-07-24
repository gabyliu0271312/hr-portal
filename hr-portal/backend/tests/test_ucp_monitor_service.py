from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.ucp.monitor_service import get_recent_runs


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class _Session:
    def __init__(self, rows):
        self.rows = rows

    async def execute(self, _statement):
        return _Result(self.rows)


@pytest.mark.asyncio
async def test_recent_runs_serializes_ended_at_as_finished_at():
    ended_at = datetime(2026, 7, 24, 15, 0, tzinfo=UTC)
    row = SimpleNamespace(
        id=1,
        pipeline_run_id="run-1",
        pipeline_code="PENDING_HIRE_OFFER_ENRICHMENT",
        resource_id=6,
        system_id=1,
        status="SUCCESS",
        trigger_type="MANUAL",
        triggered_by="admin",
        duration_ms=100,
        created_at=ended_at,
        started_at=ended_at,
        ended_at=ended_at,
    )

    result = await get_recent_runs(_Session([row]), limit=5)

    assert result[0]["finished_at"] == ended_at.isoformat()