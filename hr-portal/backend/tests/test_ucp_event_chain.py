"""X0212 regression coverage for the event-to-pipeline execution chain."""

import inspect
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_process_event_continues_after_one_trigger_fails(monkeypatch):
    import app.ucp.event_bus as event_bus

    first = SimpleNamespace(trigger_code="TRIGGER_BAD")
    second = SimpleNamespace(trigger_code="TRIGGER_GOOD")
    event = SimpleNamespace(
        status=None,
        error_code=None,
        error_message=None,
        dispatched_at=None,
        completed_at=None,
    )
    db = SimpleNamespace(flush=AsyncMock())
    dispatched = []

    async def fake_match_triggers(_db, _event):
        return [first, second]

    async def fake_dispatch(_db, _event, trigger):
        dispatched.append(trigger.trigger_code)
        if trigger is first:
            raise event_bus.EventBusError("PIPELINE_INACTIVE", "pipeline is inactive")
        return "run_good"

    monkeypatch.setattr(event_bus, "match_triggers", fake_match_triggers)
    monkeypatch.setattr(event_bus, "dispatch_event", fake_dispatch)

    result = await event_bus.process_event_pipeline(db, event)

    assert result is event
    assert dispatched == ["TRIGGER_BAD", "TRIGGER_GOOD"]
    assert event.status == event_bus.EVENT_STATUS_DISPATCHED
    assert event.error_code is None


@pytest.mark.asyncio
async def test_process_event_marks_all_failed_dispatches_as_failed(monkeypatch):
    import app.ucp.event_bus as event_bus

    trigger = SimpleNamespace(trigger_code="TRIGGER_BAD")
    event = SimpleNamespace(
        status=None,
        error_code=None,
        error_message=None,
        dispatched_at=None,
        completed_at=None,
    )
    db = SimpleNamespace(flush=AsyncMock())

    async def fake_match_triggers(_db, _event):
        return [trigger]

    async def fake_dispatch(_db, _event, _trigger):
        raise event_bus.EventBusError("PIPELINE_INACTIVE", "pipeline is inactive")

    monkeypatch.setattr(event_bus, "match_triggers", fake_match_triggers)
    monkeypatch.setattr(event_bus, "dispatch_event", fake_dispatch)

    await event_bus.process_event_pipeline(db, event)

    assert event.status == event_bus.EVENT_STATUS_FAILED
    assert event.error_code == "PIPELINE_INACTIVE"


def test_pipeline_execution_accepts_event_trace_contract():
    from app.ucp.pipeline_engine import execute_pipeline

    params = inspect.signature(execute_pipeline).parameters
    assert "trigger_payload" in params
    assert "pipeline_run_id" in params
    assert "trace_id" in params


def test_ingest_validation_failures_do_not_retry():
    from app.ucp.event_bus import _is_retryable_pipeline_failure

    assert _is_retryable_pipeline_failure("聚合校验失败: [('202607', '000123')]") is False
    assert _is_retryable_pipeline_failure("字段白名单包含目标资产未批准的字段") is False
    assert _is_retryable_pipeline_failure("database connection reset") is True


def test_lifecycle_direct_dispatch_flag_defaults_to_compatible_mode(monkeypatch):
    from app.ucp.routers.events import _lifecycle_direct_dispatch_enabled

    monkeypatch.delenv("UCP_LIFECYCLE_DIRECT_DISPATCH_ENABLED", raising=False)
    assert _lifecycle_direct_dispatch_enabled() is True
    monkeypatch.setenv("UCP_LIFECYCLE_DIRECT_DISPATCH_ENABLED", "false")
    assert _lifecycle_direct_dispatch_enabled() is False


def test_cost_allocation_event_uses_only_canonical_trigger():
    from app.ucp.event_bus import _restrict_cost_allocation_triggers

    event = SimpleNamespace(
        event_id="webhook:4:ca-202607-period-3-v1",
        event_type="allocation_period.locked",
    )
    canonical = SimpleNamespace(trigger_code="COST_ALLOCATION_LOCKED_TRIGGER")
    duplicate = SimpleNamespace(trigger_code="COST_ALLOCATION_LOCKED_INGEST")

    assert _restrict_cost_allocation_triggers(event, [duplicate, canonical]) == [canonical]
    assert _restrict_cost_allocation_triggers(event, [duplicate]) == []
