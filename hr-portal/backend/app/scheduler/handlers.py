"""鎵€鏈?handler 鐨勫疄鐜?+ JOB_HANDLERS 娉ㄥ唽琛?
========== 骞冲彴绾у叕鍏辩粍浠惰竟鐣?==========

Scheduler 鏄?HR Portal 鐨勫钩鍙扮骇鍏叡璋冨害缁勪欢锛?*涓嶄笌浠讳綍涓氬姟妯″潡鑰﹀悎**銆?
鑱岃矗杈圭晫锛?  鉁?璐熻矗锛氬畾鏃惰Е鍙戙€佹墜鍔ㄨЕ鍙戙€佽繍琛屽巻鍙插啓鍏ワ紙job_runs锛?  鉁?璐熻矗锛氳皟搴︿换鍔℃垚鍔?澶辫触鍥炲啓 scheduled_jobs.last_*
  鉂?涓嶆壙鎷咃細鐩存帴璋冪敤椋炰功娑堟伅鍙戦€?API
  鉂?涓嶆壙鎷咃細瑙ｆ瀽椋炰功閫氱煡鎺ユ敹浜?  鉂?涓嶆壙鎷咃細鎷兼帴娑堟伅妯℃澘

Handler 瀹屾垚鍚庡簲閫氳繃浜嬩欢鏈哄埗閫氱煡鍏朵粬妯″潡锛堝鑷姩鍖栬鍒欏紩鎿庯級锛?鑰岄潪鍦?handler 鍐呴儴鐩存帴鍙戦涔︽秷鎭€傝繖鏍?Scheduler 鑷韩涓嶆劅鐭ヤ换浣曚笅娓稿姩浣溿€?
========== 鏂板 Handler 姝ラ ==========

鍔犳柊鍦烘櫙鏃跺彧闇€锛?1. 鍐欎竴涓?async def _handler_<kind>(job, db, triggered_by) -> tuple[int, str]
2. 娉ㄥ唽鍒?JOB_HANDLERS["<kind>"] = ...
3. 鍦ㄤ笟鍔?CRUD 璋?scheduler.service.upsert_job(kind="<kind>", ...)
4. 涓嶉渶瑕佺 engine / models / migration

Handler 鍗忚锛堝繀瀹堬級锛?- 杩斿洖 (rows, message) 鈥?rows 鏄鐞嗚鏁帮紝message 鏄垚鍔熸憳瑕?- 寮傚父浼氳 engine 鎹曡幏骞惰嚜鍔ㄥ啓鍏?job_runs.status='failed'锛宧andler 涓嶅繀 try
- 涓嶈鍦?handler 閲屽啓 db.commit() 鈥?engine 缁熶竴绠＄悊浜嬪姟
- handler 瀹屾垚鍚庡闇€瑙﹀彂涓嬫父鍔ㄤ綔锛堝椋炰功閫氱煡锛夛紝璋冪敤 automation.events.publish_event
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.scheduler.models import ScheduledJob


logger = logging.getLogger("scheduler.handlers")


HandlerFn = Callable[[ScheduledJob, AsyncSession, str], Awaitable[tuple[int, str]]]


# ===== datasource_sync handler =====

async def _handler_datasource_sync(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,
) -> tuple[int, str]:
    """璺戜竴娆℃暟鎹簮鍚屾銆俠usiness_id = datasources.id"""
    from datetime import datetime, UTC

    from app.core.secret_box import decrypt
    from app.datasources.models import DataSource
    from app.datasources.sync_service import sync_to_table

    ds = await db.get(DataSource, job.business_id)
    if ds is None:
        raise RuntimeError(f"DataSource {job.business_id} not found")

    secrets = {k: decrypt(v) for k, v in (ds.secrets_encrypted or {}).items()}
    rows, message = await sync_to_table(
        ds.table_name, ds.source_type, ds.settings or {}, secrets, db
    )

    # 鍥炲啓 datasources.last_* 瀛楁锛堝吋瀹?Endpoints 椤靛睍绀猴級
    now = datetime.now(UTC)
    ds.last_sync_at = now
    ds.last_status = "success"
    ds.last_rows = rows
    ds.last_message = message
    return rows, message


async def _handler_push_target(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,
) -> tuple[int, str]:
    """鎺ㄩ€佸埌澶栭儴鐩爣銆俠usiness_id = push_targets.id"""
    from app.push.push_service import execute_push

    rows, message = await execute_push(job.business_id, db)
    return rows, message


# ===== report_run handler =====
# 鎶ヨ〃瀹氭椂浠诲姟閫氳繃姝?handler 鎵ц锛宐usiness_id = reports.id
# 鎵ц瀹屾垚鍚庨€氳繃浜嬩欢鏈哄埗閫氱煡鑷姩鍖栬鍒欏紩鎿庯紝涓嶇洿鎺ヨ皟鐢ㄩ涔?API銆?
async def _handler_report_run(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,
) -> tuple[int, str]:
    """瀹氭椂杩愯鎶ヨ〃銆俠usiness_id = reports.id

    鎵ц娴佺▼锛?      1. 鍔犺浇鎶ヨ〃閰嶇疆
      2. 澶嶇敤鎶ヨ〃鎵嬪姩杩愯鐨勬墽琛岄€昏緫锛坮eport_service.run_report锛?      3. 鍐欏叆 job_runs锛堢敱 engine 缁熶竴澶勭悊锛?      4. 鍙戝竷 scheduled_report_success / scheduled_report_failed 浜嬩欢锛堢敱姝?handler 鍙戝竷锛?         姣旈€氱敤 scheduled_job_* 鏇翠笟鍔″寲锛屾惡甯︽姤琛ㄤ笂涓嬫枃锛?
    娉ㄦ剰锛歨andler 涓嶇洿鎺ュ彂椋炰功娑堟伅锛屽彧鍙戝竷浜嬩欢銆?    """
    from datetime import datetime, UTC
    from sqlalchemy import select
    from app.reports.models import Report
    from app.automation.events import AutomationEvent, publish_event

    report = await db.get(Report, job.business_id)
    if report is None:
        raise RuntimeError(f"Report {job.business_id} not found")

    # 灏濊瘯澶嶇敤鎶ヨ〃鎵ц鏈嶅姟
    try:
        from app.reports.report_service import run_report_query
        rows, run_url = await run_report_query(report, db, triggered_by=triggered_by)
        status = "success"
        error_message = ""
    except Exception as e:
        rows = 0
        run_url = ""
        status = "failed"
        error_message = str(e)[:500]
        raise  # 璁?engine 鎹曡幏骞跺啓 job_runs.status='failed'

    # 鍙戝竷鎶ヨ〃涓氬姟绾т簨浠讹紙浣跨敤鐙珛session锛岄伩鍏嶄簨鍔¤竟鐣岄棶棰橈級
    event_trigger = "scheduled_report_success" if status == "success" else "scheduled_report_failed"
    try:
        from app.automation.events import AutomationEvent
        from app.core.db import get_session_factory

        # P1 淇锛氫娇鐢ㄧ嫭绔媠ession璋冪敤publish_event锛岄伩鍏嶅鐢ㄥ綋鍓嶄笟鍔′簨鍔ession
        async with get_session_factory()() as new_db:
            await publish_event(
                AutomationEvent(
                    trigger_type=event_trigger,
                    biz_type="report",
                    biz_id=str(report.id),
                    payload={
                        "report_id": report.id,
                        "report_name": report.name,
                        "dataset_id": report.dataset_id,
                        "status": status,
                        "total_rows": rows,
                        "run_time": datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S"),
                        "run_url": run_url or f"/reports/{report.id}",
                        "error_message": error_message,
                        "triggered_by": triggered_by,
                    },
                ),
                new_db,
            )
    except Exception:
        logger.warning("[report_run] 鍙戝竷鎶ヨ〃浜嬩欢澶辫触 report_id=%d", report.id)

    return rows, f"Report {report.name!r} executed successfully, rows={rows}"


# ===== data_compare handler =====
# Phase 2: 定时数据对比任务通过此 handler 执行
# business_id = data_compare_tasks.id
# 执行完成后发布 scheduled_data_compare_success/failed 事件，触发飞书通知自动化规则
async def _handler_data_compare(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,
) -> tuple[int, str]:
    """执行定时数据对比任务。business_id = data_compare_tasks.id"""
    from app.data_compare.task_service import execute_for_scheduler

    task_id = job.business_id
    diffs, message = await execute_for_scheduler(db, task_id, triggered_by=triggered_by)
    return diffs, message


# ===== 注册表 =====

JOB_HANDLERS: dict[str, HandlerFn] = {
    "datasource_sync": _handler_datasource_sync,
    "push_target": _handler_push_target,
    "report_run": _handler_report_run,
    "data_compare": _handler_data_compare,
}


def get_handler(kind: str) -> HandlerFn:
    h = JOB_HANDLERS.get(kind)
    if h is None:
        raise RuntimeError(f"Unregistered job kind: {kind}; available={list(JOB_HANDLERS.keys())}")
    return h
