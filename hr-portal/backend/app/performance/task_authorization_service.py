"""Effective task handlers without mutating frozen task or people snapshots."""
from sqlalchemy import and_, exists, or_, select

from app.performance.models import PerformanceNodeTask, PerformanceNodeTaskAuthorization


def task_handler_condition(actor_ref):
    active = (
        PerformanceNodeTaskAuthorization.task_id == PerformanceNodeTask.id,
        PerformanceNodeTaskAuthorization.project_id == PerformanceNodeTask.project_id,
        PerformanceNodeTaskAuthorization.cycle_ref == PerformanceNodeTask.cycle_ref,
        PerformanceNodeTaskAuthorization.status == "ACTIVE",
    )
    transfer = exists(select(PerformanceNodeTaskAuthorization.id).where(*active, PerformanceNodeTaskAuthorization.authorization_type == "TRANSFER"))
    delegated = exists(select(PerformanceNodeTaskAuthorization.id).where(*active, PerformanceNodeTaskAuthorization.recipient_employee_no == actor_ref))
    return or_(and_(PerformanceNodeTask.handler_ref == actor_ref, PerformanceNodeTask.revoked_at.is_(None), ~transfer), and_(PerformanceNodeTask.revoked_at.is_(None), delegated))


def effective_handlers(original_handler, authorizations):
    active = [item for item in authorizations if item.status == "ACTIVE"]
    transferred = {item.recipient_employee_no for item in active if item.authorization_type == "TRANSFER"}
    shared = {item.recipient_employee_no for item in active if item.authorization_type == "AUTHORIZE"}
    return shared | transferred if transferred else shared | {str(original_handler)}
