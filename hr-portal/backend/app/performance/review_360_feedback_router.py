"""360° feedback reviewer-side list and voluntary evaluation.

The reviewer sees the evaluation tasks they hold on the project's 360° node
(created by invitation, system default, or their own voluntary evaluation).
Voluntary evaluation creates a normal evaluation task for the reviewer; it does
not touch the locked authorization snapshot and does not consume the reviewee's
invitation quota. A pending voluntary evaluation can be abandoned by its own
reviewer (``giveup``), which revokes the task so it disappears from the list.
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
    DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
    DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
    PerformanceAuditEvent,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceNodeTask,
    PerformanceOtherSetting,
    PerformanceProject,
    PerformanceProjectNodeSnapshot,
)
from app.performance.review_360_invites_router import (
    INVITE_SOURCE_LABELS,
    _employment_status,
    _evaluation_node,
    _get_project,
    _invite_settings,
    _latest_member_snapshot_id,
    _locked_snapshot,
    _parse_node_time,
    _people_by_no,
    _project_nodes,
    _snapshot_people,
)

router = APIRouter(prefix="/performance/review-360/feedback", tags=["performance-review-360"])
VOLUNTARY_AUDIT_EVENT = "REVIEWER_360_VOLUNTEERED"
GIVEUP_AUDIT_EVENT = "REVIEWER_360_VOLUNTARY_GIVEUP"


class FeedbackItemOut(BaseModel):
    task_id: int
    employee_no: str
    display_name: str
    department: str | None = None
    job_sequence: str | None = None
    position_level: str | None = None
    status: str
    source_label: str
    relationship: str
    due_at: str | None = None
    can_giveup: bool = False


class FeedbackListOut(BaseModel):
    items: list[FeedbackItemOut]
    total: int
    node_id: str | None = None
    allow_voluntary_evaluation: bool = False


class FeedbackCandidateOut(BaseModel):
    employee_no: str
    display_name: str
    department: str | None = None
    job_sequence: str | None = None


class FeedbackCandidatesOut(BaseModel):
    items: list[FeedbackCandidateOut]
    total: int


class VoluntaryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_employee_no: str = Field(min_length=1, max_length=64)
    node_id: str | None = Field(default=None, min_length=1, max_length=128)


class VoluntaryResultOut(BaseModel):
    task_id: int
    target_employee_no: str


class GiveUpPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: int = Field(ge=1)
    node_id: str | None = Field(default=None, min_length=1, max_length=128)


async def _overdue_voluntary_allowed(db: AsyncSession) -> bool:
    setting = await db.get(PerformanceOtherSetting, 1)
    return setting is not None and setting.overdue_voluntary_360_submission_enabled


async def _voluntary_permission_error(db, project, node, nodes):
    if node is None:
        return 409, "REVIEWER_360_NODE_NOT_CONFIGURED"
    if not _invite_settings(project, node.node_id, nodes=nodes).get("allow_voluntary_evaluation"):
        return 403, "VOLUNTARY_NOT_ALLOWED"
    start_at, end_at = _node_window(project, node)
    now = datetime.now(UTC)
    if start_at is not None and now < start_at:
        return 409, "VOLUNTARY_WINDOW_NOT_OPEN"
    if end_at is not None and now > end_at and not await _overdue_voluntary_allowed(db):
        return 409, "VOLUNTARY_WINDOW_CLOSED"
    return None


async def _require_voluntary_permission(db, project, node, nodes):
    error = await _voluntary_permission_error(db, project, node, nodes)
    if error:
        raise HTTPException(status_code=error[0], detail=error[1])


def _node_window(
    project: PerformanceProject, node: PerformanceProjectNodeSnapshot
) -> tuple[datetime | None, datetime | None]:
    timing = ((project.settings or {}).get("flow_settings") or {}).get("node_times") or {}
    node_time = timing.get(node.node_id) or (node.config or {}).get("time") or {}
    return (
        _parse_node_time(node_time.get("start_at")),
        _parse_node_time(node_time.get("end_at") or node_time.get("appeal_deadline")),
    )


async def _resolve_cycle_member_employee(
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
    snapshot = await _locked_snapshot(db, project)
    member = await db.scalar(
        select(PerformanceAuthorizationSnapshotPerson.id).where(
            PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id,
            PerformanceAuthorizationSnapshotPerson.employee_no == actor.actor_ref,
        )
    )
    if member is None:
        raise HTTPException(status_code=403, detail="CYCLE_MEMBER_REQUIRED")
    return actor.actor_ref


async def _reviewer_tasks(
    db: AsyncSession,
    project_id: int,
    node_id: int | None,
    handler_ref: str,
) -> list[PerformanceNodeTask]:
    if node_id is None:
        return []
    rows = (
        await db.execute(
            select(PerformanceNodeTask)
            .where(
                PerformanceNodeTask.project_id == project_id,
                PerformanceNodeTask.node_snapshot_id == node_id,
                PerformanceNodeTask.handler_ref == handler_ref,
                PerformanceNodeTask.task_kind == "evaluation",
                PerformanceNodeTask.revoked_at.is_(None),
            )
            .order_by(PerformanceNodeTask.created_at, PerformanceNodeTask.id)
        )
    ).scalars().all()
    return list(rows)


async def _feedback_source_labels(
    db: AsyncSession,
    project: PerformanceProject,
    handler_ref: str,
    node_id: str | None = None,
) -> dict[str, str]:
    rows = (
        await db.execute(
            select(PerformanceAuditEvent)
            .where(
                PerformanceAuditEvent.cycle_ref == project.cycle_ref,
                PerformanceAuditEvent.subject_ref == handler_ref,
                PerformanceAuditEvent.event_type.in_({"REVIEWER_360_INVITED", VOLUNTARY_AUDIT_EVENT}),
            )
            .order_by(PerformanceAuditEvent.event_at, PerformanceAuditEvent.id)
        )
    ).scalars().all()
    labels: dict[str, str] = {}
    for event in rows:
        after = event.after_state or {}
        if str(after.get("project_id")) != str(project.id):
            continue
        if node_id is not None and after.get("node_id") != node_id:
            continue
        target = str(event.employee_no or "")
        if not target:
            continue
        labels[target] = INVITE_SOURCE_LABELS.get(
            after.get("source_type") or "", INVITE_SOURCE_LABELS["SELF"]
        )
    return labels


def _relationship(
    actor: PerformanceAuthorizationSnapshotPerson | None,
    target: PerformanceAuthorizationSnapshotPerson | None,
) -> str:
    if actor is None or target is None:
        return "同事"
    if actor.direct_supervisor_employee_no == target.employee_no:
        return "直属上级"
    if target.direct_supervisor_employee_no == actor.employee_no:
        return "直属下级"
    return "同事"


async def _evaluated_employee_nos(db: AsyncSession, project_id: int) -> list[str]:
    rows = (
        await db.execute(
            select(PerformanceNodeTask.target_employee_no)
            .where(PerformanceNodeTask.project_id == project_id)
            .distinct()
        )
    ).scalars().all()
    return [str(value) for value in rows]


@router.get("/projects/{project_id}", response_model=FeedbackListOut)
async def list_feedback(
    project_id: int,
    node_id: str | None = None,
    keyword: str | None = Query(default=None, max_length=128),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    snapshot = await _locked_snapshot(db, project)
    actor_ref = await _resolve_cycle_member_employee(db, context, project)
    nodes = await _project_nodes(db, project.id)
    node = await _evaluation_node(db, project.id, node_id, nodes=nodes)
    allow_voluntary = await _voluntary_permission_error(db, project, node, nodes) is None
    tasks = await _reviewer_tasks(db, project.id, node.id if node else None, actor_ref)
    member_snapshot_id = await _latest_member_snapshot_id(db, project.id)
    tasks = [task for task in tasks if task.member_snapshot_id == member_snapshot_id]
    people_by_no = _people_by_no(await _snapshot_people(db, snapshot.id))
    labels = await _feedback_source_labels(db, project, actor_ref, node.node_id if node else None)
    items: list[FeedbackItemOut] = []
    for task in tasks:
        person = people_by_no.get(task.target_employee_no)
        is_completed = task.status == "rejected" or task.submitted_at is not None or task.status == "completed"
        items.append(
            FeedbackItemOut(
                task_id=task.id,
                employee_no=task.target_employee_no,
                display_name=person.display_name if person else task.target_employee_no,
                department=organization_leaf(person) if person else None,
                job_sequence=format_job_sequence(person.job_family, person.job_category) if person else None,
                position_level=person.position_level if person else None,
                status="rejected" if task.status == "rejected" else ("completed" if is_completed else "pending"),
                source_label=labels.get(task.target_employee_no, INVITE_SOURCE_LABELS["SELF"]),
                relationship=_relationship(people_by_no.get(actor_ref), person),
                due_at=task.due_at.isoformat() if task.due_at else None,
                can_giveup=getattr(task, "source_type", None) == "VOLUNTARY" and not is_completed,
            )
        )
    if keyword:
        lowered = keyword.strip().lower()
        items = [
            item for item in items
            if lowered in item.display_name.lower() or lowered in item.employee_no.lower()
        ]
    return FeedbackListOut(
        items=items,
        total=len(items),
        node_id=node.node_id if node else None,
        allow_voluntary_evaluation=allow_voluntary,
    )


@router.get("/projects/{project_id}/candidates", response_model=FeedbackCandidatesOut)
async def list_voluntary_candidates(
    project_id: int,
    node_id: str | None = None,
    keyword: str | None = Query(default=None, max_length=128),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    snapshot = await _locked_snapshot(db, project)
    actor_ref = await _resolve_cycle_member_employee(db, context, project)
    nodes = await _project_nodes(db, project.id)
    node = await _evaluation_node(db, project.id, node_id, nodes=nodes)
    await _require_voluntary_permission(db, project, node, nodes)
    evaluated = set(await _evaluated_employee_nos(db, project.id))
    people = [
        person for person in await _snapshot_people(db, snapshot.id)
        if person.employee_no in evaluated
        and person.employee_no != actor_ref
        and _employment_status(person) != "离职"
    ]
    if keyword:
        lowered = keyword.strip().lower()
        people = [
            person for person in people
            if lowered in person.display_name.lower() or lowered in person.employee_no.lower()
        ]
    return FeedbackCandidatesOut(
        items=[
            FeedbackCandidateOut(
                employee_no=person.employee_no,
                display_name=person.display_name,
                department=organization_leaf(person),
                job_sequence=format_job_sequence(person.job_family, person.job_category),
            )
            for person in people
        ],
        total=len(people),
    )


@router.post("/projects/{project_id}/voluntary", response_model=VoluntaryResultOut)
async def start_voluntary_evaluation(
    project_id: int,
    payload: VoluntaryPayload,
    node_id: str | None = None,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    if payload.node_id is not None and node_id is not None and payload.node_id != node_id:
        raise HTTPException(status_code=409, detail="REVIEWER_360_NODE_MISMATCH")
    node_id = payload.node_id if payload.node_id is not None else node_id
    project = await _get_project(db, project_id)
    snapshot = await _locked_snapshot(db, project)
    actor_ref = await _resolve_cycle_member_employee(db, context, project)
    nodes = await _project_nodes(db, project.id)
    node = await _evaluation_node(db, project.id, node_id, nodes=nodes)
    await _require_voluntary_permission(db, project, node, nodes)
    member_snapshot_id = await _latest_member_snapshot_id(db, project.id)
    if member_snapshot_id is None:
        raise HTTPException(status_code=409, detail="PROJECT_MEMBER_SNAPSHOT_NOT_FOUND")
    target_no = payload.target_employee_no.strip()
    if target_no == actor_ref:
        raise HTTPException(status_code=400, detail="CANNOT_EVALUATE_SELF")
    people_by_no = _people_by_no(await _snapshot_people(db, snapshot.id))
    target = people_by_no.get(target_no)
    if target is None or _employment_status(target) == "离职":
        raise HTTPException(status_code=404, detail="TARGET_NOT_FOUND")
    if target_no not in set(await _evaluated_employee_nos(db, project.id)):
        raise HTTPException(status_code=422, detail="TARGET_NOT_EVALUATED")
    start_at, end_at = _node_window(project, node)
    existing_query = select(PerformanceNodeTask.id).where(
        PerformanceNodeTask.project_id == project.id,
        PerformanceNodeTask.member_snapshot_id == member_snapshot_id,
        PerformanceNodeTask.node_snapshot_id == node.id,
        PerformanceNodeTask.target_employee_no == target_no,
        PerformanceNodeTask.handler_ref == actor_ref,
        PerformanceNodeTask.task_kind == "evaluation",
        PerformanceNodeTask.phase_id == "",
        PerformanceNodeTask.revoked_at.is_(None),
    )
    existing = await db.scalar(existing_query)
    if existing is not None:
        return VoluntaryResultOut(task_id=existing, target_employee_no=target_no)
    task = PerformanceNodeTask(
        project_id=project.id,
        cycle_ref=project.cycle_ref,
        member_snapshot_id=member_snapshot_id,
        node_snapshot_id=node.id,
        target_employee_no=target_no,
        handler_ref=actor_ref,
        task_kind="evaluation",
        phase_id="",
        available_at=start_at,
        due_at=end_at,
        status="pending",
        source_type="VOLUNTARY",
    )
    db.add(task)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(existing_query)
        if existing is None:
            raise
        return VoluntaryResultOut(task_id=existing, target_employee_no=target_no)
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type=VOLUNTARY_AUDIT_EVENT,
            cycle_ref=project.cycle_ref,
            employee_no=target_no,
            actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
            actor_ref=actor_ref,
            subject_type=DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
            subject_ref=actor_ref,
            after_state={
                "project_id": project.id,
                "node_id": node.node_id,
                "task_id": task.id,
                "source_type": "VOLUNTARY",
                "assigned_by_type": DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
                "assigned_by_ref": actor_ref,
            },
        )
    )
    await db.commit()
    return VoluntaryResultOut(task_id=task.id, target_employee_no=target_no)


@router.post("/projects/{project_id}/giveup", response_model=VoluntaryResultOut)
async def giveup_voluntary_evaluation(
    project_id: int,
    payload: GiveUpPayload,
    node_id: str | None = None,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    """放弃一条尚未提交的自愿 360° 评估：撤销该评估任务并从评估人列表移除。

    仅限评估人本人操作；仅限 ``REVIEWER_360_VOLUNTEERED``（自愿评估）来源；
    已提交/已撤销/非最新快照/非 360 评估节点的任务不可放弃。
    """
    if payload.node_id is not None and node_id is not None and payload.node_id != node_id:
        raise HTTPException(status_code=409, detail="REVIEWER_360_NODE_MISMATCH")
    node_id = payload.node_id if payload.node_id is not None else node_id
    project = await _get_project(db, project_id)
    await _locked_snapshot(db, project)
    actor_ref = await _resolve_cycle_member_employee(db, context, project)
    nodes = await _project_nodes(db, project.id)
    node = await _evaluation_node(db, project.id, node_id, nodes=nodes)
    if node is None:
        raise HTTPException(status_code=409, detail="REVIEWER_360_NODE_NOT_CONFIGURED")
    task = await db.scalar(
        select(PerformanceNodeTask).where(
            PerformanceNodeTask.id == payload.task_id,
            PerformanceNodeTask.project_id == project.id,
            PerformanceNodeTask.node_snapshot_id == node.id,
            PerformanceNodeTask.task_kind == "evaluation",
            PerformanceNodeTask.handler_ref == actor_ref,
            PerformanceNodeTask.revoked_at.is_(None),
        )
    )
    if task is None:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    if task.submitted_at is not None or task.status == "completed":
        raise HTTPException(status_code=409, detail="TASK_ALREADY_SUBMITTED")
    member_snapshot_id = await _latest_member_snapshot_id(db, project.id)
    if task.member_snapshot_id != member_snapshot_id:
        raise HTTPException(status_code=409, detail="TASK_SNAPSHOT_CHANGED")
    if getattr(task, "source_type", None) != "VOLUNTARY":
        raise HTTPException(status_code=409, detail="TASK_NOT_VOLUNTARY")
    now = datetime.now(UTC)
    task.revoked_at = now
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type=GIVEUP_AUDIT_EVENT,
            cycle_ref=project.cycle_ref,
            employee_no=task.target_employee_no,
            actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
            actor_ref=actor_ref,
            subject_type=DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
            subject_ref=actor_ref,
            after_state={
                "project_id": project.id,
                "node_id": node.node_id,
                "task_id": task.id,
                "source_type": "VOLUNTARY",
                "revoked_at": now.isoformat(),
            },
        )
    )
    await db.commit()
    return VoluntaryResultOut(task_id=task.id, target_employee_no=task.target_employee_no)
