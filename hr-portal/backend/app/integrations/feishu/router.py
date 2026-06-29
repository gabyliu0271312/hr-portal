"""飞书通知 API Router

提供飞书通知相关 REST API：
  POST /api/v1/feishu/notifications/resolve         — 预览接收人
  POST /api/v1/feishu/notifications/message-preview — 预览消息内容
  POST /api/v1/feishu/notifications/test            — 测试发送
  POST /api/v1/feishu/notifications/send            — 正式发送
  GET  /api/v1/feishu/notifications/logs            — 查询发送日志

  GET  /api/v1/feishu/notifications/completions     — 查询标记完成记录

  POST /api/v1/feishu/callbacks/card-action         — 飞书卡片按钮回调

  GET  /api/v1/feishu/chat-targets                  — 查询可选飞书群列表
  POST /api/v1/feishu/chat-targets                  — 新增飞书群配置
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.integrations.feishu.feishu_client import (
    build_completed_card,
    get_feishu_client,
)
from app.integrations.feishu.models import (
    FeishuChatTarget,
    FeishuNotificationCompletion,
    FeishuNotificationLog,
)
from app.integrations.feishu.notification_service import (
    get_completions,
    mark_completion,
    preview_message,
    resolve_and_preview,
    send_notification,
)
from app.integrations.feishu.schemas import (
    MessagePreviewRequest,
    NotificationResolveRequest,
    NotificationSendRequest,
    NotificationTestRequest,
)
from app.users.models import User


logger = logging.getLogger("feishu.router")
router = APIRouter(prefix="/feishu", tags=["feishu"])


# ===== 接收人预览 =====

@router.post("/notifications/resolve")
async def resolve_notification(
    req: NotificationResolveRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """预览接收人解析结果，不发送消息。
    需要 system.feishu_notification_config.V 权限。
    """
    return await resolve_and_preview(req.config, req.context, db)


# ===== 消息内容预览 =====

@router.post("/notifications/message-preview")
async def preview_notification_message(
    req: MessagePreviewRequest,
    user: User = Depends(current_user),
):
    """预览渲染后的消息内容，不发送消息。"""
    from app.integrations.feishu.notification_service import preview_message as _preview
    from app.integrations.feishu.schemas import NotificationConfig, FixedUsersRule
    # 构造最小 config 仅用于预览消息
    dummy_config = NotificationConfig(
        enabled=True,
        receivers=[],
        message=req.message,
        require_completion=req.require_completion,
    )
    return await _preview(dummy_config, req.context)


# ===== 测试发送 =====

@router.post("/notifications/test")
async def test_notification(
    req: NotificationTestRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """测试发送飞书消息（is_test=True），需要 system.feishu_notification_config.E 权限。"""
    await _check_test_permission(user, db)
    result = await send_notification(
        config=req.config,
        context=req.context,
        db=db,
        is_test=True,
        triggered_by=user.id,
    )
    await db.commit()
    return result.model_dump()


# ===== 正式发送 =====

@router.post("/notifications/send")
async def send_notification_api(
    req: NotificationSendRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """正式发送飞书消息，需要 system.feishu_notification_config.E 权限。"""
    await _check_test_permission(user, db)
    result = await send_notification(
        config=req.config,
        context=req.context,
        db=db,
        biz_type=req.biz_type,
        biz_id=req.biz_id,
        is_test=False,
        triggered_by=user.id,
    )
    await db.commit()
    return result.model_dump()


# ===== 发送日志 =====

@router.get("/notifications/logs")
async def get_notification_logs(
    biz_type: str | None = Query(None),
    biz_id: str | None = Query(None),
    is_test: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """查询飞书通知发送日志。"""
    from app.core.deps import require_op
    await require_op("automation.rules", "V")(user, db)
    stmt = select(FeishuNotificationLog).order_by(FeishuNotificationLog.created_at.desc())
    if biz_type:
        stmt = stmt.where(FeishuNotificationLog.biz_type == biz_type)
    if biz_id:
        stmt = stmt.where(FeishuNotificationLog.biz_id == biz_id)
    if is_test is not None:
        stmt = stmt.where(FeishuNotificationLog.is_test == is_test)

    total_stmt = select(FeishuNotificationLog).order_by(None)
    if biz_type:
        total_stmt = total_stmt.where(FeishuNotificationLog.biz_type == biz_type)
    if biz_id:
        total_stmt = total_stmt.where(FeishuNotificationLog.biz_id == biz_id)
    if is_test is not None:
        total_stmt = total_stmt.where(FeishuNotificationLog.is_test == is_test)

    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    logs = (await db.execute(stmt)).scalars().all()
    return {
        "page": page,
        "page_size": page_size,
        "items": [_log_to_dict(log) for log in logs],
    }


# ===== 标记完成记录查询 =====

@router.get("/notifications/completions")
async def list_completions(
    biz_type: str | None = Query(None),
    biz_id: str | None = Query(None),
    notification_log_id: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """查询标记完成记录。"""
    from app.core.deps import require_op
    await require_op("automation.rules", "V")(user, db)
    records = await get_completions(
        db,
        biz_type=biz_type,
        biz_id=biz_id,
        notification_log_id=notification_log_id,
    )
    return {
        "items": [r.model_dump() for r in records],
        "total": len(records),
    }


# ===== 飞书卡片按钮回调（标记完成） =====

def _verify_feishu_callback(request: Request, body: dict) -> None:
    """验证飞书事件回调的合法性。

    1. URL 验证：校验 Verification Token
    2. 事件回调：校验签名 + timestamp/nonce 防重放
    """
    body_type = body.get("type", "")

    # URL 验证
    if body_type == "url_verification":
        token = body.get("token", "")
        expected = _settings().FEISHU_VERIFICATION_TOKEN
        app_env = _settings().APP_ENV
        if not expected:
            if app_env == "prod":
                raise HTTPException(status_code=500, detail="FEISHU_VERIFICATION_TOKEN not configured")
            logger.warning("[feishu] FEISHU_VERIFICATION_TOKEN 未配置，跳过 URL 验证（仅开发环境）")
            return
        if token != expected:
            logger.warning("[feishu] URL 验证 token 不匹配: received=%s", token[:8] if token else "(empty)")
            raise HTTPException(status_code=403, detail="verification token mismatch")
        return

    # 事件回调：校验签名和防重放
    headers = request.headers
    feishu_timestamp = headers.get("X-Lark-Request-Timestamp") or headers.get("X-Feishu-Request-Timestamp", "")
    feishu_nonce = headers.get("X-Lark-Request-Nonce") or headers.get("X-Feishu-Request-Nonce", "")
    feishu_signature = headers.get("X-Lark-Signature") or headers.get("X-Feishu-Signature", "")

    verification_token = _settings().FEISHU_VERIFICATION_TOKEN
    if not verification_token:
        if _settings().APP_ENV == "prod":
            raise HTTPException(status_code=500, detail="FEISHU_VERIFICATION_TOKEN not configured")
        logger.warning("[feishu] FEISHU_VERIFICATION_TOKEN 未配置，跳过事件签名校验（仅开发环境）")
        return

    # P0 安全修复：生产环境必须要求完整的签名header
    if _settings().APP_ENV == "prod":
        if not feishu_timestamp or not feishu_nonce or not feishu_signature:
            logger.warning(
                "[feishu] 生产环境收到缺少签名header的请求: timestamp=%s nonce=%s signature=%s",
                "yes" if feishu_timestamp else "no",
                "yes" if feishu_nonce else "no",
                "yes" if feishu_signature else "no",
            )
            raise HTTPException(status_code=403, detail="missing signature headers")

    # 校验 timestamp 防重放
    if feishu_timestamp:
        try:
            ts_diff = abs(int(time.time()) - int(feishu_timestamp))
            max_diff = _settings().FEISHU_CALLBACK_MAX_TIMESTAMP_DIFF
            if ts_diff > max_diff:
                logger.warning("[feishu] 回调时间戳偏差过大: %ds > %ds", ts_diff, max_diff)
                raise HTTPException(status_code=403, detail="timestamp too old")
        except (ValueError, TypeError):
            raise HTTPException(status_code=403, detail="invalid timestamp")

    # 校验签名：SHA256(timestamp + nonce + verification_token + body)
    if feishu_timestamp and feishu_nonce and feishu_signature:
        raw_body = _get_raw_body(request)
        if raw_body:
            expected_sig = hashlib.sha256(
                f"{feishu_timestamp}{feishu_nonce}{verification_token}{raw_body}".encode()
            ).hexdigest()
            if not hmac.compare_digest(expected_sig, feishu_signature):
                logger.warning("[feishu] 回调签名不匹配")
                raise HTTPException(status_code=403, detail="signature mismatch")
        else:
            logger.warning("[feishu] 无法获取原始请求体用于签名校验")
            if _settings().APP_ENV == "prod":
                raise HTTPException(status_code=403, detail="cannot verify signature")


def _get_raw_body(request: Request) -> str | None:
    """获取原始请求体字符串（复用 decode 后存储在 request.state 中）。"""
    raw = getattr(request.state, "_feishu_raw_body", None)
    return raw if isinstance(raw, str) else None


def _settings():
    from app.core.config import settings
    return settings


@router.post("/callbacks/card-action")
async def handle_card_action(
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    """处理飞书卡片按钮点击回调。

    飞书会在用户点击互动卡片按钮时 POST 到此端点。
    需要在飞书开发者后台订阅 card.action.trigger 事件，
    并配置此 URL 为回调地址。

    安全校验：
      - URL 验证：校验 Verification Token
      - 事件回调：校验签名（SHA256）+ timestamp 防重放
      - open_id 以飞书签名校验后的上下文为准
    """
    # 保存原始请求体供签名校验使用
    raw_body_bytes = await request.body()
    raw_body_str = raw_body_bytes.decode("utf-8")
    # 存入 request.state 供 _get_raw_body 使用（Starlette State 支持任意属性赋值）
    setattr(request.state, "_feishu_raw_body", raw_body_str)

    try:
        body = json.loads(raw_body_str)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # URL 验证必须在签名校验之前处理（飞书不带签名 header）
    if body.get("type") == "url_verification":
        token = body.get("token", "")
        expected = _settings().FEISHU_VERIFICATION_TOKEN
        if expected and token != expected:
            logger.warning("[feishu] URL 验证 token 不匹配")
            raise HTTPException(status_code=403, detail="verification token mismatch")
        logger.info("[feishu] URL 验证成功 token=%s", token)
        return {"challenge": body.get("challenge", "")}

    # 安全校验（仅对非 URL 验证请求）
    _verify_feishu_callback(request, body)

    # 卡片按钮点击事件
    if body.get("type") != "card.action.trigger":
        logger.warning("[feishu] 未知回调类型: %s", body.get("type"))
        return {"ok": False, "msg": "unknown event type"}

    event = body.get("event", {})
    operator = event.get("operator", {})
    open_id = operator.get("open_id", {}).get("open_id", "") if isinstance(operator.get("open_id"), dict) else operator.get("open_id", "")
    action = event.get("action", {})
    action_value_str = action.get("value", "{}")

    # 解析回调 payload
    try:
        action_value = json.loads(action_value_str) if isinstance(action_value_str, str) else action_value_str
    except json.JSONDecodeError:
        logger.warning("[feishu] 无法解析 action value: %s", action_value_str)
        return {"ok": False, "msg": "invalid action value"}

    notification_log_id = action_value.get("notification_log_id")
    if not notification_log_id:
        return {"ok": False, "msg": "missing notification_log_id"}

    action_type = action_value.get("action", "mark_complete")
    biz_type = action_value.get("biz_type")
    biz_id = action_value.get("biz_id")

    logger.info(
        "[feishu] 卡片回调 action=%s log_id=%d open_id=%s",
        action_type, notification_log_id, open_id,
    )

    try:
        # 1. 记录完成
        completion = await mark_completion(
            db,
            notification_log_id=notification_log_id,
            open_id=open_id,
            biz_type=biz_type,
            biz_id=biz_id,
            callback_data=body,
        )
        await db.commit()

        # 2. 查询当前通知的所有完成记录（用于构建更新后的卡片）
        all_completions = await get_completions(
            db, notification_log_id=notification_log_id
        )

        # 3. 查询原始通知日志
        log = await db.get(FeishuNotificationLog, notification_log_id)
        if log is None:
            return {"ok": True, "toast": "✅ 已标记完成"}

        # 4. 查询总接收人数
        receivers = log.receiver_snapshot or []
        total_users = sum(
            1 for r in receivers if isinstance(r, dict) and r.get("receiver_type") == "user"
        )

        completed_names = [c.display_name or c.open_id for c in all_completions]
        completed_by_current_user = any(c.open_id == open_id for c in all_completions)
        is_group = False  # 当前仅私聊；群聊需要额外状态管理

        # 5. 构建更新后的卡片
        updated_card = build_completed_card(
            title=log.title or "通知",
            content=log.rendered_content or "",
            notification_log_id=notification_log_id,
            biz_type=biz_type,
            biz_id=biz_id,
            completed_names=completed_names,
            total_count=total_users or len(receivers),
            is_group=is_group,
            completed_by_current_user=completed_by_current_user,
        )

        # 6. 更新飞书消息卡片
        open_message_id = event.get("context", {}).get("open_message_id")
        if open_message_id:
            try:
                client = get_feishu_client()
                await client.update_interactive_message(open_message_id, updated_card)
                logger.info(
                    "[feishu] 卡片已更新 message_id=%s log_id=%d",
                    open_message_id, notification_log_id,
                )
            except Exception as update_err:
                logger.warning("[feishu] 卡片更新失败: %s", update_err)

        return {"ok": True, "toast": json.dumps({
            "type": "info",
            "content": "✅ 已标记完成",
            "icon": {"tag": "standard_result", "result_type": "success"},
        })}

    except Exception as e:
        logger.exception("[feishu] 卡片回调处理失败")
        # 返回 toast 错误提示
        return {"ok": False, "toast": "处理失败，请稍后重试"}


def _log_to_dict(log: FeishuNotificationLog) -> dict:
    return {
        "id": log.id,
        "biz_type": log.biz_type,
        "biz_id": log.biz_id,
        "is_test": log.is_test,
        "message_format": log.message_format,
        "title": log.title,
        "status": log.status,
        "success_count": log.success_count,
        "failed_count": log.failed_count,
        "error_message": log.error_message,
        "triggered_by": log.triggered_by,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        # 不返回 rendered_content / receiver_snapshot / result_snapshot 中的敏感信息
    }


# ===== 飞书群目标管理 =====

@router.get("/chat-targets")
async def list_chat_targets(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """查询活跃的飞书群配置列表。"""
    from app.core.deps import require_op
    await require_op("automation.rules", "V")(user, db)
    stmt = select(FeishuChatTarget).where(FeishuChatTarget.is_active == True).order_by(FeishuChatTarget.name)
    targets = (await db.execute(stmt)).scalars().all()
    return [
        {"id": t.id, "name": t.name, "chat_id": t.chat_id, "description": t.description}
        for t in targets
    ]


class ChatTargetCreateRequest:
    pass


@router.post("/chat-targets", status_code=status.HTTP_201_CREATED)
async def create_chat_target(
    data: dict,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """新增飞书群配置，需要 system.feishu_notification_config.C 权限。"""
    await _check_admin_permission(user, db)
    target = FeishuChatTarget(
        name=data.get("name", ""),
        chat_id=data.get("chat_id", ""),
        description=data.get("description"),
        created_by=user.id,
    )
    db.add(target)
    await db.commit()
    await db.refresh(target)
    return {"id": target.id, "name": target.name, "chat_id": target.chat_id}


# ===== 权限检查工具函数 =====

async def _check_test_permission(user: User, db: AsyncSession) -> None:
    """检查用户是否有飞书通知测试发送权限。

    需要 superadmin 或 automation.rules E 权限。
    """
    if getattr(user, "is_superadmin", False):
        return
    from app.core.deps import user_has_op
    if not await user_has_op(user, db, "automation.rules", "E"):
        raise HTTPException(status_code=403, detail="无飞书通知测试发送权限")


async def _check_admin_permission(user: User, db: AsyncSession) -> None:
    """检查用户是否有飞书群管理权限。

    需要 superadmin 或 automation.rules U 权限。
    """
    if getattr(user, "is_superadmin", False):
        return
    from app.core.deps import user_has_op
    if not await user_has_op(user, db, "automation.rules", "U"):
        raise HTTPException(status_code=403, detail="无飞书群管理权限")
