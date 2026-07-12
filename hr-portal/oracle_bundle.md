🧿 oracle 0.9.0 — From 'it told me so' to 'tests say so'.
[SYSTEM]
You are Oracle, a focused one-shot problem solver. Emphasize direct answers and cite any files referenced.

[USER]
代码审查

### File: app/data_compare/models.py
```python
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base

class AiSkill(Base):
    """AI 技能（数据对比配置）存储。

    本期仅存储 skill_type='data_compare'。
    params 存 CompareSpec JSON — 这是执行核心。
    instruction 存用户原始需求描述 — 仅用于展示和对话种子。
    直接执行路径（从管理页点"运行"）不经过 LLM。
    """

    __tablename__ = "ai_skills"
    __table_args__ = (
        Index("ix_ai_skills_type", "skill_type"),
        Index("ix_ai_skills_status", "status"),
        Index("ix_ai_skills_created_by", "created_by"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    skill_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="data_compare", server_default="data_compare"
    )
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="draft", server_default="draft"
    )
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="chat_save", server_default="chat_save"
    )
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

class DataCompareTask(Base):
    """Phase 2 — 对比任务（持久化的定期执行配置）。

    是 ai_skills 的"调度层"补充：ai_skills.params 存 CompareSpec JSON，
    data_compare_tasks 存调度元数据（enabled、cron、last_run 状态）。
    通过 skill_id 关联到 ai_skills 获取完整对比配置。
    """

    __tablename__ = "data_compare_tasks"
    __table_args__ = (
        Index("ix_dc_tasks_enabled", "enabled"),
        Index("ix_dc_tasks_created_by", "created_by"),
        Index("ix_dc_tasks_skill", "skill_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    skill_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ai_skills.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 调度元数据（冗余，方便索引查询）
    compare_type: Mapped[str] = mapped_column(String(32), nullable=False)
    table_a: Mapped[str] = mapped_column(String(64), nullable=False)
    table_b: Mapped[str] = mapped_column(String(64), nullable=False)
    join_keys: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cron_expression: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scheduled_job_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    automation_rule_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_diff_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

class DataCompareRun(Base):
    """Phase 2 — 对比执行记录。

    每次执行（手动/定时/AI对话）都产生一条记录。
    detail 存差异明细（可能较大），summary 存摘要。
    """

    __tablename__ = "data_compare_runs"
    __table_args__ = (
        Index("ix_dc_runs_task", "task_id"),
        Index("ix_dc_runs_status", "status"),
        Index("ix_dc_runs_started", "started_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("data_compare_tasks.id", ondelete="CASCADE"), nullable=False
    )
    trigger_type: Mapped[str] = mapped_column(
        String(32), nullable=False  # 'manual' | 'scheduled' | 'ai_chat'
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False  # 'success' | 'partial_diff' | 'failed'
    )
    diff_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    execution_sql: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

### File: app/data_compare/task_service.py
```python
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
        run.summary = result_dict.get("summary")
        run.detail = {"details": result_dict.get("details", [])}
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
```

### File: app/data_compare/router.py
```python
"""Data comparison skill REST API endpoints.

Permission model:
  - system.data_compare "V" — required to list/view/execute skills and query metadata
  - system.data_compare "C" — required to create skills
  - system.data_compare "U" — required to update skills
  - system.data_compare "D" — required to delete skills
  - Users can only view/modify/delete their own skills (ownership check)
  - Super admins bypass ownership checks
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.ai.provider import chat_completion_openai_compatible
from app.ai.service import active_ai_config
from app.core.secret_box import decrypt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data_compare.chat_handler import extract_compare_spec, run_data_compare
from app.data_compare.executor import ScopeDeniedError, _build_scope_sql
from app.data_compare.metadata import MetadataLoader
from app.data_compare.normalizer import normalize_compare_spec
from app.data_compare.schemas import (
    CompareSpec,
    CompareResult,
    SkillCreate,
    SkillInvokeResponse,
    SkillListParams,
    SkillOut,
    SkillUpdate,
)
from app.data_compare.validator import SchemaValidationError, validate_compare_spec
from app.data_compare import service, task_service
from app.permissions.scope_filter import _is_super_admin
from app.users.models import User

router = APIRouter(prefix="/data-compare", tags=["data-compare"])

# Permission dependencies
_require_v = require_op("system.data_compare", "V")
_require_c = require_op("system.data_compare", "C")
_require_u = require_op("system.data_compare", "U")
_require_d = require_op("system.data_compare", "D")


class SkillGenerateRequest(BaseModel):
    instruction: str
    name: str | None = None


class SkillGenerateResponse(BaseModel):
    params: dict
    summary: str


def _spec_summary(spec: CompareSpec) -> str:
    type_label = {
        "roster": "名单对比",
        "field": "字段对比",
        "amount": "金额对比",
    }.get(spec.compare_type.value, spec.compare_type.value)
    period = spec.source_a.period or spec.source_b.period or "未指定"
    join_keys = "、".join(spec.join_keys) or "未指定"
    return (
        f"{type_label}：{spec.source_a.table} → {spec.source_b.table}；"
        f"期间={period}；关联键={join_keys}"
    )

async def _normalize_and_validate_params(
    params: dict,
    db: AsyncSession,
    *,
    instruction: str | None = None,
) -> CompareSpec:
    if not params:
        raise HTTPException(status_code=400, detail="请先通过 AI 生成 CompareSpec；params 不能为空")
    loader = MetadataLoader(db)
    try:
        spec = await normalize_compare_spec(params, loader, instruction=instruction)
        await validate_compare_spec(spec, loader)
        return spec
    except SchemaValidationError as e:
        raise HTTPException(status_code=400, detail=f"参数校验失败: {'; '.join(e.errors)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"技能参数不合法: {e}")


async def _data_compare_model_call(db: AsyncSession):
    config = await active_ai_config(db)
    if not config:
        raise HTTPException(status_code=400, detail="No active AI provider configured. Please enable an AI model first")
    model = (config.model_reasoning or config.model_fast_json or "").strip()
    api_key = decrypt(config.api_key_encrypted or "")
    if not model or not api_key:
        raise HTTPException(status_code=400, detail="AI config is incomplete: missing model or API Key")

    async def call(prompt: str) -> str:
        _, content, _usage = await chat_completion_openai_compatible(
            api_key=api_key,
            base_url=config.base_url,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            timeout=int(config.timeout_seconds or 60),
            response_format={"type": "json_object"},
        )
        return content

    return call


# ── ai_skills CRUD ──────────────────────────────────────────────────────


@router.post("/skills", response_model=SkillOut)
async def create_skill(
    data: SkillCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_c),
):
    spec = await _normalize_and_validate_params(data.params, db, instruction=data.instruction)
    data = data.model_copy(update={"params": spec.model_dump(mode="json")})
    skill = await service.create_skill(db, data, user.id)
    return SkillOut.model_validate(skill)


@router.get("/skills", response_model=dict)
async def list_skills(
    skill_type: str | None = Query("data_compare"),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    params = SkillListParams(skill_type=skill_type, status=status, limit=limit, offset=offset)
    # Super admins see all skills; regular users see only their own
    is_admin = await _is_super_admin(user, db)
    rows, total = await service.list_skills(db, params, user_id=None if is_admin else user.id)
    return {
        "items": [SkillOut.model_validate(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/skills/generate", response_model=SkillGenerateResponse)
async def generate_skill_params(
    data: SkillGenerateRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_c),
):
    """Generate and normalize CompareSpec from natural-language instruction."""
    instruction = (data.instruction or "").strip()
    if not instruction:
        raise HTTPException(status_code=400, detail="自然语言需求不能为空")

    loader = MetadataLoader(db)
    model_call = await _data_compare_model_call(db)
    try:
        spec = await extract_compare_spec(instruction, loader, model_call)
        spec = await normalize_compare_spec(spec, loader, instruction=instruction)
        await validate_compare_spec(spec, loader)
    except SchemaValidationError as e:
        raise HTTPException(status_code=400, detail=f"参数校验失败: {'; '.join(e.errors)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"生成 CompareSpec 失败: {e}")

    return SkillGenerateResponse(params=spec.model_dump(mode="json"), summary=_spec_summary(spec))


@router.get("/skills/{skill_id}", response_model=SkillOut)
async def get_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    skill = await service.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    if not await service.user_can_access(skill, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    return SkillOut.model_validate(skill)


@router.patch("/skills/{skill_id}", response_model=SkillOut)
async def update_skill(
    skill_id: int,
    data: SkillUpdate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_u),
):
    skill = await service.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    if not await service.user_can_access(skill, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    if data.params is not None:
        instruction = data.instruction or skill.instruction
        spec = await _normalize_and_validate_params(data.params, db, instruction=instruction)
        data = data.model_copy(update={"params": spec.model_dump(mode="json")})
    skill = await service.update_skill(db, skill_id, data)
    return SkillOut.model_validate(skill)


@router.delete("/skills/{skill_id}")
async def delete_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_d),
):
    skill = await service.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    if not await service.user_can_access(skill, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    deleted = await service.delete_skill(db, skill_id)
    return {"ok": deleted}


@router.post("/skills/{skill_id}/invoke", response_model=SkillInvokeResponse)
async def invoke_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """Execute a stored compare configuration directly (no LLM)."""
    skill = await service.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    if not await service.user_can_access(skill, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        loader = MetadataLoader(db)
        spec = await normalize_compare_spec(skill.params, loader, instruction=skill.instruction)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"技能参数不合法: {e}")

    try:
        result_dict = await run_data_compare(spec, user, db, instruction=skill.instruction)
    except SchemaValidationError as e:
        raise HTTPException(status_code=400, detail=f"参数校验失败: {'; '.join(e.errors)}")
    except ScopeDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = CompareResult.model_validate(result_dict)

    # Record execution
    await service.record_skill_run(db, skill_id, result.model_dump())

    return SkillInvokeResponse(skill_id=skill_id, result=result)


@router.post("/invoke", response_model=CompareResult)
async def invoke_adhoc(
    spec: dict,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """Execute a one-off comparison (no config saved)."""
    try:
        result_dict = await run_data_compare(spec, user, db)
    except SchemaValidationError as e:
        raise HTTPException(status_code=400, detail=f"参数校验失败: {'; '.join(e.errors)}")
    except ScopeDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return CompareResult.model_validate(result_dict)


# ── Metadata Query APIs ─────────────────────────────────────────────────


@router.get("/tables", response_model=dict)
async def list_comparable_tables(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """List registered tables available for data comparison.

    Tables are filtered by row-level scope: tables the user has no
    access to (scope = "false") are excluded from the list.
    """
    loader = MetadataLoader(db)
    tables = await loader.list_tables()

    # Filter by scope access per table
    filtered = []
    for t in tables:
        if t.scope_strategy:
            scope = await _build_scope_sql(user, t.table_name, db, t.scope_strategy)
            if scope.strip() == "false":
                continue  # no access → skip
        filtered.append(t)

    return {
        "tables": [
            {
                "table_name": t.table_name,
                "table_label": t.table_label,
                "is_period": t.is_period,
                "join_keys": t.get_join_keys(),
            }
            for t in filtered
        ]
    }


@router.get("/tables/{table_name}/columns", response_model=dict)
async def get_table_columns(
    table_name: str,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """Get column metadata for a specific registered table.

    Returns 404 if the table is not registered or the user has no
    row-level access to it.
    """
    loader = MetadataLoader(db)
    meta = await loader.get_table(table_name)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not registered")

    # Check scope access for this specific table
    if meta.scope_strategy:
        scope = await _build_scope_sql(user, table_name, db, meta.scope_strategy)
        if scope.strip() == "false":
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not registered")

    return {
        "table_name": meta.table_name,
        "table_label": meta.table_label,
        "is_period": meta.is_period,
        "columns": [
            {
                "column_code": c.column_code,
                "column_label": c.column_label,
                "data_type": c.data_type,
                "is_pk_part": c.is_pk_part,
            }
            for c in meta.columns.values()
        ],
    }


# ── Phase 2: Task CRUD + Execution ──────────────────────────────────


class TaskCreate(BaseModel):
    name: str
    skill_id: int | None = None
    description: str | None = None
    enabled: bool = False
    cron_expression: str | None = None


class TaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    cron_expression: str | None = None


class TaskOut(BaseModel):
    id: int
    skill_id: int | None
    name: str
    description: str | None
    compare_type: str
    table_a: str
    table_b: str
    join_keys: list
    enabled: bool
    cron_expression: str | None
    scheduled_job_id: int | None
    last_run_at: str | None
    last_status: str | None
    last_diff_count: int
    created_by: int | None
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, task) -> "TaskOut":
        return cls(
            id=task.id,
            skill_id=task.skill_id,
            name=task.name,
            description=task.description,
            compare_type=task.compare_type,
            table_a=task.table_a,
            table_b=task.table_b,
            join_keys=task.join_keys,
            enabled=task.enabled,
            cron_expression=task.cron_expression,
            scheduled_job_id=task.scheduled_job_id,
            last_run_at=task.last_run_at.isoformat() if task.last_run_at else None,
            last_status=task.last_status,
            last_diff_count=task.last_diff_count,
            created_by=task.created_by,
            created_at=task.created_at.isoformat() if task.created_at else "",
            updated_at=task.updated_at.isoformat() if task.updated_at else "",
        )


class RunOut(BaseModel):
    id: int
    task_id: int
    trigger_type: str
    status: str
    diff_count: int
    summary: dict | None
    duration_ms: int | None
    error_message: str | None
    triggered_by: int | None
    started_at: str
    finished_at: str | None

    @classmethod
    def from_orm(cls, run) -> "RunOut":
        return cls(
            id=run.id,
            task_id=run.task_id,
            trigger_type=run.trigger_type,
            status=run.status,
            diff_count=run.diff_count,
            summary=run.summary,
            duration_ms=run.duration_ms,
            error_message=run.error_message,
            triggered_by=run.triggered_by,
            started_at=run.started_at.isoformat() if run.started_at else "",
            finished_at=run.finished_at.isoformat() if run.finished_at else None,
        )


@router.post("/tasks", response_model=TaskOut)
async def create_task(
    data: TaskCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_c),
):
    if data.skill_id is not None:
        skill = await service.get_skill(db, data.skill_id)
        if skill is None:
            raise HTTPException(status_code=404, detail="Skill not found")
        if not await service.user_can_access(skill, user.id, db):
            raise HTTPException(status_code=403, detail="Access denied")

    task = await task_service.create_task(
        db,
        name=data.name,
        skill_id=data.skill_id,
        description=data.description,
        enabled=data.enabled,
        cron_expression=data.cron_expression,
        user_id=user.id,
    )
    return TaskOut.from_orm(task)


@router.get("/tasks", response_model=dict)
async def list_tasks(
    enabled: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    is_admin = await _is_super_admin(user, db)
    rows, total = await task_service.list_tasks(
        db,
        enabled=enabled,
        user_id=None if is_admin else user.id,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [TaskOut.from_orm(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/tasks/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    task = await task_service.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not await task_service.user_can_access_task(task, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    return TaskOut.from_orm(task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_u),
):
    task = await task_service.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not await task_service.user_can_access_task(task, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    task = await task_service.update_task(
        db,
        task_id,
        name=data.name,
        description=data.description,
        enabled=data.enabled,
        cron_expression=data.cron_expression,
    )
    return TaskOut.from_orm(task)


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_d),
):
    task = await task_service.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not await task_service.user_can_access_task(task, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    deleted = await task_service.delete_task(db, task_id)
    return {"ok": deleted}


@router.post("/tasks/{task_id}/run", response_model=RunOut)
async def run_task(
    task_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """Manually trigger a compare task execution."""
    task = await task_service.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not await task_service.user_can_access_task(task, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    run = await task_service.execute_task(
        db, task, trigger_type="manual", triggered_by=user.id
    )
    return RunOut.from_orm(run)


@router.get("/tasks/{task_id}/runs", response_model=dict)
async def list_task_runs(
    task_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    task = await task_service.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not await task_service.user_can_access_task(task, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    runs, total = await task_service.list_runs(db, task_id, limit=limit, offset=offset)
    return {
        "items": [RunOut.from_orm(r) for r in runs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/runs/{run_id}", response_model=dict)
async def get_run_detail(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """Get full run detail including diff rows."""
    run = await task_service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    # Check ownership via task
    task = await task_service.get_task(db, run.task_id)
    if task and not await task_service.user_can_access_task(task, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    result = RunOut.from_orm(run).model_dump()
    result["detail"] = run.detail
    result["execution_sql"] = run.execution_sql
    return result
```

### File: app/scheduler/handlers.py
```python
﻿"""鎵€鏈?handler 鐨勫疄鐜?+ JOB_HANDLERS 娉ㄥ唽琛?
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
```

### File: app/data_compare/formatter.py
```python
"""ResultFormatter — 将原始查询结果格式化为结构化对比报告。"""
from __future__ import annotations

from app.data_compare.schemas import (
    CompareResult,
    CompareResultSummary,
    CompareType,
)

def format_result(
    rows: list[dict],
    compare_type: CompareType,
    table_a_label: str,
    table_b_label: str,
    period_a: str | None,
    period_b: str | None,
    duration_ms: int | None = None,
    max_detail: int = 200,
    sensitive_columns: set[str] | None = None,
) -> CompareResult:
    """Format raw query rows into a structured CompareResult.

    max_detail controls how many detail rows are included in the result.

    sensitive_columns: set of output-column names whose values should be
    masked (replaced with "***") in the output details, to prevent
    leaking PII/敏感数据.  Must use output-column names (e.g.
    "salary_a", "amount_a"), NOT original column codes.
    """
    summary = CompareResultSummary(total_compared=len(rows))

    # Format first (before masking) so summary aggregation uses real values
    if compare_type == CompareType.ROSTER:
        _format_roster(rows, summary, table_a_label, table_b_label)
    elif compare_type == CompareType.FIELD:
        _format_field(rows, summary)
    elif compare_type == CompareType.AMOUNT:
        _format_amount(rows, summary)

    # Now mask sensitive columns in details AFTER summary aggregation
    effective_mask: set[str] = set(sensitive_columns or [])
    if compare_type == CompareType.AMOUNT:
        # If either amount column is sensitive, diff also reveals sensitive info
        if "amount_a" in effective_mask or "amount_b" in effective_mask:
            effective_mask.add("diff")

    if effective_mask:
        masked_rows = []
        for row in rows:
            masked = {
                k: "***" if k in effective_mask else v
                for k, v in row.items()
            }
            masked_rows.append(masked)
        rows = masked_rows

        # Also clear summary monetary fields if metric columns are sensitive
        if "amount_a" in (sensitive_columns or set()):
            summary.total_amount_a = None
        if "amount_b" in (sensitive_columns or set()):
            summary.total_amount_b = None
        if summary.total_amount_a is None or summary.total_amount_b is None:
            summary.amount_diff = None

    # Determine status
    if summary.diff_count == 0:
        status = "consistent"
    elif summary.diff_count / max(summary.total_compared, 1) > 0.3:
        status = "significant_diff"
    else:
        status = "partial_diff"

    conclusion = _build_conclusion(compare_type, summary, table_a_label, table_b_label)

    return CompareResult(
        compare_type=compare_type.value,
        table_a=table_a_label,
        table_b=table_b_label,
        period_a=period_a,
        period_b=period_b,
        status=status,
        summary=summary,
        details=rows[:max_detail],  # use spec-configured limit
        conclusion=conclusion,
        duration_ms=duration_ms,
    )

def _format_roster(
    rows: list[dict],
    summary: CompareResultSummary,
    table_a_label: str,
    table_b_label: str,
) -> None:
    summary.diff_count = len(rows)
    summary.matched_count = 0  # 名单对比中 rows 只有差异（FULL OUTER JOIN + WHERE IS NULL）
    summary.only_in_a_count = sum(
        1 for r in rows if table_a_label in str(r.get("diff_type", ""))
    )
    summary.only_in_b_count = sum(
        1 for r in rows if table_b_label in str(r.get("diff_type", ""))
    )
    summary.total_compared = summary.diff_count

def _format_field(rows: list[dict], summary: CompareResultSummary) -> None:
    summary.diff_count = len(rows)
    summary.total_compared = len(rows)

def _format_amount(rows: list[dict], summary: CompareResultSummary) -> None:
    diff_rows = [r for r in rows if r.get("status") != "一致"]
    summary.diff_count = len(diff_rows)
    summary.matched_count = len(rows) - summary.diff_count
    summary.total_compared = len(rows)

    # 汇总金额
    summary.total_amount_a = sum(
        (r.get("amount_a") or 0) for r in rows if r.get("amount_a") is not None
    )
    summary.total_amount_b = sum(
        (r.get("amount_b") or 0) for r in rows if r.get("amount_b") is not None
    )
    if summary.total_amount_a is not None and summary.total_amount_b is not None:
        summary.amount_diff = summary.total_amount_a - summary.total_amount_b

def _build_conclusion(
    compare_type: CompareType,
    summary: CompareResultSummary,
    table_a_label: str,
    table_b_label: str,
) -> str:
    if summary.diff_count == 0:
        return f"✅ {table_a_label} 与 {table_b_label} 数据完全一致。"

    parts: list[str] = []
    if compare_type == CompareType.ROSTER:
        parts.append(f"{table_a_label} 与 {table_b_label} 名单存在差异。")
        if summary.only_in_a_count:
            parts.append(f"仅在{table_a_label}中有 {summary.only_in_a_count} 人")
        if summary.only_in_b_count:
            parts.append(f"仅在{table_b_label}中有 {summary.only_in_b_count} 人")
    elif compare_type == CompareType.FIELD:
        parts.append(f"{table_a_label} 与 {table_b_label} 共 {summary.diff_count} 条字段不一致。")
    elif compare_type == CompareType.AMOUNT:
        parts.append(f"{table_a_label} 与 {table_b_label} 共 {summary.diff_count} 个维度金额不一致。")
        if summary.amount_diff is not None:
            parts.append(f"总差额: ¥{summary.amount_diff:,.2f}")

    return " ".join(parts)
```

### File: app/data_compare/executor.py
```python
"""QueryExecutor — safely execute compiled parameterized SQL.

Scope resolution is done BEFORE engine compilation. The engine receives
pre-built scope clauses and injects them directly into WHERE 1=1.

Scope alias handling:
  build_scope_filter() accepts a table_alias parameter. When provided,
  it uses SQLAlchemy's aliased() at the expression level so that compiled
  SQL already contains alias-prefixed column references (e.g.
  "t_a"."cost_center_code"). No post-hoc string replacement is needed.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.data_compare.engine import CompiledQuery
from app.data_compare.metadata import MetadataLoader
from app.users.models import User

class ScopeDeniedError(PermissionError):
    """Raised when user has no row-level access to one or both tables."""
    pass

async def _build_scope_sql(
    user: User,
    table_name: str,
    db: AsyncSession,
    strategy: str,
    table_alias: str | None = None,
) -> str:
    """Build scope filter as a raw SQL WHERE condition string.

    Uses build_scope_filter with an optional table_alias. When table_alias
    is provided, SQLAlchemy's aliased() generates alias-prefixed column
    references (e.g. "t_a"."cost_center_code") directly — no post-hoc
    regex rewriting needed.

    Returns "true" if the user has unrestricted access (super_admin or
    unlimited scope tag). Returns "false" if the user has no access.
    """
    from app.permissions.scope_filter import _is_super_admin
    if await _is_super_admin(user, db):
        return "true"

    try:
        from app.permissions.scope_filter import build_scope_filter
        clause = await build_scope_filter(
            user, table_name, db, strategy=strategy, table_alias=table_alias,
        )
    except Exception:
        return "false"

    if clause is None:
        return "false"

    compiled = str(clause.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    ))

    compiled = compiled.strip()
    lower = compiled.lower()

    if lower.startswith("true"):
        return "true"
    if lower.startswith("false"):
        return "false"

    return compiled

async def build_scope_for_compare(
    user: User,
    source_a_table: str,
    source_b_table: str,
    loader: MetadataLoader,
    db: AsyncSession,
    alias_a: str = "t_a",
    alias_b: str = "t_b",
) -> tuple[str, str]:
    """Build row-level scope conditions for both sides of a comparison.

    Returns (scope_clause_a, scope_clause_b) where each is:
      - "true" → no restriction
      - a raw SQL condition like '"t_a"."org_id" IN (1, 2, 3)'

    alias_a / alias_b specify the table aliases used in the compiled SQL
    (e.g. "t_a"/"t_b" for roster/field, "v" for amount). The alias is
    passed to build_scope_filter() which uses SQLAlchemy's aliased() to
    generate alias-prefixed column references at the expression level.

    Raises ScopeDeniedError if either side has scope = "false", ensuring
    "no access" is never misreported as "data is consistent".
    """
    meta_a = await loader.get_table(source_a_table)
    meta_b = await loader.get_table(source_b_table)

    scope_a = "true"
    scope_b = "true"

    if meta_a and meta_a.scope_strategy:
        scope_a = await _build_scope_sql(
            user, source_a_table, db, meta_a.scope_strategy,
            table_alias=alias_a,
        )
    if meta_b and meta_b.scope_strategy:
        scope_b = await _build_scope_sql(
            user, source_b_table, db, meta_b.scope_strategy,
            table_alias=alias_b,
        )

    if scope_a.strip() == "false" or scope_b.strip() == "false":
        raise ScopeDeniedError(
            f"User {user.id} has no row-level access to one or both tables "
            f"({source_a_table}, {source_b_table})"
        )

    return scope_a, scope_b

async def execute_compare(
    compiled: CompiledQuery,
    loader: MetadataLoader,
    user: User,
    db: AsyncSession,
    max_rows: int = 10000,
    timeout_seconds: int = 30,
) -> list[dict]:
    """Execute parameterized query and return result rows.

    Safety measures:
    1. statement_timeout limit — SET LOCAL in transaction before SELECT
    2. max_rows result row limit
    3. Read-only guarantee: compiled SQL only contains SELECT
    """
    params = compiled.params or {}

    # Set statement_timeout within the transaction (P0 fix: split execution)
    await db.execute(text(f"SET LOCAL statement_timeout = '{timeout_seconds * 1000}'"))

    # Execute the SELECT separately
    result = await db.execute(text(compiled.sql), params)
    rows = result.fetchall()

    if len(rows) > max_rows:
        rows = rows[:max_rows]

    columns = list(result.keys())
    return [dict(zip(columns, row)) for row in rows]
```

### File: app/data_compare/engine.py
```python
"""CompareTemplateEngine — parameterized SQL template compiler.

Safety invariants:
  All identifiers (column/field/group_by/table_name) are remapped from
  table_columns whitelist metadata. Raw strings from LLM/user CompareSpec
  are NEVER interpolated directly — the validator confirms they exist, and
  the engine remaps them to canonical names as a second line of defense.

Three fixed templates:
  1. roster_engine  — roster consistency (FULL OUTER JOIN)
  2. field_engine   — field value consistency (INNER JOIN + WHERE conditions)
  3. amount_engine  — amount summary comparison (subquery GROUP BY + FULL OUTER JOIN)

Scope injection:
  Scope conditions are built externally (via build_scope_filter) and passed as
  pre-formatted SQL clauses. The engine appends them directly to WHERE 1=1,
  avoiding fragile post-compilation string replacement.
"""
from __future__ import annotations

from app.data_compare.metadata import MetadataLoader, TableMeta
from app.data_compare.schemas import (
    CompareSpec,
    CompareType,
    FieldCompareMode,
    PrefilterOp,
)

def _compile_prefilter_clause(
    prefilters: list,
    sql_alias: str,
    param_prefix: str,
    meta: TableMeta,
) -> tuple[str, dict]:
    """Compile prefilter list into WHERE clause + parameterized bind dict.

    Each op maps to a known-safe SQL fragment; values use parameterized binding.
    sql_alias  — alias used INSIDE the subquery SQL (e.g. "t_a", "v")
    param_prefix — prefix for parameter bind names (e.g. "t_a", "v_a")
                   separated from sql_alias to avoid collisions when the same
                   SQL alias is reused across independent subqueries (amount).
    """
    if not prefilters:
        return "", {}

    conditions: list[str] = []
    params: dict = {}

    for i, pf in enumerate(prefilters):
        col_meta = meta.columns.get(pf.column)
        if col_meta is None:
            continue
        # whitelist-mapped canonical name — never use pf.column raw
        safe_col = f'"{sql_alias}"."{col_meta.column_code}"'
        param_key = f"pf_{param_prefix}_{i}"

        op = pf.op
        if op == PrefilterOp.EQ:
            conditions.append(f"{safe_col} = :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.NE:
            conditions.append(f"{safe_col} != :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.IN:
            if isinstance(pf.value, list) and pf.value:
                placeholders = []
                for j, v in enumerate(pf.value):
                    pk = f"{param_key}_{j}"
                    placeholders.append(f":{pk}")
                    params[pk] = v
                conditions.append(f"{safe_col} IN ({', '.join(placeholders)})")
        elif op == PrefilterOp.NOT_IN:
            if isinstance(pf.value, list) and pf.value:
                placeholders = []
                for j, v in enumerate(pf.value):
                    pk = f"{param_key}_{j}"
                    placeholders.append(f":{pk}")
                    params[pk] = v
                conditions.append(f"{safe_col} NOT IN ({', '.join(placeholders)})")
        elif op == PrefilterOp.GT:
            conditions.append(f"{safe_col} > :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.GTE:
            conditions.append(f"{safe_col} >= :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.LT:
            conditions.append(f"{safe_col} < :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.LTE:
            conditions.append(f"{safe_col} <= :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.CONTAINS:
            conditions.append(f"{safe_col} LIKE :{param_key}")
            params[param_key] = f"%{pf.value}%"
        elif op == PrefilterOp.BETWEEN:
            if isinstance(pf.value, list) and len(pf.value) == 2:
                lo_key, hi_key = f"{param_key}_lo", f"{param_key}_hi"
                conditions.append(f"{safe_col} BETWEEN :{lo_key} AND :{hi_key}")
                params[lo_key] = pf.value[0]
                params[hi_key] = pf.value[1]
        elif op == PrefilterOp.IS_NULL:
            conditions.append(f"{safe_col} IS NULL")
        elif op == PrefilterOp.IS_NOT_NULL:
            conditions.append(f"{safe_col} IS NOT NULL")

    clause = " AND ".join(conditions) if conditions else ""
    return (f" AND {clause}" if clause else ""), params

def _format_scope_clause(scope_sql: str) -> str:
    """Format scope SQL into a WHERE-compatible clause.

    scope_sql may be:
      - "true"  → no restriction → ""
      - "false" → caller must reject before engine (raise 403)
      - any SQL → " AND (<sql>)"
    """
    s = scope_sql.strip()
    if not s or s.lower() == "true":
        return ""
    return f" AND ({s})"

class CompiledQuery:
    """Compiled parameterized SQL + params dict"""

    def __init__(self, sql: str, params: dict | None = None):
        self.sql = sql
        self.params = params or {}

async def compile_roster_query(
    spec: CompareSpec,
    loader: MetadataLoader,
    scope_clause_a: str = "true",
    scope_clause_b: str = "true",
) -> CompiledQuery:
    """Template 1 — roster consistency comparison (FULL OUTER JOIN).

    Unified WHERE 1=1 pattern for period + prefilter + scope inside each subquery.
    Supports composite join_keys (multi-column primary key).
    """
    meta_a = await loader.validate_table(spec.source_a.table)
    meta_b = await loader.validate_table(spec.source_b.table)

    tbl_a = meta_a.table_name
    tbl_b = meta_b.table_name

    # Build all join-key expressions (supports composite keys)
    join_on_conditions: list[str] = []
    coal_cols: list[str] = []
    inner_cols_a: list[str] = []
    inner_cols_b: list[str] = []
    for jk in spec.join_keys:
        col_code_a = meta_a.columns[jk].column_code
        col_code_b = meta_b.columns[jk].column_code
        safe_a = f'"t_a"."{col_code_a}"'
        safe_b = f'"t_b"."{col_code_b}"'
        join_on_conditions.append(f"{safe_a} = {safe_b}")
        coal_cols.append(f'COALESCE({safe_a}, {safe_b}) as "{jk}"')
        inner_cols_a.append(safe_a)
        inner_cols_b.append(safe_b)

    join_on = " AND ".join(join_on_conditions)
    inner_select_a = ", ".join(inner_cols_a)
    inner_select_b = ", ".join(inner_cols_b)

    # Use first join key for direction checks (FULL OUTER JOIN makes ALL
    # columns from the unmatched side NULL, so any key works).
    first_key_a = inner_cols_a[0]
    first_key_b = inner_cols_b[0]

    params: dict = {}

    # period filter
    period_clause_a = ""
    period_clause_b = ""
    if meta_a.is_period and spec.source_a.period:
        period_col = meta_a.period_col or "period_ym"
        period_clause_a = f' AND "t_a"."{period_col}" = :period_a'
        params["period_a"] = spec.source_a.period
    if meta_b.is_period and spec.source_b.period:
        period_col = meta_b.period_col or "period_ym"
        period_clause_b = f' AND "t_b"."{period_col}" = :period_b'
        params["period_b"] = spec.source_b.period

    # prefilter — inner alias "t_a"/"t_b"
    pf_clause_a, pf_params_a = _compile_prefilter_clause(spec.source_a.prefilter, "t_a", "t_a", meta_a)
    pf_clause_b, pf_params_b = _compile_prefilter_clause(spec.source_b.prefilter, "t_b", "t_b", meta_b)
    params.update(pf_params_a)
    params.update(pf_params_b)

    # scope — compiled at engine level, not post-hoc string replace
    scope_a = _format_scope_clause(scope_clause_a)
    scope_b = _format_scope_clause(scope_clause_b)

    direction = "both"
    if spec.roster:
        direction = spec.roster.direction

    where_clause = ""
    if direction == "both":
        where_clause = f"WHERE {first_key_a} IS NULL OR {first_key_b} IS NULL"
    elif direction == "only_in_a":
        where_clause = f"WHERE {first_key_b} IS NULL"
    elif direction == "only_in_b":
        where_clause = f"WHERE {first_key_a} IS NULL"

    sql = f"""
SELECT
    {', '.join(coal_cols)},
    CASE
        WHEN {first_key_a} IS NULL THEN '仅存在于{meta_b.table_label}'
        WHEN {first_key_b} IS NULL THEN '仅存在于{meta_a.table_label}'
    END as diff_type
FROM (
    SELECT DISTINCT {inner_select_a} FROM "{tbl_a}" t_a WHERE 1=1{period_clause_a}{pf_clause_a}{scope_a}
) t_a
FULL OUTER JOIN (
    SELECT DISTINCT {inner_select_b} FROM "{tbl_b}" t_b WHERE 1=1{period_clause_b}{pf_clause_b}{scope_b}
) t_b ON {join_on}
{where_clause}
"""
    return CompiledQuery(sql.strip(), params)

async def compile_field_query(
    spec: CompareSpec,
    loader: MetadataLoader,
    scope_clause_a: str = "true",
    scope_clause_b: str = "true",
) -> CompiledQuery:
    """Template 2 — field value consistency (INNER JOIN + WHERE conditions).

    Unified WHERE 1=1 pattern for period + prefilter + scope inside each subquery.
    Supports composite join_keys (multi-column primary key).
    """
    meta_a = await loader.validate_table(spec.source_a.table)
    meta_b = await loader.validate_table(spec.source_b.table)

    tbl_a = meta_a.table_name
    tbl_b = meta_b.table_name

    # Build all join-key expressions (supports composite keys)
    join_on_conditions: list[str] = []
    select_cols: list[str] = []
    for jk in spec.join_keys:
        col_code_a = meta_a.columns[jk].column_code
        col_code_b = meta_b.columns[jk].column_code
        safe_a = f'"t_a"."{col_code_a}"'
        safe_b = f'"t_b"."{col_code_b}"'
        join_on_conditions.append(f"{safe_a} = {safe_b}")
        select_cols.append(f'{safe_a} as "{jk}"')

    join_on = " AND ".join(join_on_conditions)

    compare_conditions: list[str] = []
    params: dict = {}

    if spec.field:
        for i, pair in enumerate(spec.field.pairs):
            col_a = meta_a.columns[pair.field_a]
            col_b = meta_b.columns[pair.field_b]
            safe_a = f'"t_a"."{col_a.column_code}"'
            safe_b = f'"t_b"."{col_b.column_code}"'

            select_cols.append(f"{safe_a} as {pair.field_a}_a")
            select_cols.append(f"{safe_b} as {pair.field_b}_b")

            if pair.mode == FieldCompareMode.EXACT:
                compare_conditions.append(
                    f"({safe_a} IS NULL AND {safe_b} IS NOT NULL) OR "
                    f"({safe_a} IS NOT NULL AND {safe_b} IS NULL) OR "
                    f"({safe_a} != {safe_b})"
                )
            elif pair.mode == FieldCompareMode.TRIM:
                compare_conditions.append(
                    f"TRIM(LOWER(COALESCE({safe_a}::text,''))) != "
                    f"TRIM(LOWER(COALESCE({safe_b}::text,'')))"
                )
            elif pair.mode == FieldCompareMode.NUMERIC:
                tol = pair.tolerance or 0.0
                tol_key = f"field_tol_{i}"
                params[tol_key] = tol
                compare_conditions.append(
                    f"ABS(COALESCE({safe_a}::numeric, 0) - "
                    f"COALESCE({safe_b}::numeric, 0)) > :{tol_key}"
                )

    # period filter
    period_clause_a, period_clause_b = "", ""
    if meta_a.is_period and spec.source_a.period:
        period_col = meta_a.period_col or "period_ym"
        period_clause_a = f' AND "t_a"."{period_col}" = :period_a'
        params["period_a"] = spec.source_a.period
    if meta_b.is_period and spec.source_b.period:
        period_col = meta_b.period_col or "period_ym"
        period_clause_b = f' AND "t_b"."{period_col}" = :period_b'
        params["period_b"] = spec.source_b.period

    # prefilter — inner alias "t_a"/"t_b"
    pf_clause_a, pf_params_a = _compile_prefilter_clause(spec.source_a.prefilter, "t_a", "t_a", meta_a)
    pf_clause_b, pf_params_b = _compile_prefilter_clause(spec.source_b.prefilter, "t_b", "t_b", meta_b)
    params.update(pf_params_a)
    params.update(pf_params_b)

    # scope — compiled at engine level
    scope_a = _format_scope_clause(scope_clause_a)
    scope_b = _format_scope_clause(scope_clause_b)

    sql = f"""
SELECT {', '.join(select_cols)}
FROM (
    SELECT * FROM "{tbl_a}" t_a WHERE 1=1{period_clause_a}{pf_clause_a}{scope_a}
) t_a
INNER JOIN (
    SELECT * FROM "{tbl_b}" t_b WHERE 1=1{period_clause_b}{pf_clause_b}{scope_b}
) t_b ON {join_on}
WHERE {' OR '.join(compare_conditions)}
"""
    return CompiledQuery(sql.strip(), params)

async def compile_amount_query(
    spec: CompareSpec,
    loader: MetadataLoader,
    scope_clause_a: str = "true",
    scope_clause_b: str = "true",
) -> CompiledQuery:
    """Template 3 — amount summary comparison (subquery GROUP BY + FULL OUTER JOIN).

    Already uses WHERE 1=1 pattern. Scope is appended after prefilter.
    """
    meta_a = await loader.validate_table(spec.source_a.table)
    meta_b = await loader.validate_table(spec.source_b.table)

    tbl_a = meta_a.table_name
    tbl_b = meta_b.table_name

    amount_spec = spec.amount
    if amount_spec is None:
        raise ValueError("amount_spec is empty")

    # Group by columns — whitelist-mapped canonical names
    group_cols_a: list[str] = []
    group_cols_b: list[str] = []
    for g in amount_spec.group_by:
        col_a = meta_a.columns.get(g)
        col_b = meta_b.columns.get(g)
        code_a = col_a.column_code if col_a else g
        code_b = col_b.column_code if col_b else g
        group_cols_a.append(f'"{code_a}"')
        group_cols_b.append(f'"{code_b}"')

    # COALESCE columns for outer SELECT — use canonical names
    coal_cols: list[str] = []
    for g in amount_spec.group_by:
        col_a_code = meta_a.columns[g].column_code if meta_a.has_column(g) else g
        col_b_code = meta_b.columns[g].column_code if meta_b.has_column(g) else g
        coal_cols.append(f'COALESCE(a."{col_a_code}", b."{col_b_code}") as "{col_a_code}"')

    # ON clause — use canonical names from metadata
    on_conditions: list[str] = []
    for g in amount_spec.group_by:
        code_a = meta_a.columns[g].column_code if meta_a.has_column(g) else g
        code_b = meta_b.columns[g].column_code if meta_b.has_column(g) else g
        on_conditions.append(f'a."{code_a}" = b."{code_b}"')

    # Aggregate fields — whitelist-mapped canonical names
    safe_field_a = f'"{meta_a.columns[amount_spec.metric_a.field].column_code}"'
    safe_field_b = f'"{meta_b.columns[amount_spec.metric_b.field].column_code}"'

    # Use each metric's own aggregation function
    agg_func_a = amount_spec.metric_a.agg.value.upper()
    agg_func_b = amount_spec.metric_b.agg.value.upper()
    agg_a = f"{agg_func_a}({safe_field_a})"
    agg_b = f"{agg_func_b}({safe_field_b})"

    params: dict = {}

    # Period filter
    period_clause_a = ""
    period_clause_b = ""
    if meta_a.is_period and spec.source_a.period:
        period_col = meta_a.period_col or "period_ym"
        period_clause_a = f' AND "v"."{period_col}" = :period_a'
        params["period_a"] = spec.source_a.period
    if meta_b.is_period and spec.source_b.period:
        period_col = meta_b.period_col or "period_ym"
        period_clause_b = f' AND "v"."{period_col}" = :period_b'
        params["period_b"] = spec.source_b.period

    # Prefilter — inner alias "v" for SQL, "v_a"/"v_b" for param prefix (avoid collision)
    pf_clause_a, pf_params_a = _compile_prefilter_clause(spec.source_a.prefilter, "v", "v_a", meta_a)
    pf_clause_b, pf_params_b = _compile_prefilter_clause(spec.source_b.prefilter, "v", "v_b", meta_b)
    params.update(pf_params_a)
    params.update(pf_params_b)

    # Scope — compiled at engine level
    scope_a = _format_scope_clause(scope_clause_a)
    scope_b = _format_scope_clause(scope_clause_b)

    # Tolerance
    tol = amount_spec.tolerance.value
    tol_type = amount_spec.tolerance.type.value
    if tol_type == "absolute":
        tol_cond = f"ABS(COALESCE(a.total_a, 0) - COALESCE(b.total_b, 0)) > :tolerance"
    else:
        tol_cond = (
            f"CASE WHEN COALESCE(b.total_b, 0) != 0 THEN "
            f"ABS(COALESCE(a.total_a, 0) - COALESCE(b.total_b, 0)) / ABS(b.total_b) > :tolerance "
            f"ELSE COALESCE(a.total_a, 0) != 0 END"
        )
    params["tolerance"] = tol

    group_cols_inner_a = ", ".join(group_cols_a) if group_cols_a else "1"
    group_cols_inner_b = ", ".join(group_cols_b) if group_cols_b else "1"

    # When only_diff=true, add status WHERE filter to return only diff rows
    only_diff = spec.output.only_diff if spec.output else True
    status_where = f"WHERE status != '一致'" if only_diff else ""

    sql = f"""
SELECT *
FROM (
    SELECT
        {', '.join(coal_cols)},
        a.total_a as amount_a,
        b.total_b as amount_b,
        ABS(COALESCE(a.total_a, 0) - COALESCE(b.total_b, 0)) as diff,
        CASE
            WHEN a.total_a IS NULL THEN '仅{meta_b.table_label}有'
            WHEN b.total_b IS NULL THEN '仅{meta_a.table_label}有'
            WHEN {tol_cond} THEN '金额不一致'
            ELSE '一致'
        END as status
    FROM (
        SELECT {group_cols_inner_a}, {agg_a} as total_a
        FROM "{tbl_a}" v
        WHERE 1=1{period_clause_a}{pf_clause_a}{scope_a}
        GROUP BY {group_cols_inner_a}
    ) a
    FULL OUTER JOIN (
        SELECT {group_cols_inner_b}, {agg_b} as total_b
        FROM "{tbl_b}" v
        WHERE 1=1{period_clause_b}{pf_clause_b}{scope_b}
        GROUP BY {group_cols_inner_b}
    ) b ON {' AND '.join(on_conditions)}
) _sub
{status_where}
"""
    return CompiledQuery(sql.strip(), params)

async def compile_query(
    spec: CompareSpec,
    loader: MetadataLoader,
    scope_clause_a: str = "true",
    scope_clause_b: str = "true",
) -> CompiledQuery:
    """Select the appropriate template based on compare_type.

    scope_clause_a / scope_clause_b are pre-built SQL conditions from
    build_scope_filter (e.g. "org_id IN (1,2,3)"). The engine appends
    them directly to WHERE 1=1, avoiding post-compilation string replacement.
    """
    if spec.compare_type == CompareType.ROSTER:
        return await compile_roster_query(spec, loader, scope_clause_a, scope_clause_b)
    elif spec.compare_type == CompareType.FIELD:
        return await compile_field_query(spec, loader, scope_clause_a, scope_clause_b)
    elif spec.compare_type == CompareType.AMOUNT:
        return await compile_amount_query(spec, loader, scope_clause_a, scope_clause_b)
    else:
        raise ValueError(f"Unsupported compare type: {spec.compare_type}")
```

### File: app/data_compare/chat_handler.py
````python
"""data_compare ChatRoute — LLM extractor + handler。

extractor: LLM 解析用户自然语言 → CompareSpec JSON（不生成 SQL）
handler: CompareSpec → Scope → MetadataLoader → SchemaValidator → TemplateEngine → Executor → Formatter
"""
from __future__ import annotations

import json
import time

from pydantic import ValidationError as PydanticValidationError

from app.data_compare.engine import compile_query
from app.data_compare.executor import execute_compare, build_scope_for_compare, ScopeDeniedError
from app.data_compare.formatter import format_result
from app.data_compare.metadata import MetadataLoader
from app.data_compare.schemas import CompareSpec, CompareType
from app.data_compare.normalizer import normalize_compare_spec, normalize_compare_spec_data
from app.data_compare.validator import validate_compare_spec, SchemaValidationError


async def extract_compare_spec(
    user_message: str,
    loader: MetadataLoader,
    model_call: callable,  # async fn(prompt: str) -> str
) -> CompareSpec:
    """调用 LLM 从自然语言提取 CompareSpec JSON。

    Args:
        user_message: 用户原始自然语言描述
        loader: 已加载表结构的 MetadataLoader
        model_call: LLM 调用函数，接受 prompt 字符串，返回模型响应字符串

    Returns:
        校验通过的 CompareSpec
    """
    # 构建表结构清单
    tables = await loader.list_tables()
    table_desc_lines: list[str] = []
    for t in tables:
        cols = ", ".join(
            f"{c.column_code}({c.data_type}{'[PK]' if c.is_pk_part else ''})"
            for c in t.columns.values()
        )
        period_note = f" [月度表,期间字段:{t.period_col}]" if t.is_period else ""
        table_desc_lines.append(f"  - {t.table_name} ({t.table_label}){period_note}: {cols}")

    table_desc = "\n".join(table_desc_lines)

    prompt = f"""你是一个数据对比配置专家。根据用户的自然语言描述，提取结构化对比参数。

## 可用表及字段
{table_desc}

## 输出要求
你必须输出一个 JSON 对象，结构如下：

{{
  "compare_type": "roster" | "field" | "amount",
  "source_a": {{
    "table": "表名（必须在上面的可用表中）",
    "period": "YYYYMM 或 null",
    "prefilter": [{{"column": "字段名", "op": "eq|ne|in|not_in|gt|gte|lt|lte|contains|between|is_null|is_not_null", "value": ...}}]
  }},
  "source_b": {{ "table": "...", "period": "...", "prefilter": [...] }},
  "join_keys": ["关联键字段名"],
  "output": {{ "only_diff": true, "max_detail": 200 }},
  "roster": null | {{ "direction": "both|only_in_a|only_in_b", "display_fields": ["..." ] }},
  "field": null | {{ "pairs": [{{"field_a": "...", "field_b": "...", "mode": "exact|trim|numeric", "tolerance": null}}] }},
  "amount": null | {{ "metric_a": {{"agg": "sum|count|avg", "field": "..."}}, "metric_b": {{...}}, "group_by": ["..."], "tolerance": {{"type": "absolute|percent", "value": 0.0}} }}
}}

## 规则
- compare_type: "roster"=名单差异, "field"=字段值不一致, "amount"=金额不一致
- 只输出 JSON，不要 markdown 代码块，不要解释
- 所有表名必须来自上面的可用表列表
- 所有字段名必须来自对应表的字段列表
- 月度表必须输出 period
- 字段对比（field）必须输出 field.pairs
- 金额对比（amount）必须输出 amount.group_by + amount.metric_a/b
- 不知道的值填 null

用户需求：
{user_message}
"""
    response_text = await model_call(prompt)

    # 清理可能的 markdown 包裹
    response_text = response_text.strip()
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        response_text = "\n".join(lines).strip()

    try:
        data = json.loads(response_text)
    except json.JSONDecodeError as e:
        raise ValueError(f"LLM 输出不是合法 JSON: {e}\n原始输出: {response_text[:500]}")

    try:
        normalized = await normalize_compare_spec_data(data, loader, instruction=user_message)
        spec = CompareSpec.model_validate(normalized)
    except PydanticValidationError as e:
        raise ValueError(f"CompareSpec structure validation failed: {e}")

    return spec



async def run_data_compare(
    spec: CompareSpec | dict,
    user,
    db,
    model_call: callable | None = None,
    instruction: str | None = None,
) -> dict:
    """完整的对比执行流程：Scope → 校验 → 编译 → 执行 → 格式化。

    如果 spec 已经是 CompareSpec 对象（来自 LLM extractor），直接执行。
    如果 spec 是 dict（来自管理页面直接执行），先 validate。

    Scope injection happens BEFORE template compilation so the engine
    can embed scope conditions directly into WHERE 1=1 — no fragile
    post-compilation string replacement.
    """
    start = time.time()

    # 1. 加载表结构元数据
    loader = MetadataLoader(db)

    # 2. Deterministic normalization + schema validation. This protects both
    # LLM-generated specs and stored/manual specs from common natural-language
    # parsing drift, e.g. period in join_keys or YYYY.MM periods.
    spec = await normalize_compare_spec(spec, loader, instruction=instruction)
    await validate_compare_spec(spec, loader)

    # 3. 构建行级权限 scope（P0 fix: scope built BEFORE compilation）
    # Alias matches the engine's subquery aliases: t_a/t_b for roster/field, v for amount
    if spec.compare_type.value == "amount":
        alias_a, alias_b = "v", "v"
    else:
        alias_a, alias_b = "t_a", "t_b"
    scope_a, scope_b = await build_scope_for_compare(
        user, spec.source_a.table, spec.source_b.table, loader, db,
        alias_a=alias_a, alias_b=alias_b,
    )

    # 4. 模板编译 → 参数化 SQL（scope 在引擎编译层面注入）
    compiled = await compile_query(spec, loader, scope_a, scope_b)

    # 5. 执行查询
    rows = await execute_compare(compiled, loader, user, db)

    # 6. 格式化结果
    meta_a = await loader.get_table(spec.source_a.table)
    meta_b = await loader.get_table(spec.source_b.table)

    # Build output-column-level sensitive set.
    # The engine renames columns in the output (e.g. field_a → salary_a),
    # so we must map original sensitive columns to their output aliases.
    sensitive_columns: set[str] = set()

    if spec.compare_type == CompareType.FIELD and spec.field:
        for pair in spec.field.pairs:
            if meta_a and pair.field_a in meta_a.columns:
                if meta_a.columns[pair.field_a].is_sensitive:
                    sensitive_columns.add(f"{pair.field_a}_a")
            if meta_b and pair.field_b in meta_b.columns:
                if meta_b.columns[pair.field_b].is_sensitive:
                    sensitive_columns.add(f"{pair.field_b}_b")

    if spec.compare_type == CompareType.AMOUNT and spec.amount:
        if meta_a and spec.amount.metric_a.field in meta_a.columns:
            if meta_a.columns[spec.amount.metric_a.field].is_sensitive:
                sensitive_columns.add("amount_a")
        if meta_b and spec.amount.metric_b.field in meta_b.columns:
            if meta_b.columns[spec.amount.metric_b.field].is_sensitive:
                sensitive_columns.add("amount_b")
        # group_by columns also appear as output columns
        for g in spec.amount.group_by:
            if meta_a and g in meta_a.columns and meta_a.columns[g].is_sensitive:
                sensitive_columns.add(g)
            elif meta_b and g in meta_b.columns and meta_b.columns[g].is_sensitive:
                sensitive_columns.add(g)

    if spec.compare_type == CompareType.ROSTER:
        # Roster output columns are named after each join_key (see engine.py:
        #   SELECT COALESCE(t_a."..." as "jk", ...).
        # For composite keys, EVERY sensitive join key must be added by its
        # output column name (i.e. jk itself), NOT hardcoded "employee_no".
        for jk in spec.join_keys:
            is_sensitive = False
            if meta_a and jk in meta_a.columns:
                is_sensitive = meta_a.columns[jk].is_sensitive
            if not is_sensitive and meta_b and jk in meta_b.columns:
                is_sensitive = meta_b.columns[jk].is_sensitive
            if is_sensitive:
                sensitive_columns.add(jk)  # output column name = join key code

    result = format_result(
        rows=rows,
        compare_type=spec.compare_type,
        table_a_label=meta_a.table_label if meta_a else spec.source_a.table,
        table_b_label=meta_b.table_label if meta_b else spec.source_b.table,
        period_a=spec.source_a.period,
        period_b=spec.source_b.period,
        max_detail=spec.output.max_detail if spec.output else 200,
        duration_ms=int((time.time() - start) * 1000),
        sensitive_columns=sensitive_columns or None,
    )

    return result.model_dump()
````

### File: app/permissions/scope_filter.py
```python
"""数据范围权限合并引擎（KD-1，新版语义）

每个标签 = 「管理组织范围」+「管理人员范围」
- 单标签内：org_part AND person_part（部分启用就只参与启用的部分）
- 多标签间：OR

最终：tag1_clause OR tag2_clause OR ... → 跟其他系统约束 AND

集成点：
- /data/{table} 列表查询入口
- /reports/{id}/run 报表执行入口
- /reports/{id}/export.csv 导出入口

边界（spec 边界用例）：
- 用户没任何标签 → false（看不到任何行）
- 标签 org_scope_unlimited=True 且 person_scope 未启用 → 该标签贡献 true
- 节点已被树删除 → 该 selection 自动失效
"""
from __future__ import annotations

from sqlalchemy import String, and_, false, inspect, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.sql import ColumnElement, cast

from app.data.models import CostCenterNode, DATA_TABLES, OrgNode, TableColumn
from app.scopes.models import (
    ScopeTag,
    ScopeTagFilter,
    ScopeTagSelection,
    UserScopeTag,
)
from app.users.models import User
from app.permissions.strategy import (
    DEFAULT_SCOPE_STRATEGY,
    SCOPE_STRATEGY_CC_FIRST,
    SCOPE_STRATEGY_CROSS_FILTER,
    SCOPE_STRATEGY_PERSON_FIRST,
    normalize_scope_strategy,
    strategy_scope_roles,
)

# ===== 工具：取标签关联数据 =====

async def _get_user_tags(
    user_id: int, db: AsyncSession
) -> list[tuple[ScopeTag, list[ScopeTagSelection], list[ScopeTagFilter]]]:
    tag_rows = (
        await db.execute(
            select(ScopeTag)
            .join(UserScopeTag, UserScopeTag.tag_id == ScopeTag.id)
            .where(UserScopeTag.user_id == user_id)
        )
    ).scalars().all()

    out: list[tuple[ScopeTag, list[ScopeTagSelection], list[ScopeTagFilter]]] = []
    for tag in tag_rows:
        sels = (
            (
                await db.execute(
                    select(ScopeTagSelection).where(
                        ScopeTagSelection.tag_id == tag.id,
                        ScopeTagSelection.node_id.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        filters = (
            (
                await db.execute(
                    select(ScopeTagFilter)
                    .where(ScopeTagFilter.tag_id == tag.id)
                    .order_by(ScopeTagFilter.order_index, ScopeTagFilter.id)
                )
            )
            .scalars()
            .all()
        )
        out.append((tag, sels, filters))
    return out

async def _get_role_columns(table: str, db: AsyncSession) -> dict[str, str]:
    """取该表所有 scope_role 不为空的字段 → {role: column_code}"""
    rows = (
        (
            await db.execute(
                select(TableColumn).where(
                    TableColumn.table_name == table,
                    TableColumn.scope_role.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    return {r.scope_role: r.column_code for r in rows}

def _table_name(model) -> str:
    return getattr(model, "__tablename__", getattr(model.__table__, "name", "unknown"))

def _entity_text(model, col_code: str) -> ColumnElement:
    """实体列文本表达式，用于保持权限筛选按字符串值匹配的原语义。"""
    table_name = _table_name(model)
    if "raw" in model.__table__.columns:
        raise RuntimeError(
            f"业务表 {table_name} 不是实体列结构，请先重建为实体列业务表"
        )
    if col_code not in model.__table__.columns:
        raise RuntimeError(f"业务表 {table_name} 缺少权限实体列: {col_code}")
    return cast(inspect(model).selectable.c[col_code], String)

async def _is_super_admin(user: User, db: AsyncSession) -> bool:
    from app.users.models import Role, UserRole

    rows = (
        await db.execute(
            select(Role.name)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id, Role.is_active.is_(True))
        )
    ).all()
    return any(r[0] == "超级管理员" for r in rows)

# ===== 单标签子句构造 =====

async def _build_org_clause(
    tag: ScopeTag,
    sels: list[ScopeTagSelection],
    Model,
    role_cols: dict[str, str],
    db: AsyncSession,
) -> ColumnElement | None:
    """组织范围子句

    返回值：
    - true()：org_scope_unlimited=True，本标签组织范围放行
    - 具体 ColumnElement：节点 IN 查询
    - false()：启用了组织范围但勾的节点对此表不命中
    - None：本表没有该维度的字段（不参与约束）
    """
    if not tag.org_scope_enabled:
        return None
    if tag.org_scope_unlimited:
        return true()

    if tag.dimension == "cost_center":
        col_key = "cc_code"
        NodeModel = CostCenterNode
    elif tag.dimension == "org":
        col_key = "org_node_code"
        NodeModel = OrgNode
    else:
        return None

    if col_key not in role_cols:
        return None

    codes: set[str] = set()
    for s in sels:
        if s.node_id is None:
            continue
        node = await db.get(NodeModel, s.node_id)
        if node is None:
            continue
        if s.include_descendants and node.path:
            descendants = (
                await db.execute(
                    select(NodeModel.code).where(NodeModel.path.like(f"{node.path}%"))
                )
            ).all()
            codes.update(r[0] for r in descendants)
        else:
            codes.add(node.code)

    if not codes:
        return false()
    return _entity_text(Model, role_cols[col_key]).in_(codes)

def _build_filter_clause(
    f: ScopeTagFilter, Model, role_cols: dict[str, str]
) -> ColumnElement | None:
    """单个 filter 子句"""
    col_code = role_cols.get(f.field_code)
    if not col_code:
        # 表没有对应字段 → 该筛选条件对此表不生效（不参与约束）
        return None
    vals = [v for v in (f.values or []) if v]
    if not vals:
        return false()
    expr = _entity_text(Model, col_code).in_(vals)
    return expr if f.operator == "eq" else ~expr

async def _build_person_clause(
    tag: ScopeTag,
    filters: list[ScopeTagFilter],
    Model,
    role_cols: dict[str, str],
) -> ColumnElement | None:
    """人员范围子句：多个 filter AND"""
    if not tag.person_scope_enabled:
        return None
    if not filters:
        # 启用了但没条件（数据异常）→ 视为 false
        return false()

    parts: list[ColumnElement] = []
    for f in filters:
        c = _build_filter_clause(f, Model, role_cols)
        if c is None:
            # 该字段对此表不存在：不参与约束
            continue
        parts.append(c)

    if not parts:
        # 全部 filter 对此表都不命中字段 → 该标签的人员范围对此表无约束
        return None
    return and_(*parts)

async def _build_tag_clause(
    tag: ScopeTag,
    sels: list[ScopeTagSelection],
    filters: list[ScopeTagFilter],
    Model,
    role_cols: dict[str, str],
    db: AsyncSession,
) -> ColumnElement:
    """单个标签在给定 Model/role_cols 下的子句（org_part AND person_part）。

    解析不到任何约束列 → false()（fail-closed，不授予可见性）。
    """
    org_part = await _build_org_clause(tag, sels, Model, role_cols, db)
    person_part = await _build_person_clause(tag, filters, Model, role_cols)
    parts = [p for p in (org_part, person_part) if p is not None]
    if not parts:
        return false()
    return and_(*parts)

def _filter_tags_by_strategy(
    tags: list[tuple[ScopeTag, list[ScopeTagSelection], list[ScopeTagFilter]]],
    strategy: str | None,
) -> list[tuple[ScopeTag, list[ScopeTagSelection], list[ScopeTagFilter]]]:
    """按场景策略激活标签；cross_filter 保持旧行为（全部标签 OR）。"""
    strategy = normalize_scope_strategy(strategy)
    if strategy == SCOPE_STRATEGY_PERSON_FIRST:
        return [row for row in tags if row[0].dimension == "org"]
    if strategy == SCOPE_STRATEGY_CC_FIRST:
        return [row for row in tags if row[0].dimension == "cost_center"]
    return tags

ROSTER_TABLE = "emp_realtime_roster"
ROSTER_EMP_COL = "employee_no"

async def _get_roster_join_col(table: str, db: AsyncSession) -> str | None:
    """该表声明的「关联花名册 employee_no 的列名」（G3 穿透），未声明返回 None。"""
    from app.data.models import RegisteredTable

    row = (
        await db.execute(
            select(RegisteredTable.roster_join_col).where(
                RegisteredTable.table_name == table
            )
        )
    ).first()
    return row[0] if row and row[0] else None

def _has_strategy_roles(role_cols: dict[str, str], strategy: str | None) -> bool:
    return bool(set(role_cols) & strategy_scope_roles(strategy))

async def can_resolve_scope_strategy(
    table: str, strategy: str | None, db: AsyncSession
) -> bool:
    """当前表或其花名册穿透域能否解析该策略的核心维度。"""
    if table not in DATA_TABLES:
        return False
    strategy = normalize_scope_strategy(strategy)
    if strategy == SCOPE_STRATEGY_CROSS_FILTER:
        return True

    role_cols = await _get_role_columns(table, db)
    if _has_strategy_roles(role_cols, strategy):
        return True

    roster_join_col = await _get_roster_join_col(table, db)
    if not roster_join_col or ROSTER_TABLE not in DATA_TABLES:
        return False
    Model = DATA_TABLES[table]
    if roster_join_col not in Model.__table__.columns:
        return False
    roster_cols = await _get_role_columns(ROSTER_TABLE, db)
    return _has_strategy_roles(roster_cols, strategy)

async def _build_tag_clause_with_passthrough(
    tag: ScopeTag,
    sels: list[ScopeTagSelection],
    filters: list[ScopeTagFilter],
    Model,
    role_cols: dict[str, str],
    db: AsyncSession,
    *,
    roster_join_col: str | None,
    roster_role_cols: dict[str, str] | None,
) -> ColumnElement:
    """先用本表能解析的维度；缺的维度通过花名册子查询补齐。"""
    direct_parts: list[ColumnElement] = []
    roster_parts: list[ColumnElement] = []
    # Explicitly alias roster model in subquery to avoid anonymous aliases
    # in compiled SQL (e.g. "scope_roster"."employee_no" instead of auto-generated).
    raw_roster_model = DATA_TABLES.get(ROSTER_TABLE)
    if raw_roster_model is None:
        return false()
    roster_model = aliased(raw_roster_model, name="scope_roster")

    org_part = await _build_org_clause(tag, sels, Model, role_cols, db)
    if org_part is not None:
        direct_parts.append(org_part)
    elif roster_join_col and roster_model is not None and roster_role_cols is not None:
        roster_org = await _build_org_clause(tag, sels, roster_model, roster_role_cols, db)
        if roster_org is not None:
            roster_parts.append(roster_org)

    person_part = await _build_person_clause(tag, filters, Model, role_cols)
    if person_part is not None:
        direct_parts.append(person_part)
    elif roster_join_col and roster_model is not None and roster_role_cols is not None:
        roster_person = await _build_person_clause(tag, filters, roster_model, roster_role_cols)
        if roster_person is not None:
            roster_parts.append(roster_person)

    if roster_parts:
        subq = select(_entity_text(roster_model, ROSTER_EMP_COL)).where(and_(*roster_parts))
        direct_parts.append(_entity_text(Model, roster_join_col).in_(subq))

    if not direct_parts:
        return false()
    return and_(*direct_parts)

# ===== 主入口 =====

async def _build_scope_filter_for_model(
    user: User,
    table: str,
    Model,
    db: AsyncSession,
    strategy: str | None = DEFAULT_SCOPE_STRATEGY,
    table_alias: str | None = None,
) -> ColumnElement:
    """返回拼到查询的 where 表达式

    true()  → 无约束（全表可见）
    false() → 无权限（空集）

    fail-closed 语义（KD-1 安全修复 + 005 收口）：
    - 超管 → 放行
    - 本表无 scope_role 字段且无 roster_join_col → 拒绝（false），杜绝裸奔
    - 用户无标签 → 拒绝
    - 标签维度在解析域（本表或花名册）都不命中约束列 → 该标签贡献 false（不放行）

    G3 穿透：本表无自有 scope_role 列、但声明了 roster_join_col 时，
    人员/组织维度经实时花名册子查询解析：
        本表.<join_col> IN (SELECT 花名册.employee_no FROM 花名册 WHERE <标签子句>)

    table_alias: 当传入时，使用 SQLAlchemy aliased() 生成带别名的列表达式。
    编译后的 SQL 中列引用会带上别名前缀（如 "t_a"."col"），避免在 data_compare
    engine 的 aliased subquery 中出现 "invalid reference to FROM-clause entry"。
    """
    strategy = normalize_scope_strategy(strategy)

    if await _is_super_admin(user, db):
        return true()

    # When called from data_compare with a table alias, use aliased() so that
    # _entity_text() generates alias-prefixed column references (e.g.
    # "t_a"."cost_center_code" instead of bare table.cost_center_code).
    # This avoids fragile regex post-processing in executor.py.
    EffectiveModel = Model
    if table_alias:
        EffectiveModel = aliased(Model, name=table_alias)

    role_cols = await _get_role_columns(table, db)
    roster_join_col = None
    if not role_cols or strategy in {SCOPE_STRATEGY_PERSON_FIRST, SCOPE_STRATEGY_CC_FIRST}:
        roster_join_col = await _get_roster_join_col(table, db)
    if not role_cols and not roster_join_col:
        # 受控表既无 scope_role 字段、也无穿透声明 → fail-closed 拒绝
        return false()

    tags = await _get_user_tags(user.id, db)
    tags = _filter_tags_by_strategy(tags, strategy)
    if not tags:
        # 用户没绑标签 → 看不到任何行
        return false()

    roster_role_cols: dict[str, str] | None = None
    if roster_join_col:
        if roster_join_col not in Model.__table__.columns or ROSTER_TABLE not in DATA_TABLES:
            return false()
        roster_role_cols = await _get_role_columns(ROSTER_TABLE, db)

    tag_clauses: list[ColumnElement] = []
    for tag, sels, filters in tags:
        tag_clauses.append(
            await _build_tag_clause_with_passthrough(
                tag,
                sels,
                filters,
                EffectiveModel,
                role_cols,
                db,
                roster_join_col=roster_join_col,
                roster_role_cols=roster_role_cols,
            )
        )

    if not tag_clauses:
        return false()
    if any(c is true() for c in tag_clauses):
        # 某标签无限制（org_scope_unlimited）→ 看全部（穿透表也含花名册之外的历史行）
        return true()

    return or_(*tag_clauses)

async def build_scope_filter(
    user: User,
    table: str,
    db: AsyncSession,
    strategy: str | None = DEFAULT_SCOPE_STRATEGY,
    table_alias: str | None = None,
) -> ColumnElement:
    """返回拼到查询的 where 表达式。

    table_alias: 指定表别名（如 "t_a"、"v"），编译后列引用会带别名前缀。
    用于 data_compare engine 的 aliased subquery 场景。不传则保留默认行为。
    """
    if table not in DATA_TABLES:
        return false()
    return await _build_scope_filter_for_model(
        user,
        table,
        DATA_TABLES[table],
        db,
        strategy=strategy,
        table_alias=table_alias,
    )

def is_unrestricted(filter_clause) -> bool:
    return filter_clause is true() or filter_clause is None
```

### File: alembic/versions/0054_data_compare_tasks.py
```python
"""Phase 2: data_compare_tasks + data_compare_runs

Revision ID: 0054_data_compare_tasks
Revises: 0053_add_data_compare_remove_feishu_config_menu
Create Date: 2026-06-28
"""
import sqlalchemy as sa
from alembic import op

revision = "0054_data_compare_tasks"
down_revision = "0053_add_data_compare_remove_feishu_config_menu"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "data_compare_tasks",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("skill_id", sa.BigInteger(), sa.ForeignKey("ai_skills.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("compare_type", sa.String(32), nullable=False),
        sa.Column("table_a", sa.String(64), nullable=False),
        sa.Column("table_b", sa.String(64), nullable=False),
        sa.Column("join_keys", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("cron_expression", sa.String(64), nullable=True),
        sa.Column("scheduled_job_id", sa.BigInteger(), nullable=True),
        sa.Column("automation_rule_id", sa.BigInteger(), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(16), nullable=True),
        sa.Column("last_diff_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_summary", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_dc_tasks_enabled", "data_compare_tasks", ["enabled"])
    op.create_index("ix_dc_tasks_created_by", "data_compare_tasks", ["created_by"])
    op.create_index("ix_dc_tasks_skill", "data_compare_tasks", ["skill_id"])

    op.create_table(
        "data_compare_runs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("data_compare_tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("trigger_type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("diff_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("execution_sql", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.BigInteger(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_dc_runs_task", "data_compare_runs", ["task_id"])
    op.create_index("ix_dc_runs_status", "data_compare_runs", ["status"])
    op.create_index("ix_dc_runs_started", "data_compare_runs", ["started_at"])

def downgrade() -> None:
    op.drop_index("ix_dc_runs_started", table_name="data_compare_runs")
    op.drop_index("ix_dc_runs_status", table_name="data_compare_runs")
    op.drop_index("ix_dc_runs_task", table_name="data_compare_runs")
    op.drop_table("data_compare_runs")
    op.drop_index("ix_dc_tasks_skill", table_name="data_compare_tasks")
    op.drop_index("ix_dc_tasks_created_by", table_name="data_compare_tasks")
    op.drop_index("ix_dc_tasks_enabled", table_name="data_compare_tasks")
    op.drop_table("data_compare_tasks")
```
