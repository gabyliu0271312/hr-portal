from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.audit import AiAuditTimer, record_ai_log
from app.ai.provider import generate_json_openai_compatible
from app.ai.service import active_ai_config
from app.codegen.rules import normalize_ai_code, suggest_code_from_candidates
from app.core.db import get_session
from app.core.deps import current_user
from app.core.secret_box import decrypt
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


@router.post("/suggest", response_model=CodeSuggestOut)
async def suggest_code(
    payload: CodeSuggestIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> CodeSuggestOut:
    timer = AiAuditTimer()
    existing = set(payload.existing_codes or [])
    if payload.dataset_id is not None:
        existing |= await _dataset_existing_codes(payload.dataset_id, user, db)

    config = await active_ai_config(db)
    ai_candidate: str | None = None
    explanation: str | None = None
    status_text = "fallback"
    usage: dict[str, Any] | None = None
    try:
        if config and config.api_key_encrypted and config.model_fast_json:
            api_key = decrypt(config.api_key_encrypted)
            if not api_key:
                raise RuntimeError("AI API key 解密失败")
            raw, usage = await generate_json_openai_compatible(
                api_key=api_key,
                base_url=config.base_url,
                model=config.model_fast_json,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Return JSON only. Generate a concise English snake_case code "
                            "for a business object name. Use ASCII lowercase letters, "
                            "numbers and underscores only. Do not include explanations outside JSON."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Name: {payload.label}\n"
                            f"Scope: {payload.scope}\n"
                            f"Context: {payload.context or ''}\n"
                            'Return keys: code, explanation. Example: {"code":"employee_tax_amount","explanation":"..."}'
                        ),
                    },
                ],
                timeout=int(config.timeout_seconds or 30),
            )
            ai_candidate = normalize_ai_code(str(raw.get("code") or ""), prefix=payload.prefix)
            explanation = str(raw.get("explanation") or "")[:500] or None
            status_text = "success" if ai_candidate else "fallback"
    except Exception as exc:
        explanation = f"AI 编码建议失败，已使用本地规则：{exc}"
        status_text = "fallback"

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
        },
        token_usage=usage,
        timer=timer,
    )
    await db.commit()
    return out
