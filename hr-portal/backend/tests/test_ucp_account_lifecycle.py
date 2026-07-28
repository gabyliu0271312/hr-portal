import pytest
from app.ucp.account_lifecycle_service import LifecycleError, _map_fields, _matches_filter
from app.seed import _lifecycle_pipeline_trigger_defaults
from app.ucp.pipeline_engine import _execute_time_strategy_step


def test_lifecycle_trigger_seed_defines_only_manual_compensation():
    triggers = {item["trigger_code"]: item for item in _lifecycle_pipeline_trigger_defaults()}

    assert triggers["OFFBOARDING_MANUAL_COMPENSATION"]["trigger_type"] == "MANUAL"
    assert "OFFBOARDING_SCHEDULED_COMPENSATION" not in triggers
    assert "PENDING_HIRE_OFFER_SCHEDULE" not in triggers


def test_lifecycle_trigger_seed_has_no_schedule_defaults():
    triggers = _lifecycle_pipeline_trigger_defaults()
    scheduled = [item for item in triggers if item["trigger_type"] == "SCHEDULE"]

    assert scheduled == []


def test_scheduler_accepts_the_shared_six_hour_schedule_option():
    from app.scheduler.schedule_parser import parse_schedule

    trigger = parse_schedule("每 6 小时")

    assert trigger is not None


def test_offboarding_time_strategy_requires_and_exposes_effective_time():
    class Context:
        def get(self, key, default=None):
            return {"termination_effective_at": "2026-07-25T10:00:00Z"} if key == "event" else default

    result = _execute_time_strategy_step({"effective_time_field": "termination_effective_at"}, Context())

    assert result["delegated_to"] == "ACCOUNT_LIFECYCLE_RULE"
    assert result["effective_at"] == "2026-07-25T10:00:00Z"


def test_map_fields_supports_json_paths_and_defaults():
    payload = {"employee": {"id": "EMP-001", "name": "Ada"}}
    mapped = _map_fields(payload, {
        "employee_id": "$.employee.id",
        "employee_name": {"path": "employee.name"},
        "department": {"default": "HQ"},
    })
    assert mapped == {"employee_id": "EMP-001", "employee_name": "Ada", "department": "HQ"}


def test_filter_rule_matches_supported_operators():
    payload = {"employee": {"status": "OFFBOARD", "tags": ["finance"]}}
    assert _matches_filter(payload, {"path": "$.employee.status", "op": "eq", "value": "OFFBOARD"})
    assert _matches_filter(payload, {"path": "employee.tags", "op": "contains", "value": "finance"})
    assert not _matches_filter(payload, {"path": "employee.status", "op": "eq", "value": "ACTIVE"})


def test_lifecycle_error_exposes_machine_readable_code():
    error = LifecycleError("DELETE_GUARD_REQUIRED", "delete requires a guard")
    assert error.code == "DELETE_GUARD_REQUIRED"
    assert str(error) == "delete requires a guard"


def test_termination_effective_at_uses_source_payload_time_not_receive_time():
    from datetime import datetime, timezone
    from app.ucp.account_lifecycle_service import _termination_effective_at

    event = type("Event", (), {"payload": {"termination_effective_at": "2026-07-30T09:00:00+08:00"}})()
    assert _termination_effective_at(event, {}) == datetime(2026, 7, 30, 1, 0, tzinfo=timezone.utc)


def test_termination_effective_at_fails_closed_when_missing():
    from app.ucp.account_lifecycle_service import _termination_effective_at

    event = type("Event", (), {"payload": {}})()
    try:
        _termination_effective_at(event, {})
    except LifecycleError as error:
        assert error.code == "MISSING_EFFECTIVE_TIME"
    else:
        raise AssertionError("missing termination effective time must be rejected")


@pytest.mark.asyncio
async def test_cancel_job_only_allows_unexecuted_jobs():
    from app.ucp.account_lifecycle_service import cancel_job
    job = type("Job", (), {"id": 1, "rule_id": 2, "account_id": None, "event_id": None, "job_code": "job", "status": "PENDING", "scheduled_at": None, "action": "DISABLE", "idempotency_key": "key", "retry_count": 0, "last_error_code": None, "last_error_message": None, "payload_snapshot": {}, "created_at": None, "updated_at": None, "executed_at": None})()
    class Result:
        def scalar_one_or_none(self): return job
    class Db:
        async def execute(self, _statement): return Result()
        async def flush(self): pass
    assert (await cancel_job(Db(), "job"))["status"] == "CANCELLED"
