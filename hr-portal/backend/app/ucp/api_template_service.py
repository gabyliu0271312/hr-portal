"""Phase 5-E: API 模板库服务。

API 资源模板的 CRUD、版本管理、复制、导入导出。
"""
from __future__ import annotations

import copy
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpApiTemplate, UcpApiTemplateVersion

logger = logging.getLogger("ucp.api_template")


class ApiTemplateError(RuntimeError):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


async def list_templates(
    db: AsyncSession,
    category: str | None = None,
    system_type: str | None = None,
    keyword: str | None = None,
    is_published: bool | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    stmt = select(UcpApiTemplate)
    if category:
        stmt = stmt.where(UcpApiTemplate.category == category)
    if system_type:
        stmt = stmt.where(UcpApiTemplate.system_type == system_type)
    if keyword:
        kw = f"%{keyword}%"
        from sqlalchemy import or_
        stmt = stmt.where(or_(
            UcpApiTemplate.template_code.ilike(kw),
            UcpApiTemplate.template_name.ilike(kw),
        ))
    if is_published is not None:
        stmt = stmt.where(UcpApiTemplate.is_published == (1 if is_published else 0))
    stmt = stmt.order_by(desc(UcpApiTemplate.updated_at)).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_template(r) for r in rows]


async def get_template(db: AsyncSession, template_code: str) -> dict | None:
    row = (await db.execute(
        select(UcpApiTemplate).where(UcpApiTemplate.template_code == template_code)
    )).scalar_one_or_none()
    return _serialize_template(row) if row else None


async def create_template(
    db: AsyncSession,
    template_code: str,
    template_name: str,
    category: str = "CUSTOM",
    system_type: str | None = None,
    method: str = "GET",
    base_url: str | None = None,
    path: str | None = None,
    headers_config: list | None = None,
    query_config: list | None = None,
    body_template: dict | None = None,
    auth_type: str | None = None,
    data_path: str | None = None,
    total_path: str | None = None,
    next_cursor_path: str | None = None,
    pagination_type: str = "NONE",
    field_mappings: list | None = None,
    error_code_map: dict | None = None,
    rate_limit_qps: int | None = None,
    allowed_domains: list | None = None,
    tags: list | None = None,
    description: str | None = None,
    created_by: str | None = None,
) -> dict:
    existing = (await db.execute(
        select(UcpApiTemplate).where(UcpApiTemplate.template_code == template_code)
    )).scalar_one_or_none()
    if existing:
        raise ApiTemplateError("DUPLICATE_CODE", f"模板 '{template_code}' 已存在")

    # SSRF 防护：保存时校验 base_url
    if base_url:
        from app.ucp.ssrf_guard import check_url
        check_url(base_url, allowed_domains)

    tpl = UcpApiTemplate(
        template_code=template_code,
        template_name=template_name,
        category=category,
        system_type=system_type,
        method=method,
        base_url=base_url,
        path=path,
        headers_config=headers_config or [],
        query_config=query_config or [],
        body_template=body_template,
        auth_type=auth_type,
        data_path=data_path,
        total_path=total_path,
        next_cursor_path=next_cursor_path,
        pagination_type=pagination_type,
        field_mappings=field_mappings or [],
        error_code_map=error_code_map,
        rate_limit_qps=rate_limit_qps,
        allowed_domains=allowed_domains or [],
        tags=tags or [],
        description=description,
        created_by=created_by,
    )
    db.add(tpl)
    await db.flush()
    # 创建首版快照
    _save_version(db, tpl, "1.0.0", "初始版本", created_by)
    await db.flush()
    return _serialize_template(tpl)


async def update_template(
    db: AsyncSession,
    template_code: str,
    updated_by: str | None = None,
    change_note: str | None = None,
    **fields,
) -> dict:
    tpl = (await db.execute(
        select(UcpApiTemplate).where(UcpApiTemplate.template_code == template_code)
    )).scalar_one_or_none()
    if not tpl:
        raise ApiTemplateError("NOT_FOUND", f"模板 '{template_code}' 不存在")

    allowed = {
        "template_name", "description", "category", "system_type",
        "method", "base_url", "path", "content_type", "timeout_seconds",
        "headers_config", "query_config", "body_template", "auth_type",
        "data_path", "total_path", "next_cursor_path", "pagination_type",
        "page_param", "page_size_param",
        "rate_limit_qps", "rate_limit_concurrency", "retry_max", "retry_backoff",
        "field_mappings", "error_code_map", "sample_response",
        "allowed_domains", "tags", "is_published",
    }
    changed = False
    for k, v in fields.items():
        if k in allowed and hasattr(tpl, k):
            setattr(tpl, k, v)
            changed = True

    # SSRF 防护：更新 base_url 时校验
    new_base_url = fields.get("base_url") or tpl.base_url
    if new_base_url:
        new_domains = fields.get("allowed_domains") or tpl.allowed_domains
        from app.ucp.ssrf_guard import check_url
        check_url(new_base_url, new_domains)

    if changed:
        tpl.updated_by = updated_by
        parts = tpl.version.split(".")
        parts[-1] = str(int(parts[-1]) + 1)
        tpl.version = ".".join(parts)
        _save_version(db, tpl, tpl.version, change_note, updated_by)

    await db.flush()
    return _serialize_template(tpl)


async def copy_template(
    db: AsyncSession,
    source_code: str,
    new_code: str,
    new_name: str,
    created_by: str | None = None,
) -> dict:
    src = await get_template(db, source_code)
    if not src:
        raise ApiTemplateError("NOT_FOUND", f"模板 '{source_code}' 不存在")
    # 从 DB 取完整对象
    tpl = (await db.execute(
        select(UcpApiTemplate).where(UcpApiTemplate.template_code == source_code)
    )).scalar_one()
    new_tpl = UcpApiTemplate(
        template_code=new_code,
        template_name=new_name,
        description=tpl.description,
        category=tpl.category,
        system_type=tpl.system_type,
        method=tpl.method,
        base_url=tpl.base_url,
        path=tpl.path,
        content_type=tpl.content_type,
        timeout_seconds=tpl.timeout_seconds,
        headers_config=copy.deepcopy(tpl.headers_config),
        query_config=copy.deepcopy(tpl.query_config),
        body_template=copy.deepcopy(tpl.body_template),
        auth_type=tpl.auth_type,
        data_path=tpl.data_path,
        total_path=tpl.total_path,
        next_cursor_path=tpl.next_cursor_path,
        pagination_type=tpl.pagination_type,
        page_param=tpl.page_param,
        page_size_param=tpl.page_size_param,
        rate_limit_qps=tpl.rate_limit_qps,
        rate_limit_concurrency=tpl.rate_limit_concurrency,
        retry_max=tpl.retry_max,
        retry_backoff=tpl.retry_backoff,
        field_mappings=copy.deepcopy(tpl.field_mappings),
        error_code_map=copy.deepcopy(tpl.error_code_map),
        allowed_domains=copy.deepcopy(tpl.allowed_domains),
        tags=copy.deepcopy(tpl.tags),
        version="1.0.0",
        is_published=0,
        created_by=created_by,
        updated_by=created_by,
    )
    db.add(new_tpl)
    await db.flush()
    _save_version(db, new_tpl, "1.0.0", f"从 {source_code} 复制", created_by)
    return _serialize_template(new_tpl)


async def create_openapi_drafts(
    db: AsyncSession,
    candidates: list[dict[str, Any]],
    selected_operation_ids: list[str],
    created_by: str | None = None,
) -> list[dict]:
    selected = set(selected_operation_ids)
    if not selected:
        raise ApiTemplateError("MISSING_OPERATION", "至少选择一个只读操作")
    chosen = [item for item in candidates if item.get("operation_id") in selected]
    if len(chosen) != len(selected):
        raise ApiTemplateError("INVALID_OPERATION", "存在未通过安全校验的操作")
    codes = [item["template_code"] for item in chosen]
    existing = set((await db.execute(select(UcpApiTemplate.template_code).where(UcpApiTemplate.template_code.in_(codes)))).scalars())
    if existing:
        raise ApiTemplateError("DUPLICATE_CODE", f"模板编码已存在: {', '.join(sorted(existing))}")
    drafts = []
    for item in chosen:
        drafts.append(await create_template(
            db, template_code=item["template_code"], template_name=item["template_name"],
            method=item["method"], base_url=item["base_url"], path=item["path"],
            auth_type=item.get("auth_type"), query_config=item.get("query_config"),
            body_template=item.get("body_template"), data_path=item.get("data_path"),
            total_path=item.get("total_path"), pagination_type=item.get("pagination_type") or "NONE",
            allowed_domains=item["allowed_domains"], tags=item.get("tags"),
            description=item.get("description"), created_by=created_by,
        ))
    return drafts


async def publish_template(db: AsyncSession, template_code: str, operator: str | None = None) -> dict:
    tpl = (await db.execute(select(UcpApiTemplate).where(UcpApiTemplate.template_code == template_code))).scalar_one_or_none()
    if not tpl:
        raise ApiTemplateError("NOT_FOUND", f"模板 '{template_code}' 不存在")
    if tpl.is_published:
        raise ApiTemplateError("ALREADY_PUBLISHED", "模板已发布")
    from app.ucp.generic_http_adapter import GenericHttpPolicyError, validate_generic_http_config
    try:
        validate_generic_http_config(_serialize_template(tpl))
    except GenericHttpPolicyError as exc:
        raise ApiTemplateError("INVALID_POLICY", str(exc)) from exc
    tpl.is_published = 1
    tpl.updated_by = operator
    parts = tpl.version.split(".")
    parts[-1] = str(int(parts[-1]) + 1)
    tpl.version = ".".join(parts)
    _save_version(db, tpl, tpl.version, "审批发布", operator)
    await db.flush()
    return _serialize_template(tpl)


async def delete_template(db: AsyncSession, template_code: str) -> bool:
    tpl = (await db.execute(
        select(UcpApiTemplate).where(UcpApiTemplate.template_code == template_code)
    )).scalar_one_or_none()
    if not tpl:
        raise ApiTemplateError("NOT_FOUND", f"模板 '{template_code}' 不存在")
    await db.delete(tpl)
    return True


async def list_versions(db: AsyncSession, template_code: str) -> list[dict]:
    tpl = (await db.execute(
        select(UcpApiTemplate).where(UcpApiTemplate.template_code == template_code)
    )).scalar_one_or_none()
    if not tpl:
        return []
    rows = (await db.execute(
        select(UcpApiTemplateVersion)
        .where(UcpApiTemplateVersion.template_id == tpl.id)
        .order_by(desc(UcpApiTemplateVersion.created_at))
    )).scalars().all()
    return [
        {
            "id": r.id, "template_id": r.template_id, "version": r.version,
            "snapshot": r.snapshot, "change_note": r.change_note,
            "created_by": r.created_by,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


async def rollback_template(
    db: AsyncSession, template_code: str, version_id: int, operator: str | None = None,
) -> dict:
    tpl = (await db.execute(
        select(UcpApiTemplate).where(UcpApiTemplate.template_code == template_code)
    )).scalar_one_or_none()
    if not tpl:
        raise ApiTemplateError("NOT_FOUND", f"模板 '{template_code}' 不存在")
    ver = await db.get(UcpApiTemplateVersion, version_id)
    if not ver or ver.template_id != tpl.id:
        raise ApiTemplateError("NOT_FOUND", f"版本 #{version_id} 不存在")

    snap = ver.snapshot or {}
    for k, v in snap.items():
        if hasattr(tpl, k) and k not in ("id", "template_code", "created_at"):
            setattr(tpl, k, v)
    tpl.version = ver.version
    tpl.updated_by = operator
    await db.flush()
    return _serialize_template(tpl)


def _save_version(db: AsyncSession, tpl: UcpApiTemplate, version: str, note: str | None, by: str | None):
    snap = {
        "template_name": tpl.template_name,
        "description": tpl.description,
        "category": tpl.category,
        "system_type": tpl.system_type,
        "method": tpl.method,
        "base_url": tpl.base_url,
        "path": tpl.path,
        "content_type": tpl.content_type,
        "timeout_seconds": tpl.timeout_seconds,
        "headers_config": tpl.headers_config,
        "query_config": tpl.query_config,
        "body_template": tpl.body_template,
        "auth_type": tpl.auth_type,
        "data_path": tpl.data_path,
        "total_path": tpl.total_path,
        "next_cursor_path": tpl.next_cursor_path,
        "pagination_type": tpl.pagination_type,
        "page_param": tpl.page_param,
        "page_size_param": tpl.page_size_param,
        "rate_limit_qps": tpl.rate_limit_qps,
        "rate_limit_concurrency": tpl.rate_limit_concurrency,
        "retry_max": tpl.retry_max,
        "retry_backoff": tpl.retry_backoff,
        "field_mappings": tpl.field_mappings,
        "error_code_map": tpl.error_code_map,
        "allowed_domains": tpl.allowed_domains,
        "tags": tpl.tags,
        "is_published": tpl.is_published,
    }
    db.add(UcpApiTemplateVersion(
        template_id=tpl.id,
        version=version,
        snapshot=snap,
        change_note=note,
        created_by=by or "system",
    ))


def _serialize_template(t: UcpApiTemplate) -> dict:
    return {
        "id": t.id,
        "template_code": t.template_code,
        "template_name": t.template_name,
        "description": t.description,
        "category": t.category,
        "system_type": t.system_type,
        "method": t.method,
        "base_url": t.base_url,
        "path": t.path,
        "content_type": t.content_type,
        "timeout_seconds": t.timeout_seconds,
        "headers_config": t.headers_config,
        "query_config": t.query_config,
        "body_template": t.body_template,
        "auth_type": t.auth_type,
        "data_path": t.data_path,
        "total_path": t.total_path,
        "next_cursor_path": t.next_cursor_path,
        "pagination_type": t.pagination_type,
        "page_param": t.page_param,
        "page_size_param": t.page_size_param,
        "rate_limit_qps": t.rate_limit_qps,
        "rate_limit_concurrency": t.rate_limit_concurrency,
        "retry_max": t.retry_max,
        "retry_backoff": t.retry_backoff,
        "field_mappings": t.field_mappings,
        "error_code_map": t.error_code_map,
        "sample_response": t.sample_response,
        "allowed_domains": t.allowed_domains,
        "tags": t.tags,
        "version": t.version,
        "is_published": bool(t.is_published),
        "is_active": bool(t.is_active),
        "created_by": t.created_by,
        "updated_by": t.updated_by,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
