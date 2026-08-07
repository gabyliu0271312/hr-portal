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
    from app.datasources.models import DataSource, SyncRun
    from app.datasources.sync_service import sync_to_table

    ds = await db.get(DataSource, job.business_id)
    if ds is None:
        raise RuntimeError(f"DataSource {job.business_id} not found")

    sync_run = SyncRun(datasource_id=ds.id, status="running", triggered_by=triggered_by)
    db.add(sync_run)
    await db.flush()
    batch_id = f"sync_run:{sync_run.id}"
    secrets = {k: decrypt(v) for k, v in (ds.secrets_encrypted or {}).items()}
    try:
        rows, message = await sync_to_table(
            ds.table_name, ds.source_type, ds.settings or {}, secrets, db,
            source_sync_batch_id=batch_id,
        )
    except Exception as exc:
        sync_run.status = "failed"
        sync_run.finished_at = datetime.now(UTC)
        sync_run.rows = 0
        sync_run.message = str(exc)[:1000]
        raise
    sync_run.status = "success"
    sync_run.finished_at = datetime.now(UTC)
    sync_run.rows = rows
    sync_run.message = message

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
    from sqlalchemy import select, update
    from app.reports.models import Report
    from app.automation.events import AutomationEvent, publish_event

    report = await db.get(Report, job.business_id)
    if report is None:
        raise RuntimeError(f"Report {job.business_id} not found")

    # 灏濊瘯澶嶇敤鎶ヨ〃鎵ц鏈嶅姟
    try:
        from app.reports.report_service import run_report_query
        rows, run_url = await run_report_query(report, db, triggered_by=triggered_by, period=(job.payload or {}).get("period"))
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

# ===== R0501: 仓内任务 handler =====

async def _handler_dataset_build(job: ScheduledJob, db: AsyncSession, triggered_by: str) -> tuple[int, str]:
    """数据集构建 handler"""
    from app.warehouse.service import get_warehouse_service
    dataset_id = (job.payload or {}).get("dataset_id")
    if not dataset_id:
        raise ValueError("payload.dataset_id is required")
    svc = get_warehouse_service(db)
    result = await svc.build_dataset_from_model(dataset_id)
    if "error" in result:
        raise RuntimeError(result.get("detail", "build failed"))
    return result.get("row_count", 0), f"dataset_build: dataset_id={dataset_id}, rows={result.get('row_count', '?')}"


async def _handler_snapshot_run(job: ScheduledJob, db: AsyncSession, triggered_by: str) -> tuple[int, str]:
    """快照任务 handler"""
    from app.warehouse.service import get_snapshot_service
    period_value = (job.payload or {}).get("period_value") or ""
    if not period_value:
        import datetime
        period_value = datetime.datetime.utcnow().strftime("%Y-%m")
    svc = get_snapshot_service(db)
    result = await svc.trigger_snapshot((job.payload or {}).get("job_id", 0), period_value)
    if "error" in result:
        raise RuntimeError(result.get("detail", "snapshot failed"))
    return result.get("row_count", 0), f"snapshot: {result.get('status', 'unknown')}"


async def _handler_metric_compute(job: ScheduledJob, db: AsyncSession, triggered_by: str) -> tuple[int, str]:
    """指标计算 handler"""
    from app.warehouse.service import get_metric_compute_service
    metric_id = (job.payload or {}).get("metric_id")
    if not metric_id:
        raise ValueError("payload.metric_id is required")
    svc = get_metric_compute_service(db)
    period = (job.payload or {}).get("period", "")
    result = await svc.compute_metric(metric_id, period)
    if result.get("error"):
        raise RuntimeError(result.get("error", "metric compute failed"))
    return 1, f"metric_compute: metric_id={metric_id}, status={result.get('status')}"


async def _handler_quality_run(job: ScheduledJob, db: AsyncSession, triggered_by: str) -> tuple[int, str]:
    """质量检查 handler"""
    from app.warehouse.models import WarehouseQualityRule
    from app.warehouse.quality_service import run_quality_rule
    payload = job.payload or {}
    import re
    rule_id = payload.get("rule_id") or job.business_id
    if not rule_id:
        raise ValueError("payload.rule_id is required")
    rule = await db.get(WarehouseQualityRule, int(rule_id))
    if rule is None:
        raise LookupError(f"quality rule not found: {rule_id}")
    period = payload.get("period")
    if rule.rule_type == "relation_cardinality" and (not isinstance(period, str) or not re.fullmatch(r"\d{6}", period)):
        raise ValueError("quality_run relation_cardinality requires payload.period in YYYYMM format")
    run, result = await run_quality_rule(
        db, int(rule_id), period=period,
        source_sync_batch_id=payload.get("source_sync_batch_id"),
        force=bool(payload.get("force", False)), triggered_by=triggered_by,
    )
    return result.get("checked_count", 0), f"quality_run: rule_id={rule_id}, run_id={run.id}, status={result.get('status')}"


async def _handler_quality_queue(job: ScheduledJob, db: AsyncSession, triggered_by: str) -> tuple[int, str]:
    """消费持久化质量任务，支持多 worker 单飞和失败重试。"""
    from datetime import datetime, timedelta
    from sqlalchemy import select, update
    from app.datasources.models import SyncQualityDispatch
    from app.datasources.sync_service import schedule_quality_checks_after_sync
    from app.warehouse.models import WarehouseQualityTask
    from app.warehouse.quality_service import run_quality_rule

    now = datetime.utcnow()
    stale_before = now - timedelta(minutes=15)
    await db.execute(
        update(WarehouseQualityTask)
        .where(
            WarehouseQualityTask.status == "running",
            WarehouseQualityTask.locked_at < stale_before,
        )
        .values(status="retry", available_at=now, locked_at=None)
    )
    dispatch_stale_before = now - timedelta(minutes=15)
    await db.execute(
        update(SyncQualityDispatch)
        .where(
            SyncQualityDispatch.status == "running",
            SyncQualityDispatch.locked_at < dispatch_stale_before,
        )
        .values(status="retry", available_at=now, locked_at=None)
    )
    dispatches = (await db.execute(
        select(SyncQualityDispatch)
        .where(
            SyncQualityDispatch.status.in_(["pending", "retry"]),
            SyncQualityDispatch.available_at <= now,
        )
        .order_by(SyncQualityDispatch.created_at)
        .with_for_update(skip_locked=True)
        .limit(10)
    )).scalars().all()
    for dispatch in dispatches:
        dispatch.status = "running"
        dispatch.attempts = (dispatch.attempts or 0) + 1
        dispatch.locked_at = now
        await db.flush()
        try:
            await schedule_quality_checks_after_sync(
                dispatch.table_name,
                dispatch.settings or {},
                db,
                periods=set(dispatch.periods or []),
                source_sync_batch_id=dispatch.source_sync_batch_id,
            )
            dispatch.status = "done"
            dispatch.finished_at = datetime.utcnow()
            dispatch.last_error = None
        except Exception as exc:
            await db.rollback()
            dispatch = await db.get(SyncQualityDispatch, dispatch.id)
            if dispatch is None:
                continue
            dispatch.last_error = str(exc)[:1000]
            if dispatch.attempts >= 3:
                dispatch.status = "failed"
                dispatch.finished_at = datetime.utcnow()
            else:
                dispatch.status = "retry"
                dispatch.available_at = datetime.utcnow() + timedelta(minutes=2 ** dispatch.attempts)
            await db.flush()

    tasks = (await db.execute(
        select(WarehouseQualityTask)
        .where(
            WarehouseQualityTask.status.in_(["pending", "retry"]),
            WarehouseQualityTask.available_at <= now,
        )
        .order_by(WarehouseQualityTask.created_at)
        .with_for_update(skip_locked=True)
        .limit(20)
    )).scalars().all()
    completed = 0
    for task in tasks:
        task.status = "running"
        task.attempts = (task.attempts or 0) + 1
        task.locked_at = now
        await db.flush()
        try:
            run, result = await run_quality_rule(
                db, task.rule_id, period=task.period,
                source_sync_batch_id=task.source_sync_batch_id,
                triggered_by="sync_queue",
            )
            task.status = "done" if result.get("status") != "error" else "failed"
            task.finished_at = datetime.utcnow()
            task.last_error = result.get("message") if task.status == "failed" else None
            completed += 1
        except Exception as exc:
            task.last_error = str(exc)[:1000]
            if task.attempts >= 3:
                task.status = "failed"
                task.finished_at = datetime.utcnow()
            else:
                task.status = "retry"
                task.available_at = datetime.utcnow() + timedelta(minutes=2 ** task.attempts)
    return completed, f"quality_queue: picked={len(tasks)}, completed={completed}"

async def _handler_scd_run(job: ScheduledJob, db: AsyncSession, triggered_by: str) -> tuple[int, str]:
    """SCD 拉链 handler"""
    from app.warehouse.service import get_scd_service
    config_id = (job.payload or {}).get("config_id")
    if not config_id:
        raise ValueError("payload.config_id is required")
    svc = get_scd_service(db)
    result = await svc.execute_scd(config_id)
    if "error" in result:
        raise RuntimeError(result.get("error", "scd failed"))
    total = (result.get("new_count", 0) + result.get("updated_count", 0) + result.get("closed_count", 0))
    return total, f"scd: new={result.get('new_count', 0)} updated={result.get('updated_count', 0)} closed={result.get('closed_count', 0)}"


async def _handler_ai_controlled_action_retention(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,
) -> tuple[int, str]:
    from app.ai.maintenance import purge_controlled_action_data
    from app.core.config import settings

    result = await purge_controlled_action_data(
        db,
        audit_retention_days=settings.AI_CONTROLLED_ACTION_AUDIT_RETENTION_DAYS,
        state_retention_days=settings.AI_CONTROLLED_ACTION_STATE_RETENTION_DAYS,
    )
    deleted = sum(result.values())
    return deleted, f"controlled action retention: {result}"


async def _handler_ucp_pipeline_trigger(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,
) -> tuple[int, str]:
    from app.ucp.models import UcpEventTrigger
    from app.ucp.pipeline_engine import execute_pipeline

    trigger = await db.get(UcpEventTrigger, job.business_id)
    if trigger is None or not trigger.is_active or trigger.trigger_type != "SCHEDULE":
        return 0, "pipeline trigger is disabled or no longer scheduled"
    run = await execute_pipeline(
        trigger.pipeline_code,
        db,
        trigger_type="SCHEDULED",
        triggered_by=triggered_by,
        trigger_payload={"trigger_code": trigger.trigger_code, "schedule_config": trigger.schedule_config or {}},
    )
    return 1, f"pipeline trigger {trigger.trigger_code} completed: {run.pipeline_run_id}"


async def _handler_ucp_event_maintenance(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,
) -> tuple[int, str]:
    from app.ucp.event_reliability import recover_stale_deliveries, scan_due_retries
    from app.ucp.outbox_service import dispatch_pending_outbox

    recovered = await recover_stale_deliveries(db)
    retried = await scan_due_retries(db)
    dispatched = await dispatch_pending_outbox(db)
    return recovered + len(retried) + dispatched, f"ucp event maintenance: recovered={recovered}, retried={len(retried)}, dispatched={dispatched}"



async def _handler_performance_cycle_lifecycle(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,
) -> tuple[int, str]:
    from app.performance.cycle_service import PerformanceCycleService

    locked = await PerformanceCycleService(db).process_due_locks()
    return locked, f"performance cycle lifecycle: locked={locked}"

JOB_HANDLERS: dict[str, HandlerFn] = {
    "datasource_sync": _handler_datasource_sync,
    "push_target": _handler_push_target,
    "report_run": _handler_report_run,
    "data_compare": _handler_data_compare,
    "dataset_build": _handler_dataset_build,
    "snapshot_run": _handler_snapshot_run,
    "metric_compute": _handler_metric_compute,
    "quality_run": _handler_quality_run,
    "quality_queue": _handler_quality_queue,
    "performance_cycle_lifecycle": _handler_performance_cycle_lifecycle,
    "scd_run": _handler_scd_run,
    "ai_controlled_action_retention": _handler_ai_controlled_action_retention,
    "ucp_pipeline_trigger": _handler_ucp_pipeline_trigger,
    "ucp_event_maintenance": _handler_ucp_event_maintenance,
}


def get_handler(kind: str) -> HandlerFn:
    h = JOB_HANDLERS.get(kind)
    if h is None:
        raise RuntimeError(f"Unregistered job kind: {kind}; available={list(JOB_HANDLERS.keys())}")
    return h
