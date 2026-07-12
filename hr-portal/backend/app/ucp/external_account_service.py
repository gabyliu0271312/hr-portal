"""UCP Phase 3-4: 外部账号 Service

负责外部账号（滴滴/曹操/钉钉等）的生命周期管理：
  - 创建 / 激活 / 停用 / 重启 / 删除
  - 审计日志记录
  - 与 pipeline 集成 (CREATE / UPDATE / DISABLE / DELETE 操作)
  - 与 Phase 3-5 审批集成 (高风险动作)

设计原则：
  - 幂等键: (system_code, external_user_id)
  - 每个动作有审计行
  - 失败/重试由 adapter 层处理, service 只负责状态推进
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import ExternalAccount, ExternalAccountAudit
from app.ucp.masking import mask_phone, mask_name

logger = logging.getLogger("ucp.external_account")


# 状态常量
STATUS_PENDING = "PENDING"          # 待创建（初始化）
STATUS_ACTIVE = "ACTIVE"            # 活跃
STATUS_DISABLED = "DISABLED"        # 停用
STATUS_DELETED = "DELETED"          # 已删除
STATUS_FAILED = "FAILED"            # 失败（待重试）

# 操作类型
ACTION_CREATE = "CREATE"
ACTION_UPDATE = "UPDATE"
ACTION_DISABLE = "DISABLE"
ACTION_REACTIVATE = "REACTIVATE"
ACTION_DELETE = "DELETE"

# 高风险动作：需要 Phase 3-5 审批
HIGH_RISK_ACTIONS = {ACTION_DELETE, ACTION_DISABLE}

# 触发来源
TRIGGER_PIPELINE = "PIPELINE"
TRIGGER_MANUAL = "MANUAL"
TRIGGER_EVENT = "EVENT"
TRIGGER_APPROVAL = "APPROVAL"


class ExternalAccountError(Exception):
    """外部账号操作错误基类。"""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


async def get_account(
    db: AsyncSession,
    system_code: str,
    external_user_id: str,
) -> ExternalAccount | None:
    """按 (system, external_user_id) 查询账号。"""
    stmt = select(ExternalAccount).where(
        ExternalAccount.system_code == system_code,
        ExternalAccount.external_user_id == external_user_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_account_by_id(
    db: AsyncSession,
    account_id: int,
) -> ExternalAccount | None:
    """按主键查询账号。"""
    stmt = select(ExternalAccount).where(ExternalAccount.id == account_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_accounts(
    db: AsyncSession,
    system_code: str | None = None,
    employee_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ExternalAccount]:
    """查询账号列表。"""
    stmt = select(ExternalAccount)
    if system_code:
        stmt = stmt.where(ExternalAccount.system_code == system_code)
    if employee_id:
        stmt = stmt.where(ExternalAccount.employee_id == employee_id)
    if status:
        stmt = stmt.where(ExternalAccount.status == status)
    stmt = stmt.order_by(desc(ExternalAccount.updated_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def record_audit(
    db: AsyncSession,
    *,
    account_id: int,
    system_code: str,
    employee_id: str,
    action: str,
    result: str,
    external_user_id: str | None = None,
    trigger_source: str = TRIGGER_PIPELINE,
    pipeline_run_id: str | None = None,
    event_id: str | None = None,
    approval_id: int | None = None,
    operator: str | None = None,
    request_payload: dict | None = None,
    response_payload: dict | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
) -> ExternalAccountAudit:
    """记录一条审计日志。"""
    audit = ExternalAccountAudit(
        account_id=account_id,
        system_code=system_code,
        employee_id=employee_id,
        external_user_id=external_user_id,
        action=action,
        result=result,
        trigger_source=trigger_source,
        pipeline_run_id=pipeline_run_id,
        event_id=event_id,
        approval_id=approval_id,
        operator=operator,
        request_payload=request_payload,
        response_payload=response_payload,
        error_code=error_code,
        error_message=error_message,
    )
    db.add(audit)
    await db.flush()
    return audit


async def apply_action(
    db: AsyncSession,
    *,
    account: ExternalAccount,
    action: str,
    operator: str | None = None,
    pipeline_run_id: str | None = None,
    event_id: str | None = None,
    approval_id: int | None = None,
    trigger_source: str = TRIGGER_PIPELINE,
) -> ExternalAccount:
    """根据动作推进账号状态。

    action: CREATE / UPDATE / DISABLE / REACTIVATE / DELETE
    调用方需自行处理审计/异常, 此函数只做状态转换。
    """
    now = datetime.now(timezone.utc)

    if action == ACTION_CREATE:
        account.status = STATUS_ACTIVE
        account.activated_at = now
    elif action == ACTION_UPDATE:
        # UPDATE 不改变状态, 仅刷新 updated_at
        pass
    elif action == ACTION_DISABLE:
        if account.status == STATUS_DELETED:
            raise ExternalAccountError(
                "INVALID_STATE",
                f"不能停用已删除账号 (id={account.id})",
            )
        account.status = STATUS_DISABLED
        account.disabled_at = now
    elif action == ACTION_REACTIVATE:
        if account.status == STATUS_DELETED:
            raise ExternalAccountError(
                "INVALID_STATE",
                f"不能重启已删除账号 (id={account.id})",
            )
        account.status = STATUS_ACTIVE
        account.activated_at = now
        account.disabled_at = None
    elif action == ACTION_DELETE:
        account.status = STATUS_DELETED
        account.deleted_at = now
    else:
        raise ExternalAccountError(
            "INVALID_ACTION",
            f"未知动作: {action}",
        )

    account.last_action = action
    account.last_pipeline_run_id = pipeline_run_id
    account.last_event_id = event_id
    account.retry_count = 0
    account.last_error_code = None
    account.last_error_message = None
    await db.flush()
    return account


async def mark_failed(
    db: AsyncSession,
    account: ExternalAccount,
    error_code: str,
    error_message: str,
) -> ExternalAccount:
    """标记账号为失败状态（保留上一次业务状态，叠加 FAILED）。"""
    account.status = STATUS_FAILED
    account.last_error_code = error_code
    account.last_error_message = error_message[:500] if error_message else None
    account.retry_count = (account.retry_count or 0) + 1
    await db.flush()
    return account


async def create_account(
    db: AsyncSession,
    *,
    system_code: str,
    employee_id: str,
    employee_name: str | None = None,
    employee_mobile: str | None = None,
    external_user_id: str,
    external_account_name: str | None = None,
    extra: dict | None = None,
    pipeline_run_id: str | None = None,
    event_id: str | None = None,
    operator: str | None = None,
) -> ExternalAccount:
    """创建或更新账号（幂等）。

    如果 (system_code, external_user_id) 已存在, 视为同员工重复触发, 不重建。
    """
    existing = await get_account(db, system_code, external_user_id)
    if existing:
        # 幂等: 已存在则更新员工信息, 不改状态
        if employee_name and not existing.employee_name:
            existing.employee_name = mask_name(employee_name)
        if employee_mobile and not existing.employee_mobile_masked:
            existing.employee_mobile_masked = mask_phone(employee_mobile)
        await db.flush()
        return existing

    account = ExternalAccount(
        system_code=system_code,
        employee_id=employee_id,
        employee_name=mask_name(employee_name) if employee_name else None,
        employee_mobile_masked=mask_phone(employee_mobile) if employee_mobile else None,
        external_user_id=external_user_id,
        external_account_name=external_account_name,
        status=STATUS_PENDING,
        extra=extra or {},
    )
    db.add(account)
    await db.flush()
    return account


async def list_audits(
    db: AsyncSession,
    *,
    account_id: int | None = None,
    system_code: str | None = None,
    employee_id: str | None = None,
    action: str | None = None,
    result: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ExternalAccountAudit]:
    """查询审计日志。"""
    stmt = select(ExternalAccountAudit)
    if account_id is not None:
        stmt = stmt.where(ExternalAccountAudit.account_id == account_id)
    if system_code:
        stmt = stmt.where(ExternalAccountAudit.system_code == system_code)
    if employee_id:
        stmt = stmt.where(ExternalAccountAudit.employee_id == employee_id)
    if action:
        stmt = stmt.where(ExternalAccountAudit.action == action)
    if result:
        stmt = stmt.where(ExternalAccountAudit.result == result)
    stmt = stmt.order_by(desc(ExternalAccountAudit.created_at)).limit(limit).offset(offset)
    result_proxy = await db.execute(stmt)
    return list(result_proxy.scalars().all())


def to_dict(account: ExternalAccount) -> dict:
    """账号 ORM 转字典。"""
    return {
        "id": account.id,
        "system_code": account.system_code,
        "employee_id": account.employee_id,
        "employee_name": account.employee_name,
        "employee_mobile_masked": account.employee_mobile_masked,
        "external_user_id": account.external_user_id,
        "external_account_name": account.external_account_name,
        "status": account.status,
        "last_action": account.last_action,
        "last_pipeline_run_id": account.last_pipeline_run_id,
        "last_event_id": account.last_event_id,
        "last_error_code": account.last_error_code,
        "last_error_message": account.last_error_message,
        "retry_count": account.retry_count,
        "extra": account.extra,
        "created_at": account.created_at.isoformat() if account.created_at else None,
        "updated_at": account.updated_at.isoformat() if account.updated_at else None,
        "activated_at": account.activated_at.isoformat() if account.activated_at else None,
        "disabled_at": account.disabled_at.isoformat() if account.disabled_at else None,
        "deleted_at": account.deleted_at.isoformat() if account.deleted_at else None,
    }


def audit_to_dict(audit: ExternalAccountAudit) -> dict:
    """审计 ORM 转字典。"""
    return {
        "id": audit.id,
        "account_id": audit.account_id,
        "system_code": audit.system_code,
        "employee_id": audit.employee_id,
        "external_user_id": audit.external_user_id,
        "action": audit.action,
        "result": audit.result,
        "trigger_source": audit.trigger_source,
        "pipeline_run_id": audit.pipeline_run_id,
        "event_id": audit.event_id,
        "approval_id": audit.approval_id,
        "operator": audit.operator,
        "request_payload": audit.request_payload,
        "response_payload": audit.response_payload,
        "error_code": audit.error_code,
        "error_message": audit.error_message,
        "created_at": audit.created_at.isoformat() if audit.created_at else None,
    }
