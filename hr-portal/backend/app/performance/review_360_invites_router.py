"""360° feedback reviewer invitation API.

A runtime invitation is represented by a project-scoped evaluation task. The
cycle authorization snapshot stays immutable after lock; audit events retain
who invited the reviewer and when.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.data.employee_roster_contract import format_job_sequence, organization_leaf
from app.performance.auth_context import (
    PerformanceAccessContext,
    PerformanceIdentityMappingNotFound,
    get_performance_access_context,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import (
    AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
    DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
    DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceAuditEvent,
    PerformanceNodeTask,
    PerformanceProject,
    PerformanceProjectMember,
    PerformanceProjectMemberSnapshot,
    PerformanceProjectNodeSnapshot,
    PROJECT_STATUS_STARTED,
)
from app.performance.project_service import _parse_time
from app.performance.assessment_roles import ROLE_REVIEWER_360, node_role_code

router = APIRouter(prefix="/performance/review-360/invites", tags=["performance-review-360"])
INVITE_SOURCE_LABELS = {
    "SELF": "自己邀请",
    "DEFAULT": "系统默认邀请",
    "VOLUNTARY": "自愿评估",
}


class InvitedReviewerOut(BaseModel):
    employee_no: str
    display_name: str
    department: str | None = None
    job_family: str | None = None
    job_category: str | None = None
    job_sequence: str | None = None
    position_level: str | None = None
    status: str
    source_label: str
    invited_at: str | None = None
    due_at: str | None = None


class InviteListOut(BaseModel):
    items: list[InvitedReviewerOut]
    total: int
    minimum_invited_count: int
    maximum_invited_count: int | None = None
    maximum_invite_mode: str = "SUGGESTED"
    second_prompt_enabled: bool = False
    second_prompt_count: int | None = None
    second_prompt_mode: str = "SUGGESTED"
    exclude_default_invite_from_limit: bool = False


class InviteCandidateOut(BaseModel):
    employee_no: str
    display_name: str
    department: str | None = None
    job_family: str | None = None
    job_category: str | None = None
    job_sequence: str | None = None
    position_level: str | None = None
    employment_status: str | None = None


class InviteCandidatesOut(BaseModel):
    items: list[InviteCandidateOut]
    total: int


class InvitePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    employee_nos: list[str] = Field(min_length=1, max_length=100)


class InviteSubmitOut(BaseModel):
    accepted_count: int
    already_invited: list[str] = Field(default_factory=list)
    rejected: list[str] = Field(default_factory=list)


async def _get_project(db: AsyncSession, project_id: int) -> PerformanceProject:
    project = await db.get(PerformanceProject, project_id)
    if project is None or project.status != PROJECT_STATUS_STARTED:
        raise HTTPException(status_code=404, detail="PROJECT_NOT_FOUND")
    return project


async def _resolve_reviewee_employee(
    db: AsyncSession,
    context: PerformanceAccessContext,
    project: PerformanceProject,
) -> str:
    try:
        actor = await resolve_trusted_performance_actor(
            db, context, cycle_ref=project.cycle_ref, require_employee_identity=True
        )
    except PerformanceIdentityMappingNotFound:
        raise HTTPException(status_code=403, detail="EMPLOYEE_IDENTITY_REQUIRED") from None
    if actor.actor_type != DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE:
        raise HTTPException(status_code=403, detail="EMPLOYEE_IDENTITY_REQUIRED")
    is_member = await db.scalar(
        select(PerformanceProjectMember.id).where(
            PerformanceProjectMember.snapshot_id == _latest_member_snapshot_scalar(project.id),
            PerformanceProjectMember.employee_no == actor.actor_ref,
        )
    )
    if is_member is None:
        raise HTTPException(status_code=403, detail="PROJECT_MEMBER_REQUIRED")
    return actor.actor_ref


async def _locked_snapshot(db: AsyncSession, project: PerformanceProject) -> PerformanceAuthorizationSnapshot:
    snapshot = (
        await db.execute(
            select(PerformanceAuthorizationSnapshot).where(
                PerformanceAuthorizationSnapshot.cycle_ref == project.cycle_ref
            )
        )
    ).scalar_one_or_none()
    if snapshot is None or snapshot.status != AUTHORIZATION_SNAPSHOT_STATUS_LOCKED:
        raise HTTPException(status_code=409, detail="CYCLE_SNAPSHOT_NOT_LOCKED")
    return snapshot


async def _latest_member_snapshot_id(db: AsyncSession, project_id: int) -> int | None:
    return await db.scalar(
        select(func.max(PerformanceProjectMemberSnapshot.id)).where(
            PerformanceProjectMemberSnapshot.project_id == project_id
        )
    )


def _latest_member_snapshot_scalar(project_id: int):
    return (
        select(func.max(PerformanceProjectMemberSnapshot.id))
        .where(PerformanceProjectMemberSnapshot.project_id == project_id)
        .scalar_subquery()
    )


async def _snapshot_people(
    db: AsyncSession, snapshot_id: int
) -> list[PerformanceAuthorizationSnapshotPerson]:
    rows = (
        await db.execute(
            select(PerformanceAuthorizationSnapshotPerson)
            .where(PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot_id)
            .order_by(PerformanceAuthorizationSnapshotPerson.display_name)
        )
    ).scalars().all()
    return list(rows)


async def _evaluation_node(db: AsyncSession, project_id: int) -> PerformanceProjectNodeSnapshot | None:
    nodes = (
        await db.execute(
            select(PerformanceProjectNodeSnapshot)
            .where(
                PerformanceProjectNodeSnapshot.project_id == project_id,
                PerformanceProjectNodeSnapshot.node_type == "evaluation",
            )
            .order_by(PerformanceProjectNodeSnapshot.node_order)
        )
    ).scalars().all()
    return next(
        (node for node in nodes if node_role_code((node.config or {}).get("template") or {}) == ROLE_REVIEWER_360),
        None,
    )


async def _invite_tasks(
    db: AsyncSession,
    project_id: int,
    node_id: int | None,
    target_ref: str,
) -> list[PerformanceNodeTask]:
    if node_id is None:
        return []
    rows = (
        await db.execute(
            select(PerformanceNodeTask)
            .where(
                PerformanceNodeTask.project_id == project_id,
                PerformanceNodeTask.node_snapshot_id == node_id,
                PerformanceNodeTask.target_employee_no == target_ref,
                PerformanceNodeTask.task_kind == "evaluation",
            )
            .order_by(PerformanceNodeTask.created_at, PerformanceNodeTask.id)
        )
    ).scalars().all()
    return list(rows)


async def _invite_audit_events(
    db: AsyncSession,
    project: PerformanceProject,
    target_ref: str,
) -> list[PerformanceAuditEvent]:
    rows = (
        await db.execute(
            select(PerformanceAuditEvent)
            .where(
                PerformanceAuditEvent.cycle_ref == project.cycle_ref,
                PerformanceAuditEvent.employee_no == target_ref,
                PerformanceAuditEvent.event_type.in_(
                    {"REVIEWER_360_INVITED", "REVIEWER_360_REVOKED"}
                ),
            )
            .order_by(PerformanceAuditEvent.event_at, PerformanceAuditEvent.id)
        )
    ).scalars().all()
    return list(rows)


def _active_invites_from_audit(
    events: list[PerformanceAuditEvent], project_id: int
) -> dict[str, PerformanceAuditEvent]:
    active: dict[str, PerformanceAuditEvent] = {}
    for event in events:
        employee_no = str(event.subject_ref or "")
        if not employee_no:
            continue
        event_project_id = (event.after_state or {}).get("project_id") or (event.before_state or {}).get("project_id")
        if str(event_project_id) != str(project_id):
            continue
        if event.event_type == "REVIEWER_360_INVITED":
            active[employee_no] = event
        elif event.event_type == "REVIEWER_360_REVOKED":
            active.pop(employee_no, None)
    return active


def _invite_count_for_limit(
    active_invites: dict[str, PerformanceAuditEvent], *, exclude_default: bool
) -> int:
    if not exclude_default:
        return len(active_invites)
    return sum(
        1 for event in active_invites.values()
        if (event.after_state or {}).get("source_type") != "DEFAULT"
    )


async def _invite_settings(project: PerformanceProject) -> dict:
    flow_settings = ((project.settings or {}).get("flow_settings") or {}).get("node_settings") or {}
    for value in flow_settings.values():
        if (value or {}).get("invite"):
            return (value or {})["invite"]
    return {}


def _people_by_no(
    people: list[PerformanceAuthorizationSnapshotPerson],
) -> dict[str, PerformanceAuthorizationSnapshotPerson]:
    return {person.employee_no: person for person in people}


def _employment_status(person: PerformanceAuthorizationSnapshotPerson) -> str | None:
    return person.live_employment_status or person.employment_status


def _parse_node_time(value: object) -> datetime | None:
    if not value:
        return None
    try:
        return _parse_time(value)
    except ValueError:
        raise HTTPException(status_code=422, detail="INVALID_NODE_TIME") from None


def _candidate_out(person: PerformanceAuthorizationSnapshotPerson) -> InviteCandidateOut:
    return InviteCandidateOut(
        employee_no=person.employee_no,
        display_name=person.display_name,
        department=organization_leaf(person),
        job_family=person.job_family,
        job_category=person.job_category,
        job_sequence=format_job_sequence(person.job_family, person.job_category),
        position_level=person.position_level,
        employment_status=_employment_status(person),
    )


@router.get("/projects/{project_id}", response_model=InviteListOut)
async def list_invites(
    project_id: int,
    keyword: str | None = Query(default=None, max_length=128),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    target_ref = await _resolve_reviewee_employee(db, context, project)
    snapshot = await _locked_snapshot(db, project)
    evaluation_node = await _evaluation_node(db, project.id)
    member_snapshot_id = await _latest_member_snapshot_id(db, project.id)
    task_rows = await _invite_tasks(db, project.id, evaluation_node.id if evaluation_node else None, target_ref)
    audit_events = await _invite_audit_events(db, project, target_ref)
    active_invites = _active_invites_from_audit(audit_events, project.id)
    tasks_by_handler: dict[str, list[PerformanceNodeTask]] = {}
    for task in task_rows:
        if task.member_snapshot_id == member_snapshot_id:
            tasks_by_handler.setdefault(str(task.handler_ref), []).append(task)
    people_by_no = _people_by_no(await _snapshot_people(db, snapshot.id))
    invite_settings = await _invite_settings(project)
    minimum_count = int(invite_settings.get("minimum_invited_count") or 0)
    maximum_count = invite_settings.get("maximum_invited_count")
    maximum_mode = invite_settings.get("maximum_invite_mode") or "SUGGESTED"
    second_enabled = bool(invite_settings.get("second_prompt_enabled", False))
    second_count = invite_settings.get("second_prompt_count")
    second_mode = invite_settings.get("second_prompt_mode") or "SUGGESTED"
    exclude_default = bool(invite_settings.get("exclude_default_invite_from_limit", False))
    items = []
    for employee_no, event in active_invites.items():
        person = people_by_no.get(employee_no)
        handler_tasks = tasks_by_handler.get(employee_no, [])
        task = min(handler_tasks, key=lambda item: item.id) if handler_tasks else None
        assigned_by_ref = (event.after_state or {}).get("assigned_by_ref")
        source_type = (event.after_state or {}).get("source_type")
        source_label = INVITE_SOURCE_LABELS["DEFAULT"] if source_type == "DEFAULT" else (INVITE_SOURCE_LABELS["SELF"] if assigned_by_ref == target_ref else INVITE_SOURCE_LABELS["VOLUNTARY"])
        items.append(
            InvitedReviewerOut(
                employee_no=employee_no,
                display_name=person.display_name if person else "",
                department=organization_leaf(person) if person else None,
                job_family=person.job_family if person else None,
                job_category=person.job_category if person else None,
                job_sequence=format_job_sequence(person.job_family, person.job_category) if person else None,
                position_level=person.position_level if person else None,
                status="completed" if task is not None and task.submitted_at is not None else ("pending" if task is not None else "invited"),
                source_label=source_label,
                invited_at=event.event_at.isoformat() if event.event_at else None,
                due_at=task.due_at.isoformat() if task is not None and task.due_at else None,
            )
        )
    if keyword:
        lowered = keyword.strip().lower()
        items = [
            item for item in items
            if lowered in item.display_name.lower() or lowered in item.employee_no.lower()
        ]
    return InviteListOut(
        items=items,
        total=len(items),
        minimum_invited_count=minimum_count,
        maximum_invited_count=maximum_count,
        maximum_invite_mode=maximum_mode,
        second_prompt_enabled=second_enabled,
        second_prompt_count=second_count,
        second_prompt_mode=second_mode,
        exclude_default_invite_from_limit=exclude_default,
    )


@router.get("/projects/{project_id}/candidates", response_model=InviteCandidatesOut)
async def list_candidates(
    project_id: int,
    keyword: str | None = Query(default=None, max_length=128),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    target_ref = await _resolve_reviewee_employee(db, context, project)
    snapshot = await _locked_snapshot(db, project)
    events = await _invite_audit_events(db, project, target_ref)
    invited_nos = set(_active_invites_from_audit(events, project.id))
    people = await _snapshot_people(db, snapshot.id)
    candidates = [
        person for person in people
        if person.employee_no != target_ref
        and person.employee_no not in invited_nos
        and _employment_status(person) != "离职"
    ]
    if keyword:
        lowered = keyword.strip().lower()
        candidates = [
            person for person in candidates
            if lowered in person.display_name.lower() or lowered in person.employee_no.lower()
        ]
    return InviteCandidatesOut(
        items=[_candidate_out(person) for person in candidates],
        total=len(candidates),
    )


@router.post("/projects/{project_id}", response_model=InviteSubmitOut)
async def submit_invites(
    project_id: int,
    payload: InvitePayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    target_ref = await _resolve_reviewee_employee(db, context, project)
    snapshot = await _locked_snapshot(db, project)
    evaluation_node = await _evaluation_node(db, project.id)
    if evaluation_node is None:
        raise HTTPException(status_code=409, detail="REVIEWER_360_NODE_NOT_CONFIGURED")
    member_snapshot_id = await _latest_member_snapshot_id(db, project.id)
    if member_snapshot_id is None:
        raise HTTPException(status_code=409, detail="PROJECT_MEMBER_SNAPSHOT_NOT_FOUND")
    events = await _invite_audit_events(db, project, target_ref)
    active_invites = _active_invites_from_audit(events, project.id)
    existing_nos = set(active_invites)
    people_by_no = _people_by_no(await _snapshot_people(db, snapshot.id))
    accepted, already, rejected = [], [], []
    for employee_no in dict.fromkeys(payload.employee_nos):
        if employee_no in existing_nos:
            already.append(employee_no)
            continue
        person = people_by_no.get(employee_no)
        if person is None or employee_no == target_ref:
            rejected.append(employee_no)
            continue
        if _employment_status(person) == "离职":
            rejected.append(employee_no)
            continue
        accepted.append(employee_no)

    invite_settings = await _invite_settings(project)
    maximum_count = invite_settings.get("maximum_invited_count")
    maximum_mode = invite_settings.get("maximum_invite_mode") or "SUGGESTED"
    exclude_default = bool(invite_settings.get("exclude_default_invite_from_limit", False))
    if accepted and maximum_count is not None and maximum_mode == "LIMIT":
        capacity = int(maximum_count) - _invite_count_for_limit(active_invites, exclude_default=exclude_default)
        if capacity <= 0:
            raise HTTPException(status_code=422, detail="INVITE_LIMIT_REACHED")
        accepted, overflow = accepted[:capacity], accepted[capacity:]
        rejected.extend(overflow)

    if accepted:
        timing = ((project.settings or {}).get("flow_settings") or {}).get("node_times") or {}
        node_time = timing.get(evaluation_node.node_id) or (evaluation_node.config or {}).get("time") or {}
        available_at = _parse_node_time(node_time.get("start_at"))
        due_at = _parse_node_time(node_time.get("end_at") or node_time.get("appeal_deadline"))
        for employee_no in accepted:
            PerformanceAuditService(db).append_event(
                AuditEventInput(
                    event_type="REVIEWER_360_INVITED",
                    actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
                    actor_ref=target_ref,
                    cycle_ref=project.cycle_ref,
                    employee_no=target_ref,
                    subject_type=DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
                    subject_ref=employee_no,
                    after_state={
                        "project_id": project.id,
                        "node_id": evaluation_node.node_id,
                        "source_type": "SELF",
                        "assigned_by_type": DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
                        "assigned_by_ref": target_ref,
                    },
                )
            )
            exists = await db.scalar(
                select(PerformanceNodeTask.id).where(
                    PerformanceNodeTask.project_id == project.id,
                    PerformanceNodeTask.member_snapshot_id == member_snapshot_id,
                    PerformanceNodeTask.node_snapshot_id == evaluation_node.id,
                    PerformanceNodeTask.target_employee_no == target_ref,
                    PerformanceNodeTask.handler_ref == employee_no,
                    PerformanceNodeTask.task_kind == "evaluation",
                )
            )
            if exists is None:
                db.add(
                    PerformanceNodeTask(
                        project_id=project.id,
                        cycle_ref=project.cycle_ref,
                        member_snapshot_id=member_snapshot_id,
                        node_snapshot_id=evaluation_node.id,
                        target_employee_no=target_ref,
                        handler_ref=employee_no,
                        task_kind="evaluation",
                        phase_id="",
                        available_at=available_at,
                        due_at=due_at,
                        status="pending",
                    )
                )
        await db.commit()
    return InviteSubmitOut(
        accepted_count=len(accepted),
        already_invited=already,
        rejected=rejected,
    )


@router.delete("/projects/{project_id}/{employee_no}")
async def revoke_invite(
    project_id: int,
    employee_no: str,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    target_ref = await _resolve_reviewee_employee(db, context, project)
    await _locked_snapshot(db, project)
    events = await _invite_audit_events(db, project, target_ref)
    active_invites = _active_invites_from_audit(events, project.id)
    invite_event = active_invites.get(employee_no)
    if invite_event is None:
        raise HTTPException(status_code=404, detail="INVITE_NOT_FOUND")
    evaluation_node = await _evaluation_node(db, project.id)
    member_snapshot_id = await _latest_member_snapshot_id(db, project.id)
    if evaluation_node is not None and member_snapshot_id is not None:
        reviewer_tasks = (
            await db.execute(
                select(PerformanceNodeTask).where(
                    PerformanceNodeTask.project_id == project.id,
                    PerformanceNodeTask.member_snapshot_id == member_snapshot_id,
                    PerformanceNodeTask.node_snapshot_id == evaluation_node.id,
                    PerformanceNodeTask.target_employee_no == target_ref,
                    PerformanceNodeTask.handler_ref == employee_no,
                    PerformanceNodeTask.task_kind == "evaluation",
                )
            )
        ).scalars().all()
        if any(task.submitted_at is not None for task in reviewer_tasks):
            raise HTTPException(status_code=409, detail="INVITE_ALREADY_COMPLETED")
        for task in reviewer_tasks:
            await db.delete(task)
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type="REVIEWER_360_REVOKED",
            cycle_ref=project.cycle_ref,
            employee_no=target_ref,
            actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
            actor_ref=target_ref,
            subject_type=DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
            subject_ref=employee_no,
            before_state={
                "project_id": project.id,
                "node_id": evaluation_node.node_id if evaluation_node else None,
                "invited_at": invite_event.event_at.isoformat() if invite_event.event_at else None,
            },
            after_state={
                "project_id": project.id,
                "node_id": evaluation_node.node_id if evaluation_node else None,
                "is_active": False,
            },
        )
    )
    await db.commit()
    return {"revoked": employee_no}
