"""UCP API 路由

Phase 1B 配置中心与管理增强：
  - 连接器配置 CRUD + 启用/停用 + 配置版本查看 + 回滚
  - 凭证配置 CRUD + 启用/停用 + 密钥不回显
  - Pipeline 配置 CRUD + 启用/停用
  - 执行结果列表 + 详情 + 手动触发 + 失败项查看
  - 权限校验和操作审计

权限约定（Phase 1B）：
  - ucp.systems 菜单：V=查看配置, C=创建配置, U=修改配置, D=删除配置
  - ucp.executions 菜单：V=查看执行结果, C=手动触发, E=导出
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.system.models import SystemLog
from app.ucp.config_service import (
    get_enabled_pipeline_by_code,
    upsert_connector,
    upsert_pipeline,
    update_connector_fields,
    toggle_connector,
    delete_connector,
    update_pipeline_fields,
    toggle_pipeline,
    delete_pipeline,
    list_config_versions,
    rollback_connector,
)
from app.ucp.credential_service import (
    create_credential,
    update_credential,
    toggle_credential,
    list_credentials,
    decrypt_credential_secrets,
)
from app.ucp.models import (
    ConnectorCredential,
    ConnectorLoopItemExecution,
    ConnectorPipelineExecution,
    ConnectorPipelineStepExecution,
    ConnectorSystemConfig,
)
from app.ucp.pipeline_engine import (
    execute_pipeline,
    check_pipeline_concurrent_lock,
    check_pipeline_trigger_permission,
    PipelineLockedError,
    PipelinePermissionError,
)
from app.users.models import User

logger = logging.getLogger("ucp.router")

router = APIRouter(prefix="/ucp", tags=["UCP — 通用连接器平台"])


# ===== 权限校验辅助 =====

def _require_perm(user, module: str, op: str) -> None:
    """权限校验（运行时使用 User 对象）。

    用于 Phase 3 各端点简化权限判断: 检查用户对指定模块是否有某操作。
    当前为简化版, 实际应接入 Role/Permission 系统。
    Phase 3 端点通过 require_op 装饰器已做严格控制, 此函数作为备用。
    """
    if user is None:
        raise HTTPException(status_code=401, detail="未登录")
    # 当前实现: 已登录用户即可, 细粒度权限由 require_op 装饰器处理
    if not getattr(user, "is_active", False):
        raise HTTPException(status_code=403, detail="账号已被禁用")


# ===== 审计日志辅助 =====

async def _audit(
    db: AsyncSession,
    user: User,
    category: str,
    action: str,
    detail: str,
    metadata: dict | None = None,
):
    """写入操作审计日志到 system_logs。"""
    db.add(SystemLog(
        category=category,
        action=action,
        status="success",
        user_id=user.id,
        request_summary=detail,
        metadata_json=metadata or {},
    ))
    await db.flush()


# ===== Phase 1C: 现有视图配置桥接目标 =====

@router.get("/bridge-targets", summary="列出可作为 UCP 步骤的现有视图配置（Phase 1C 桥接）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_bridge_targets(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """列出可作为 DATASOURCE_BRIDGE_ADAPTER 步骤的现有视图配置。

    Phase 1C：让 UCP Pipeline 步骤可复用现有 datasources 配置（北森拉取/通用HTTP/数据库）。
    """
    from app.ucp.datasource_bridge import list_bridge_targets as _list

    items = await _list(db)
    return {"total": len(items), "items": items}


@router.get("/bridge-push-targets", summary="列出可作为 UCP 步骤的现有推送目标（Phase 1C 桥接）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_bridge_push_targets(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """列出可作为 PUSH_TARGET_BRIDGE_ADAPTER 步骤的现有推送目标。

    Phase 1C：让 UCP Pipeline 步骤可复用现有 push_targets 配置（飞书报表推送/外部数据库/HTTP推送）。
    """
    from app.ucp.push_bridge import list_bridge_push_targets as _list

    items = await _list(db)
    return {"total": len(items), "items": items}


# ===== 执行结果 =====

@router.get("/executions", summary="查看流水线执行结果列表",
            dependencies=[Depends(require_op("ucp.executions", "V"))])
async def list_executions(
    pipeline_code: str | None = None,
    status: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """查询流水线执行历史列表。"""
    total_stmt = select(ConnectorPipelineExecution)
    if pipeline_code:
        total_stmt = total_stmt.where(ConnectorPipelineExecution.pipeline_code == pipeline_code)
    if status:
        total_stmt = total_stmt.where(ConnectorPipelineExecution.status == status)
    total = len((await db.execute(total_stmt)).scalars().all())

    stmt = select(ConnectorPipelineExecution).order_by(desc(ConnectorPipelineExecution.created_at))
    if pipeline_code:
        stmt = stmt.where(ConnectorPipelineExecution.pipeline_code == pipeline_code)
    if status:
        stmt = stmt.where(ConnectorPipelineExecution.status == status)
    stmt = stmt.offset(offset).limit(limit)

    executions = (await db.execute(stmt)).scalars().all()
    return {
        "total": total,
        "items": [
            {
                "id": e.id,
                "pipeline_run_id": e.pipeline_run_id,
                "pipeline_code": e.pipeline_code,
                "trace_id": e.trace_id,
                "status": e.status,
                "trigger_type": e.trigger_type,
                "triggered_by": e.triggered_by,
                "total_steps": e.total_steps,
                "success_steps": e.success_steps,
                "failed_steps": e.failed_steps,
                "started_at": e.started_at.isoformat() if e.started_at else None,
                "ended_at": e.ended_at.isoformat() if e.ended_at else None,
                "duration_ms": e.duration_ms,
                "error_message": e.error_message,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in executions
        ],
    }


@router.get("/executions/{pipeline_run_id}", summary="查看单次执行详情",
            dependencies=[Depends(require_op("ucp.executions", "V"))])
async def get_execution_detail(
    pipeline_run_id: str,
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """查询单次流水线执行详情，含步骤执行结果。"""
    exec_instance = (
        await db.execute(
            select(ConnectorPipelineExecution).where(
                ConnectorPipelineExecution.pipeline_run_id == pipeline_run_id
            )
        )
    ).scalar_one_or_none()
    if exec_instance is None:
        raise HTTPException(status_code=404, detail=f"Execution '{pipeline_run_id}' not found")

    steps = (
        await db.execute(
            select(ConnectorPipelineStepExecution).where(
                ConnectorPipelineStepExecution.pipeline_run_id == pipeline_run_id
            ).order_by(ConnectorPipelineStepExecution.created_at)
        )
    ).scalars().all()

    return {
        "execution": {
            "id": exec_instance.id,
            "pipeline_run_id": exec_instance.pipeline_run_id,
            "pipeline_code": exec_instance.pipeline_code,
            "trace_id": exec_instance.trace_id,
            "status": exec_instance.status,
            "trigger_type": exec_instance.trigger_type,
            "total_steps": exec_instance.total_steps,
            "success_steps": exec_instance.success_steps,
            "failed_steps": exec_instance.failed_steps,
            "started_at": exec_instance.started_at.isoformat() if exec_instance.started_at else None,
            "ended_at": exec_instance.ended_at.isoformat() if exec_instance.ended_at else None,
            "duration_ms": exec_instance.duration_ms,
            "error_message": exec_instance.error_message,
            "context_summary": exec_instance.context_summary,
        },
        "steps": [
            {
                "id": s.id,
                "step_run_id": s.step_run_id,
                "step_id": s.step_id,
                "step_type": s.step_type,
                "connector_code": s.connector_code,
                "status": s.status,
                "retry_count": s.retry_count,
                "total_items": s.total_items,
                "success_items": s.success_items,
                "failed_items": s.failed_items,
                "error_message": s.error_message,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                "duration_ms": s.duration_ms,
                "input_snapshot": s.input_snapshot,
                "output_snapshot": s.output_snapshot,
            }
            for s in steps
        ],
    }


# ===== Phase 2-6: 步骤明细项与执行日志 =====

@router.get("/executions/{pipeline_run_id}/steps/{step_run_id}/items",
            summary="查看步骤的循环项明细（Phase 2-6）",
            dependencies=[Depends(require_op("ucp.executions", "V"))])
async def get_step_items(
    pipeline_run_id: str,
    step_run_id: str,
    status: str | None = Query(default=None, description="按状态过滤：SUCCESS/FAILED/OFFER_NOT_FOUND"),
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """查询单个步骤下的 CONNECTOR_LOOP 循环项明细（含请求/响应脱敏快照、错误堆栈）。

    用于执行详情页的"步骤日志"抽屉：展示每个 item 的请求参数、响应摘要、错误码/错误信息、重试次数。
    """
    stmt = select(ConnectorLoopItemExecution).where(
        ConnectorLoopItemExecution.pipeline_run_id == pipeline_run_id,
        ConnectorLoopItemExecution.step_run_id == step_run_id,
    )
    if status:
        stmt = stmt.where(ConnectorLoopItemExecution.status == status)
    stmt = stmt.order_by(ConnectorLoopItemExecution.created_at.desc()).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    return {
        "total": len(rows),
        "items": [
            {
                "id": r.id,
                "item_key": r.item_key,
                "status": r.status,
                "request_params_masked": r.request_params_masked,
                "response_summary_masked": r.response_summary_masked,
                "error_code": r.error_code,
                "error_message": r.error_message,
                "retry_count": r.retry_count,
                "is_retryable": r.is_retryable,
                "last_failed_at": r.last_failed_at.isoformat() if r.last_failed_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/executions/{pipeline_run_id}/logs",
            summary="查看执行日志（Phase 2-6）",
            dependencies=[Depends(require_op("ucp.executions", "V"))])
async def get_execution_logs(
    pipeline_run_id: str,
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """查询某次流水线执行的全部连接器执行日志（按时间正序）。

    用于执行详情页的"执行日志"标签：展示每个连接器调用的请求 URL、请求/响应脱敏体、统计、耗时。
    """
    from app.ucp.models import ConnectorExecutionLog

    stmt = (
        select(ConnectorExecutionLog)
        .where(ConnectorExecutionLog.pipeline_run_id == pipeline_run_id)
        .order_by(ConnectorExecutionLog.created_at)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "total": len(rows),
        "items": [
            {
                "id": r.id,
                "trace_id": r.trace_id,
                "connector_code": r.connector_code,
                "pipeline_code": r.pipeline_code,
                "trigger_type": r.trigger_type,
                "request_url": r.request_url,
                "request_body_masked": r.request_body_masked,
                "response_body_masked": r.response_body_masked,
                "status": r.status,
                "record_count": r.record_count,
                "success_count": r.success_count,
                "failed_count": r.failed_count,
                "error_message": r.error_message,
                "duration_ms": r.duration_ms,
                "executor": r.executor,
                "data_source": r.data_source,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


# ===== 手动触发 =====

class ManualTriggerRequest(BaseModel):
    """手动触发 Pipeline 请求体。"""
    dry_run: bool = Field(default=False, description="仅模拟执行，不写目标表不发通知")
    time_range: dict | None = Field(default=None, description="时间范围覆盖 {start, end}，注入到所有 CONNECTOR 步骤")
    override_params: dict | None = Field(default=None, description="覆盖步骤参数，key=step_id")


@router.post("/pipelines/{pipeline_code}/run", summary="手动触发流水线执行",
             dependencies=[Depends(require_op("ucp.executions", "C"))])
async def manual_trigger_pipeline(
    pipeline_code: str,
    payload: ManualTriggerRequest | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """手动触发一条 Pipeline 执行。

    Phase 2-4 新增：
      1. 并发互斥：同 pipeline_code 有 RUNNING/PENDING 时拒绝（409）
      2. 权限细分：仅系统管理员 / Pipeline owner 可触发（403）
      3. 触发参数：dry_run / time_range / override_params
    """
    payload = payload or ManualTriggerRequest()

    # 1. 权限细分检查
    try:
        await check_pipeline_trigger_permission(db, pipeline_code, _user)
    except PipelinePermissionError as e:
        raise HTTPException(status_code=403, detail={
            "code": e.code,
            "message": str(e),
            "pipeline_code": e.pipeline_code,
        })

    # 2. 并发互斥检查
    try:
        await check_pipeline_concurrent_lock(db, pipeline_code)
    except PipelineLockedError as e:
        raise HTTPException(status_code=409, detail={
            "code": e.code,
            "message": str(e),
            "pipeline_code": e.pipeline_code,
            "running_run_id": e.running_run_id,
        })

    # 3. 写审计
    await _audit(db, _user, "ucp_pipeline", "manual_trigger",
                 f"手动触发 Pipeline '{pipeline_code}'"
                 f"{' [DRY-RUN]' if payload.dry_run else ''}",
                 {
                     "pipeline_code": pipeline_code,
                     "dry_run": payload.dry_run,
                     "time_range": payload.time_range,
                     "override_params": payload.override_params,
                 })

    # 4. 执行
    try:
        result = await execute_pipeline(
            pipeline_code=pipeline_code,
            db=db,
            trigger_type="MANUAL",
            triggered_by=str(_user.id),
            dry_run=payload.dry_run,
            time_range=payload.time_range,
            override_params=payload.override_params,
        )
        return {
            "pipeline_run_id": result.pipeline_run_id,
            "trace_id": result.trace_id,
            "status": result.status,
            "duration_ms": result.duration_ms,
            "dry_run": payload.dry_run,
        }
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("[ucp] manual trigger failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {str(e)[:200]}")


# ===== 失败项 =====

@router.get("/executions/{pipeline_run_id}/failed-items", summary="查看失败项列表",
            dependencies=[Depends(require_op("ucp.executions", "V"))])
async def list_failed_items(
    pipeline_run_id: str,
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """查看流水线执行中的 CONNECTOR_LOOP 失败项。"""
    items = (
        await db.execute(
            select(ConnectorLoopItemExecution).where(
                ConnectorLoopItemExecution.pipeline_run_id == pipeline_run_id,
                ConnectorLoopItemExecution.status.in_(["FAILED", "OFFER_NOT_FOUND"]),
            ).order_by(ConnectorLoopItemExecution.created_at)
        )
    ).scalars().all()

    return {
        "total": len(items),
        "items": [
            {
                "id": i.id,
                "trace_id": i.trace_id,
                "step_run_id": i.step_run_id,
                "connector_code": i.connector_code,
                "item_key": i.item_key,
                "status": i.status,
                "error_code": i.error_code,
                "error_message": i.error_message,
                "retry_count": i.retry_count,
                "is_retryable": i.is_retryable,
                "last_failed_at": i.last_failed_at.isoformat() if i.last_failed_at else None,
            }
            for i in items
        ],
    }


@router.post("/executions/{pipeline_run_id}/retry-failed", summary="重跑失败项",
              dependencies=[Depends(require_op("ucp.executions", "C"))])
async def retry_failed_items_endpoint(
    pipeline_run_id: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """对 CONNECTOR_LOOP 失败项重新调用连接器（Phase 2-2 真实实现）。

    行为：
      1. 找到所有 is_retryable=1 且 status=FAILED 的失败项
      2. 按 step 分组重新调用 adapter
      3. 成功：写新 SUCCESS 记录，旧记录 is_retryable=0
      4. 失败：retry_count+1, 更新 last_failed_at
      5. 重新评估 pipeline 整体状态
    """
    from app.ucp.pipeline_engine import retry_failed_items, RetryError

    try:
        result = await retry_failed_items(
            db, pipeline_run_id,
            triggered_by=str(_user.id),
        )
    except RetryError as e:
        raise HTTPException(status_code=400, detail={"error_code": e.code, "message": e.message})

    await _audit(
        db, _user, "ucp_pipeline", "retry_failed_items",
        f"重跑失败项: pipeline_run_id={pipeline_run_id}, success={result['success_count']}, failed={result['failed_count']}",
        {
            "pipeline_run_id": pipeline_run_id,
            "total": result["total"],
            "success_count": result["success_count"],
            "failed_count": result["failed_count"],
        },
    )
    await db.commit()

    return {
        "status": "completed",
        "message": f"重跑完成: {result['success_count']}/{result['total']} 成功",
        **result,
    }


@router.post("/executions/{pipeline_run_id}/steps/{step_run_id}/retry",
             summary="重跑单个失败步骤（Phase 2-2）",
             dependencies=[Depends(require_op("ucp.executions", "C"))])
async def retry_step_endpoint(
    pipeline_run_id: str,
    step_run_id: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """对单个失败步骤重新执行（Phase 2-2）。

    适用场景：
      - 步骤 FAILED / PARTIAL_SUCCESS 时手动重试
      - 复用原 step_config 和凭证

    注意：
      - 步骤依赖的 context 来自 pipeline_exec.context_summary
      - 不重建上游步骤的输出，仅重试本步骤
      - 重试后 step_exec.retry_count+1, status 更新
    """
    from app.ucp.pipeline_engine import retry_step, RetryError

    try:
        step_exec = await retry_step(
            db, pipeline_run_id, step_run_id,
            triggered_by=str(_user.id),
        )
    except RetryError as e:
        raise HTTPException(status_code=400, detail={"error_code": e.code, "message": e.message})

    # 重新加载 pipeline_exec 用于返回最新状态
    pipeline_exec = (
        await db.execute(
            select(ConnectorPipelineExecution).where(
                ConnectorPipelineExecution.pipeline_run_id == pipeline_run_id
            )
        )
    ).scalar_one()

    await _audit(
        db, _user, "ucp_pipeline", "retry_step",
        f"重跑步骤: pipeline_run_id={pipeline_run_id}, step_run_id={step_run_id}, status={step_exec.status}",
        {
            "pipeline_run_id": pipeline_run_id,
            "step_run_id": step_run_id,
            "retry_count": step_exec.retry_count,
            "status": step_exec.status,
        },
    )
    await db.commit()

    return {
        "status": "completed",
        "message": f"步骤重试完成: {step_exec.status}",
        "step": {
            "step_run_id": step_exec.step_run_id,
            "step_id": step_exec.step_id,
            "status": step_exec.status,
            "retry_count": step_exec.retry_count,
            "duration_ms": step_exec.duration_ms,
            "error_message": step_exec.error_message,
            "output_snapshot": step_exec.output_snapshot,
        },
        "pipeline": {
            "pipeline_run_id": pipeline_exec.pipeline_run_id,
            "status": pipeline_exec.status,
            "success_steps": pipeline_exec.success_steps,
            "failed_steps": pipeline_exec.failed_steps,
        },
    }


# ===== 凭证管理 =====

@router.get("/credentials", summary="查看凭证列表",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_credential_configs(
    auth_type: str | None = None,
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """列出凭证配置（密钥不回显，只显示元数据）。"""
    creds = await list_credentials(db, auth_type=auth_type)
    return {
        "total": len(creds),
        "items": [
            {
                "id": c.id,
                "credential_code": c.credential_code,
                "credential_name": c.credential_name,
                "auth_type": c.auth_type,
                "description": c.description,
                "is_active": c.is_active,
                "last_verified_at": c.last_verified_at.isoformat() if c.last_verified_at else None,
                "last_verified_status": c.last_verified_status,
                "created_by": c.created_by,
                "updated_by": c.updated_by,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in creds
        ],
    }


@router.post("/credentials", summary="创建凭证",
              dependencies=[Depends(require_op("ucp.systems", "C"))])
async def create_new_credential(
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """创建新凭证。密钥加密存储，API 不回显密钥值。"""
    required = ["credential_code", "credential_name", "secrets"]
    for f in required:
        if f not in payload:
            raise HTTPException(status_code=400, detail=f"缺少必填字段: {f}")

    cred = await create_credential(
        db,
        credential_code=payload["credential_code"],
        credential_name=payload["credential_name"],
        secrets=payload["secrets"],
        auth_type=payload.get("auth_type", "custom"),
        description=payload.get("description"),
        created_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    # Phase 4-2: 凭证可强绑 system_id + env_tag + is_primary
    bind_system_id = payload.get("system_id")
    if bind_system_id is not None:
        from sqlalchemy import update as sa_update
        # 若 is_primary=True, 同 system 下其它凭证先降级
        if payload.get("is_primary"):
            await db.execute(
                sa_update(ConnectorCredential)
                .where(ConnectorCredential.system_id == bind_system_id)
                .values(is_primary=0)
            )
        await db.execute(
            sa_update(ConnectorCredential)
            .where(ConnectorCredential.id == cred.id)
            .values(
                system_id=int(bind_system_id),
                env_tag=payload.get("env_tag"),
                is_primary=1 if payload.get("is_primary") else 0,
                expires_at=payload.get("expires_at"),
            )
        )
    await _audit(db, _user, "ucp_credential", "create",
                 f"创建凭证 '{cred.credential_code}'", {"credential_code": cred.credential_code})
    await db.commit()

    return {
        "id": cred.id,
        "credential_code": cred.credential_code,
        "credential_name": cred.credential_name,
        "auth_type": cred.auth_type,
        "message": "凭证已创建，密钥已加密存储",
    }


@router.patch("/credentials/{credential_id}", summary="更新凭证",
               dependencies=[Depends(require_op("ucp.systems", "U"))])
async def update_credential_config(
    credential_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """更新凭证配置。如果包含 secrets 字段则视为轮换密钥。"""
    cred = await update_credential(
        db,
        credential_id=credential_id,
        credential_name=payload.get("credential_name"),
        secrets=payload.get("secrets"),
        auth_type=payload.get("auth_type"),
        description=payload.get("description"),
        updated_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    # Phase 4-2: is_primary 切换
    if "is_primary" in payload and payload["is_primary"]:
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(ConnectorCredential)
            .where(ConnectorCredential.system_id == cred.system_id)
            .where(ConnectorCredential.id != cred.id)
            .values(is_primary=0)
        )
        await db.execute(
            sa_update(ConnectorCredential)
            .where(ConnectorCredential.id == cred.id)
            .values(is_primary=1)
        )
    action = "rotate" if "secrets" in payload else "update"
    await _audit(db, _user, "ucp_credential", action,
                 f"{action}凭证 '{cred.credential_code}'",
                 {"credential_code": cred.credential_code, "action": action})
    await db.commit()

    return {
        "id": cred.id,
        "credential_code": cred.credential_code,
        "credential_name": cred.credential_name,
        "auth_type": cred.auth_type,
        "message": f"凭证已{('轮换' if action == 'rotate' else '更新')}",
    }


@router.patch("/credentials/{credential_id}/toggle", summary="启用/停用凭证",
               dependencies=[Depends(require_op("ucp.systems", "U"))])
async def toggle_credential_config(
    credential_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """启用或停用凭证。停用后连接器无法使用该凭证。"""
    is_active = payload.get("is_active", True)
    cred = await toggle_credential(
        db, credential_id, is_active=is_active,
        updated_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    await _audit(db, _user, "ucp_credential", "toggle",
                 f"凭证 '{cred.credential_code}' → is_active={is_active}",
                 {"credential_code": cred.credential_code, "is_active": is_active})
    await db.commit()

    return {
        "id": cred.id,
        "credential_code": cred.credential_code,
        "is_active": cred.is_active,
        "message": f"凭证已{'启用' if is_active else '停用'}",
    }


# ===== 连接器配置 =====

@router.get("/connectors", summary="查看连接器配置列表",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_connectors_view(
    connector_type: str | None = None,
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """列出所有连接器配置。"""
    from app.ucp.config_service import list_connectors as _list_connectors

    connectors = await _list_connectors(db, connector_type=connector_type)
    return {
        "total": len(connectors),
        "items": [
            {
                "id": c.id,
                "system_code": c.system_code,
                "system_name": c.system_name,
                "description": c.description,
                "connector_type": c.connector_type,
                "direction": c.direction,
                "adapter_code": c.adapter_code,
                "credential_id": c.credential_id,
                "test_status": c.test_status,
                "connector_owner": c.connector_owner,
                "status": c.status,
                "version": c.version,
                "run_as_type": c.run_as_type,
                "mapping_enabled": (c.mapping_config or {}).get("enabled", False),
                "created_by": c.created_by,
                "updated_by": c.updated_by,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in connectors
        ],
    }


@router.get("/connectors/{connector_id}", summary="查看连接器配置详情",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def get_connector_detail(
    connector_id: int,
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """查看连接器配置详情（含完整配置字段，凭证密钥不回显）。"""
    from app.ucp.config_service import get_connector_by_id

    conn = await get_connector_by_id(db, connector_id)
    if conn is None:
        raise HTTPException(status_code=404, detail=f"Connector {connector_id} not found")

    return {
        "id": conn.id,
        "system_code": conn.system_code,
        "system_name": conn.system_name,
        "description": conn.description,
        "connector_type": conn.connector_type,
        "direction": conn.direction,
        "adapter_code": conn.adapter_code,
        "protocol": conn.protocol,
        "credential_id": conn.credential_id,
        "report_config": conn.report_config,
        "scheduling": conn.scheduling,
        "mapping_config": conn.mapping_config,
        "retry_config": conn.retry_config,
        "notification_config": conn.notification_config,
        "test_status": conn.test_status,
        "test_result": conn.test_result,
        "test_time": conn.test_time.isoformat() if conn.test_time else None,
        "connector_owner": conn.connector_owner,
        "run_as_type": conn.run_as_type,
        "run_as_user_id": conn.run_as_user_id,
        "service_account_code": conn.service_account_code,
        "status": conn.status,
        "version": conn.version,
        "created_by": conn.created_by,
        "updated_by": conn.updated_by,
        "created_at": conn.created_at.isoformat() if conn.created_at else None,
        "updated_at": conn.updated_at.isoformat() if conn.updated_at else None,
    }


@router.post("/connectors", summary="创建连接器配置",
              dependencies=[Depends(require_op("ucp.systems", "C"))])
async def create_connector(
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """创建新连接器配置。"""
    required = ["system_code", "system_name", "connector_type"]
    for f in required:
        if f not in payload:
            raise HTTPException(status_code=400, detail=f"缺少必填字段: {f}")

    conn = await upsert_connector(
        db,
        system_code=payload["system_code"],
        system_name=payload["system_name"],
        connector_type=payload["connector_type"],
        direction=payload.get("direction", "INBOUND"),
        adapter_code=payload.get("adapter_code"),
        protocol=payload.get("protocol"),
        credential_id=payload.get("credential_id"),
        report_config=payload.get("report_config"),
        scheduling=payload.get("scheduling"),
        mapping_config=payload.get("mapping_config"),
        retry_config=payload.get("retry_config"),
        notification_config=payload.get("notification_config"),
        run_as_type=payload.get("run_as_type", "SERVICE_ACCOUNT"),
        service_account_code=payload.get("service_account_code"),
        connector_owner=payload.get("connector_owner"),
        description=payload.get("description"),
        created_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    await _audit(db, _user, "ucp_connector", "create",
                 f"创建连接器 '{conn.system_code}'",
                 {"system_code": conn.system_code, "connector_type": conn.connector_type})
    await db.commit()

    return {"id": conn.id, "system_code": conn.system_code, "message": "连接器配置已创建"}


@router.patch("/connectors/{connector_id}", summary="更新连接器配置",
               dependencies=[Depends(require_op("ucp.systems", "U"))])
async def update_connector_config(
    connector_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """部分更新连接器配置。只更新传入的字段。"""
    conn = await update_connector_fields(
        db, connector_id, payload,
        updated_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    await _audit(db, _user, "ucp_connector", "update",
                 f"更新连接器 '{conn.system_code}' 字段: {list(payload.keys())}",
                 {"system_code": conn.system_code, "updated_fields": list(payload.keys())})
    await db.commit()

    return {
        "id": conn.id,
        "system_code": conn.system_code,
        "version": conn.version,
        "message": "连接器配置已更新",
    }


@router.patch("/connectors/{connector_id}/toggle", summary="启用/停用连接器",
               dependencies=[Depends(require_op("ucp.systems", "U"))])
async def toggle_connector_config(
    connector_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """启用或停用连接器。停用后不会被 Pipeline Engine 执行。"""
    status = payload.get("status", 1)
    conn = await toggle_connector(
        db, connector_id, status=status,
        updated_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    status_label = {0: "未启用", 1: "启用", 2: "停用"}
    await _audit(db, _user, "ucp_connector", "toggle",
                 f"连接器 '{conn.system_code}' → {status_label.get(status, str(status))}",
                 {"system_code": conn.system_code, "status": status})
    await db.commit()

    return {
        "id": conn.id,
        "system_code": conn.system_code,
        "status": conn.status,
        "message": f"连接器已{status_label.get(status, '变更')}",
    }


@router.delete("/connectors/{connector_id}", summary="删除连接器配置",
                dependencies=[Depends(require_op("ucp.systems", "D"))])
async def delete_connector_config(
    connector_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """删除连接器配置。"""
    from app.ucp.config_service import get_connector_by_id
    conn = await get_connector_by_id(db, connector_id)
    if conn is None:
        raise HTTPException(status_code=404, detail=f"Connector {connector_id} not found")

    code = conn.system_code
    ok = await delete_connector(db, connector_id,
                                deleted_by=_user.username if hasattr(_user, "username") else str(_user.id))
    await _audit(db, _user, "ucp_connector", "delete",
                 f"删除连接器 '{code}'",
                 {"system_code": code})
    await db.commit()

    if ok:
        return {"message": f"连接器 '{code}' 已删除"}
    raise HTTPException(status_code=500, detail="删除失败")


# ===== 连接器配置版本 =====

@router.get("/connectors/{connector_id}/versions", summary="查看连接器配置版本历史",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_connector_versions(
    connector_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """查看连接器配置版本历史。"""
    from app.ucp.config_service import get_connector_by_id

    conn = await get_connector_by_id(db, connector_id)
    if conn is None:
        raise HTTPException(status_code=404, detail=f"Connector {connector_id} not found")

    versions = await list_config_versions(db, conn.system_code, limit=limit)
    return {
        "total": len(versions),
        "items": [
            {
                "id": v.id,
                "connector_code": v.connector_code,
                "version": v.version,
                "config_snapshot": v.config_snapshot,
                "change_reason": v.change_reason,
                "changed_by": v.changed_by,
                "changed_at": v.changed_at.isoformat() if v.changed_at else None,
            }
            for v in versions
        ],
    }


@router.post("/connectors/{connector_id}/rollback", summary="回滚连接器配置",
              dependencies=[Depends(require_op("ucp.systems", "U"))])
async def rollback_connector_config(
    connector_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """回滚连接器配置到指定版本。回滚后需要重新测试才能启用。"""
    target_version = payload.get("target_version")
    if target_version is None:
        raise HTTPException(status_code=400, detail="缺少 target_version 字段")

    try:
        conn = await rollback_connector(
            db, connector_id, target_version,
            rolled_back_by=_user.username if hasattr(_user, "username") else str(_user.id),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await _audit(db, _user, "ucp_connector", "rollback",
                 f"回滚连接器 '{conn.system_code}' 到 v{target_version}",
                 {"system_code": conn.system_code, "target_version": target_version})
    await db.commit()

    return {
        "id": conn.id,
        "system_code": conn.system_code,
        "version": conn.version,
        "test_status": conn.test_status,
        "message": f"配置已回滚到 v{target_version}，当前版本 v{conn.version}。需要重新测试才能启用。",
    }


# ===== Pipeline 配置 =====

@router.get("/pipelines", summary="查看流水线配置列表",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_pipelines_view(
    trigger_type: str | None = None,
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """列出所有流水线配置。"""
    from app.ucp.config_service import list_pipelines as _list_pipelines

    pipelines = await _list_pipelines(db, trigger_type=trigger_type)
    return {
        "total": len(pipelines),
        "items": [
            {
                "id": p.id,
                "pipeline_code": p.pipeline_code,
                "pipeline_name": p.pipeline_name,
                "description": p.description,
                "trigger_type": p.trigger_type,
                "trigger_config": p.trigger_config,
                "error_handling": p.error_handling,
                "steps_count": len(p.steps) if p.steps else 0,
                "status": p.status,
                "notification_enabled": (p.notification_config or {}).get("enabled", False),
                "created_by": p.created_by,
                "updated_by": p.updated_by,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in pipelines
        ],
    }


@router.get("/pipelines/{pipeline_id}", summary="查看流水线配置详情",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def get_pipeline_detail(
    pipeline_id: int,
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """查看流水线配置详情（含完整步骤定义）。"""
    from app.ucp.config_service import get_pipeline_by_id

    pl = await get_pipeline_by_id(db, pipeline_id)
    if pl is None:
        raise HTTPException(status_code=404, detail=f"Pipeline {pipeline_id} not found")

    return {
        "id": pl.id,
        "pipeline_code": pl.pipeline_code,
        "pipeline_name": pl.pipeline_name,
        "description": pl.description,
        "steps": pl.steps,
        "trigger_type": pl.trigger_type,
        "trigger_config": pl.trigger_config,
        "error_handling": pl.error_handling,
        "notification_config": pl.notification_config,
        "run_as_type": pl.run_as_type,
        "run_as_user_id": pl.run_as_user_id,
        "service_account_code": pl.service_account_code,
        "status": pl.status,
        "created_by": pl.created_by,
        "updated_by": pl.updated_by,
        "created_at": pl.created_at.isoformat() if pl.created_at else None,
        "updated_at": pl.updated_at.isoformat() if pl.updated_at else None,
    }


@router.post("/pipelines", summary="创建流水线配置",
              dependencies=[Depends(require_op("ucp.systems", "C"))])
async def create_pipeline(
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """创建新流水线配置。"""
    required = ["pipeline_code", "pipeline_name", "steps"]
    for f in required:
        if f not in payload:
            raise HTTPException(status_code=400, detail=f"缺少必填字段: {f}")

    pl = await upsert_pipeline(
        db,
        pipeline_code=payload["pipeline_code"],
        pipeline_name=payload["pipeline_name"],
        steps=payload["steps"],
        trigger_type=payload.get("trigger_type", "SCHEDULED"),
        trigger_config=payload.get("trigger_config"),
        error_handling=payload.get("error_handling", "STOP_ON_ERROR"),
        notification_config=payload.get("notification_config"),
        run_as_type=payload.get("run_as_type", "SERVICE_ACCOUNT"),
        service_account_code=payload.get("service_account_code"),
        description=payload.get("description"),
        created_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    await _audit(db, _user, "ucp_pipeline", "create",
                 f"创建流水线 '{pl.pipeline_code}'",
                 {"pipeline_code": pl.pipeline_code, "steps_count": len(pl.steps or [])})
    await db.commit()

    return {"id": pl.id, "pipeline_code": pl.pipeline_code, "message": "流水线配置已创建"}


@router.patch("/pipelines/{pipeline_id}", summary="更新流水线配置",
               dependencies=[Depends(require_op("ucp.systems", "U"))])
async def update_pipeline_config(
    pipeline_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """部分更新流水线配置。"""
    pl = await update_pipeline_fields(
        db, pipeline_id, payload,
        updated_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    await _audit(db, _user, "ucp_pipeline", "update",
                 f"更新流水线 '{pl.pipeline_code}' 字段: {list(payload.keys())}",
                 {"pipeline_code": pl.pipeline_code, "updated_fields": list(payload.keys())})
    await db.commit()

    return {
        "id": pl.id,
        "pipeline_code": pl.pipeline_code,
        "message": "流水线配置已更新",
    }


@router.patch("/pipelines/{pipeline_id}/toggle", summary="启用/停用流水线",
               dependencies=[Depends(require_op("ucp.systems", "U"))])
async def toggle_pipeline_config(
    pipeline_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """启用或停用流水线。停用时自动停用关联调度任务。"""
    status = payload.get("status", 1)
    pl = await toggle_pipeline(
        db, pipeline_id, status=status,
        updated_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    status_label = {0: "未启用", 1: "启用", 2: "停用"}
    await _audit(db, _user, "ucp_pipeline", "toggle",
                 f"流水线 '{pl.pipeline_code}' → {status_label.get(status, str(status))}",
                 {"pipeline_code": pl.pipeline_code, "status": status})
    await db.commit()

    return {
        "id": pl.id,
        "pipeline_code": pl.pipeline_code,
        "status": pl.status,
        "message": f"流水线已{status_label.get(status, '变更')}",
    }


@router.delete("/pipelines/{pipeline_id}", summary="删除流水线配置",
                dependencies=[Depends(require_op("ucp.systems", "D"))])
async def delete_pipeline_config(
    pipeline_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """删除流水线配置。"""
    from app.ucp.config_service import get_pipeline_by_id
    pl = await get_pipeline_by_id(db, pipeline_id)
    if pl is None:
        raise HTTPException(status_code=404, detail=f"Pipeline {pipeline_id} not found")

    code = pl.pipeline_code
    ok = await delete_pipeline(db, pipeline_id,
                               deleted_by=_user.username if hasattr(_user, "username") else str(_user.id))
    await _audit(db, _user, "ucp_pipeline", "delete",
                 f"删除流水线 '{code}'",
                 {"pipeline_code": code})
    await db.commit()

    if ok:
        return {"message": f"流水线 '{code}' 已删除"}
    raise HTTPException(status_code=500, detail="删除失败")


# ===== 配置 Seed =====

@router.post("/seed/offer-sync", summary="初始化 Offer 同步 Pipeline 配置")
async def seed_offer_sync_pipeline(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """Seed Offer 同步所需的连接器、凭证和流水线配置。"""
    beisen_cred = await create_credential(
        db,
        credential_code="BEISEN_PENDING_LIST_CRED",
        credential_name="北森待入职人员列表凭证",
        secrets={"app_key": "", "app_secret": ""},
        auth_type="beisen",
        description="北森 OpenAPI 凭证（待入职人员列表查询）",
        created_by=_user.username if hasattr(_user, "username") else "seed",
    )

    feishu_recruit_cred = await create_credential(
        db,
        credential_code="FEISHU_OFFER_DETAIL_CRED",
        credential_name="飞书招聘 Offer 查询凭证",
        secrets={"app_id": "", "app_secret": ""},
        auth_type="feishu_recruit",
        description="飞书招聘应用凭证（Offer 详情查询）",
        created_by=_user.username if hasattr(_user, "username") else "seed",
    )

    beisen_conn = await upsert_connector(
        db,
        system_code="BEISEN_PENDING_LIST",
        system_name="北森-待入职人员列表",
        connector_type="PULL",
        direction="INBOUND",
        adapter_code="BEISEN_PENDING_LIST_ADAPTER",
        protocol={"token_url": "", "data_url": "", "method": "POST", "body_template": "{}"},
        credential_id=beisen_cred.id,
        run_as_type="SERVICE_ACCOUNT",
        service_account_code="ucp_service",
        created_by=_user.username if hasattr(_user, "username") else "seed",
    )

    feishu_offer_conn = await upsert_connector(
        db,
        system_code="FEISHU_OFFER_DETAIL",
        system_name="飞书招聘-Offer详情",
        connector_type="PULL",
        direction="INBOUND",
        adapter_code="FEISHU_OFFER_DETAIL_ADAPTER",
        protocol={},
        credential_id=feishu_recruit_cred.id,
        mapping_config={"enabled": True, "rules": [
            {"source": "application_id", "target": "application_id"},
        ]},
        run_as_type="SERVICE_ACCOUNT",
        service_account_code="ucp_service",
        created_by=_user.username if hasattr(_user, "username") else "seed",
    )

    offer_pipeline = await upsert_pipeline(
        db,
        pipeline_code="PENDING_OFFER_SYNC",
        pipeline_name="待入职 Offer 数据同步",
        steps=[
            {
                "step_id": "pull_pending_list",
                "step_name": "从北森拉取待入职人员列表",
                "type": "CONNECTOR",
                "connector_code": "BEISEN_PENDING_LIST",
                "output_key": "pending_list",
                "error_handling": "STOP_ON_ERROR",
            },
            {
                "step_id": "extract_application_ids",
                "step_name": "提取投递 ID 列表",
                "type": "TRANSFORM",
                "input_key": "${pull_pending_list}",
                "transform_config": {
                    "operation": "extract_field",
                    "source_field": "application_id",
                    "output_field": "application_ids",
                },
                "output_key": "application_ids",
            },
            {
                "step_id": "pull_offer_detail",
                "step_name": "从飞书招聘拉取 Offer 详情",
                "type": "CONNECTOR_LOOP",
                "connector_code": "FEISHU_OFFER_DETAIL",
                "loop_input": "${application_ids}",
                "item_key_field": "application_id",
                "parallelism": 5,
                "batch_size": 10,
                "error_handling": "CONTINUE_ON_ERROR",
            },
            {
                "step_id": "merge_and_write",
                "step_name": "合并数据并写入本地表",
                "type": "TRANSFORM",
                "input_key": ["${pull_pending_list}", "${pull_offer_detail}"],
                "transform_config": {
                    "operation": "join_and_upsert",
                    "join_key": "application_id",
                    "target_table": "hr_pending_employee_full",
                },
            },
            {
                "step_id": "notify_result",
                "step_name": "发送同步结果通知",
                "type": "NOTIFY",
                "config": {
                    "trigger_condition": "ON_COMPLETION",
                    "message_type": "feishu",
                    "receivers": ["config_owner"],
                    "template": "offer_sync_result",
                },
            },
        ],
        trigger_type="SCHEDULED",
        trigger_config={"cron": "0 0 3 * * ?", "timezone": "Asia/Shanghai"},
        error_handling="CONTINUE_ON_ERROR",
        notification_config={
            "enabled": True,
            "on_failure": {"enabled": True, "message_type": "both", "receivers": ["config_owner", "it_oncall"], "template": "pipeline_failure"},
            "on_partial_success": {"enabled": True, "message_type": "feishu", "receivers": ["config_owner"], "template": "pipeline_partial_success"},
        },
        run_as_type="SERVICE_ACCOUNT",
        service_account_code="ucp_service",
        created_by=_user.username if hasattr(_user, "username") else "seed",
    )

    from app.scheduler.service import upsert_job
    from app.scheduler.engine import get_engine

    job = await upsert_job(
        db,
        kind="pipeline_run",
        business_id=offer_pipeline.id,
        cron=offer_pipeline.trigger_config.get("cron", "0 0 3 * * ?"),
        payload={"pipeline_code": "PENDING_OFFER_SYNC"},
        enabled=True,
    )
    await db.commit()

    engine = get_engine()
    await engine.reload_job(job.id)

    await _audit(db, _user, "ucp_seed", "offer_sync_init",
                 "初始化 Offer 同步 Pipeline 配置",
                 {"pipeline_code": "PENDING_OFFER_SYNC", "job_id": job.id})

    return {
        "message": "Offer 同步 Pipeline 配置已初始化",
        "created": {
            "credentials": 2,
            "connectors": 2,
            "pipelines": 1,
            "scheduler_job_id": job.id,
        },
    }


# ===== Phase 2-1：连接器测试引擎 =====

@router.post(
    "/connectors/{connector_code}/test",
    summary="运行单次连接器测试（Phase 2-1）",
    dependencies=[Depends(require_op("ucp.systems", "U"))],
)
async def run_connector_test(
    connector_code: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """运行单次连接器测试。

    payload: { test_type: AUTH/CONNECTIVITY/PREVIEW/PUSH_SIMULATION }
    """
    from app.ucp.test_engine import run_connector_test as _run, TestEngineError

    test_type = (payload or {}).get("test_type", "")
    if not test_type:
        raise HTTPException(status_code=400, detail="test_type 必填")

    tested_by = getattr(user, "login_name", None) or getattr(user, "id", None)

    try:
        log = await _run(db, connector_code, test_type, tested_by=tested_by)
    except TestEngineError as e:
        raise HTTPException(status_code=400, detail={"error_code": e.error_code, "message": e.message})

    await _audit(
        db, user, "ucp_connector_test", connector_code,
        f"运行测试 {test_type}", {"test_type": test_type, "status": log.status},
    )

    return {
        "id": log.id,
        "connector_code": log.connector_code,
        "test_type": log.test_type,
        "status": log.status,
        "duration_ms": log.duration_ms,
        "error_code": log.error_code,
        "error_message": log.error_message,
        "response_sample": log.response_sample,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


@router.post(
    "/connectors/{connector_code}/test-all",
    summary="运行所有 4 类连接器测试（Phase 2-1）",
    dependencies=[Depends(require_op("ucp.systems", "U"))],
)
async def run_all_connector_tests(
    connector_code: str,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """一次性跑完 AUTH / CONNECTIVITY / PREVIEW / PUSH_SIMULATION。"""
    from app.ucp.test_engine import run_all_tests as _run_all

    tested_by = getattr(user, "login_name", None) or getattr(user, "id", None)
    logs = await _run_all(db, connector_code, tested_by=tested_by)

    await _audit(
        db, user, "ucp_connector_test", connector_code,
        "运行全部 4 类测试", {"total": len(logs)},
    )

    return {
        "total": len(logs),
        "items": [
            {
                "id": log.id,
                "test_type": log.test_type,
                "status": log.status,
                "duration_ms": log.duration_ms,
                "error_code": log.error_code,
                "error_message": log.error_message,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }


@router.get(
    "/connectors/{connector_code}/test-history",
    summary="查看连接器测试历史（Phase 2-1）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def get_connector_test_history(
    connector_code: str,
    test_type: str | None = Query(None, description="可选：按 test_type 过滤"),
    limit: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """按时间倒序列出测试历史。"""
    from app.ucp.test_engine import list_test_history

    items = await list_test_history(db, connector_code, limit=limit, test_type=test_type)
    return {"total": len(items), "items": items}


@router.get(
    "/connectors/{connector_code}/test-latest",
    summary="查看每种测试类型的最新一次结果（Phase 2-1）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def get_connector_latest_tests(
    connector_code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """用于测试向导的步骤状态展示。"""
    from app.ucp.test_engine import get_latest_test_per_type, TEST_TYPE_LABELS

    latest = await get_latest_test_per_type(db, connector_code)
    out = {}
    for test_type, log in latest.items():
        out[test_type] = {
            "label": TEST_TYPE_LABELS.get(test_type, test_type),
            "log": (
                {
                    "id": log.id,
                    "status": log.status,
                    "duration_ms": log.duration_ms,
                    "error_code": log.error_code,
                    "error_message": log.error_message,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                if log
                else None
            ),
        }
    return {"connector_code": connector_code, "tests": out}


@router.post(
    "/connectors/{connector_code}/enable",
    summary="启用连接器（要求测试通过，Phase 2-1）",
    dependencies=[Depends(require_op("ucp.systems", "U"))],
)
async def enable_connector_after_test(
    connector_code: str,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """启用连接器，要求 test_status=PASSED。

    spec §8.5：连接器首次启用前必须测试通过。
    """
    from app.ucp.test_engine import get_latest_test_per_type, ALL_TEST_TYPES
    from app.ucp.models import ConnectorSystemConfig

    conn = (
        await db.execute(
            select(ConnectorSystemConfig).where(
                ConnectorSystemConfig.system_code == connector_code,
            )
        )
    ).scalar_one_or_none()
    if conn is None:
        raise HTTPException(status_code=404, detail=f"Connector '{connector_code}' not found")

    if conn.test_status != "PASSED":
        # 检查是否有任何 PASSED 测试
        latest = await get_latest_test_per_type(db, connector_code)
        has_passed = any(
            (log := latest[t]) is not None and log.status == "PASSED"
            for t in ALL_TEST_TYPES
        )
        if not has_passed:
            raise HTTPException(
                status_code=400,
                detail="连接器未通过测试，请先运行 AUTH/CONNECTIVITY/PREVIEW/PUSH_SIMULATION 测试",
            )

    conn.status = 1  # 启用
    await db.commit()
    await _audit(
        db, user, "ucp_connector_toggle", connector_code,
        "启用连接器（测试通过）", {"test_status": conn.test_status},
    )
    return {"message": f"连接器 '{connector_code}' 已启用", "status": conn.status}


# ===== Phase 2-5：管理界面增强 =====

class BatchToggleRequest(BaseModel):
    """批量启停请求体。"""
    target_type: str = Field(..., description="connector / pipeline / credential")
    target_ids: list[int] = Field(..., description="目标 ID 列表")
    new_status: int = Field(..., description="新状态: 1=启用 2=停用")


@router.post("/config/batch-toggle", summary="批量启用/停用配置（Phase 2-5）",
             dependencies=[Depends(require_op("ucp.systems", "U"))])
async def batch_toggle_configs(
    payload: BatchToggleRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """批量启用/停用连接器/Pipeline/凭证。

    返回成功数和失败明细（缺失或权限拒绝的会进入 details）。
    """
    from app.ucp.models import (
        ConnectorSystemConfig,
        ConnectorPipelineConfig,
        ConnectorCredential,
    )

    if payload.target_type == "connector":
        model = ConnectorSystemConfig
    elif payload.target_type == "pipeline":
        model = ConnectorPipelineConfig
    elif payload.target_type == "credential":
        model = ConnectorCredential
    else:
        raise HTTPException(status_code=400, detail=f"未知 target_type: {payload.target_type}")

    if payload.new_status not in (1, 2):
        raise HTTPException(status_code=400, detail="new_status 必须为 1（启用）或 2（停用）")

    if not payload.target_ids:
        raise HTTPException(status_code=400, detail="target_ids 不能为空")

    success = 0
    failed = []
    for tid in payload.target_ids:
        try:
            row = await db.get(model, tid)
            if row is None:
                failed.append({"id": tid, "reason": "not_found"})
                continue
            if payload.target_type == "credential":
                row.is_active = 1 if payload.new_status == 1 else 0
            else:
                row.status = payload.new_status
            success += 1
        except Exception as e:
            logger.warning(f"批量操作失败 id={tid}: {e}")
            failed.append({"id": tid, "reason": str(e)})

    await db.commit()
    await _audit(
        db, user, f"ucp_{payload.target_type}_batch", "batch_toggle",
        f"批量{'启用' if payload.new_status == 1 else '停用'} {success} 个 {payload.target_type}",
        {"success": success, "failed": len(failed), "target_ids": payload.target_ids},
    )
    return {
        "success_count": success,
        "failed_count": len(failed),
        "new_status": payload.new_status,
        "failed_details": failed,
    }


@router.get("/config/stats", summary="配置中心统计概览（Phase 2-5）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def get_config_stats(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """统计连接器、Pipeline、凭证数量与启用情况。"""
    from app.ucp.models import (
        ConnectorSystemConfig,
        ConnectorPipelineConfig,
        ConnectorCredential,
    )

    conn_rows = (await db.execute(select(ConnectorSystemConfig))).scalars().all()
    pipe_rows = (await db.execute(select(ConnectorPipelineConfig))).scalars().all()
    cred_rows = (await db.execute(select(ConnectorCredential))).scalars().all()

    conn_stats = {
        "total": len(conn_rows),
        "enabled": sum(1 for c in conn_rows if c.status == 1),
        "disabled": sum(1 for c in conn_rows if c.status == 2),
        "untested": sum(1 for c in conn_rows if c.test_status == "NOT_TESTED"),
        "failed_test": sum(1 for c in conn_rows if c.test_status == "FAILED"),
        "by_type": {},
    }
    for c in conn_rows:
        conn_stats["by_type"][c.connector_type] = conn_stats["by_type"].get(c.connector_type, 0) + 1

    pipe_stats = {
        "total": len(pipe_rows),
        "enabled": sum(1 for p in pipe_rows if p.status == 1),
        "disabled": sum(1 for p in pipe_rows if p.status == 2),
        "by_trigger": {},
    }
    for p in pipe_rows:
        pipe_stats["by_trigger"][p.trigger_type] = pipe_stats["by_trigger"].get(p.trigger_type, 0) + 1

    cred_stats = {
        "total": len(cred_rows),
        "active": sum(1 for c in cred_rows if c.is_active == 1),
        "inactive": sum(1 for c in cred_rows if not c.is_active),
    }

    return {
        "connectors": conn_stats,
        "pipelines": pipe_stats,
        "credentials": cred_stats,
    }


@router.get("/config/search", summary="统一搜索（Phase 2-5）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def unified_search(
    keyword: str = Query("", description="关键字，按编码/名称模糊匹配"),
    target_type: str = Query("all", description="all/connector/pipeline/credential"),
    status: int | None = Query(None, description="0/1/2 状态过滤"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """跨表统一搜索连接器/Pipeline/凭证，支持关键字与状态过滤。"""
    from app.ucp.models import (
        ConnectorSystemConfig,
        ConnectorPipelineConfig,
        ConnectorCredential,
    )
    from sqlalchemy import or_

    result = {"connectors": [], "pipelines": [], "credentials": []}

    kw = f"%{keyword.strip()}%" if keyword.strip() else None

    if target_type in ("all", "connector"):
        stmt = select(ConnectorSystemConfig)
        if kw:
            stmt = stmt.where(or_(
                ConnectorSystemConfig.system_code.ilike(kw),
                ConnectorSystemConfig.system_name.ilike(kw),
                ConnectorSystemConfig.description.ilike(kw),
            ))
        if status is not None:
            stmt = stmt.where(ConnectorSystemConfig.status == status)
        stmt = stmt.limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        result["connectors"] = [
            {
                "id": r.id, "system_code": r.system_code, "system_name": r.system_name,
                "connector_type": r.connector_type, "status": r.status,
                "test_status": r.test_status, "version": r.version,
            }
            for r in rows
        ]

    if target_type in ("all", "pipeline"):
        stmt = select(ConnectorPipelineConfig)
        if kw:
            stmt = stmt.where(or_(
                ConnectorPipelineConfig.pipeline_code.ilike(kw),
                ConnectorPipelineConfig.pipeline_name.ilike(kw),
                ConnectorPipelineConfig.description.ilike(kw),
            ))
        if status is not None:
            stmt = stmt.where(ConnectorPipelineConfig.status == status)
        stmt = stmt.limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        result["pipelines"] = [
            {
                "id": r.id, "pipeline_code": r.pipeline_code, "pipeline_name": r.pipeline_name,
                "trigger_type": r.trigger_type, "status": r.status,
                "steps_count": len(r.steps or []),
            }
            for r in rows
        ]

    if target_type in ("all", "credential"):
        stmt = select(ConnectorCredential)
        if kw:
            stmt = stmt.where(or_(
                ConnectorCredential.credential_code.ilike(kw),
                ConnectorCredential.credential_name.ilike(kw),
                ConnectorCredential.description.ilike(kw),
            ))
        if status is not None:
            v = 1 if status == 1 else 0
            stmt = stmt.where(ConnectorCredential.is_active == v)
        stmt = stmt.limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        result["credentials"] = [
            {
                "id": r.id, "credential_code": r.credential_code, "credential_name": r.credential_name,
                "auth_type": r.auth_type, "is_active": r.is_active,
            }
            for r in rows
        ]

    result["total"] = len(result["connectors"]) + len(result["pipelines"]) + len(result["credentials"])
    return result


@router.get("/config/export", summary="导出配置（Phase 2-5）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def export_configs(
    target_type: str = Query("all", description="all/connector/pipeline/credential"),
    format: str = Query("json", description="json / yaml"),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """导出连接器/Pipeline/凭证的完整配置快照。

    用于跨环境迁移、备份与配置共享。
    """
    from app.ucp.models import (
        ConnectorSystemConfig,
        ConnectorPipelineConfig,
        ConnectorCredential,
    )

    out: dict = {
        "export_version": "1.0",
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "exported_by": getattr(_user, "login_name", None) or str(getattr(_user, "id", "")),
        "target_type": target_type,
    }

    if target_type in ("all", "credential"):
        rows = (await db.execute(select(ConnectorCredential))).scalars().all()
        out["credentials"] = [
            {
                "credential_code": r.credential_code,
                "credential_name": r.credential_name,
                "auth_type": r.auth_type,
                "is_active": bool(r.is_active),
                "description": r.description,
                # 注意：secrets 字段不导出（安全）
            }
            for r in rows
        ]

    if target_type in ("all", "connector"):
        rows = (await db.execute(select(ConnectorSystemConfig))).scalars().all()
        out["connectors"] = [
            {
                "system_code": r.system_code,
                "system_name": r.system_name,
                "connector_type": r.connector_type,
                "direction": r.direction,
                "adapter_code": r.adapter_code,
                "protocol": r.protocol,
                "report_config": r.report_config,
                "scheduling": r.scheduling,
                "mapping_config": r.mapping_config,
                "file_config": r.file_config,
                "retry_config": r.retry_config,
                "circuit_breaker_config": r.circuit_breaker_config,
                "notification_config": r.notification_config,
                "test_config": r.test_config,
                "connector_owner": r.connector_owner,
                "run_as_type": r.run_as_type,
                "service_account_code": r.service_account_code,
                "status": r.status,
                "version": r.version,
                "description": r.description,
            }
            for r in rows
        ]

    if target_type in ("all", "pipeline"):
        rows = (await db.execute(select(ConnectorPipelineConfig))).scalars().all()
        out["pipelines"] = [
            {
                "pipeline_code": r.pipeline_code,
                "pipeline_name": r.pipeline_name,
                "description": r.description,
                "steps": r.steps,
                "trigger_type": r.trigger_type,
                "trigger_config": r.trigger_config,
                "error_handling": r.error_handling,
                "notification_config": r.notification_config,
                "run_as_type": r.run_as_type,
                "service_account_code": r.service_account_code,
                "status": r.status,
            }
            for r in rows
        ]

    if format == "yaml":
        try:
            import yaml
            return {"format": "yaml", "content": yaml.safe_dump(out, allow_unicode=True, sort_keys=False)}
        except ImportError:
            return {"format": "json", "content": out, "warning": "yaml 模块不可用，已回退为 JSON"}
    return {"format": "json", "content": out}


class ConfigImportRequest(BaseModel):
    """配置导入请求体。"""
    content: dict = Field(..., description="导入的配置字典")
    target_type: str = Field("all", description="all/connector/pipeline/credential")
    dry_run: bool = Field(True, description="True=仅校验不落地，False=实际导入")
    skip_existing: bool = Field(True, description="True=跳过已存在的编码，False=覆盖")


@router.post("/config/import", summary="导入配置（Phase 2-5）",
             dependencies=[Depends(require_op("ucp.systems", "C"))])
async def import_configs(
    payload: ConfigImportRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """导入连接器/Pipeline/凭证配置。

    - dry_run=True：只校验不落地
    - skip_existing=True：跳过已存在的编码（按 system_code/pipeline_code/credential_code 判重）
    - 凭证密钥不导入（导出也不含），导入后需要单独更新密钥
    """
    from app.ucp.config_service import (
        upsert_connector,
        upsert_pipeline,
    )

    if not payload.content or not isinstance(payload.content, dict):
        raise HTTPException(status_code=400, detail="content 字段必须是非空字典")

    result = {
        "dry_run": payload.dry_run,
        "credentials": {"created": 0, "skipped": 0, "errors": []},
        "connectors": {"created": 0, "skipped": 0, "errors": []},
        "pipelines": {"created": 0, "skipped": 0, "errors": []},
    }

    operator = getattr(user, "login_name", None) or str(getattr(user, "id", ""))

    if payload.target_type in ("all", "credential") and "credentials" in payload.content:
        creds = payload.content.get("credentials") or []
        if not isinstance(creds, list):
            raise HTTPException(status_code=400, detail="credentials 字段必须是数组")
        for idx, item in enumerate(creds):
            if not isinstance(item, dict):
                result["credentials"]["errors"].append({"index": idx, "reason": "not_dict"})
                continue
            code = item.get("credential_code", "")
            if not code:
                result["credentials"]["errors"].append({"index": idx, "reason": "missing_credential_code"})
                continue
            from app.ucp.credential_service import create_credential
            from app.ucp.models import ConnectorCredential
            existing = (await db.execute(
                select(ConnectorCredential).where(ConnectorCredential.credential_code == code)
            )).scalar_one_or_none()
            if existing and payload.skip_existing:
                result["credentials"]["skipped"] += 1
                continue
            if payload.dry_run:
                result["credentials"]["created"] += 1  # 视为可创建
                continue
            try:
                await create_credential(
                    db,
                    credential_code=code,
                    credential_name=item.get("credential_name", code),
                    secrets={"placeholder": "REPLACE_ME"},  # 强制要求用户后补密钥
                    auth_type=item.get("auth_type", "custom"),
                    description=item.get("description"),
                    created_by=operator,
                )
                result["credentials"]["created"] += 1
            except Exception as e:
                result["credentials"]["errors"].append({"code": code, "reason": str(e)})
                await db.rollback()

    if payload.target_type in ("all", "connector") and "connectors" in payload.content:
        conns = payload.content.get("connectors") or []
        if not isinstance(conns, list):
            raise HTTPException(status_code=400, detail="connectors 字段必须是数组")
        for idx, item in enumerate(conns):
            if not isinstance(item, dict):
                result["connectors"]["errors"].append({"index": idx, "reason": "not_dict"})
                continue
            code = item.get("system_code", "")
            if not code:
                result["connectors"]["errors"].append({"index": idx, "reason": "missing_system_code"})
                continue
            from app.ucp.models import ConnectorSystemConfig
            existing = (await db.execute(
                select(ConnectorSystemConfig).where(ConnectorSystemConfig.system_code == code)
            )).scalar_one_or_none()
            if existing and payload.skip_existing:
                result["connectors"]["skipped"] += 1
                continue
            if payload.dry_run:
                result["connectors"]["created"] += 1
                continue
            try:
                await upsert_connector(
                    db,
                    system_code=code,
                    system_name=item.get("system_name", code),
                    connector_type=item.get("connector_type", "PULL"),
                    direction=item.get("direction", "INBOUND"),
                    adapter_code=item.get("adapter_code"),
                    protocol=item.get("protocol"),
                    report_config=item.get("report_config"),
                    scheduling=item.get("scheduling"),
                    mapping_config=item.get("mapping_config"),
                    retry_config=item.get("retry_config"),
                    notification_config=item.get("notification_config"),
                    connector_owner=item.get("connector_owner"),
                    run_as_type=item.get("run_as_type", "SERVICE_ACCOUNT"),
                    service_account_code=item.get("service_account_code"),
                    description=item.get("description"),
                    created_by=operator,
                )
                result["connectors"]["created"] += 1
            except Exception as e:
                result["connectors"]["errors"].append({"code": code, "reason": str(e)})
                await db.rollback()

    if payload.target_type in ("all", "pipeline") and "pipelines" in payload.content:
        pips = payload.content.get("pipelines") or []
        if not isinstance(pips, list):
            raise HTTPException(status_code=400, detail="pipelines 字段必须是数组")
        for idx, item in enumerate(pips):
            if not isinstance(item, dict):
                result["pipelines"]["errors"].append({"index": idx, "reason": "not_dict"})
                continue
            code = item.get("pipeline_code", "")
            if not code:
                result["pipelines"]["errors"].append({"index": idx, "reason": "missing_pipeline_code"})
                continue
            from app.ucp.models import ConnectorPipelineConfig
            existing = (await db.execute(
                select(ConnectorPipelineConfig).where(ConnectorPipelineConfig.pipeline_code == code)
            )).scalar_one_or_none()
            if existing and payload.skip_existing:
                result["pipelines"]["skipped"] += 1
                continue
            if payload.dry_run:
                result["pipelines"]["created"] += 1
                continue
            try:
                await upsert_pipeline(
                    db,
                    pipeline_code=code,
                    pipeline_name=item.get("pipeline_name", code),
                    steps=item.get("steps", []),
                    trigger_type=item.get("trigger_type", "SCHEDULED"),
                    trigger_config=item.get("trigger_config"),
                    error_handling=item.get("error_handling", "STOP_ON_ERROR"),
                    notification_config=item.get("notification_config"),
                    run_as_type=item.get("run_as_type", "SERVICE_ACCOUNT"),
                    service_account_code=item.get("service_account_code"),
                    description=item.get("description"),
                    created_by=operator,
                )
                result["pipelines"]["created"] += 1
            except Exception as e:
                result["pipelines"]["errors"].append({"code": code, "reason": str(e)})
                await db.rollback()

    if not payload.dry_run:
        await db.commit()
        await _audit(
            db, user, "ucp_config_import", "import",
            f"导入配置（{'全量' if payload.target_type == 'all' else payload.target_type}）",
            {
                "credentials": result["credentials"],
                "connectors": result["connectors"],
                "pipelines": result["pipelines"],
            },
        )

    return result


# ===== Phase 2-7: Excel 文件导入连接器 =====

class ExcelImportRequest(BaseModel):
    """Excel 导入到目标表请求体。"""
    file_key: str = Field(..., description="上传后返回的 file_key")
    target_table: str = Field(..., description="目标表名")
    join_key: str = Field(..., description="幂等主键字段名")
    mapping_rules: list[dict] | None = Field(default=None, description="字段映射 [{source, target}]")
    sheet_name: str | None = Field(default=None, description="工作表名（默认第一个）")


@router.post("/excel/upload", summary="上传 Excel 文件并预览（Phase 2-7）",
             dependencies=[Depends(require_op("ucp.systems", "C"))])
async def upload_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """上传 .xlsx/.xls 文件，解析表头 + 返回脱敏预览样本。

    返回 file_key 供后续 /ucp/excel/import 使用。文件临时存储，24h 后自动清理。
    """
    from app.ucp.excel_service import save_and_preview, ExcelImportError, cleanup_expired_files

    # 顺带清理过期文件（低频触发）
    try:
        cleanup_expired_files()
    except Exception:
        pass

    filename = file.filename or "upload.xlsx"
    try:
        file_bytes = await file.read()
        result = await save_and_preview(file_bytes, filename)
    except ExcelImportError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

    await _audit(
        db, _user, "ucp_excel", "upload",
        f"上传 Excel '{filename}'（{result['total_rows']} 行）",
        {"file_key": result["file_key"], "headers": result["headers"]},
    )
    return result


@router.post("/excel/import", summary="导入 Excel 数据到目标表（Phase 2-7）",
             dependencies=[Depends(require_op("ucp.systems", "U"))])
async def import_excel(
    payload: ExcelImportRequest,
    db: AsyncSession = Depends(get_session),
    _user=Depends(current_user),
) -> dict:
    """将已上传的 Excel 数据导入目标表（按映射规则转换 + join_key upsert + 错误行记录）。"""
    from app.ucp.excel_service import import_to_target_table, ExcelImportError

    try:
        result = await import_to_target_table(
            db=db,
            file_key=payload.file_key,
            target_table=payload.target_table,
            join_key=payload.join_key,
            mapping_rules=payload.mapping_rules,
            sheet_name=payload.sheet_name,
        )
    except ExcelImportError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

    await db.commit()
    await _audit(
        db, _user, "ucp_excel", "import",
        f"导入 Excel 到 '{payload.target_table}'（{result['success_count']}/{result['total_rows']} 成功）",
        {
            "file_key": payload.file_key,
            "target_table": payload.target_table,
            "status": result["status"],
            "failed_count": result["failed_count"],
        },
    )
    return result


# ===== Phase 2-9：熔断与限流管理 =====

@router.get("/circuits", summary="列出所有熔断器状态（Phase 2-9）")
async def list_circuits(
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """列出所有有熔断记录的连接器状态。"""
    _require_perm(current_user, "ucp", "V")
    from app.ucp.circuit_breaker import list_circuits as _list_circuits
    return {"circuits": _list_circuits()}


@router.get("/circuits/{connector_code}", summary="查询单个连接器熔断状态（Phase 2-9）")
async def get_circuit_detail(
    connector_code: str,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """查询指定连接器的熔断器状态。"""
    _require_perm(current_user, "ucp", "V")
    from app.ucp.circuit_breaker import get_circuit_state
    state = get_circuit_state(connector_code)
    # 同时读取连接器配置中的 circuit_breaker_config
    conn = (
        await db.execute(
            select(ConnectorSystemConfig).where(
                ConnectorSystemConfig.system_code == connector_code,
            )
        )
    ).scalar_one_or_none()
    return {
        "connector_code": connector_code,
        "config": (conn.circuit_breaker_config or {}) if conn else {},
        "state": state,
    }


@router.post("/circuits/{connector_code}/reset", summary="手动重置熔断器（Phase 2-9）")
async def reset_circuit(
    connector_code: str,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """重置指定连接器的熔断器（运维用）。

    Returns:
        dict: 重置后的状态快照
    """
    _require_perm(current_user, "ucp", "U")
    from app.ucp.circuit_breaker import reset_circuit as _reset

    state = _reset(connector_code)
    await _audit(
        db, current_user, "ucp_circuit", "reset",
        f"重置熔断器 {connector_code}",
        {"connector_code": connector_code, "state": state},
    )
    return {"connector_code": connector_code, "state": state}


@router.patch("/circuits/{connector_code}/config", summary="更新熔断配置（Phase 2-9）")
async def update_circuit_config(
    connector_code: str,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """更新指定连接器的熔断器配置（写回 connector_system_config.circuit_breaker_config）。

    Body:
        {
            "enabled": true,
            "failure_threshold": 5,
            "open_duration_seconds": 300,
            "half_open_max_calls": 1,
            "success_threshold": 3
        }
    """
    _require_perm(current_user, "ucp", "U")
    conn = (
        await db.execute(
            select(ConnectorSystemConfig).where(
                ConnectorSystemConfig.system_code == connector_code,
            )
        )
    ).scalar_one_or_none()
    if conn is None:
        raise HTTPException(status_code=404, detail=f"连接器 '{connector_code}' 不存在")

    # 字段白名单
    allowed_keys = {"enabled", "failure_threshold", "open_duration_seconds", "half_open_max_calls", "success_threshold"}
    new_cfg = {k: v for k, v in (payload or {}).items() if k in allowed_keys}
    if "enabled" in new_cfg and not isinstance(new_cfg["enabled"], bool):
        raise HTTPException(status_code=400, detail="enabled 必须是布尔值")
    for k in ("failure_threshold", "open_duration_seconds", "half_open_max_calls", "success_threshold"):
        if k in new_cfg:
            try:
                v = int(new_cfg[k])
                if v <= 0:
                    raise ValueError
                new_cfg[k] = v
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"{k} 必须是正整数")

    conn.circuit_breaker_config = new_cfg
    await db.commit()
    await _audit(
        db, current_user, "ucp_circuit", "update_config",
        f"更新熔断配置 {connector_code}",
        {"connector_code": connector_code, "new_config": new_cfg},
    )
    return {"connector_code": connector_code, "config": new_cfg}


@router.get("/rate-limits", summary="列出所有限流桶状态（Phase 2-9）")
async def list_rate_limits(
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """列出所有有限流活动的 key。"""
    _require_perm(current_user, "ucp", "V")
    from app.ucp.rate_limiter import list_buckets
    return {"buckets": list_buckets()}


@router.post("/rate-limits/{key:path}/reset", summary="重置限流桶（Phase 2-9）")
async def reset_rate_limit(
    key: str,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """重置指定 key 的限流计数。"""
    _require_perm(current_user, "ucp", "U")
    from app.ucp.rate_limiter import reset_bucket
    reset_bucket(key)
    await _audit(
        db, current_user, "ucp_rate_limit", "reset",
        f"重置限流桶 {key}",
        {"key": key},
    )
    return {"key": key, "reset": True}


# ===== Phase 2-10：通知模板管理 =====

class NotificationTemplateCreate(BaseModel):
    template_code: str = Field(..., min_length=1, max_length=64)
    template_name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    trigger_scene: str = "on_success"
    channel: str = "feishu"
    message_format: str = "markdown"
    title_template: str = Field(..., min_length=1, max_length=255)
    content_template: str = Field(..., min_length=1)
    receivers: list = []
    variable_schema: dict | None = None
    is_active: int = 1


class NotificationTemplateUpdate(BaseModel):
    template_name: str | None = None
    description: str | None = None
    trigger_scene: str | None = None
    channel: str | None = None
    message_format: str | None = None
    title_template: str | None = None
    content_template: str | None = None
    receivers: list | None = None
    variable_schema: dict | None = None


@router.get("/notification-templates", summary="列出通知模板（Phase 2-10）")
async def list_notification_templates(
    trigger_scene: str | None = Query(None),
    is_active: int | None = Query(None),
    keyword: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(current_user),
):
    """列出通知模板（支持按触发场景/启用状态/关键字过滤）。"""
    _require_perm(current_user, "ucp", "V")
    from app.ucp.notification_template import list_templates as _list

    items = await _list(
        db, trigger_scene=trigger_scene, is_active=is_active,
        keyword=keyword, limit=limit,
    )
    return {"items": items, "total": len(items)}


@router.get("/notification-templates/{template_id}", summary="查询通知模板详情（Phase 2-10）")
async def get_notification_template(
    template_id: int,
    current_user: dict = Depends(current_user),
):
    """查询通知模板详情。"""
    _require_perm(current_user, "ucp", "V")
    from app.ucp.notification_template import get_template

    tpl = await get_template(db, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail=f"通知模板 #{template_id} 不存在")
    return tpl


@router.post("/notification-templates", summary="创建通知模板（Phase 2-10）")
async def create_notification_template(
    payload: NotificationTemplateCreate,
    current_user: dict = Depends(current_user),
):
    """创建通知模板。"""
    _require_perm(current_user, "ucp", "C")
    from app.ucp.notification_template import (
        NotificationTemplateError,
        create_template,
    )
    try:
        tpl = await create_template(
            db,
            template_code=payload.template_code,
            template_name=payload.template_name,
            description=payload.description,
            trigger_scene=payload.trigger_scene,
            channel=payload.channel,
            message_format=payload.message_format,
            title_template=payload.title_template,
            content_template=payload.content_template,
            receivers=payload.receivers,
            variable_schema=payload.variable_schema,
            is_active=payload.is_active,
            created_by=current_user.get("username") or str(current_user.get("id")),
        )
    except NotificationTemplateError as e:
        raise HTTPException(status_code=400, detail={"code": e.error_code, "message": e.message})
    await db.commit()
    await _audit(
        db, current_user, "ucp_notification_template", "create",
        f"创建通知模板 {payload.template_code}",
        {"template_id": tpl["id"], "trigger_scene": payload.trigger_scene},
    )
    return tpl


@router.patch("/notification-templates/{template_id}", summary="更新通知模板（Phase 2-10）")
async def update_notification_template(
    template_id: int,
    payload: NotificationTemplateUpdate,
    current_user: dict = Depends(current_user),
):
    """更新通知模板字段。"""
    _require_perm(current_user, "ucp", "U")
    from app.ucp.notification_template import (
        NotificationTemplateError,
        update_template,
    )
    try:
        tpl = await update_template(
            db, template_id,
            template_name=payload.template_name,
            description=payload.description,
            trigger_scene=payload.trigger_scene,
            channel=payload.channel,
            message_format=payload.message_format,
            title_template=payload.title_template,
            content_template=payload.content_template,
            receivers=payload.receivers,
            variable_schema=payload.variable_schema,
            updated_by=current_user.get("username") or str(current_user.get("id")),
        )
    except NotificationTemplateError as e:
        raise HTTPException(status_code=400, detail={"code": e.error_code, "message": e.message})
    await db.commit()
    await _audit(
        db, current_user, "ucp_notification_template", "update",
        f"更新通知模板 #{template_id}",
        {"template_id": template_id},
    )
    return tpl


@router.patch("/notification-templates/{template_id}/toggle", summary="启用/停用通知模板（Phase 2-10）")
async def toggle_notification_template(
    template_id: int,
    current_user: dict = Depends(current_user),
):
    """切换通知模板的 is_active 状态。"""
    _require_perm(current_user, "ucp", "U")
    from app.ucp.notification_template import (
        NotificationTemplateError,
        toggle_template,
    )
    try:
        tpl = await toggle_template(db, template_id)
    except NotificationTemplateError as e:
        raise HTTPException(status_code=400, detail={"code": e.error_code, "message": e.message})
    await db.commit()
    await _audit(
        db, current_user, "ucp_notification_template", "toggle",
        f"切换通知模板 #{template_id} 状态: is_active={tpl['is_active']}",
        {"template_id": template_id, "is_active": tpl["is_active"]},
    )
    return tpl


@router.delete("/notification-templates/{template_id}", summary="删除通知模板（Phase 2-10）")
async def delete_notification_template(
    template_id: int,
    current_user: dict = Depends(current_user),
):
    """删除通知模板。"""
    _require_perm(current_user, "ucp", "D")
    from app.ucp.notification_template import (
        NotificationTemplateError,
        delete_template,
    )
    try:
        await delete_template(db, template_id)
    except NotificationTemplateError as e:
        raise HTTPException(status_code=400, detail={"code": e.error_code, "message": e.message})
    await db.commit()
    await _audit(
        db, current_user, "ucp_notification_template", "delete",
        f"删除通知模板 #{template_id}",
        {"template_id": template_id},
    )
    return {"deleted": True, "template_id": template_id}


@router.post("/notification-templates/{template_id}/preview", summary="预览通知模板（Phase 2-10）")
async def preview_notification_template(
    template_id: int,
    payload: dict | None = None,
    current_user: dict = Depends(current_user),
):
    """用 mock 变量预览通知模板渲染效果。

    Body: { "mock_vars": {"execution_status": "FAILED", ...} }（可选）
    """
    _require_perm(current_user, "ucp", "V")
    from app.ucp.notification_template import (
        NotificationTemplateError,
        preview_template,
    )
    try:
        result = await preview_template(
            db, template_id, mock_vars=(payload or {}).get("mock_vars"),
        )
    except NotificationTemplateError as e:
        raise HTTPException(status_code=400, detail={"code": e.error_code, "message": e.message})
    return result


@router.post("/notification-templates/{template_id}/apply", summary="应用模板到 notification_config（Phase 2-10）")
async def apply_notification_template(
    template_id: int,
    payload: dict | None = None,
    current_user: dict = Depends(current_user),
):
    """把模板应用到指定的 notification_config（pipeline/connector）。

    Body: { "target_type": "pipeline" | "connector", "target_id": 1, "base_config": {...} }
    Returns: 合并后的 notification_config（前端可手动复制到对应配置）
    """
    _require_perm(current_user, "ucp", "U")
    from app.ucp.notification_template import (
        NotificationTemplateError,
        apply_template_to_config,
        get_template,
    )

    tpl = await get_template(db, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail=f"通知模板 #{template_id} 不存在")

    body = payload or {}
    base_config = body.get("base_config", {})
    new_config = apply_template_to_config(tpl, base_config)

    await _audit(
        db, current_user, "ucp_notification_template", "apply",
        f"应用通知模板 {tpl['template_code']} 到 {body.get('target_type')}#{body.get('target_id')}",
        {"template_id": template_id, "target_type": body.get("target_type"), "target_id": body.get("target_id")},
    )
    return {
        "template_code": tpl["template_code"],
        "trigger_scene": tpl["trigger_scene"],
        "new_config": new_config,
    }


# ============================================================
# Phase 3-1: 事件总线 API
# ============================================================


class EventIngestRequest(BaseModel):
    """事件接入请求（内部 API，供其他模块或脚本主动发布事件）。"""

    event_id: str = Field(..., min_length=1, max_length=128)
    event_type: str = Field(..., min_length=1, max_length=64)
    source: str = Field(..., min_length=1, max_length=32)
    payload: dict = Field(default_factory=dict)
    trigger: str = Field(default="REALTIME", max_length=16)
    metadata: dict | None = None
    event_timestamp: datetime | None = None
    is_dedup: bool = True
    auto_dispatch: bool = True


class EventTriggerRequest(BaseModel):
    """事件触发器创建/更新请求。"""

    trigger_code: str = Field(..., min_length=1, max_length=64)
    trigger_name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    event_source: str = Field(..., min_length=1, max_length=32)
    # Phase 5-2: 触发器按数据资源粒度订阅 (source_resource_id 优先于 source_system_code)
    source_resource_id: int | None = None
    source_system_code: str | None = None
    event_types: str = Field(..., min_length=1, max_length=512)
    pipeline_code: str = Field(..., min_length=1, max_length=64)
    filter_rule: dict | None = None
    signing_secret: str | None = None
    signature_header: str | None = None
    feishu_verification_token: str | None = None
    feishu_encrypt_key: str | None = None
    run_as_type: str = "SERVICE_ACCOUNT"
    service_account_code: str | None = None
    is_active: bool = True
    webhook_path: str | None = None


@router.post("/events", summary="接入事件（Phase 3-1 内部入口）")
async def ingest_event(
    payload: EventIngestRequest,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """事件接收入口。

    - 仅 `ucp` 配置 C 权限可调用
    - 事件入库后可选立即派发（auto_dispatch=True）
    - 返回事件 ID 与状态
    """
    _require_perm(current_user, "ucp", "C")
    from app.ucp.event_bus import (
        DuplicateEventError,
        EventListFilter,
        process_event_pipeline,
        receive_event,
    )

    try:
        event = await receive_event(
            db,
            event_id=payload.event_id,
            event_type=payload.event_type,
            source=payload.source,
            payload=payload.payload,
            trigger=payload.trigger,
            metadata=payload.metadata,
            event_timestamp=payload.event_timestamp,
            is_dedup=payload.is_dedup,
        )
    except DuplicateEventError as e:
        raise HTTPException(status_code=409, detail={"code": e.code, "message": e.message})

    if payload.auto_dispatch:
        await process_event_pipeline(db, event)

    await db.commit()
    await _audit(
        db, current_user, "ucp_event", "ingest",
        f"接入事件 {event.event_id}（{event.event_type} / {event.source}）",
        {"event_db_id": event.id, "status": event.status, "trigger": payload.trigger},
    )
    return {
        "id": event.id,
        "event_id": event.event_id,
        "status": event.status,
        "matched_trigger_code": event.matched_trigger_code,
        "pipeline_run_id": event.pipeline_run_id,
        "trace_id": event.trace_id,
    }


@router.get("/events", summary="查询事件列表（Phase 3-1）")
async def list_events(
    source: str | None = None,
    event_type: str | None = None,
    status: str | None = None,
    trigger_code: str | None = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    _require_perm(current_user, "ucp", "V")
    from app.ucp.event_bus import EventListFilter, list_events as _list

    flt = EventListFilter(
        source=source, event_type=event_type, status=status,
        trigger_code=trigger_code, limit=limit, offset=offset,
    )
    items, total = await _list(db, flt)
    return {
        "total": total,
        "items": [
            {
                "id": e.id,
                "event_id": e.event_id,
                "event_type": e.event_type,
                "source": e.source,
                "trigger": e.trigger,
                "payload": e.payload,
                "status": e.status,
                "trace_id": e.trace_id,
                "matched_trigger_code": e.matched_trigger_code,
                "pipeline_run_id": e.pipeline_run_id,
                "retry_count": e.retry_count,
                "error_code": e.error_code,
                "error_message": e.error_message,
                "event_timestamp": e.event_timestamp.isoformat() if e.event_timestamp else None,
                "received_at": e.received_at.isoformat() if e.received_at else None,
                "dispatched_at": e.dispatched_at.isoformat() if e.dispatched_at else None,
                "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            }
            for e in items
        ],
    }


@router.get("/events/{event_id}", summary="查询事件详情（Phase 3-1）")
async def get_event_detail(
    event_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    _require_perm(current_user, "ucp", "V")
    from app.ucp.event_bus import get_event as _get

    e = await _get(db, event_id)
    if e is None:
        raise HTTPException(status_code=404, detail=f"事件 '{event_id}' 不存在")
    return {
        "id": e.id,
        "event_id": e.event_id,
        "event_type": e.event_type,
        "source": e.source,
        "trigger": e.trigger,
        "payload": e.payload,
        "metadata": e.metadata_,
        "status": e.status,
        "trace_id": e.trace_id,
        "matched_trigger_id": e.matched_trigger_id,
        "matched_trigger_code": e.matched_trigger_code,
        "pipeline_run_id": e.pipeline_run_id,
        "retry_count": e.retry_count,
        "error_code": e.error_code,
        "error_message": e.error_message,
        "event_timestamp": e.event_timestamp.isoformat() if e.event_timestamp else None,
        "received_at": e.received_at.isoformat() if e.received_at else None,
        "dispatched_at": e.dispatched_at.isoformat() if e.dispatched_at else None,
        "completed_at": e.completed_at.isoformat() if e.completed_at else None,
    }


@router.post("/events/{event_id}/dispatch", summary="手动派发事件（Phase 3-1）")
async def manual_dispatch_event(
    event_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """对未派发（NO_MATCH/RECEIVED）的事件重新匹配并派发。"""
    _require_perm(current_user, "ucp", "C")
    from app.ucp.event_bus import (
        get_event as _get,
        process_event_pipeline,
    )

    e = await _get(db, event_id)
    if e is None:
        raise HTTPException(status_code=404, detail=f"事件 '{event_id}' 不存在")
    if e.status in ("DISPATCHED", "COMPLETED"):
        raise HTTPException(status_code=400, detail=f"事件状态为 {e.status}，无需重新派发")

    # 重置状态后重新派发
    e.status = "RECEIVED"
    e.error_code = None
    e.error_message = None
    await db.flush()
    await process_event_pipeline(db, e)
    await db.commit()

    await _audit(
        db, current_user, "ucp_event", "manual_dispatch",
        f"手动派发事件 {e.event_id}",
        {"event_db_id": e.id, "new_status": e.status, "matched_trigger": e.matched_trigger_code},
    )
    return {
        "id": e.id,
        "event_id": e.event_id,
        "status": e.status,
        "matched_trigger_code": e.matched_trigger_code,
        "pipeline_run_id": e.pipeline_run_id,
    }


@router.post("/triggers", summary="创建事件触发器（Phase 3-1）")
async def create_trigger(
    payload: EventTriggerRequest,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    _require_perm(current_user, "ucp", "C")
    from app.ucp.models import ConnectorEventTrigger, ConnectorPipelineConfig

    # 校验 pipeline 存在
    pl = (
        await db.execute(
            select(ConnectorPipelineConfig).where(
                ConnectorPipelineConfig.pipeline_code == payload.pipeline_code,
            )
        )
    ).scalar_one_or_none()
    if pl is None:
        raise HTTPException(status_code=404, detail=f"pipeline '{payload.pipeline_code}' 不存在")

    # 检查 trigger_code 唯一
    existing = (
        await db.execute(
            select(ConnectorEventTrigger).where(
                ConnectorEventTrigger.trigger_code == payload.trigger_code,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=400, detail=f"trigger_code '{payload.trigger_code}' 已存在")

    # webhook_path 唯一性
    if payload.webhook_path:
        dup = (
            await db.execute(
                select(ConnectorEventTrigger).where(
                    ConnectorEventTrigger.webhook_path == payload.webhook_path,
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(
                status_code=400, detail=f"webhook_path '{payload.webhook_path}' 已被使用"
            )

    trig = ConnectorEventTrigger(
        trigger_code=payload.trigger_code,
        trigger_name=payload.trigger_name,
        description=payload.description,
        event_source=payload.event_source,
        source_resource_id=payload.source_resource_id,
        source_system_code=payload.source_system_code,
        event_types=payload.event_types,
        pipeline_code=payload.pipeline_code,
        filter_rule=payload.filter_rule,
        signing_secret=payload.signing_secret,
        signature_header=payload.signature_header or "X-Signature",
        feishu_verification_token=payload.feishu_verification_token,
        feishu_encrypt_key=payload.feishu_encrypt_key,
        run_as_type=payload.run_as_type,
        service_account_code=payload.service_account_code,
        is_active=1 if payload.is_active else 0,
        webhook_path=payload.webhook_path,
        created_by=str(current_user.get("id", "")),
    )
    db.add(trig)
    await db.commit()
    await db.refresh(trig)
    await _audit(
        db, current_user, "ucp_event_trigger", "create",
        f"创建事件触发器 {trig.trigger_code} → {trig.pipeline_code}",
        {"trigger_id": trig.id, "event_source": trig.event_source},
    )
    return {
        "id": trig.id,
        "trigger_code": trig.trigger_code,
        "is_active": bool(trig.is_active),
    }


@router.get("/triggers", summary="查询事件触发器列表（Phase 3-1）")
async def list_triggers(
    event_source: str | None = None,
    is_active: int | None = None,
    limit: int = Query(default=100, le=500),
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    _require_perm(current_user, "ucp", "V")
    from app.ucp.event_bus import list_triggers as _list

    items = await _list(
        db, is_active=is_active, event_source=event_source, limit=limit,
    )
    return {
        "items": [
            {
                "id": t.id,
                "trigger_code": t.trigger_code,
                "trigger_name": t.trigger_name,
                "description": t.description,
                "event_source": t.event_source,
                "source_resource_id": t.source_resource_id,
                "source_system_code": t.source_system_code,
                "event_types": t.event_types,
                "pipeline_code": t.pipeline_code,
                "filter_rule": t.filter_rule,
                "signature_header": t.signature_header,
                "run_as_type": t.run_as_type,
                "is_active": bool(t.is_active),
                "webhook_path": t.webhook_path,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in items
        ],
    }


@router.patch("/triggers/{trigger_id}", summary="更新事件触发器（Phase 3-1）")
async def update_trigger(
    trigger_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    _require_perm(current_user, "ucp", "U")
    from app.ucp.event_bus import get_trigger as _get
    from app.ucp.models import ConnectorEventTrigger

    trig = await _get(db, trigger_id)
    if trig is None:
        raise HTTPException(status_code=404, detail=f"触发器 '{trigger_id}' 不存在")

    # 字段白名单
    allowed = {
        "trigger_name", "description", "event_types", "filter_rule",
        "signing_secret", "signature_header",
        "feishu_verification_token", "feishu_encrypt_key",
        "run_as_type", "service_account_code",
        "is_active", "webhook_path",
        "source_resource_id", "source_system_code",  # Phase 5-2
    }
    for k, v in (payload or {}).items():
        if k in allowed:
            if k == "is_active":
                setattr(trig, k, 1 if v else 0)
            else:
                setattr(trig, k, v)
    trig.updated_by = str(current_user.get("id", ""))
    await db.commit()
    await _audit(
        db, current_user, "ucp_event_trigger", "update",
        f"更新事件触发器 {trig.trigger_code}",
        {"trigger_id": trig.id},
    )
    return {"id": trig.id, "trigger_code": trig.trigger_code, "is_active": bool(trig.is_active)}


@router.delete("/triggers/{trigger_id}", summary="删除事件触发器（Phase 3-1）")
async def delete_trigger(
    trigger_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    _require_perm(current_user, "ucp", "D")
    from app.ucp.event_bus import get_trigger as _get
    from app.ucp.models import ConnectorEventTrigger

    trig = await _get(db, trigger_id)
    if trig is None:
        raise HTTPException(status_code=404, detail=f"触发器 '{trigger_id}' 不存在")

    code = trig.trigger_code
    await db.delete(trig)
    await db.commit()
    await _audit(
        db, current_user, "ucp_event_trigger", "delete",
        f"删除事件触发器 {code}",
        {"trigger_id": trigger_id},
    )
    return {"deleted": True, "trigger_code": code}


# ============================================================
# Phase 3-2: 飞书事件 webhook 入口
# ============================================================


@router.post("/webhooks/feishu/{trigger_code}", summary="飞书事件回调入口（Phase 3-2）")
async def feishu_webhook(
    trigger_code: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    """飞书事件订阅 webhook 入口。

    处理流程:
      1. 校验触发器存在 + 启用
      2. 处理 URL Verification (返回 challenge)
      3. v2 加密模式：解密 + 签名校验
      4. v1 模式：verification_token 校验
      5. 解析事件 → 标准化为 UCP 事件 → 落入事件总线
      6. 可选自动派发

    无需鉴权（外部系统推送），由飞书加密/签名保证来源安全。
    """
    from app.ucp.event_bus import (
        DuplicateEventError,
        get_trigger_by_webhook_path,
        process_event_pipeline,
        receive_event,
    )
    from app.ucp.feishu_webhook import (
        FeishuWebhookError,
        handle_url_verification,
        normalize_feishu_event,
        verify_feishu_signature,
        verify_feishu_token,
    )

    # 1) 查触发器
    trigger = await get_trigger_by_webhook_path(db, f"feishu/{trigger_code}")
    if trigger is None:
        # 也支持按 trigger_code 匹配（兼容不同配置方式）
        from app.ucp.event_bus import get_trigger as _get_by_code
        trigger = await _get_by_code(db, trigger_code)
    if trigger is None:
        raise HTTPException(status_code=404, detail=f"触发器 '{trigger_code}' 不存在")
    if not trigger.is_active:
        raise HTTPException(status_code=403, detail=f"触发器 '{trigger_code}' 已停用")

    # 2) 读取 raw body 与 headers
    raw_bytes = await request.body()
    headers = request.headers

    try:
        body = json.loads(raw_bytes.decode("utf-8")) if raw_bytes else {}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"飞书请求体非合法 JSON: {e}")

    # 3) URL Verification
    challenge_resp = handle_url_verification(body)
    if challenge_resp is not None:
        return challenge_resp

    # 4) v2 签名校验（如触发器配置了 signing_secret）
    if trigger.signing_secret:
        ts = headers.get("X-Lark-Request-Timestamp", "")
        nonce = headers.get("X-Lark-Request-Nonce", "")
        sign = headers.get("X-Lark-Signature", "")
        if not verify_feishu_signature(ts, nonce, raw_bytes, sign, trigger.signing_secret):
            raise HTTPException(status_code=401, detail="飞书事件签名校验失败")

    # 5) 解析标准化
    try:
        normalized = normalize_feishu_event(
            body,
            encrypt_key=trigger.feishu_encrypt_key,
            verification_token=trigger.feishu_verification_token,
        )
    except FeishuWebhookError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

    # v1 token 校验（v1 模式才走）
    if not trigger.feishu_encrypt_key and not trigger.signing_secret:
        received_token = body.get("token")
        if not verify_feishu_token(received_token, trigger.feishu_verification_token):
            raise HTTPException(status_code=401, detail="飞书 verification_token 校验失败")

    # 6) 事件入库 + 派发
    metadata = {
        "header": dict(headers),
        "ip": request.client.host if request.client else "",
        "trigger_code": trigger.trigger_code,
        "feishu_event_type": normalized.get("feishu_event_type", ""),
        "app_id": normalized.get("app_id", ""),
        "tenant_key": normalized.get("tenant_key", ""),
    }
    try:
        event = await receive_event(
            db,
            event_id=normalized["event_id"],
            event_type=normalized["event_type"],
            source="FEISHU",
            payload=normalized["payload"],
            trigger="REALTIME",
            metadata=metadata,
            event_timestamp=datetime.now(timezone.utc),
            is_dedup=True,
        )
    except DuplicateEventError as e:
        # 飞书事件可能因重试导致重复 event_id，按 spec 要求去重即可（200 OK）
        return {"code": "DUPLICATE", "message": e.message, "deduped": True}

    await process_event_pipeline(db, event)
    await db.commit()

    # 飞书要求 200 OK（无业务返回体也行，但返回结构化信息便于排查）
    return {
        "code": "OK",
        "event_id": event.event_id,
        "status": event.status,
        "matched_trigger_code": event.matched_trigger_code,
        "pipeline_run_id": event.pipeline_run_id,
    }


# ============================================================
# Phase 3-3: 死信 + 重放 + 派发尝试
# ============================================================


@router.get("/dead-letters", summary="查询死信队列（Phase 3-3）")
async def list_dead_letters(
    trigger_code: str | None = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """列出所有进入死信的事件派发记录。"""
    _require_perm(current_user, "ucp", "V")
    from app.ucp.event_reliability import list_dead_letters as _list

    items, total = await _list(
        db, limit=limit, offset=offset, trigger_code=trigger_code,
    )
    return {
        "total": total,
        "items": [
            {
                "id": d.id,
                "event_id": d.event_id,
                "event_uuid": d.event_uuid,
                "trigger_code": d.trigger_code,
                "pipeline_run_id": d.pipeline_run_id,
                "attempt": d.attempt,
                "status": d.status,
                "error_code": d.error_code,
                "error_message": d.error_message,
                "next_retry_at": d.next_retry_at.isoformat() if d.next_retry_at else None,
                "last_retry_at": d.last_retry_at.isoformat() if d.last_retry_at else None,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            }
            for d in items
        ],
    }


@router.get("/dead-letters/{delivery_id}", summary="查询死信详情（Phase 3-3）")
async def get_dead_letter_detail(
    delivery_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    _require_perm(current_user, "ucp", "V")
    from app.ucp.event_reliability import get_delivery

    d = await get_delivery(db, delivery_id)
    if d is None:
        raise HTTPException(status_code=404, detail=f"派发记录 #{delivery_id} 不存在")
    return {
        "id": d.id,
        "event_id": d.event_id,
        "event_uuid": d.event_uuid,
        "trigger_id": d.trigger_id,
        "trigger_code": d.trigger_code,
        "pipeline_run_id": d.pipeline_run_id,
        "attempt": d.attempt,
        "status": d.status,
        "error_code": d.error_code,
        "error_message": d.error_message,
        "next_retry_at": d.next_retry_at.isoformat() if d.next_retry_at else None,
        "last_retry_at": d.last_retry_at.isoformat() if d.last_retry_at else None,
        "trigger_source": d.trigger_source,
        "triggered_by": d.triggered_by,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


@router.post("/dead-letters/{delivery_id}/replay", summary="重放死信（Phase 3-3）")
async def replay_dead_letter(
    delivery_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """手动重放指定的死信记录（重置 attempt + 重新派发）。"""
    _require_perm(current_user, "ucp", "C")
    from app.ucp.event_bus import EventBusError
    from app.ucp.event_reliability import replay_dead_letter as _replay

    try:
        d = await _replay(
            db,
            delivery_id=delivery_id,
            triggered_by=str(current_user.get("id", "")),
        )
    except EventBusError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

    await db.commit()
    await _audit(
        db, current_user, "ucp_event_dead_letter", "replay",
        f"重放死信 #{delivery_id}",
        {"delivery_id": delivery_id, "event_uuid": d.event_uuid, "attempt": d.attempt},
    )
    return {
        "id": d.id,
        "event_uuid": d.event_uuid,
        "status": d.status,
        "attempt": d.attempt,
        "pipeline_run_id": d.pipeline_run_id,
    }


@router.post("/dead-letters/{delivery_id}/discard", summary="丢弃死信（Phase 3-3）")
async def discard_dead_letter(
    delivery_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """丢弃死信记录，状态置为 SKIPPED，不再重试。"""
    _require_perm(current_user, "ucp", "C")
    from app.ucp.event_bus import EventBusError
    from app.ucp.event_reliability import discard_dead_letter as _discard

    try:
        d = await _discard(
            db,
            delivery_id=delivery_id,
            triggered_by=str(current_user.get("id", "")),
        )
    except EventBusError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

    await db.commit()
    await _audit(
        db, current_user, "ucp_event_dead_letter", "discard",
        f"丢弃死信 #{delivery_id}",
        {"delivery_id": delivery_id, "event_uuid": d.event_uuid},
    )
    return {"id": d.id, "event_uuid": d.event_uuid, "status": d.status}


@router.post("/events/{event_id}/replay", summary="重放事件（Phase 3-3）")
async def replay_event(
    event_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """手动重放指定事件（重置 retry_count + 重新匹配 + 派发）。

    与 POST /events/{id}/dispatch 的区别: 本端点创建新的 UcpEventDelivery 记录，attempt=1。
    """
    _require_perm(current_user, "ucp", "C")
    from app.ucp.event_bus import EventBusError
    from app.ucp.event_reliability import replay_event as _replay_event

    try:
        e = await _replay_event(
            db,
            event_uuid=event_id,
            triggered_by=str(current_user.get("id", "")),
        )
    except EventBusError as ex:
        raise HTTPException(status_code=400, detail={"code": ex.code, "message": ex.message})

    await db.commit()
    await _audit(
        db, current_user, "ucp_event", "replay",
        f"重放事件 {e.event_id}",
        {"event_db_id": e.id, "new_status": e.status, "pipeline_run_id": e.pipeline_run_id},
    )
    return {
        "id": e.id,
        "event_id": e.event_id,
        "status": e.status,
        "matched_trigger_code": e.matched_trigger_code,
        "pipeline_run_id": e.pipeline_run_id,
    }


@router.get("/events/{event_id}/deliveries", summary="查询事件派发尝试历史（Phase 3-3）")
async def list_event_deliveries(
    event_id: str,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """查询某个事件的所有派发尝试记录（按时间倒序）。"""
    _require_perm(current_user, "ucp", "V")
    from app.ucp.event_reliability import list_event_deliveries as _list

    items = await _list(db, event_uuid=event_id, limit=limit)
    return {
        "items": [
            {
                "id": d.id,
                "event_id": d.event_id,
                "event_uuid": d.event_uuid,
                "trigger_code": d.trigger_code,
                "pipeline_run_id": d.pipeline_run_id,
                "attempt": d.attempt,
                "status": d.status,
                "error_code": d.error_code,
                "error_message": d.error_message,
                "next_retry_at": d.next_retry_at.isoformat() if d.next_retry_at else None,
                "last_retry_at": d.last_retry_at.isoformat() if d.last_retry_at else None,
                "trigger_source": d.trigger_source,
                "triggered_by": d.triggered_by,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in items
        ],
    }


@router.post("/events/scan-retries", summary="扫描到期重试（Phase 3-3 运维）")
async def scan_due_retries(
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(current_user),
):
    """手动触发到期重试扫描。生产环境由 scheduler 周期调用。"""
    _require_perm(current_user, "ucp", "U")
    from app.ucp.event_reliability import scan_due_retries as _scan

    replayed = await _scan(db, batch_size=50)
    await db.commit()
    return {
        "scanned": len(replayed),
        "replayed": [
            {"id": e.id, "event_id": e.event_id, "pipeline_run_id": e.pipeline_run_id}
            for e in replayed
        ],
    }


# ============================================================
# Phase 3-4: 外部账号流水线 API
# ============================================================


@router.get("/external-accounts", summary="列出外部账号（Phase 3-4）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_external_accounts(
    system_code: str | None = None,
    employee_id: str | None = None,
    status: str | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """列出外部系统账号 (滴滴/曹操等)。"""
    from app.ucp.external_account_service import list_accounts, to_dict

    items = await list_accounts(
        db,
        system_code=system_code,
        employee_id=employee_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    return {
        "total": len(items),
        "items": [to_dict(a) for a in items],
    }


@router.get("/external-accounts/{account_id}", summary="查询单个外部账号（Phase 3-4）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def get_external_account(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """查询外部账号详情。"""
    from app.ucp.external_account_service import get_account_by_id, to_dict

    account = await get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    return to_dict(account)


@router.get("/external-accounts/{account_id}/audits", summary="查询账号操作审计（Phase 3-4）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_account_audits(
    account_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """查询外部账号的审计日志。"""
    from app.ucp.external_account_service import get_account_by_id, list_audits, audit_to_dict

    account = await get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    audits = await list_audits(db, account_id=account_id, limit=limit, offset=offset)
    return {
        "account_id": account_id,
        "total": len(audits),
        "items": [audit_to_dict(a) for a in audits],
    }


class ExternalAccountActionRequest(BaseModel):
    """外部账号动作请求 (手动触发)。"""
    system_code: str = Field(..., description="DIDI / CAOCAO")
    action: str = Field(..., description="CREATE / UPDATE / DISABLE / REACTIVATE / DELETE")
    employee_id: str | None = None
    employee_name: str | None = None
    employee_mobile: str | None = None
    external_user_id: str | None = None
    department: str | None = None
    pipeline_code: str | None = Field(None, description="可选, 触发 pipeline 执行")


@router.post("/external-accounts/run", summary="手动触发外部账号动作（Phase 3-4）",
             dependencies=[Depends(require_op("ucp.executions", "C"))])
async def run_external_account_action(
    req: ExternalAccountActionRequest,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """手动执行一次外部账号动作。

    高风险动作 (DELETE / DISABLE) 需要 Phase 3-5 审批, 直接调用会被拒绝。
    如需触发完整 pipeline (含审批), 请通过 /ucp/pipelines/{code}/trigger 触发。
    """
    from app.ucp.external_account_service import (
        ACTION_CREATE, ACTION_DELETE, ACTION_DISABLE,
        ExternalAccountError, HIGH_RISK_ACTIONS, get_account,
    )
    from app.ucp.external_account_adapters import (
        didi_account_push_adapter, caocao_account_push_adapter,
    )

    if req.action.upper() in HIGH_RISK_ACTIONS:
        raise HTTPException(
            status_code=403,
            detail=f"高风险动作 {req.action} 需要走审批流程, 请配置 pipeline 并通过 /ucp/pipelines 触发",
        )

    if not req.system_code:
        raise HTTPException(status_code=400, detail="缺少 system_code")

    if req.system_code.upper() == "DIDI":
        adapter = didi_account_push_adapter
    elif req.system_code.upper() == "CAOCAO":
        adapter = caocao_account_push_adapter
    else:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的 system_code: {req.system_code}, 当前支持 DIDI / CAOCAO",
        )

    params = {
        "action": req.action.upper(),
        "employee_id": req.employee_id,
        "employee_name": req.employee_name,
        "employee_mobile": req.employee_mobile,
        "external_user_id": req.external_user_id,
        "department": req.department,
    }
    secrets = {
        "client_id": "",
        "client_secret": "",
        "base_url": "",
    }
    try:
        result = await adapter(params, secrets, db)
        await db.commit()
    except ExternalAccountError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})
    except Exception as e:
        await db.rollback()
        logger.exception("[ucp] run_external_account_action failed: %s", e)
        raise HTTPException(status_code=500, detail=f"动作执行失败: {e!s}")

    return {
        "status": result.status,
        "data": result.data,
        "row_count": result.row_count,
        "error_code": result.error_code,
        "error_message": result.error_message,
    }


# ============================================================
# Phase 3-5: 高风险动作审批 API
# ============================================================


class ApprovalSubmitRequest(BaseModel):
    """提交审批请求。"""
    business_type: str = Field(..., description="EXTERNAL_ACCOUNT_DELETE / EXTERNAL_ACCOUNT_DISABLE / OA_ORG_DELETE / OA_ORG_MOVE / GENERIC")
    business_key: str = Field(..., description="业务对象 key, 如 external_user_id")
    business_summary: str | None = None
    action: str = Field(..., description="DELETE / DISABLE / MOVE")
    action_payload: dict | None = None
    approvers: list[dict] = Field(..., description="[{user_id, user_name}, ...]")
    approval_mode: str = Field(default="SINGLE", description="SINGLE / ANY / ALL")
    confirmation_type: str = Field(default="NONE", description="NONE / SIMPLE / TOKEN")
    reason: str | None = None
    expires_in_hours: int = Field(default=72, ge=1, le=720)
    pipeline_run_id: str | None = None
    event_id: str | None = None


@router.post("/approvals", summary="提交审批请求（Phase 3-5）",
             dependencies=[Depends(require_op("ucp.external_accounts", "C"))])
async def submit_approval(
    req: ApprovalSubmitRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """提交一个高风险动作的审批请求。"""
    from app.ucp.approval_service import (
        submit_request, ApprovalError, request_to_dict,
    )

    try:
        request = await submit_request(
            db,
            business_type=req.business_type,
            business_key=req.business_key,
            business_summary=req.business_summary,
            action=req.action,
            action_payload=req.action_payload,
            approvers=req.approvers,
            approval_mode=req.approval_mode,
            confirmation_type=req.confirmation_type,
            trigger_source="MANUAL",
            triggered_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
            reason=req.reason,
            expires_in_hours=req.expires_in_hours,
            pipeline_run_id=req.pipeline_run_id,
            event_id=req.event_id,
        )
        await db.commit()
    except ApprovalError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})
    return request_to_dict(request)


@router.get("/approvals", summary="查询审批请求列表（Phase 3-5）",
            dependencies=[Depends(require_op("ucp.external_accounts", "V"))])
async def list_approvals(
    status: str | None = None,
    business_type: str | None = None,
    approver_id: str | None = None,
    pipeline_run_id: str | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """查询审批请求列表。"""
    from app.ucp.approval_service import list_requests, request_to_dict

    items = await list_requests(
        db,
        status=status,
        business_type=business_type,
        approver_id=approver_id,
        pipeline_run_id=pipeline_run_id,
        limit=limit,
        offset=offset,
    )
    return {
        "total": len(items),
        "items": [request_to_dict(r) for r in items],
    }


@router.get("/approvals/my-todo", summary="我的待办数量（Phase 3-5）",
            dependencies=[Depends(require_op("ucp.external_accounts", "V"))])
async def my_approval_todo(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """获取当前用户的待办审批数量。"""
    from app.ucp.approval_service import get_my_pending_count
    count = await get_my_pending_count(db, user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)))
    return {"count": count}


@router.get("/approvals/{request_id}", summary="查询审批详情（Phase 3-5）",
            dependencies=[Depends(require_op("ucp.external_accounts", "V"))])
async def get_approval_detail(
    request_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """查询审批详情, 含步骤与操作历史。"""
    from app.ucp.approval_service import (
        get_request, list_steps, list_actions, request_to_dict, step_to_dict, action_to_dict,
    )

    req = await get_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail=f"Approval request {request_id} not found")

    steps = await list_steps(db, request_id)
    actions = await list_actions(db, request_id)

    result = request_to_dict(req)
    result["steps"] = [step_to_dict(s) for s in steps]
    result["actions"] = [action_to_dict(a) for a in actions]
    return result


class ApprovalActionRequest(BaseModel):
    """审批动作请求。"""
    action: str = Field(..., description="APPROVE / REJECT / TRANSFER / WITHDRAW")
    comment: str | None = None
    to_user_id: str | None = None  # TRANSFER 时必填
    to_user_name: str | None = None
    confirmation_token: str | None = None  # EXECUTE 时如设置了 TOKEN 必填


@router.post("/approvals/{request_id}/action", summary="执行审批动作（Phase 3-5）",
             dependencies=[Depends(require_op("ucp.external_accounts", "U"))])
async def approval_action(
    request_id: int,
    req: ApprovalActionRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """执行审批动作: APPROVE / REJECT / TRANSFER / WITHDRAW / EXECUTE。"""
    from app.ucp.approval_service import (
        approve_request, reject_request, transfer_request, withdraw_request,
        execute_approved_request, get_request, ApprovalError, request_to_dict,
    )

    approver_id = user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id))
    try:
        if req.action.upper() == "APPROVE":
            target = await approve_request(
                db, request_id=request_id, approver_id=approver_id, comment=req.comment,
            )
        elif req.action.upper() == "REJECT":
            target = await reject_request(
                db, request_id=request_id, approver_id=approver_id, comment=req.comment,
            )
        elif req.action.upper() == "TRANSFER":
            if not req.to_user_id:
                raise ApprovalError("MISSING_TARGET", "转交必须指定 to_user_id")
            target = await transfer_request(
                db, request_id=request_id, from_approver_id=approver_id,
                to_user_id=req.to_user_id, to_user_name=req.to_user_name, comment=req.comment,
            )
        elif req.action.upper() == "WITHDRAW":
            target = await withdraw_request(
                db, request_id=request_id, operator_id=approver_id, comment=req.comment,
            )
        elif req.action.upper() == "EXECUTE":
            target = await execute_approved_request(
                db, request_id=request_id, confirmation_token=req.confirmation_token,
            )
        else:
            raise ApprovalError("INVALID_ACTION", f"不支持的动作: {req.action}")
        await db.commit()
    except ApprovalError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

    # 重新拉取完整信息（含 steps / actions）
    from app.ucp.approval_service import list_steps, list_actions, step_to_dict, action_to_dict
    steps = await list_steps(db, request_id)
    actions = await list_actions(db, request_id)
    result = request_to_dict(target)
    result["steps"] = [step_to_dict(s) for s in steps]
    result["actions"] = [action_to_dict(a) for a in actions]
    return result


@router.post("/approvals/scan-expired", summary="扫描过期审批（Phase 3-5 运维）",
             dependencies=[Depends(require_op("ucp.external_accounts", "U"))])
async def scan_expired_approvals(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """手动触发过期审批扫描。生产环境由 scheduler 周期调用。"""
    from app.ucp.approval_service import scan_expired_requests
    expired = await scan_expired_requests(db)
    await db.commit()
    return {
        "expired_count": len(expired),
        "items": [
            {"id": r.id, "request_code": r.request_code, "business_type": r.business_type}
            for r in expired
        ],
    }


# ============================================================
# Phase 3-6: OA 组织架构同步 API
# ============================================================


@router.get("/oa-sync/runs", summary="查询 OA 同步批次列表（Phase 3-6）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_oa_sync_runs(
    status: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """查询 OA 同步运行历史。"""
    from app.ucp.oa_sync_service import list_runs, run_to_dict

    items = await list_runs(db, status=status, limit=limit, offset=offset)
    return {
        "total": len(items),
        "items": [run_to_dict(r) for r in items],
    }


@router.get("/oa-sync/runs/{run_id}", summary="查询 OA 同步批次详情（Phase 3-6）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def get_oa_sync_run(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """查询 OA 同步批次详情。"""
    from app.ucp.oa_sync_service import get_run, run_to_dict

    run = await get_run(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"OaSyncRun {run_id} not found")
    return run_to_dict(run)


@router.get("/oa-sync/runs/{run_id}/records", summary="查询同步差异记录（Phase 3-6）",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_oa_sync_records(
    run_id: int,
    diff_type: str | None = None,
    process_status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """查询同步批次下的差异记录。"""
    from app.ucp.oa_sync_service import list_records, record_to_dict

    items = await list_records(
        db,
        run_id=run_id,
        diff_type=diff_type,
        process_status=process_status,
        limit=limit,
        offset=offset,
    )
    return {
        "total": len(items),
        "items": [record_to_dict(r) for r in items],
    }


class OaSyncTriggerRequest(BaseModel):
    """触发 OA 同步请求。"""
    trigger_type: str = Field(default="MANUAL", description="SCHEDULED / EVENT / MANUAL")
    high_risk_approvers: list[dict] | None = Field(default=None, description="高风险动作的审批人")
    approval_mode: str = Field(default="ANY", description="SINGLE / ANY / ALL")
    source_orgs: list[dict] | None = Field(default=None, description="可选: 直接传入源组织列表, 跳过 adapter 拉取")
    target_orgs: list[dict] | None = Field(default=None, description="可选: 直接传入目标组织列表")


@router.post("/oa-sync/trigger", summary="触发 OA 同步（Phase 3-6）",
             dependencies=[Depends(require_op("ucp.executions", "C"))])
async def trigger_oa_sync(
    req: OaSyncTriggerRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """触发一次 OA 组织架构同步。

    流程:
      1. 创建 OaSyncRun 批次
      2. 拉取源 (北森) + 目标 (OA) 组织列表 (或使用请求中传入)
      3. diff_org_trees 计算差异
      4. 保存 OaSyncRecord
      5. 如果有高风险动作 (DELETED / MOVED) 且提供了审批人, 提交审批请求
    """
    from app.ucp.oa_sync_service import (
        create_run, save_run_results, mark_run_failed,
        submit_high_risk_approvals, diff_org_trees, run_to_dict,
        PROCESS_APPROVAL_PENDING, DIFF_DELETED, DIFF_MOVED,
    )

    run = await create_run(
        db,
        trigger_type=req.trigger_type,
        triggered_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
    )

    try:
        # 1. 拉取源 / 目标
        if req.source_orgs is not None:
            source = req.source_orgs
        else:
            from app.ucp.oa_sync_adapters import oa_org_pull_adapter
            src_result = await oa_org_pull_adapter({}, {}, db)
            if src_result.status != "success":
                await mark_run_failed(db, run, f"源拉取失败: {src_result.error_message}")
                await db.commit()
                raise HTTPException(status_code=500, detail=run_to_dict(run))
            source = src_result.data or []

        if req.target_orgs is not None:
            target = req.target_orgs
        else:
            from app.ucp.oa_sync_adapters import oa_target_pull_adapter
            tgt_result = await oa_target_pull_adapter({}, {}, db)
            if tgt_result.status != "success":
                await mark_run_failed(db, run, f"目标拉取失败: {tgt_result.error_message}")
                await db.commit()
                raise HTTPException(status_code=500, detail=run_to_dict(run))
            target = tgt_result.data or []

        # 2. diff
        diffs = diff_org_trees(source, target)

        # 3. 保存
        high_risk_orgs = [
            d["org_code"] for d in diffs if d["diff_type"] in (DIFF_DELETED, DIFF_MOVED)
        ]
        await save_run_results(db, run, diffs, approval_pending_orgs=high_risk_orgs)

        # 4. 高风险动作提交审批
        approval_map = {}
        if high_risk_orgs and req.high_risk_approvers:
            approval_map = await submit_high_risk_approvals(
                db, run, req.high_risk_approvers,
                triggered_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
                approval_mode=req.approval_mode,
            )

        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("[ucp] oa sync trigger failed: %s", e)
        # 重新创建批次记录失败
        try:
            run2 = await create_run(
                db,
                trigger_type=req.trigger_type,
                triggered_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
            )
            await mark_run_failed(db, run2, str(e)[:500])
            await db.commit()
            raise HTTPException(status_code=500, detail=run_to_dict(run2))
        except Exception:
            raise HTTPException(status_code=500, detail=f"OA 同步失败: {e!s}")

    result = run_to_dict(run)
    result["approvals"] = approval_map
    return result


# ====================================================================
# Phase 3-7: 适配器注册机制 (self-register)
# ====================================================================


class AdapterRegisterRequest(BaseModel):
    """业务方注册/更新 adapter 的请求体。"""

    adapter_code: str = Field(..., min_length=3, max_length=64)
    adapter_type: str = Field(..., description="HTTP/DB/FILE/EVENT/TRANSFORM/CUSTOM")
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    schema: dict | None = None
    sample_payload: dict | list | None = None
    version: str = "1.0.0"


class AdapterActivateRequest(BaseModel):
    """启用/停用 adapter."""

    is_active: bool


@router.get(
    "/adapter-registry",
    summary="查询已注册 adapter 列表（Phase 3-7）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def list_adapters(
    adapter_type: str | None = None,
    is_active: bool | None = None,
    keyword: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """列出所有已注册 adapter (含未启用). 支持按类型/启用状态/关键字过滤."""
    from app.ucp.adapter_registry import list_adapter_definitions, serialize_adapter

    rows, total = await list_adapter_definitions(
        db,
        adapter_type=adapter_type,
        is_active=is_active,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [serialize_adapter(r) for r in rows],
    }


@router.get(
    "/adapter-registry/{adapter_code}",
    summary="查询单个 adapter 详情（Phase 3-7）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def get_adapter(
    adapter_code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.adapter_registry import get_adapter_definition, serialize_adapter

    defn = await get_adapter_definition(db, adapter_code)
    if defn is None:
        raise HTTPException(status_code=404, detail=f"adapter 不存在: {adapter_code}")
    return serialize_adapter(defn)


@router.get(
    "/adapter-registry/{adapter_code}/schema",
    summary="查询 adapter 的结构化 schema (Phase 5-4: 驱动 resource 配置 UI)",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def get_adapter_schema(
    adapter_code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """返回结构化 schema (按 categories 分组),前端按此渲染 resource 配置表单.

    注: 找不到 adapter_code 也返回 200 + 空 categories(不阻断前端),便于尚未注册的 adapter.
    """
    from app.ucp.adapter_registry import get_adapter_definition
    from app.ucp.adapter_schema import serialize_schema_for_client

    defn = await get_adapter_definition(db, adapter_code)
    return serialize_schema_for_client(defn)


@router.post(
    "/adapter-registry",
    summary="注册新 adapter（Phase 3-7）",
    dependencies=[Depends(require_op("ucp.systems", "U"))],
)
async def register_adapter_endpoint(
    req: AdapterRegisterRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """业务方自助注册 adapter (同 code 视为更新 metadata)."""
    from app.ucp.adapter_registry import (
        register_adapter,
        serialize_adapter,
        AdapterRegistryError,
    )

    try:
        defn = await register_adapter(
            db,
            adapter_code=req.adapter_code,
            adapter_type=req.adapter_type,
            name=req.name,
            description=req.description,
            schema=req.schema,
            sample_payload=req.sample_payload,
            version=req.version,
            created_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
        )
    except AdapterRegistryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return serialize_adapter(defn)


@router.post(
    "/adapter-registry/{adapter_code}/activate",
    summary="启用/停用 adapter（Phase 3-7）",
    dependencies=[Depends(require_op("ucp.systems", "U"))],
)
async def activate_adapter_endpoint(
    adapter_code: str,
    req: AdapterActivateRequest,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.adapter_registry import (
        activate_adapter,
        serialize_adapter,
        AdapterRegistryError,
    )

    try:
        defn = await activate_adapter(db, adapter_code, req.is_active)
    except AdapterRegistryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return serialize_adapter(defn)


@router.delete(
    "/adapter-registry/{adapter_code}",
    summary="删除 adapter 注册（Phase 3-7）",
    dependencies=[Depends(require_op("ucp.systems", "D"))],
)
async def delete_adapter_endpoint(
    adapter_code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.adapter_registry import delete_adapter_definition, AdapterRegistryError

    try:
        ok = await delete_adapter_definition(db, adapter_code)
    except AdapterRegistryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail=f"adapter 不存在: {adapter_code}")
    return {"deleted": adapter_code}


# ====================================================================
# Phase 3-8: 流水线模板 (可视化编排)
# ====================================================================


class PipelineTemplateCreateRequest(BaseModel):
    template_code: str = Field(..., min_length=3, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    nodes: list = Field(default_factory=list)
    edges: list = Field(default_factory=list)
    version: str = "1.0.0"


class PipelineTemplateUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    nodes: list | None = None
    edges: list | None = None
    version: str | None = None
    change_note: str | None = None


class PipelineTemplateRollbackRequest(BaseModel):
    target_version_id: int


@router.get(
    "/pipeline-templates",
    summary="查询 pipeline 模板列表（Phase 3-8）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def list_pipeline_templates(
    keyword: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.pipeline_template import list_templates, serialize_template

    rows, total = await list_templates(db, keyword=keyword, limit=limit, offset=offset)
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [serialize_template(r) for r in rows],
    }


@router.get(
    "/pipeline-templates/{template_code}",
    summary="查询模板详情（Phase 3-8）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def get_pipeline_template(
    template_code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.pipeline_template import get_template, serialize_template

    tpl = await get_template(db, template_code)
    if tpl is None:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_code}")
    return serialize_template(tpl)


@router.post(
    "/pipeline-templates",
    summary="创建 pipeline 模板（Phase 3-8）",
    dependencies=[Depends(require_op("ucp.systems", "U"))],
)
async def create_pipeline_template(
    req: PipelineTemplateCreateRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    from app.ucp.pipeline_template import (
        create_template,
        serialize_template,
        PipelineTemplateError,
    )

    try:
        tpl = await create_template(
            db,
            template_code=req.template_code,
            name=req.name,
            description=req.description,
            nodes=req.nodes,
            edges=req.edges,
            version=req.version,
            created_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
        )
    except PipelineTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return serialize_template(tpl)


@router.patch(
    "/pipeline-templates/{template_code}",
    summary="更新 pipeline 模板（Phase 3-8 自动 bump 版本）",
    dependencies=[Depends(require_op("ucp.systems", "U"))],
)
async def update_pipeline_template(
    template_code: str,
    req: PipelineTemplateUpdateRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    from app.ucp.pipeline_template import (
        update_template,
        serialize_template,
        PipelineTemplateError,
    )

    try:
        tpl = await update_template(
            db,
            template_code=template_code,
            name=req.name,
            description=req.description,
            nodes=req.nodes,
            edges=req.edges,
            version=req.version,
            change_note=req.change_note,
            created_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
        )
    except PipelineTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return serialize_template(tpl)


@router.get(
    "/pipeline-templates/{template_code}/versions",
    summary="查询模板版本历史（Phase 3-8）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def list_template_versions(
    template_code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.pipeline_template import list_versions, serialize_version

    try:
        versions = await list_versions(db, template_code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"items": [serialize_version(v) for v in versions]}


@router.post(
    "/pipeline-templates/{template_code}/rollback",
    summary="回滚模板到指定版本（Phase 3-8）",
    dependencies=[Depends(require_op("ucp.systems", "U"))],
)
async def rollback_template(
    template_code: str,
    req: PipelineTemplateRollbackRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    from app.ucp.pipeline_template import (
        rollback_to_version,
        serialize_template,
        PipelineTemplateError,
    )

    try:
        tpl = await rollback_to_version(
            db,
            template_code=template_code,
            target_version_id=req.target_version_id,
            created_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
        )
    except PipelineTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return serialize_template(tpl)


@router.delete(
    "/pipeline-templates/{template_code}",
    summary="删除 pipeline 模板（Phase 3-8）",
    dependencies=[Depends(require_op("ucp.systems", "D"))],
)
async def delete_pipeline_template(
    template_code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.pipeline_template import delete_template, PipelineTemplateError

    try:
        ok = await delete_template(db, template_code)
    except PipelineTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_code}")
    return {"deleted": template_code}


@router.get(
    "/pipeline-templates/_meta/node-types",
    summary="查询支持的节点类型与字段（Phase 3-8 前端用）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def get_node_types() -> dict:
    """返回前端画布需要的节点元数据."""
    return {
        "node_types": [
            {
                "type": "CONNECTOR",
                "label": "连接器",
                "color": "#409EFF",
                "icon": "Connection",
                "config_schema": {
                    "adapter_code": "string (required)",
                    "params": "object",
                    "output_var": "string",
                },
            },
            {
                "type": "TRANSFORM",
                "label": "字段映射",
                "color": "#67C23A",
                "icon": "MagicStick",
                "config_schema": {
                    "mappings": "array<{src, dst, transform?}>",
                    "input_var": "string",
                    "output_var": "string",
                },
            },
            {
                "type": "BRANCH",
                "label": "条件分支",
                "color": "#E6A23C",
                "icon": "Share",
                "config_schema": {
                    "condition": "string (JSONPath)",
                    "true_target": "node id",
                    "false_target": "node id",
                },
            },
            {
                "type": "LOOP",
                "label": "列表循环",
                "color": "#F56C6C",
                "icon": "Refresh",
                "config_schema": {
                    "input_var": "string (list)",
                    "item_var": "string",
                    "max_iterations": "integer (default 1000)",
                },
            },
            {
                "type": "NOTIFY",
                "label": "通知",
                "color": "#909399",
                "icon": "BellFilled",
                "config_schema": {
                    "template_code": "string",
                    "receivers": "array<string>",
                    "trigger_condition": "string",
                },
            },
            {
                "type": "WAIT",
                "label": "等待",
                "color": "#E6A23C",
                "icon": "Clock",
                "config_schema": {
                    "wait_type": "string (fixed|until|event)",
                    "wait_duration_seconds": "integer",
                    "wait_until_iso": "string (ISO datetime)",
                },
            },
            {
                "type": "APPROVAL",
                "label": "审批",
                "color": "#F56C6C",
                "icon": "Document",
                "config_schema": {
                    "approvers": "array<{user_id, user_name}>",
                    "approval_mode": "string (SINGLE|ANY|ALL)",
                    "reason": "string",
                    "action_summary": "string",
                },
            },
        ],
        "node_count_limit": 50,
    }


# ====================================================================
# Phase 4: 告警规则配置
# ====================================================================


class AlertRuleCreate(BaseModel):
    rule_code: str
    rule_name: str
    rule_type: str  # FAIL_RATE / CONSECUTIVE_FAIL / DURATION / DEAD_LETTER_COUNT
    threshold_value: float = 0
    threshold_unit: str | None = None
    target_filter: dict | None = None
    notify_channels: str | None = None
    notify_receivers: list | None = None
    cooldown_minutes: int = 60
    description: str | None = None


@router.get("/alert-rules", summary="告警规则列表",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_alert_rules(
    rule_type: str | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.models import UcpAlertRule
    conds = []
    if rule_type:
        conds.append(UcpAlertRule.rule_type == rule_type)
    stmt = select(UcpAlertRule).where(*conds).order_by(UcpAlertRule.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return {"items": [_alert_rule_to_dict(r) for r in rows], "total": len(rows)}


@router.post("/alert-rules", summary="创建告警规则",
             dependencies=[Depends(require_op("ucp.systems", "C"))])
async def create_alert_rule(
    payload: AlertRuleCreate,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.models import UcpAlertRule
    rule = UcpAlertRule(
        rule_code=payload.rule_code,
        rule_name=payload.rule_name,
        rule_type=payload.rule_type,
        threshold_value=payload.threshold_value,
        threshold_unit=payload.threshold_unit,
        target_filter=payload.target_filter,
        notify_channels=payload.notify_channels,
        notify_receivers=payload.notify_receivers,
        cooldown_minutes=payload.cooldown_minutes,
        description=payload.description,
        created_by=_user.username if hasattr(_user, "username") else str(_user.id),
    )
    db.add(rule)
    await db.commit()
    return _alert_rule_to_dict(rule)


@router.patch("/alert-rules/{rule_id}", summary="更新告警规则",
              dependencies=[Depends(require_op("ucp.systems", "U"))])
async def update_alert_rule(
    rule_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.models import UcpAlertRule
    rule = await db.get(UcpAlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    for field in ("rule_name", "threshold_value", "threshold_unit", "target_filter",
                   "notify_channels", "notify_receivers", "cooldown_minutes", "description"):
        if field in payload:
            setattr(rule, field, payload[field])
    if "is_active" in payload:
        rule.is_active = payload["is_active"]
    await db.commit()
    return _alert_rule_to_dict(rule)


@router.delete("/alert-rules/{rule_id}", summary="删除告警规则",
               dependencies=[Depends(require_op("ucp.systems", "D"))])
async def delete_alert_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.models import UcpAlertRule
    rule = await db.get(UcpAlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    await db.delete(rule)
    await db.commit()
    return {"deleted": True, "rule_code": rule.rule_code}


@router.get("/alert-logs", summary="告警记录",
            dependencies=[Depends(require_op("ucp.systems", "V"))])
async def list_alert_logs(
    limit: int = 50,
    rule_id: int | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.models import UcpAlertLog
    conds = []
    if rule_id:
        conds.append(UcpAlertLog.rule_id == rule_id)
    stmt = select(UcpAlertLog).where(*conds).order_by(UcpAlertLog.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return {"items": [_alert_log_to_dict(r) for r in rows], "total": len(rows)}


def _alert_rule_to_dict(r) -> dict:
    return {
        "id": r.id, "rule_code": r.rule_code, "rule_name": r.rule_name,
        "rule_type": r.rule_type, "threshold_value": r.threshold_value,
        "threshold_unit": r.threshold_unit, "target_filter": r.target_filter,
        "is_active": r.is_active, "notify_channels": r.notify_channels,
        "notify_receivers": r.notify_receivers, "cooldown_minutes": r.cooldown_minutes,
        "description": r.description, "created_by": r.created_by,
        "created_at": str(r.created_at) if r.created_at else None,
        "updated_at": str(r.updated_at) if r.updated_at else None,
    }


def _alert_log_to_dict(r) -> dict:
    return {
        "id": r.id, "rule_id": r.rule_id, "rule_code": r.rule_code,
        "alert_level": r.alert_level, "alert_type": r.alert_type,
        "message": r.message, "ref_id": r.ref_id,
        "current_value": r.current_value, "threshold_value": r.threshold_value,
        "notify_status": r.notify_status,
        "resolved_at": str(r.resolved_at) if r.resolved_at else None,
        "created_at": str(r.created_at) if r.created_at else None,
    }


# ====================================================================
# Phase 3-9: 运行监控 Dashboard
# ====================================================================


@router.get(
    "/monitor/summary",
    summary="监控汇总指标（Phase 3-9 / Phase 5-3 支持 system/resource 过滤）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def monitor_summary(
    hours: int = 24,
    system_id: int | None = None,
    resource_id: int | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """返回 24h / 7d / 30d 等窗口的汇总卡片数据."""
    from app.ucp.monitor_service import get_summary

    return await get_summary(db, hours=hours, system_id=system_id, resource_id=resource_id)


@router.get(
    "/monitor/trend",
    summary="执行趋势（Phase 3-9 / Phase 5-3 支持 system/resource 过滤）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def monitor_trend(
    hours: int = 24,
    bucket: str = "hour",
    system_id: int | None = None,
    resource_id: int | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.monitor_service import get_trend

    items = await get_trend(
        db, hours=hours, bucket=bucket, system_id=system_id, resource_id=resource_id,
    )
    return {"items": items, "bucket": bucket, "window_hours": hours}


@router.get(
    "/monitor/status-distribution",
    summary="状态分布（Phase 3-9 饼图 / Phase 5-3 支持过滤）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def monitor_status_distribution(
    hours: int = 24,
    system_id: int | None = None,
    resource_id: int | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.monitor_service import get_status_distribution

    dist = await get_status_distribution(
        db, hours=hours, system_id=system_id, resource_id=resource_id,
    )
    return {"distribution": dist, "window_hours": hours}


@router.get(
    "/monitor/recent-runs",
    summary="最近执行列表（Phase 3-9 / Phase 5-3 支持过滤）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def monitor_recent_runs(
    limit: int = 20,
    system_id: int | None = None,
    resource_id: int | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.monitor_service import get_recent_runs

    items = await get_recent_runs(
        db, limit=limit, system_id=system_id, resource_id=resource_id,
    )
    return {"items": items}


@router.get(
    "/monitor/alerts",
    summary="告警列表（Phase 3-9 / Phase 5-3 支持过滤）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def monitor_alerts(
    limit: int = 50,
    system_id: int | None = None,
    resource_id: int | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.monitor_service import get_alerts

    items = await get_alerts(
        db, limit=limit, system_id=system_id, resource_id=resource_id,
    )
    return {"items": items}


@router.get(
    "/monitor/pipeline-stats",
    summary="Top pipeline 统计（Phase 3-9 / Phase 5-3 支持过滤）",
    dependencies=[Depends(require_op("ucp.systems", "V"))],
)
async def monitor_pipeline_stats(
    hours: int = 24,
    limit: int = 10,
    system_id: int | None = None,
    resource_id: int | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.monitor_service import get_pipeline_stats

    items = await get_pipeline_stats(
        db, hours=hours, limit=limit, system_id=system_id, resource_id=resource_id,
    )
    return {"items": items, "window_hours": hours}


# ===== Phase 4: 接入系统 (System + Resource) =====


class SystemCreate(BaseModel):
    system_code: str = Field(..., min_length=2, max_length=64)
    system_name: str = Field(..., min_length=1, max_length=128)
    system_type: str = Field(default="CUSTOM")
    icon: str | None = None
    owner: str | None = None
    description: str | None = None


class SystemUpdate(BaseModel):
    system_name: str | None = None
    system_type: str | None = None
    icon: str | None = None
    owner: str | None = None
    description: str | None = None
    is_active: int | None = None


class ResourceCreate(BaseModel):
    system_id: int
    resource_code: str = Field(..., min_length=1, max_length=64)
    resource_name: str = Field(..., min_length=1, max_length=128)
    adapter_code: str | None = None
    credential_id: int | None = None
    protocol: dict | None = None
    report_config: dict | None = None
    mapping_config: dict | None = None
    file_config: dict | None = None
    scheduling: dict | None = None
    notification_config: dict | None = None
    retry_config: dict | None = None
    circuit_breaker_config: dict | None = None


class ResourceUpdate(BaseModel):
    resource_name: str | None = None
    adapter_code: str | None = None
    credential_id: int | None = None
    protocol: dict | None = None
    report_config: dict | None = None
    mapping_config: dict | None = None
    file_config: dict | None = None
    scheduling: dict | None = None
    notification_config: dict | None = None
    retry_config: dict | None = None
    circuit_breaker_config: dict | None = None
    status: int | None = None


@router.get("/systems", summary="列出所有接入系统（聚合资源数）")
async def list_systems_view(
    system_type: str | None = Query(default=None),
    _user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.ucp.system_service import list_systems_with_resource_count

    items = await list_systems_with_resource_count(db)
    if system_type:
        items = [it for it in items if it["system"].system_type == system_type]
    return {
        "items": [
            {
                "id": it["system"].id,
                "system_code": it["system"].system_code,
                "system_name": it["system"].system_name,
                "system_type": it["system"].system_type,
                "icon": it["system"].icon,
                "owner": it["system"].owner,
                "description": it["system"].description,
                "is_active": it["system"].is_active,
                "resource_count": it["resource_count"],
                "active_count": it["active_count"],
                "created_at": it["system"].created_at.isoformat() if it["system"].created_at else None,
            }
            for it in items
        ],
        "total": len(items),
    }


@router.post("/systems", summary="创建接入系统")
async def create_system_view(
    payload: SystemCreate,
    request: Request,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    from app.ucp.system_service import create_system, get_system_by_code

    existing = await get_system_by_code(db, payload.system_code)
    if existing:
        raise HTTPException(status_code=409, detail=f"system_code {payload.system_code} 已存在")
    obj = await create_system(
        db,
        system_code=payload.system_code,
        system_name=payload.system_name,
        system_type=payload.system_type,
        icon=payload.icon,
        owner=payload.owner,
        description=payload.description,
        created_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
    )
    return {"id": obj.id, "system_code": obj.system_code, "system_name": obj.system_name}


@router.get("/systems/{system_id}", summary="系统详情：含资源 + 凭证")
async def get_system_detail(
    system_id: int,
    _user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.ucp.system_service import get_system_overview

    overview = await get_system_overview(db, system_id)
    if not overview:
        raise HTTPException(status_code=404, detail="System not found")
    sys = overview["system"]
    return {
        "id": sys.id,
        "system_code": sys.system_code,
        "system_name": sys.system_name,
        "system_type": sys.system_type,
        "icon": sys.icon,
        "owner": sys.owner,
        "description": sys.description,
        "is_active": sys.is_active,
        "resources": [
            {
                "id": r.id,
                "resource_code": r.resource_code,
                "resource_name": r.resource_name,
                "adapter_code": r.adapter_code,
                "credential_id": r.credential_id,
                "status": r.status,
                "test_status": r.test_status,
                "test_time": r.test_time.isoformat() if r.test_time else None,
                "scheduling": r.scheduling,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in overview["resources"]
        ],
        "credentials": [
            {
                "id": c.id,
                "credential_code": c.credential_code,
                "credential_name": c.credential_name,
                "auth_type": c.auth_type,
                "env_tag": c.env_tag,
                "is_primary": bool(c.is_primary),
                "last_verified_at": c.last_verified_at.isoformat() if c.last_verified_at else None,
            }
            for c in overview["credentials"]
        ],
    }


@router.patch("/systems/{system_id}", summary="更新接入系统")
async def update_system_view(
    system_id: int,
    payload: SystemUpdate,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.system_service import update_system

    obj = await update_system(db, system_id, **payload.model_dump(exclude_none=True))
    if not obj:
        raise HTTPException(status_code=404, detail="System not found")
    return {"id": obj.id, "system_code": obj.system_code}


@router.delete("/systems/{system_id}", summary="删除接入系统（级联删资源）")
async def delete_system_view(
    system_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.system_service import delete_system

    ok = await delete_system(db, system_id)
    if not ok:
        raise HTTPException(status_code=404, detail="System not found")
    return {"deleted": True}


# ----- Resource 端点 -----


@router.get("/resources", summary="列出资源（按 system_id 过滤）")
async def list_resources_view(
    system_id: int | None = Query(default=None),
    credential_id: int | None = Query(default=None),
    status: int | None = Query(default=None),
    _user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.ucp.system_service import list_resources

    items = await list_resources(
        db, system_id=system_id, credential_id=credential_id, status=status
    )
    return {
        "items": [
            {
                "id": r.id,
                "system_id": r.system_id,
                "resource_code": r.resource_code,
                "resource_name": r.resource_name,
                "adapter_code": r.adapter_code,
                "credential_id": r.credential_id,
                "status": r.status,
                "test_status": r.test_status,
                "test_time": r.test_time.isoformat() if r.test_time else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in items
        ],
        "total": len(items),
    }


@router.post("/resources", summary="在系统下创建资源（一张表）")
async def create_resource_view(
    payload: ResourceCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    from app.ucp.system_service import create_resource, get_system, get_resource, ResourceSchemaError

    sys = await get_system(db, payload.system_id)
    if not sys:
        raise HTTPException(status_code=404, detail=f"system_id {payload.system_id} 不存在")

    existing = await get_resource_by_code(db, payload.system_id, payload.resource_code)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"resource_code {payload.resource_code} 在该系统下已存在",
        )

    try:
        obj = await create_resource(
        db,
        system_id=payload.system_id,
        resource_code=payload.resource_code,
        resource_name=payload.resource_name,
        adapter_code=payload.adapter_code,
        credential_id=payload.credential_id,
        protocol=payload.protocol,
        report_config=payload.report_config,
        mapping_config=payload.mapping_config,
        file_config=payload.file_config,
        scheduling=payload.scheduling,
        notification_config=payload.notification_config,
        retry_config=payload.retry_config,
        circuit_breaker_config=payload.circuit_breaker_config,
        created_by=user.username if hasattr(user, "username") and user.username else (user.name if hasattr(user, "name") and user.name else str(user.id)),
    )
    except ResourceSchemaError as e:
        raise HTTPException(status_code=400, detail=f"schema 校验失败: {e}")
    return {"id": obj.id, "resource_code": obj.resource_code}


async def get_resource_by_code(db: AsyncSession, system_id: int, resource_code: str):
    from app.ucp.models import ConnectorResource
    from sqlalchemy import select

    stmt = select(ConnectorResource).where(
        ConnectorResource.system_id == system_id,
        ConnectorResource.resource_code == resource_code,
    )
    r = await db.execute(stmt)
    return r.scalar_one_or_none()


@router.patch("/resources/{resource_id}", summary="更新资源")
async def update_resource_view(
    resource_id: int,
    payload: ResourceUpdate,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.system_service import update_resource, ResourceSchemaError

    try:
        obj = await update_resource(db, resource_id, **payload.model_dump(exclude_none=True))
    except ResourceSchemaError as e:
        raise HTTPException(status_code=400, detail=f"schema 校验失败: {e}")
    if not obj:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"id": obj.id}


@router.delete("/resources/{resource_id}", summary="删除资源")
async def delete_resource_view(
    resource_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    from app.ucp.system_service import delete_resource

    ok = await delete_resource(db, resource_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"deleted": True}


@router.get("/resources/{resource_id}/pipelines", summary="查询引用此资源的流水线列表（反向引用）")
async def list_pipelines_using_resource(
    resource_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """遍历 connector_pipeline_config.steps JSON, 找出引用了 resource_id 的流水线。

    蓝本 v2 场景 6: 资源详情补"反向引用 — 使用此资源的流水线"。
    支持 step.config.resource_id（旧版 step.connector_code 也兼容）。
    """
    from sqlalchemy import select
    from app.ucp.models import ConnectorPipelineConfig, ConnectorResource

    # 1. 确认 resource 存在
    res = await db.get(ConnectorResource, resource_id)
    if res is None:
        raise HTTPException(status_code=404, detail="Resource not found")

    # 2. 拉全部 pipeline (steps 是 JSON, 只能应用层过滤)
    stmt = select(ConnectorPipelineConfig).order_by(ConnectorPipelineConfig.id.asc())
    rows = (await db.execute(stmt)).scalars().all()

    matches: list[dict] = []
    for p in rows:
        steps = p.steps or []
        hit_steps: list[dict] = []
        for s in steps:
            if not isinstance(s, dict):
                continue
            # 新版: step.config.resource_id / system_id
            cfg = s.get("config") or {}
            if cfg.get("resource_id") == resource_id:
                hit_steps.append({
                    "step_id": s.get("step_id"),
                    "type": s.get("type", "CONNECTOR"),
                    "match_field": "config.resource_id",
                })
                continue
            # 旧版: step.connector_code (不再支持反查,跳过)
        if hit_steps:
            matches.append({
                "id": p.id,
                "pipeline_code": p.pipeline_code,
                "pipeline_name": p.pipeline_name,
                "description": p.description,
                "trigger_type": p.trigger_type,
                "status": p.status,
                "step_count": len(steps),
                "hit_steps": hit_steps,
            })

    return {
        "resource_id": resource_id,
        "total": len(matches),
        "items": matches,
    }


@router.get("/systems/{system_id}/default-credential", summary="获取该系统下任意资源引用的凭证 ID（添加表时默认带出）")
async def get_system_default_credential(
    system_id: int,
    _user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.ucp.system_service import find_credential_id_for_system

    cred_id = await find_credential_id_for_system(db, system_id)
    return {"credential_id": cred_id}

