import re

from fastapi import HTTPException
from sqlalchemy import and_, select, tuple_

from app.performance.auth_context import (
    PerformanceAccessContext, PerformanceIdentityMappingNotFound, resolve_trusted_performance_actor,
)
from app.performance.models import (
    PerformanceFocusGroup, PerformanceProject, PerformanceProjectMember, PerformanceProjectMemberSnapshot,
)


def _safe_color(value, default):
    if not isinstance(value, str):
        return default
    value = value.strip()
    if re.fullmatch(r"#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})", value):
        return value
    match = re.fullmatch(r"(rgb|rgba)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?|\.\d+))?\s*\)", value)
    if match and all(int(channel) <= 255 for channel in match.group(2, 3, 4)):
        if (match.group(1) == "rgba") == (match.group(5) is not None):
            return value
    return default


async def hydrate_focus_group_tags(db, by_key, context, verified_view_keys=None):
    if not isinstance(context, PerformanceAccessContext) or not by_key:
        return
    group = PerformanceFocusGroup
    project = PerformanceProject
    snapshot = PerformanceProjectMemberSnapshot
    member = PerformanceProjectMember
    rows = (await db.execute(
        select(group, project, snapshot.id, member.employee_no)
        .select_from(project)
        .join(snapshot, and_(snapshot.project_id == project.id, snapshot.cycle_ref == project.cycle_ref))
        .join(member, member.snapshot_id == snapshot.id)
        .join(group, and_(group.cycle_ref == project.cycle_ref, group.show_group_tag.is_(True)))
        .where(tuple_(project.id, snapshot.id, member.employee_no).in_(by_key), group.view_permission.in_([1, 2]))
        .order_by(group.id)
    )).all()
    candidates = []
    for tag, item, snapshot_id, employee_no in rows:
        if employee_no not in (tag.employee_nos or []):
            continue
        if tag.tab == "project":
            refs = {str(value) for value in (tag.activity_ids or [])}
            if tag.project_ref:
                refs.add(str(tag.project_ref))
            if str(item.id) not in refs and item.project_ref not in refs:
                continue
        elif tag.tab != "semester":
            continue
        candidates.append((tag, item, (item.id, snapshot_id, employee_no)))
    if not candidates:
        return
    scopes = {}
    actors = {}
    for tag, project, key in candidates:
        if verified_view_keys is not None:
            if key not in verified_view_keys:
                continue
        else:
            if project.id not in scopes:
                from app.performance.projects_router import _project_data_scope
                try:
                    scopes[project.id] = await _project_data_scope(context, project, db, "performance.frontend.data-view")
                except HTTPException as exc:
                    if exc.status_code != 403:
                        raise
                    scopes[project.id] = set()
            if scopes[project.id] is not None and key[2] not in scopes[project.id]:
                continue
        if tag.view_permission == 2:
            if project.cycle_ref not in actors:
                try:
                    actors[project.cycle_ref] = await resolve_trusted_performance_actor(
                        db, context, cycle_ref=project.cycle_ref, require_employee_identity=True,
                    )
                except PerformanceIdentityMappingNotFound:
                    actors[project.cycle_ref] = None
            actor = actors[project.cycle_ref]
            if actor is None or actor.actor_type != "EMPLOYEE" or actor.actor_ref not in (tag.followee_user_ids or []):
                continue
        payload = {
            "group_id": tag.id, "name": tag.name,
            "text_color": _safe_color(tag.text_color, "#2f0080"),
            "bg_color": _safe_color(tag.bg_color, "rgba(141,85,237,0.2)"),
        }
        for identity in by_key[key]:
            tags = identity.setdefault("group_tags", [])
            if not any(value["group_id"] == tag.id for value in tags):
                tags.append(payload)
