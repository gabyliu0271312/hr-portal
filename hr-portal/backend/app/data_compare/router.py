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
