from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.audit import AiAuditTimer, record_ai_log
from app.ai.capabilities import CAPABILITY_BY_ID, CapabilityDefinition, get_capability, visible_capabilities
from app.ai.models import AiProviderConfig
from app.ai.policy_guard import AiPolicyError, policy_profile_for_capability, validate_capability_policy
from app.ai.provider import (
    AiProviderEndpointError,
    AiProviderJsonError,
    chat_completion_openai_compatible,
    parse_json_content,
)
from app.ai.schema_validator import AiSchemaValidationError, schema_from_model, validate_model_payload
from app.ai_formula.router import FormulaDraftIn, FormulaDraftOut, FormulaValidateIn, FormulaValidateOut
from app.ai_formula.router import draft_formula_impl, validate_formula_impl
from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.core.secret_box import decrypt, encrypt
from app.datasets.calculated_fields import CalculatedFieldIn, CalculatedFieldOut
from app.datasets.calculated_fields import create_calculated_field as create_calculated_field_impl
from app.users.models import User


router = APIRouter(prefix="/ai", tags=["ai"])


class AiConfigIn(BaseModel):
    provider: str = "openai_compatible"
    name: str = "Default AI Provider"
    base_url: str | None = None
    api_key: str | None = None
    model_fast_json: str | None = None
    model_reasoning: str | None = None
    timeout_seconds: int = Field(default=30, ge=5, le=120)
    is_enabled: bool = False
    extra_config: dict[str, Any] = Field(default_factory=dict)


class AiConfigOut(BaseModel):
    id: int
    provider: str
    name: str
    base_url: str | None
    has_api_key: bool
    model_fast_json: str | None
    model_reasoning: str | None
    timeout_seconds: int
    is_enabled: bool
    extra_config: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class AiConfigTestIn(BaseModel):
    provider: str = "openai_compatible"
    base_url: str | None = None
    api_key: str | None = None
    model: str = Field(min_length=1, max_length=256)
    timeout_seconds: int = Field(default=30, ge=5, le=120)


class AiConfigTestOut(BaseModel):
    ok: bool
    provider: str
    base_url: str
    model: str
    latency_ms: int
    message: str
    response: dict[str, Any]
    token_usage: dict[str, Any] | None = None


class CapabilityOut(BaseModel):
    capability_id: str
    name: str
    module: str
    type: str
    description: str
    version: str
    is_enabled: bool
    ai_visible: bool
    required_permission: dict[str, str] | None
    risk_level: str
    side_effect_tags: list[str]
    confirmation: str
    tools: list[str]
    policy_profile: dict[str, Any]
    model_profile: str
    audit_enabled: bool
    sensitive_context: str
    examples: list[str]
    failure_modes: list[str]
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]


def _capability_out(item: CapabilityDefinition) -> CapabilityOut:
    permission = None
    if item.required_permission is not None:
        permission = {
            "resource": item.required_permission[0],
            "operation": item.required_permission[1],
        }
    return CapabilityOut(
        capability_id=item.capability_id,
        name=item.name,
        module=item.module,
        type=item.type,
        description=item.description,
        version=item.version,
        is_enabled=item.is_enabled,
        ai_visible=item.ai_visible,
        required_permission=permission,
        risk_level=item.risk_level,
        side_effect_tags=item.side_effect_tags,
        confirmation=item.confirmation,
        tools=item.tools,
        policy_profile=policy_profile_for_capability(item),
        model_profile=item.model_profile,
        audit_enabled=item.audit_enabled,
        sensitive_context=item.sensitive_context,
        examples=item.examples,
        failure_modes=item.failure_modes,
        input_schema=_capability_input_schema(item),
        output_schema=_capability_output_schema(item),
    )


def _ensure_capability(capability_id: str) -> CapabilityDefinition:
    item = get_capability(capability_id)
    if item is None or not item.is_enabled or not item.ai_visible:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Capability 未注册或未启用")
    return item


def _capability_input_schema(item: CapabilityDefinition) -> dict[str, Any]:
    if item.input_schema:
        return item.input_schema
    if item.capability_id in {"formula.generate", "formula.repair"}:
        return schema_from_model(FormulaDraftIn)
    if item.capability_id == "formula.validate":
        return schema_from_model(FormulaValidateIn)
    if item.capability_id == "calculated_field.save":
        return schema_from_model(CalculatedFieldIn)
    return {"type": "object", "properties": {}}


def _capability_output_schema(item: CapabilityDefinition) -> dict[str, Any]:
    if item.output_schema:
        return item.output_schema
    if item.capability_id in {"formula.generate", "formula.repair"}:
        return schema_from_model(FormulaDraftOut)
    if item.capability_id == "formula.validate":
        return schema_from_model(FormulaValidateOut)
    if item.capability_id == "calculated_field.save":
        return schema_from_model(CalculatedFieldOut)
    if item.capability_id == "ai.capability.list":
        return {"type": "array", "items": schema_from_model(CapabilityOut)}
    return {"type": "object", "properties": {}}


def _stamp_capability_schemas() -> None:
    for item in CAPABILITY_BY_ID.values():
        object.__setattr__(item, "input_schema", _capability_input_schema(item))
        object.__setattr__(item, "output_schema", _capability_output_schema(item))


_stamp_capability_schemas()


def _config_out(row: AiProviderConfig) -> AiConfigOut:
    return AiConfigOut(
        id=row.id,
        provider=row.provider,
        name=row.name,
        base_url=row.base_url,
        has_api_key=bool(row.api_key_encrypted),
        model_fast_json=row.model_fast_json,
        model_reasoning=row.model_reasoning,
        timeout_seconds=int(row.timeout_seconds or 30),
        is_enabled=row.is_enabled,
        extra_config=row.extra_config or {},
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/capabilities", response_model=list[CapabilityOut])
async def list_capabilities(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[CapabilityOut]:
    return [_capability_out(item) for item in await visible_capabilities(user, db)]


@router.post(
    "/capabilities/formula.generate/draft",
    response_model=FormulaDraftOut,
    dependencies=[Depends(require_op("datasource.datasets", "C"))],
)
async def draft_formula_capability(
    payload: FormulaDraftIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> FormulaDraftOut:
    timer = AiAuditTimer()
    capability = _ensure_capability("formula.generate")
    try:
        timer.add_event("entry", capability_id=capability.capability_id, route="/ai/capabilities/formula.generate/draft")
        timer.add_event("capability", capability_id=capability.capability_id, risk_level=capability.risk_level)
        validate_model_payload(FormulaDraftIn, payload, label="formula.generate input")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="input")
        validate_capability_policy(capability, used_tools=["dataset.list_fields", "function_catalog.list_enabled", "formula.validate"])
        timer.add_event("policy_validation", capability_id=capability.capability_id, target="capability")
        out = await draft_formula_impl(
            payload=payload,
            user=user,
            db=db,
            timer=timer,
            capability_id=capability.capability_id,
        )
        validate_model_payload(FormulaDraftOut, out, label="formula.generate output")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="output")
        return out
    except (AiSchemaValidationError, AiPolicyError) as exc:
        timer.add_event("failure", status="error", capability_id=capability.capability_id, reason=str(exc))
        await record_ai_log(
            db=db,
            user=user,
            action="formula_draft",
            request_summary=payload.message[:300],
            response_summary=None,
            input_payload=payload.model_dump(),
            output_payload={},
            status="error",
            metadata={"capability_id": capability.capability_id},
            error=str(exc),
            timer=timer,
        )
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/capabilities/formula.validate/diagnose",
    response_model=FormulaValidateOut,
    dependencies=[Depends(require_op("datasource.datasets", "V"))],
)
async def validate_formula_capability(
    payload: FormulaValidateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> FormulaValidateOut:
    timer = AiAuditTimer()
    capability = _ensure_capability("formula.validate")
    try:
        timer.add_event("entry", capability_id=capability.capability_id, route="/ai/capabilities/formula.validate/diagnose")
        timer.add_event("capability", capability_id=capability.capability_id, risk_level=capability.risk_level)
        validate_model_payload(FormulaValidateIn, payload, label="formula.validate input")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="input")
        validate_capability_policy(capability, used_tools=["dataset.list_fields", "function_catalog.list_enabled"])
        timer.add_event("policy_validation", capability_id=capability.capability_id, target="capability")
        out = await validate_formula_impl(
            payload=payload,
            user=user,
            db=db,
            timer=timer,
            capability_id=capability.capability_id,
        )
        validate_model_payload(FormulaValidateOut, out, label="formula.validate output")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="output")
        await record_ai_log(
            db=db,
            user=user,
            action="formula_validate",
            request_summary=payload.formula[:300],
            response_summary="valid" if out.valid else "invalid",
            input_payload=payload.model_dump(),
            output_payload=out.model_dump(),
            status="success" if out.valid else "validation_failed",
            metadata={
                "capability_id": capability.capability_id,
                "depends_on": out.depends_on,
                "used_functions": out.used_functions,
                "error_count": len(out.errors),
            },
            timer=timer,
        )
        await db.commit()
        return out
    except (AiSchemaValidationError, AiPolicyError) as exc:
        timer.add_event("failure", status="error", capability_id=capability.capability_id, reason=str(exc))
        await record_ai_log(
            db=db,
            user=user,
            action="formula_validate",
            request_summary=payload.formula[:300],
            response_summary=None,
            input_payload=payload.model_dump(),
            output_payload={},
            status="error",
            metadata={"capability_id": capability.capability_id},
            error=str(exc),
            timer=timer,
        )
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/capabilities/formula.repair/draft",
    response_model=FormulaDraftOut,
    dependencies=[Depends(require_op("datasource.datasets", "C"))],
)
async def repair_formula_capability(
    payload: FormulaDraftIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> FormulaDraftOut:
    timer = AiAuditTimer()
    capability = _ensure_capability("formula.repair")
    try:
        timer.add_event("entry", capability_id=capability.capability_id, route="/ai/capabilities/formula.repair/draft")
        timer.add_event("capability", capability_id=capability.capability_id, risk_level=capability.risk_level)
        validate_model_payload(FormulaDraftIn, payload, label="formula.repair input")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="input")
        validate_capability_policy(capability, used_tools=["formula.validate", "dataset.list_fields", "function_catalog.list_enabled"])
        timer.add_event("policy_validation", capability_id=capability.capability_id, target="capability")
        out = await draft_formula_impl(
            payload=payload,
            user=user,
            db=db,
            timer=timer,
            capability_id=capability.capability_id,
        )
        validate_model_payload(FormulaDraftOut, out, label="formula.repair output")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="output")
        return out
    except (AiSchemaValidationError, AiPolicyError) as exc:
        timer.add_event("failure", status="error", capability_id=capability.capability_id, reason=str(exc))
        await record_ai_log(
            db=db,
            user=user,
            action="formula_repair",
            request_summary=payload.message[:300],
            response_summary=None,
            input_payload=payload.model_dump(),
            output_payload={},
            status="error",
            metadata={"capability_id": capability.capability_id},
            error=str(exc),
            timer=timer,
        )
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/capabilities/calculated_field.save/write",
    response_model=CalculatedFieldOut,
    dependencies=[Depends(require_op("datasource.datasets", "C"))],
)
async def save_calculated_field_capability(
    dataset_id: int,
    payload: CalculatedFieldIn,
    confirmed: bool = False,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> CalculatedFieldOut:
    timer = AiAuditTimer()
    capability = _ensure_capability("calculated_field.save")
    try:
        timer.add_event("entry", capability_id=capability.capability_id, route="/ai/capabilities/calculated_field.save/write")
        timer.add_event("capability", capability_id=capability.capability_id, risk_level=capability.risk_level)
        validate_model_payload(CalculatedFieldIn, payload, label="calculated_field.save input")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="input")
        validate_capability_policy(capability, confirmed=confirmed, used_tools=["calculated_field.create", "formula.validate"])
        timer.add_event("user_confirmation", capability_id=capability.capability_id, confirmed=confirmed)
        timer.add_event("policy_validation", capability_id=capability.capability_id, target="capability")
        out = await create_calculated_field_impl(ds_id=dataset_id, payload=payload, user=user, db=db)
        validate_model_payload(CalculatedFieldOut, out, label="calculated_field.save output")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="output")
        await record_ai_log(
            db=db,
            user=user,
            action="calculated_field_save",
            request_summary=payload.label[:300],
            response_summary=out.code,
            input_payload={"dataset_id": dataset_id, **payload.model_dump()},
            output_payload=out.model_dump(),
            status="success",
            metadata={
                "capability_id": capability.capability_id,
                "risk_level": capability.risk_level,
                "side_effect_tags": capability.side_effect_tags,
                "confirmed": confirmed,
            },
            timer=timer,
        )
        await db.commit()
        return out
    except (AiSchemaValidationError, AiPolicyError, HTTPException) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        timer.add_event("failure", status="error", capability_id=capability.capability_id, reason=str(detail)[:500])
        await record_ai_log(
            db=db,
            user=user,
            action="calculated_field_save",
            request_summary=payload.label[:300],
            response_summary=None,
            input_payload={"dataset_id": dataset_id, **payload.model_dump()},
            output_payload={},
            status="error",
            metadata={
                "capability_id": capability.capability_id,
                "risk_level": capability.risk_level,
                "side_effect_tags": capability.side_effect_tags,
                "confirmed": confirmed,
            },
            error=str(detail),
            timer=timer,
        )
        await db.commit()
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(detail)) from exc


@router.get(
    "/config",
    response_model=list[AiConfigOut],
    dependencies=[Depends(require_op("system.ai_config", "V"))],
)
async def list_ai_configs(
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[AiConfigOut]:
    rows = (await db.execute(select(AiProviderConfig).order_by(AiProviderConfig.id))).scalars().all()
    return [_config_out(row) for row in rows]


@router.post(
    "/config",
    response_model=AiConfigOut,
    dependencies=[Depends(require_op("system.ai_config", "C"))],
)
async def upsert_ai_config(
    payload: AiConfigIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AiConfigOut:
    row = (
        await db.execute(select(AiProviderConfig).where(AiProviderConfig.provider == payload.provider))
    ).scalar_one_or_none()
    encrypted = encrypt(payload.api_key) if payload.api_key else None
    if payload.is_enabled and not (encrypted or (row and row.api_key_encrypted)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="启用 AI 配置前请填写 API Key")
    if row is None:
        row = AiProviderConfig(
            provider=payload.provider,
            name=payload.name,
            base_url=payload.base_url,
            api_key_encrypted=encrypted,
            model_fast_json=payload.model_fast_json,
            model_reasoning=payload.model_reasoning,
            timeout_seconds=payload.timeout_seconds,
            is_enabled=payload.is_enabled,
            extra_config=payload.extra_config,
            created_by=user.id,
        )
        db.add(row)
    else:
        row.name = payload.name
        row.base_url = payload.base_url
        if encrypted is not None:
            row.api_key_encrypted = encrypted
        row.model_fast_json = payload.model_fast_json
        row.model_reasoning = payload.model_reasoning
        row.timeout_seconds = payload.timeout_seconds
        row.is_enabled = payload.is_enabled
        row.extra_config = payload.extra_config
    await db.commit()
    await db.refresh(row)
    return _config_out(row)


@router.post(
    "/config/test",
    response_model=AiConfigTestOut,
    dependencies=[Depends(require_op("system.ai_config", "V"))],
)
async def test_ai_config(
    payload: AiConfigTestIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AiConfigTestOut:
    timer = AiAuditTimer()
    provider = payload.provider or "openai_compatible"
    if provider != "openai_compatible":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="当前仅支持 OpenAI Compatible Provider 测试")

    row = (
        await db.execute(select(AiProviderConfig).where(AiProviderConfig.provider == provider))
    ).scalar_one_or_none()
    api_key = payload.api_key or (decrypt(row.api_key_encrypted) if row and row.api_key_encrypted else None)
    if not api_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="请填写 API Key，或先保存带密钥的 AI 配置")

    model = payload.model.strip()
    saved_base_url = row.base_url if row else None
    base_url = payload.base_url or saved_base_url or "https://api.openai.com/v1"
    usage: dict[str, Any] | None = None
    try:
        _, content, usage = await chat_completion_openai_compatible(
            api_key=api_key,
            base_url=base_url,
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are testing whether this model can respond.",
                },
                {
                    "role": "user",
                    "content": 'Return a short JSON object: {"ok": true, "message": "model test passed"}',
                },
            ],
            timeout=payload.timeout_seconds,
        )
        raw = parse_json_content(content)
        message = str(raw.get("message") or "模型测试通过")
        out = AiConfigTestOut(
            ok=True,
            provider=provider,
            base_url=base_url,
            model=model,
            latency_ms=timer.elapsed_ms(),
            message=message,
            response=raw,
            token_usage=usage,
        )
        await record_ai_log(
            db=db,
            user=user,
            action="config_test",
            request_summary=f"test model {model}",
            response_summary=message[:500],
            input_payload={"provider": provider, "base_url": base_url, "model": model},
            output_payload={"response": raw},
            status="success",
            metadata={"provider": provider, "base_url": base_url, "model": model},
            token_usage=usage,
            timer=timer,
        )
        await db.commit()
        return out
    except AiProviderEndpointError as exc:
        detail = str(exc)
        await record_ai_log(
            db=db,
            user=user,
            action="config_test",
            request_summary=f"test model {model}",
            response_summary=None,
            input_payload={"provider": provider, "base_url": base_url, "model": model},
            output_payload={},
            status="error",
            metadata={"provider": provider, "base_url": base_url, "model": model, "error_type": "endpoint"},
            error=detail,
            token_usage=usage,
            timer=timer,
        )
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=detail) from exc
    except AiProviderJsonError as exc:
        detail = (
            "模型接口已连通，但返回内容不是可解析的 JSON。"
            "请确认该中转模型支持 JSON 输出，或换用支持 JSON 的模型。"
        )
        if exc.content:
            detail = f"{detail} 返回内容前 300 字: {exc.content[:300]}"
        await record_ai_log(
            db=db,
            user=user,
            action="config_test",
            request_summary=f"test model {model}",
            response_summary=None,
            input_payload={"provider": provider, "base_url": base_url, "model": model},
            output_payload={"raw_content": exc.content[:1000]},
            status="error",
            metadata={"provider": provider, "base_url": base_url, "model": model, "error_type": "json_parse"},
            error=detail,
            token_usage=usage,
            timer=timer,
        )
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=detail) from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:800] if exc.response is not None else str(exc)
        await record_ai_log(
            db=db,
            user=user,
            action="config_test",
            request_summary=f"test model {model}",
            response_summary=None,
            input_payload={"provider": provider, "base_url": base_url, "model": model},
            output_payload={},
            status="error",
            metadata={
                "provider": provider,
                "base_url": base_url,
                "model": model,
                "http_status": exc.response.status_code if exc.response is not None else None,
            },
            error=detail,
            timer=timer,
        )
        await db.commit()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"模型接口返回错误: {detail}",
        ) from exc
    except Exception as exc:
        await record_ai_log(
            db=db,
            user=user,
            action="config_test",
            request_summary=f"test model {model}",
            response_summary=None,
            input_payload={"provider": provider, "base_url": base_url, "model": model},
            output_payload={},
            status="error",
            metadata={"provider": provider, "base_url": base_url, "model": model},
            error=str(exc),
            timer=timer,
        )
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"模型测试失败: {exc}") from exc
