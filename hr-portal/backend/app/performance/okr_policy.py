from sqlalchemy import select

from app.performance.assessment_roles import ROLE_REVIEWER_360, node_role_code
from app.performance.models import PerformanceAuditEvent, PerformanceNodeTask, PerformanceProject
from app.performance.review_360_invites_router import _invite_settings, _project_nodes


async def task_okr_access_allowed(db, task, node, project=None) -> bool:
    if node_role_code((getattr(node, "config", None) or {}).get("template") or {}) != ROLE_REVIEWER_360:
        return True
    if project is None:
        project = await db.get(PerformanceProject, task.project_id)
    if project is None:
        return False
    events = list((await db.execute(
        select(PerformanceAuditEvent).where(
            PerformanceAuditEvent.cycle_ref == task.cycle_ref,
            PerformanceAuditEvent.employee_no == task.target_employee_no,
            PerformanceAuditEvent.subject_ref == task.handler_ref,
            PerformanceAuditEvent.event_type == "REVIEWER_360_VOLUNTEERED",
        ).order_by(PerformanceAuditEvent.event_at, PerformanceAuditEvent.id)
    )).scalars().all())
    voluntary = False
    legacy = False
    for event in events:
        after = event.after_state or {}
        if str(after.get("project_id")) != str(task.project_id) or str(after.get("node_id")) != str(node.node_id):
            continue
        if str(after.get("task_id")) == str(task.id):
            voluntary = True
            break
        if after.get("task_id") is None:
            legacy = True
    if not voluntary and legacy:
        ids = list((await db.execute(
            select(PerformanceNodeTask.id).where(
                PerformanceNodeTask.project_id == task.project_id,
                PerformanceNodeTask.node_snapshot_id == task.node_snapshot_id,
                PerformanceNodeTask.target_employee_no == task.target_employee_no,
                PerformanceNodeTask.handler_ref == task.handler_ref,
                PerformanceNodeTask.task_kind == "evaluation",
            )
        )).scalars().all())
        if ids != [task.id]:
            return False
        voluntary = True
    if not voluntary:
        return True
    nodes = await _project_nodes(db, project.id)
    return _invite_settings(project, node.node_id, nodes).get("allow_voluntary_okr_access") is True
