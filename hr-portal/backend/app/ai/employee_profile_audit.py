"""Minimal audit projection for deterministic employee-profile queries."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.audit import AiAuditTimer, record_ai_log
from app.users.models import User


async def record_employee_profile_query_audit(
    *,
    db: AsyncSession,
    user: User,
    lookup_type: str | None,
    status: str,
    result_type: str | None,
    returned_field_codes: Iterable[str] = (),
    candidate_count: int = 0,
    scope_filter_applied: bool | None = None,
    scope_filter_restrictive: bool | None = None,
    masking_applied: bool = False,
    conversation_id: int | None = None,
    failure_stage: str | None = None,
    timer: AiAuditTimer | None = None,
    record_log: Callable[..., Awaitable[None]] = record_ai_log,
) -> None:
    metadata = {
        "capability_id": "employee.profile.query",
        "lookup_type": lookup_type,
        "result_type": result_type,
        "returned_field_codes": list(returned_field_codes),
        "candidate_count": candidate_count,
        "scope_filter_applied": scope_filter_applied,
        "scope_filter_restrictive": scope_filter_restrictive,
        "scope_resolution_status": "resolved" if scope_filter_applied else None,
        "masking_applied": masking_applied,
        "channel": "web",
        "conversation_id": conversation_id,
    }
    if failure_stage is not None:
        metadata["failure_stage"] = failure_stage
    input_payload = (
        {"capability_id": "employee.profile.query", "failure_stage": failure_stage}
        if failure_stage is not None
        else {"lookup_type": lookup_type}
    )
    await record_log(
        db=db,
        user=user,
        action="employee_profile_query",
        request_summary="employee_profile_query",
        response_summary=None,
        input_payload=input_payload,
        output_payload={"status": status, "result_type": result_type, "returned_field_codes": list(returned_field_codes)},
        status=status,
        metadata=metadata,
        timer=timer,
    )
