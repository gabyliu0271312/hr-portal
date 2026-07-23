"""UCP 系统/资源/凭证/流水线 路由"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
from app.ucp.models import UcpPipelineTemplate
from app.ucp.system_service import (
    list_systems,
    get_system,
    create_system,
    update_system,
    delete_system,
    list_resources,
    get_resource,
    create_resource,
    update_resource,
    delete_resource,
    get_system_overview,
    get_systems_overview,
    find_credential_id_for_system,
)
from app.ucp.config_service import (
    list_pipelines,
    get_pipeline_by_id,
    upsert_pipeline,
    update_pipeline_fields,
    toggle_pipeline,
    delete_pipeline,
)
from app.ucp.credential_service import (
    create_credential,
    update_credential,
    toggle_credential,
    list_credentials,
    decrypt_credential_secrets,
)
from app.ucp.datasource_bridge import list_bridge_targets
from app.ucp.push_bridge import list_bridge_push_targets
from app.ucp.bitable_table_service import (
    BitableTableConfigError,
    create_bitable_table,
    delete_bitable_table,
    get_bitable_resource,
    get_bitable_table,
    list_bitable_tables,
    serialize_bitable_table,
    table_params,
    update_bitable_table,
)
from app.ucp.adapters import get_adapter

logger = logging.getLogger("ucp.routers.systems")
router = APIRouter()


# ── Systems ──

@router.get("/systems")
async def route_list_systems(
    system_type: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.systems", "V")),
):
    items = await list_systems(db, system_type=system_type)
    return {"total": len(items), "items": items}


@router.post("/systems")
async def route_create_system(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.systems", "C")),
):
    obj = await create_system(
        db,
        system_code=payload["system_code"],
        system_name=payload["system_name"],
        system_type=payload.get("system_type", "CUSTOM"),
        icon=payload.get("icon"),
        owner=payload.get("owner"),
        description=payload.get("description"),
        created_by=user.login_name,
    )
    return {"id": obj.id, "system_code": obj.system_code, "system_name": obj.system_name}


@router.get("/systems/overview")
async def route_systems_overview(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.systems", "V")),
):
    items = await get_systems_overview(db)
    return {"total": len(items), "items": items}


@router.get("/systems/{system_id}")
async def route_get_system(
    system_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.systems", "V")),
):
    overview = await get_system_overview(db, system_id)
    if not overview:
        raise HTTPException(404, "系统不存在")
    return overview


@router.patch("/systems/{system_id}")
async def route_update_system(
    system_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.systems", "U")),
):
    obj = await update_system(db, system_id, **payload)
    if not obj:
        raise HTTPException(404, "系统不存在")
    return {"id": obj.id, "system_code": obj.system_code}


@router.delete("/systems/{system_id}")
async def route_delete_system(
    system_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.systems", "D")),
):
    ok = await delete_system(db, system_id)
    if not ok:
        raise HTTPException(404, "系统不存在")
    return {"deleted": True}


@router.get("/systems/{system_id}/default-credential")
async def route_system_default_credential(
    system_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.systems", "V")),
):
    cred_id = await find_credential_id_for_system(db, system_id)
    return {"credential_id": cred_id}


# ── Resources ──

@router.get("/resources")
async def route_list_resources(
    system_id: int | None = Query(None),
    credential_id: int | None = Query(None),
    status: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.resources", "V")),
):
    items = await list_resources(db, system_id=system_id, credential_id=credential_id, status=status)
    return {"total": len(items), "items": items}


@router.post("/resources")
async def route_create_resource(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.resources", "C")),
):
    obj = await create_resource(
        db,
        system_id=payload["system_id"],
        resource_code=payload["resource_code"],
        resource_name=payload["resource_name"],
        adapter_code=payload.get("adapter_code"),
        credential_id=payload.get("credential_id"),
        protocol=payload.get("protocol"),
        report_config=payload.get("report_config"),
        mapping_config=payload.get("mapping_config"),
        file_config=payload.get("file_config"),
        scheduling=payload.get("scheduling"),
        notification_config=payload.get("notification_config"),
        retry_config=payload.get("retry_config"),
        circuit_breaker_config=payload.get("circuit_breaker_config"),
        created_by=user.login_name,
    )
    return {"id": obj.id, "resource_code": obj.resource_code}


@router.patch("/resources/{resource_id}")
async def route_update_resource(
    resource_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.resources", "U")),
):
    obj = await update_resource(db, resource_id, **payload)
    if not obj:
        raise HTTPException(404, "资源不存在")
    return {"id": obj.id}


@router.delete("/resources/{resource_id}")
async def route_delete_resource(
    resource_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.resources", "D")),
):
    ok = await delete_resource(db, resource_id)
    if not ok:
        raise HTTPException(404, "资源不存在")
    return {"deleted": True}


@router.get("/resources/{resource_id}/pipelines")
async def route_resource_pipelines(
    resource_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.resources", "V")),
):
    res = await get_resource(db, resource_id)
    if not res:
        raise HTTPException(404, "资源不存在")

    tpls = (await db.execute(select(UcpPipelineTemplate))).scalars().all()
    items: list[dict] = []
    for tpl in tpls:
        nodes = tpl.nodes_json or []
        hit_steps: list[dict] = []
        for n in nodes:
            cfg = n.get("config") if isinstance(n, dict) else {}
            if cfg.get("resource_id") == resource_id:
                hit_steps.append({
                    "step_id": n.get("id", ""),
                    "type": n.get("type", ""),
                    "match_field": "resource_id",
                })
        if hit_steps:
            items.append({
                "id": tpl.id,
                "pipeline_code": tpl.template_code,
                "pipeline_name": tpl.name,
                "description": tpl.description,
                "trigger_type": "TEMPLATE",
                "status": 1,
                "step_count": len(nodes),
                "hit_steps": hit_steps,
            })
    return {"resource_id": resource_id, "total": len(items), "items": items}


# ── Feishu Bitable table objects ──

@router.get("/resources/{resource_id}/bitable-tables")
async def route_list_bitable_tables(
    resource_id: int,
    is_active: bool | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.resources", "V")),
):
    try:
        items = await list_bitable_tables(db, resource_id, is_active=is_active)
    except BitableTableConfigError as exc:
        raise HTTPException(404 if str(exc) == "资源不存在" else 400, str(exc)) from exc
    return {"total": len(items), "items": [serialize_bitable_table(item) for item in items]}


@router.post("/resources/{resource_id}/bitable-tables", status_code=201)
async def route_create_bitable_table(
    resource_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.resources", "C")),
):
    try:
        item = await create_bitable_table(db, resource_id, payload, created_by=user.login_name)
    except BitableTableConfigError as exc:
        status = 409 if "已存在" in str(exc) else 400
        raise HTTPException(status, str(exc)) from exc
    return serialize_bitable_table(item)


@router.patch("/resources/{resource_id}/bitable-tables/{table_config_id}")
async def route_update_bitable_table(
    resource_id: int,
    table_config_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.resources", "U")),
):
    try:
        item = await update_bitable_table(db, resource_id, table_config_id, payload, updated_by=user.login_name)
    except BitableTableConfigError as exc:
        status = 409 if "已存在" in str(exc) else 404 if "不存在" in str(exc) else 400
        raise HTTPException(status, str(exc)) from exc
    return serialize_bitable_table(item)


@router.delete("/resources/{resource_id}/bitable-tables/{table_config_id}")
async def route_delete_bitable_table(
    resource_id: int,
    table_config_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.resources", "D")),
):
    try:
        await delete_bitable_table(db, resource_id, table_config_id)
    except BitableTableConfigError as exc:
        status = 409 if "引用" in str(exc) else 404 if "不存在" in str(exc) else 400
        raise HTTPException(status, str(exc)) from exc
    return {"deleted": table_config_id}


@router.post("/resources/{resource_id}/bitable-tables/{table_config_id}/preview")
async def route_preview_bitable_table(
    resource_id: int,
    table_config_id: int,
    payload: dict[str, Any] | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.resources", "V")),
):
    try:
        resource = await get_bitable_resource(db, resource_id)
        item = await get_bitable_table(db, resource_id, table_config_id, require_active=True)
    except BitableTableConfigError as exc:
        raise HTTPException(404 if "不存在" in str(exc) else 400, str(exc)) from exc
    limit = (payload or {}).get("limit", 20)
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100:
        raise HTTPException(400, "limit 必须在 1 到 100 之间")
    if not resource.credential_id:
        raise HTTPException(400, "资源未绑定飞书凭证")
    secrets = await decrypt_credential_secrets(db, resource.credential_id)
    params = {**(resource.protocol or {}), **table_params(item), "max_records": min(item.max_records, limit)}
    result = await get_adapter(resource.adapter_code or "")(params, secrets, db)
    if result.status != "success":
        raise HTTPException(502, result.error_message or "飞书多维表格预览失败")
    return {"status": result.status, "data": result.data, "row_count": result.row_count, "success_count": result.success_count, "failed_count": result.failed_count, "extra": result.extra}

# ── Credentials ──

@router.get("/credentials")
async def route_list_credentials(
    auth_type: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.credentials", "V")),
):
    items = await list_credentials(db, auth_type=auth_type)
    return {"total": len(items), "items": items}


@router.post("/credentials")
async def route_create_credential(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.credentials", "C")),
):
    obj = await create_credential(
        db,
        credential_code=payload["credential_code"],
        credential_name=payload["credential_name"],
        secrets=payload["secrets"],
        auth_type=payload.get("auth_type", "custom"),
        description=payload.get("description"),
        created_by=user.login_name,
    )
    # Handle system_id, env_tag, is_primary
    if "system_id" in payload:
        obj.system_id = payload["system_id"]
    if "env_tag" in payload:
        obj.env_tag = payload["env_tag"]
    if "is_primary" in payload:
        obj.is_primary = payload["is_primary"]
    await db.commit()
    await db.refresh(obj)
    return {"id": obj.id, "credential_code": obj.credential_code, "message": "凭证创建成功"}


@router.patch("/credentials/{credential_id}")
async def route_update_credential(
    credential_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.credentials", "U")),
):
    obj = await update_credential(
        db,
        credential_id,
        credential_name=payload.get("credential_name"),
        secrets=payload.get("secrets"),
        auth_type=payload.get("auth_type"),
        description=payload.get("description"),
        updated_by=user.login_name,
    )
    if payload.get("is_primary") is not None:
        obj.is_primary = payload["is_primary"]
    await db.commit()
    await db.refresh(obj)
    return {"id": obj.id, "credential_code": obj.credential_code, "message": "凭证更新成功"}


@router.patch("/credentials/{credential_id}/toggle")
async def route_toggle_credential(
    credential_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.credentials", "U")),
):
    is_active = payload.get("is_active", True)
    obj = await toggle_credential(db, credential_id, bool(is_active), updated_by=user.login_name)
    return {"id": obj.id, "credential_code": obj.credential_code, "is_active": obj.is_active, "message": "凭证状态已更新"}


# ── Pipelines ──

@router.get("/pipelines")
async def route_list_pipelines(
    trigger_type: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.pipelines", "V")),
):
    items = await list_pipelines(db, trigger_type=trigger_type)
    result = []
    for p in items:
        result.append({
            "id": p.id,
            "pipeline_code": p.pipeline_code,
            "pipeline_name": p.pipeline_name,
            "description": p.description,
            "trigger_type": p.trigger_type,
            "trigger_config": p.trigger_config,
            "error_handling": p.error_handling,
            "steps_count": len(p.steps or []),
            "status": p.status,
            "notification_enabled": bool(p.notification_config),
            "created_by": p.created_by,
            "updated_by": p.updated_by,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })
    return {"total": len(result), "items": result}


@router.get("/pipelines/{pipeline_id}")
async def route_get_pipeline(
    pipeline_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.pipelines", "V")),
):
    pl = await get_pipeline_by_id(db, pipeline_id)
    if not pl:
        raise HTTPException(404, "流水线不存在")
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


@router.post("/pipelines")
async def route_create_pipeline(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.pipelines", "C")),
):
    obj = await upsert_pipeline(
        db,
        pipeline_code=payload["pipeline_code"],
        pipeline_name=payload["pipeline_name"],
        steps=payload.get("steps", []),
        trigger_type=payload.get("trigger_type", "SCHEDULED"),
        trigger_config=payload.get("trigger_config"),
        error_handling=payload.get("error_handling", "STOP_ON_ERROR"),
        notification_config=payload.get("notification_config"),
        run_as_type=payload.get("run_as_type", "SERVICE_ACCOUNT"),
        service_account_code=payload.get("service_account_code"),
        description=payload.get("description"),
        created_by=user.login_name,
    )
    return {"id": obj.id, "pipeline_code": obj.pipeline_code, "message": "流水线创建成功"}


@router.patch("/pipelines/{pipeline_id}")
async def route_update_pipeline(
    pipeline_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.pipelines", "U")),
):
    obj = await update_pipeline_fields(db, pipeline_id, payload, updated_by=user.login_name)
    return {"id": obj.id, "pipeline_code": obj.pipeline_code, "message": "流水线更新成功"}


@router.patch("/pipelines/{pipeline_id}/toggle")
async def route_toggle_pipeline(
    pipeline_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.pipelines", "U")),
):
    status = payload.get("status", 1)
    obj = await toggle_pipeline(db, pipeline_id, status, updated_by=user.login_name)
    return {"id": obj.id, "pipeline_code": obj.pipeline_code, "status": obj.status, "message": "流水线状态已更新"}


@router.delete("/pipelines/{pipeline_id}")
async def route_delete_pipeline(
    pipeline_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.pipelines", "D")),
):
    ok = await delete_pipeline(db, pipeline_id, deleted_by=user.login_name)
    if not ok:
        raise HTTPException(404, "流水线不存在")
    return {"message": "流水线已删除"}


# ── Bridge ──

@router.get("/bridge-targets")
async def route_bridge_targets(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.resources", "V")),
):
    items = await list_bridge_targets(db)
    return {"items": items}


@router.get("/bridge-push-targets")
async def route_bridge_push_targets(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.resources", "V")),
):
    items = await list_bridge_push_targets(db)
    return {"items": items}
