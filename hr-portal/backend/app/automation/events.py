"""标准事件发布机制 MVP

业务模块（Scheduler handler、报表等）完成后通过此模块发布标准事件，
自动化规则引擎订阅事件并执行匹配的动作。

第一期：同步执行，不引入消息队列。
后续可升级为异步队列（Celery/ARQ/Redis Streams）而不改变业务调用方接口。

标准事件类型：
  scheduled_job_success        Scheduler job 成功
  scheduled_job_failed         Scheduler job 失败
  scheduled_job_finished       Scheduler job 完成（无论成功失败）
  report_run_success           报表手动运行成功
  report_run_failed            报表手动运行失败
  scheduled_report_success     报表定时运行成功
  scheduled_report_failed      报表定时运行失败

  === Z01 ODS→DWD 自动化事件 ===
  datasource_sync_completed        DataSource 同步完成（payload: datasource_id, table_name, sync_status, sync_rows, sync_message, source_run_id）
  ods_table_data_changed           ODS 表数据变更（payload: table_name, data_change_id, source, change_type, affected_row_count, business_keys, source_run_id/upload_batch_id, changed_by, changed_at）
  ods_table_metadata_changed       ODS 表元数据变更（payload: table_name, metadata_change_id, change_type, affected_columns, changed_by, changed_at）
  standardization_rule_changed     清洗规则变更（payload: rule_set_id, table_name, change_type, changed_by, changed_at）
  ods_dwd_automation_config_changed ODS→DWD 自动化配置变更（payload: config_id, table_name, change_type, changed_by, changed_at）
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, UTC
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger("automation.events")


class AutomationEvent(BaseModel):
    """标准自动化事件。

    所有业务模块完成时发布此对象，自动化规则引擎根据 trigger_type 匹配规则。
    """
    event_id: str = Field(default_factory=lambda: f"evt_{uuid.uuid4().hex[:12]}")
    trigger_type: str
    biz_type: str
    biz_id: str
    event_time: datetime = Field(default_factory=lambda: datetime.now(UTC))
    payload: dict[str, Any] = Field(default_factory=dict)


async def publish_event(event: AutomationEvent, db: AsyncSession) -> None:
    """发布事件，触发自动化规则引擎同步执行匹配的规则。

    调用方不需要关心规则匹配和动作执行细节。
    失败不影响调用方的主流程（异常会被捕获并记录日志）。

    事务边界由本函数管理：内部 commit 执行记录，异常时 rollback。
    调用方应传入独立 session（如 async with session_factory() as db:）。
    """
    try:
        from app.automation.engine import process_event
        await process_event(event, db)
        await db.commit()
    except Exception:
        logger.exception(
            "[automation] publish_event 异常 event_id=%s trigger=%s",
            event.event_id, event.trigger_type,
        )
        try:
            await db.rollback()
        except Exception:
            pass
