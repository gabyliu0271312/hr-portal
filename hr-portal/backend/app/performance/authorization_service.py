"""Object-level authorization, publication transfer, and immutable audit services."""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.performance.models import (
    AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
    DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
    DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
    DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
    DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_HRBP,
    DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_PROJECT_ADMIN,
    DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
    DYNAMIC_IDENTITY_TYPE_SELF,
    DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
    PUBLICATION_TRANSFER_ACTOR_TYPES,
    PerformanceAuditEvent,
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceObjectAuthorizationState,
    PerformancePublicationTransfer,
)
from app.performance.snapshot_service import PerformanceAuthorizationSnapshotService
from app.performance.auth_context import PerformanceAccessContext, resolve_trusted_performance_actor


OBJECT_ACTION_WORK_SUMMARY_READ = "WORK_SUMMARY_READ"
OBJECT_ACTION_RESULT_READ = "RESULT_READ"
OBJECT_ACTION_SELF_SUBMIT = "SELF_SUBMIT"
OBJECT_ACTION_MANAGER_REVIEW = "MANAGER_REVIEW"
OBJECT_ACTION_REVIEW_360 = "REVIEW_360"
OBJECT_ACTION_PROJECT_ADMIN = "PROJECT_ADMIN"
OBJECT_ACTION_CALIBRATE = "CALIBRATE"
OBJECT_ACTION_APPEAL_HANDLE = "APPEAL_HANDLE"
OBJECT_ACTION_PUBLISH = "PUBLISH"
OBJECT_ACTION_TRANSFER_PUBLICATION = "TRANSFER_PUBLICATION"
CYCLE_STATUS_ACTIVE = "ACTIVE"
NODE_STATUS_OPEN = "OPEN"
RECORD_STATUS_PUBLISHED = "PUBLISHED"


class PerformanceObjectAuthorizationDenied(PermissionError):
    """Raised when a caller is outside the required object-level authorization scope."""


@dataclass(frozen=True)
class ObjectAuthorizationRequest:
    cycle_ref: str
    employee_no: str
    actor_type: str
    actor_ref: str
    action: Literal[
        "WORK_SUMMARY_READ",
        "RESULT_READ",
        "SELF_SUBMIT",
        "MANAGER_REVIEW",
        "REVIEW_360",
        "PROJECT_ADMIN",
        "CALIBRATE",
        "APPEAL_HANDLE",
        "PUBLISH",
        "TRANSFER_PUBLICATION",
    ]
    cycle_status: str
    node_status: str
    record_status: str


@dataclass(frozen=True)
class AuditEventInput:
    event_type: str
    actor_type: str
    actor_ref: str
    cycle_ref: str | None = None
    employee_no: str | None = None
    subject_type: str | None = None
    subject_ref: str | None = None
    before_state: dict | None = None
    after_state: dict | None = None


class PerformanceObjectAuthorizationStateNotFound(ValueError):
    """Raised when an object has no server-persisted authorization state."""


async def build_object_authorization_request(
    db: AsyncSession,
    context: PerformanceAccessContext,
    *,
    cycle_ref: str,
    employee_no: str,
    action: str,
) -> ObjectAuthorizationRequest:
    """Build an authorization request from authenticated context and persisted state."""
    actor = await resolve_trusted_performance_actor(
        db, context, cycle_ref=cycle_ref, require_employee_identity=True
    )
    state = (
        await db.execute(
            select(PerformanceObjectAuthorizationState)
            .join(PerformanceAuthorizationSnapshot)
            .where(
                PerformanceAuthorizationSnapshot.cycle_ref == cycle_ref,
                PerformanceObjectAuthorizationState.employee_no == employee_no,
            )
        )
    ).scalar_one_or_none()
    if state is None:
        raise PerformanceObjectAuthorizationStateNotFound("未找到服务端对象授权状态")
    return ObjectAuthorizationRequest(
        cycle_ref=cycle_ref,
        employee_no=employee_no,
        actor_type=actor.actor_type,
        actor_ref=actor.actor_ref,
        action=action,
        cycle_status=state.cycle_status,
        node_status=state.node_status,
        record_status=state.record_status,
    )


def _assert_process_state(request: ObjectAuthorizationRequest) -> None:
    if request.action in (OBJECT_ACTION_WORK_SUMMARY_READ, OBJECT_ACTION_RESULT_READ):
        return
    if request.cycle_status != CYCLE_STATUS_ACTIVE:
        raise PerformanceObjectAuthorizationDenied("周期当前状态不允许此操作")
    if request.node_status != NODE_STATUS_OPEN:
        raise PerformanceObjectAuthorizationDenied("当前流程节点未开放")
    if (
        request.action == OBJECT_ACTION_PUBLISH
        and request.record_status == RECORD_STATUS_PUBLISHED
    ):
        raise PerformanceObjectAuthorizationDenied("结果已发布，不允许撤回或重复发布")


def evaluate_object_authorization(
    request: ObjectAuthorizationRequest,
    scopes_by_identity: Mapping[str, set[str]],
    *,
    is_active_publication_recipient: bool,
) -> None:
    """Apply explicit-deny-first rules after caller scopes have been resolved."""
    _assert_process_state(request)

    def has_scope(identity_type: str) -> bool:
        return request.employee_no in scopes_by_identity.get(identity_type, set())

    if request.action == OBJECT_ACTION_RESULT_READ:
        if (
            has_scope(DYNAMIC_IDENTITY_TYPE_SELF)
            and request.record_status == RECORD_STATUS_PUBLISHED
        ):
            return
        if any(
            has_scope(identity_type)
            for identity_type in (
                DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
                DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
                DYNAMIC_IDENTITY_TYPE_HRBP,
                DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
                DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
            )
        ):
            return
    elif request.action == OBJECT_ACTION_WORK_SUMMARY_READ:
        if any(
            has_scope(identity_type)
            for identity_type in (
                DYNAMIC_IDENTITY_TYPE_SELF,
                DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
                DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
                DYNAMIC_IDENTITY_TYPE_HRBP,
                DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
                DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
                DYNAMIC_IDENTITY_TYPE_PROJECT_ADMIN,
                DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
            )
        ):
            return
    elif request.action == OBJECT_ACTION_SELF_SUBMIT:
        if has_scope(DYNAMIC_IDENTITY_TYPE_SELF):
            return
    elif request.action == OBJECT_ACTION_MANAGER_REVIEW:
        if has_scope(DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER):
            return
    elif request.action == OBJECT_ACTION_REVIEW_360:
        if has_scope(DYNAMIC_IDENTITY_TYPE_REVIEWER_360):
            return
    elif request.action == OBJECT_ACTION_CALIBRATE:
        if has_scope(DYNAMIC_IDENTITY_TYPE_CALIBRATOR):
            return
    elif request.action == OBJECT_ACTION_APPEAL_HANDLE:
        if has_scope(DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER):
            return
    elif request.action == OBJECT_ACTION_TRANSFER_PUBLICATION:
        if has_scope(DYNAMIC_IDENTITY_TYPE_HRBP):
            return
    elif request.action == OBJECT_ACTION_PUBLISH:
        if is_active_publication_recipient:
            return
        if has_scope(DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER):
            return
    else:
        raise ValueError(f"未知对象授权动作：{request.action}")

    raise PerformanceObjectAuthorizationDenied("无权操作该周期员工记录")


class PerformanceAuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def append_event(self, event: AuditEventInput) -> PerformanceAuditEvent:
        record = PerformanceAuditEvent(
            event_type=event.event_type,
            cycle_ref=event.cycle_ref,
            employee_no=event.employee_no,
            actor_type=event.actor_type,
            actor_ref=event.actor_ref,
            subject_type=event.subject_type,
            subject_ref=event.subject_ref,
            before_state=event.before_state or {},
            after_state=event.after_state or {},
        )
        self.db.add(record)
        return record

    async def list_events(
        self,
        *,
        cycle_ref: str | None = None,
        employee_no: str | None = None,
    ) -> list[PerformanceAuditEvent]:
        statement = select(PerformanceAuditEvent)
        if cycle_ref is not None:
            statement = statement.where(PerformanceAuditEvent.cycle_ref == cycle_ref)
        if employee_no is not None:
            statement = statement.where(PerformanceAuditEvent.employee_no == employee_no)
        return (
            await self.db.execute(statement.order_by(PerformanceAuditEvent.event_at, PerformanceAuditEvent.id))
        ).scalars().all()


class PerformanceObjectAuthorizationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.snapshot_service = PerformanceAuthorizationSnapshotService(db)

    async def authorize(self, request: ObjectAuthorizationRequest) -> None:
        snapshot = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshot).where(
                    PerformanceAuthorizationSnapshot.cycle_ref == request.cycle_ref
                )
            )
        ).scalar_one_or_none()
        if snapshot is None:
            raise PerformanceObjectAuthorizationDenied("未找到周期授权快照")
        if snapshot.status != AUTHORIZATION_SNAPSHOT_STATUS_LOCKED:
            raise PerformanceObjectAuthorizationDenied("周期授权快照尚未锁定")

        scopes_by_identity = await self._resolve_employee_scopes(request)
        active_transfer = None
        if request.action == OBJECT_ACTION_PUBLISH:
            active_transfer = (
                await self.db.execute(
                    select(PerformancePublicationTransfer).where(
                        PerformancePublicationTransfer.cycle_ref == request.cycle_ref,
                        PerformancePublicationTransfer.employee_no == request.employee_no,
                        PerformancePublicationTransfer.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
        is_active_publication_recipient = bool(
            active_transfer
            and active_transfer.recipient_type == request.actor_type
            and active_transfer.recipient_ref == request.actor_ref
        )
        if active_transfer is not None and not is_active_publication_recipient:
            scopes_by_identity[DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER] = set()

        evaluate_object_authorization(
            request,
            scopes_by_identity,
            is_active_publication_recipient=is_active_publication_recipient,
        )

    async def authorize_context(
        self,
        context: PerformanceAccessContext,
        *,
        cycle_ref: str,
        employee_no: str,
        action: str,
    ) -> ObjectAuthorizationRequest:
        """Only supported object-authorization entry point for business routes."""
        request = await build_object_authorization_request(
            self.db,
            context,
            cycle_ref=cycle_ref,
            employee_no=employee_no,
            action=action,
        )
        await self.authorize(request)
        return request

    async def authorize_dynamic_scope(
        self,
        *,
        cycle_ref: str,
        actor_type: str,
        actor_ref: str,
        identity_type: str,
        target_type: str,
        target_ref: str,
        action: str,
        cycle_status: str,
        node_status: str,
        record_status: str,
    ) -> None:
        snapshot = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshot).where(
                    PerformanceAuthorizationSnapshot.cycle_ref == cycle_ref
                )
            )
        ).scalar_one_or_none()
        if snapshot is None:
            raise PerformanceObjectAuthorizationDenied("未找到周期授权快照")
        if snapshot.status != AUTHORIZATION_SNAPSHOT_STATUS_LOCKED:
            raise PerformanceObjectAuthorizationDenied("周期授权快照尚未锁定")
        _assert_process_state(
            ObjectAuthorizationRequest(
                cycle_ref=cycle_ref,
                employee_no=target_ref,
                actor_type=actor_type,
                actor_ref=actor_ref,
                action=action,
                cycle_status=cycle_status,
                node_status=node_status,
                record_status=record_status,
            )
        )
        scopes = await self.snapshot_service.resolve_scopes(
            cycle_ref,
            actor_type=actor_type,
            actor_ref=actor_ref,
            identity_type=identity_type,
        )
        if not any(
            scope.target_type == target_type and scope.target_ref == target_ref
            for scope in scopes
        ):
            raise PerformanceObjectAuthorizationDenied("无权操作该动态身份范围")
    async def _resolve_employee_scopes(
        self,
        request: ObjectAuthorizationRequest,
    ) -> dict[str, set[str]]:
        identities = (
            DYNAMIC_IDENTITY_TYPE_SELF,
            DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
            DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
            DYNAMIC_IDENTITY_TYPE_HRBP,
            DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
            DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
            DYNAMIC_IDENTITY_TYPE_PROJECT_ADMIN,
            DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
        )
        resolved: dict[str, set[str]] = {}
        for identity_type in identities:
            scopes = await self.snapshot_service.resolve_scopes(
                request.cycle_ref,
                actor_type=request.actor_type,
                actor_ref=request.actor_ref,
                identity_type=identity_type,
            )
            resolved[identity_type] = {
                scope.target_ref
                for scope in scopes
                if scope.target_type == DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE
            }
        return resolved


class PerformancePublicationTransferService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.authorization = PerformanceObjectAuthorizationService(db)
        self.audit = PerformanceAuditService(db)

    async def transfer_publication(
        self,
        request: ObjectAuthorizationRequest,
        *,
        recipient_type: str,
        recipient_ref: str,
        reason: str,
    ) -> PerformancePublicationTransfer:
        if request.action != OBJECT_ACTION_TRANSFER_PUBLICATION:
            raise ValueError("发布转交必须使用 TRANSFER_PUBLICATION 授权动作")
        if recipient_type not in PUBLICATION_TRANSFER_ACTOR_TYPES:
            raise ValueError("发布接收人必须是指定个人")
        recipient_ref = recipient_ref.strip()
        reason = reason.strip()
        if not recipient_ref or not reason:
            raise ValueError("发布转交必须填写接收人和原因")

        await self.authorization.authorize(request)
        snapshot = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshot).where(
                    PerformanceAuthorizationSnapshot.cycle_ref == request.cycle_ref
                )
            )
        ).scalar_one()
        person = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshotPerson).where(
                    PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id,
                    PerformanceAuthorizationSnapshotPerson.employee_no == request.employee_no,
                )
            )
        ).scalar_one_or_none()
        if person is None or not person.direct_manager_employee_no:
            raise PerformanceObjectAuthorizationDenied("员工缺少锁定的直属上级快照")

        active_transfer = (
            await self.db.execute(
                select(PerformancePublicationTransfer)
                .where(
                    PerformancePublicationTransfer.cycle_ref == request.cycle_ref,
                    PerformancePublicationTransfer.employee_no == request.employee_no,
                    PerformancePublicationTransfer.is_active.is_(True),
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if active_transfer is not None:
            active_transfer.is_active = False
            before_state = {
                "effective_publisher": {
                    "actor_type": active_transfer.recipient_type,
                    "actor_ref": active_transfer.recipient_ref,
                },
                "previous_transfer_id": active_transfer.id,
            }
        else:
            before_state = {
                "effective_publisher": {
                    "actor_type": DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
                    "actor_ref": person.direct_manager_employee_no,
                },
                "previous_transfer_id": None,
            }

        transfer = PerformancePublicationTransfer(
            cycle_ref=request.cycle_ref,
            employee_no=request.employee_no,
            original_direct_manager_employee_no=person.direct_manager_employee_no,
            transferred_by_type=request.actor_type,
            transferred_by_ref=request.actor_ref,
            recipient_type=recipient_type,
            recipient_ref=recipient_ref,
            reason=reason,
            is_active=True,
            transferred_at=datetime.now(UTC),
        )
        self.db.add(transfer)
        await self.db.flush()
        after_state = {
            "effective_publisher": {
                "actor_type": recipient_type,
                "actor_ref": recipient_ref,
            },
            "original_direct_manager_employee_no": person.direct_manager_employee_no,
            "reason": reason,
            "transfer_id": transfer.id,
        }
        self.audit.append_event(
            AuditEventInput(
                event_type="RESULT_PUBLICATION_TRANSFERRED",
                cycle_ref=request.cycle_ref,
                employee_no=request.employee_no,
                actor_type=request.actor_type,
                actor_ref=request.actor_ref,
                subject_type=recipient_type,
                subject_ref=recipient_ref,
                before_state=before_state,
                after_state=after_state,
            )
        )
        await self.db.commit()
        await self.db.refresh(transfer)
        return transfer
