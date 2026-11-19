"""Request-selected frontend management identity and project scope."""
from fastapi import HTTPException
from sqlalchemy import select

from app.performance.auth_context import PerformanceIdentityMappingNotFound, resolve_trusted_performance_actor
from app.performance.models import (
    PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson,
    PerformanceCycle, PerformanceProject, PerformanceProjectMember, PerformanceRole,
    PROJECT_STATUS_STARTED,
)

MANAGEMENT_FEATURES = (
    "performance.frontend.progress", "performance.frontend.data-view",
    "performance.frontend.result-open", "performance.frontend.authorize-evaluation-tasks",
    "performance.frontend.authorize-calibration-tasks", "performance.frontend.manage-evaluatees",
)


async def validate_management_project(context, project, db):
    if not context.management_role:
        return
    if context.management_role not in {"hrbp", "project_admin"}:
        raise HTTPException(422, "INVALID_MANAGEMENT_ROLE")
    if context.management_cycle_id is not None:
        cycle = await db.get(PerformanceCycle, context.management_cycle_id)
        if cycle is None or cycle.cycle_ref != project.cycle_ref:
            raise HTTPException(404, "PROJECT_NOT_FOUND")
    if context.management_project_id is not None and project.id != context.management_project_id:
        raise HTTPException(404, "PROJECT_NOT_FOUND")
    if project.status != PROJECT_STATUS_STARTED:
        raise HTTPException(403, "PROJECT_DATA_FORBIDDEN")


async def named_project_scope(context, project, db, function_key, *, candidates=None):
    from app.performance import projects_router as shared

    await validate_management_project(context, project, db)
    role_key = context.management_role
    selected = (project.settings or {}).get("data_managers", ["HRBP"])
    if role_key.upper() not in selected:
        raise HTTPException(403, "PROJECT_DATA_FORBIDDEN")
    role = await db.scalar(select(PerformanceRole).where(
        PerformanceRole.code == f"performance.{role_key}",
        PerformanceRole.role_type == "MANAGEMENT", PerformanceRole.is_active.is_(True),
    ))
    if role is None or function_key not in (role.function_permission_keys or []):
        raise HTTPException(403, "PROJECT_DATA_FORBIDDEN")
    try:
        actor = await resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref, require_employee_identity=True)
    except PerformanceIdentityMappingNotFound:
        raise HTTPException(403, "PROJECT_DATA_FORBIDDEN") from None
    if actor.actor_type != "EMPLOYEE":
        raise HTTPException(403, "PROJECT_DATA_FORBIDDEN")
    if role_key == "project_admin":
        people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).join(
            PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshot.id == PerformanceAuthorizationSnapshotPerson.snapshot_id,
        ).where(PerformanceAuthorizationSnapshot.cycle_ref == project.cycle_ref))).scalars().all())
        own = next((person for person in people if person.employee_no == actor.actor_ref), None)
        if own is None or own.display_name not in (project.administrators or []) or sum(person.display_name == own.display_name for person in people) != 1:
            raise HTTPException(403, "PROJECT_DATA_FORBIDDEN")
        return None
    permissions = await shared._person_hrbp_permissions(db, actor.actor_ref, project.cycle_ref)
    if not permissions:
        raise HTTPException(403, "PROJECT_DATA_FORBIDDEN")
    invisible = await shared._global_hrbp_invisible_people(db, scopes=[scope for item in permissions for scope in (item.scope or [])])
    members = candidates if candidates is not None else list((await db.execute(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == shared._latest_member_snapshot_statement(project.id),
    ))).scalars().all())
    scope = {member.employee_no for member in members if member.employee_no not in invisible and any(
        member.employee_no not in (permission.invisible_people or [])
        and shared._organization_in_scope(member.organization_ref, permission.scope or [])
        for permission in permissions
    )}
    if not scope:
        raise HTTPException(403, "PROJECT_DATA_FORBIDDEN")
    return scope


async def management_projects(cycle_id, context, db, function_keys=MANAGEMENT_FEATURES):
    cycle = await db.get(PerformanceCycle, cycle_id)
    if cycle is None or context.management_cycle_id not in (None, cycle_id):
        raise HTTPException(404, "CYCLE_NOT_FOUND")
    statement = select(PerformanceProject).where(
        PerformanceProject.cycle_ref == cycle.cycle_ref, PerformanceProject.status == PROJECT_STATUS_STARTED,
    ).order_by(PerformanceProject.id)
    if context.management_project_id is not None:
        project = await db.get(PerformanceProject, context.management_project_id)
        if project is None or project.cycle_ref != cycle.cycle_ref:
            raise HTTPException(404, "PROJECT_NOT_FOUND")
        statement = statement.where(PerformanceProject.id == project.id)
    projects = list((await db.execute(statement)).scalars().all())
    result = []
    for project in projects:
        visible = set()
        allowed = False
        for key in function_keys:
            try:
                scope = await named_project_scope(context, project, db, key)
            except HTTPException as exc:
                if exc.status_code != 403:
                    raise
                continue
            allowed = True
            if scope is None:
                visible = None
                break
            visible.update(scope)
        if allowed:
            result.append((project, visible))
    if not result:
        raise HTTPException(403, "PROJECT_DATA_FORBIDDEN")
    return result
