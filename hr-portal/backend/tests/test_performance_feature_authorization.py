from pathlib import Path

import pytest

from app.performance.authorization_service import (
    CYCLE_STATUS_ACTIVE,
    NODE_STATUS_OPEN,
    OBJECT_ACTION_APPEAL_HANDLE,
    OBJECT_ACTION_CALIBRATE,
    OBJECT_ACTION_MANAGER_REVIEW,
    OBJECT_ACTION_WORK_SUMMARY_READ,
    OBJECT_ACTION_RESULT_READ,
    OBJECT_ACTION_REVIEW_360,
    OBJECT_ACTION_SELF_SUBMIT,
    ObjectAuthorizationRequest,
    evaluate_object_authorization,
)
from app.performance.feature_authorization import PerformanceFeatureAuthorizationService
from app.performance.models import (
    DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
    DYNAMIC_ASSIGNMENT_ACTOR_TYPE_PERFORMANCE_ROLE,
    DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
    DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
    DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
    DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
)
from app.performance.snapshot_service import (
    DynamicIdentityInput,
    RosterAuthorizationInput,
    build_snapshot_people,
    resolve_identity_scopes,
)


class _AuthorizationRecorder:
    def __init__(self):
        self.requests = []
        self.dynamic_requests = []

    async def authorize(self, request):
        self.requests.append(request)

    async def authorize_dynamic_scope(self, **kwargs):
        self.dynamic_requests.append(kwargs)


class _AuditRecorder:
    def __init__(self):
        self.events = []

    def append_event(self, event):
        self.events.append(event)


class _Db:
    def __init__(self):
        self.commits = 0

    async def commit(self):
        self.commits += 1


def _request(action=OBJECT_ACTION_WORK_SUMMARY_READ, *, actor_ref="300"):
    return ObjectAuthorizationRequest(
        cycle_ref="PM-T05-TEST",
        employee_no="300",
        actor_type="EMPLOYEE",
        actor_ref=actor_ref,
        action=action,
        cycle_status=CYCLE_STATUS_ACTIVE,
        node_status=NODE_STATUS_OPEN,
        record_status="READY",
    )


@pytest.mark.asyncio
async def test_feature_facade_routes_business_actions_through_object_authorization():
    db = _Db()
    authorization = _AuthorizationRecorder()
    feature = PerformanceFeatureAuthorizationService(
        db,
        object_authorization=authorization,
        audit=_AuditRecorder(),
    )

    await feature.authorize_self_submission(_request())
    await feature.authorize_manager_review(_request(actor_ref="200"))
    await feature.authorize_360_review(_request(actor_ref="700"))
    await feature.authorize_appeal_handling(_request(actor_ref="800"))
    await feature.authorize_result_view(_request(actor_ref="100"))
    await feature.authorize_project_administration(
        cycle_ref="PM-T05-TEST",
        actor_type="EMPLOYEE",
        actor_ref="900",
        project_ref="PROJECT-1",
        cycle_status=CYCLE_STATUS_ACTIVE,
        node_status=NODE_STATUS_OPEN,
        record_status="READY",
    )

    assert [request.action for request in authorization.requests] == [
        OBJECT_ACTION_SELF_SUBMIT,
        OBJECT_ACTION_MANAGER_REVIEW,
        OBJECT_ACTION_REVIEW_360,
        OBJECT_ACTION_APPEAL_HANDLE,
        OBJECT_ACTION_RESULT_READ,
    ]
    assert authorization.dynamic_requests == [
        {
            "cycle_ref": "PM-T05-TEST",
            "actor_type": "EMPLOYEE",
            "actor_ref": "900",
            "identity_type": "PROJECT_ADMIN",
            "target_type": "PROJECT",
            "target_ref": "PROJECT-1",
            "action": "PROJECT_ADMIN",
            "cycle_status": CYCLE_STATUS_ACTIVE,
            "node_status": NODE_STATUS_OPEN,
            "record_status": "READY",
        }
    ]


@pytest.mark.asyncio
async def test_calibration_adjustment_is_authorized_and_audited():
    db = _Db()
    authorization = _AuthorizationRecorder()
    audit = _AuditRecorder()
    feature = PerformanceFeatureAuthorizationService(
        db,
        object_authorization=authorization,
        audit=audit,
    )

    await feature.record_calibration_adjustment(
        _request(actor_ref="500"),
        before_state={"score": 80, "grade": "B"},
        after_state={"score": 90, "grade": "A"},
        calibration_group_ref="GROUP-1",
    )

    assert authorization.requests[0].action == OBJECT_ACTION_CALIBRATE
    assert db.commits == 1
    assert audit.events[0].event_type == "CALIBRATION_ADJUSTED"
    assert audit.events[0].after_state == {"score": 90, "grade": "A"}


def test_role_stacking_keeps_indirect_manager_read_scope_without_write_scope():
    scopes = {
        DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER: {"300"},
        DYNAMIC_IDENTITY_TYPE_CALIBRATOR: {"300"},
    }

    evaluate_object_authorization(
        _request(actor_ref="100"),
        scopes,
        is_active_publication_recipient=False,
    )
    with pytest.raises(PermissionError):
        evaluate_object_authorization(
            _request(OBJECT_ACTION_MANAGER_REVIEW, actor_ref="100"),
            scopes,
            is_active_publication_recipient=False,
        )


def test_appeal_handlers_resolve_by_person_or_performance_role():
    people = build_snapshot_people(
        (RosterAuthorizationInput("300", "员工甲", employment_status="在职"),)
    )
    assignments = (
        DynamicIdentityInput(
            actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
            actor_ref="800",
            identity_type=DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
            target_type=DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
            target_ref="300",
        ),
        DynamicIdentityInput(
            actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_PERFORMANCE_ROLE,
            actor_ref="appeal.handler.role",
            identity_type=DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
            target_type=DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
            target_ref="300",
        ),
    )

    person_scopes = resolve_identity_scopes(
        people,
        assignments,
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        actor_ref="800",
        identity_type=DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
    )
    role_scopes = resolve_identity_scopes(
        people,
        assignments,
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_PERFORMANCE_ROLE,
        actor_ref="appeal.handler.role",
        identity_type=DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
    )

    assert [scope.target_ref for scope in person_scopes] == ["300"]
    assert [scope.target_ref for scope in role_scopes] == ["300"]


def test_360_assignment_captures_inviter_identity_for_visibility_filtering():
    assignment = DynamicIdentityInput(
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        actor_ref="700",
        identity_type="REVIEWER_360",
        target_type=DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
        target_ref="300",
        assigned_by_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        assigned_by_ref="300",
    )

    assert assignment.assigned_by_type == "EMPLOYEE"
    assert assignment.assigned_by_ref == "300"


def test_feature_authorization_migration_tracks_assignment_origin():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0172_performance_feature_authorization_baseline.py"
    )
    migration = migration_path.read_text(encoding="utf-8")

    assert 'down_revision = "0171_performance_object_authorization_audit"' in migration
    assert '"assigned_by_type"' in migration
    assert '"assigned_by_ref"' in migration
    assert "ck_performance_dynamic_identity_assigned_by_pair" in migration
    assert "ix_performance_dynamic_identity_visibility" in migration
