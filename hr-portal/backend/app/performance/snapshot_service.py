"""Cycle authorization snapshot inputs and dynamic identity resolution."""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.performance.models import (
    AUTHORIZATION_SNAPSHOT_STATUS_DRAFT,
    AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
    DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
    DYNAMIC_ASSIGNMENT_SOURCE_CONFIGURATION,
    DYNAMIC_ASSIGNMENT_SOURCE_MANUAL,
    DYNAMIC_ASSIGNMENT_SOURCE_SYNC,
    DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
    DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
    DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
    DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_HRBP,
    DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_PROJECT_ADMIN,
    DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
    DYNAMIC_IDENTITY_TYPE_SELF,
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceAuditEvent,
    PerformanceDynamicIdentityAssignment,
    PerformanceIdentityLink,
)


_DYNAMIC_IDENTITY_TYPES = {
    DYNAMIC_IDENTITY_TYPE_SELF,
    DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_HRBP,
    DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
    DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
    DYNAMIC_IDENTITY_TYPE_PROJECT_ADMIN,
    DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
}
_DYNAMIC_ASSIGNMENT_SOURCE_TYPES = {
    DYNAMIC_ASSIGNMENT_SOURCE_SYNC,
    DYNAMIC_ASSIGNMENT_SOURCE_MANUAL,
    DYNAMIC_ASSIGNMENT_SOURCE_CONFIGURATION,
}


class SnapshotLockedError(ValueError):
    """Raised when a structural mutation targets a locked authorization snapshot."""


@dataclass(frozen=True)
class RosterAuthorizationInput:
    employee_no: str
    display_name: str
    source_roster_id: int | None = None
    portal_user_id: int | None = None
    organization_ref: str | None = None
    direct_manager_source_value: str | None = None
    hrbp_source_value: str | None = None
    employment_status: str | None = None


@dataclass(frozen=True)
class SnapshotPersonState:
    employee_no: str
    display_name: str
    source_roster_id: int | None = None
    portal_user_id: int | None = None
    organization_ref: str | None = None
    direct_manager_employee_no: str | None = None
    direct_manager_source_value: str | None = None
    hrbp_employee_no: str | None = None
    hrbp_source_value: str | None = None
    employment_status: str | None = None


@dataclass(frozen=True)
class DynamicIdentityInput:
    actor_type: str
    actor_ref: str
    identity_type: str
    target_type: str
    target_ref: str
    source_type: str = DYNAMIC_ASSIGNMENT_SOURCE_CONFIGURATION
    assigned_by_type: str | None = None
    assigned_by_ref: str | None = None
    is_active: bool = True


@dataclass(frozen=True)
class DynamicIdentityScope:
    identity_type: str
    target_type: str
    target_ref: str


def _normalized_reference(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _reference_key(value: str | None) -> str | None:
    normalized = _normalized_reference(value)
    return normalized.casefold() if normalized else None


def _require_audit_actor_type(value: str) -> str:
    normalized = _normalized_reference(value)
    if normalized is None:
        raise ValueError("审计必须包含实际操作者类型")
    return normalized


def _require_audit_actor_ref(value: str) -> str:
    normalized = _normalized_reference(value)
    if normalized is None:
        raise ValueError("审计必须包含实际操作者引用")
    return normalized


def _assignment_key(assignment: DynamicIdentityInput | PerformanceDynamicIdentityAssignment) -> tuple[str, str, str, str, str]:
    return (
        assignment.actor_type,
        assignment.actor_ref,
        assignment.identity_type,
        assignment.target_type,
        assignment.target_ref,
    )


def _assignment_state(assignment: DynamicIdentityInput | PerformanceDynamicIdentityAssignment) -> dict:
    return {
        "target_type": assignment.target_type,
        "target_ref": assignment.target_ref,
        "source_type": assignment.source_type,
        "assigned_by_type": assignment.assigned_by_type,
        "assigned_by_ref": assignment.assigned_by_ref,
        "is_active": assignment.is_active,
    }


def _with_trusted_invitation_origin(
    assignment: DynamicIdentityInput,
    actor_type: str,
    actor_ref: str,
) -> DynamicIdentityInput:
    if assignment.identity_type != DYNAMIC_IDENTITY_TYPE_REVIEWER_360:
        if assignment.assigned_by_type or assignment.assigned_by_ref:
            raise ValueError("仅 360°评估人指派可以记录邀请来源")
        return assignment
    if (assignment.assigned_by_type, assignment.assigned_by_ref) not in {
        (None, None),
        (actor_type, actor_ref),
    }:
        raise ValueError("360°评估人邀请来源必须与实际操作者一致")
    return replace(assignment, assigned_by_type=actor_type, assigned_by_ref=actor_ref)


def assert_snapshot_mutable(status: str) -> None:
    if status == AUTHORIZATION_SNAPSHOT_STATUS_LOCKED:
        raise SnapshotLockedError("授权快照已锁定，不能修改人员、组织、汇报关系或动态身份输入")


def build_snapshot_people(
    roster_inputs: Iterable[RosterAuthorizationInput],
) -> tuple[SnapshotPersonState, ...]:
    """Resolve roster text references to immutable employee-number relationships."""
    rows = tuple(roster_inputs)
    by_employee_no: dict[str, RosterAuthorizationInput] = {}
    references: dict[str, str] = {}
    for row in rows:
        employee_no = _normalized_reference(row.employee_no)
        display_name = _normalized_reference(row.display_name)
        if employee_no is None or display_name is None:
            raise ValueError("员工快照必须包含 employee_no 和 display_name")
        if employee_no in by_employee_no:
            raise ValueError(f"员工编号重复：{employee_no}")
        by_employee_no[employee_no] = row
        for value in (employee_no, display_name):
            key = _reference_key(value)
            existing = references.get(key) if key else None
            if key and existing not in (None, employee_no):
                raise ValueError(f"人员引用不唯一：{value}")
            if key:
                references[key] = employee_no

    people = []
    for employee_no, row in by_employee_no.items():
        people.append(
            SnapshotPersonState(
                employee_no=employee_no,
                display_name=_normalized_reference(row.display_name) or "",
                source_roster_id=row.source_roster_id,
                organization_ref=_normalized_reference(row.organization_ref),
                direct_manager_employee_no=references.get(
                    _reference_key(row.direct_manager_source_value)
                ),
                direct_manager_source_value=_normalized_reference(
                    row.direct_manager_source_value
                ),
                hrbp_employee_no=references.get(_reference_key(row.hrbp_source_value)),
                hrbp_source_value=_normalized_reference(row.hrbp_source_value),
                employment_status=_normalized_reference(row.employment_status),
            )
        )
    return tuple(sorted(people, key=lambda person: person.employee_no))


def apply_live_employment_statuses(
    people: Iterable[SnapshotPersonState],
    statuses_by_employee_no: Mapping[str, str | None],
) -> tuple[SnapshotPersonState, ...]:
    """Apply the sole post-lock live field without touching frozen relationships."""
    normalized_statuses = {
        normalized: _normalized_reference(status)
        for employee_no, status in statuses_by_employee_no.items()
        if (normalized := _normalized_reference(employee_no)) is not None
    }
    return tuple(
        replace(
            person,
            employment_status=normalized_statuses.get(
                person.employee_no,
                person.employment_status,
            ),
        )
        for person in people
    )


def resolve_identity_scopes(
    people: Iterable[SnapshotPersonState],
    assignments: Iterable[DynamicIdentityInput],
    *,
    actor_type: str,
    actor_ref: str,
    identity_type: str,
) -> tuple[DynamicIdentityScope, ...]:
    """Resolve snapshot relationships and explicit dynamic assignments for one actor."""
    actor_ref = _normalized_reference(actor_ref) or ""
    people_by_employee = {person.employee_no: person for person in people}
    scopes: set[tuple[str, str]] = set()

    if actor_type == DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE:
        if identity_type == DYNAMIC_IDENTITY_TYPE_SELF and actor_ref in people_by_employee:
            scopes.add((DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, actor_ref))
        elif identity_type == DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER:
            scopes.update(
                (DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, person.employee_no)
                for person in people_by_employee.values()
                if person.direct_manager_employee_no == actor_ref
            )
        elif identity_type == DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER:
            for person in people_by_employee.values():
                manager_employee_no = person.direct_manager_employee_no
                visited: set[str] = set()
                while manager_employee_no and manager_employee_no not in visited:
                    visited.add(manager_employee_no)
                    manager = people_by_employee.get(manager_employee_no)
                    manager_employee_no = (
                        manager.direct_manager_employee_no if manager is not None else None
                    )
                    if manager_employee_no == actor_ref:
                        scopes.add((DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, person.employee_no))
                        break
        elif identity_type == DYNAMIC_IDENTITY_TYPE_HRBP:
            scopes.update(
                (DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, person.employee_no)
                for person in people_by_employee.values()
                if person.hrbp_employee_no == actor_ref
            )

    for assignment in assignments:
        if (
            assignment.is_active
            and assignment.actor_type == actor_type
            and assignment.actor_ref == actor_ref
            and assignment.identity_type == identity_type
        ):
            scopes.add((assignment.target_type, assignment.target_ref))

    return tuple(
        DynamicIdentityScope(
            identity_type=identity_type,
            target_type=target_type,
            target_ref=target_ref,
        )
        for target_type, target_ref in sorted(scopes)
    )


class PerformanceAuthorizationSnapshotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def sync_roster(
        self,
        cycle_ref: str,
        roster_inputs: Iterable[RosterAuthorizationInput],
        *,
        actor_type: str,
        actor_ref: str,
    ) -> PerformanceAuthorizationSnapshot:
        cycle_ref = _normalized_reference(cycle_ref)
        if cycle_ref is None:
            raise ValueError("cycle_ref 不能为空")
        snapshot = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshot)
                .where(PerformanceAuthorizationSnapshot.cycle_ref == cycle_ref)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if snapshot is None:
            snapshot = PerformanceAuthorizationSnapshot(cycle_ref=cycle_ref)
            self.db.add(snapshot)
            await self.db.flush()
        assert_snapshot_mutable(snapshot.status)

        linked_portal_users = {
            link.employee_no: link.portal_user_id
            for link in (
                await self.db.execute(
                    select(PerformanceIdentityLink).where(PerformanceIdentityLink.is_active.is_(True))
                )
            ).scalars()
        }
        people = tuple(
            replace(
                person,
                portal_user_id=person.portal_user_id or linked_portal_users.get(person.employee_no),
            )
            for person in build_snapshot_people(roster_inputs)
        )
        existing_people = {
            person.employee_no: person
            for person in (
                await self.db.execute(
                    select(PerformanceAuthorizationSnapshotPerson).where(
                        PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id
                    )
                )
            ).scalars()
        }
        incoming_employee_nos = {person.employee_no for person in people}
        for person in people:
            record = existing_people.pop(person.employee_no, None)
            if record is None:
                record = PerformanceAuthorizationSnapshotPerson(
                    snapshot_id=snapshot.id,
                    employee_no=person.employee_no,
                    display_name=person.display_name,
                )
                self.db.add(record)
            record.source_roster_id = person.source_roster_id
            record.portal_user_id = person.portal_user_id
            record.display_name = person.display_name
            record.organization_ref = person.organization_ref
            record.direct_manager_employee_no = person.direct_manager_employee_no
            record.direct_manager_source_value = person.direct_manager_source_value
            record.hrbp_employee_no = person.hrbp_employee_no
            record.hrbp_source_value = person.hrbp_source_value
            record.employment_status = person.employment_status
        for employee_no, record in existing_people.items():
            if employee_no not in incoming_employee_nos:
                await self.db.delete(record)

        snapshot.last_synced_at = datetime.now(UTC)
        self._append_audit_event(
            event_type="AUTHORIZATION_SNAPSHOT_SYNCED",
            actor_type=_require_audit_actor_type(actor_type),
            actor_ref=_require_audit_actor_ref(actor_ref),
            cycle_ref=cycle_ref,
            after_state={"person_count": len(people), "status": snapshot.status},
        )
        await self.db.commit()
        await self.db.refresh(snapshot)
        return snapshot

    async def replace_dynamic_assignments(
        self,
        cycle_ref: str,
        assignments: Iterable[DynamicIdentityInput],
        *,
        actor_type: str,
        actor_ref: str,
    ) -> None:
        snapshot = await self._get_snapshot(cycle_ref, for_update=True)
        assert_snapshot_mutable(snapshot.status)
        actor_type = _require_audit_actor_type(actor_type)
        actor_ref = _require_audit_actor_ref(actor_ref)
        normalized_assignments = tuple(
            _with_trusted_invitation_origin(assignment, actor_type, actor_ref)
            for assignment in assignments
        )
        for assignment in normalized_assignments:
            if assignment.identity_type not in _DYNAMIC_IDENTITY_TYPES:
                raise ValueError(f"未知动态身份：{assignment.identity_type}")
            if assignment.source_type not in _DYNAMIC_ASSIGNMENT_SOURCE_TYPES:
                raise ValueError(f"未知动态身份来源：{assignment.source_type}")
            if not _normalized_reference(assignment.actor_ref) or not _normalized_reference(
                assignment.target_ref
            ):
                raise ValueError("动态身份指派必须包含 actor_ref 和 target_ref")
            if bool(assignment.assigned_by_type) != bool(assignment.assigned_by_ref):
                raise ValueError("动态身份指派人类型和引用必须同时填写")

        existing_assignments = (
            await self.db.execute(
                select(PerformanceDynamicIdentityAssignment).where(
                    PerformanceDynamicIdentityAssignment.snapshot_id == snapshot.id
                )
            )
        ).scalars().all()
        existing_by_key = {_assignment_key(assignment): assignment for assignment in existing_assignments}
        incoming_by_key = {_assignment_key(assignment): assignment for assignment in normalized_assignments}
        await self.db.execute(
            delete(PerformanceDynamicIdentityAssignment).where(
                PerformanceDynamicIdentityAssignment.snapshot_id == snapshot.id
            )
        )
        self.db.add_all(
            [
                PerformanceDynamicIdentityAssignment(
                    snapshot_id=snapshot.id,
                    actor_type=assignment.actor_type,
                    actor_ref=assignment.actor_ref,
                    identity_type=assignment.identity_type,
                    target_type=assignment.target_type,
                    target_ref=assignment.target_ref,
                    source_type=assignment.source_type,
                    assigned_by_type=assignment.assigned_by_type,
                    assigned_by_ref=assignment.assigned_by_ref,
                    is_active=assignment.is_active,
                )
                for assignment in normalized_assignments
            ]
        )
        for assignment in normalized_assignments:
            key = _assignment_key(assignment)
            previous = existing_by_key.get(key)
            if previous is None:
                self._append_audit_event(
                    event_type=(
                        "REVIEWER_360_INVITED"
                        if assignment.identity_type == DYNAMIC_IDENTITY_TYPE_REVIEWER_360
                        else "DYNAMIC_IDENTITY_ASSIGNED"
                    ),
                    actor_type=actor_type,
                    actor_ref=actor_ref,
                    cycle_ref=cycle_ref,
                    employee_no=(
                        assignment.target_ref
                        if assignment.target_type == DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE
                        else None
                    ),
                    subject_type=assignment.identity_type,
                    subject_ref=assignment.actor_ref,
                    after_state={
                        "target_type": assignment.target_type,
                        "target_ref": assignment.target_ref,
                        "source_type": assignment.source_type,
                        "assigned_by_type": assignment.assigned_by_type,
                        "assigned_by_ref": assignment.assigned_by_ref,
                    },
                )
            elif _assignment_state(previous) != _assignment_state(assignment):
                self._append_audit_event(
                    event_type="DYNAMIC_IDENTITY_UPDATED",
                    actor_type=actor_type,
                    actor_ref=actor_ref,
                    cycle_ref=cycle_ref,
                    employee_no=(assignment.target_ref if assignment.target_type == DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE else None),
                    subject_type=assignment.identity_type,
                    subject_ref=assignment.actor_ref,
                    before_state=_assignment_state(previous),
                    after_state=_assignment_state(assignment),
                )
        for assignment in existing_assignments:
            key = _assignment_key(assignment)
            if key not in incoming_by_key:
                self._append_audit_event(
                    event_type="DYNAMIC_IDENTITY_REVOKED",
                    actor_type=actor_type,
                    actor_ref=actor_ref,
                    cycle_ref=cycle_ref,
                    employee_no=(
                        assignment.target_ref
                        if assignment.target_type == DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE
                        else None
                    ),
                    subject_type=assignment.identity_type,
                    subject_ref=assignment.actor_ref,
                    before_state=_assignment_state(assignment),
                )
        await self.db.commit()

    async def lock_snapshot(
        self,
        cycle_ref: str,
        *,
        actor_type: str,
        actor_ref: str,
    ) -> PerformanceAuthorizationSnapshot:
        snapshot = await self._get_snapshot(cycle_ref, for_update=True)
        if snapshot.status == AUTHORIZATION_SNAPSHOT_STATUS_DRAFT:
            snapshot.status = AUTHORIZATION_SNAPSHOT_STATUS_LOCKED
            snapshot.locked_at = datetime.now(UTC)
            self._append_audit_event(
                event_type="AUTHORIZATION_SNAPSHOT_LOCKED",
                actor_type=_require_audit_actor_type(actor_type),
                actor_ref=_require_audit_actor_ref(actor_ref),
                cycle_ref=cycle_ref,
                after_state={"status": snapshot.status},
            )
            await self.db.commit()
            await self.db.refresh(snapshot)
        return snapshot

    async def sync_employment_statuses(
        self,
        cycle_ref: str,
        statuses_by_employee_no: Mapping[str, str | None],
    ) -> None:
        snapshot = await self._get_snapshot(cycle_ref)
        people = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshotPerson).where(
                    PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id
                )
            )
        ).scalars().all()
        normalized_statuses = {
            normalized: _normalized_reference(status)
            for employee_no, status in statuses_by_employee_no.items()
            if (normalized := _normalized_reference(employee_no)) is not None
        }
        for person in people:
            if person.employee_no in normalized_statuses:
                person.employment_status = normalized_statuses[person.employee_no]
        await self.db.commit()

    async def resolve_scopes(
        self,
        cycle_ref: str,
        *,
        actor_type: str,
        actor_ref: str,
        identity_type: str,
    ) -> tuple[DynamicIdentityScope, ...]:
        snapshot = await self._get_snapshot(cycle_ref)
        people = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshotPerson).where(
                    PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id
                )
            )
        ).scalars().all()
        assignments = (
            await self.db.execute(
                select(PerformanceDynamicIdentityAssignment).where(
                    PerformanceDynamicIdentityAssignment.snapshot_id == snapshot.id
                )
            )
        ).scalars().all()
        return resolve_identity_scopes(
            [
                SnapshotPersonState(
                    employee_no=person.employee_no,
                    display_name=person.display_name,
                    source_roster_id=person.source_roster_id,
                    organization_ref=person.organization_ref,
                    direct_manager_employee_no=person.direct_manager_employee_no,
                    direct_manager_source_value=person.direct_manager_source_value,
                    hrbp_employee_no=person.hrbp_employee_no,
                    hrbp_source_value=person.hrbp_source_value,
                    employment_status=person.employment_status,
                )
                for person in people
            ],
            [
                DynamicIdentityInput(
                    actor_type=assignment.actor_type,
                    actor_ref=assignment.actor_ref,
                    identity_type=assignment.identity_type,
                    target_type=assignment.target_type,
                    target_ref=assignment.target_ref,
                    source_type=assignment.source_type,
                    assigned_by_type=assignment.assigned_by_type,
                    assigned_by_ref=assignment.assigned_by_ref,
                    is_active=assignment.is_active,
                )
                for assignment in assignments
            ],
            actor_type=actor_type,
            actor_ref=actor_ref,
            identity_type=identity_type,
        )

    async def _get_snapshot(
        self,
        cycle_ref: str,
        *,
        for_update: bool = False,
    ) -> PerformanceAuthorizationSnapshot:
        statement = select(PerformanceAuthorizationSnapshot).where(
            PerformanceAuthorizationSnapshot.cycle_ref == cycle_ref
        )
        if for_update:
            statement = statement.with_for_update()
        snapshot = (
            await self.db.execute(statement)
        ).scalar_one_or_none()
        if snapshot is None:
            raise ValueError(f"未找到周期授权快照：{cycle_ref}")
        return snapshot

    def _append_audit_event(
        self,
        *,
        event_type: str,
        actor_type: str,
        actor_ref: str,
        cycle_ref: str,
        employee_no: str | None = None,
        subject_type: str | None = None,
        subject_ref: str | None = None,
        before_state: dict | None = None,
        after_state: dict | None = None,
    ) -> None:
        self.db.add(
            PerformanceAuditEvent(
                event_type=event_type,
                cycle_ref=cycle_ref,
                employee_no=employee_no,
                actor_type=actor_type,
                actor_ref=actor_ref,
                subject_type=subject_type,
                subject_ref=subject_ref,
                before_state=before_state or {},
                after_state=after_state or {},
            )
        )
