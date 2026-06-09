from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.audit import AiAuditTimer, record_ai_log
from app.ai.provider import generate_json_openai_compatible
from app.ai.service import active_ai_config
from app.ai_formula.custom_functions import (
    available_function_codes,
    enabled_function_rows,
    system_builtin_codes,
)
from app.ai_formula.field_refs import (
    dataset_field_meta,
    dataset_field_meta_for_ai,
    display_to_internal,
    extract_field_refs,
    internal_to_display,
)
from app.ai_formula.function_catalog import base_formula_function_catalog
from app.ai_formula.formula_evaluator import formula_syntax_issues
from app.ai_formula.formula_parser import normalize_formula
from app.ai_formula.models import FormulaFunction, FormulaFunctionCatalogSetting
from app.ai_formula.validator import validate_dataset_formula
from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.core.secret_box import decrypt
from app.datasets.models import DataSet
from app.datasets.router import _can_access
from app.users.models import User


router = APIRouter(tags=["function-library"])


class FormulaFunctionIn(BaseModel):
    code: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    function_type: str = Field(default="expression", pattern="^(system_builtin|expression|data_action)$")
    parameters: list[dict[str, Any]] = Field(default_factory=list)
    return_type: str = "number"
    formula_body: str | None = None
    is_enabled: bool = True
    is_sensitive_output: bool = False


class FormulaFunctionOut(BaseModel):
    id: int | None = None
    code: str
    name: str
    description: str | None = None
    function_type: str
    parameters: list[dict[str, Any]] = Field(default_factory=list)
    return_type: str = "number"
    formula_body: str | None = None
    is_enabled: bool = True
    is_sensitive_output: bool = False
    created_by: int | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    source: str = "managed"
    is_readonly: bool = False
    category: str | None = None
    category_label: str | None = None
    support_status: str = "executable"
    is_executable: bool = True
    is_visible: bool = True
    is_ai_enabled: bool = True


class FormulaFunctionCatalogPatch(BaseModel):
    is_visible: bool | None = None
    is_enabled: bool | None = None
    is_ai_enabled: bool | None = None


class FormulaValidateIn(BaseModel):
    dataset_id: int
    formula: str


class FormulaValidateOut(BaseModel):
    valid: bool
    formula: str
    depends_on: list[str]
    used_functions: list[str]
    is_sensitive: bool
    warnings: list[str]
    errors: list[str]
    preview_value: Any = None


class FormulaDraftIn(BaseModel):
    dataset_id: int
    message: str = Field(min_length=1, max_length=1000)
    current_formula: str | None = None
    current_field_label: str | None = None
    history: list[dict[str, Any]] = Field(default_factory=list)


class FormulaDraftOut(BaseModel):
    intent: str = "formula_draft"
    should_update_formula: bool = True
    field_label: str
    formula_display: str
    formula: str
    data_type: str
    agg_role: str
    explanation: str
    change_summary: str | None = None
    depends_on: list[str]
    used_functions: list[str]
    warnings: list[str]
    validation_status: str = "valid"
    validation_errors: list[str] = Field(default_factory=list)
    standard_excel_formula: str | None = None
    platform_limitation: str | None = None


def _function_out(row: FormulaFunction) -> FormulaFunctionOut:
    return FormulaFunctionOut(
        id=row.id,
        code=row.code,
        name=row.name,
        description=row.description,
        function_type=row.function_type,
        parameters=row.parameters or [],
        return_type=row.return_type,
        formula_body=row.formula_body,
        is_enabled=row.is_enabled,
        is_sensitive_output=row.is_sensitive_output,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        source="managed",
        is_readonly=False,
        support_status="executable",
        is_executable=True,
        is_visible=True,
        is_ai_enabled=True,
    )


def _base_function_out(
    item: dict[str, Any],
    setting: FormulaFunctionCatalogSetting | None = None,
    *,
    enabled_only: bool = False,
) -> FormulaFunctionOut | None:
    support_status = str(item.get("support_status") or "catalog_only")
    is_executable = bool(item.get("is_executable"))
    default_enabled = is_executable
    is_visible = setting.is_visible if setting is not None else True
    is_enabled = setting.is_enabled if setting is not None else default_enabled
    is_ai_enabled = setting.is_ai_enabled if setting is not None else default_enabled
    if not is_executable:
        is_enabled = False
        is_ai_enabled = False
    if enabled_only and (not is_visible or not is_enabled or not is_executable):
        return None
    return FormulaFunctionOut(
        id=None,
        code=str(item["code"]).upper(),
        name=str(item["name"]),
        description=item.get("description"),
        function_type="base_excel",
        parameters=item.get("parameters") or [],
        return_type=str(item.get("return_type") or "any"),
        formula_body=None,
        is_enabled=is_enabled,
        is_sensitive_output=False,
        created_by=None,
        source="base_excel",
        is_readonly=True,
        category=item.get("category"),
        category_label=item.get("category_label"),
        support_status=support_status,
        is_executable=is_executable,
        is_visible=is_visible,
        is_ai_enabled=is_ai_enabled,
    )


async def _ensure_dataset_access(dataset_id: int, user: User, db: AsyncSession) -> None:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据集不存在")
    if not await _can_access(user, ds, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该数据集")


async def _validate_function_payload(
    payload: FormulaFunctionIn,
    db: AsyncSession,
    *,
    current_id: int | None = None,
) -> str:
    code = payload.code.upper()
    duplicate = (
        await db.execute(select(FormulaFunction).where(FormulaFunction.code == code))
    ).scalar_one_or_none()
    if duplicate is not None and duplicate.id != current_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="函数编码已存在")
    if current_id is not None and duplicate is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="函数编码创建后不可修改")
    if payload.function_type == "data_action" and payload.is_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="data_action 函数首期不能启用执行")
    if payload.function_type == "system_builtin" and code not in system_builtin_codes():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"不支持的系统内置函数: {code}")
    if payload.function_type != "expression":
        return code

    body = normalize_formula(payload.formula_body or "")
    if not body:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="表达式型函数必须填写公式体")
    params: list[str] = []
    for item in payload.parameters or []:
        name = str((item or {}).get("name") or "").strip()
        if not name:
            continue
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"参数名不合法: {name}")
        if name in params:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"参数名重复: {name}")
        params.append(name)
    refs = extract_field_refs(body)
    missing = [ref for ref in refs if ref not in set(params)]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"公式体引用了未声明参数: {missing}")
    allowed_functions = {"FIELD"} | await available_function_codes(db)
    issues = formula_syntax_issues(body, allowed_functions=allowed_functions)
    if issues:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="；".join(issues))
    return code


@router.get("/function-library/functions", response_model=list[FormulaFunctionOut])
async def list_functions(
    enabled_only: bool = False,
    include_base: bool = True,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[FormulaFunctionOut]:
    if not enabled_only:
        await require_op("system.function_library", "V")(user, db)
    stmt = select(FormulaFunction).order_by(FormulaFunction.code)
    if enabled_only:
        stmt = stmt.where(FormulaFunction.is_enabled.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    settings = {
        row.code.upper(): row
        for row in (await db.execute(select(FormulaFunctionCatalogSetting))).scalars().all()
    }
    result: list[FormulaFunctionOut] = []
    if include_base:
        for item in base_formula_function_catalog(include_catalog_only=not enabled_only):
            out = _base_function_out(item, settings.get(str(item["code"]).upper()), enabled_only=enabled_only)
            if out is not None:
                result.append(out)
    result.extend(_function_out(row) for row in rows)
    return result


@router.patch(
    "/function-library/catalog/{code}",
    response_model=FormulaFunctionOut,
    dependencies=[Depends(require_op("system.function_library", "U"))],
)
async def update_catalog_function(
    code: str,
    payload: FormulaFunctionCatalogPatch,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> FormulaFunctionOut:
    catalog = {item["code"]: item for item in base_formula_function_catalog(include_catalog_only=True)}
    normalized = code.upper()
    item = catalog.get(normalized)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="函数目录项不存在")
    if not item.get("is_executable") and (payload.is_enabled or payload.is_ai_enabled):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="该函数尚未适配执行，不能启用或开放给 AI")
    row = (
        await db.execute(
            select(FormulaFunctionCatalogSetting).where(FormulaFunctionCatalogSetting.code == normalized)
        )
    ).scalar_one_or_none()
    if row is None:
        row = FormulaFunctionCatalogSetting(
            code=normalized,
            created_by=user.id,
        )
        db.add(row)
    if payload.is_visible is not None:
        row.is_visible = payload.is_visible
    if payload.is_enabled is not None:
        row.is_enabled = payload.is_enabled if item.get("is_executable") else False
    if payload.is_ai_enabled is not None:
        row.is_ai_enabled = payload.is_ai_enabled if item.get("is_executable") else False
    if row.is_enabled or row.is_ai_enabled:
        row.is_visible = True
    if not row.is_visible:
        row.is_enabled = False
        row.is_ai_enabled = False
    if not row.is_enabled:
        row.is_ai_enabled = False
    await db.commit()
    await db.refresh(row)
    out = _base_function_out(item, row)
    if out is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="函数目录状态异常")
    return out


@router.post(
    "/function-library/functions",
    response_model=FormulaFunctionOut,
    dependencies=[Depends(require_op("system.function_library", "C"))],
)
async def create_function(
    payload: FormulaFunctionIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> FormulaFunctionOut:
    code = await _validate_function_payload(payload, db)
    row = FormulaFunction(
        code=code,
        name=payload.name,
        description=payload.description,
        function_type=payload.function_type,
        parameters=payload.parameters,
        return_type=payload.return_type,
        formula_body=payload.formula_body,
        is_enabled=payload.is_enabled,
        is_sensitive_output=payload.is_sensitive_output,
        created_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _function_out(row)


@router.put(
    "/function-library/functions/{function_id}",
    response_model=FormulaFunctionOut,
    dependencies=[Depends(require_op("system.function_library", "U"))],
)
async def update_function(
    function_id: int,
    payload: FormulaFunctionIn,
    db: AsyncSession = Depends(get_session),
) -> FormulaFunctionOut:
    row = await db.get(FormulaFunction, function_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="函数不存在")
    code = await _validate_function_payload(payload, db, current_id=function_id)
    row.code = code
    row.name = payload.name
    row.description = payload.description
    row.function_type = payload.function_type
    row.parameters = payload.parameters
    row.return_type = payload.return_type
    row.formula_body = payload.formula_body
    row.is_enabled = payload.is_enabled
    row.is_sensitive_output = payload.is_sensitive_output
    await db.commit()
    await db.refresh(row)
    return _function_out(row)


async def validate_formula_impl(
    payload: FormulaValidateIn,
    user: User,
    db: AsyncSession,
    *,
    timer: AiAuditTimer | None = None,
    capability_id: str = "formula.validate",
) -> FormulaValidateOut:
    timer = timer or AiAuditTimer()
    timer.add_event("entry", capability_id=capability_id, route="formula_validate")
    await _ensure_dataset_access(payload.dataset_id, user, db)
    timer.add_event("permission_check", capability_id=capability_id, dataset_id=payload.dataset_id)
    _, fields = await dataset_field_meta(payload.dataset_id, db)
    timer.add_event(
        "tool",
        tool_name="dataset.list_fields",
        capability_id=capability_id,
        field_count=len(fields),
    )
    formula = display_to_internal(payload.formula, fields)
    result = await validate_dataset_formula(payload.dataset_id, formula, db)
    timer.add_event(
        "policy_validation",
        capability_id=capability_id,
        status="success" if result["valid"] else "validation_failed",
        error_count=len(result["errors"] or []),
    )
    return FormulaValidateOut(**result)


def _formula_draft_error_detail(exc: Exception) -> str:
    text = str(exc)
    lowered = text.lower()
    if "空公式" in text or "未返回 formula" in text:
        return "模型要求更新公式，但没有返回可写入的公式内容，我没有更新公式。请明确要保留的占位值或字段后重试。"
    if "timeout" in lowered or "timed out" in lowered:
        return "模型生成超时，请稍后重试，或在 AI 基础配置中调大超时时间。"
    if "json" in lowered:
        return "模型返回内容格式不符合要求，请换用支持 JSON 输出的模型，或重新发送更明确的公式需求。"
    if "base url" in lowered or "html" in lowered:
        return "模型接口地址可能不是 OpenAI-compatible API 地址，请检查 AI 基础配置中的 Base URL。"
    if "401" in text or "403" in text or "api key" in lowered or "unauthorized" in lowered:
        return "模型接口鉴权失败，请检查 AI 基础配置中的 API Key 和模型权限。"
    if "ai api key 解密失败" in lowered:
        return "AI 配置中的 API Key 无法读取，请重新保存 AI 基础配置。"
    return "模型这次没有生成可用公式，请继续用更明确的一句话描述计算规则。"


async def draft_formula_impl(
    payload: FormulaDraftIn,
    user: User,
    db: AsyncSession,
    *,
    timer: AiAuditTimer | None = None,
    capability_id: str = "formula.generate",
) -> FormulaDraftOut:
    timer = timer or AiAuditTimer()
    timer.add_event("entry", capability_id=capability_id, route="formula_draft")
    await _ensure_dataset_access(payload.dataset_id, user, db)
    timer.add_event("permission_check", capability_id=capability_id, dataset_id=payload.dataset_id)
    ds, fields, context_policy = await dataset_field_meta_for_ai(payload.dataset_id, user, db)
    timer.add_event(
        "tool",
        tool_name="dataset.list_fields",
        capability_id=capability_id,
        field_count=len(fields),
        filtered_sensitive_count=len(context_policy.get("filtered_sensitive_fields") or []),
    )
    function_rows = await enabled_function_rows(db)
    timer.add_event(
        "tool",
        tool_name="function_catalog.list_enabled",
        capability_id=capability_id,
        function_count=len(function_rows),
    )
    ai_settings = {
        row.code.upper(): row
        for row in (await db.execute(select(FormulaFunctionCatalogSetting))).scalars().all()
    }
    base_functions = [
        out.model_dump(exclude_none=True)
        for item in base_formula_function_catalog()
        if (
            out := _base_function_out(item, ai_settings.get(str(item["code"]).upper()), enabled_only=True)
        )
        and out.is_ai_enabled
    ]
    function_catalog = base_functions + [
        {
            "code": row.code,
            "description": row.description,
            "parameters": row.parameters,
            "return_type": row.return_type,
        }
        for row in function_rows
    ]
    config = await active_ai_config(db)
    request_meta = {
        "dataset_id": ds.id,
        "field_count": len(fields),
        "function_count": len(function_catalog),
        "context_policy": context_policy,
    }
    history = [
        {
            "role": str(item.get("role") or "")[:20],
            "content": str(item.get("content") or "")[:1000],
            "formula": str(item.get("formula") or "")[:1000] if item.get("formula") is not None else None,
        }
        for item in (payload.history or [])[-8:]
        if isinstance(item, dict)
    ]
    try:
        if not config or not config.api_key_encrypted or not config.model_fast_json:
            raise RuntimeError("AI 基础配置未启用，无法生成公式草稿")
        api_key = decrypt(config.api_key_encrypted)
        if not api_key:
            raise RuntimeError("AI API key 解密失败")
        timer.add_event(
            "model_call",
            capability_id=capability_id,
            model=config.model_fast_json,
            provider=getattr(config, "provider", "openai_compatible"),
        )
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an HR report Excel formula assistant. Return JSON only. "
                    "Classify the user request and decide whether the formula editor must change. "
                    "Use intent='formula_question' and should_update_formula=false for explanation-only answers. "
                    "Use intent='formula_draft' and should_update_formula=true when the user asks to create, insert, put, replace, adjust, or update formula content. "
                    "If should_update_formula=true, formula or formula_display is required and must represent the actual formula after the operation. "
                    "Do not claim an operation was completed unless should_update_formula=true and formula/formula_display is provided. "
                    "For edit requests, start from Current formula and return the complete formula after the edit, not an isolated fragment. "
                    "When the user asks to remove a field reference or says they will maintain a value manually, replace the removed reference with a neutral placeholder such as manual_value or value_to_fill while keeping the remaining formula structure. "
                    "Never return an empty formula, bare '=', or unrelated explanation when should_update_formula=true. "
                    "Use FIELD(\"alias.column\") for dataset fields. "
                    "For a function template insertion, use the function metadata parameters to produce a platform formula template, "
                    "for example =IF(condition,value_if_true,value_if_false). "
                    "Use only functions listed in Functions. Do not invent Excel functions or fields. "
                    "For unsupported standard Excel functions, explain the limitation and keep should_update_formula=false unless a platform-saveable formula can be produced. "
                    "Never output SQL, code, URLs, file paths, external links, macros, or unlisted fields. "
                    "Return keys: intent, should_update_formula, field_label, formula_display, formula, data_type, agg_role, explanation, change_summary, warnings, standard_excel_formula, platform_limitation."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Dataset: {ds.name}\n"
                    f"Fields: {[f.__dict__ for f in fields]}\n"
                    f"Functions: {function_catalog}\n"
                    f"Current field label: {payload.current_field_label or ''}\n"
                    f"Current formula: {payload.current_formula or ''}\n"
                    f"Recent chat history: {history}\n"
                    f"User message: {payload.message}\n"
                ),
            },
        ]
        raw, usage = await generate_json_openai_compatible(
            api_key=api_key,
            base_url=config.base_url,
            model=config.model_fast_json,
            messages=messages,
            timeout=int(config.timeout_seconds or 30),
            repair_instructions=(
                "Return keys: intent, should_update_formula, field_label, formula_display, formula, "
                "data_type, agg_role, explanation, change_summary, warnings, "
                "standard_excel_formula, platform_limitation. "
                "If the user asked to insert or update formula content, should_update_formula must be true "
                "and formula or formula_display must contain the complete formula after the edit. "
                "If a field reference is removed for manual maintenance, keep the formula shape and use a placeholder identifier instead of returning an empty formula."
            ),
        )
        timer.add_event("schema_validation", capability_id=capability_id, target="model_json", keys=sorted(raw.keys()))
        raw_formula = raw.get("formula") or raw.get("formula_display") or ""
        should_update_raw = raw.get("should_update_formula")
        should_update = bool(raw_formula) if should_update_raw is None else bool(should_update_raw)
        intent = str(raw.get("intent") or ("formula_draft" if should_update else "formula_question"))
        if should_update:
            if not str(raw_formula).strip():
                raise RuntimeError("模型要求更新公式，但未返回 formula 或 formula_display")
            formula = normalize_formula(
                display_to_internal(str(raw_formula), fields)
            )
            if formula.strip() in {"", "="}:
                raise RuntimeError("模型要求更新公式，但返回了空公式")
            validation = await validate_dataset_formula(payload.dataset_id, formula, db)
            timer.add_event(
                "tool",
                tool_name="formula.validate",
                capability_id=capability_id,
                validation_status="valid" if validation["valid"] else "invalid",
                error_count=len(validation["errors"] or []),
            )
            out = FormulaDraftOut(
                intent=intent,
                should_update_formula=True,
                field_label=raw.get("field_label") or "新建字段",
                formula_display=internal_to_display(formula, fields),
                formula=formula,
                data_type=raw.get("data_type") or "number",
                agg_role=raw.get("agg_role") or "measure",
                explanation=raw.get("explanation") or "",
                change_summary=raw.get("change_summary") or raw.get("explanation") or "",
                depends_on=validation["depends_on"],
                used_functions=validation["used_functions"],
                warnings=[
                    *(raw.get("warnings") or []),
                    *(validation["warnings"] or []),
                ],
                validation_status="valid" if validation["valid"] else "invalid",
                validation_errors=validation["errors"],
                standard_excel_formula=raw.get("standard_excel_formula") or None,
                platform_limitation=raw.get("platform_limitation") or None,
            )
            status_text = "success" if validation["valid"] else "validation_failed"
        else:
            out = FormulaDraftOut(
                intent=intent,
                should_update_formula=False,
                field_label=raw.get("field_label") or "",
                formula_display=payload.current_formula or "",
                formula=payload.current_formula or "",
                data_type=raw.get("data_type") or "number",
                agg_role=raw.get("agg_role") or "measure",
                explanation=raw.get("explanation") or raw.get("change_summary") or "",
                change_summary=raw.get("change_summary") or raw.get("explanation") or "",
                depends_on=[],
                used_functions=[],
                warnings=raw.get("warnings") or [],
                validation_status="valid",
                validation_errors=[],
                standard_excel_formula=raw.get("standard_excel_formula") or None,
                platform_limitation=raw.get("platform_limitation") or None,
            )
            status_text = "success"
        timer.add_event(
            "policy_validation",
            capability_id=capability_id,
            status=status_text,
            should_update_formula=out.should_update_formula,
        )
        await record_ai_log(
            db=db,
            user=user,
            action="formula_draft" if out.should_update_formula else "formula_question",
            request_summary=payload.message[:300],
            response_summary=out.explanation[:500],
            input_payload={
                "message": payload.message,
                "current_formula": payload.current_formula,
                "current_field_label": payload.current_field_label,
                "history_turns": len(history),
                **request_meta,
            },
            output_payload=out.model_dump(),
            status=status_text,
            metadata={
                **request_meta,
                "history_turns": len(history),
                "intent": out.intent,
                "should_update_formula": out.should_update_formula,
                "validation_status": out.validation_status,
            },
            token_usage=usage,
            timer=timer,
        )
        await db.commit()
        return out
    except Exception as exc:
        timer.add_event("failure", status="error", capability_id=capability_id, reason=str(exc)[:500])
        await record_ai_log(
            db=db,
            user=user,
            action="formula_draft",
            request_summary=payload.message[:300],
            response_summary=None,
            input_payload={
                "message": payload.message,
                "current_formula": payload.current_formula,
                "current_field_label": payload.current_field_label,
                "history_turns": len(history),
                **request_meta,
            },
            output_payload={},
            status="error",
            metadata={**request_meta, "history_turns": len(history)},
            error=str(exc),
            timer=timer,
        )
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=_formula_draft_error_detail(exc)) from exc
