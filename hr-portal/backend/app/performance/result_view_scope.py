"""Read-only team and focus-person result scopes from frozen cycle snapshots."""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.performance.auth_context import PerformanceAccessContext, resolve_trusted_performance_actor
from app.performance.models import (
    DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
    DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
    DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
    DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_HRBP,
    DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
    PerformanceAuthorizationSnapshot,
    PerformanceCycle,
    PerformanceFocusGroup,
    PerformanceProject,
    PerformanceProjectMember,
    PerformanceProjectMemberSnapshot,
    PROJECT_STATUS_STARTED,
)
from app.performance.snapshot_service import PerformanceAuthorizationSnapshotService

TEAM_RESULT_KIND = "team"
FOCUS_RESULT_KIND = "focus"
RESULT_VIEW_KINDS = {TEAM_RESULT_KIND, FOCUS_RESULT_KIND}
_RESULT_READ_IDENTITIES = (
    DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_HRBP,
    DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
    DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER,
)


@dataclass
class ResultViewScope:
    cycle: PerformanceCycle | None
    actor_ref: str
    projects: list[PerformanceProject] = field(default_factory=list)
    scopes: dict[int, set[str]] = field(default_factory=dict)

    @property
    def employee_nos(self) -> set[str]:
        return set().union(*self.scopes.values()) if self.scopes else set()


def normalize_focus_group_view_permission(value):
    if isinstance(value, bool):
        return None
    if value == 2:
        return 0
    return value if value in (0, 1) else None


def visible_focus_groups(groups, actor_ref: str):
    visible = []
    for group in groups:
        mode = normalize_focus_group_view_permission(group.view_permission)
        if mode == 1 or mode == 0 and actor_ref in (group.followee_user_ids or []):
            visible.append(group)
    return visible


def focus_group_members_for_project(groups, project: PerformanceProject) -> set[str]:
    members = set()
    for group in groups:
        if group.tab == "semester":
            members.update(group.employee_nos or [])
            continue
        refs = {str(value) for value in (group.activity_ids or [])}
        if group.project_ref:
            refs.add(str(group.project_ref))
        if str(project.id) in refs or project.project_ref in refs:
            members.update(group.employee_nos or [])
    return members


async def resolve_result_view_scope(
    db: AsyncSession,
    context: PerformanceAccessContext,
    *,
    cycle_id: int,
    kind: str,
) -> ResultViewScope:
    if kind not in RESULT_VIEW_KINDS:
        raise ValueError("未知绩效结果视图")
    cycle = await db.get(PerformanceCycle, cycle_id)
    if cycle is None:
        return ResultViewScope(cycle=None, actor_ref="")
    actor = await resolve_trusted_performance_actor(
        db, context, cycle_ref=cycle.cycle_ref, require_employee_identity=True,
    )
    if actor.actor_type != "EMPLOYEE":
        return ResultViewScope(cycle=cycle, actor_ref=str(actor.actor_ref))
    actor_ref = str(actor.actor_ref)
    snapshot = await db.scalar(select(PerformanceAuthorizationSnapshot).where(
        PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref,
    ))
    if snapshot is None:
        return ResultViewScope(cycle=cycle, actor_ref=actor_ref)

    snapshot_service = PerformanceAuthorizationSnapshotService(db)
    identities = (DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER, DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER) if kind == TEAM_RESULT_KIND else _RESULT_READ_IDENTITIES
    scopes_by_identity = await snapshot_service.resolve_scopes_batch(
        cycle.cycle_ref, actor_type=actor.actor_type,
        actor_ref=actor_ref, identity_types=identities,
    )
    readable = {
        scope.target_ref
        for scopes in scopes_by_identity.values()
        for scope in scopes
        if scope.target_type == DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE
    }
    if not readable:
        return ResultViewScope(cycle=cycle, actor_ref=actor_ref)

    groups: list[PerformanceFocusGroup] = []
    if kind == FOCUS_RESULT_KIND:
        groups = list((await db.execute(select(PerformanceFocusGroup).where(
            PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
            PerformanceFocusGroup.view_permission.in_([0, 1, 2]),
        ))).scalars().all())
        visible_groups = visible_focus_groups(groups, actor_ref)
        readable.intersection_update(set().union(*(set(group.employee_nos or []) for group in visible_groups)) if visible_groups else set())
        groups = visible_groups
    if not readable:
        return ResultViewScope(cycle=cycle, actor_ref=actor_ref)

    projects = list((await db.execute(select(PerformanceProject).where(
        PerformanceProject.cycle_ref == cycle.cycle_ref,
        PerformanceProject.status == PROJECT_STATUS_STARTED,
    ).order_by(PerformanceProject.id))).scalars().all())
    if not projects:
        return ResultViewScope(cycle=cycle, actor_ref=actor_ref)
    latest = select(
        PerformanceProjectMemberSnapshot.project_id,
        func.max(PerformanceProjectMemberSnapshot.id).label("snapshot_id"),
    ).where(PerformanceProjectMemberSnapshot.project_id.in_([project.id for project in projects])).group_by(PerformanceProjectMemberSnapshot.project_id).subquery()
    rows = (await db.execute(select(
        PerformanceProjectMemberSnapshot.project_id,
        PerformanceProjectMember.employee_no,
    ).join(latest, latest.c.snapshot_id == PerformanceProjectMemberSnapshot.id).join(
        PerformanceProjectMember, PerformanceProjectMember.snapshot_id == PerformanceProjectMemberSnapshot.id,
    ))).all()
    project_members: dict[int, set[str]] = {}
    for project_id, employee_no in rows:
        project_members.setdefault(project_id, set()).add(employee_no)

    scopes = {}
    for project in projects:
        allowed = readable & project_members.get(project.id, set())
        if kind == FOCUS_RESULT_KIND:
            allowed.intersection_update(focus_group_members_for_project(groups, project))
        if allowed:
            scopes[project.id] = allowed
    return ResultViewScope(
        cycle=cycle,
        actor_ref=actor_ref,
        projects=[project for project in projects if project.id in scopes],
        scopes=scopes,
    )
