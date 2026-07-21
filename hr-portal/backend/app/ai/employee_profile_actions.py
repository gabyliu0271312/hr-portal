"""Controlled candidate-selection action registration for employee profiles."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.actions import (
    ControlledActionContext,
    IssuedControlledAction,
    issue_controlled_action,
    register_controlled_action,
)
from app.ai.employee_profile_schemas import (
    EMPLOYEE_PROFILE_FIELD_LABELS,
    EmployeeProfileField,
    EmployeeProfileFieldCode,
    EmployeeProfileResultData,
    EmployeeProfileSelectCandidateActionContext,
)
from app.ai.employee_profile_service import EmployeeProfileQueryService
from app.ai.models import AiControlledAction
from app.users.models import User

EMPLOYEE_PROFILE_SELECT_CANDIDATE_ACTION = "employee.profile.select_candidate"
EMPLOYEE_PROFILE_CAPABILITY_ID = "employee.profile.query"


async def handle_employee_profile_select_candidate(
    context: ControlledActionContext,
    action: AiControlledAction,
    user: User,
    db: AsyncSession,
) -> dict[str, Any]:
    if not isinstance(context, EmployeeProfileSelectCandidateActionContext):
        raise TypeError("employee profile action context is invalid")
    result = await EmployeeProfileQueryService().query_selected_employee(
        employee_id=context.employee_id,
        effective_requested_field_codes=context.effective_requested_field_codes,
        user=user,
        db=db,
    )
    if result.match_kind != "unique":
        return {"status": "failed", "reason_code": "no_viewable_match"}
    fields = EmployeeProfileResultData(
        fields=[
            EmployeeProfileField(
                code=field_code,
                label=EMPLOYEE_PROFILE_FIELD_LABELS[field_code],
                value=str(result.rows[0][field_code.value]),
            )
            for field_code in result.effective_requested_field_codes
        ]
    )
    return {
        "status": "succeeded",
        "result_type": "employee_profile_result",
        "data": fields.model_dump(mode="json"),
        "permission_filtered": result.permission_filtered,
        "masking_applied": result.masking_applied,
    }


async def issue_employee_profile_candidate_actions(
    db: AsyncSession,
    *,
    conversation_id: int,
    user_id: int,
    channel: str,
    candidate_rows: Sequence[Mapping[str, Any]],
    effective_requested_field_codes: tuple[EmployeeProfileFieldCode, ...],
    expires_at: datetime,
) -> tuple[IssuedControlledAction, ...]:
    """Issue handles only for a complete, already-adjudicated candidate collection."""
    if not 2 <= len(candidate_rows) <= 5:
        return ()
    required_display_codes = {"full_name", "organization_name", "employment_status"}
    if any(
        not isinstance(row.get("employee_id"), int)
        or row["employee_id"] < 1
        or not any(code in row for code in required_display_codes)
        for row in candidate_rows
    ):
        return ()
    issued_actions: list[IssuedControlledAction] = []
    for row in candidate_rows:
        issued_actions.append(
            await issue_controlled_action(
            db,
            action_type=EMPLOYEE_PROFILE_SELECT_CANDIDATE_ACTION,
            conversation_id=conversation_id,
            user_id=user_id,
            channel=channel,
            action_context=EmployeeProfileSelectCandidateActionContext(
                employee_id=row["employee_id"],
                effective_requested_field_codes=effective_requested_field_codes,
            ),
            expires_at=expires_at,
            )
        )
    return tuple(issued_actions)


def register_employee_profile_controlled_actions() -> None:
    register_controlled_action(
        action_type=EMPLOYEE_PROFILE_SELECT_CANDIDATE_ACTION,
        capability_id=EMPLOYEE_PROFILE_CAPABILITY_ID,
        context_model=EmployeeProfileSelectCandidateActionContext,
        handler=handle_employee_profile_select_candidate,
    )
