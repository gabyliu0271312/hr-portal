"""Visual pipeline template CRUD endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.ucp.pipeline_node_catalog import node_type_metadata
from app.ucp.pipeline_template import (
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
    return {"node_types": node_type_metadata(), "node_count_limit": 100}


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


@router.get("/pipeline-templates/{template_code}/field-catalog")
async def route_field_catalog(
    template_code: str,
    node_id: str | None = None,
    refresh: bool = False,
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.pipelines", "V")),
):
    """返回编排节点可用的业务字段目录，合并 schema 与最近成功运行字段。"""
    from app.data.models import TableColumn
    from app.ucp.models import UcpPipelineStepExecution

    template = await get_template(db, template_code)
    if template is None:
        raise HTTPException(status_code=404, detail="Pipeline template not found")
    nodes = template.nodes_json or []
    edges = template.edges_json or []
    target_asset = None
    source_node_id = node_id
    if node_id:
        incoming = next((edge for edge in edges if edge.get("to") == node_id), None)
        source_node_id = incoming.get("from") if incoming else node_id
    target_node = next((node for node in nodes if node.get("id") == node_id), None)
    if target_node and target_node.get("type") == "TRANSFORM":
        sink = next((node for node in nodes if node.get("type") == "WAREHOUSE_ASSET_SINK"), None)
        target_asset = (sink or {}).get("config", {}).get("target_asset")

    catalog: dict[str, dict] = {}
    source_node = next((node for node in nodes if node.get("id") == source_node_id), None)
    if source_node:
        config = source_node.get("config") or {}
        for field in config.get("field_catalog") or config.get("mapping_source_catalog") or []:
            if isinstance(field, dict) and field.get("field_id"):
                catalog[field["field_id"]] = {**field, "source": "schema"}
        if source_node.get("type") == "RECORD_MERGE":
            upstream_edge = next((edge for edge in edges if edge.get("to") == source_node_id), None)
            upstream = next((node for node in nodes if node.get("id") == (upstream_edge or {}).get("from")), None)
            upstream_config = (upstream or {}).get("config") or {}
            for field in upstream_config.get("field_catalog") or upstream_config.get("mapping_source_catalog") or []:
                if isinstance(field, dict) and field.get("field_id"):
                    catalog.setdefault(field["field_id"], {**field, "source": "schema"})
            for rule in config.get("field_mapping") or []:
                if isinstance(rule, dict) and rule.get("target"):
                    catalog[rule["target"]] = {"field_id": rule["target"], "label": rule.get("target"), "type": "number" if "salary" in str(rule.get("target")) or "bonus" in str(rule.get("target")) else "string", "source": "schema"}

    if target_asset:
        columns = (await db.execute(select(TableColumn).where(TableColumn.table_name == target_asset).order_by(TableColumn.display_order))).scalars().all()
        target_catalog = [{"field_id": column.column_code, "label": column.column_label, "type": column.data_type, "is_pk_part": column.is_pk_part, "is_sensitive": column.is_sensitive, "source": "asset"} for column in columns]
    else:
        target_catalog = []

    run = (await db.execute(select(UcpPipelineStepExecution.output_snapshot).where(UcpPipelineStepExecution.step_id == source_node_id, UcpPipelineStepExecution.status == "SUCCESS").order_by(UcpPipelineStepExecution.id.desc()).limit(1))).scalar_one_or_none()
    runtime_sample = (run or {}).get("sample") if isinstance(run, dict) else None
    if isinstance(runtime_sample, list):
        for row in runtime_sample:
            if not isinstance(row, dict):
                continue
            for field_id, value in row.items():
                catalog.setdefault(field_id, {"field_id": field_id, "label": field_id, "type": "string", "source": "runtime"})

    return {"node_id": node_id, "source_node_id": source_node_id, "source_fields": list(catalog.values()), "target_fields": target_catalog, "refreshed": refresh}


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
