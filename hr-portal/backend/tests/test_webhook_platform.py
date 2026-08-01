from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.ucp.routers.webhook_platform import PipelineTriggerRequest, ResourceObjectRequest


def test_event_resource_object_requires_event_definition():
    with pytest.raises(ValidationError):
        ResourceObjectRequest(object_code="OFFBOARDING", object_name="Offboarding", object_type="EVENT_TYPE")


def test_webhook_trigger_requires_event_object():
    with pytest.raises(ValidationError):
        PipelineTriggerRequest(
            trigger_code="OFFBOARDING", trigger_name="Offboarding", pipeline_template_code="OFFBOARDING_PIPELINE", trigger_type="WEBHOOK"
        )


def test_schedule_trigger_requires_cron_and_timezone():
    with pytest.raises(ValidationError):
        PipelineTriggerRequest(
            trigger_code="DAILY_SYNC", trigger_name="Daily sync", pipeline_template_code="SYNC_PIPELINE", trigger_type="SCHEDULE"
        )


@pytest.mark.asyncio
async def test_webhook_attempt_audit_never_persists_payload_data():
    from app.ucp.routers.webhook_platform import _record_ingress_attempt

    class Session:
        def __init__(self):
            self.added = []

        def add(self, value):
            self.added.append(value)

        async def flush(self):
            pass

    session = Session()
    await _record_ingress_attempt(
        session,
        resource_code="FEISHU_INGRESS",
        resource_id=10,
        outcome="REJECTED",
        reason_code="SIGNATURE_INVALID",
    )

    attempt = session.added[0]
    assert attempt.resource_code == "FEISHU_INGRESS"
    assert attempt.reason_code == "SIGNATURE_INVALID"
    assert not hasattr(attempt, "payload")


@pytest.mark.asyncio
async def test_event_object_scopes_trigger_matching():
    from app.ucp.event_bus import match_triggers

    class Result:
        def scalars(self): return self
        def all(self): return [SimpleNamespace(is_active=1, event_source="R", event_types="E", source_resource_object_id=2, source_resource_id=None, source_system_code=None, filter_rule=None)]

    class Session:
        async def execute(self, _statement): return Result()

    event = SimpleNamespace(source="R", event_type="E", resource_object_id=1, resource_id=1, system_code=None, payload={})
    assert await match_triggers(Session(), event) == []


def test_cost_allocation_sink_mapping_and_group_validation():
    from app.ucp.pipeline_engine import _apply_mapping_rules, _validate_sink_rows

    rows = [
        {"period": "2026-07", "employee_no": "E1", "allocation_percentage": "60"},
        {"period": "2026-07", "employee_no": "E1", "allocation_percentage": "40"},
    ]
    mapped = [
        _apply_mapping_rules(
            row,
            [
                {"source": "period", "target": "cost_period", "transform": "yyyy_mm_to_yyyymm"},
                {"source": "allocation_percentage", "target": "headcount", "transform": "decimal_divide_100"},
            ],
        )
        for row in rows
    ]
    _validate_sink_rows(
        mapped,
        [{"type": "group_sum_equals", "group_by": ["cost_period", "employee_no"], "sum_field": "headcount", "expected": 1, "tolerance": 0.0001}],
    )
    assert mapped[0]["cost_period"] == "202607"
    assert str(mapped[0]["headcount"]) == "0.6"


@pytest.mark.asyncio
async def test_committed_pipeline_runner_is_deferred_until_commit(monkeypatch):
    import asyncio
    import app.ucp.event_bus as event_bus

    calls = []

    async def fake_runner(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(event_bus, "_run_pipeline_in_background", fake_runner)
    session = SimpleNamespace(info={"ucp_pending_background_runs": [{"run_id": "run-1"}]})
    event_bus._start_committed_background_pipelines(session)
    await asyncio.sleep(0)
    assert calls == [{"run_id": "run-1"}]
    assert "ucp_pending_background_runs" not in session.info


@pytest.mark.asyncio
async def test_dead_letter_projects_to_ingest_batch():
    from app.ucp.event_reliability import MAX_RETRY_COUNT, mark_delivery_failed

    batch = SimpleNamespace(status="FAILED", error_summary=None, processed_at=None)
    event = SimpleNamespace(status="FAILED", error_code=None, error_message=None)

    class Result:
        def __init__(self, value):
            self.value = value

        def scalar_one_or_none(self):
            return self.value

    class Session:
        def __init__(self):
            self.calls = 0

        async def execute(self, _statement):
            self.calls += 1
            return Result(batch if self.calls == 1 else event)

        async def flush(self):
            pass

    delivery = SimpleNamespace(
        attempt=MAX_RETRY_COUNT,
        event_uuid="event-1",
        status="FAILED",
        error_code=None,
        error_message=None,
        last_retry_at=None,
        next_retry_at=None,
    )
    await mark_delivery_failed(Session(), delivery, error_code="PIPELINE_FAILED", error_message="bad rows")
    assert delivery.status == "DEAD_LETTER"
    assert batch.status == "DEAD_LETTER"
    assert batch.error_summary == "bad rows"


@pytest.mark.asyncio
async def test_legacy_trigger_migration_preserves_rollback_path():
    from app.ucp.models import UcpEventDefinition, UcpResourceDataObject
    from app.ucp.routers.webhook_platform import TriggerMigrationRequest, migrate_legacy_trigger

    trigger = SimpleNamespace(id=1, trigger_code="LEGACY", trigger_name="Legacy", pipeline_code="PIPE", trigger_type="WEBHOOK", source_resource_object_id=None, source_resource_id=None, filter_rule={}, schedule_config={}, input_schema={}, idempotency_expression=None, failure_policy="RETRY", run_as_type="SERVICE_ACCOUNT", service_account_code=None, is_active=1, webhook_path="legacy-path", legacy_webhook_path=None, migration_status="PENDING_MIGRATION", event_source="OLD", event_types="OLD")
    source = SimpleNamespace(id=9, resource_id=3, object_type="EVENT_TYPE", is_active=1, verification_status="VERIFIED", event_definition_id=7)
    definition = SimpleNamespace(id=7, status="PUBLISHED", event_code="employee.terminated")

    class Result:
        def scalar_one_or_none(self): return trigger
    class Session:
        async def execute(self, _statement): return Result()
        async def get(self, model, _id): return source if model is UcpResourceDataObject else definition if model is UcpEventDefinition else None
        async def commit(self): pass
        async def refresh(self, _item): pass

    result = await migrate_legacy_trigger("LEGACY", TriggerMigrationRequest(source_resource_object_id=9), Session(), None, None)
    assert result["migration_status"] == "MIGRATED"
    assert trigger.webhook_path is None
    assert trigger.legacy_webhook_path == "legacy-path"
    assert trigger.source_resource_object_id == 9


@pytest.mark.asyncio
async def test_legacy_trigger_migration_rollback_restores_old_callback_path():
    from app.ucp.routers.webhook_platform import rollback_legacy_trigger_migration

    trigger = SimpleNamespace(id=1, trigger_code="LEGACY", trigger_name="Legacy", pipeline_code="PIPE", trigger_type="WEBHOOK", source_resource_object_id=9, source_resource_id=3, filter_rule={}, schedule_config={}, input_schema={}, idempotency_expression=None, failure_policy="RETRY", run_as_type="SERVICE_ACCOUNT", service_account_code=None, is_active=1, webhook_path=None, legacy_webhook_path="legacy-path", migration_status="MIGRATED")
    class Result:
        def __init__(self, value): self.value = value
        def scalar_one_or_none(self): return self.value
    class Session:
        def __init__(self): self.calls = 0
        async def execute(self, _statement): self.calls += 1; return Result(trigger if self.calls == 1 else None)
        async def commit(self): pass
        async def refresh(self, _item): pass

    result = await rollback_legacy_trigger_migration("LEGACY", Session(), None, None)
    assert result["migration_status"] == "PENDING_MIGRATION"
    assert trigger.webhook_path == "legacy-path"
    assert trigger.source_resource_object_id is None


@pytest.mark.asyncio
async def test_same_external_event_id_is_deduplicated_across_callback_paths():
    from app.ucp.event_bus import DuplicateEventError, receive_event

    existing = SimpleNamespace(id=42)
    calls = 0
    class Result:
        def __init__(self, value): self.value = value
        def scalar_one_or_none(self): return self.value
    class Session:
        def add(self, _event): pass
        async def flush(self): pass
        async def execute(self, _statement):
            nonlocal calls
            calls += 1
            return Result(None if calls == 1 else existing)

    await receive_event(Session(), event_id="vendor-event-1", event_type="employee.terminated", source="WEBHOOK", payload={})


@pytest.mark.asyncio
async def test_webhook_body_reader_rejects_declared_or_streamed_oversize_body():
    from app.ucp.routers.webhook_platform import _read_webhook_body

    class Request:
        def __init__(self, headers, chunks):
            self.headers = headers
            self.chunks = chunks

        async def stream(self):
            for chunk in self.chunks:
                yield chunk

    with pytest.raises(ValueError, match="BODY_TOO_LARGE"):
        await _read_webhook_body(Request({"content-length": "11"}, [b"ignored"]), 10)
    with pytest.raises(ValueError, match="BODY_TOO_LARGE"):
        await _read_webhook_body(Request({}, [b"12345", b"67890", b"1"]), 10)


@pytest.mark.asyncio
async def test_webhook_body_reader_keeps_raw_signed_bytes():
    from app.ucp.routers.webhook_platform import _read_webhook_body

    class Request:
        headers = {}

        async def stream(self):
            yield b'{"request_id":'
            yield b'"req-1"}'

    assert await _read_webhook_body(Request(), 1024) == b'{"request_id":"req-1"}'


def test_webhook_responses_expose_external_request_id_only():
    from app.ucp.routers.webhook_platform import _webhook_response

    assert _webhook_response("request-1", status="RECEIVED", trace_id="trace-1") == {
        "accepted": True,
        "event_id": "request-1",
        "status": "RECEIVED",
        "trace_id": "trace-1",
    }
    assert _webhook_response("request-1", status="SUCCEEDED", trace_id="trace-1", deduplicated=True)["deduplicated"] is True
