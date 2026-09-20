"""Tagged fill-in question management APIs."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, require_performance_permission
from app.performance.models import PerformanceTagFillQuestion, PerformanceTemplateWorkflow

router = APIRouter(prefix="/performance/tagged-fill-in-questions", tags=["performance-tagged-fill-in-questions"])
QuestionType = Literal["tag_text"]


class TagFillItemWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = Field(default=None, max_length=128)
    name: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="", max_length=1000)
    prompt: str = Field(default="", max_length=1000)


class TagFillQuestionWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: Literal["zh-CN"] = "zh-CN"
    name: str = Field(..., min_length=1, max_length=500)
    description: str = Field(default="", max_length=20000)
    remark: str = Field(default="", max_length=2000)
    tags: list[TagFillItemWrite] = Field(..., min_length=1)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("名称为必填")
        return value

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[TagFillItemWrite]) -> list[TagFillItemWrite]:
        names: set[str] = set()
        normalized: list[TagFillItemWrite] = []
        for item in value:
            name = item.name.strip()
            if not name:
                raise ValueError("标签名称为必填")
            key = name.casefold()
            if key in names:
                raise ValueError("同一题目内标签名称不能重复")
            names.add(key)
            normalized.append(item.model_copy(update={
                "id": item.id or f"tag-{uuid4().hex}",
                "name": name,
                "description": item.description.strip(),
                "prompt": item.prompt.strip(),
            }))
        return normalized


class TagFillItemResponse(BaseModel):
    id: str
    name: str
    description: str
    prompt: str


class TagFillQuestionResponse(BaseModel):
    id: int
    language: str
    name: str
    description: str
    creator: str
    created_at: datetime
    updated_at: datetime
    remark: str
    tags: list[TagFillItemResponse]


class TagFillQuestionListResponse(BaseModel):
    items: list[TagFillQuestionResponse]
    total: int
    offset: int
    limit: int


class TagFillQuestionOption(BaseModel):
    id: int
    name: str
    description: str
    tags: list[TagFillItemResponse]


class TagFillQuestionOptionListResponse(BaseModel):
    items: list[TagFillQuestionOption]


def _response(question: PerformanceTagFillQuestion) -> TagFillQuestionResponse:
    return TagFillQuestionResponse(
        id=question.id,
        language=question.language,
        name=question.name,
        description=question.description,
        creator=question.created_by_name,
        created_at=question.created_at,
        updated_at=question.updated_at,
        remark=question.remark,
        tags=[TagFillItemResponse.model_validate(tag) for tag in question.tags],
    )


def _option(question: PerformanceTagFillQuestion) -> TagFillQuestionOption:
    response = _response(question)
    return TagFillQuestionOption(id=response.id, name=response.name, description=response.description, tags=response.tags)


def _contains_tag_reference(value: object, question_id: str) -> bool:
    if isinstance(value, dict):
        if str(value.get("tagOptionId", "")) == question_id:
            return True
        return any(_contains_tag_reference(item, question_id) for item in value.values())
    if isinstance(value, list):
        return any(_contains_tag_reference(item, question_id) for item in value)
    return False


async def _get_question(question_id: int, db: AsyncSession) -> PerformanceTagFillQuestion:
    question = await db.get(PerformanceTagFillQuestion, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="标签型填写题不存在")
    return question


@router.get("", response_model=TagFillQuestionListResponse)
async def list_tag_fill_questions(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    question_type: QuestionType = "tag_text",
    keyword: str = Query(default="", max_length=200),
    _context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
) -> TagFillQuestionListResponse:
    filters = []
    keyword = keyword.strip()
    if keyword:
        pattern = f"%{keyword}%"
        filters.append(or_(
            PerformanceTagFillQuestion.name.ilike(pattern),
            PerformanceTagFillQuestion.description.ilike(pattern),
            PerformanceTagFillQuestion.remark.ilike(pattern),
        ))
    base = select(PerformanceTagFillQuestion).where(*filters)
    total = int((await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one())
    rows = (await db.execute(
        base.order_by(PerformanceTagFillQuestion.created_at.desc(), PerformanceTagFillQuestion.id.desc())
        .offset(offset)
        .limit(limit)
    )).scalars().all()
    return TagFillQuestionListResponse(items=[_response(question) for question in rows], total=total, offset=offset, limit=limit)


@router.get("/options", response_model=TagFillQuestionOptionListResponse)
async def list_tag_fill_question_options(
    question_type: QuestionType = "tag_text",
    _context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
) -> TagFillQuestionOptionListResponse:
    rows = (await db.execute(
        select(PerformanceTagFillQuestion).order_by(PerformanceTagFillQuestion.created_at.desc(), PerformanceTagFillQuestion.id.desc())
    )).scalars().all()
    return TagFillQuestionOptionListResponse(items=[_option(question) for question in rows])


@router.get("/{question_id}", response_model=TagFillQuestionResponse)
async def get_tag_fill_question(
    question_id: int,
    _context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
) -> TagFillQuestionResponse:
    return _response(await _get_question(question_id, db))


@router.post("", response_model=TagFillQuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_tag_fill_question(
    payload: TagFillQuestionWriteRequest,
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
) -> TagFillQuestionResponse:
    question = PerformanceTagFillQuestion(
        language=payload.language,
        name=payload.name,
        description=payload.description,
        remark=payload.remark,
        tags=[tag.model_dump() for tag in payload.tags],
        created_by_type=context.subject_type,
        created_by_ref=str(context.subject_id),
        created_by_name=context.display_name,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return _response(question)


@router.put("/{question_id}", response_model=TagFillQuestionResponse)
async def update_tag_fill_question(
    question_id: int,
    payload: TagFillQuestionWriteRequest,
    _context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
) -> TagFillQuestionResponse:
    question = await _get_question(question_id, db)
    question.language = payload.language
    question.name = payload.name
    question.description = payload.description
    question.remark = payload.remark
    question.tags = [tag.model_dump() for tag in payload.tags]
    await db.commit()
    await db.refresh(question)
    return _response(question)


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag_fill_question(
    question_id: int,
    _context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
) -> Response:
    question = await _get_question(question_id, db)
    workflows = (await db.execute(select(PerformanceTemplateWorkflow))).scalars().all()
    reference = str(question_id)
    if any(
        _contains_tag_reference(workflow.content_library, reference)
        or _contains_tag_reference(workflow.nodes, reference)
        for workflow in workflows
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="标签型填写题已被绩效模板引用，不能删除")
    await db.delete(question)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
