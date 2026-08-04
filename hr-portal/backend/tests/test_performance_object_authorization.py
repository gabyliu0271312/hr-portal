from pathlib import Path

import pytest

from app.performance.authorization_service import (
    CYCLE_STATUS_ACTIVE,
    NODE_STATUS_OPEN,
    OBJECT_ACTION_PUBLISH,
    OBJECT_ACTION_WORK_SUMMARY_READ,
    OBJECT_ACTION_RESULT_READ,
    OBJECT_ACTION_TRANSFER_PUBLICATION,
    RECORD_STATUS_PUBLISHED,
    AuditEventInput,
    ObjectAuthorizationRequest,
    PerformanceAuditService,
    PerformanceObjectAuthorizationDenied,
    evaluate_object_authorization,
)
from app.performance.models import (
    DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_HRBP,
    DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
    DYNAMIC_IDENTITY_TYPE_SELF,
)


class _AuditDb:
    def __init__(self):
        self.records = []

    def add(self, record):
        self.records.append(record)


def _request(action, *, actor_ref="400", record_status="READY_TO_PUBLISH"):
    return ObjectAuthorizationRequest(
        cycle_ref="PM-T04-TEST",
        employee_no="300",
        actor_type="EMPLOYEE",
        actor_ref=actor_ref,
        action=action,
        cycle_status=CYCLE_STATUS_ACTIVE,
        node_status=NODE_STATUS_OPEN,
        record_status=record_status,
    )


def test_hrbp_can_transfer_but_cannot_directly_publish():
    scopes = {DYNAMIC_IDENTITY_TYPE_HRBP: {"300"}}

    evaluate_object_authorization(
        _request(OBJECT_ACTION_TRANSFER_PUBLICATION),
        scopes,
        is_active_publication_recipient=False,
    )
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(OBJECT_ACTION_PUBLISH),
            scopes,
            is_active_publication_recipient=False,
        )


def test_transferred_recipient_can_publish_immediately():
    evaluate_object_authorization(
        _request(OBJECT_ACTION_PUBLISH, actor_ref="600"),
        {},
        is_active_publication_recipient=True,
    )


def test_published_result_cannot_be_published_again():
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(
                OBJECT_ACTION_PUBLISH,
                actor_ref="600",
                record_status=RECORD_STATUS_PUBLISHED,
            ),
            {},
            is_active_publication_recipient=True,
        )


def test_out_of_scope_read_is_rejected():
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(OBJECT_ACTION_WORK_SUMMARY_READ, actor_ref="999"),
            {DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER: {"301"}},
            is_active_publication_recipient=False,
        )


def test_result_read_rejects_360_reviewer_and_unpublished_employee():
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(OBJECT_ACTION_RESULT_READ, actor_ref="700"),
            {DYNAMIC_IDENTITY_TYPE_REVIEWER_360: {"300"}},
            is_active_publication_recipient=False,
        )
    with pytest.raises(PerformanceObjectAuthorizationDenied):
        evaluate_object_authorization(
            _request(OBJECT_ACTION_RESULT_READ, actor_ref="300"),
            {DYNAMIC_IDENTITY_TYPE_SELF: {"300"}},
            is_active_publication_recipient=False,
        )
    evaluate_object_authorization(
        _request(
            OBJECT_ACTION_RESULT_READ,
            actor_ref="300",
            record_status=RECORD_STATUS_PUBLISHED,
        ),
        {DYNAMIC_IDENTITY_TYPE_SELF: {"300"}},
        is_active_publication_recipient=False,
    )


def test_audit_service_captures_reconstructable_before_and_after_states():
    db = _AuditDb()
    audit = PerformanceAuditService(db)

    record = audit.append_event(
        AuditEventInput(
            event_type="RESULT_PUBLICATION_TRANSFERRED",
            cycle_ref="PM-T04-TEST",
            employee_no="300",
            actor_type="EMPLOYEE",
            actor_ref="400",
            subject_type="EMPLOYEE",
            subject_ref="600",
            before_state={"effective_publisher": {"actor_ref": "200"}},
            after_state={
                "effective_publisher": {"actor_ref": "600"},
                "original_direct_manager_employee_no": "200",
                "reason": "原直属上级无法处理",
            },
        )
    )

    assert db.records == [record]
    assert record.before_state["effective_publisher"]["actor_ref"] == "200"
    assert record.after_state["effective_publisher"]["actor_ref"] == "600"
    assert record.after_state["original_direct_manager_employee_no"] == "200"


def test_object_authorization_migration_has_immutable_audit_trigger():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0171_performance_object_authorization_audit.py"
    )
    migration = migration_path.read_text(encoding="utf-8")

    assert 'down_revision = "0170_performance_authorization_snapshots"' in migration
    assert '"performance_publication_transfers"' in migration
    assert '"performance_audit_events"' in migration
    assert "uq_performance_publication_transfer_active_target" in migration
    assert "performance_reject_audit_event_mutation" in migration
    assert "trg_performance_audit_events_immutable" in migration
    assert 'op.drop_table("performance_audit_events")' in migration
