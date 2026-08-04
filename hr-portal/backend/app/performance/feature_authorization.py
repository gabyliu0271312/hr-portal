"""Mandatory authorization facade for future performance business capabilities."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.performance.authorization_service import (
    AuditEventInput,
    ObjectAuthorizationRequest,
    PerformanceAuditService,
    PerformanceObjectAuthorizationDenied,
    PerformanceObjectAuthorizationService,
    OBJECT_ACTION_APPEAL_HANDLE,
    OBJECT_ACTION_CALIBRATE,
    OBJECT_ACTION_MANAGER_REVIEW,
    OBJECT_ACTION_PROJECT_ADMIN,
    OBJECT_ACTION_RESULT_READ,
    OBJECT_ACTION_WORK_SUMMARY_READ,
    OBJECT_ACTION_REVIEW_360,
    OBJECT_ACTION_SELF_SUBMIT,
)
from app.performance.models import (
    AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
    DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
    DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
    DYNAMIC_ASSIGNMENT_TARGET_TYPE_PROJECT,
    DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
    DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
    DYNAMIC_IDENTITY_TYPE_PROJECT_ADMIN,
    DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
    PerformanceAuthorizationSnapshot,
    PerformanceDynamicIdentityAssignment,
)


class PerformanceFeatureAuthorizationService:
    """Single authorization entry point required by future performance features."""

    def __init__(
        self,
        db: AsyncSession,
        *,
        object_authorization: PerformanceObjectAuthorizationService | None = None,
        audit: PerformanceAuditService | None = None,
    ):
        self.db = db
        self.object_authorization = object_authorization or PerformanceObjectAuthorizationService(db)
        self.audit = audit or PerformanceAuditService(db)

    async def authorize_self_submission(self, request: ObjectAuthorizationRequest) -> None:
        await self.object_authorization.authorize(
            _with_action(request, OBJECT_ACTION_SELF_SUBMIT)
        )

    async def authorize_manager_review(self, request: ObjectAuthorizationRequest) -> None:
        await self.object_authorization.authorize(
            _with_action(request, OBJECT_ACTION_MANAGER_REVIEW)
        )

    async def authorize_result_view(self, request: ObjectAuthorizationRequest) -> None:
        await self.object_authorization.authorize(
            _with_action(request, OBJECT_ACTION_RESULT_READ)
        )

    async def authorize_work_summary_view(self, request: ObjectAuthorizationRequest) -> None:
        await self.object_authorization.authorize(
            _with_action(request, OBJECT_ACTION_WORK_SUMMARY_READ)
        )

    async def authorize_360_review(self, request: ObjectAuthorizationRequest) -> None:
        await self.object_authorization.authorize(
            _with_action(request, OBJECT_ACTION_REVIEW_360)
        )

    async def authorize_appeal_handling(self, request: ObjectAuthorizationRequest) -> None:
        await self.object_authorization.authorize(
            _with_action(request, OBJECT_ACTION_APPEAL_HANDLE)
        )

    async def record_calibration_adjustment(
        self,
        request: ObjectAuthorizationRequest,
        *,
        before_state: dict,
        after_state: dict,
        calibration_group_ref: str,
    ) -> None:
        await self.object_authorization.authorize(
            _with_action(request, OBJECT_ACTION_CALIBRATE)
        )
        self.audit.append_event(
            AuditEventInput(
                event_type="CALIBRATION_ADJUSTED",
                cycle_ref=request.cycle_ref,
                employee_no=request.employee_no,
                actor_type=request.actor_type,
                actor_ref=request.actor_ref,
                subject_type="CALIBRATION_GROUP",
                subject_ref=calibration_group_ref,
                before_state=before_state,
                after_state=after_state,
            )
        )
        await self.db.commit()

    async def authorize_project_administration(
        self,
        *,
        cycle_ref: str,
        actor_type: str,
        actor_ref: str,
        project_ref: str,
        cycle_status: str,
        node_status: str,
        record_status: str,
    ) -> None:
        await self.object_authorization.authorize_dynamic_scope(
            cycle_ref=cycle_ref,
            actor_type=actor_type,
            actor_ref=actor_ref,
            identity_type=DYNAMIC_IDENTITY_TYPE_PROJECT_ADMIN,
            target_type=DYNAMIC_ASSIGNMENT_TARGET_TYPE_PROJECT,
            target_ref=project_ref,
            action=OBJECT_ACTION_PROJECT_ADMIN,
            cycle_status=cycle_status,
            node_status=node_status,
            record_status=record_status,
        )

    async def list_self_invited_360_reviewers(
        self,
        *,
        cycle_ref: str,
        employee_no: str,
        requester_employee_no: str,
    ) -> list[str]:
        if requester_employee_no != employee_no:
            raise PerformanceObjectAuthorizationDenied("员工不可查看非本人邀请的360°评估人名单")
        snapshot = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshot).where(
                    PerformanceAuthorizationSnapshot.cycle_ref == cycle_ref
                )
            )
        ).scalar_one_or_none()
        if snapshot is None or snapshot.status != AUTHORIZATION_SNAPSHOT_STATUS_LOCKED:
            raise PerformanceObjectAuthorizationDenied("周期授权快照尚未锁定")
        rows = (
            await self.db.execute(
                select(PerformanceDynamicIdentityAssignment.actor_ref)
                .where(
                    PerformanceDynamicIdentityAssignment.snapshot_id == snapshot.id,
                    PerformanceDynamicIdentityAssignment.identity_type == DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
                    PerformanceDynamicIdentityAssignment.target_type == DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
                    PerformanceDynamicIdentityAssignment.target_ref == employee_no,
                    PerformanceDynamicIdentityAssignment.actor_type == DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
                    PerformanceDynamicIdentityAssignment.assigned_by_type == DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
                    PerformanceDynamicIdentityAssignment.assigned_by_ref == requester_employee_no,
                    PerformanceDynamicIdentityAssignment.is_active.is_(True),
                )
                .order_by(PerformanceDynamicIdentityAssignment.actor_ref)
            )
        ).scalars().all()
        return list(rows)


def _with_action(
    request: ObjectAuthorizationRequest,
    action: str,
) -> ObjectAuthorizationRequest:
    return ObjectAuthorizationRequest(
        cycle_ref=request.cycle_ref,
        employee_no=request.employee_no,
        actor_type=request.actor_type,
        actor_ref=request.actor_ref,
        action=action,
        cycle_status=request.cycle_status,
        node_status=request.node_status,
        record_status=request.record_status,
    )
