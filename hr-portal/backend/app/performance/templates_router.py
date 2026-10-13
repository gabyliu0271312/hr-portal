"""Performance template workflow API."""
from __future__ import annotations

from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, require_performance_permission
from app.performance.models import PerformanceAuditEvent, PerformanceMetricType, PerformanceReviewRule, PerformanceTemplate, PerformanceTemplateWorkflow
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


class MetricTemplateDimension(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, max_length=96)
    name: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)
    need_weight: bool = False
    weight: float | None = Field(default=None, ge=0, le=100)
    metric_type_ids: list[int] = Field(..., min_length=1, max_length=100)
    allow_reviewee_add_metrics: bool = False
    reviewee_add_method: Literal["library", "library_or_custom"] = "library_or_custom"
    reviewee_scoring_method: Literal["manual"] = "manual"
    reviewee_min_one_metric: bool = True
    review_rule_mode: Literal["same", "different"] = "same"
    review_rule_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_ids(self) -> "MetricTemplateDimension":
        if not self.need_weight:
            self.weight = None
        if any(value <= 0 for value in self.metric_type_ids) or len(set(self.metric_type_ids)) != len(self.metric_type_ids):
            raise ValueError("metric_type_ids must contain unique positive IDs")
        if self.review_rule_mode == "same" and self.review_rule_id is None:
            raise ValueError("review_rule_id is required when review_rule_mode is same")
        return self


class TemplateCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)
    language: Literal["zh-CN"] = "zh-CN"
    english_enabled: bool = False
    audience_settings_enabled: bool = False
    template_kind: Literal["performance", "metric"] = "performance"
    score_method: Literal["manual", "dimension_sum", "dimension_weighted", "custom_formula"] = "manual"
    dimensions: list[MetricTemplateDimension] = Field(default_factory=list, max_length=100)
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
    updated_at: str = ""
    updated_by: str = ""


async def _validate_metric_dimensions(db: AsyncSession, dimensions: list[MetricTemplateDimension]) -> None:
    if not dimensions:
        return
    if any(dimension.need_weight and dimension.weight is None for dimension in dimensions):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PERFORMANCE_METRIC_DIMENSION_WEIGHT_REQUIRED", "message": "请填写维度权重"},
        )
    type_ids = {type_id for dimension in dimensions for type_id in dimension.metric_type_ids}
    existing_type_ids = set((await db.execute(select(PerformanceMetricType.id).where(PerformanceMetricType.id.in_(type_ids)))).scalars().all())
    if existing_type_ids != type_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PERFORMANCE_METRIC_TYPE_NOT_FOUND", "message": "指标维度包含不存在的指标类型"},
        )
    rule_ids = {dimension.review_rule_id for dimension in dimensions if dimension.review_rule_id is not None}
    if rule_ids:
        existing_rule_ids = set((await db.execute(select(PerformanceReviewRule.id).where(PerformanceReviewRule.id.in_(rule_ids), PerformanceReviewRule.status == "active"))).scalars().all())
        if existing_rule_ids != rule_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "PERFORMANCE_REVIEW_RULE_NOT_FOUND", "message": "指标维度包含不存在或不可用的评估规则"},
            )


@router.get("", response_model=list[TemplateListItem])
async def list_templates(
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
    template_kind: Literal["performance", "metric"] = "performance",
):
    rows = (await db.execute(select(PerformanceTemplate).where(PerformanceTemplate.template_kind == template_kind).order_by(PerformanceTemplate.created_at.desc()))).scalars().all()
    return [
        TemplateListItem(
            template_id=row.id,
            name=row.name,
            description=row.description,
            status=getattr(row, "status", "inactive"),
            created_at=row.created_at.isoformat() if row.created_at else "",
            updated_at=row.updated_at.isoformat() if row.updated_at else "",
            updated_by=row.created_by_ref,
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
        audience_settings_enabled=getattr(template, "audience_settings_enabled", False),
        template_kind=getattr(template, "template_kind", "performance"),
        score_method=getattr(template, "score_method", "manual"),
        dimensions=[MetricTemplateDimension.model_validate(item) for item in (getattr(template, "dimensions", None) or [])],
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
    template_kind: Literal["performance", "metric"] | None = None,
):
    template = await db.get(PerformanceTemplate, template_id)
    if template is None or (template_kind is not None and template.template_kind != template_kind):
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
    if template is None or getattr(template, "template_kind", "performance") != payload.template_kind:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TEMPLATE_NOT_FOUND", "message": "绩效模板不存在"},
        )

    await _validate_metric_dimensions(db, payload.dimensions)
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
    template.audience_settings_enabled = payload.audience_settings_enabled
    template.score_method = payload.score_method
    template.dimensions = [dimension.model_dump(mode="json") for dimension in payload.dimensions]
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
    await _validate_metric_dimensions(db, payload.dimensions)
    template = PerformanceTemplate(
        name=payload.name.strip(),
        description=payload.description,
        language=payload.language,
        english_enabled=payload.english_enabled,
        audience_settings_enabled=payload.audience_settings_enabled,
        template_kind=payload.template_kind,
        score_method=payload.score_method,
        dimensions=[dimension.model_dump(mode="json") for dimension in payload.dimensions],
        calculation_enabled=payload.calculation_enabled,
        selected_rules=payload.selected_rules,
        created_by_type=context.subject_type,
        created_by_ref=str(context.subject_id),
    )
    db.add(template)
    try:
        await db.flush()
        db.add(PerformanceAuditEvent(
            event_type="PERFORMANCE_TEMPLATE_CREATED",
            actor_type=context.subject_type,
            actor_ref=str(context.subject_id),
            subject_type="PERFORMANCE_TEMPLATE",
            subject_ref=str(template.id),
            before_state={},
            after_state=payload.model_dump(),
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "PERFORMANCE_TEMPLATE_NAME_DUPLICATE", "message": "该模板名称已存在，请重新输入"},
        ) from exc
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
