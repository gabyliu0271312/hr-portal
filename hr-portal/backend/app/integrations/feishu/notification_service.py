"""飞书通知服务

职责：
  1. 校验通知配置
  2. 调用接收人解析服务
  3. 渲染消息模板
  4. 调用飞书客户端发送
  5. 写入发送日志
  6. 返回成功/失败/部分成功结果
  7. 标记完成功能：互动卡片 + 完成过滤 + 回调处理

外部模块调用此服务时只需提供 NotificationConfig 和上下文，
不需要知道飞书 API 细节。
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.integrations.feishu.feishu_client import (
    FeishuClientError,
    build_action_card,
    build_completion_card,
    build_markdown_card,
    get_feishu_client,
)
from app.integrations.feishu.models import (
    FeishuNotificationCompletion,
    FeishuNotificationLog,
)
from app.integrations.feishu.receiver_resolver import resolve_receivers
from app.integrations.feishu.schemas import (
    CompletionRecord,
    NotificationConfig,
    NotificationSendResponse,
    ResolvedReceiver,
)
from app.integrations.feishu.template_renderer import render_template


logger = logging.getLogger("feishu.notification_service")


async def _global_delivery_mode(db) -> str:
    """读取全局消息投递模式（identity_switch 单例行）。

    未初始化或读取失败时兜底 blocked（fail-closed），保证部署后不会意外外发。
    """
    from app.identity_switch.models import IdentitySwitchSetting
    from sqlalchemy import select
    try:
        row = (await db.execute(select(IdentitySwitchSetting.delivery_mode).where(IdentitySwitchSetting.id == 1))).scalar_one_or_none()
    except Exception:
        logger.exception("[feishu] 读取全局投递模式失败，按 blocked 处理")
        return "blocked"
    return row if row in ("blocked", "test_receiver", "normal") else "blocked"


async def _global_test_receiver(db) -> ResolvedReceiver | None:
    """读取全局测试接收人的飞书账号；配置缺失返回 None。"""
    from app.identity_switch.models import IdentitySwitchSetting
    from app.users.models import User
    from sqlalchemy import select
    row = (await db.execute(
        select(User.feishu_user_id, User.display_name).join(
            IdentitySwitchSetting, IdentitySwitchSetting.test_receiver_user_id == User.id,
        ).where(IdentitySwitchSetting.id == 1, User.is_active.is_(True), User.feishu_user_id.is_not(None), User.feishu_user_id != "")
    )).first()
    if row is None:
        return None
    return ResolvedReceiver(receiver_type="user", receiver_id=row[0], display_name=row[1] or "测试接收人", source="global_test_receiver")


async def resolve_and_preview(
    config: NotificationConfig,
    context: dict[str, Any],
    db: AsyncSession,
) -> dict:
    """预览接收人，不发送消息。"""
    result = await resolve_receivers(config.receivers, context, db)
    return {
        "ok": result.ok,
        "receivers": [r.model_dump() for r in result.receivers],
        "errors": [e.model_dump() for e in result.errors],
    }


async def preview_message(
    config: NotificationConfig,
    context: dict[str, Any],
) -> dict:
    """预览渲染后的消息内容，不发送。"""
    all_missing: list[str] = []
    all_warnings: list[str] = []

    rendered_title, missing_t = render_template(config.message.title_template, context)
    all_missing.extend(missing_t)

    rendered_content, missing_c = render_template(config.message.content_template, context)
    all_missing.extend(missing_c)

    rendered_resources = []
    for res in config.message.resources:
        rendered_url, missing_u = render_template(res.url_template, context)
        all_missing.extend(missing_u)
        rendered_resources.append({
            "type": res.type,
            "title": res.title,
            "url": rendered_url,
        })

    if all_missing:
        all_warnings.append(f"模板中存在未替换的变量: {', '.join(set(all_missing))}")

    return {
        "rendered_title": rendered_title,
        "rendered_content": rendered_content,
        "rendered_resources": rendered_resources,
        "missing_variables": list(set(all_missing)),
        "warnings": all_warnings,
    }


async def send_notification(
    config: NotificationConfig,
    context: dict[str, Any],
    db: AsyncSession,
    biz_type: str | None = None,
    biz_id: str | None = None,
    is_test: bool = False,
    triggered_by: int | None = None,
    automation_execution_id: int | None = None,
) -> NotificationSendResponse:
    """执行通知发送（测试发送和正式发送共用此方法，通过 is_test 区分）。

    不应因单个接收人失败而中断其他接收人的发送。
    所有结果写入 feishu_notification_logs。
    """
    from app.identity_switch.service import current_switch
    if settings.FEISHU_NOTIFICATION_DELIVERY_ENABLED and current_switch.get() is not None:
        from app.identity_switch.notifications import intercept_notification
        return await intercept_notification(config, context, db, biz_type, biz_id)
    if current_switch.get() is None:
        delivery_mode = await _global_delivery_mode(db)
    else:
        # 身份切换会话已由上方拦截，不会走到这里；防御性保持正常投递
        delivery_mode = "normal"
    if not config.enabled:
        log = FeishuNotificationLog(
            biz_type=biz_type, biz_id=biz_id, is_test=is_test,
            message_format=config.message.message_format,
            status="skipped", success_count=0, failed_count=0,
            error_message="通知已禁用", triggered_by=triggered_by,
        )
        db.add(log)
        await db.flush()
        return NotificationSendResponse(ok=True, status="skipped", log_id=log.id)

    # 1. 解析接收人
    resolve_result = await resolve_receivers(config.receivers, context, db)

    # 1.2 仅发指定人模式：整体替换为全局测试接收人（测试接收人在原名单也照发）
    if delivery_mode == "test_receiver":
        receiver = await _global_test_receiver(db)
        if receiver is None:
            logger.warning("[feishu] test_receiver 模式但未配置有效测试接收人，按 blocked 处理 biz=%s/%s", biz_type, biz_id)
            delivery_mode = "blocked"
        else:
            resolve_result.receivers = [receiver]
            resolve_result.errors = []
            resolve_result.ok = True

    # 1.5 如果开启标记完成功能，过滤已完成的用户
    filtered_receivers: list[ResolvedReceiver] = []
    skipped_completed: list[str] = []
    if config.require_completion and biz_type and biz_id and not is_test:
        completed_open_ids = await _get_completed_open_ids(db, biz_type, biz_id)
        for r in resolve_result.receivers:
            if r.receiver_type == "user" and r.receiver_id in completed_open_ids:
                skipped_completed.append(r.display_name)
            else:
                filtered_receivers.append(r)
        if skipped_completed:
            logger.info(
                "[feishu] 标记完成过滤 biz=%s/%s skipped=%d names=%s",
                biz_type, biz_id, len(skipped_completed),
                ", ".join(skipped_completed[:10]),
            )
        resolve_result.receivers = filtered_receivers
    if not resolve_result.receivers and not resolve_result.errors:
        # 配置了规则但解析后无人，写日志 skipped
        log = FeishuNotificationLog(
            biz_type=biz_type, biz_id=biz_id, is_test=is_test,
            message_format=config.message.message_format,
            status="skipped", success_count=0, failed_count=0,
            error_message="解析后无接收人",
            triggered_by=triggered_by,
        )
        db.add(log)
        await db.flush()
        return NotificationSendResponse(ok=True, status="skipped", log_id=log.id)

    # 2. 渲染消息
    rendered_title, _ = render_template(config.message.title_template, context)
    rendered_content, _ = render_template(config.message.content_template, context)
    # 资源链接
    resource_text = ""
    for res in config.message.resources:
        rendered_url, _ = render_template(res.url_template, context)
        resource_text += f"\n[{res.title}]({rendered_url})"
    if resource_text:
        rendered_content = rendered_content + resource_text

    # 3. 发送
    # 3. Create log before sending. Completion cards need notification_log_id in button callback data.
    receiver_snapshot = [r.model_dump() for r in resolve_result.receivers]
    log = FeishuNotificationLog(
        biz_type=biz_type,
        biz_id=biz_id,
        is_test=is_test,
        message_format=config.message.message_format,
        title=rendered_title,
        rendered_content=rendered_content,
        receiver_snapshot=receiver_snapshot,
        result_snapshot=[],
        status="pending",
        success_count=0,
        failed_count=0,
        error_message=None,
        triggered_by=triggered_by,
        automation_execution_id=automation_execution_id,
    )
    db.add(log)
    await db.flush()

    if not settings.FEISHU_NOTIFICATION_DELIVERY_ENABLED:
        # 部署保险丝关闭（兜底）：保持既有 preview_only 语义，仅记录不发送。
        log.status = "skipped"
        log.error_message = "NOTIFICATION_PREVIEW_ONLY"
        log.result_snapshot = [{"receiver_id": r.receiver_id, "receiver_type": r.receiver_type, "status": "preview_only"} for r in resolve_result.receivers]
        await db.flush()
        return NotificationSendResponse(ok=resolve_result.ok, status="skipped", log_id=log.id, errors=["NOTIFICATION_PREVIEW_ONLY", *[e.message for e in resolve_result.errors]])

    if delivery_mode == "blocked":
        # 全局投递关闭：走完整解析/渲染/落日志，标记成功，但不调用飞书。
        # 返回结果与真实发送一致（status=success），前端不感知任何测试痕迹。
        log.status = "success"
        log.success_count = len(resolve_result.receivers)
        log.failed_count = 0
        log.result_snapshot = [{"receiver_id": r.receiver_id, "receiver_type": r.receiver_type, "display_name": r.display_name, "status": "success", "message_id": None} for r in resolve_result.receivers]
        log.error_message = None
        await db.flush()
        logger.info("[feishu] 全局投递关闭(blocked)，已记录未发送 biz=%s/%s receivers=%d", biz_type, biz_id, log.success_count)
        return NotificationSendResponse(ok=True, status="success", success_count=log.success_count, failed_count=0, log_id=log.id)

    client = get_feishu_client()
    success_count = 0
    failed_count = 0
    result_snapshot: list[dict] = []

    # Handle receiver resolving errors.
    for err in resolve_result.errors:
        failed_count += 1
        result_snapshot.append({"source": err.rule_type, "status": "resolve_error", "msg": err.message})

    for receiver in resolve_result.receivers:
        send_result = await _send_to_one(
            client, receiver, config, rendered_title, rendered_content,
            context=context,
            notification_log_id=log.id if config.require_completion else None,
            biz_type=biz_type,
            biz_id=biz_id,
            is_group=False,
        )
        result_snapshot.append({
            "receiver_id": receiver.receiver_id,
            "receiver_type": receiver.receiver_type,
            "display_name": receiver.display_name,
            **send_result,
        })
        if send_result["status"] == "success":
            success_count += 1
        else:
            failed_count += 1

    # 4. 写日志
    if failed_count == 0:
        status = "success"
    elif success_count == 0:
        status = "failed"
    else:
        status = "partial_success"

    log.result_snapshot = result_snapshot
    log.status = status
    log.success_count = success_count
    log.failed_count = failed_count
    log.error_message = f"{failed_count} receivers failed" if failed_count > 0 else None
    await db.flush()

    logger.info(
        "[feishu] 发送完成 biz=%s/%s is_test=%s success=%d failed=%d log_id=%d",
        biz_type, biz_id, is_test, success_count, failed_count, log.id,
    )

    return NotificationSendResponse(
        ok=status != "failed",
        status=status,
        success_count=success_count,
        failed_count=failed_count,
        log_id=log.id,
        errors=[r["msg"] for r in result_snapshot if r.get("status") != "success" and r.get("msg")],
    )


async def _send_to_one(
    client,
    receiver: ResolvedReceiver,
    config: NotificationConfig,
    title: str,
    content: str,
    context: dict[str, Any] | None = None,
    notification_log_id: int | None = None,
    biz_type: str | None = None,
    biz_id: str | None = None,
    is_group: bool = False,
) -> dict:
    """向单个接收人发送消息，返回发送结果摘要（不含敏感信息）。

    优先级：
      1. notification_log_id 不为 None → 标记完成互动卡片（require_completion）
      2. config.card_button.enabled → 跳转按钮交互式卡片
      3. 其他 → 普通文本/post 消息
    """
    message_id = None
    try:
        if notification_log_id is not None:
            # 发送互动卡片（标记完成模式，可选带跳转按钮）
            card_json = build_completion_card(
                title=title,
                content=content,
                notification_log_id=notification_log_id,
                biz_type=biz_type,
                biz_id=biz_id,
                is_group=is_group,
                card_button=config.card_button if getattr(config, 'card_button', None) and config.card_button.enabled else None,
            )
            if receiver.receiver_type == "user":
                resp = await client.send_interactive_card_to_user(receiver.receiver_id, card_json)
            else:  # chat
                resp = await client.send_interactive_card_to_chat(receiver.receiver_id, card_json)
            message_id = resp.get("data", {}).get("message_id")
        elif getattr(config, 'card_button', None) and config.card_button.enabled:
            # 发送带跳转按钮的交互式卡片
            cb = config.card_button
            # 渲染 URL 中的模板变量
            button_url, _ = render_template(cb.url or "", context or {})
            card_json = build_action_card(
                title=title,
                content=content,
                button_text=cb.text or "查看详情",
                button_url=button_url,
            )
            if receiver.receiver_type == "user":
                resp = await client.send_interactive_card_to_user(receiver.receiver_id, card_json)
            else:
                resp = await client.send_interactive_card_to_chat(receiver.receiver_id, card_json)
            message_id = resp.get("data", {}).get("message_id")
        else:
            # Normal message: send markdown as interactive card to avoid Feishu post content 230001 validation errors.
            if config.message.message_format == "markdown":
                card_json = build_markdown_card(title=title, content=content)
                if receiver.receiver_type == "user":
                    resp = await client.send_interactive_card_to_user(receiver.receiver_id, card_json)
                else:
                    resp = await client.send_interactive_card_to_chat(receiver.receiver_id, card_json)
                message_id = resp.get("data", {}).get("message_id")
            elif receiver.receiver_type == "user":
                await client.send_text_to_user(receiver.receiver_id, content)
            else:  # chat
                await client.send_text_to_chat(receiver.receiver_id, content)
        return {"status": "success", "message_id": message_id}
    except FeishuClientError as e:
        logger.warning("[feishu] 发送失败 receiver=%s: %s", receiver.receiver_id, e)
        return {"status": "failed", "msg": str(e), "message_id": message_id}
    except Exception as e:
        logger.exception("[feishu] 意外错误 receiver=%s", receiver.receiver_id)
        return {"status": "failed", "msg": "内部错误", "message_id": message_id}


async def _get_completed_open_ids(
    db: AsyncSession,
    biz_type: str,
    biz_id: str,
) -> set[str]:
    """查询指定业务下已标记完成的用户 open_id 集合。"""
    stmt = select(FeishuNotificationCompletion.open_id).where(
        FeishuNotificationCompletion.biz_type == biz_type,
        FeishuNotificationCompletion.biz_id == biz_id,
        FeishuNotificationCompletion.status == "completed",
    )
    rows = (await db.execute(stmt)).all()
    return {row[0] for row in rows}


async def get_completions(
    db: AsyncSession,
    biz_type: str | None = None,
    biz_id: str | None = None,
    notification_log_id: int | None = None,
) -> list[CompletionRecord]:
    """查询标记完成记录。"""
    stmt = (
        select(FeishuNotificationCompletion)
        .order_by(FeishuNotificationCompletion.completed_at.desc())
    )
    if biz_type:
        stmt = stmt.where(FeishuNotificationCompletion.biz_type == biz_type)
    if biz_id:
        stmt = stmt.where(FeishuNotificationCompletion.biz_id == biz_id)
    if notification_log_id is not None:
        stmt = stmt.where(
            FeishuNotificationCompletion.notification_log_id == notification_log_id
        )

    rows = (await db.execute(stmt)).scalars().all()
    return [
        CompletionRecord.model_validate(r)
        for r in rows
    ]


async def mark_completion(
    db: AsyncSession,
    notification_log_id: int,
    open_id: str,
    display_name: str | None = None,
    biz_type: str | None = None,
    biz_id: str | None = None,
    callback_data: dict | None = None,
) -> FeishuNotificationCompletion | None:
    """记录用户标记完成。

    幂等处理：同一 notification_log_id + open_id 已存在则忽略。
    返回新创建的记录，或 None（已存在时）。
    """
    # 检查是否已存在
    existing = (
        await db.execute(
            select(FeishuNotificationCompletion).where(
                FeishuNotificationCompletion.notification_log_id == notification_log_id,
                FeishuNotificationCompletion.open_id == open_id,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        logger.info(
            "[feishu] 标记完成已存在 log_id=%d open_id=%s",
            notification_log_id, open_id,
        )
        return None

    completion = FeishuNotificationCompletion(
        notification_log_id=notification_log_id,
        open_id=open_id,
        display_name=display_name,
        biz_type=biz_type,
        biz_id=biz_id,
        status="completed",
        callback_data=callback_data,
    )
    db.add(completion)
    await db.flush()

    logger.info(
        "[feishu] 标记完成 log_id=%d open_id=%s name=%s",
        notification_log_id, open_id, display_name,
    )
    return completion
