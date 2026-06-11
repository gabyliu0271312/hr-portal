from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.audit import AiAuditTimer, record_ai_log
from app.ai.capabilities import get_capability
from app.ai.policy_guard import validate_capability_policy
from app.codegen.rules import suggest_code_from_candidates
from app.codegen.service import ai_translate_code
from app.core.db import get_session
from app.core.deps import current_user
from app.datasets.models import DataSet, DatasetCalculatedField
from app.datasets.router import _can_access
from app.users.models import User


router = APIRouter(prefix="/codegen", tags=["codegen"])


class CodeSuggestIn(BaseModel):
    label: str = Field(min_length=1, max_length=128)
    scope: str = Field(default="generic", max_length=64)
    prefix: str = Field(default="", pattern=r"^[a-z][a-z0-9_]{0,15}$|^$")
    context: str | None = Field(default=None, max_length=500)
    existing_codes: list[str] = Field(default_factory=list, max_length=500)
    dataset_id: int | None = None


class CodeSuggestOut(BaseModel):
    code: str
    base_code: str
    source: str
    rule: str
    candidates: list[str]
    explanation: str | None = None


async def _dataset_existing_codes(dataset_id: int, user: User, db: AsyncSession) -> set[str]:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据集不存在")
    if not await _can_access(user, ds, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该数据集")
    return {
        code
        for (code,) in (
            await db.execute(
                select(DatasetCalculatedField.code).where(
                    DatasetCalculatedField.dataset_id == dataset_id
                )
            )
        ).all()
    }


async def _ai_translate_code(
    db: AsyncSession, *, label: str, scope: str, prefix: str, context: str | None
) -> tuple[str | None, str | None, dict | None]:
    return await ai_translate_code(db, label=label, scope=scope, prefix=prefix, context=context)


@router.post("/suggest", response_model=CodeSuggestOut)
async def suggest_code(
    payload: CodeSuggestIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> CodeSuggestOut:
    timer = AiAuditTimer()
    capability_id = "codegen.suggest"
    timer.add_event("entry", capability_id=capability_id, scope=payload.scope)
    existing = set(payload.existing_codes or [])
    if payload.dataset_id is not None:
        existing |= await _dataset_existing_codes(payload.dataset_id, user, db)

    # 能力注册表 + 策略闸门:确认 codegen.suggest 已注册且放行(low/draft_only)
    capability = get_capability(capability_id)
    ai_allowed = False
    if capability is not None:
        try:
            validate_capability_policy(capability)
            ai_allowed = capability.is_enabled and capability.model_profile == "fast_json"
        except Exception:
            ai_allowed = False

    ai_candidate: str | None = None
    explanation: str | None = "AI 未启用，已使用本地规则生成。"
    status_text = "fallback"
    usage = None
    if ai_allowed:
        timer.add_event("model_call", capability_id=capability_id)
        ai_candidate, explanation, usage = await _ai_translate_code(
            db,
            label=payload.label,
            scope=payload.scope,
            prefix=payload.prefix,
            context=payload.context,
        )
        if ai_candidate:
            status_text = "ok"

    suggestion = suggest_code_from_candidates(
        label=payload.label,
        prefix=payload.prefix,
        existing=existing,
        ai_candidate=ai_candidate,
    )
    out = CodeSuggestOut(
        code=suggestion.code,
        base_code=suggestion.base_code,
        source=suggestion.source,
        rule=suggestion.rule,
        candidates=suggestion.candidates,
        explanation=explanation,
    )
    await record_ai_log(
        db=db,
        user=user,
        action="code_suggest",
        request_summary=payload.label,
        response_summary=out.code,
        input_payload=payload.model_dump(),
        output_payload=out.model_dump(),
        status=status_text,
        metadata={
            "scope": payload.scope,
            "prefix": payload.prefix,
            "source": out.source,
            "rule": out.rule,
            "capability_id": capability_id,
            "ai_allowed": ai_allowed,
        },
        token_usage=usage,
        timer=timer,
    )
    await db.commit()
    return out
