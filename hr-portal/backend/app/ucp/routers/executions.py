"""UCP 执行历史 / 手动触发 / 失败项 路由"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
from app.ucp.models import (
    UcpExecutionLog,
    UcpLoopItemExecution,
    UcpPipelineExecution,
    UcpPipelineStepExecution,
)
from app.ucp.pipeline_engine import (
    execute_pipeline,
    retry_single_item,
    retry_step,
    retry_failed_items,
    check_pipeline_concurrent_lock,
    check_pipeline_trigger_permission,
    PipelineLockedError,
    PipelinePermissionError,
    RetryError,
)

logger = logging.getLogger("ucp.routers.executions")
router = APIRouter()


@router.get("/executions")
async def route_list_executions(
    pipeline_code: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(20, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.executions", "V")),
):
    stmt = select(UcpPipelineExecution).order_by(desc(UcpPipelineExecution.created_at))
    if pipeline_code:
        stmt = stmt.where(UcpPipelineExecution.pipeline_code == pipeline_code)
    if status:
        stmt = stmt.where(UcpPipelineExecution.status == status)

    count_stmt = select(UcpPipelineExecution)
    if pipeline_code:
        count_stmt = count_stmt.where(UcpPipelineExecution.pipeline_code == pipeline_code)
    if status:
        count_stmt = count_stmt.where(UcpPipelineExecution.status == status)
    total = (await db.execute(count_stmt)).scalars().all()
    total_count = len(total)

    stmt = stmt.offset(offset).limit(limit)
    items = (await db.execute(stmt)).scalars().all()

    result = []
    for e in items:
        result.append({
            "pipeline_run_id": e.pipeline_run_id,
            "trace_id": e.trace_id,
            "pipeline_code": e.pipeline_code,
            "trigger_type": e.trigger_type,
            "triggered_by": e.triggered_by,
            "status": e.status,
            "total_steps": e.total_steps,
            "success_steps": e.success_steps,
            "failed_steps": e.failed_steps,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "ended_at": e.ended_at.isoformat() if e.ended_at else None,
            "duration_ms": e.duration_ms,
            "error_message": e.error_message,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "context_summary": e.context_summary,
        })
    return {"total": total_count, "items": result}


@router.get("/executions/{pipeline_run_id}")
async def route_get_execution(
    pipeline_run_id: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.executions", "V")),
):
    stmt = select(UcpPipelineExecution).where(UcpPipelineExecution.pipeline_run_id == pipeline_run_id)
    exec_obj = (await db.execute(stmt)).scalar_one_or_none()
    if not exec_obj:
        raise HTTPException(404, "执行记录不存在")

    steps_stmt = (
        select(UcpPipelineStepExecution)
        .where(UcpPipelineStepExecution.pipeline_run_id == pipeline_run_id)
        .order_by(UcpPipelineStepExecution.id)
    )
    steps = (await db.execute(steps_stmt)).scalars().all()

    execution = {
        "pipeline_run_id": exec_obj.pipeline_run_id,
        "trace_id": exec_obj.trace_id,
        "pipeline_code": exec_obj.pipeline_code,
        "trigger_type": exec_obj.trigger_type,
        "status": exec_obj.status,
        "total_steps": exec_obj.total_steps,
        "success_steps": exec_obj.success_steps,
        "failed_steps": exec_obj.failed_steps,
        "started_at": exec_obj.started_at.isoformat() if exec_obj.started_at else None,
        "ended_at": exec_obj.ended_at.isoformat() if exec_obj.ended_at else None,
        "duration_ms": exec_obj.duration_ms,
        "error_message": exec_obj.error_message,
        "context_summary": exec_obj.context_summary,
    }
    step_items = []
    for s in steps:
        step_items.append({
            "step_run_id": s.step_run_id,
            "step_id": s.step_id,
            "step_type": s.step_type,
            "resource_code": s.resource_code,
            "status": s.status,
            "retry_count": s.retry_count,
            "total_items": s.total_items,
            "success_items": s.success_items,
            "failed_items": s.failed_items,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "duration_ms": s.duration_ms,
            "input_snapshot": s.input_snapshot,
            "output_snapshot": s.output_snapshot,
            "error_message": s.error_message,
        })
    return {"execution": execution, "steps": step_items}


@router.get("/executions/{pipeline_run_id}/steps/{step_run_id}/items")
async def route_step_items(
    pipeline_run_id: str,
    step_run_id: str,
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.executions", "V")),
):
    stmt = select(UcpLoopItemExecution).where(
        UcpLoopItemExecution.pipeline_run_id == pipeline_run_id,
        UcpLoopItemExecution.step_run_id == step_run_id,
    )
    if status:
        stmt = stmt.where(UcpLoopItemExecution.status == status)
    stmt = stmt.order_by(UcpLoopItemExecution.id).limit(limit)
    items = (await db.execute(stmt)).scalars().all()

    result = []
    for i in items:
        result.append({
            "id": i.id,
            "item_key": i.item_key,
            "status": i.status,
            "request_params_masked": i.request_params_masked,
            "response_summary_masked": i.response_summary_masked,
            "error_code": i.error_code,
            "error_message": i.error_message,
            "retry_count": i.retry_count,
            "is_retryable": i.is_retryable,
            "last_failed_at": i.last_failed_at.isoformat() if i.last_failed_at else None,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        })
    return {"total": len(result), "items": result}


@router.get("/executions/{pipeline_run_id}/logs")
async def route_execution_logs(
    pipeline_run_id: str,
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.executions", "V")),
):
    stmt = (
        select(UcpExecutionLog)
        .where(UcpExecutionLog.pipeline_run_id == pipeline_run_id)
        .order_by(desc(UcpExecutionLog.created_at))
        .limit(limit)
    )
    items = (await db.execute(stmt)).scalars().all()
    result = []
    for log in items:
        result.append({
            "id": log.id,
            "trace_id": log.trace_id,
            "resource_code": log.resource_code,
            "pipeline_code": log.pipeline_code,
            "trigger_type": log.trigger_type,
            "request_url": log.request_url,
            "request_body_masked": log.request_body_masked,
            "response_body_masked": log.response_body_masked,
            "status": log.status,
            "record_count": log.record_count,
            "success_count": log.success_count,
            "failed_count": log.failed_count,
            "error_message": log.error_message,
            "duration_ms": log.duration_ms,
            "executor": log.executor,
            "data_source": log.data_source,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    return {"total": len(result), "items": result}


@router.post("/pipelines/{pipeline_code}/run")
async def route_run_pipeline(
    pipeline_code: str,
    payload: dict[str, Any] = {},
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.pipelines", "U")),
):
    try:
        await check_pipeline_concurrent_lock(db, pipeline_code)
        await check_pipeline_trigger_permission(db, pipeline_code, user)
    except PipelineLockedError as e:
        raise HTTPException(409, str(e))
    except PipelinePermissionError as e:
        raise HTTPException(403, str(e))

    time_range = payload.get("time_range")
    override_params = payload.get("override_params")
    dry_run = payload.get("dry_run", False)

    exec_instance = await execute_pipeline(
        pipeline_code=pipeline_code,
        db=db,
        trigger_type="MANUAL",
        triggered_by=user.login_name,
        dry_run=dry_run,
        time_range=time_range,
        override_params=override_params,
    )
    return {
        "pipeline_run_id": exec_instance.pipeline_run_id,
        "trace_id": exec_instance.trace_id,
        "status": exec_instance.status,
        "duration_ms": exec_instance.duration_ms,
        "dry_run": dry_run,
    }


@router.get("/executions/{pipeline_run_id}/failed-items")
async def route_failed_items(
    pipeline_run_id: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.executions", "V")),
):
    stmt = (
        select(UcpLoopItemExecution)
        .where(
            UcpLoopItemExecution.pipeline_run_id == pipeline_run_id,
            UcpLoopItemExecution.status == "FAILED",
        )
        .order_by(UcpLoopItemExecution.id)
    )
    items = (await db.execute(stmt)).scalars().all()
    result = []
    for i in items:
        result.append({
            "id": i.id,
            "trace_id": i.trace_id,
            "step_run_id": i.step_run_id,
            "resource_code": i.resource_code,
            "item_key": i.item_key,
            "status": i.status,
            "error_code": i.error_code,
            "error_message": i.error_message,
            "retry_count": i.retry_count,
            "is_retryable": i.is_retryable,
            "last_failed_at": i.last_failed_at.isoformat() if i.last_failed_at else None,
        })
    return {"total": len(result), "items": result}


@router.post("/executions/{pipeline_run_id}/retry-failed")
async def route_retry_failed(
    pipeline_run_id: str,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.pipelines", "U")),
):
    try:
        result = await retry_failed_items(db, pipeline_run_id, triggered_by=user.login_name)
        return result
    except RetryError as e:
        raise HTTPException(400, str(e))


@router.post("/executions/{pipeline_run_id}/items/{item_id}/retry")
async def route_retry_item(
    pipeline_run_id: str,
    item_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.pipelines", "U")),
):
    try:
        result = await retry_single_item(db, pipeline_run_id, item_id, triggered_by=user.login_name)
        return result
    except RetryError as e:
        raise HTTPException(400, str(e))


@router.post("/executions/{pipeline_run_id}/steps/{step_run_id}/retry")
async def route_retry_step(
    pipeline_run_id: str,
    step_run_id: str,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.pipelines", "U")),
):
    try:
        result = await retry_step(db, pipeline_run_id, step_run_id, triggered_by=user.login_name)
        return result
    except RetryError as e:
        raise HTTPException(400, str(e))
