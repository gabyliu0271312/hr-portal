"""Approval-first, idempotent submission for high-risk connector writes."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.approval_service import request_to_dict, submit_request
from app.ucp.approval_service import execute_approved_request
from app.ucp.adapters import get_adapter
from app.ucp.credential_service import decrypt_credential_secrets_by_code
from app.ucp.models import ApprovalRequest


class WriteOperationError(ValueError):
    pass


_SENSITIVE_KEYWORDS = ("secret", "token", "password", "authorization", "cookie", "api_key", "apikey")


def _contains_secret(value: Any) -> bool:
    if isinstance(value, dict):
        return any(
            any(keyword in str(key).lower() for keyword in _SENSITIVE_KEYWORDS) or _contains_secret(item)
            for key, item in value.items()
        )
    if isinstance(value, list):
        return any(_contains_secret(item) for item in value)
    return False


async def submit_controlled_write(db: AsyncSession, *, adapter_code: str, credential_code: str, action: str, idempotency_key: str, request_preview: dict[str, Any], approvers: list[dict[str, str]], operator: str | None = None) -> dict:
    if not adapter_code or not credential_code or not action or not idempotency_key or not approvers:
        raise WriteOperationError("adapter_code, credential_code, action, idempotency_key and approvers are required")
    if _contains_secret(request_preview):
        raise WriteOperationError("request_preview must not contain credentials or secrets")
    existing = (await db.execute(select(ApprovalRequest).where(ApprovalRequest.business_type == "UCP_WRITE", ApprovalRequest.business_key == idempotency_key))).scalar_one_or_none()
    if existing:
        result = request_to_dict(existing, include_steps=True)
        result["deduplicated"] = True
        return result
    request = await submit_request(
        db, business_type="UCP_WRITE", business_key=idempotency_key, action=action, approvers=approvers,
        action_payload={"adapter_code": adapter_code, "credential_code": credential_code, "request_preview": request_preview},
        business_summary=f"受控写操作 {adapter_code}/{action}", confirmation_type="TOKEN", triggered_by=operator,
    )
    result = request_to_dict(request, include_steps=True)
    result["deduplicated"] = False
    return result


async def execute_controlled_write(db: AsyncSession, *, request_id: int, confirmation_token: str | None = None) -> dict:
    async def executor(request: ApprovalRequest) -> None:
        payload = request.action_payload or {}
        adapter = get_adapter(str(payload.get("adapter_code") or ""))
        preview = payload.get("request_preview")
        if not isinstance(preview, dict):
            raise WriteOperationError("request preview is missing")
        credential_code = payload.get("credential_code")
        if not isinstance(credential_code, str) or not credential_code:
            raise WriteOperationError("credential reference is missing")
        secrets = await decrypt_credential_secrets_by_code(db, credential_code)
        result = await adapter(preview, secrets, db)
        if result.status not in {"success", "partial_success"}:
            raise WriteOperationError(result.error_message or result.error_code or "adapter execution failed")
    request = await execute_approved_request(db, request_id=request_id, confirmation_token=confirmation_token, executor=executor)
    return request_to_dict(request, include_steps=True)
