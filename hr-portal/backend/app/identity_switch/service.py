import hashlib
import logging
import secrets
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import String, cast, delete, func, select, update

from app.data.employee_roster_contract import employee_roster_table
from app.identity_switch.models import IdentitySwitchFavorite, IdentitySwitchSession, IdentitySwitchSetting
from app.performance.models import PerformanceAuditEvent
from app.users.models import Menu, RoleMenu, User

MANAGEMENT_MENU = "system.identity_management"
SWITCH_PERMISSION = "performance.identity_switch"
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SwitchCall:
    session_id: str
    operator_user_id: int
    employee_no: str
    request_id: str
    source: str


current_switch: ContextVar[SwitchCall | None] = ContextVar("identity_switch", default=None)


def fail(code, message, status=403):
    raise HTTPException(status, detail={"code": code, "message": message})


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


async def get_setting(db, *, lock=False, shared=False):
    statement = select(IdentitySwitchSetting).where(IdentitySwitchSetting.id == 1).execution_options(populate_existing=True)
    if lock:
        statement = statement.with_for_update(read=shared)
    value = (await db.execute(statement)).scalar_one_or_none()
    if value is None:
        fail("SWITCH_NOT_INITIALIZED", "身份管理尚未完成数据库初始化", 503)
    return value


async def is_admin(db, user_id):
    value = await db.get(IdentitySwitchSetting, 1)
    return bool(value and getattr(value, "admin_operator_user_id", None) == user_id)


async def require_admin(db, user):
    value = await get_setting(db, lock=True)
    if not user.is_active or value.admin_operator_user_id != user.id:
        fail("SWITCH_CONTROL_ADMIN_ONLY", "仅内置 admin 可以管理身份切换")
    return value


async def can_switch(db, user, setting):
    if not user.is_active:
        return False
    if setting.admin_operator_user_id == user.id:
        return True
    if not setting.others_enabled:
        return False
    from app.core.deps import user_has_op
    return await user_has_op(user, db, SWITCH_PERMISSION, "V")


def audit(db, user_id, event_type, **details):
    db.add(PerformanceAuditEvent(
        event_type=event_type, actor_type="PORTAL_USER", actor_ref=str(user_id),
        subject_type="IDENTITY_SWITCH", after_state=details,
    ))


async def validate_role_menus(db, items, generation):
    setting = await get_setting(db, lock=True)
    protected = list((await db.execute(select(Menu).where(Menu.code.in_((MANAGEMENT_MENU, SWITCH_PERMISSION))))).scalars())
    by_id = {m.id: m.code for m in protected}
    for item in items:
        code = by_id.get(item.menu_id)
        if code == MANAGEMENT_MENU:
            fail("SWITCH_CONTROL_ADMIN_ONLY", "身份管理不能通过角色授予")
        if code == SWITCH_PERMISSION and any((item.can_view, item.can_create, item.can_update, item.can_delete, item.can_export)):
            if not setting.others_enabled:
                fail("SWITCH_DISABLED", "身份切换已停用，不能授予")
            if generation != setting.generation:
                fail("SWITCH_AUTHORIZATION_GENERATION_CONFLICT", "身份切换授权已变化，请刷新后重新配置", 409)
            if item.scope_dimension != "none" or any((item.can_create, item.can_update, item.can_delete, item.can_export)):
                fail("SWITCH_VALIDATION_ERROR", "身份切换只配置可使用权限，不配置数据范围或其他操作", 422)


async def change_control(db, user, payload):
    setting = await require_admin(db, user)
    previous = (await db.execute(select(PerformanceAuditEvent).where(
        PerformanceAuditEvent.event_type == "IDENTITY_SWITCH_CONTROL_CHANGED",
        PerformanceAuditEvent.actor_ref == str(user.id),
        PerformanceAuditEvent.after_state["request_id"].astext == payload.request_id,
    ).order_by(PerformanceAuditEvent.id.desc()).limit(1))).scalar_one_or_none()
    requested = payload.model_dump(exclude={"request_id", "expected_revision"}, exclude_unset=True)
    if previous is not None:
        if previous.after_state.get("requested") != requested:
            fail("SWITCH_IDEMPOTENCY_CONFLICT", "请求编号已用于其他设置", 409)
        return previous.after_state["result"]
    if payload.expected_revision != setting.revision:
        fail("SWITCH_CONTROL_VERSION_CONFLICT", "配置已变化，请刷新后重试", 409)
    cleared = revoked = 0
    if payload.others_enabled is False:
        if not payload.confirm_clear:
            fail("SWITCH_VALIDATION_ERROR", "停用需要确认清空授权", 422)
        menu_id = await db.scalar(select(Menu.id).where(Menu.code == SWITCH_PERMISSION))
        if menu_id is not None:
            result = await db.execute(delete(RoleMenu).where(RoleMenu.menu_id == menu_id))
            cleared = result.rowcount
        result = await db.execute(update(IdentitySwitchSession).where(
            IdentitySwitchSession.operator_user_id != setting.admin_operator_user_id,
            IdentitySwitchSession.revoked_at.is_(None),
        ).values(revoked_at=datetime.now(UTC)))
        revoked = result.rowcount
        setting.generation += 1
    if payload.others_enabled is not None:
        setting.others_enabled = payload.others_enabled
    if "test_receiver_user_id" in payload.model_fields_set:
        if payload.test_receiver_user_id is not None:
            receiver = await db.get(User, payload.test_receiver_user_id)
            if not receiver or not receiver.is_active or not receiver.feishu_user_id:
                fail("SWITCH_TEST_RECEIVER_INVALID", "测试接收人必须是启用且已绑定飞书的系统用户", 422)
        setting.test_receiver_user_id = payload.test_receiver_user_id
    if payload.test_delivery_enabled is not None:
        if payload.test_delivery_enabled and not setting.test_receiver_user_id:
            fail("SWITCH_TEST_RECEIVER_INVALID", "请先配置经过核验的测试接收人", 422)
        setting.test_delivery_enabled = payload.test_delivery_enabled
    setting.revision += 1
    result = control_out(setting) | {"cleared_role_count": cleared, "revoked_session_count": revoked}
    audit(db, user.id, "IDENTITY_SWITCH_CONTROL_CHANGED", request_id=payload.request_id, requested=requested, result=result)
    await db.commit()
    return result


def control_out(setting):
    return {
        "app_code": "performance", "system_name": "绩效系统",
        "description": "允许已授权用户切换为绩效员工，按员工实际业务权限测试",
        "others_enabled": setting.others_enabled, "generation": setting.generation,
        "revision": setting.revision, "test_delivery_enabled": setting.test_delivery_enabled,
        "test_receiver_user_id": setting.test_receiver_user_id,
    }


def roster_statement():
    try:
        table = employee_roster_table()
        return table, func.trim(cast(table.c.employee_no, String)), table.c.full_name
    except (KeyError, AttributeError, RuntimeError):
        fail("SWITCH_IDENTITY_SOURCE_UNAVAILABLE", "员工名单尚未准备好", 503)


async def find_employee(db, employee_no):
    table, number, name = roster_statement()
    statement = select(number.label("employee_no"), name.label("display_name"))
    if "department" in table.c:
        statement = statement.add_columns(table.c.department.label("organization_label"))
    rows = (await db.execute(statement.where(number == employee_no))).mappings().all()
    if not rows:
        fail("SWITCH_TARGET_NOT_FOUND", "员工不存在于当前统一人员名单", 404)
    if len(rows) != 1:
        fail("SWITCH_TARGET_AMBIGUOUS", "员工编号不唯一，不能切换", 409)
    from app.performance.models import PerformanceProject
    named_admin = await db.scalar(select(PerformanceProject.id).where(PerformanceProject.administrators.contains([rows[0]["display_name"]])).limit(1))
    if named_admin is not None and await db.scalar(select(func.count()).select_from(table).where(name == rows[0]["display_name"])) != 1:
        fail("SWITCH_TARGET_AMBIGUOUS", "项目管理员名单存在同名歧义，请先修正人员配置", 409)
    return dict(rows[0])


def favorite_out(row):
    return {"employee_no": row.employee_no, "display_name": row.display_name, "organization_label": row.organization_label}


async def list_favorites(db, user):
    rows = (await db.execute(
        select(IdentitySwitchFavorite)
        .where(IdentitySwitchFavorite.operator_user_id == user.id)
        .order_by(IdentitySwitchFavorite.created_at, IdentitySwitchFavorite.id)
    )).scalars().all()
    return [favorite_out(row) for row in rows]


async def add_favorite(db, user, employee_no):
    employee = await find_employee(db, employee_no)
    existing = await db.scalar(select(IdentitySwitchFavorite).where(
        IdentitySwitchFavorite.operator_user_id == user.id,
        IdentitySwitchFavorite.employee_no == employee["employee_no"],
    ))
    if existing is not None:
        return favorite_out(existing)
    favorite = IdentitySwitchFavorite(
        operator_user_id=user.id,
        employee_no=employee["employee_no"],
        display_name=employee["display_name"],
        organization_label=employee.get("organization_label"),
    )
    db.add(favorite)
    await db.commit()
    return favorite_out(favorite)


async def remove_favorite(db, user, employee_no):
    await db.execute(delete(IdentitySwitchFavorite).where(
        IdentitySwitchFavorite.operator_user_id == user.id,
        IdentitySwitchFavorite.employee_no == employee_no,
    ))
    await db.commit()


async def create_session(db, user, payload):
    setting = await get_setting(db, lock=True)
    if not await can_switch(db, user, setting):
        fail("SWITCH_PERMISSION_DENIED", "没有绩效用户切换权限或功能已停用")
    if user.id != setting.admin_operator_user_id and payload.expected_generation != setting.generation:
        fail("SWITCH_AUTHORIZATION_GENERATION_CONFLICT", "授权已变化，请刷新", 409)
    existing = await db.scalar(select(IdentitySwitchSession.id).where(IdentitySwitchSession.operator_user_id == user.id, IdentitySwitchSession.request_id == payload.request_id))
    if existing:
        fail("SWITCH_SESSION_ALREADY_ISSUED", "该请求已经创建会话，请重新发起切换", 409)
    employee = await find_employee(db, payload.employee_no)
    secret = secrets.token_urlsafe(32)
    session = IdentitySwitchSession(
        id=str(uuid4()), operator_user_id=user.id, target_employee_no=employee["employee_no"],
        target_display_name=employee["display_name"], secret_hash=token_hash(secret),
        generation=setting.generation, request_id=payload.request_id,
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
    )
    db.add(session)
    audit(db, user.id, "IDENTITY_SWITCH_STARTED", session_id=session.id, effective_employee_no=session.target_employee_no)
    await db.commit()
    logger.info("identity_switch_created session_id=%s operator_id=%s generation=%s expires_at=%s",
                session.id, user.id, session.generation, session.expires_at.isoformat())
    return {"session_id": session.id, "session_token": secret, "expires_at": session.expires_at,
            "effective_identity": employee, "mode": "TARGET_POLICY"}


async def _renew_switch_session(db, session):
    """活跃会话续期：剩余不足 25 分钟时把到期时间顺延为 now+30min，闲置 30 分钟才失效。

    调用前须已通过失效检查，不会把已到期会话救活。写库依赖调用方事务提交：
    心跳接口显式 commit，业务写接口随自身事务提交。
    """
    now = datetime.now(UTC)
    if session.expires_at - now >= timedelta(minutes=25):
        return
    new_expiry = now + timedelta(minutes=30)
    await db.execute(update(IdentitySwitchSession).where(
        IdentitySwitchSession.id == session.id,
    ).values(expires_at=new_expiry))
    session.expires_at = new_expiry


async def validate_session(db, user, secret):
    setting = await get_setting(db, lock=True, shared=True)
    if not await can_switch(db, user, setting):
        logger.warning("identity_switch_rejected operator_id=%s reason=operator_not_qualified generation=%s",
                       user.id, setting.generation)
        fail("SWITCH_PERMISSION_DENIED", "身份切换资格已失效", 410)
    session = (await db.execute(select(IdentitySwitchSession).where(IdentitySwitchSession.secret_hash == token_hash(secret)))).scalar_one_or_none()
    if not session or session.operator_user_id != user.id:
        fail("SWITCH_SESSION_OWNER_MISMATCH", "身份切换凭证无效")
    if session.revoked_at is not None or (user.id != setting.admin_operator_user_id and session.generation != setting.generation):
        logger.warning("identity_switch_rejected session_id=%s operator_id=%s reason=%s session_generation=%s current_generation=%s",
                       session.id, user.id, "revoked" if session.revoked_at is not None else "generation_mismatch",
                       session.generation, setting.generation)
        fail("SWITCH_SESSION_REVOKED", "身份切换已撤销", 410)
    now = datetime.now(UTC)
    if session.expires_at <= now:
        logger.warning("identity_switch_expired session_id=%s operator_id=%s created_at=%s expires_at=%s checked_at=%s generation=%s",
                       session.id, user.id, session.created_at.isoformat(), session.expires_at.isoformat(), now.isoformat(), session.generation)
        fail("SWITCH_SESSION_EXPIRED", "身份切换已到期，请恢复本人", 410)
    await _renew_switch_session(db, session)
    employee = await find_employee(db, session.target_employee_no)
    return session, employee


async def revoke_unqualified_sessions(db, user_ids):
    setting = await get_setting(db, lock=True)
    for user_id in set(user_ids):
        user = await db.get(User, user_id)
        if user_id == setting.admin_operator_user_id and user and user.is_active:
            continue
        if not user or not await can_switch(db, user, setting):
            await db.execute(update(IdentitySwitchSession).where(
                IdentitySwitchSession.operator_user_id == user_id,
                IdentitySwitchSession.revoked_at.is_(None),
            ).values(revoked_at=datetime.now(UTC)))


from sqlalchemy import event
from sqlalchemy.orm import Session


@event.listens_for(Session, "before_flush")
def audit_switched_business_write(session, flush_context, instances):
    call = current_switch.get()
    if call is None:
        return
    changed = session.new | session.dirty | session.deleted
    if not any(getattr(obj, "__tablename__", "").startswith("performance_") and not isinstance(obj, PerformanceAuditEvent) for obj in changed):
        return
    transaction = session.get_transaction()
    if session.info.get("identity_switch_audited_transaction") is transaction:
        return
    session.info["identity_switch_audited_transaction"] = transaction
    session.add(PerformanceAuditEvent(
        event_type="IDENTITY_SWITCH_BUSINESS_WRITE", actor_type="PORTAL_USER", actor_ref=str(call.operator_user_id),
        employee_no=call.employee_no, subject_type="IDENTITY_SWITCH", subject_ref=call.session_id,
        after_state={"identity_switch": {"operator_user_id": call.operator_user_id,
            "effective_employee_no": call.employee_no, "session_id": call.session_id,
            "request_id": call.request_id, "source": call.source}},
    ))
