"""360° feedback reviewer invitation API.

A runtime invitation is represented by a project-scoped evaluation task. The
cycle authorization snapshot stays immutable after lock; audit events retain
who invited the reviewer and when.
"""
from __future__ import annotations

from datetime import UTC, datetime

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
from app.performance.member_identity_service import hydrate_member_identities
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
    PerformanceOtherSetting,
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
    identity_status: dict | None = None
    source_type: str = "UNKNOWN"
    relationship: str | None = None
    can_revoke: bool = False
    revoke_disabled_reason: str | None = None
    is_manual_by_actor: bool = False


class InviteListOut(BaseModel):
    project_id: int | None = None
    task_id: int | None = None
    employee_no: str | None = None
    node_id: str | None = None
    version: str | None = None
    count: int = 0
    manual_count: int = 0
    can_invite: bool = False
    editable: bool = False
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
    reviewer_360_version: str | None = Field(default=None, max_length=64)


class InviteSubmitOut(BaseModel):
    accepted_count: int
    reviewer_360: dict | None = None
    version: str | None = None
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


def _is_360_evaluation_node(node) -> bool:
    return node.node_type == "evaluation" and node_role_code((node.config or {}).get("template") or {}) == ROLE_REVIEWER_360


async def _project_nodes(db: AsyncSession, project_id: int) -> list[PerformanceProjectNodeSnapshot]:
    return list((await db.execute(
        select(PerformanceProjectNodeSnapshot)
        .where(PerformanceProjectNodeSnapshot.project_id == project_id)
        .order_by(PerformanceProjectNodeSnapshot.node_order, PerformanceProjectNodeSnapshot.id)
    )).scalars().all())


async def _evaluation_node(
    db: AsyncSession, project_id: int, node_id: str | None = None, nodes=None,
) -> PerformanceProjectNodeSnapshot | None:
    nodes = await _project_nodes(db, project_id) if nodes is None else nodes
    if node_id is not None:
        node = next((node for node in nodes if node.node_id == node_id), None)
        if node is None:
            raise HTTPException(status_code=404, detail="REVIEWER_360_NODE_NOT_FOUND")
        if not _is_360_evaluation_node(node):
            raise HTTPException(status_code=409, detail="REVIEWER_360_NODE_REQUIRED")
        return node
    return next((node for node in nodes if _is_360_evaluation_node(node)), None)


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


def _invite_settings(project: PerformanceProject, node_id: str | None = None, nodes=None) -> dict:
    settings = (((project.settings or {}).get("flow_settings") or {}).get("node_settings") or {})
    if nodes is not None:
        ordered = sorted(nodes, key=lambda node: getattr(node, "node_order", 0))
        relevant = [node for node in ordered if _is_360_evaluation_node(node)]
        relevant += [node for node in ordered if node.node_type == "reviewer_360_invite"]
        for node in relevant:
            invite = (settings.get(node.node_id) or {}).get("invite")
            if isinstance(invite, dict) and invite:
                return invite
        return {}
    return next(((value or {})["invite"] for value in settings.values() if (value or {}).get("invite")), {})


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
    source_task_id: int | None = Query(default=None, ge=1),
):
    from app.performance import reviewer_360_task_service as service

    task, node, project, actor, snapshot, _target, editable = await service.task_context(db, context, project_id, source_task_id)
    data = await service.roster(db, task, node, project, editable=editable, actor_ref=actor.actor_ref)
    if keyword:
        lowered = keyword.strip().lower()
        data["items"] = [item for item in data["items"] if lowered in item["display_name"].lower() or lowered in item["employee_no"].lower()]
    await hydrate_member_identities(db, [(item, project.id, snapshot.id) for item in data["items"]], include_delegations=False)
    return InviteListOut(**data)


@router.get("/projects/{project_id}/candidates", response_model=InviteCandidatesOut)
async def list_candidates(
    project_id: int,
    keyword: str | None = Query(default=None, max_length=128),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
    source_task_id: int | None = Query(default=None, ge=1),
):
    from app.performance import reviewer_360_task_service as service

    task, node, project, actor, snapshot, _target, editable = await service.task_context(db, context, project_id, source_task_id)
    if not editable:
        raise HTTPException(409, "SUBMISSION_NOT_ALLOWED")
    current = await service.roster(db, task, node, project, editable=editable, actor_ref=actor.actor_ref)
    target_ref = task.target_employee_no
    invited_nos = {item["employee_no"] for item in current["items"]}
    people = await _snapshot_people(db, snapshot.source_snapshot_id)
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
    source_task_id: int | None = Query(default=None, ge=1),
):
    from app.performance import reviewer_360_task_service as service

    task, source_node, project, actor, snapshot, evaluation_node, _editable = await service.task_context(db, context, project_id, source_task_id, write=True)
    current = await service.roster(db, task, source_node, project, editable=True, actor_ref=actor.actor_ref)
    service.require_version(payload.reviewer_360_version, current["version"])
    target_ref = task.target_employee_no
    member_snapshot_id = snapshot.id
    existing_nos = {item["employee_no"] for item in current["items"]}
    people_by_no = _people_by_no(await _snapshot_people(db, snapshot.source_snapshot_id))
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

    maximum_count = current["maximum_invited_count"]
    maximum_mode = current["maximum_invite_mode"]
    if accepted and maximum_count is not None and maximum_mode == "LIMIT":
        capacity = int(maximum_count) - current["count"]
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
                    actor_type=actor.actor_type,
                    actor_ref=actor.actor_ref,
                    cycle_ref=project.cycle_ref,
                    employee_no=target_ref,
                    subject_type=DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
                    subject_ref=employee_no,
                    after_state={
                        "project_id": project.id,
                        "node_id": evaluation_node.node_id,
                        "source_type": "SELF" if str(actor.actor_ref) == target_ref else "MANUAL",
                        "assigned_by_type": actor.actor_type,
                        "assigned_by_ref": str(actor.actor_ref),
                        "source_task_id": task.id,
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
                    PerformanceNodeTask.revoked_at.is_(None),
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
                        source_type="INVITE",
                    )
                )
        await db.commit()
    current = await service.roster(db, task, source_node, project, editable=True, actor_ref=actor.actor_ref)
    return InviteSubmitOut(
        accepted_count=len(accepted),
        already_invited=already,
        rejected=rejected,
        reviewer_360=current,
        version=current["version"],
    )


@router.delete("/projects/{project_id}/{employee_no}")
async def revoke_invite(
    project_id: int,
    employee_no: str,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
    source_task_id: int | None = Query(default=None, ge=1),
    reviewer_360_version: str | None = Query(default=None, max_length=64),
):
    from app.performance import reviewer_360_task_service as service

    task, node, project, actor, _snapshot, _target, _editable = await service.task_context(db, context, project_id, source_task_id, write=True)
    current = await service.roster(db, task, node, project, editable=True, actor_ref=actor.actor_ref)
    service.require_version(reviewer_360_version, current["version"])
    if not any(item["employee_no"] == employee_no for item in current["items"]):
        raise HTTPException(404, "INVITE_NOT_FOUND")
    raise HTTPException(403, "REVIEWER_360_REVOKE_NOT_ENABLED")
