"""Visual pipeline template CRUD endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.ucp.pipeline_template import (
    NODE_TYPES,
    PipelineTemplateError,
    create_template,
    delete_template,
    get_template,
    list_templates,
    list_versions,
    rollback_to_version,
    serialize_template,
    serialize_version,
    update_template,
)

router = APIRouter()


class TemplateCreatePayload(BaseModel):
    template_code: str = Field(min_length=3, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    version: str = "1.0.0"


class TemplateUpdatePayload(BaseModel):
    name: str | None = None
    description: str | None = None
    nodes: list[dict[str, Any]] | None = None
    edges: list[dict[str, Any]] | None = None
    version: str | None = None
    change_note: str | None = None


class RollbackPayload(BaseModel):
    target_version_id: int


def _operator(user: Any) -> str:
    return str(getattr(user, "login_name", None) or getattr(user, "username", None) or user.id)


def _error(error: PipelineTemplateError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(error))


@router.get("/pipeline-templates/_meta/node-types")
async def route_node_types(_user=Depends(require_op("ucp.pipelines", "V"))):
    labels = {
        "CONNECTOR": "资源调用",
        "CAPABILITY": "业务能力",
        "CAPABILITY_LOOKUP": "逐人查询业务能力",
        "RECORD_MERGE": "记录补全合并",
        "WAREHOUSE_ASSET_SINK": "写入数据仓库资产",
        "LOOP": "循环",
        "LOOP_RESOURCE": "循环资源",
        "TRANSFORM": "字段转换",
        "NOTIFY": "通知",
        "BRANCH": "条件分支",
        "WAIT": "等待",
        "APPROVAL": "审批",
    }
    return {"node_types": [{"type": item, "label": labels.get(item, item), "color": "#409eff", "icon": "Box", "config_schema": {}} for item in sorted(NODE_TYPES)], "node_count_limit": 100}


@router.get("/pipeline-templates")
async def route_list_templates(keyword: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.pipelines", "V"))):
    items, total = await list_templates(db, keyword=keyword, limit=limit, offset=offset)
    return {"total": total, "items": [serialize_template(item) for item in items]}


@router.post("/pipeline-templates")
async def route_create_template(payload: TemplateCreatePayload, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.pipelines", "C"))):
    if await get_template(db, payload.template_code) is not None:
        raise HTTPException(
            status_code=409,
            detail="Pipeline template code already exists; update it instead",
        )
    try:
        template = await create_template(db, created_by=_operator(user), **payload.model_dump())
    except PipelineTemplateError as error:
        raise _error(error) from error
    return serialize_template(template)


@router.get("/pipeline-templates/{template_code}")
async def route_get_template(template_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.pipelines", "V"))):
    template = await get_template(db, template_code)
    if template is None:
        raise HTTPException(status_code=404, detail="Pipeline template not found")
    return serialize_template(template)


@router.patch("/pipeline-templates/{template_code}")
async def route_update_template(template_code: str, payload: TemplateUpdatePayload, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.pipelines", "U"))):
    try:
        template = await update_template(db, template_code=template_code, created_by=_operator(user), **payload.model_dump(exclude_none=True))
    except PipelineTemplateError as error:
        raise _error(error) from error
    return serialize_template(template)


@router.get("/pipeline-templates/{template_code}/versions")
async def route_template_versions(template_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.pipelines", "V"))):
    try:
        return {"items": [serialize_version(item) for item in await list_versions(db, template_code)]}
    except PipelineTemplateError as error:
        raise _error(error) from error


@router.post("/pipeline-templates/{template_code}/rollback")
async def route_rollback_template(template_code: str, payload: RollbackPayload, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.pipelines", "U"))):
    try:
        template = await rollback_to_version(db, template_code=template_code, target_version_id=payload.target_version_id, created_by=_operator(user))
    except PipelineTemplateError as error:
        raise _error(error) from error
    return serialize_template(template)


@router.delete("/pipeline-templates/{template_code}")
async def route_delete_template(template_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.pipelines", "D"))):
    if not await delete_template(db, template_code):
        raise HTTPException(status_code=404, detail="Pipeline template not found")
    return {"deleted": template_code}
