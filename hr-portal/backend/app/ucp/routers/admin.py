"""UCP 管理配置 / Excel / 熔断限流 / 通知模板 / 适配器 / API模板 / SSRF / 变更 路由"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
from app.ucp.models import (
    UcpCredential,
    UcpPipelineConfig,
    UcpResource,
    UcpSystemConfig,
    UcpSystem,
)
from app.ucp.config_service import (
    list_system_configs,
    list_pipelines,
)
from app.ucp.credential_service import list_credentials
from app.ucp.circuit_breaker import (
    list_circuits,
    get_circuit_state,
    reset_circuit,
)
from app.ucp.rate_limiter import (
    list_buckets,
    reset_bucket,
)
from app.ucp.notification_template import (
    list_templates as list_notification_templates,
    get_template as get_notification_template,
    create_template as create_notification_template,
    update_template as update_notification_template,
    toggle_template,
    delete_template,
    preview_template as preview_notification_template,
    apply_template_to_config,
)
from app.ucp.adapter_registry import (
    list_adapter_definitions,
    get_adapter_definition,
    register_adapter,
    activate_adapter,
    delete_adapter_definition,
    serialize_adapter,
)
from app.ucp.api_template_service import (
    list_templates as list_api_templates,
    get_template as get_api_template,
    create_template as create_api_template,
    update_template as update_api_template,
    copy_template,
    delete_template as delete_api_template,
    list_versions,
    rollback_template,
)
from app.ucp.template_engine import resolve_variables
from app.ucp.ssrf_guard import check_url
from app.ucp.change_service import (
    list_changes,
    create_change,
    update_change_status,
    rollback_change,
    _serialize_change,
)
from app.ucp.excel_service import (
    save_and_preview,
    import_to_target_table,
)

logger = logging.getLogger("ucp.routers.admin")
router = APIRouter()


# ── Config Batch / Stats / Search / Export / Import ──

@router.post("/config/batch-toggle")
async def route_config_batch_toggle(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.admin", "U")),
):
    target_type = payload["target_type"]
    target_ids: list[int] = payload["target_ids"]
    new_status: int = payload["new_status"]
    success_count = 0
    failed_count = 0
    failed_details: list[dict] = []

    for tid in target_ids:
        try:
            if target_type == "pipeline":
                pl = await db.get(UcpPipelineConfig, tid)
                if pl:
                    pl.status = new_status
                    pl.updated_by = user.username
                    success_count += 1
                else:
                    failed_count += 1
                    failed_details.append({"id": tid, "reason": "not found"})
            elif target_type == "credential":
                cred = await db.get(UcpCredential, tid)
                if cred:
                    cred.is_active = 1 if new_status == 1 else 0
                    cred.updated_by = user.username
                    success_count += 1
                else:
                    failed_count += 1
                    failed_details.append({"id": tid, "reason": "not found"})
            elif target_type == "resource":
                res = await db.get(UcpResource, tid)
                if res:
                    res.status = new_status
                    success_count += 1
                else:
                    failed_count += 1
                    failed_details.append({"id": tid, "reason": "not found"})
            elif target_type == "system":
                sys = await db.get(UcpSystem, tid)
                if sys:
                    sys.is_active = new_status
                    success_count += 1
                else:
                    failed_count += 1
                    failed_details.append({"id": tid, "reason": "not found"})
            else:
                failed_count += 1
                failed_details.append({"id": tid, "reason": f"unknown target_type: {target_type}"})
        except Exception as e:
            failed_count += 1
            failed_details.append({"id": tid, "reason": str(e)})

    await db.commit()
    return {"success_count": success_count, "failed_count": failed_count, "new_status": new_status, "failed_details": failed_details}


@router.get("/config/stats")
async def route_config_stats(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    configs = await list_system_configs(db)
    pipelines = await list_pipelines(db)
    credentials = await list_credentials(db)

    resources = {
        "total": len(configs),
        "enabled": sum(1 for c in configs if c.status == 1),
        "disabled": sum(1 for c in configs if c.status in (0, 2)),
        "untested": sum(1 for c in configs if c.test_status == "NOT_TESTED"),
        "failed_test": sum(1 for c in configs if c.test_status == "FAILED"),
        "by_type": {},
    }
    for c in configs:
        t = c.adapter_type or "unknown"
        resources["by_type"][t] = resources["by_type"].get(t, 0) + 1

    return {
        "resources": resources,
        "pipelines": {
            "total": len(pipelines),
            "enabled": sum(1 for p in pipelines if p.status == 1),
            "disabled": sum(1 for p in pipelines if p.status in (0, 2)),
            "by_trigger": {},
        },
        "credentials": {
            "total": len(credentials),
            "active": sum(1 for c in credentials if c.is_active == 1),
            "inactive": sum(1 for c in credentials if c.is_active == 0),
        },
    }


@router.get("/config/search")
async def route_config_search(
    keyword: str = Query(""),
    target_type: str | None = Query(None),
    status: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    results: dict[str, list] = {"resources": [], "pipelines": [], "credentials": [], "total": 0}

    if not target_type or target_type == "resource":
        configs = await list_system_configs(db, status=status)
        for c in configs:
            if not keyword or keyword.lower() in (c.system_code or "").lower() or keyword.lower() in (c.system_name or "").lower():
                results["resources"].append({"id": c.id, "system_code": c.system_code, "system_name": c.system_name, "status": c.status})
        results["total"] += len(results["resources"])

    if not target_type or target_type == "pipeline":
        pipelines = await list_pipelines(db, status=status)
        for p in pipelines:
            if not keyword or keyword.lower() in p.pipeline_code.lower() or keyword.lower() in p.pipeline_name.lower():
                results["pipelines"].append({"id": p.id, "pipeline_code": p.pipeline_code, "pipeline_name": p.pipeline_name, "status": p.status})
        results["total"] += len(results["pipelines"])

    if not target_type or target_type == "credential":
        creds = await list_credentials(db)
        for c in creds:
            if (not status or c.is_active == (status == 1)) and (not keyword or keyword.lower() in c.credential_code.lower()):
                results["credentials"].append({"id": c.id, "credential_code": c.credential_code, "is_active": c.is_active})
        results["total"] += len(results["credentials"])

    return results


@router.get("/config/export")
async def route_config_export(
    target_type: str | None = Query(None),
    format: str = Query("json"),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "E")),
):
    content: dict[str, Any] = {}
    if not target_type or target_type == "resource":
        configs = await list_system_configs(db)
        content["resources"] = [{"system_code": c.system_code, "system_name": c.system_name, "adapter_type": c.adapter_type} for c in configs]
    if not target_type or target_type == "pipeline":
        pipelines = await list_pipelines(db)
        content["pipelines"] = [{"pipeline_code": p.pipeline_code, "pipeline_name": p.pipeline_name} for p in pipelines]
    if not target_type or target_type == "credential":
        creds = await list_credentials(db)
        content["credentials"] = [{"credential_code": c.credential_code, "credential_name": c.credential_name} for c in creds]
    return {"format": format, "content": content}


@router.post("/config/import")
async def route_config_import(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.admin", "C")),
):
    dry_run = payload.get("dry_run", False)
    skip_existing = payload.get("skip_existing", True)
    content = payload.get("content", {})
    result = {
        "dry_run": dry_run,
        "credentials": {"created": 0, "skipped": 0, "errors": []},
        "resources": {"created": 0, "skipped": 0, "errors": []},
        "pipelines": {"created": 0, "skipped": 0, "errors": []},
    }
    if dry_run:
        return result
    # Basic import — for full implementation see config import script
    for cred_data in content.get("credentials", []):
        try:
            existing = await db.execute(select(UcpCredential).where(UcpCredential.credential_code == cred_data["credential_code"]))
            if existing.scalar_one_or_none():
                if skip_existing:
                    result["credentials"]["skipped"] += 1
                    continue
            obj = UcpCredential(credential_code=cred_data["credential_code"], credential_name=cred_data.get("credential_name", ""), secrets_encrypted={}, created_by=user.username)
            db.add(obj)
            result["credentials"]["created"] += 1
        except Exception as e:
            result["credentials"]["errors"].append({"code": cred_data.get("credential_code"), "error": str(e)})
    await db.commit()
    return result


# ── Excel ──

@router.post("/excel/upload")
async def route_excel_upload(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "C")),
):
    result = await save_and_preview(db, file)
    return result


@router.post("/excel/import")
async def route_excel_import(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "C")),
):
    result = await import_to_target_table(
        db,
        file_key=payload["file_key"],
        target_table=payload["target_table"],
        join_key=payload["join_key"],
        mapping_rules=payload.get("mapping_rules"),
        sheet_name=payload.get("sheet_name"),
    )
    await db.commit()
    return result


# ── Circuits ──

@router.get("/circuits")
async def route_list_circuits(
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    items = list_circuits()
    return {"circuits": items}


@router.get("/circuits/{resource_code}")
async def route_get_circuit(
    resource_code: str,
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    state = get_circuit_state(resource_code)
    return {"resource_code": resource_code, "config": {}, "state": state}


@router.post("/circuits/{resource_code}/reset")
async def route_reset_circuit(
    resource_code: str,
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    result = reset_circuit(resource_code)
    return result


@router.patch("/circuits/{resource_code}/config")
async def route_update_circuit_config(
    resource_code: str,
    payload: dict[str, Any],
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    return {"resource_code": resource_code, "config": payload}


# ── Rate Limits ──

@router.get("/rate-limits")
async def route_list_rate_limits(
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    buckets = list_buckets()
    return {"buckets": buckets}


@router.post("/rate-limits/{key}/reset")
async def route_reset_rate_limit(
    key: str,
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    reset_bucket(key)
    return {"key": key, "reset": True}


# ── Notification Templates ──

@router.get("/notification-templates")
async def route_list_notification_templates(
    trigger_scene: str | None = Query(None),
    is_active: int | None = Query(None),
    keyword: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    items = await list_notification_templates(db, trigger_scene=trigger_scene, is_active=is_active, keyword=keyword, limit=limit)
    return {"items": items, "total": len(items)}


@router.get("/notification-templates/{template_id}")
async def route_get_notification_template(
    template_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    tpl = await get_notification_template(db, template_id)
    if not tpl:
        raise HTTPException(404, "模板不存在")
    return tpl


@router.post("/notification-templates")
async def route_create_notification_template(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.admin", "C")),
):
    tpl = await create_notification_template(db, user=user.username, **payload)
    return tpl


@router.patch("/notification-templates/{template_id}")
async def route_update_notification_template(
    template_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    tpl = await update_notification_template(db, template_id, **payload)
    return tpl


@router.patch("/notification-templates/{template_id}/toggle")
async def route_toggle_notification_template(
    template_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    tpl = await toggle_template(db, template_id)
    return tpl


@router.delete("/notification-templates/{template_id}")
async def route_delete_notification_template(
    template_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "D")),
):
    await delete_template(db, template_id)
    return {"deleted": True}


@router.post("/notification-templates/{template_id}/preview")
async def route_preview_notification_template(
    template_id: int,
    payload: dict[str, Any] = {},
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    result = await preview_notification_template(db, template_id, payload.get("mock_vars", {}))
    return result


@router.post("/notification-templates/{template_id}/apply")
async def route_apply_notification_template(
    template_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    tpl = await get_notification_template(db, template_id)
    if not tpl:
        raise HTTPException(404, "模板不存在")
    base_config = payload.get("base_config")
    new_config = apply_template_to_config(tpl, base_config)
    return {"template_code": tpl.get("template_code"), "trigger_scene": tpl.get("trigger_scene"), "new_config": new_config}


# ── Adapter Registry ──

@router.get("/adapter-registry")
async def route_list_adapters(
    adapter_type: str | None = Query(None),
    is_active: bool | None = Query(None),
    keyword: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    items, total = await list_adapter_definitions(db, adapter_type=adapter_type, is_active=is_active, keyword=keyword, limit=limit, offset=offset)
    return {"total": total, "items": [serialize_adapter(a) for a in items]}


@router.get("/adapter-registry/{code}")
async def route_get_adapter(
    code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    defn = await get_adapter_definition(db, code)
    if not defn:
        raise HTTPException(404, "适配器不存在")
    return serialize_adapter(defn)


@router.get("/adapter-registry/{code}/schema")
async def route_get_adapter_schema(
    code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    defn = await get_adapter_definition(db, code)
    if not defn:
        raise HTTPException(404, "适配器不存在")
    from app.ucp.adapter_schema import extract_categories
    categories = extract_categories(defn.schema_json) if defn.schema_json else []
    return {
        "adapter_code": defn.adapter_code,
        "adapter_type": defn.adapter_type,
        "version": defn.version,
        "categories": categories,
    }


@router.post("/adapter-registry")
async def route_register_adapter(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.admin", "C")),
):
    defn = await register_adapter(
        db,
        adapter_code=payload["adapter_code"],
        adapter_type=payload["adapter_type"],
        name=payload["name"],
        description=payload.get("description"),
        schema=payload.get("schema"),
        sample_payload=payload.get("sample_payload"),
        version=payload.get("version", "1.0.0"),
        created_by=user.username,
    )
    await db.commit()
    return serialize_adapter(defn)


@router.post("/adapter-registry/{code}/activate")
async def route_activate_adapter(
    code: str,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    is_active = payload.get("is_active", True)
    defn = await activate_adapter(db, code, bool(is_active))
    await db.commit()
    return serialize_adapter(defn)


@router.delete("/adapter-registry/{code}")
async def route_delete_adapter(
    code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "D")),
):
    ok = await delete_adapter_definition(db, code)
    if not ok:
        raise HTTPException(404, "适配器不存在")
    return {"deleted": code}


# ── API Templates ──

@router.get("/api-templates")
async def route_list_api_templates(
    category: str | None = Query(None),
    system_type: str | None = Query(None),
    keyword: str | None = Query(None),
    is_published: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    items = await list_api_templates(db, category=category, system_type=system_type, keyword=keyword, is_published=is_published, limit=limit, offset=offset)
    return {"total": len(items), "items": items}


@router.get("/api-templates/{code}")
async def route_get_api_template(
    code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    tpl = await get_api_template(db, code)
    if not tpl:
        raise HTTPException(404, "API模板不存在")
    return tpl


@router.post("/api-templates")
async def route_create_api_template(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.admin", "C")),
):
    tpl = await create_api_template(db, created_by=user.username, **payload)
    await db.commit()
    return tpl


@router.patch("/api-templates/{code}")
async def route_update_api_template(
    code: str,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    tpl = await update_api_template(db, code, **payload)
    await db.commit()
    return tpl


@router.post("/api-templates/{source}/copy")
async def route_copy_api_template(
    source: str,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.admin", "C")),
):
    tpl = await copy_template(db, source, new_code=payload["new_code"], new_name=payload["new_name"], created_by=user.username)
    await db.commit()
    return tpl


@router.delete("/api-templates/{code}")
async def route_delete_api_template(
    code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "D")),
):
    ok = await delete_api_template(db, code)
    if not ok:
        raise HTTPException(404, "API模板不存在")
    return {"deleted": True}


@router.get("/api-templates/{code}/versions")
async def route_api_template_versions(
    code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    items = await list_versions(db, code)
    return {"items": items}


@router.post("/api-templates/{code}/rollback")
async def route_rollback_api_template(
    code: str,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    tpl = await rollback_template(db, code, payload["version_id"])
    await db.commit()
    return tpl


@router.post("/api-templates/import")
async def route_import_api_template(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.admin", "C")),
):
    tpl = await create_api_template(db, created_by=user.username, **payload)
    await db.commit()
    return tpl


@router.get("/api-templates/{code}/export")
async def route_export_api_template(
    code: str,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "E")),
):
    tpl = await get_api_template(db, code)
    if not tpl:
        raise HTTPException(404, "API模板不存在")
    return {"format": "json", "content": tpl}


# ── Template Engine Test ──

@router.post("/template-engine/test")
async def route_test_template_engine(
    payload: dict[str, Any],
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    template = payload.get("template", {})
    context = payload.get("context", {})
    output = resolve_variables(template, context)
    return {"input": template, "context_keys": list(context.keys()), "output": output}


# ── API Template Test Execution ──

@router.post("/api-templates/test")
async def route_test_api_template(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    """测试执行 API 模板：真实发起 HTTP 请求并返回脱敏响应。

    请求体:
      - template: dict (可选的模板覆盖)
      - context: dict (变量上下文)
      - save_sample: bool (是否保存脱敏响应到模板)
    """
    from app.ucp.template_engine import resolve_variables, extract_response_data, extract_total, build_system_context
    from app.ucp.ssrf_guard import check_url
    from app.ucp.masking import mask_sensitive_fields

    template_data = payload.get("template") or {}
    context = dict(build_system_context()["system"], **payload.get("context", {}))
    save_sample = payload.get("save_sample", False)

    # 1. 校验 base_url
    base_url = template_data.get("base_url")
    path = template_data.get("path", "")
    if not base_url:
        return {"error": "缺少 base_url", "request": {}}
    full_url = resolve_variables((base_url.rstrip("/") + "/" + path.lstrip("/")), context) if path else base_url
    allowed_domains = template_data.get("allowed_domains")
    check_url(str(full_url), allowed_domains)

    # 2. 渲染 headers/body
    rendered_headers: dict = {}
    for h in (template_data.get("headers_config") or []):
        key = str(resolve_variables(h.get("key", ""), context))
        val = str(resolve_variables(h.get("value", ""), context))
        if key and val:
            rendered_headers[key] = val
    rendered_body = resolve_variables(template_data.get("body_template"), context)

    # 3. 认证注入
    auth_type = template_data.get("auth_type", "")
    if auth_type == "BEARER":
        token = context.get("token", "") or rendered_headers.get("Authorization", "").replace("Bearer ", "")
        if token and "Authorization" not in rendered_headers:
            rendered_headers["Authorization"] = f"Bearer {token}"
    elif auth_type == "API_KEY":
        api_key = context.get("api_key", "") or rendered_headers.get("X-API-Key", "")
        if api_key:
            rendered_headers["X-API-Key"] = str(api_key)

    # 4. 发起真实 HTTP 请求
    import json as _json, ssl
    from urllib.request import Request as _Req, urlopen as _urlopen
    from urllib.error import HTTPError as _HTTPError, URLError as _URLError

    method = template_data.get("method", "GET")
    timeout = template_data.get("timeout_seconds", 30)
    request_summary = {"method": method, "url": str(full_url), "headers_keys": list(rendered_headers.keys()), "has_body": rendered_body is not None}

    http_response = None
    error_message = None
    try:
        req = _Req(str(full_url), method=method)
        for k, v in rendered_headers.items():
            req.add_header(k, v)
        body_bytes = None
        if rendered_body is not None and method in ("POST", "PUT", "PATCH"):
            body_bytes = _json.dumps(rendered_body).encode("utf-8")
            req.add_header("Content-Type", "application/json")
        ctx = ssl.create_default_context()
        resp = _urlopen(req, data=body_bytes, timeout=timeout, context=ctx)
        raw_body = resp.read().decode("utf-8", errors="replace")
        try:
            http_response = _json.loads(raw_body)
        except _json.JSONDecodeError:
            http_response = {"_raw": raw_body[:2000]}
    except _HTTPError as e:
        error_message = f"HTTP {e.code}: {e.reason}"
        try:
            http_response = _json.loads(e.read().decode("utf-8", errors="replace"))
        except Exception:
            http_response = {"_raw": str(e)[:500]}
    except _URLError as e:
        error_message = f"连接失败: {e.reason}"
    except Exception as e:
        error_message = f"请求异常: {str(e)[:500]}"

    # 5. 解析响应
    if error_message:
        return {"request": request_summary, "error": error_message, "response_sample": []}

    data_path = template_data.get("data_path", "$.data.items")
    extracted = extract_response_data(http_response, data_path)
    extracted_list = extracted if isinstance(extracted, list) else [extracted] if extracted else []
    masked_response = mask_sensitive_fields(extracted_list)
    total = extract_total(http_response, template_data.get("total_path")) or len(extracted_list)

    # 5. 保存脱敏响应样例
    if save_sample and template_data.get("template_code"):
        from app.ucp.api_template_service import update_template
        await update_template(
            db, template_data["template_code"],
            sample_response=masked_response[:5],
        )
        await db.commit()

    return {
        "request": request_summary,
        "response_sample": masked_response[:3],
        "total": len(extracted) if isinstance(extracted, list) else 1,
        "context_used": list(context.keys()),
    }


# ── SSRF Rules ──

@router.get("/security/ssrf-rules")
async def route_ssrf_rules(
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    from app.ucp.ssrf_guard import (
        BLOCKED_IPV4_NETWORKS, BLOCKED_IPV6_NETWORKS, BLOCKED_HOST_PATTERNS,
    )
    return {
        "blocked_ipv4_networks": [str(n) for n in BLOCKED_IPV4_NETWORKS],
        "blocked_ipv6_networks": [str(n) for n in BLOCKED_IPV6_NETWORKS],
        "blocked_host_patterns": [p.pattern for p in BLOCKED_HOST_PATTERNS],
    }


# ── Changes ──

@router.get("/changes")
async def route_list_changes(
    status: str | None = Query(None),
    change_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "V")),
):
    items = await list_changes(db, status=status, change_type=change_type, limit=limit, offset=offset)
    return {"items": [_serialize_change(c) for c in items]}


@router.post("/changes")
async def route_create_change(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.admin", "C")),
):
    ch = await create_change(
        db,
        change_type=payload["change_type"],
        change_target_id=payload["change_target_id"],
        change_target_code=payload["change_target_code"],
        change_summary=payload.get("change_summary"),
        risk_level=payload.get("risk_level", "LOW"),
        reason=payload.get("reason"),
        created_by=user.username,
    )
    await db.commit()
    return _serialize_change(ch)


@router.post("/changes/{change_id}/publish")
async def route_publish_change(
    change_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    ch = await update_change_status(db, change_id, "PUBLISHED")
    await db.commit()
    return _serialize_change(ch)


@router.post("/changes/{change_id}/rollback")
async def route_rollback_change(
    change_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.admin", "U")),
):
    ch = await rollback_change(db, change_id)
    await db.commit()
    return _serialize_change(ch)
