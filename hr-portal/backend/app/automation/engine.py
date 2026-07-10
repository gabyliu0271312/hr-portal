"""自动化规则引擎

负责：
  1. 接收 AutomationEvent
  2. 查询匹配 trigger_type 且 enabled 的规则
  3. 检查 trigger_config 中的业务 ID 过滤
  4. 逐规则执行动作
  5. 记录 automation_executions 和 automation_action_executions

一期：同步执行，不使用消息队列。
"""
from __future__ import annotations

import logging
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.automation.action_registry import get_action
from app.automation.events import AutomationEvent
from app.automation.models import (
    AutomationActionExecution,
    AutomationExecution,
    AutomationRule,
)
from app.system.models import SystemLog


logger = logging.getLogger("automation.engine")


async def process_event(event: AutomationEvent, db: AsyncSession) -> None:
    """处理标准事件，匹配并执行所有满足条件的自动化规则。"""
    # 查询匹配的规则
    stmt = (
        select(AutomationRule)
        .where(AutomationRule.trigger_type == event.trigger_type)
        .where(AutomationRule.enabled == True)
    )
    rules = (await db.execute(stmt)).scalars().all()

    if not rules:
        return

    logger.info(
        "[automation] event %s trigger=%s matched %d rules",
        event.event_id, event.trigger_type, len(rules),
    )

    for rule in rules:
        # 检查 trigger_config 中的业务 ID 过滤
        tc = rule.trigger_config or {}
        if tc.get("biz_id") and tc["biz_id"] != event.biz_id:
            continue

        await _execute_rule(rule, event, db)


async def _execute_rule(
    rule: AutomationRule,
    event: AutomationEvent,
    db: AsyncSession,
) -> None:
    """执行单条规则的所有动作，写入执行日志。"""
    exec_record = AutomationExecution(
        rule_id=rule.id,
        event_id=event.event_id,
        trigger_type=event.trigger_type,
        biz_type=event.biz_type,
        biz_id=event.biz_id,
        event_payload=event.payload,
        status="running",
        started_at=datetime.now(UTC),
    )
    db.add(exec_record)
    await db.flush()  # 获取 id

    actions = rule.actions_config or []
    all_success = True
    any_success = False

    for idx, action_def in enumerate(actions):
        if not action_def.get("enabled", True):
            continue

        action_type = action_def.get("type", "")
        action_config = action_def.get("config", {})

        action_exec = AutomationActionExecution(
            execution_id=exec_record.id,
            action_index=idx,
            action_type=action_type,
            action_config_snapshot=action_config,
            input_snapshot={"event_payload": event.payload},
            status="running",
            started_at=datetime.now(UTC),
        )
        db.add(action_exec)
        await db.flush()

        try:
            action_fn = get_action(action_type)
            output = await action_fn(action_config, event.payload, db, exec_record.id)
            action_exec.output_snapshot = output
            # 根据 action 返回值判断真实状态
            output_status = output.get("status", "success") if isinstance(output, dict) else "success"
            if output_status in ("failed", "review_required", "approval_required", "skipped"):
                action_exec.status = output_status
                action_exec.error_message = output.get("reason", "") or output.get("detail", "")
                all_success = False
            else:
                action_exec.status = "success"
                any_success = True
        except Exception as e:
            logger.exception(
                "[automation] rule %d action[%d]=%s 执行失败 exec_id=%d",
                rule.id, idx, action_type, exec_record.id,
            )
            action_exec.status = "failed"
            action_exec.error_message = str(e)[:1000]
            all_success = False
            # run_on_error 为 true 时继续执行后续动作
            if not action_def.get("run_on_error", False):
                break
        finally:
            action_exec.finished_at = datetime.now(UTC)

    # 汇总状态
    if all_success and any_success:
        exec_record.status = "success"
    elif any_success:
        exec_record.status = "partial_success"
    else:
        exec_record.status = "failed"
    exec_record.finished_at = datetime.now(UTC)

    # 写入系统操作日志：ODS→DWD 自动化用独立 category，其他走 automation_notification
    ods_dwd_triggers = {"datasource_sync_completed", "ods_table_data_changed", "ods_table_metadata_changed", "standardization_rule_changed", "ods_dwd_automation_config_changed"}
    log_category = "ods_dwd_automation" if event.trigger_type in ods_dwd_triggers else "automation_notification"
    sys_log = SystemLog(
        category=log_category,
        action=f"rule_{rule.id}",
        status=exec_record.status,
        user_id=None,
        request_summary=f"触发规则: {rule.name}",
        response_summary=f"状态: {exec_record.status}",
        metadata_json={
            "rule_id": rule.id,
            "rule_name": rule.name,
            "trigger_type": event.trigger_type,
            "biz_id": event.biz_id,
            "biz_type": event.biz_type,
            "exec_id": exec_record.id,
            "event_id": event.event_id,
        },
    )
    db.add(sys_log)

    # 不在此处 commit；由调用方（publish_event / scheduler）统一管理事务边界
    # 执行记录通过 session flush 已写入数据库，commit 由外层 async with session 上下文管理
    logger.info(
        "[automation] rule %d exec %d status=%s",
        rule.id, exec_record.id, exec_record.status,
    )
