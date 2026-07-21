from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import Field, ValidationError

import app.ai.actions as actions
import app.ai.action_audit as action_audit
import app.ai.router as ai_router
from app.ai.actions import (
    ControlledActionContext,
    ControlledActionRequest,
    ControlledActionUnavailableError,
    UnknownControlledActionError,
    consume_controlled_action,
    issue_controlled_action,
    register_controlled_action,
    selection_handle_hash,
)
from app.ai.employee_profile_actions import (
    issue_employee_profile_candidate_actions,
    register_employee_profile_controlled_actions,
)
from app.ai.employee_profile_schemas import EmployeeProfileFieldCode
from app.ai.capability_rate_limit import CapabilityRateLimitExceeded, enforce_capability_rate_limit
from app.core.config import Settings
from app.ai.router import consume_ai_controlled_action


class ExampleActionContext(ControlledActionContext):
    effective_requested_field_codes: tuple[str, ...] = Field(min_length=1)


class FakeResult:
    def __init__(self, action):
        self.action = action

    def scalar_one_or_none(self):
        return self.action


class FakeDb:
    def __init__(self):
        self.action = None
        self.flush_count = 0
        self.commit_count = 0
        self.rollback_count = 0

    def add(self, action):
        action.id = 99
        self.action = action

    async def flush(self):
        self.flush_count += 1

    async def execute(self, statement):
        return FakeResult(self.action)

    async def commit(self):
        self.commit_count += 1

    async def rollback(self):
        self.rollback_count += 1


async def _handler(context, action, user, db):
    return {
        "effective_requested_field_codes": list(context.effective_requested_field_codes),
        "action_id": action.id,
    }


@pytest.fixture(autouse=True)
def _isolated_registry(monkeypatch):
    monkeypatch.setattr(actions, "_CONTROLLED_ACTIONS", {})
    monkeypatch.setattr(
        ai_router,
        "employee_profile_rollout_decision",
        lambda *args, **kwargs: SimpleNamespace(allowed=True, failure_stage=None),
    )

    async def allow_permission(*args, **kwargs):
        return True

    monkeypatch.setattr(ai_router, "user_has_permission", allow_permission)

    async def no_rate_limit(*args, **kwargs):
        return None

    monkeypatch.setattr(ai_router, "enforce_capability_rate_limit", no_rate_limit)

    async def no_action_audit(*args, **kwargs):
        return None

    monkeypatch.setattr(ai_router, "record_controlled_action_audit", no_action_audit)
    register_controlled_action(
        action_type="employee.profile.select_candidate",
        capability_id="employee.profile.query",
        context_model=ExampleActionContext,
        handler=_handler,
    )


def _future():
    return datetime.now(timezone.utc) + timedelta(minutes=5)


def _request(handle):
    return ControlledActionRequest(
        action_type="employee.profile.select_candidate",
        selection_handle=handle,
    )


def test_request_is_strict_and_never_accepts_client_action_context():
    with pytest.raises(ValidationError):
        ControlledActionRequest.model_validate(
            {
                "action_type": "employee.profile.select_candidate",
                "selection_handle": "x" * 32,
                "field_codes": ["base_salary"],
            }
        )


def test_employee_profile_action_result_uses_shared_ai_envelope_without_internal_context():
    out = ai_router._employee_profile_action_envelope(
        {
            "status": "succeeded",
            "result_type": "employee_profile_result",
            "data": {
                "fields": [
                    {"code": "organization_name", "label": "\u6240\u5c5e\u7ec4\u7ec7", "value": "Platform"},
                    {"code": "hire_date", "label": "\u5165\u804c\u65e5\u671f", "value": "2021-01-01"},
                ]
            },
            "permission_filtered": True,
            "masking_applied": False,
        },
        conversation_id=11,
    )

    assert out.result.type == "employee_profile_result"
    assert [field.code.value for field in out.result.data.fields] == ["organization_name", "hire_date"]
    assert out.permission.filtered is True
    assert out.conversation_id == 11
    assert "employee_id" not in out.model_dump_json()


@pytest.mark.asyncio
async def test_issued_handle_is_opaque_and_only_hash_is_stored():
    db = FakeDb()
    issued = await issue_controlled_action(
        db,
        action_type="employee.profile.select_candidate",
        conversation_id=11,
        user_id=7,
        channel="web",
        action_context={"effective_requested_field_codes": ["name", "employee_no"]},
        expires_at=_future(),
    )

    assert db.action.selection_handle_hash == selection_handle_hash(issued.selection_handle)
    assert issued.selection_handle not in db.action.action_context.values()
    assert not hasattr(db.action, "selection_handle")


@pytest.mark.asyncio
async def test_consumption_binds_handle_and_runs_server_context_only():
    db = FakeDb()
    issued = await issue_controlled_action(
        db,
        action_type="employee.profile.select_candidate",
        conversation_id=11,
        user_id=7,
        channel="web",
        action_context={"effective_requested_field_codes": ["name"]},
        expires_at=_future(),
    )

    result = await consume_controlled_action(
        db,
        request=_request(issued.selection_handle),
        conversation_id=11,
        user=SimpleNamespace(id=7),
        channel="web",
    )

    assert result == {"effective_requested_field_codes": ["name"], "action_id": 99}
    assert db.action.consumed_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("conversation_id", "user_id", "channel", "expired", "consumed"),
    [
        (12, 7, "web", False, False),
        (11, 8, "web", False, False),
        (11, 7, "api", False, False),
        (11, 7, "web", True, False),
        (11, 7, "web", False, True),
    ],
)
async def test_unavailable_handles_have_uniform_failure(
    conversation_id, user_id, channel, expired, consumed
):
    db = FakeDb()
    issued = await issue_controlled_action(
        db,
        action_type="employee.profile.select_candidate",
        conversation_id=11,
        user_id=7,
        channel="web",
        action_context={"effective_requested_field_codes": ["name"]},
        expires_at=_future(),
    )
    if expired:
        db.action.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    if consumed:
        db.action.consumed_at = datetime.now(timezone.utc)

    with pytest.raises(ControlledActionUnavailableError):
        await consume_controlled_action(
            db,
            request=_request(issued.selection_handle),
            conversation_id=conversation_id,
            user=SimpleNamespace(id=user_id),
            channel=channel,
        )


@pytest.mark.asyncio
async def test_unknown_action_maps_to_bad_request_at_public_endpoint():
    db = FakeDb()
    with pytest.raises(HTTPException) as exc_info:
        await consume_ai_controlled_action(
            11,
            ControlledActionRequest(action_type="unknown.action", selection_handle="x" * 32),
            user=SimpleNamespace(id=7),
            db=db,
        )

    assert exc_info.value.status_code == 400
    assert db.rollback_count == 1


@pytest.mark.asyncio
async def test_replay_maps_to_gone_at_public_endpoint():
    db = FakeDb()
    issued = await issue_controlled_action(
        db,
        action_type="employee.profile.select_candidate",
        conversation_id=11,
        user_id=7,
        channel="web",
        action_context={"effective_requested_field_codes": ["name"]},
        expires_at=_future(),
    )
    db.action.consumed_at = datetime.now(timezone.utc)

    with pytest.raises(HTTPException) as exc_info:
        await consume_ai_controlled_action(11, _request(issued.selection_handle), user=SimpleNamespace(id=7), db=db)

    assert exc_info.value.status_code == 410
    assert db.rollback_count == 1


@pytest.mark.asyncio
async def test_unknown_action_is_rejected_before_handle_lookup():
    db = FakeDb()
    with pytest.raises(UnknownControlledActionError):
        await consume_controlled_action(
            db,
            request=ControlledActionRequest(action_type="unknown.action", selection_handle="x" * 32),
            conversation_id=11,
            user=SimpleNamespace(id=7),
            channel="web",
        )
    assert db.action is None


@pytest.mark.asyncio
async def test_employee_profile_handles_are_issued_only_for_complete_candidate_sets():
    actions._CONTROLLED_ACTIONS.clear()
    register_employee_profile_controlled_actions()
    db = FakeDb()
    issued = await issue_employee_profile_candidate_actions(
        db,
        conversation_id=11,
        user_id=7,
        channel="web",
        candidate_rows=(
            {"employee_id": 1, "full_name": "Alice"},
            {"employee_id": 2, "employment_status": "Active"},
        ),
        effective_requested_field_codes=(
            EmployeeProfileFieldCode.ORGANIZATION_NAME,
            EmployeeProfileFieldCode.HIRE_DATE,
        ),
        expires_at=_future(),
    )

    assert len(issued) == 2
    assert db.action.action_context == {
        "employee_id": 2,
        "effective_requested_field_codes": ["organization_name", "hire_date"],
    }

    incomplete = await issue_employee_profile_candidate_actions(
        FakeDb(),
        conversation_id=11,
        user_id=7,
        channel="web",
        candidate_rows=(
            {"employee_id": 1, "full_name": "Alice"},
            {"employee_id": 2},
        ),
        effective_requested_field_codes=(EmployeeProfileFieldCode.FULL_NAME,),
        expires_at=_future(),
    )
    assert incomplete == ()


@pytest.mark.asyncio
async def test_employee_profile_action_gate_rejects_before_handle_consumption(monkeypatch):
    db = FakeDb()
    issued = await issue_controlled_action(
        db,
        action_type="employee.profile.select_candidate",
        conversation_id=11,
        user_id=7,
        channel="web",
        action_context={"effective_requested_field_codes": ["name"]},
        expires_at=_future(),
    )
    monkeypatch.setattr(
        ai_router,
        "employee_profile_rollout_decision",
        lambda *args, **kwargs: SimpleNamespace(allowed=False, failure_stage="controlled_rollout_disabled"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await consume_ai_controlled_action(11, _request(issued.selection_handle), user=SimpleNamespace(id=7), db=db)

    assert exc_info.value.status_code == 403
    assert db.action.consumed_at is None


class RateLimitResult:
    def __init__(self, record):
        self.record = record

    def scalar_one_or_none(self):
        return self.record


class RateLimitDb:
    def __init__(self):
        self.records = {}

    def add(self, record):
        self.records[(record.user_id, record.capability_id)] = record

    async def execute(self, statement):
        params = statement.compile().params
        user_id = next(value for key, value in params.items() if "user_id" in key)
        capability_id = next(value for key, value in params.items() if "capability_id" in key)
        return RateLimitResult(self.records.get((user_id, capability_id)))

    async def flush(self):
        return None


@pytest.mark.asyncio
async def test_capability_rate_limit_is_shared_by_user_and_capability():
    db = RateLimitDb()
    now = datetime.now(timezone.utc)
    for _ in range(2):
        await enforce_capability_rate_limit(
            db,
            user_id=7,
            capability_id="employee.profile.query",
            max_requests=2,
            window_seconds=300,
            now=now,
        )

    with pytest.raises(CapabilityRateLimitExceeded) as exc_info:
        await enforce_capability_rate_limit(
            db,
            user_id=7,
            capability_id="employee.profile.query",
            max_requests=2,
            window_seconds=300,
            now=now,
        )
    assert exc_info.value.retry_after_seconds == 300

    await enforce_capability_rate_limit(
        db,
        user_id=7,
        capability_id="other.capability",
        max_requests=2,
        window_seconds=300,
        now=now,
    )


@pytest.mark.asyncio
async def test_web_and_feishu_share_the_same_employee_profile_rate_limit_key():
    db = RateLimitDb()
    now = datetime.now(timezone.utc)
    await enforce_capability_rate_limit(
        db,
        user_id=7,
        capability_id="employee.profile.query",
        max_requests=2,
        window_seconds=300,
        now=now,
    )  # Web request
    await enforce_capability_rate_limit(
        db,
        user_id=7,
        capability_id="employee.profile.query",
        max_requests=2,
        window_seconds=300,
        now=now,
    )  # Feishu request: channel deliberately is not part of the key

    with pytest.raises(CapabilityRateLimitExceeded):
        await enforce_capability_rate_limit(
            db,
            user_id=7,
            capability_id="employee.profile.query",
            max_requests=2,
            window_seconds=300,
            now=now,
        )
    assert Settings.model_fields["AI_CAPABILITY_RATE_LIMIT_MAX_REQUESTS"].default == 20
    assert Settings.model_fields["AI_CAPABILITY_RATE_LIMIT_WINDOW_SECONDS"].default == 300


@pytest.mark.asyncio
async def test_controlled_action_audit_never_records_handle_or_business_values(monkeypatch):
    records = []

    async def record_log(**kwargs):
        records.append(kwargs)

    monkeypatch.setattr(action_audit, "record_ai_log", record_log)
    await action_audit.record_controlled_action_audit(
        db=SimpleNamespace(),
        user=SimpleNamespace(id=7),
        action_type="employee.profile.select_candidate",
        capability_id="employee.profile.query",
        conversation_id=11,
        channel="feishu",
        status="succeeded",
    )
    record = records[0]
    assert record["request_summary"] == "controlled action"
    assert record["input_payload"] == {
        "action_type": "employee.profile.select_candidate",
        "capability_id": "employee.profile.query",
    }
    assert record["output_payload"] == {"status": "succeeded"}
    serialized = repr(record)
    for forbidden in ("selection_handle", "Alice", "E10086", "base_salary", "scope"):
        assert forbidden not in serialized


@pytest.mark.asyncio
async def test_rate_limited_action_is_not_consumed_or_dispatched(monkeypatch):
    db = FakeDb()
    issued = await issue_controlled_action(
        db,
        action_type="employee.profile.select_candidate",
        conversation_id=11,
        user_id=7,
        channel="web",
        action_context={"effective_requested_field_codes": ["name"]},
        expires_at=_future(),
    )

    async def raise_rate_limit(*args, **kwargs):
        raise CapabilityRateLimitExceeded(17)

    monkeypatch.setattr(ai_router, "enforce_capability_rate_limit", raise_rate_limit)
    with pytest.raises(HTTPException) as exc_info:
        await consume_ai_controlled_action(11, _request(issued.selection_handle), user=SimpleNamespace(id=7), db=db)

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers["Retry-After"] == "17"
    assert db.action.consumed_at is None
