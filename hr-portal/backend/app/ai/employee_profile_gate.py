"""Fail-closed controlled-rollout checks for employee profile queries."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


EMPLOYEE_PROFILE_CAPABILITY_ID = "employee.profile.query"


@dataclass(frozen=True)
class EmployeeProfileRolloutDecision:
    allowed: bool
    failure_stage: str | None = None


def _parse_allowed_user_ids(raw_value: str) -> set[int] | None:
    values = [item.strip() for item in raw_value.split(",") if item.strip()]
    if not values:
        return None
    try:
        return {int(item) for item in values}
    except ValueError:
        return None


def employee_profile_rollout_decision(settings, user_id: int, *, now: datetime | None = None) -> EmployeeProfileRolloutDecision:
    if not settings.EMPLOYEE_PROFILE_ENABLED:
        return EmployeeProfileRolloutDecision(False, "controlled_rollout_disabled")
    allowed_user_ids = _parse_allowed_user_ids(settings.EMPLOYEE_PROFILE_ALLOWED_USER_IDS)
    if allowed_user_ids is None or user_id not in allowed_user_ids:
        return EmployeeProfileRolloutDecision(False, "controlled_rollout_allowlist_denied")
    try:
        expires_at = datetime.fromisoformat(settings.EMPLOYEE_PROFILE_EXPIRES_AT.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return EmployeeProfileRolloutDecision(False, "controlled_rollout_expired")
    if expires_at.tzinfo is None:
        return EmployeeProfileRolloutDecision(False, "controlled_rollout_expired")
    current_time = now or datetime.now(timezone.utc)
    if current_time >= expires_at.astimezone(timezone.utc):
        return EmployeeProfileRolloutDecision(False, "controlled_rollout_expired")
    return EmployeeProfileRolloutDecision(True)
