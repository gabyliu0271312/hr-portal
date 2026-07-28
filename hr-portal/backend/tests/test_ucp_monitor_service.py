from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.ucp.monitor_service import get_alerts, get_recent_runs


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class _AlertSession:
    def __init__(self, responses):
        self.responses = iter(responses)

    async def execute(self, _statement):
        return _Result(next(self.responses))


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


@pytest.mark.asyncio
async def test_alerts_include_pending_legacy_migrations_and_failed_webhook_events():
    now = datetime(2026, 7, 25, 10, 0, tzinfo=UTC)
    legacy_trigger = SimpleNamespace(
        trigger_code="LEGACY_OFFBOARDING",
        updated_at=now,
    )
    failed_event = SimpleNamespace(
        event_id="webhook-event-1",
        error_code="SCHEMA_VALIDATION_FAILED",
        error_message=None,
        received_at=now,
    )
    rejected_attempts = [
        SimpleNamespace(reason_code="SIGNATURE_INVALID"),
        SimpleNamespace(reason_code="SIGNATURE_INVALID"),
        SimpleNamespace(reason_code="SIGNATURE_INVALID"),
    ]

    result = await get_alerts(
        _AlertSession([
            [],
            [],
            [],
            [legacy_trigger],
            [failed_event],
            rejected_attempts,
        ])
    )

    assert {alert["type"] for alert in result} == {
        "LEGACY_TRIGGER_MIGRATION",
        "WEBHOOK_EVENT_FAILED",
        "WEBHOOK_INGRESS_REJECTED",
    }
    assert result[0]["ref_id"] == "LEGACY_OFFBOARDING"
