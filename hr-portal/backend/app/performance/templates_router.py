"""Performance template workflow API."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, require_performance_permission
from app.performance.models import PerformanceAuditEvent, PerformanceTemplate, PerformanceTemplateWorkflow
from app.performance.template_workflow_service import (
    PerformanceTemplateWorkflowService,
    TemplateWorkflowValidationError,
    normalize_content_library,
)


router = APIRouter(prefix="/performance/templates", tags=["performance-templates"])


class WorkflowNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_id: str | None = Field(default=None, max_length=96)
    node_type: str = Field(..., min_length=1, max_length=48)
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    order: int = Field(..., ge=1)
    executor_types: list[str] = Field(default_factory=list, max_length=32)
    executor_label: str = Field(default="", max_length=64)
    evaluation_type: Literal["SINGLE", "MULTI"] | None = None
    include_final_result: bool = False
    system: bool = False
    allow_invite_other_executors: bool = False
    invite_executor_scope: Literal["ALL", "PARTIAL"] = "ALL"
    invite_executor_types: list[str] = Field(default_factory=list, max_length=32)
    require_previous_node_completion: bool = False
    subject_confirm_required: bool = False
    calibration_reason_enabled: bool = False
    calibration_reason_required: bool = False
    appeal_prompt_content: str = Field(default="", max_length=1500)
    appeal_reason_instruction: str = Field(default="", max_length=1000)
    executor_config: dict | None = None
    content_bindings: dict[str, list[str]] | None = None
    content: list[dict] | None = Field(default=None, max_length=100)


class WorkflowUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nodes: list[WorkflowNode] = Field(..., min_length=1, max_length=100)
    content_library: list[dict] = Field(default_factory=list, max_length=1000)


class UsageSummary(BaseModel):
    cycle_count: int
    project_count: int


class EditableScope(BaseModel):
    workflow: bool
    data_write_settings: bool
    reference_and_prompt_content: bool


class WorkflowResponse(BaseModel):
    template_id: int
    usage_summary: UsageSummary
    editable_scope: EditableScope
    content_library: list[dict] = Field(default_factory=list)
    nodes: list[WorkflowNode]


class TemplateCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)
    language: Literal["zh-CN"] = "zh-CN"
    english_enabled: bool = False
    calculation_enabled: bool = False
    selected_rules: list[str] = Field(default_factory=list, max_length=16)


class TemplateCreateResponse(BaseModel):
    template_id: int
    name: str


class TemplateDetailResponse(TemplateCreateRequest):
    template_id: int
    status: Literal["active", "inactive"]
    created_at: str
    updated_at: str


class TemplateListItem(BaseModel):
    template_id: int
    name: str
    description: str
    status: Literal["active", "inactive"]
    created_at: str


@router.get("", response_model=list[TemplateListItem])
async def list_templates(
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
):
    rows = (await db.execute(select(PerformanceTemplate).order_by(PerformanceTemplate.created_at.desc()))).scalars().all()
    return [
        TemplateListItem(
            template_id=row.id,
            name=row.name,
            description=row.description,
            status=getattr(row, "status", "inactive"),
            created_at=row.created_at.isoformat() if row.created_at else "",
        )
        for row in rows
    ]


def _template_detail(template: PerformanceTemplate) -> TemplateDetailResponse:
    return TemplateDetailResponse(
        template_id=template.id,
        name=template.name,
        description=template.description,
        status=getattr(template, "status", "inactive"),
        language=template.language,
        english_enabled=template.english_enabled,
        calculation_enabled=template.calculation_enabled,
        selected_rules=template.selected_rules,
        created_at=template.created_at.isoformat() if template.created_at else "",
        updated_at=template.updated_at.isoformat() if template.updated_at else "",
    )


@router.get("/{template_id}", response_model=TemplateDetailResponse)
async def get_template(
    template_id: int,
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
):
    template = await db.get(PerformanceTemplate, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TEMPLATE_NOT_FOUND", "message": "绩效模板不存在"},
        )
    return _template_detail(template)


@router.patch("/{template_id}", response_model=TemplateDetailResponse)
async def update_template(
    template_id: int,
    payload: TemplateCreateRequest,
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
):
    template = await db.get(PerformanceTemplate, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TEMPLATE_NOT_FOUND", "message": "绩效模板不存在"},
        )

    name = payload.name.strip()
    existing = await db.execute(
        select(PerformanceTemplate).where(
            PerformanceTemplate.name == name,
            PerformanceTemplate.id != template_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "PERFORMANCE_TEMPLATE_NAME_DUPLICATE", "message": "该模板名称已存在，请重新输入"},
        )

    before_state = _template_detail(template).model_dump()
    template.name = name
    template.description = payload.description
    template.language = payload.language
    template.english_enabled = payload.english_enabled
    template.calculation_enabled = payload.calculation_enabled
    template.selected_rules = payload.selected_rules
    db.add(
        PerformanceAuditEvent(
            event_type="PERFORMANCE_TEMPLATE_UPDATED",
            actor_type=context.subject_type,
            actor_ref=str(context.subject_id),
            subject_type="PERFORMANCE_TEMPLATE",
            subject_ref=str(template_id),
            before_state=before_state,
            after_state=_template_detail(template).model_dump(),
        )
    )
    await db.commit()
    await db.refresh(template)
    return _template_detail(template)


@router.patch("/{template_id}/status", response_model=TemplateListItem)
async def update_template_status(
    template_id: int,
    payload: dict[str, Literal["active", "inactive"]],
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
):
    template = await db.get(PerformanceTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="绩效模板不存在")
    next_status = payload.get("status")
    if next_status not in {"active", "inactive"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="模板状态不合法")
    before_state = _template_detail(template).model_dump()
    template.status = next_status
    db.add(PerformanceAuditEvent(
        event_type="PERFORMANCE_TEMPLATE_STATUS_UPDATED",
        actor_type=context.subject_type,
        actor_ref=str(context.subject_id),
        subject_type="PERFORMANCE_TEMPLATE",
        subject_ref=str(template_id),
        before_state=before_state,
        after_state={**before_state, "status": next_status},
    ))
    await db.commit()
    await db.refresh(template)
    return TemplateListItem(
        template_id=template.id,
        name=template.name,
        description=template.description,
        status=template.status,
        created_at=template.created_at.isoformat() if template.created_at else "",
    )

@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
):
    template = await db.get(PerformanceTemplate, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TEMPLATE_NOT_FOUND", "message": "绩效模板不存在"},
        )

    workflow = await db.get(PerformanceTemplateWorkflow, template_id)
    before_state = _template_detail(template).model_dump()
    before_state["usage_summary"] = {
        "cycle_count": workflow.cycle_count if workflow is not None else 0,
        "project_count": workflow.project_count if workflow is not None else 0,
    }
    if workflow is not None:
        await db.delete(workflow)
    await db.delete(template)
    db.add(
        PerformanceAuditEvent(
            event_type="PERFORMANCE_TEMPLATE_DELETED",
            actor_type=context.subject_type,
            actor_ref=str(context.subject_id),
            subject_type="PERFORMANCE_TEMPLATE",
            subject_ref=str(template_id),
            before_state=before_state,
            after_state={"deleted": True},
        )
    )
    await db.commit()


@router.post("", response_model=TemplateCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateCreateRequest,
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
):
    existing = await db.execute(select(PerformanceTemplate).where(PerformanceTemplate.name == payload.name.strip()))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "PERFORMANCE_TEMPLATE_NAME_DUPLICATE", "message": "该模板名称已存在，请重新输入"},
        )
    template = PerformanceTemplate(
        name=payload.name.strip(),
        description=payload.description,
        language=payload.language,
        english_enabled=payload.english_enabled,
        calculation_enabled=payload.calculation_enabled,
        selected_rules=payload.selected_rules,
        created_by_type=context.subject_type,
        created_by_ref=str(context.subject_id),
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return TemplateCreateResponse(template_id=template.id, name=template.name)


def _response(template_id: int, nodes: list[dict], cycle_count: int, project_count: int, content_library: list[dict] | None = None) -> WorkflowResponse:
    unlocked = cycle_count == 0
    return WorkflowResponse(
        template_id=template_id,
        usage_summary=UsageSummary(cycle_count=cycle_count, project_count=project_count),
        editable_scope=EditableScope(
            workflow=unlocked,
            data_write_settings=unlocked,
            reference_and_prompt_content=True,
        ),
        content_library=content_library or [],
        nodes=[WorkflowNode.model_validate(node) for node in nodes],
    )


@router.get("/{template_id}/workflow", response_model=WorkflowResponse)
async def get_template_workflow(
    template_id: int,
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
):
    service = PerformanceTemplateWorkflowService(db)
    nodes, cycle_count, project_count = await service.get_nodes(template_id)
    return _response(template_id, nodes, cycle_count, project_count, await service.get_content_library(template_id))


@router.patch("/{template_id}/workflow", response_model=WorkflowResponse)
async def update_template_workflow(
    template_id: int,
    payload: WorkflowUpdate,
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
):
    service = PerformanceTemplateWorkflowService(db)
    existing = await service.get_record(template_id)
    if existing is not None and existing.cycle_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "TEMPLATE_WORKFLOW_LOCKED", "message": "模板流程已被周期使用，无法修改"},
        )
    try:
        record = await service.save_nodes(
            template_id,
            [node.model_dump() for node in payload.nodes],
            content_library=payload.content_library,
            actor_type=context.subject_type,
            actor_ref=str(context.subject_id),
        )
    except TemplateWorkflowValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "TEMPLATE_WORKFLOW_INVALID",
                "message": str(exc),
                "node_id": exc.node_id,
            },
        ) from exc
    return _response(template_id, record.nodes, record.cycle_count, record.project_count, record.content_library)
