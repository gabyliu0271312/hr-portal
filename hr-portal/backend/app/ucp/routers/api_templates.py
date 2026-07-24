"""Controlled API template and OpenAPI import endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.ucp.api_template_service import (
    ApiTemplateError, copy_template, create_openapi_drafts, create_template, delete_template,
    get_template, list_templates, list_versions, publish_template, rollback_template, update_template,
)
from app.ucp.generic_http_adapter import GenericHttpActionAdapter
from app.ucp.openapi_import_service import OpenApiImportError, preview_openapi

router = APIRouter()


class TemplatePayload(BaseModel):
    template_code: str = Field(min_length=1, max_length=64)
    template_name: str = Field(min_length=1, max_length=128)
    method: str = "GET"
    base_url: str | None = None
    path: str | None = None
    allowed_domains: list[str] = Field(default_factory=list)
    category: str = "CUSTOM"
    system_type: str | None = None
    headers_config: list[dict[str, Any]] = Field(default_factory=list)
    query_config: list[dict[str, Any]] = Field(default_factory=list)
    body_template: dict[str, Any] | None = None
    auth_type: str | None = None
    data_path: str | None = None
    total_path: str | None = None
    next_cursor_path: str | None = None
    pagination_type: str = "NONE"
    field_mappings: list[dict[str, Any]] = Field(default_factory=list)
    error_code_map: dict[str, Any] | None = None
    rate_limit_qps: int | None = Field(default=None, ge=1, le=100)
    tags: list[str] = Field(default_factory=list)
    description: str | None = None


class TemplateUpdate(BaseModel):
    template_name: str | None = None
    method: str | None = None
    base_url: str | None = None
    path: str | None = None
    allowed_domains: list[str] | None = None
    category: str | None = None
    headers_config: list[dict[str, Any]] | None = None
    query_config: list[dict[str, Any]] | None = None
    body_template: dict[str, Any] | None = None
    auth_type: str | None = None
    data_path: str | None = None
    total_path: str | None = None
    pagination_type: str | None = None
    field_mappings: list[dict[str, Any]] | None = None
    rate_limit_qps: int | None = Field(default=None, ge=1, le=100)
    tags: list[str] | None = None
    description: str | None = None
    change_note: str | None = None


class CopyRequest(BaseModel):
    new_code: str = Field(min_length=1, max_length=64)
    new_name: str = Field(min_length=1, max_length=128)


class RollbackRequest(BaseModel):
    version_id: int


class OpenApiPreviewRequest(BaseModel):
    document: dict[str, Any]
    allowed_domains: list[str] = Field(min_length=1)
    code_prefix: str = Field(default="OPENAPI", min_length=1, max_length=32)


class OpenApiImportRequest(OpenApiPreviewRequest):
    selected_operation_ids: list[str] = Field(min_length=1)


class TemplateTestRequest(BaseModel):
    template: dict[str, Any]
    context: dict[str, Any] = Field(default_factory=dict)


def _operator(user: Any) -> str:
    return getattr(user, "username", None) or getattr(user, "login_name", None) or str(user.id)


def _http_error(error: ApiTemplateError) -> HTTPException:
    return HTTPException(404 if error.code == "NOT_FOUND" else 400, error.message)


@router.get("/api-templates")
async def route_list_templates(category: str | None = None, keyword: str | None = None, is_published: bool | None = None, limit: int = Query(100, le=200), offset: int = Query(0, ge=0), db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.systems", "V"))):
    items = await list_templates(db, category=category, keyword=keyword, is_published=is_published, limit=limit, offset=offset)
    return {"total": len(items), "items": items}


@router.post("/api-templates/openapi/preview")
async def route_preview_openapi(payload: OpenApiPreviewRequest, _user=Depends(require_op("ucp.systems", "C"))):
    try: return preview_openapi(payload.document, allowed_domains=payload.allowed_domains, code_prefix=payload.code_prefix)
    except OpenApiImportError as error: raise HTTPException(400, str(error)) from error


@router.post("/api-templates/openapi/import")
async def route_import_openapi(payload: OpenApiImportRequest, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.systems", "C"))):
    try:
        preview = preview_openapi(payload.document, allowed_domains=payload.allowed_domains, code_prefix=payload.code_prefix)
        return {"items": await create_openapi_drafts(db, preview["operations"], payload.selected_operation_ids, _operator(user)), "rejected": preview["rejected"]}
    except (OpenApiImportError, ApiTemplateError) as error: raise _http_error(error) if isinstance(error, ApiTemplateError) else HTTPException(400, str(error)) from error


@router.post("/api-templates")
async def route_create_template(payload: TemplatePayload, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.systems", "C"))):
    try: return await create_template(db, created_by=_operator(user), **payload.model_dump())
    except ApiTemplateError as error: raise _http_error(error) from error


@router.get("/api-templates/{template_code}")
async def route_get_template(template_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.systems", "V"))):
    item = await get_template(db, template_code)
    if not item: raise HTTPException(404, "模板不存在")
    return item


@router.patch("/api-templates/{template_code}")
async def route_update_template(template_code: str, payload: TemplateUpdate, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.systems", "U"))):
    fields = payload.model_dump(exclude_none=True, exclude={"change_note"})
    try: return await update_template(db, template_code, updated_by=_operator(user), change_note=payload.change_note, **fields)
    except ApiTemplateError as error: raise _http_error(error) from error


@router.post("/api-templates/{template_code}/approve-publish")
async def route_publish_template(template_code: str, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.systems", "U"))):
    try: return await publish_template(db, template_code, _operator(user))
    except ApiTemplateError as error: raise _http_error(error) from error


@router.get("/api-templates/{template_code}/versions")
async def route_versions(template_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.systems", "V"))):
    return {"items": await list_versions(db, template_code)}


@router.post("/api-templates/{template_code}/rollback")
async def route_rollback(template_code: str, payload: RollbackRequest, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.systems", "U"))):
    try: return await rollback_template(db, template_code, payload.version_id, _operator(user))
    except ApiTemplateError as error: raise _http_error(error) from error


@router.post("/api-templates/{template_code}/copy")
async def route_copy(template_code: str, payload: CopyRequest, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.systems", "C"))):
    try: return await copy_template(db, template_code, payload.new_code, payload.new_name, _operator(user))
    except ApiTemplateError as error: raise _http_error(error) from error


@router.delete("/api-templates/{template_code}")
async def route_delete(template_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.systems", "D"))):
    try: return {"deleted": await delete_template(db, template_code)}
    except ApiTemplateError as error: raise _http_error(error) from error


@router.post("/api-templates/test")
async def route_test_template(payload: TemplateTestRequest, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.systems", "U"))):
    result = await GenericHttpActionAdapter().execute({"http_config": payload.template, "context": payload.context}, {}, db)
    if result.status != "success": raise HTTPException(400, result.error_message or "模板测试失败")
    return {"response_sample": result.data, "total": result.extra.get("total"), "context_used": sorted(payload.context)}
