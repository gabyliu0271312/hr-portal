"""UCP Phase 3-5: 审批引擎

负责高风险动作的审批工作流:
  - 提交审批 (submit_request)
  - 审批动作: APPROVE / REJECT / TRANSFER / WITHDRAW
  - 二次确认 (确认令牌)
  - 审批通过后触发实际动作 (execute_approved_request)
  - 过期扫描 (scan_expired_requests)

设计:
  - 审批模式: SINGLE / ANY / ALL
  - 二次确认: NONE / SIMPLE / TOKEN
  - 状态机: PENDING → APPROVED / REJECTED / CANCELLED / EXPIRED
  - 与 Phase 3-4 集成: EXTERNAL_ACCOUNT_DELETE / EXTERNAL_ACCOUNT_DISABLE 走审批
  - 与 Phase 3-6 集成: OA_ORG_DELETE / OA_ORG_MOVE 走审批

调用方职责:
  1. 业务侧检测到高风险动作时, 调用 submit_request 提交审批请求
  2. 审批人在前端审批 (通过 / 拒绝)
  3. 审批通过后, 业务侧监听或手动调用 execute_approved_request 执行实际动作
  4. 失败的执行结果回写 execution_error
"""
from __future__ import annotations

import json
import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Callable

from sqlalchemy import select, desc, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    ApprovalRequest,
    ApprovalStep,
    ApprovalAction,
    APPROVAL_MODE_SINGLE,
    APPROVAL_MODE_ANY,
    APPROVAL_MODE_ALL,
    CONFIRMATION_NONE,
    CONFIRMATION_SIMPLE,
    CONFIRMATION_TOKEN,
    REQUEST_STATUS_PENDING,
    REQUEST_STATUS_APPROVED,
    REQUEST_STATUS_REJECTED,
    REQUEST_STATUS_CANCELLED,
    REQUEST_STATUS_EXPIRED,
    STEP_STATUS_PENDING,
    STEP_STATUS_APPROVED,
    STEP_STATUS_REJECTED,
    STEP_STATUS_SKIPPED,
    ACTION_SUBMIT,
    ACTION_APPROVE,
    ACTION_REJECT,
    ACTION_TRANSFER,
    ACTION_WITHDRAW,
    ACTION_EXPIRE,
    ACTION_EXECUTE,
)

logger = logging.getLogger("ucp.approval")


# 默认过期时间
DEFAULT_EXPIRY_HOURS = 72

# 二次确认令牌长度
CONFIRMATION_TOKEN_LENGTH = 8


class ApprovalError(Exception):
    """审批操作错误。"""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


def _gen_request_code() -> str:
    """生成唯一审批请求号: APR-YYYYMMDD-XXXXXXXX"""
    return f"APR-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"


def _gen_confirmation_token() -> str:
    """生成二次确认令牌 (8位纯数字, 便于阅读/输入)"""
    return "".join([str(secrets.randbelow(10)) for _ in range(CONFIRMATION_TOKEN_LENGTH)])


# ===== 创建请求 =====


async def submit_request(
    db: AsyncSession,
    *,
    business_type: str,
    business_key: str,
    action: str,
    approvers: list[dict],
    action_payload: dict | None = None,
    business_summary: str | None = None,
    approval_mode: str = APPROVAL_MODE_SINGLE,
    confirmation_type: str = CONFIRMATION_NONE,
    trigger_source: str = "MANUAL",
    triggered_by: str | None = None,
    pipeline_run_id: str | None = None,
    event_id: str | None = None,
    reason: str | None = None,
    expires_in_hours: int = DEFAULT_EXPIRY_HOURS,
) -> ApprovalRequest:
    """提交一个审批请求。

    approvers: [{"user_id": "u1", "user_name": "Alice"}, ...]
    approval_mode:
      - SINGLE: 单人审批 (approvers 只需 1 人)
      - ANY: 或签 (任一通过即整体通过)
      - ALL: 会签 (全部通过)
    confirmation_type:
      - NONE: 无需二次确认
      - SIMPLE: 申请人提交时填备注
      - TOKEN: 生成 8 位数字令牌, 执行时需输入
    """
    if not approvers:
        raise ApprovalError("MISSING_APPROVERS", "审批人列表不能为空")

    if approval_mode not in {APPROVAL_MODE_SINGLE, APPROVAL_MODE_ANY, APPROVAL_MODE_ALL}:
        raise ApprovalError("INVALID_MODE", f"不支持的审批模式: {approval_mode}")

    if confirmation_type not in {CONFIRMATION_NONE, CONFIRMATION_SIMPLE, CONFIRMATION_TOKEN}:
        raise ApprovalError("INVALID_CONFIRMATION", f"不支持的二次确认类型: {confirmation_type}")

    request = ApprovalRequest(
        request_code=_gen_request_code(),
        business_type=business_type,
        business_key=business_key,
        business_summary=business_summary,
        action=action,
        action_payload=action_payload,
        approval_mode=approval_mode,
        confirmation_type=confirmation_type,
        confirmation_token=_gen_confirmation_token() if confirmation_type == CONFIRMATION_TOKEN else None,
        approvers=approvers,
        total_steps=len(approvers),
        status=REQUEST_STATUS_PENDING,
        trigger_source=trigger_source,
        triggered_by=triggered_by,
        pipeline_run_id=pipeline_run_id,
        event_id=event_id,
        reason=reason,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=expires_in_hours),
    )
    db.add(request)
    await db.flush()

    # 为每个审批人创建步骤
    for idx, approver in enumerate(approvers):
        step = ApprovalStep(
            request_id=request.id,
            step_index=idx,
            approver_id=str(approver.get("user_id", "")),
            approver_name=approver.get("user_name"),
            status=STEP_STATUS_PENDING,
        )
        db.add(step)
    await db.flush()

    # 记录提交动作
    action_log = ApprovalAction(
        request_id=request.id,
        action=ACTION_SUBMIT,
        operator_id=triggered_by,
        comment=reason,
        extra={"approvers": approvers, "approval_mode": approval_mode, "confirmation_type": confirmation_type},
    )
    db.add(action_log)
    await db.flush()

    logger.info(
        "[ucp] approval submitted: code=%s business=%s/%s approvers=%d mode=%s",
        request.request_code, business_type, business_key, len(approvers), approval_mode,
    )
    return request


# ===== 审批动作 =====


async def approve_request(
    db: AsyncSession,
    *,
    request_id: int,
    approver_id: str,
    comment: str | None = None,
) -> ApprovalRequest:
    """审批人同意请求。"""
    request = await get_request(db, request_id)
    if not request:
        raise ApprovalError("REQUEST_NOT_FOUND", f"审批请求 {request_id} 不存在")
    if request.status != REQUEST_STATUS_PENDING:
        raise ApprovalError("INVALID_STATUS", f"请求状态非 PENDING: {request.status}")

    # 检查过期
    if request.expires_at and request.expires_at < datetime.now(timezone.utc):
        await _expire_request(db, request)
        raise ApprovalError("EXPIRED", "审批已过期")

    # 找到当前审批人步骤
    step = await _find_pending_step(db, request_id, approver_id)
    if not step:
        raise ApprovalError("NOT_APPROVER", f"用户 {approver_id} 不是当前审批人或已审批")

    now = datetime.now(timezone.utc)
    step.status = STEP_STATUS_APPROVED
    step.action_at = now
    step.comment = comment
    request.approved_count += 1
    request.current_step += 1

    # 记录动作
    db.add(ApprovalAction(
        request_id=request_id,
        step_id=step.id,
        action=ACTION_APPROVE,
        operator_id=approver_id,
        operator_name=step.approver_name,
        comment=comment,
    ))

    # 检查整体是否通过
    if _is_request_approved(request):
        request.status = REQUEST_STATUS_APPROVED
        request.completed_at = now
        logger.info("[ucp] approval approved: code=%s", request.request_code)
    elif _is_request_rejected(request):
        request.status = REQUEST_STATUS_REJECTED
        request.completed_at = now
    else:
        # 还有未审批的步骤, 检查 ANY 模式
        if request.approval_mode == APPROVAL_MODE_ANY and request.approved_count > 0:
            # ANY: 任一通过即整体通过
            request.status = REQUEST_STATUS_APPROVED
            request.completed_at = now
            # 标记其余步骤为 SKIPPED
            await _skip_remaining_steps(db, request_id)
            logger.info("[ucp] approval approved (ANY): code=%s", request.request_code)

    await db.flush()
    return request


async def reject_request(
    db: AsyncSession,
    *,
    request_id: int,
    approver_id: str,
    comment: str | None = None,
) -> ApprovalRequest:
    """审批人拒绝请求。"""
    request = await get_request(db, request_id)
    if not request:
        raise ApprovalError("REQUEST_NOT_FOUND", f"审批请求 {request_id} 不存在")
    if request.status != REQUEST_STATUS_PENDING:
        raise ApprovalError("INVALID_STATUS", f"请求状态非 PENDING: {request.status}")

    if request.expires_at and request.expires_at < datetime.now(timezone.utc):
        await _expire_request(db, request)
        raise ApprovalError("EXPIRED", "审批已过期")

    step = await _find_pending_step(db, request_id, approver_id)
    if not step:
        raise ApprovalError("NOT_APPROVER", f"用户 {approver_id} 不是当前审批人或已审批")

    now = datetime.now(timezone.utc)
    step.status = STEP_STATUS_REJECTED
    step.action_at = now
    step.comment = comment
    request.rejected_count += 1

    # 记录动作
    db.add(ApprovalAction(
        request_id=request_id,
        step_id=step.id,
        action=ACTION_REJECT,
        operator_id=approver_id,
        operator_name=step.approver_name,
        comment=comment,
    ))

    # 任一拒绝即整体拒绝 (适用于 SINGLE/ANY/ALL)
    request.status = REQUEST_STATUS_REJECTED
    request.completed_at = now

    # 标记其余步骤为 SKIPPED
    await _skip_remaining_steps(db, request_id)
    logger.info("[ucp] approval rejected: code=%s by=%s", request.request_code, approver_id)
    await db.flush()
    return request


async def transfer_request(
    db: AsyncSession,
    *,
    request_id: int,
    from_approver_id: str,
    to_user_id: str,
    to_user_name: str | None = None,
    comment: str | None = None,
) -> ApprovalRequest:
    """转交审批给其他人。"""
    request = await get_request(db, request_id)
    if not request:
        raise ApprovalError("REQUEST_NOT_FOUND", f"审批请求 {request_id} 不存在")
    if request.status != REQUEST_STATUS_PENDING:
        raise ApprovalError("INVALID_STATUS", f"请求状态非 PENDING: {request.status}")

    step = await _find_pending_step(db, request_id, from_approver_id)
    if not step:
        raise ApprovalError("NOT_APPROVER", f"用户 {from_approver_id} 不是当前审批人")

    # 创建新步骤
    new_step = ApprovalStep(
        request_id=request_id,
        step_index=request.total_steps,
        approver_id=to_user_id,
        approver_name=to_user_name,
        status=STEP_STATUS_PENDING,
    )
    db.add(new_step)
    request.total_steps += 1

    # 标记原步骤为 SKIPPED (但保留记录)
    step.status = STEP_STATUS_SKIPPED
    step.transferred_to = to_user_id
    step.comment = comment or f"转交给 {to_user_name or to_user_id}"

    db.add(ApprovalAction(
        request_id=request_id,
        step_id=step.id,
        action=ACTION_TRANSFER,
        operator_id=from_approver_id,
        operator_name=step.approver_name,
        comment=comment,
        extra={"transferred_to": to_user_id, "to_user_name": to_user_name},
    ))

    await db.flush()
    return request


async def withdraw_request(
    db: AsyncSession,
    *,
    request_id: int,
    operator_id: str,
    comment: str | None = None,
) -> ApprovalRequest:
    """申请人撤回自己的请求。"""
    request = await get_request(db, request_id)
    if not request:
        raise ApprovalError("REQUEST_NOT_FOUND", f"审批请求 {request_id} 不存在")
    if request.status != REQUEST_STATUS_PENDING:
        raise ApprovalError("INVALID_STATUS", f"请求状态非 PENDING: {request.status}")
    if request.triggered_by and request.triggered_by != operator_id:
        raise ApprovalError("NOT_OWNER", "只能撤回自己提交的请求")

    now = datetime.now(timezone.utc)
    request.status = REQUEST_STATUS_CANCELLED
    request.completed_at = now
    await _skip_remaining_steps(db, request_id)

    db.add(ApprovalAction(
        request_id=request_id,
        action=ACTION_WITHDRAW,
        operator_id=operator_id,
        comment=comment,
    ))

    logger.info("[ucp] approval withdrawn: code=%s by=%s", request.request_code, operator_id)
    await db.flush()
    return request


# ===== 执行已审批通过的动作 =====


async def execute_approved_request(
    db: AsyncSession,
    *,
    request_id: int,
    confirmation_token: str | None = None,
    executor: Callable[[ApprovalRequest], Any] | None = None,
) -> ApprovalRequest:
    """执行已审批通过的动作。

    如果请求设置了 TOKEN 二次确认, 必须提供正确令牌。
    executor: 可选回调, 接收 ApprovalRequest, 执行实际业务动作 (如调用 adapter)
              如果不传, 只更新状态, 由调用方自己实现执行逻辑。
    """
    request = await get_request(db, request_id)
    if not request:
        raise ApprovalError("REQUEST_NOT_FOUND", f"审批请求 {request_id} 不存在")
    if request.status != REQUEST_STATUS_APPROVED:
        raise ApprovalError("NOT_APPROVED", f"请求未审批通过: {request.status}")

    # 二次确认
    if request.confirmation_type == CONFIRMATION_TOKEN:
        if not confirmation_token:
            raise ApprovalError("MISSING_TOKEN", "需要二次确认令牌")
        if confirmation_token != request.confirmation_token:
            raise ApprovalError("INVALID_TOKEN", "二次确认令牌错误")

    now = datetime.now(timezone.utc)
    request.executed_at = now

    if executor:
        try:
            await executor(request)
            request.execution_result = "SUCCESS"
            db.add(ApprovalAction(
                request_id=request_id,
                action=ACTION_EXECUTE,
                operator_id="system",
                extra={"result": "SUCCESS"},
            ))
        except Exception as e:
            request.execution_result = "FAILED"
            request.execution_error = str(e)[:500]
            db.add(ApprovalAction(
                request_id=request_id,
                action=ACTION_EXECUTE,
                operator_id="system",
                extra={"result": "FAILED", "error": str(e)[:500]},
            ))
            logger.exception("[ucp] approval execution failed: code=%s err=%s", request.request_code, e)
    await db.flush()
    return request


# ===== 查询 =====


async def get_request(db: AsyncSession, request_id: int) -> ApprovalRequest | None:
    stmt = select(ApprovalRequest).where(ApprovalRequest.id == request_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_request_by_code(db: AsyncSession, request_code: str) -> ApprovalRequest | None:
    stmt = select(ApprovalRequest).where(ApprovalRequest.request_code == request_code)
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_requests(
    db: AsyncSession,
    *,
    status: str | None = None,
    business_type: str | None = None,
    triggered_by: str | None = None,
    approver_id: str | None = None,
    pipeline_run_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ApprovalRequest]:
    """查询审批请求列表。

    approver_id: 如果提供, 只返回该用户作为审批人的请求。
    """
    stmt = select(ApprovalRequest)
    if status:
        stmt = stmt.where(ApprovalRequest.status == status)
    if business_type:
        stmt = stmt.where(ApprovalRequest.business_type == business_type)
    if triggered_by:
        stmt = stmt.where(ApprovalRequest.triggered_by == triggered_by)
    if pipeline_run_id:
        stmt = stmt.where(ApprovalRequest.pipeline_run_id == pipeline_run_id)
    if approver_id:
        # 子查询: 该用户作为审批人
        subq = select(ApprovalStep.request_id).where(
            ApprovalStep.approver_id == approver_id,
            ApprovalStep.status == STEP_STATUS_PENDING,
        )
        stmt = stmt.where(ApprovalRequest.id.in_(subq))
    stmt = stmt.order_by(desc(ApprovalRequest.created_at)).limit(limit).offset(offset)
    return list((await db.execute(stmt)).scalars().all())


async def list_steps(db: AsyncSession, request_id: int) -> list[ApprovalStep]:
    stmt = (
        select(ApprovalStep)
        .where(ApprovalStep.request_id == request_id)
        .order_by(ApprovalStep.step_index)
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_actions(db: AsyncSession, request_id: int) -> list[ApprovalAction]:
    stmt = (
        select(ApprovalAction)
        .where(ApprovalAction.request_id == request_id)
        .order_by(ApprovalAction.created_at)
    )
    return list((await db.execute(stmt)).scalars().all())


async def get_my_pending_count(db: AsyncSession, approver_id: str) -> int:
    """获取某审批人待办数量。"""
    from sqlalchemy import func as sqlfunc
    subq = select(ApprovalStep.request_id).where(
        ApprovalStep.approver_id == approver_id,
        ApprovalStep.status == STEP_STATUS_PENDING,
    )
    stmt = select(sqlfunc.count(ApprovalRequest.id)).where(
        ApprovalRequest.id.in_(subq),
        ApprovalRequest.status == REQUEST_STATUS_PENDING,
    )
    return (await db.execute(stmt)).scalar() or 0


# ===== 过期扫描 =====


async def scan_expired_requests(db: AsyncSession, batch_size: int = 50) -> list[ApprovalRequest]:
    """扫描并标记过期的 PENDING 请求。"""
    now = datetime.now(timezone.utc)
    stmt = (
        select(ApprovalRequest)
        .where(
            ApprovalRequest.status == REQUEST_STATUS_PENDING,
            ApprovalRequest.expires_at.isnot(None),
            ApprovalRequest.expires_at < now,
        )
        .limit(batch_size)
    )
    items = list((await db.execute(stmt)).scalars().all())
    for req in items:
        await _expire_request(db, req)
    await db.flush()
    return items


# ===== 内部辅助 =====


async def _find_pending_step(
    db: AsyncSession, request_id: int, approver_id: str
) -> ApprovalStep | None:
    stmt = (
        select(ApprovalStep)
        .where(
            ApprovalStep.request_id == request_id,
            ApprovalStep.approver_id == approver_id,
            ApprovalStep.status == STEP_STATUS_PENDING,
        )
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _skip_remaining_steps(db: AsyncSession, request_id: int) -> None:
    stmt = select(ApprovalStep).where(
        ApprovalStep.request_id == request_id,
        ApprovalStep.status == STEP_STATUS_PENDING,
    )
    steps = list((await db.execute(stmt)).scalars().all())
    for s in steps:
        s.status = STEP_STATUS_SKIPPED


async def _expire_request(db: AsyncSession, request: ApprovalRequest) -> None:
    request.status = REQUEST_STATUS_EXPIRED
    request.completed_at = datetime.now(timezone.utc)
    await _skip_remaining_steps(db, request.id)
    db.add(ApprovalAction(
        request_id=request.id,
        action=ACTION_EXPIRE,
        operator_id="system",
        comment="审批超时过期",
    ))


def _is_request_approved(request: ApprovalRequest) -> bool:
    """判断请求是否整体通过。"""
    if request.approval_mode == APPROVAL_MODE_SINGLE:
        return request.approved_count >= 1
    elif request.approval_mode == APPROVAL_MODE_ALL:
        return request.approved_count >= request.total_steps
    elif request.approval_mode == APPROVAL_MODE_ANY:
        return False  # ANY 在 approve_request 内单独处理
    return False


def _is_request_rejected(request: ApprovalRequest) -> bool:
    """判断请求是否整体拒绝 (主要用于 ALL 模式全员通过前有人拒绝)。"""
    return request.rejected_count > 0


# ===== ORM 转字典 =====


def request_to_dict(req: ApprovalRequest, include_steps: bool = False) -> dict:
    return {
        "id": req.id,
        "request_code": req.request_code,
        "business_type": req.business_type,
        "business_key": req.business_key,
        "business_summary": req.business_summary,
        "action": req.action,
        "action_payload": req.action_payload,
        "approval_mode": req.approval_mode,
        "confirmation_type": req.confirmation_type,
        "confirmation_token": req.confirmation_token,  # 仅管理员可见, 前端可选择性展示
        "approvers": req.approvers,
        "status": req.status,
        "current_step": req.current_step,
        "total_steps": req.total_steps,
        "approved_count": req.approved_count,
        "rejected_count": req.rejected_count,
        "trigger_source": req.trigger_source,
        "triggered_by": req.triggered_by,
        "pipeline_run_id": req.pipeline_run_id,
        "event_id": req.event_id,
        "executed_at": req.executed_at.isoformat() if req.executed_at else None,
        "execution_result": req.execution_result,
        "execution_error": req.execution_error,
        "expires_at": req.expires_at.isoformat() if req.expires_at else None,
        "reason": req.reason,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
        "completed_at": req.completed_at.isoformat() if req.completed_at else None,
    }


def step_to_dict(step: ApprovalStep) -> dict:
    return {
        "id": step.id,
        "request_id": step.request_id,
        "step_index": step.step_index,
        "approver_id": step.approver_id,
        "approver_name": step.approver_name,
        "status": step.status,
        "action_at": step.action_at.isoformat() if step.action_at else None,
        "comment": step.comment,
        "transferred_to": step.transferred_to,
        "created_at": step.created_at.isoformat() if step.created_at else None,
    }


def action_to_dict(action: ApprovalAction) -> dict:
    return {
        "id": action.id,
        "request_id": action.request_id,
        "step_id": action.step_id,
        "action": action.action,
        "operator_id": action.operator_id,
        "operator_name": action.operator_name,
        "comment": action.comment,
        "extra": action.extra,
        "created_at": action.created_at.isoformat() if action.created_at else None,
    }
