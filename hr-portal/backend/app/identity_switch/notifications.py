from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.core.config import settings
from app.core.db import get_session
from app.core.deps import current_user
from app.identity_switch.models import IdentitySwitchNotificationRun, IdentitySwitchSession
from app.identity_switch.service import can_switch, current_switch, fail, get_setting
from app.users.models import User

notification_router = APIRouter(prefix="/performance/identity-switch/notification-tests")


async def record_notification(db, items, original_receivers, source=None):
    call = current_switch.get()
    if call is None:
        return None
    run = (await db.execute(select(IdentitySwitchNotificationRun).where(
        IdentitySwitchNotificationRun.session_id == call.session_id,
        IdentitySwitchNotificationRun.request_id == call.request_id,
    ).with_for_update())).scalar_one_or_none()
    if run is None:
        setting = await get_setting(db)
        run = IdentitySwitchNotificationRun(
            id=str(uuid4()), session_id=call.session_id, operator_user_id=call.operator_user_id,
            target_employee_no=call.employee_no, request_id=call.request_id,
            source=source or call.source, environment=settings.APP_ENV,
            delivery_revision=setting.revision if setting.test_delivery_enabled else -1,
            items=[], original_receivers=[], sample_status="recorded", summary_status="recorded",
        )
        db.add(run)
        await db.flush()
    if run.source != (source or call.source):
        fail("SWITCH_IDEMPOTENCY_CONFLICT", "同一测试请求编号不能用于其他操作", 409)
    if run.delivery_requested_at is not None:
        fail("SWITCH_TEST_ALREADY_FINALIZED", "已结束的测试批次不能追加通知", 409)
    existing = {item["key"] for item in run.items}
    run.items = run.items + [item for item in items if item["key"] not in existing]
    run.original_receivers = sorted(set(run.original_receivers) | set(original_receivers))
    await db.flush()
    return run


async def intercept_notification(config, context, db, biz_type, biz_id):
    import hashlib
    import json
    from app.integrations.feishu.notification_service import preview_message, resolve_and_preview
    from app.integrations.feishu.schemas import NotificationSendResponse
    resolved = await resolve_and_preview(config, context, db)
    preview = await preview_message(config, context)
    receivers = [r["receiver_id"] for r in resolved["receivers"]]
    key = hashlib.sha256(json.dumps([biz_type, biz_id, config.model_dump(), context], sort_keys=True, default=str).encode()).hexdigest()
    item = {"key": key, "title": preview["rendered_title"], "content": preview["rendered_content"],
            "format": config.message.message_format, "resources": preview["rendered_resources"], "receiver_count": len(receivers),
            "receivers": resolved["receivers"], "errors": resolved["errors"],
            "missing_variables": preview["missing_variables"], "enabled": config.enabled}
    run = await record_notification(db, [item], receivers)
    return NotificationSendResponse(ok=True, status="skipped", errors=[f"身份切换通知已拦截；测试批次 {run.id}"])


def run_out(run):
    generated = sum(item.get("receiver_count", 0) for item in run.items)
    errors = sum(len(item.get("errors", [])) + bool(item.get("missing_variables")) for item in run.items)
    return {
        "id": run.id, "source": run.source, "environment": run.environment,
        "target_employee_no": run.target_employee_no, "created_at": run.created_at,
        "planned_count": generated, "error_count": errors, "original_delivery_count": 0,
        "sample_status": run.sample_status, "summary_status": run.summary_status,
        "delivery_error": run.delivery_error, "items": run.items,
        "can_deliver": run.delivery_revision >= 0 and run.delivery_requested_at is None,
    }


@notification_router.get("")
async def list_runs(db=Depends(get_session), user=Depends(current_user)):
    rows = list((await db.execute(select(IdentitySwitchNotificationRun).where(
        IdentitySwitchNotificationRun.operator_user_id == user.id,
    ).order_by(IdentitySwitchNotificationRun.created_at.desc()).limit(50))).scalars())
    return {"items": [run_out(row) for row in rows]}


class DeliverIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    verify_style: bool = True


def receiver_is_safe(run, receiver):
    return bool(receiver and receiver.is_active and receiver.feishu_user_id
                and receiver.feishu_user_id not in run.original_receivers
                and run.items and all(not i.get("errors") and not i.get("missing_variables") for i in run.items))


@notification_router.post("/{run_id}/deliver")
async def deliver_run(run_id: str, payload: DeliverIn, db=Depends(get_session), user=Depends(current_user)):
    setting = await get_setting(db, lock=True)
    if not await can_switch(db, user, setting):
        fail("SWITCH_PERMISSION_DENIED", "切换资格已撤销")
    run = (await db.execute(select(IdentitySwitchNotificationRun).where(
        IdentitySwitchNotificationRun.id == run_id, IdentitySwitchNotificationRun.operator_user_id == user.id,
    ).with_for_update())).scalar_one_or_none()
    if not run:
        fail("SWITCH_TEST_NOT_FOUND", "测试记录不存在", 404)
    session = await db.get(IdentitySwitchSession, run.session_id)
    if not session or session.revoked_at or session.expires_at <= datetime.now(UTC) or (user.id != setting.admin_operator_user_id and session.generation != setting.generation):
        fail("SWITCH_SESSION_REVOKED", "切换会话已失效，保留记录但不再投递", 410)
    if not setting.test_delivery_enabled or run.delivery_revision != setting.revision:
        fail("SWITCH_TEST_DELIVERY_DISABLED", "本批次未获当前受控投递许可，只保留记录")
    if run.delivery_requested_at:
        return run_out(run)
    receiver = await db.get(User, setting.test_receiver_user_id) if setting.test_receiver_user_id else None
    if not receiver_is_safe(run, receiver):
        fail("SWITCH_TEST_RECEIVER_CONFLICT", "测试接收方不合规或原接收范围不完整，禁止外发；不会回退原接收人")
    from app.performance.models import PerformanceIdentityLink
    link = await db.scalar(select(PerformanceIdentityLink.employee_no).where(PerformanceIdentityLink.portal_user_id == receiver.id, PerformanceIdentityLink.is_active.is_(True)))
    if link and f"employee:{link}" in run.original_receivers:
        fail("SWITCH_TEST_RECEIVER_CONFLICT", "测试接收人在本批原业务接收范围内，禁止投递")
    if any(r.startswith("employee:") for r in run.original_receivers) and not link:
        fail("SWITCH_TEST_RECEIVER_UNVERIFIED", "无法核验测试接收人的员工身份与本批原名单是否重合，禁止投递")
    # Claim both delivery slots durably before contacting the external service.
    run.delivery_requested_at = datetime.now(UTC)
    run.sample_status = "sending" if payload.verify_style else "not_requested"
    run.summary_status = "sending"
    await db.commit()
    setting = await get_setting(db, lock=True, shared=True)
    session = await db.get(IdentitySwitchSession, run.session_id, populate_existing=True)
    active = await db.scalar(select(User.is_active).where(User.id == user.id))
    if not active or not setting.test_delivery_enabled or setting.revision != run.delivery_revision or not session or session.revoked_at or not await can_switch(db, user, setting):
        run.sample_status = "skipped"
        run.summary_status = "skipped"
        run.delivery_error = "投递资格已变化，仅保留记录，不补发"
        await db.commit()
        return run_out(run)
    from app.integrations.feishu.feishu_client import get_feishu_client
    client = get_feishu_client()
    destination = receiver.feishu_user_id
    prefix = f"【{run.environment} · 身份切换测试】"
    if payload.verify_style:
        item = run.items[0]
        try:
            if item.get("format") == "text":
                await client.send_text_to_user(destination, prefix + item["title"] + chr(10) + item["content"])
            else:
                await client.send_markdown_to_user(destination, prefix + item["title"], item["content"])
            run.sample_status = "sent"
        except Exception:
            run.sample_status = "unknown"
            run.delivery_error = "样例发送未确认，请核查发送记录，不自动重试"
    try:
        info = run_out(run)
        content = (f"批次：{run.id}\n实际操作者：{user.display_name}\n目标员工：{run.target_employee_no}\n"
                   f"原计划人数：{info['planned_count']}\n生成异常：{info['error_count']}\n"
                   f"原接收方实际投递：0\n样例状态：{run.sample_status}\n请在身份切换的消息测试记录中查看逐条结果。")
        await client.send_markdown_to_user(destination, prefix + "结果汇总", content)
        run.summary_status = "sent"
    except Exception:
        run.summary_status = "unknown"
        run.delivery_error = "汇总发送未确认，结果仍可在页面查看，不自动重试"
    await db.commit()
    return run_out(run)


async def finalize_operation(call, session_factory=None):
    from app.core.db import AsyncSessionLocal
    from app.identity_switch.service import current_switch
    import logging
    token = current_switch.set(None)
    try:
        async with (session_factory or AsyncSessionLocal)() as db:
            run = (await db.execute(select(IdentitySwitchNotificationRun).where(
                IdentitySwitchNotificationRun.session_id == call.session_id,
                IdentitySwitchNotificationRun.request_id == call.request_id,
            ))).scalar_one_or_none()
            if run is None or run.delivery_revision < 0 or run.delivery_requested_at is not None:
                return
            user = await db.get(User, call.operator_user_id)
            try:
                await deliver_run(run.id, DeliverIn(verify_style=True), db, user)
            except Exception:
                await db.rollback()
                run = await db.get(IdentitySwitchNotificationRun, run.id)
                run.delivery_error = "受控自动投递未完成，请在记录中查看；不会投递原名单或自动补发"
                await db.commit()
    except Exception:
        logging.getLogger(__name__).warning("Identity-switch notification finalization failed; original delivery remains blocked")
    finally:
        current_switch.reset(token)
