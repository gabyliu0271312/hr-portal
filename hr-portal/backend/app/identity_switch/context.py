from uuid import uuid4

from sqlalchemy import select

from app.identity_switch.service import SwitchCall, current_switch, validate_session
from app.performance.models import PerformanceIdentityLink
from app.users.models import User


async def switched_context(db, user, secret, request):
    from app.core.deps import user_has_op
    from app.performance.auth_context import (
        PERFORMANCE_PORTAL_ADMIN_PERMISSIONS, PerformanceAccessContext, load_active_authorization,
    )
    session, employee = await validate_session(db, user, secret)
    portal_id = await db.scalar(select(PerformanceIdentityLink.portal_user_id).where(
        PerformanceIdentityLink.employee_no == employee["employee_no"], PerformanceIdentityLink.is_active.is_(True),
    ))
    target = await db.get(User, portal_id) if portal_id else None
    grants, permissions = (), ()
    entries = ("performance.app",)
    if target and target.is_active:
        grants, permissions = await load_active_authorization(db, "PORTAL_USER", target.id)
        if await user_has_op(target, db, "performance.admin", "V"):
            entries += ("performance.admin",)
            permissions = tuple(dict.fromkeys((*permissions, *PERFORMANCE_PORTAL_ADMIN_PERMISSIONS)))
    call = SwitchCall(session.id, user.id, employee["employee_no"],
                      request.headers.get("X-App-Switch-Request", str(uuid4()))[:64], request.url.path[:256])
    current_switch.set(call)
    return PerformanceAccessContext(
        subject_type="PORTAL_USER" if target else "EMPLOYEE", subject_id=target.id if target else 0,
        display_name=employee["display_name"], account_type=None,
        portal_entry_permissions=entries, role_grants=grants, permission_codes=permissions,
        effective_employee_no=employee["employee_no"], operator_user_id=user.id, switch_session_id=session.id,
    )
