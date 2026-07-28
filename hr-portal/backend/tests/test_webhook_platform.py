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
    with pytest.raises(DuplicateEventError):
        await receive_event(Session(), event_id="vendor-event-1", event_type="employee.terminated", source="WEBHOOK", payload={})
