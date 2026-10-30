"""Shared employee qualifications for frontend navigation and review menus."""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.performance.assessment_roles import MANAGER_ROLE_CODES, ROLE_METRIC_EVALUATOR, ROLE_REVIEWEE, ROLE_REVIEWER_360, node_role_code
from app.performance.auth_context import PerformanceAccessContext
from app.performance.calibration_service import calibration_task_scope
from app.performance.models import PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceCycle, PerformanceHrbpPermission, PerformanceIdentityLink, PerformanceNodeTask, PerformanceProject, PerformanceProjectMember, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceRole, PROJECT_STATUS_STARTED


@dataclass
class FrontendAccess:
    cycles: list = field(default_factory=list)
    review_projects: list = field(default_factory=list)
    manage_projects: list = field(default_factory=list)
    workbench_projects: list = field(default_factory=list)
    management_scopes: dict = field(default_factory=dict)
    management_features: dict = field(default_factory=dict)
    manageable_cycle_refs: set = field(default_factory=set)
    own_task_project_ids: set = field(default_factory=set)
    task_ids_by_project: dict = field(default_factory=dict)
    visible_node_ids_by_project: dict = field(default_factory=dict)
    voluntary_node_ids_by_project: dict = field(default_factory=dict)
    member_project_ids: set = field(default_factory=set)
    actor_refs_by_cycle: dict = field(default_factory=dict)
    actor_ref: str | None = None

    @property
    def cycle_ids(self):
        return {cycle.id for cycle in self.cycles}


def cycle_payload(cycle) -> dict:
    return {"cycle_id": cycle.id, "cycle_name": cycle.name, "cycle_start_at": cycle.start_at, "cycle_end_at": cycle.end_at}


def project_payload(project, cycle) -> dict:
    return {"project_id": project.id, "project_name": project.name, "cycle_name": cycle.name, "cycle_start_at": cycle.start_at, "cycle_end_at": cycle.end_at}


def review_node_category(node_type, role_code, *, has_task):
    if node_type in {"work_summary", "reviewer_360_invite", "result_view"}:
        return "mine"
    if node_type == "result_reconsideration":
        return None
    if node_type in {"reviewer_360_confirm", "calibration", "result_communication"}:
        return "team"
    if node_type == "evaluation":
        if role_code == ROLE_REVIEWEE:
            return "mine"
        if role_code in {ROLE_REVIEWER_360, ROLE_METRIC_EVALUATOR}:
            return "others" if has_task else None
        if role_code in MANAGER_ROLE_CODES:
            return "team"
    return None


def _voluntary_360_node_ids(project, nodes):
    settings = (((project.settings or {}).get("flow_settings") or {}).get("node_settings") or {})
    enabled_ids = {str(key) for key, value in settings.items() if (((value or {}).get("invite") or {}).get("allow_voluntary_evaluation") is True)}
    invite_enabled = any(node.node_type == "reviewer_360_invite" and node.node_id in enabled_ids for node in nodes)
    return {node.id for node in nodes if node.node_type == "evaluation" and node_role_code((node.config or {}).get("template") or {}) == ROLE_REVIEWER_360 and (invite_enabled or node.node_id in enabled_ids)}


async def resolve_frontend_access(db: AsyncSession, context: PerformanceAccessContext) -> FrontendAccess:
    result = FrontendAccess()
    if context.subject_type == "SYSTEM_ACCOUNT":
        return result
    result.actor_ref = context.effective_employee_no
    if result.actor_ref is None:
        identity_statement = select(PerformanceIdentityLink.employee_no).where(PerformanceIdentityLink.portal_user_id == context.subject_id, PerformanceIdentityLink.is_active.is_(True))
        result.actor_ref = (await db.execute(identity_statement)).scalar_one_or_none()

    people_rows = list((await db.execute(
        select(PerformanceAuthorizationSnapshotPerson, PerformanceAuthorizationSnapshot)
        .join(PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshot.id == PerformanceAuthorizationSnapshotPerson.snapshot_id)
    )).all())
    people_by_cycle = {}
    for person, snapshot in people_rows:
        people_by_cycle.setdefault(snapshot.cycle_ref, []).append(person)
    for cycle_ref, people in people_by_cycle.items():
        if context.effective_employee_no:
            ref = context.effective_employee_no
        else:
            refs = {person.employee_no for person in people if getattr(person, "portal_user_id", None) == context.subject_id}
            ref = next(iter(refs)) if len(refs) == 1 else (result.actor_ref if not refs else None)
        if ref:
            result.actor_refs_by_cycle[cycle_ref] = ref
    if not result.actor_ref and not result.actor_refs_by_cycle:
        return result

    roles = list((await db.execute(select(PerformanceRole))).scalars().all())
    management_roles = {role.code: set(role.function_permission_keys or []) for role in roles if role.is_active and role.role_type == "MANAGEMENT"}
    assessment_roles = {role.code for role in roles if role.is_active and role.role_type == "ASSESSMENT" and role.is_system}
    cycles = list((await db.execute(select(PerformanceCycle).order_by(PerformanceCycle.start_at.desc(), PerformanceCycle.id.desc()))).scalars().all())
    cycles.sort(key=lambda cycle: (cycle.start_at, cycle.id), reverse=True)
    cycles_by_ref = {cycle.cycle_ref: cycle for cycle in cycles}
    projects = list((await db.execute(select(PerformanceProject).where(PerformanceProject.status == PROJECT_STATUS_STARTED).order_by(PerformanceProject.id))).scalars().all())
    projects = [project for project in projects if project.status == PROJECT_STATUS_STARTED and project.cycle_ref in cycles_by_ref]
    project_ids = [project.id for project in projects]
    if project_ids:
        member_rows = list((await db.execute(select(PerformanceProjectMember, PerformanceProjectMemberSnapshot).join(PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.id == PerformanceProjectMember.snapshot_id).where(PerformanceProjectMemberSnapshot.project_id.in_(project_ids)))).all())
        nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.project_id.in_(project_ids)).order_by(PerformanceProjectNodeSnapshot.node_order))).scalars().all())
        refs = set(result.actor_refs_by_cycle.values()) | ({result.actor_ref} if result.actor_ref else set())
        tasks = list((await db.execute(select(PerformanceNodeTask).where(PerformanceNodeTask.project_id.in_(project_ids), PerformanceNodeTask.handler_ref.in_(refs)))).scalars().all())
    else:
        member_rows, nodes, tasks = [], [], []
    latest_snapshots = {}
    for _member, snapshot in member_rows:
        latest_snapshots[snapshot.project_id] = max(snapshot.id, latest_snapshots.get(snapshot.project_id, 0))
    members_by_project = {}
    for member, snapshot in member_rows:
        if snapshot.id == latest_snapshots[snapshot.project_id]:
            members_by_project.setdefault(snapshot.project_id, []).append(member)
    nodes_by_project = {}
    nodes_by_id = {node.id: node for node in nodes}
    for node in nodes:
        nodes_by_project.setdefault(node.project_id, []).append(node)
    tasks_by_project = {}
    for task in tasks:
        tasks_by_project.setdefault(task.project_id, []).append(task)
    hrbp_permissions = list((await db.execute(select(PerformanceHrbpPermission))).scalars().all()) if "performance.hrbp" in management_roles else []
    related_refs = set()
    frontend_features = {"performance.frontend.progress", "performance.frontend.data-view"}
    for cycle in cycles:
        actor_ref = result.actor_refs_by_cycle.get(cycle.cycle_ref, result.actor_ref)
        permission = next((item for item in hrbp_permissions if item.cycle_ref == cycle.cycle_ref and item.hrbp_employee_no == actor_ref), None)
        if permission and frontend_features.intersection(management_roles.get("performance.hrbp", set())):
            result.manageable_cycle_refs.add(cycle.cycle_ref)
            related_refs.add(cycle.cycle_ref)

    for project in projects:
        cycle = cycles_by_ref[project.cycle_ref]
        actor_ref = result.actor_refs_by_cycle.get(project.cycle_ref, result.actor_ref)
        if not actor_ref:
            continue
        people = people_by_cycle.get(project.cycle_ref, [])
        members = members_by_project.get(project.id, [])
        member_rows_for_project = members
        if project.status != PROJECT_STATUS_STARTED:
            member_rows_for_project = []
        own_member = any(member.employee_no == actor_ref for member in member_rows_for_project)
        if own_member:
            result.member_project_ids.add(project.id)
        project_nodes = nodes_by_project.get(project.id, [])
        voluntary_ids = _voluntary_360_node_ids(project, project_nodes) if ROLE_REVIEWER_360 in assessment_roles and any(person.employee_no == actor_ref for person in people) else set()
        visible_ids, task_ids = set(), set()
        if project.status == PROJECT_STATUS_STARTED:
            for task in tasks_by_project.get(project.id, []):
                node = nodes_by_id.get(task.node_snapshot_id)
                if node is None or node.project_id != project.id or task.cycle_ref != project.cycle_ref or task.handler_ref != actor_ref:
                    continue
                result.own_task_project_ids.add(project.id)
                role = node_role_code({"node_type": node.node_type, **((node.config or {}).get("template") or {})})
                if role and role not in assessment_roles:
                    continue
                if node.node_type == "calibration" and not calibration_task_scope(task, node):
                    continue
                if review_node_category(node.node_type, role, has_task=True) is not None:
                    visible_ids.add(node.id)
                    task_ids.add(task.id)
            visible_ids.update(voluntary_ids)
            if own_member and ROLE_REVIEWEE in assessment_roles:
                visible_ids.update(node.id for node in project_nodes if node.node_type == "result_view")
        if visible_ids:
            result.review_projects.append((project, cycle))
            result.visible_node_ids_by_project[project.id] = visible_ids
            result.task_ids_by_project[project.id] = task_ids
            result.voluntary_node_ids_by_project[project.id] = voluntary_ids
            related_refs.add(project.cycle_ref)

        admin_people = [person for person in people if person.display_name in (project.administrators or [])]
        own_person = next((person for person in admin_people if person.employee_no == actor_ref), None)
        unique_admin = own_person is not None and sum(person.display_name == own_person.display_name for person in people) == 1
        admin_features = management_roles.get("performance.project_admin", set())
        hrbp_features = management_roles.get("performance.hrbp", set())
        permission = next((item for item in hrbp_permissions if item.cycle_ref == project.cycle_ref and item.hrbp_employee_no == actor_ref), None)
        if unique_admin and frontend_features.intersection(admin_features):
            related_refs.add(project.cycle_ref)
            result.manageable_cycle_refs.add(project.cycle_ref)
            result.manage_projects.append((project, cycle))
            result.management_scopes[project.id] = None
            result.management_features[project.id] = admin_features
            continue
        if permission and frontend_features.intersection(hrbp_features):
            scope = {member.employee_no for member in members if member.employee_no not in (permission.invisible_people or []) and any(member.organization_ref == org or str(member.organization_ref or "").startswith(f"{org}/") for org in permission.scope)}
            if scope:
                result.manage_projects.append((project, cycle))
                result.management_scopes[project.id] = scope
                result.management_features[project.id] = hrbp_features
    result.cycles = [cycle for cycle in cycles if cycle.cycle_ref in related_refs]
    workbench_ids = result.member_project_ids | result.own_task_project_ids | set(result.voluntary_node_ids_by_project) | {project.id for project, _cycle in result.manage_projects}
    result.workbench_projects = [(project, cycles_by_ref[project.cycle_ref]) for project in projects if project.status == PROJECT_STATUS_STARTED and project.id in workbench_ids]
    result.workbench_projects.sort(key=lambda item: (item[1].start_at, item[1].id, -item[0].id), reverse=True)
    result.review_projects.sort(key=lambda item: (item[1].start_at, item[1].id, -item[0].id), reverse=True)
    return result
