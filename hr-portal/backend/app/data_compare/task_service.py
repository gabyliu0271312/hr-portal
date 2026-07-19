"""Phase 2 — 对比任务 CRUD + 执行服务。

职责：
  1. 任务 CRUD（create/list/get/update/delete）
  2. 手动执行（execute_task）→ 复用 Phase 1 的 run_data_compare
  3. 调度执行（execute_for_scheduler）→ scheduler handler 调用
  4. 调度绑定（bind_schedule）→ 创建 ScheduledJob
  5. 执行记录查询（list_runs/get_run）

执行结果写入 data_compare_runs 表，同时回写 data_compare_tasks.last_*。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.data_compare.models import AiSkill, DataCompareRun, DataCompareTask
from app.permissions.scope_filter import _is_super_admin
from app.users.models import User

logger = logging.getLogger("data_compare.task_service")


# ── Ownership ──────────────────────────────────────────────────────────

async def user_can_access_task(
    task: DataCompareTask, user_id: int, db: AsyncSession
) -> bool:
    user = await db.get(User, user_id)
    if user is None:
        return False
    if await _is_super_admin(user, db):
        return True
    return task.created_by == user_id


# ── CRUD ──────────────────────────────────────────────────────────────

async def create_task(
    db: AsyncSession,
    *,
    name: str,
    skill_id: int | None = None,
    description: str | None = None,
    enabled: bool = False,
    cron_expression: str | None = None,
    user_id: int | None = None,
) -> DataCompareTask:
    """Create a new compare task.

    If skill_id is provided, compare_type/table_a/table_b/join_keys are
    derived from the skill's CompareSpec params.
    """
    compare_type = ""
    table_a = ""
    table_b = ""
    join_keys: list = []

    if skill_id:
        skill = await db.get(AiSkill, skill_id)
        if skill is None:
            raise ValueError(f"Skill {skill_id} not found")
        from app.data_compare.metadata import MetadataLoader
        from app.data_compare.normalizer import normalize_compare_spec

        loader = MetadataLoader(db)
        spec = await normalize_compare_spec(skill.params, loader, instruction=skill.instruction)
        compare_type = spec.compare_type.value
        table_a = spec.source_a.table
        table_b = spec.source_b.table
        join_keys = spec.join_keys

    task = DataCompareTask(
        skill_id=skill_id,
        name=name,
        description=description,
        compare_type=compare_type,
        table_a=table_a,
        table_b=table_b,
        join_keys=join_keys,
        enabled=enabled,
        cron_expression=cron_expression,
        created_by=user_id,
    )
    db.add(task)
    await db.flush()

    # If cron provided, create a ScheduledJob
    if cron_expression:
        await _bind_schedule(db, task, cron_expression, enabled)

    await db.commit()
    await db.refresh(task)
    return task


async def list_tasks(
    db: AsyncSession,
    *,
    enabled: bool | None = None,
    user_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[DataCompareTask], int]:
    base = select(DataCompareTask)
    count_base = select(func.count(DataCompareTask.id))

    if enabled is not None:
        base = base.where(DataCompareTask.enabled == enabled)
        count_base = count_base.where(DataCompareTask.enabled == enabled)
    if user_id is not None:
        base = base.where(DataCompareTask.created_by == user_id)
        count_base = count_base.where(DataCompareTask.created_by == user_id)

    total = (await db.execute(count_base)).scalar() or 0
    rows = (
        await db.execute(
            base.order_by(DataCompareTask.updated_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return list(rows), total


async def get_task(db: AsyncSession, task_id: int) -> DataCompareTask | None:
    return await db.get(DataCompareTask, task_id)


async def update_task(
    db: AsyncSession,
    task_id: int,
    *,
    name: str | None = None,
    description: str | None = None,
    enabled: bool | None = None,
    cron_expression: str | None = None,
) -> DataCompareTask | None:
    task = await db.get(DataCompareTask, task_id)
    if task is None:
        return None

    if name is not None:
        task.name = name
    if description is not None:
        task.description = description
    if enabled is not None:
        task.enabled = enabled

    # Handle cron changes
    if cron_expression is not None:
        task.cron_expression = cron_expression
        await _bind_schedule(db, task, cron_expression, task.enabled)

    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task_id: int) -> bool:
    task = await db.get(DataCompareTask, task_id)
    if task is None:
        return False

    # Disable associated scheduled job
    if task.scheduled_job_id:
        from app.scheduler.service import disable_job
        try:
            await disable_job(db, task.scheduled_job_id)
        except Exception:
            logger.warning("Failed to disable scheduled job %d for task %d", task.scheduled_job_id, task_id)

    await db.delete(task)
    await db.commit()
    return True


# ── Schedule Binding ──────────────────────────────────────────────────

async def _bind_schedule(
    db: AsyncSession,
    task: DataCompareTask,
    cron: str,
    enabled: bool,
) -> None:
    """Create or update a ScheduledJob for the task."""
    from app.scheduler.service import upsert_job

    job = await upsert_job(
        db,
        kind="data_compare",
        business_id=task.id,
        cron=cron,
        payload={"task_id": task.id},
        enabled=enabled,
    )
    task.scheduled_job_id = job.id

    # Reload job in scheduler engine
    try:
        from app.scheduler.engine import reload_job
        await reload_job(job.id)
    except Exception:
        logger.warning("Failed to reload scheduler job %d", job.id)


# ── Execution ─────────────────────────────────────────────────────────

async def execute_task(
    db: AsyncSession,
    task: DataCompareTask,
    *,
    trigger_type: str = "manual",
    triggered_by: int | None = None,
) -> DataCompareRun:
    """Execute a compare task and record the result.

    Loads CompareSpec from the linked ai_skill, runs the comparison via
    Phase 1's run_data_compare, and writes a DataCompareRun record.
    Also updates task.last_* fields.
    """
    from app.data_compare.chat_handler import run_data_compare
    from app.data_compare.executor import ScopeDeniedError
    from app.data_compare.service import to_json_compatible
    from app.data_compare.validator import SchemaValidationError

    started_at = datetime.now(timezone.utc)
    run = DataCompareRun(
        task_id=task.id,
        trigger_type=trigger_type,
        status="failed",
        triggered_by=triggered_by,
        started_at=started_at,
    )

    try:
        # Load CompareSpec from linked skill
        if task.skill_id is None:
            raise ValueError(f"Task {task.id} has no linked skill_id")
        skill = await db.get(AiSkill, task.skill_id)
        if skill is None:
            raise ValueError(f"Skill {task.skill_id} not found")

        # Load user for scope (use triggered_by or skill owner)
        user_id = triggered_by or skill.created_by
        if user_id is None:
            raise ValueError("No user context for execution")
        user = await db.get(User, user_id)
        if user is None:
            raise ValueError(f"User {user_id} not found")

        # Execute comparison
        result_dict = await run_data_compare(
            skill.params,
            user,
            db,
            instruction=skill.instruction,
        )

        # Populate run record
        run.status = result_dict.get("status", "success")
        if run.status == "consistent":
            run.status = "success"
        run.diff_count = result_dict.get("summary", {}).get("diff_count", 0)
        run.summary = to_json_compatible(result_dict.get("summary"))
        run.detail = to_json_compatible({"details": result_dict.get("details", [])})
        run.duration_ms = result_dict.get("duration_ms")
        run.finished_at = datetime.now(timezone.utc)

        # Update task last_* fields
        task.last_run_at = run.finished_at
        task.last_status = run.status
        task.last_diff_count = run.diff_count
        task.last_summary = run.summary

    except ScopeDeniedError as e:
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        run.status = "failed"
        logger.warning("[task %d] scope denied: %s", task.id, e)
    except SchemaValidationError as e:
        run.error_message = "; ".join(e.errors)
        run.finished_at = datetime.now(timezone.utc)
        run.status = "failed"
        logger.warning("[task %d] validation error: %s", task.id, e.errors)
    except Exception as e:
        run.error_message = str(e)[:1000]
        run.finished_at = datetime.now(timezone.utc)
        run.status = "failed"
        logger.exception("[task %d] execution failed", task.id)

    db.add(run)
    await db.flush()
    await db.commit()
    return run


async def execute_for_scheduler(
    db: AsyncSession,
    task_id: int,
    triggered_by: str = "scheduler",
) -> tuple[int, str]:
    """Execute a compare task from the scheduler handler.

    Returns (rows, message) per the scheduler handler protocol.
    Also publishes an automation event for downstream notifications.
    """
    task = await db.get(DataCompareTask, task_id)
    if task is None:
        raise RuntimeError(f"DataCompareTask {task_id} not found")

    # Use skill owner as the executing user
    skill = await db.get(AiSkill, task.skill_id) if task.skill_id else None
    user_id = skill.created_by if skill else None

    run = await execute_task(
        db,
        task,
        trigger_type="scheduled",
        triggered_by=user_id,
    )

    # Publish automation event for downstream notifications (feishu, etc.)
    try:
        from app.automation.events import AutomationEvent
        from app.core.db import get_session_factory

        event_trigger = (
            "scheduled_data_compare_success"
            if run.status != "failed"
            else "scheduled_data_compare_failed"
        )
        async with get_session_factory()() as event_db:
            await _publish_event(
                event_db,
                trigger_type=event_trigger,
                biz_type="data_compare",
                biz_id=str(task.id),
                payload={
                    "task_id": task.id,
                    "task_name": task.name,
                    "run_id": run.id,
                    "status": run.status,
                    "diff_count": run.diff_count,
                    "summary": run.summary,
                    "duration_ms": run.duration_ms,
                    "triggered_by": triggered_by,
                    "run_time": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                },
            )
    except Exception:
        logger.warning("[task %d] failed to publish automation event", task.id)

    return run.diff_count, f"Task {task.name!r} executed, status={run.status}, diffs={run.diff_count}"


async def _publish_event(
    db: AsyncSession,
    *,
    trigger_type: str,
    biz_type: str,
    biz_id: str,
    payload: dict,
) -> None:
    from app.automation.events import AutomationEvent, publish_event

    await publish_event(
        AutomationEvent(
            trigger_type=trigger_type,
            biz_type=biz_type,
            biz_id=biz_id,
            payload=payload,
        ),
        db,
    )


# ── Run History ───────────────────────────────────────────────────────

async def list_runs(
    db: AsyncSession,
    task_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[DataCompareRun], int]:
    base = select(DataCompareRun).where(DataCompareRun.task_id == task_id)
    count_base = select(func.count(DataCompareRun.id)).where(DataCompareRun.task_id == task_id)

    total = (await db.execute(count_base)).scalar() or 0
    rows = (
        await db.execute(
            base.order_by(DataCompareRun.started_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return list(rows), total


async def get_run(db: AsyncSession, run_id: int) -> DataCompareRun | None:
    return await db.get(DataCompareRun, run_id)
