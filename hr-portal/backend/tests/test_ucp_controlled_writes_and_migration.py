from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.ucp import migration_assistant, write_operation_service


@pytest.mark.asyncio
async def test_controlled_write_rejects_secret_in_preview():
    with pytest.raises(write_operation_service.WriteOperationError, match="must not contain"):
        await write_operation_service.submit_controlled_write(
            AsyncMock(),
            adapter_code="TEST_WRITE",
            credential_code="CRED_TEST",
            action="CREATE",
            idempotency_key="write-key-0001",
            request_preview={"name": "example", "access_token": "not-allowed"},
            approvers=[{"user_id": "admin"}],
        )


@pytest.mark.asyncio
async def test_controlled_write_deduplicates_same_idempotency_key(monkeypatch):
    existing = SimpleNamespace(id=12)
    scalar_result = SimpleNamespace(scalar_one_or_none=lambda: existing)
    db = AsyncMock()
    db.execute.return_value = scalar_result
    monkeypatch.setattr(
        write_operation_service,
        "request_to_dict",
        lambda request, include_steps: {"id": request.id},
    )

    result = await write_operation_service.submit_controlled_write(
        db,
        adapter_code="TEST_WRITE",
        credential_code="CRED_TEST",
        action="CREATE",
        idempotency_key="write-key-0001",
        request_preview={"name": "example"},
        approvers=[{"user_id": "admin"}],
    )

    assert result == {"id": 12, "deduplicated": True}


@pytest.mark.asyncio
async def test_controlled_write_executes_with_resolved_credential_only(monkeypatch):
    request = SimpleNamespace(
        action_payload={
            "adapter_code": "TEST_WRITE",
            "credential_code": "CRED_TEST",
            "request_preview": {"name": "example"},
        }
    )
    received = {}

    async def execute_approved_request(db, request_id, confirmation_token, executor):
        await executor(request)
        return request

    async def adapter(params, secrets, db):
        received.update(params=params, secrets=secrets)
        return SimpleNamespace(status="success", error_message=None, error_code=None)

    monkeypatch.setattr(write_operation_service, "execute_approved_request", execute_approved_request)
    monkeypatch.setattr(write_operation_service, "get_adapter", lambda code: adapter)
    monkeypatch.setattr(
        write_operation_service,
        "decrypt_credential_secrets_by_code",
        AsyncMock(return_value={"api_key": "resolved-secret"}),
    )
    monkeypatch.setattr(write_operation_service, "request_to_dict", lambda request, include_steps: {"executed": True})

    result = await write_operation_service.execute_controlled_write(
        AsyncMock(), request_id=12, confirmation_token="token"
    )

    assert result == {"executed": True}
    assert received == {"params": {"name": "example"}, "secrets": {"api_key": "resolved-secret"}}


@pytest.mark.asyncio
async def test_migration_persists_target_before_publish(monkeypatch):
    resource = SimpleNamespace(id=7, resource_code="legacy-resource", adapter_code="LEGACY")
    change = SimpleNamespace(id=19, after_snapshot=None, status="PENDING_APPROVAL")
    db = AsyncMock()
    db.get.side_effect = [resource, change]
    monkeypatch.setattr(migration_assistant, "create_change", AsyncMock(return_value={"id": 19}))

    result = await migration_assistant.create_migration_change(db, 7, "MODERN")

    assert result["target_adapter_code"] == "MODERN"
    assert result["status"] == "DRAFT"
    assert change.status == "DRAFT"
    assert change.after_snapshot == {"adapter_code": "MODERN"}
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_migration_publish_uses_persisted_target(monkeypatch):
    change = SimpleNamespace(
        change_type="RESOURCE",
        status="APPROVED",
        change_target_id=7,
        after_snapshot={"adapter_code": "MODERN"},
    )
    resource = SimpleNamespace(adapter_code="LEGACY")
    db = AsyncMock()
    db.get.side_effect = [change, resource]
    update = AsyncMock(return_value={"status": "PUBLISHED"})
    monkeypatch.setattr("app.ucp.change_service.update_change_status", update)

    result = await migration_assistant.publish_migration(db, 19)

    assert result == {"status": "PUBLISHED"}
    assert resource.adapter_code == "MODERN"
    update.assert_awaited_once_with(db, 19, "PUBLISHED")
