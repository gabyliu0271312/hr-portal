"""Evaluation rule and review question APIs."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, require_performance_permission
from app.performance.models import PerformanceReviewQuestion, PerformanceReviewRule


router = APIRouter(prefix="/performance", tags=["performance-review-questions"])

ReviewType = Literal["评级", "评分", "评分映射等级型"]
DisplayMode = Literal["标签样式", "下拉样式"]
QuestionType = Literal["regular", "okr", "bonus", "deduction"]
CalculationRule = Literal["none", "condition"]


class ReviewRuleOption(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    review_type: ReviewType
    status: Literal["active", "inactive"]
    created_at: datetime
    updated_at: datetime
    remark: str
    creator: str
    config_summary: dict[str, Any]
    is_used: bool
    deletable: bool


class ReviewRuleListResponse(BaseModel):
    items: list[ReviewRuleOption]


class ReviewRuleDetail(ReviewRuleOption):
    config: dict[str, Any]


class ReviewRuleWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=128)
    review_type: ReviewType
    config: dict[str, Any] = Field(default_factory=dict)
    remark: str = Field(default="", max_length=2000)


class ReviewQuestionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: Literal["zh-CN"] = "zh-CN"
    name: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="", max_length=1000)
    type: QuestionType
    is_sub_question: bool = False
    parent_question_id: int | None = Field(default=None, gt=0)
    rule_id: int = Field(..., gt=0)
    display_mode: DisplayMode | None = None
    remark: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def validate_parent_relation(self):
        if not self.is_sub_question and self.parent_question_id is not None:
            raise ValueError("普通评估题不能指定父评估题")
        return self


class ReviewQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    language: str
    name: str
    description: str
    type: QuestionType
    is_sub_question: bool
    parent_question_id: int | None
    rule_id: int
    display_mode: DisplayMode
    remark: str
    created_at: datetime
    updated_at: datetime
    rule: ReviewRuleDetail


class ReviewQuestionListResponse(BaseModel):
    items: list[ReviewQuestionResponse]


class ReviewSubQuestionOption(BaseModel):
    id: int
    name: str
    rule_id: int
    rule_name: str
    review_type: Literal["评级", "评分"]
    grade_participates_in_calculation: bool
    score_min: float | None
    score_max: float | None


class ReviewSubQuestionOptionListResponse(BaseModel):
    items: list[ReviewSubQuestionOption]


def _config_summary(rule: PerformanceReviewRule) -> dict[str, Any]:
    config = rule.config or {}
    if rule.review_type == "评级":
        scores = [
            float(value)
            for level in config.get("levels", [])
            if isinstance(level, dict)
            for value in [level.get("quantifiedScore", level.get("quantified_score"))]
            if value not in (None, "")
        ]
        return {
            "grade_participates_in_calculation": bool(
                config.get("gradeParticipatesInCalculation", config.get("grade_participates_in_calculation", False))
            ),
            "level_count": len(config.get("levels", [])),
            "quantified_score_min": min(scores) if scores else None,
            "quantified_score_max": max(scores) if scores else None,
        }
    if rule.review_type == "评分":
        return {
            "method": config.get("method", ""),
            "min": config.get("min", ""),
            "max": config.get("max", ""),
        }
    return {
        "method": config.get("method", ""),
        "min": config.get("min", ""),
        "max": config.get("max", ""),
        "rule": config.get("rule", ""),
    }


def _rule_option(rule: PerformanceReviewRule, *, is_used: bool) -> ReviewRuleOption:
    return ReviewRuleOption(
        id=rule.id,
        name=rule.name,
        review_type=rule.review_type,
        status=rule.status,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
        remark=rule.remark or "",
        creator=rule.created_by_ref,
        config_summary=_config_summary(rule),
        is_used=is_used,
        deletable=not is_used,
    )


def _rule_detail(rule: PerformanceReviewRule, *, is_used: bool) -> ReviewRuleDetail:
    return ReviewRuleDetail(
        **_rule_option(rule, is_used=is_used).model_dump(),
        config=rule.config or {},
    )


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float("inf"), float("-inf")) else None


def _score_bounds(rule: PerformanceReviewRule) -> tuple[float | None, float | None]:
    config = rule.config or {}
    if rule.review_type == "评级":
        values = [
            number
            for level in config.get("levels", [])
            if isinstance(level, dict)
            for number in [_number(level.get("quantifiedScore", level.get("quantified_score")))]
            if number is not None
        ]
        return (min(values), max(values)) if values else (None, None)

    score = config.get("score") if isinstance(config.get("score"), dict) else config
    method = str(score.get("method", score.get("score_method", "")))
    if "固定分值" in method:
        options = score.get("fixedOptions", score.get("fixed_options", []))
        values = [
            number
            for option in options
            if isinstance(option, dict)
            for number in [_number(option.get("value"))]
            if number is not None
        ]
        return (min(values), max(values)) if values else (None, None)
    return _number(score.get("min")), _number(score.get("max"))


def _rating_participates(rule: PerformanceReviewRule) -> bool:
    config = rule.config or {}
    value = config.get("gradeParticipatesInCalculation", config.get("grade_participates_in_calculation", False))
    return value is True or value == 1 or str(value).lower() == "true"


def _sub_question_option(
    question: PerformanceReviewQuestion,
    rule: PerformanceReviewRule,
    calculation_rule: CalculationRule,
) -> ReviewSubQuestionOption | None:
    if not question.is_sub_question or rule.status != "active" or rule.review_type == "评分映射等级型":
        return None
    participates = rule.review_type == "评级" and _rating_participates(rule)
    if calculation_rule == "condition" and not participates:
        return None
    if calculation_rule == "none" and rule.review_type != "评分" and not participates:
        return None
    minimum, maximum = _score_bounds(rule)
    return ReviewSubQuestionOption(
        id=question.id,
        name=question.name,
        rule_id=rule.id,
        rule_name=rule.name,
        review_type=rule.review_type,
        grade_participates_in_calculation=participates,
        score_min=minimum,
        score_max=maximum,
    )


def _question_response(
    question: PerformanceReviewQuestion,
    rule: PerformanceReviewRule,
) -> ReviewQuestionResponse:
    return ReviewQuestionResponse(
        id=question.id,
        language=question.language,
        name=question.name,
        description=question.description,
        type=question.type,
        is_sub_question=question.is_sub_question,
        parent_question_id=question.parent_question_id,
        rule_id=question.rule_id,
        display_mode=question.display_mode or "标签样式",
        remark=question.remark,
        created_at=question.created_at,
        updated_at=question.updated_at,
        rule=_rule_detail(rule, is_used=True),
    )


async def _is_rule_used(db: AsyncSession, rule_id: int) -> bool:
    question_id = (
        await db.execute(
            select(PerformanceReviewQuestion.id)
            .where(PerformanceReviewQuestion.rule_id == rule_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    return question_id is not None


def _restricted_update() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "PERFORMANCE_REVIEW_RULE_EDIT_RESTRICTED",
            "message": "此评估规则已被使用，部分内容不允许修改",
        },
    )


def _validate_used_rating_update(old_config: dict[str, Any], new_config: dict[str, Any]) -> None:
    def display_mode(config: dict[str, Any]) -> str:
        value = config.get("displayMode", config.get("display_mode", "标签样式"))
        if value not in {"标签样式", "下拉样式"}:
            raise _restricted_update()
        return value

    display_mode(old_config)
    display_mode(new_config)
    old_non_levels = {
        key: value for key, value in old_config.items() if key not in {"levels", "displayMode", "display_mode"}
    }
    new_non_levels = {
        key: value for key, value in new_config.items() if key not in {"levels", "displayMode", "display_mode"}
    }
    if old_non_levels != new_non_levels:
        raise _restricted_update()
    old_levels = old_config.get("levels", [])
    new_levels = new_config.get("levels", [])
    if not isinstance(old_levels, list) or not isinstance(new_levels, list) or len(old_levels) != len(new_levels):
        raise _restricted_update()
    editable_keys = {"id", "color", "code", "name", "value"}
    for old_level, new_level in zip(old_levels, new_levels, strict=True):
        if not isinstance(old_level, dict) or not isinstance(new_level, dict):
            raise _restricted_update()
        if {key: value for key, value in old_level.items() if key not in editable_keys} != {
            key: value for key, value in new_level.items() if key not in editable_keys
        }:
            raise _restricted_update()


def _validate_mapping_config(old_mapping: dict[str, Any], new_mapping: dict[str, Any]) -> None:
    if old_mapping.get("min") != new_mapping.get("min") or old_mapping.get("max") != new_mapping.get("max"):
        raise _restricted_update()
    old_intervals = old_mapping.get("intervals", [])
    new_intervals = new_mapping.get("intervals", [])
    if not isinstance(old_intervals, list) or not isinstance(new_intervals, list) or len(old_intervals) != len(new_intervals):
        raise _restricted_update()


def _validate_used_mapping_update(old_config: dict[str, Any], new_config: dict[str, Any]) -> None:
    if isinstance(old_config.get("mapping"), dict):
        if {key: value for key, value in old_config.items() if key != "mapping"} != {
            key: value for key, value in new_config.items() if key != "mapping"
        }:
            raise _restricted_update()
        new_mapping = new_config.get("mapping")
        if not isinstance(new_mapping, dict):
            raise _restricted_update()
        _validate_mapping_config(old_config["mapping"], new_mapping)
        return
    _validate_mapping_config(old_config, new_config)


def _validate_used_rule_update(rule: PerformanceReviewRule, payload: ReviewRuleWriteRequest) -> None:
    if rule.review_type != payload.review_type or (rule.remark or "") != payload.remark:
        raise _restricted_update()
    old_config = rule.config or {}
    if rule.review_type == "评级":
        _validate_used_rating_update(old_config, payload.config)
    elif rule.review_type == "评分":
        if old_config != payload.config:
            raise _restricted_update()
    else:
        _validate_used_mapping_update(old_config, payload.config)


async def _active_rule(db: AsyncSession, rule_id: int, *, for_update: bool = False) -> PerformanceReviewRule:
    rule = await db.get(PerformanceReviewRule, rule_id, **({"with_for_update": True} if for_update else {}))
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PERFORMANCE_REVIEW_RULE_NOT_FOUND", "message": "评估规则不存在"},
        )
    if rule.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "PERFORMANCE_REVIEW_RULE_UNAVAILABLE", "message": "评估规则当前不可用"},
        )
    return rule


@router.get("/review-rules", response_model=ReviewRuleListResponse)
async def list_review_rules(
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> ReviewRuleListResponse:
    rules = (
        await db.execute(
            select(PerformanceReviewRule)
            .where(PerformanceReviewRule.status == "active")
            .order_by(PerformanceReviewRule.created_at.desc(), PerformanceReviewRule.id.desc())
        )
    ).scalars().all()
    used_rule_ids = set()
    if rules:
        used_rule_ids = set(
            (
                await db.execute(
                    select(PerformanceReviewQuestion.rule_id)
                    .where(PerformanceReviewQuestion.rule_id.in_([rule.id for rule in rules]))
                    .distinct()
                )
            ).scalars().all()
        )
    return ReviewRuleListResponse(
        items=[_rule_option(rule, is_used=rule.id in used_rule_ids) for rule in rules]
    )


@router.post(
    "/review-rules",
    response_model=ReviewRuleDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_review_rule(
    payload: ReviewRuleWriteRequest,
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> ReviewRuleDetail:
    rule = PerformanceReviewRule(
        name=payload.name.strip(),
        review_type=payload.review_type,
        status="active",
        config=payload.config,
        remark=payload.remark,
        created_by_type=context.subject_type,
        created_by_ref=str(context.subject_id),
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_detail(rule, is_used=False)


@router.patch(
    "/review-rules/{rule_id}",
    response_model=ReviewRuleDetail,
)
async def update_review_rule(
    rule_id: int,
    payload: ReviewRuleWriteRequest,
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> ReviewRuleDetail:
    rule = await _active_rule(db, rule_id, for_update=True)
    is_used = await _is_rule_used(db, rule_id)
    if is_used:
        _validate_used_rule_update(rule, payload)
    rule.name = payload.name.strip()
    rule.review_type = payload.review_type
    rule.config = payload.config
    rule.remark = payload.remark
    rule.created_by_type = context.subject_type
    rule.created_by_ref = str(context.subject_id)
    await db.commit()
    await db.refresh(rule)
    return _rule_detail(rule, is_used=is_used)


@router.delete("/review-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review_rule(
    rule_id: int,
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> Response:
    rule = await db.get(PerformanceReviewRule, rule_id, with_for_update=True)
    if rule is None or rule.status != "active":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PERFORMANCE_REVIEW_RULE_NOT_FOUND", "message": "评估规则不存在"},
        )
    if await _is_rule_used(db, rule_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "PERFORMANCE_REVIEW_RULE_IN_USE",
                "message": "此评估规则已被使用，不允许删除",
            },
        )
    rule.status = "inactive"
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/review-rules/{rule_id}", response_model=ReviewRuleDetail)
async def get_review_rule(
    rule_id: int,
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> ReviewRuleDetail:
    rule = await _active_rule(db, rule_id)
    return _rule_detail(rule, is_used=await _is_rule_used(db, rule_id))


@router.get("/review-questions", response_model=ReviewQuestionListResponse)
async def list_review_questions(
    review_type: ReviewType | None = None,
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> ReviewQuestionListResponse:
    statement = (
        select(PerformanceReviewQuestion, PerformanceReviewRule)
        .join(PerformanceReviewRule, PerformanceReviewRule.id == PerformanceReviewQuestion.rule_id)
    )
    if review_type is not None:
        statement = statement.where(
            PerformanceReviewRule.review_type == review_type,
            PerformanceReviewRule.status == "active",
        )
    rows = (
        await db.execute(
            statement.order_by(PerformanceReviewQuestion.created_at.desc(), PerformanceReviewQuestion.id.desc())
        )
    ).all()
    return ReviewQuestionListResponse(items=[_question_response(question, rule) for question, rule in rows])


@router.get("/review-questions/sub-question-options", response_model=ReviewSubQuestionOptionListResponse)
async def list_sub_question_options(
    calculation_rule: CalculationRule,
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> ReviewSubQuestionOptionListResponse:
    rows = (
        await db.execute(
            select(PerformanceReviewQuestion, PerformanceReviewRule)
            .join(PerformanceReviewRule, PerformanceReviewRule.id == PerformanceReviewQuestion.rule_id)
            .where(
                PerformanceReviewQuestion.is_sub_question.is_(True),
                PerformanceReviewRule.status == "active",
            )
            .order_by(PerformanceReviewQuestion.created_at.desc(), PerformanceReviewQuestion.id.desc())
        )
    ).all()
    items = [
        option
        for question, rule in rows
        for option in [_sub_question_option(question, rule, calculation_rule)]
        if option is not None
    ]
    return ReviewSubQuestionOptionListResponse(items=items)


@router.get("/review-questions/{question_id}", response_model=ReviewQuestionResponse)
async def get_review_question(
    question_id: int,
    _: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> ReviewQuestionResponse:
    row = (
        await db.execute(
            select(PerformanceReviewQuestion, PerformanceReviewRule)
            .join(PerformanceReviewRule, PerformanceReviewRule.id == PerformanceReviewQuestion.rule_id)
            .where(PerformanceReviewQuestion.id == question_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PERFORMANCE_REVIEW_QUESTION_NOT_FOUND", "message": "评估题不存在"},
        )
    question, rule = row
    if rule.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "PERFORMANCE_REVIEW_RULE_UNAVAILABLE", "message": "评估题关联的评估规则当前不可用"},
        )
    return _question_response(question, rule)


@router.post(
    "/review-questions",
    response_model=ReviewQuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_review_question(
    payload: ReviewQuestionCreateRequest,
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> ReviewQuestionResponse:
    rule = await _active_rule(db, payload.rule_id, for_update=True)
    parent = None
    if payload.parent_question_id is not None:
        parent = await db.get(PerformanceReviewQuestion, payload.parent_question_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "PERFORMANCE_PARENT_QUESTION_NOT_FOUND", "message": "父评估题不存在"},
            )
        if parent.is_sub_question:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "PERFORMANCE_PARENT_QUESTION_INVALID", "message": "子评估题不能作为父评估题"},
            )

    question = PerformanceReviewQuestion(
        language=payload.language,
        name=payload.name.strip(),
        description=payload.description,
        type=payload.type,
        is_sub_question=payload.is_sub_question,
        parent_question_id=payload.parent_question_id,
        rule_id=payload.rule_id,
        display_mode=payload.display_mode or "标签样式",
        remark=payload.remark,
        created_by_type=context.subject_type,
        created_by_ref=str(context.subject_id),
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return _question_response(question, rule)


@router.patch(
    "/review-questions/{question_id}",
    response_model=ReviewQuestionResponse,
)
async def update_review_question(
    question_id: int,
    payload: ReviewQuestionCreateRequest,
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
    db: AsyncSession = Depends(get_session),
) -> ReviewQuestionResponse:
    question = await db.get(PerformanceReviewQuestion, question_id)
    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PERFORMANCE_REVIEW_QUESTION_NOT_FOUND", "message": "评估题不存在"},
        )
    rule = await _active_rule(db, payload.rule_id, for_update=True)
    if payload.parent_question_id is not None:
        parent = await db.get(PerformanceReviewQuestion, payload.parent_question_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "PERFORMANCE_PARENT_QUESTION_NOT_FOUND", "message": "父评估题不存在"},
            )
        if parent.is_sub_question or parent.id == question.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "PERFORMANCE_PARENT_QUESTION_INVALID", "message": "父评估题关系无效"},
            )

    question.language = payload.language
    question.name = payload.name.strip()
    question.description = payload.description
    question.type = payload.type
    question.is_sub_question = payload.is_sub_question
    question.parent_question_id = payload.parent_question_id
    question.rule_id = payload.rule_id
    if payload.display_mode is not None:
        question.display_mode = payload.display_mode
    question.remark = payload.remark
    question.created_by_type = context.subject_type
    question.created_by_ref = str(context.subject_id)
    await db.commit()
    await db.refresh(question)
    return _question_response(question, rule)
