from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.audit import AiAuditTimer, record_ai_log
from app.ai.capabilities import CAPABILITY_BY_ID, CapabilityDefinition, get_capability, user_has_permission, visible_capabilities
from app.ai.models import AiProviderConfig
from app.ai.policy_guard import AiPolicyError, policy_profile_for_capability, validate_capability_policy
from app.ai.provider import (
    AiProviderEndpointError,
    AiProviderJsonError,
    chat_completion_openai_compatible,
    parse_json_content,
)
from app.ai.schema_validator import AiSchemaValidationError, schema_from_model, validate_model_payload
from app.ai.service import active_ai_config
from app.ai_formula.router import FormulaDraftIn, FormulaDraftOut, FormulaValidateIn, FormulaValidateOut
from app.ai_formula.router import draft_formula_impl, validate_formula_impl
from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.core.secret_box import decrypt, encrypt
from app.datasets.calculated_fields import CalculatedFieldIn, CalculatedFieldOut
from app.datasets.calculated_fields import create_calculated_field as create_calculated_field_impl
from app.system.models import SystemLog
from app.tools.router import (
    CompensationCalcIn,
    CompensationCalcOut,
    EmployeeCandidate,
    _calc_core as calculate_compensation_impl,
    search_compensation_employees,
)
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


class ReportExplainHistoryItem(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=2000)


class ReportExplainConfigIn(BaseModel):
    report_id: int | None = Field(default=None, ge=1)
    report_name: str = Field(default="", max_length=128)
    description: str | None = Field(default=None, max_length=1000)
    columns: list[str] = Field(default_factory=list, max_length=100)
    filters: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    sorts: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    aggregate: bool = False
    aggregations: dict[str, str] = Field(default_factory=dict)
    column_settings: dict[str, dict[str, Any]] = Field(default_factory=dict)
    question: str | None = Field(default=None, max_length=1000)
    history: list[ReportExplainHistoryItem] = Field(default_factory=list, max_length=20)


class ReportExplainConfigOut(BaseModel):
    answer: str | None = None
    summary: str
    field_count: int
    filter_count: int
    sort_count: int
    aggregation_count: int
    visible_fields: list[str]
    warnings: list[str]
    context_packet: dict[str, Any]
    mode: str = "read_only_chat"
    trace_id: str | None = None


class AiChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=2000)


class CompensationChatContext(BaseModel):
    employee_id: int | None = Field(default=None, ge=1)
    employee_keyword: str | None = Field(default=None, max_length=100)
    employee_name: str | None = Field(default=None, max_length=100)
    leave_date: date | None = None
    plan: str | None = Field(default=None, max_length=8)
    region: str | None = Field(default=None, max_length=80)


class AiChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    page_path: str | None = Field(default=None, max_length=300)
    history: list[AiChatMessage] = Field(default_factory=list, max_length=20)
    selected_employee_id: int | None = Field(default=None, ge=1)
    compensation_context: CompensationChatContext | None = None


class AiActionOut(BaseModel):
    type: str
    label: str
    route: str
    query: dict[str, Any] = Field(default_factory=dict)


class AiChatOut(BaseModel):
    intent: str
    answer: str
    status: str
    trace_id: str | None = None
    actions: list[AiActionOut] = Field(default_factory=list)
    candidates: list[EmployeeCandidate] = Field(default_factory=list)
    compensation: CompensationCalcOut | None = None
    compensation_context: CompensationChatContext | None = None
    missing_fields: list[str] = Field(default_factory=list)
    extracted: dict[str, Any] = Field(default_factory=dict)


class AiBadCaseCaptureIn(BaseModel):
    trace_id: str = Field(min_length=8, max_length=128)
    capability_id: str | None = Field(default=None, max_length=128)
    source: str = Field(pattern="^(failure|user_abandon|backend_validation_rejected|manual_mark)$")
    failure_stage: str = Field(
        default="unknown",
        pattern="^(prompt|schema|field|function|backend|policy|tool|model|user|unknown)$",
    )
    user_message: str | None = Field(default=None, max_length=1000)
    formula: str | None = Field(default=None, max_length=2000)
    reason: str = Field(min_length=1, max_length=1000)
    repair_suggestion: str | None = Field(default=None, max_length=1000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AiBadCaseCaptureOut(BaseModel):
    captured: bool
    source_trace_id: str
    capture_trace_id: str
    source_log_found: bool


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
    if item.capability_id == "ai.chat":
        return schema_from_model(AiChatIn)
    if item.capability_id == "compensation.employee_resolve":
        return {"type": "object", "properties": {"keyword": {"type": "string"}}}
    if item.capability_id == "compensation.calculate_preview":
        return schema_from_model(CompensationCalcIn)
    if item.capability_id == "report.explain_config":
        return schema_from_model(ReportExplainConfigIn)
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
    if item.capability_id == "ai.chat":
        return schema_from_model(AiChatOut)
    if item.capability_id == "compensation.employee_resolve":
        return {"type": "array", "items": schema_from_model(EmployeeCandidate)}
    if item.capability_id == "compensation.calculate_preview":
        return schema_from_model(CompensationCalcOut)
    if item.capability_id == "report.explain_config":
        return schema_from_model(ReportExplainConfigOut)
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


def _report_explain_payload_from_row(row: Any) -> ReportExplainConfigIn:
    config = row.config or {}
    return ReportExplainConfigIn(
        report_id=row.id,
        report_name=row.name,
        description=row.description,
        columns=list(config.get("columns") or []),
        filters=list(config.get("filters") or []),
        sorts=list(config.get("sorts") or []),
        aggregate=bool(config.get("aggregate")),
        aggregations=dict(config.get("aggregations") or {}),
        column_settings=dict(config.get("column_settings") or {}),
    )


def _explain_report_config(payload: ReportExplainConfigIn) -> ReportExplainConfigOut:
    settings = payload.column_settings or {}
    visible_fields = [
        column
        for column in payload.columns
        if not (settings.get(column) or {}).get("hidden")
    ]
    hidden_count = len(payload.columns) - len(visible_fields)
    warnings: list[str] = []
    if not payload.columns:
        warnings.append("报表未配置展示字段。")
    if hidden_count:
        warnings.append(f"有 {hidden_count} 个已选字段被配置为隐藏。")
    if payload.aggregate and not payload.aggregations:
        warnings.append("报表已开启聚合，但未配置字段级聚合方式，将使用默认聚合规则。")

    title = payload.report_name or "未命名报表"
    parts = [
        f"报表「{title}」当前展示 {len(visible_fields)} 个字段",
        f"包含 {len(payload.filters)} 个筛选条件",
        f"{len(payload.sorts)} 个排序规则",
    ]
    if payload.aggregate:
        parts.append(f"已开启聚合，配置了 {len(payload.aggregations)} 个字段聚合方式")
    summary = "，".join(parts) + "。"

    context_packet = {
        "page": {
            "kind": "report_config",
            "report_id": payload.report_id,
            "report_name": payload.report_name,
        },
        "permission": {
            "required": {"resource": "report.list", "operation": "V"},
            "mode": "read_only",
        },
        "data": {
            "columns": payload.columns,
            "visible_fields": visible_fields,
            "filters": payload.filters,
            "sorts": payload.sorts,
            "aggregate": payload.aggregate,
            "aggregations": payload.aggregations,
        },
        "attachments": [],
        "domain_context": {
            "capability_id": "report.explain_config",
            "side_effect": "none",
        },
    }
    return ReportExplainConfigOut(
        answer=summary,
        summary=summary,
        field_count=len(payload.columns),
        filter_count=len(payload.filters),
        sort_count=len(payload.sorts),
        aggregation_count=len(payload.aggregations),
        visible_fields=visible_fields,
        warnings=warnings,
        context_packet=context_packet,
    )


def _report_config_snapshot(payload: ReportExplainConfigIn, base: ReportExplainConfigOut) -> dict[str, Any]:
    visible_preview = base.visible_fields[:30]
    filter_preview = payload.filters[:20]
    sort_preview = payload.sorts[:20]
    aggregation_preview = dict(list(payload.aggregations.items())[:30])
    return {
        "report": {
            "id": payload.report_id,
            "name": payload.report_name or "未命名报表",
            "description": payload.description or "",
        },
        "counts": {
            "fields": base.field_count,
            "visible_fields": len(base.visible_fields),
            "filters": base.filter_count,
            "sorts": base.sort_count,
            "aggregations": base.aggregation_count,
        },
        "visible_fields_preview": visible_preview,
        "omitted_visible_field_count": max(len(base.visible_fields) - len(visible_preview), 0),
        "filters_preview": filter_preview,
        "omitted_filter_count": max(len(payload.filters) - len(filter_preview), 0),
        "sorts_preview": sort_preview,
        "omitted_sort_count": max(len(payload.sorts) - len(sort_preview), 0),
        "aggregate": payload.aggregate,
        "aggregations_preview": aggregation_preview,
        "omitted_aggregation_count": max(len(payload.aggregations) - len(aggregation_preview), 0),
        "warnings": base.warnings,
        "constraints": {
            "mode": "read_only",
            "can_modify_report": False,
            "can_save_report": False,
            "allowed_scope": "解释当前报表配置、回答报表配置理解问题、说明功能阶段规划",
        },
    }


def _fallback_report_answer(payload: ReportExplainConfigIn, base: ReportExplainConfigOut) -> str:
    question = (payload.question or "").strip()
    if not question:
        return base.summary
    return (
        f"基于当前报表配置：{base.summary}\n\n"
        f"你的问题是：{question}\n\n"
        "当前 AI 解释是只读能力，可以解释配置含义、风险和后续规划，不能替你修改或保存报表。"
        "需要改配置时，请在页面中手动调整。"
    )


async def _answer_report_config_with_model(
    *,
    payload: ReportExplainConfigIn,
    base: ReportExplainConfigOut,
    db: AsyncSession,
    timer: AiAuditTimer,
) -> tuple[str, dict[str, Any] | None, str]:
    config = await active_ai_config(db)
    if not config or not config.api_key_encrypted or not (config.model_reasoning or config.model_fast_json):
        return _fallback_report_answer(payload, base), None, "fallback_no_model"

    api_key = decrypt(config.api_key_encrypted)
    model = (config.model_reasoning or config.model_fast_json or "").strip()
    snapshot = _report_config_snapshot(payload, base)
    history = [
        {"role": item.role, "content": item.content}
        for item in payload.history[-8:]
    ]
    question = (payload.question or "请解释当前报表配置。").strip()
    messages = [
        {
            "role": "system",
            "content": (
                "你是 HR 报表设计器内的只读 AI 解释助手。"
                "只能解释当前报表配置、字段/筛选/排序/聚合含义、潜在风险和路线图阶段问题。"
                "禁止声称你已经修改、应用、保存、发布或运行报表。"
                "如果用户要求你直接配置或保存，必须说明当前阶段只能解释和追问，配置草稿/应用到当前报表属于后续 draft 能力。"
                "不要输出 JSON，不要编造页面里不存在的字段。"
            ),
        },
        {
            "role": "user",
            "content": (
                "当前报表配置快照如下，请基于它回答后续问题：\n"
                f"{json.dumps(snapshot, ensure_ascii=False, default=str)}"
            ),
        },
        *history,
        {"role": "user", "content": question},
    ]
    timer.add_event("model_call", capability_id="report.explain_config", model=model)
    _, content, usage = await chat_completion_openai_compatible(
        api_key=api_key,
        base_url=config.base_url,
        model=model,
        messages=messages,
        timeout=int(config.timeout_seconds or 30),
    )
    answer = (content or "").strip()
    if not answer:
        answer = _fallback_report_answer(payload, base)
    return answer, usage, "model"


def _normalize_plan(value: Any) -> str:
    text = str(value or "").upper().replace(" ", "")
    return "N" if text == "N" else "N+1"


def _normalize_optional_plan(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return _normalize_plan(value)


def _context_employee_keyword(context: CompensationChatContext | None) -> str:
    if context is None:
        return ""
    return _normalize_employee_keyword(context.employee_keyword or context.employee_name or "")


def _context_to_extracted(context: CompensationChatContext | None) -> dict[str, Any]:
    if context is None:
        return {}
    return {
        "employee_id": context.employee_id,
        "employee_keyword": _context_employee_keyword(context),
        "leave_date": context.leave_date.isoformat() if context.leave_date else None,
        "plan": _normalize_optional_plan(context.plan),
        "region": context.region,
    }


def _normalize_employee_keyword(value: Any) -> str:
    text = str(value or "").strip()
    text = re.sub(r"[「」“”\"'，,。!！?？：:\s]+", " ", text).strip()
    text = re.sub(r"\s*的$", "", text).strip()
    generic_mentions = {
        "一个员工",
        "一个人",
        "一个",
        "某个员工",
        "某个人",
        "某个",
        "某员工",
        "某",
        "该员工",
        "这个员工",
        "这个",
        "员工",
        "人员",
    }
    return "" if text in generic_mentions else text[:80]


def _compact_employee_keyword(value: str) -> str:
    return re.sub(r"[\s._-]+", "", value).lower()


def _choose_employee_keyword(model_value: Any, fallback_value: Any) -> str:
    model_keyword = _normalize_employee_keyword(model_value)
    fallback_keyword = _normalize_employee_keyword(fallback_value)
    if not model_keyword:
        return fallback_keyword
    if (
        fallback_keyword
        and re.search(r"[._-]", fallback_keyword)
        and _compact_employee_keyword(model_keyword) == _compact_employee_keyword(fallback_keyword)
    ):
        return fallback_keyword
    return model_keyword


def _extract_compensation_request_fallback(message: str) -> dict[str, Any]:
    text = message.strip()
    leave_date = None
    date_match = re.search(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?", text)
    if date_match:
        y, m, d = date_match.groups()
        leave_date = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    plan = None
    plan_match = re.search(r"(?<![A-Za-z0-9_])N\s*\+\s*1(?![A-Za-z0-9_])", text, flags=re.IGNORECASE)
    if plan_match:
        plan = "N+1"
    elif re.search(r"(?<![A-Za-z0-9_])N(?!\s*\+)(?![A-Za-z0-9_])", text, flags=re.IGNORECASE):
        plan = "N"
    cleaned = re.sub(r"20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?", " ", text)
    cleaned = re.sub(
        r"补偿金|计算|查询员工|查询|员工|帮我|帮|试算|测算|打开|跳转|页面|方案|计划|离职日期|日期|改为|改成|改到|换成|调整为|调整成|设置为|设为|变为|变成|为|的|N\s*\+\s*1|N",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    keyword = re.sub(r"[，,。!！?？：:\s]+", " ", cleaned).strip()
    if not keyword and (plan or leave_date):
        changed_fields = [field for field, value in {"leave_date": leave_date, "plan": plan}.items() if value]
    else:
        changed_fields = [field for field, value in {"employee_keyword": keyword, "leave_date": leave_date, "plan": plan}.items() if value]
    return {
        "intent": "compensation.calculate",
        "employee_keyword": _normalize_employee_keyword(keyword),
        "leave_date": leave_date,
        "plan": plan,
        "region": None,
        "changed_fields": changed_fields,
    }


def _merge_compensation_request(
    extracted: dict[str, Any],
    context: CompensationChatContext | None,
    *,
    selected_employee_id: int | None = None,
) -> dict[str, Any]:
    merged = {
        "intent": extracted.get("intent") or "compensation.calculate",
        "employee_id": selected_employee_id or (context.employee_id if context else None),
        "employee_keyword": _context_employee_keyword(context),
        "leave_date": context.leave_date.isoformat() if context and context.leave_date else None,
        "plan": _normalize_optional_plan(context.plan) if context else "N+1",
        "region": context.region if context else None,
        "changed_fields": list(extracted.get("changed_fields") or []),
    }
    if selected_employee_id:
        merged["changed_fields"].append("employee_id")
    keyword = _normalize_employee_keyword(extracted.get("employee_keyword"))
    if keyword:
        merged["employee_keyword"] = keyword
    if extracted.get("leave_date"):
        merged["leave_date"] = extracted.get("leave_date")
    if extracted.get("plan"):
        merged["plan"] = _normalize_plan(extracted.get("plan"))
    if extracted.get("region"):
        merged["region"] = extracted.get("region")
    return merged


async def _extract_compensation_request_with_model(
    payload: AiChatIn,
    db: AsyncSession,
    timer: AiAuditTimer,
) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
    config = await active_ai_config(db)
    fallback = _extract_compensation_request_fallback(payload.message)
    if not config or not config.api_key_encrypted or not (config.model_reasoning or config.model_fast_json):
        return fallback, None, "fallback_no_model"

    model = (config.model_reasoning or config.model_fast_json or "").strip()
    messages = [
        {
            "role": "system",
            "content": (
                "你是 HR Portal 全局 AI 入口的意图解析器。"
                "只输出 JSON 对象，不解释。"
                "当前只允许识别 compensation.calculate 或 general_question。"
                "如果用户想计算补偿金，提取 employee_keyword、leave_date(YYYY-MM-DD 或 null)、plan(N 或 N+1)、region。"
                "如果用户是在修改上一轮补偿金任务，例如“方案改为N”“日期改成2026-06-30”，"
                "仍输出 intent=compensation.calculate，但只填写被用户明确修改的字段，并在 changed_fields 中列出字段名。"
                "不要把“方案改为”“日期改成”等操作描述当成员工姓名。"
                "只有用户明确给出姓名、工号或英文名时才填写 employee_keyword；"
                "如果只是“一个员工”“某个人”“该员工”等泛称，employee_keyword 必须为 null。"
                "不要猜员工 ID，不要输出个人敏感数据。"
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "message": payload.message,
                    "page_path": payload.page_path,
                    "compensation_context": payload.compensation_context.model_dump(mode="json") if payload.compensation_context else None,
                    "history": [item.model_dump() for item in payload.history[-6:]],
                    "output_schema_hint": {
                        "intent": "compensation.calculate 或 general_question",
                        "employee_keyword": "string 或 null，仅当用户明确指定员工",
                        "leave_date": "YYYY-MM-DD 或 null，仅当用户明确指定或修改",
                        "plan": "N、N+1 或 null，仅当用户明确指定或修改",
                        "region": "string 或 null",
                        "changed_fields": "本轮明确修改的字段名数组，例如 ['plan']",
                    },
                },
                ensure_ascii=False,
            ),
        },
    ]
    timer.add_event("model_call", capability_id="ai.chat", model=model, purpose="intent_parse")
    try:
        _, content, usage = await chat_completion_openai_compatible(
            api_key=decrypt(config.api_key_encrypted),
            base_url=config.base_url,
            model=model,
            messages=messages,
            timeout=int(config.timeout_seconds or 30),
            response_format={"type": "json_object"},
        )
        raw = parse_json_content(content)
        changed_fields = raw.get("changed_fields")
        if not isinstance(changed_fields, list):
            changed_fields = fallback.get("changed_fields") or []
        has_context = payload.compensation_context is not None
        employee_keyword = _choose_employee_keyword(raw.get("employee_keyword"), fallback["employee_keyword"])
        if has_context and "employee_keyword" not in changed_fields and not fallback.get("employee_keyword"):
            employee_keyword = ""
        return {
            "intent": str(raw.get("intent") or fallback["intent"]),
            "employee_keyword": employee_keyword,
            "leave_date": raw.get("leave_date") or fallback["leave_date"],
            "plan": _normalize_optional_plan(raw.get("plan") or fallback.get("plan")),
            "region": raw.get("region") or None,
            "changed_fields": changed_fields,
        }, usage, "model"
    except Exception as exc:
        timer.add_event("model_call", status="error", capability_id="ai.chat", reason=str(exc)[:500])
        return fallback, None, "fallback_model_error"


def _compensation_route_query(
    *,
    employee_id: int | None = None,
    keyword: str | None = None,
    leave_date: str | None = None,
    plan: str = "N+1",
    region: str | None = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {"plan": _normalize_plan(plan), "ai": "1"}
    if employee_id:
        query["employee_id"] = employee_id
    if keyword:
        query["keyword"] = keyword
    if leave_date:
        query["leave_date"] = leave_date
    if region:
        query["region"] = region
    return query


def _compensation_action(query: dict[str, Any], label: str = "打开补偿金计算") -> AiActionOut:
    return AiActionOut(
        type="navigate",
        label=label,
        route="/tools/compensation-calc",
        query=query,
    )


def _context_from_result(result: CompensationCalcOut, keyword: str | None = None) -> CompensationChatContext:
    employee_name = result.employee.name or result.employee.chinese_name or result.employee.english_name or result.employee.employee_no
    return CompensationChatContext(
        employee_id=result.employee.id,
        employee_keyword=keyword or employee_name,
        employee_name=employee_name,
        leave_date=result.leave_date,
        plan=result.plan,
        region=result.work_region,
    )


async def _handle_compensation_chat(
    payload: AiChatIn,
    extracted: dict[str, Any],
    user: User,
    db: AsyncSession,
    timer: AiAuditTimer,
) -> AiChatOut:
    employee_capability = _ensure_capability("compensation.employee_resolve")
    calc_capability = _ensure_capability("compensation.calculate_preview")
    validate_capability_policy(employee_capability, used_tools=["compensation.employee_search"])
    validate_capability_policy(calc_capability, used_tools=["compensation.employee_search", "compensation.calculate"])
    if not await user_has_permission(user, db, calc_capability.required_permission):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权使用补偿金计算")

    extracted = _merge_compensation_request(
        extracted,
        payload.compensation_context,
        selected_employee_id=payload.selected_employee_id,
    )
    keyword = str(extracted.get("employee_keyword") or "").strip()
    selected_employee_id = extracted.get("employee_id")
    if not keyword and not selected_employee_id:
        return AiChatOut(
            intent="compensation.calculate",
            status="need_employee",
            answer="请告诉我要计算哪位员工的补偿金，可以输入姓名、工号或英文名。",
            trace_id=timer.trace_id,
            missing_fields=["employee_keyword"],
            compensation_context=payload.compensation_context,
            actions=[_compensation_action(_compensation_route_query(plan=extracted.get("plan") or "N+1"))],
            extracted=extracted,
        )

    candidates: list[EmployeeCandidate] = []
    if selected_employee_id:
        candidates = []
    else:
        timer.add_event("tool", tool_name="compensation.employee_search", capability_id=employee_capability.capability_id, keyword=keyword)
        candidates = await search_compensation_employees(keyword=keyword, limit=10, user=user, db=db)
        if not candidates:
            return AiChatOut(
                intent="compensation.calculate",
                status="not_found",
                answer=f"没有找到「{keyword}」对应、且你有权限查看的员工。请换工号或更完整姓名再试。",
                trace_id=timer.trace_id,
                compensation_context=payload.compensation_context,
                actions=[_compensation_action(_compensation_route_query(keyword=keyword, plan=extracted.get("plan") or "N+1"))],
                extracted=extracted,
            )
        if len(candidates) > 1:
            return AiChatOut(
                intent="compensation.calculate",
                status="need_employee_selection",
                answer=f"我找到了 {len(candidates)} 个可能的员工，请先选择具体人员后再计算。",
                trace_id=timer.trace_id,
                candidates=candidates,
                compensation_context=payload.compensation_context,
                actions=[_compensation_action(_compensation_route_query(keyword=keyword, leave_date=extracted.get("leave_date"), plan=extracted.get("plan") or "N+1", region=extracted.get("region")))],
                extracted=extracted,
            )
        selected_employee_id = candidates[0].id

    leave_date = extracted.get("leave_date")
    missing: list[str] = []
    if not leave_date:
        missing.append("leave_date")
    if missing:
        selected = candidates[0] if candidates else None
        if selected and selected.leave_date:
            leave_date = selected.leave_date
            missing = []
        else:
            return AiChatOut(
                intent="compensation.calculate",
                status="need_more_info",
                answer="我已找到员工，但缺少离职日期。请补充离职日期，例如：2026-06-30。",
                trace_id=timer.trace_id,
                candidates=candidates,
                missing_fields=missing,
                compensation_context=CompensationChatContext(
                    employee_id=selected_employee_id,
                    employee_keyword=keyword or _context_employee_keyword(payload.compensation_context),
                    employee_name=payload.compensation_context.employee_name if payload.compensation_context else None,
                    leave_date=None,
                    plan=extracted.get("plan") or "N+1",
                    region=extracted.get("region"),
                ),
                actions=[_compensation_action(_compensation_route_query(employee_id=selected_employee_id, keyword=keyword, plan=extracted.get("plan") or "N+1", region=extracted.get("region")))],
                extracted=extracted,
            )

    try:
        parsed_leave_date = date.fromisoformat(str(leave_date))
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="离职日期格式无法识别，请使用 YYYY-MM-DD") from exc
    calc_in = CompensationCalcIn(
        employee_id=selected_employee_id,
        leave_date=parsed_leave_date,
        plan=_normalize_plan(extracted.get("plan")),
        region=extracted.get("region"),
    )
    validate_model_payload(CompensationCalcIn, calc_in, label="compensation.calculate_preview input")
    timer.add_event("tool", tool_name="compensation.calculate", capability_id=calc_capability.capability_id, employee_id=selected_employee_id)
    result, _raw = await calculate_compensation_impl(calc_in, user, db)
    validate_model_payload(CompensationCalcOut, result, label="compensation.calculate_preview output")
    query = _compensation_route_query(
        employee_id=selected_employee_id,
        keyword=keyword or result.employee.name,
        leave_date=result.leave_date.isoformat(),
        plan=result.plan,
        region=result.work_region,
    )
    employee_name = result.employee.name or result.employee.employee_no or "该员工"
    next_context = _context_from_result(result, keyword=keyword or result.employee.name)
    answer = (
        f"已完成「{employee_name}」的补偿金只读试算：方案 {result.plan}，"
        f"N 年限 {result.service_years_n}，补偿基数 {result.compensation_base:.2f}，"
        f"合计 {result.total_amount:.2f}。我已准备好跳转到补偿金计算页供你核对。"
    )
    return AiChatOut(
        intent="compensation.calculate",
        status="success",
        answer=answer,
        trace_id=timer.trace_id,
        candidates=candidates,
        compensation=result,
        compensation_context=next_context,
        actions=[_compensation_action(query, label="打开并核对补偿金计算")],
        extracted=extracted,
    )


@router.get("/capabilities", response_model=list[CapabilityOut])
async def list_capabilities(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[CapabilityOut]:
    return [_capability_out(item) for item in await visible_capabilities(user, db)]


@router.post(
    "/chat",
    response_model=AiChatOut,
)
async def global_ai_chat(
    payload: AiChatIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AiChatOut:
    timer = AiAuditTimer()
    capability = _ensure_capability("ai.chat")
    usage: dict[str, Any] | None = None
    try:
        timer.add_event("entry", capability_id=capability.capability_id, route="/ai/chat", page_path=payload.page_path)
        timer.add_event("capability", capability_id=capability.capability_id, risk_level=capability.risk_level)
        validate_model_payload(AiChatIn, payload, label="ai.chat input")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="input")
        validate_capability_policy(capability, used_tools=["compensation.employee_resolve", "compensation.calculate_preview"])
        timer.add_event("policy_validation", capability_id=capability.capability_id, target="capability")
        extracted, usage, parse_mode = await _extract_compensation_request_with_model(payload, db, timer)
        intent = str(extracted.get("intent") or "")
        if intent != "compensation.calculate" and "补偿金" not in payload.message:
            out = AiChatOut(
                intent="general_question",
                status="unsupported",
                answer="当前全局 AI 试点只支持补偿金只读试算和跳转。你可以说：帮我计算某某的补偿金。",
                trace_id=timer.trace_id,
                extracted=extracted,
            )
        else:
            out = await _handle_compensation_chat(payload, extracted, user, db, timer)
        validate_model_payload(AiChatOut, out, label="ai.chat output")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="output")
        await record_ai_log(
            db=db,
            user=user,
            action="global_ai_chat",
            request_summary=payload.message[:300],
            response_summary=out.answer[:500],
            input_payload=payload.model_dump(),
            output_payload=out.model_dump(),
            status=out.status,
            metadata={
                "capability_id": capability.capability_id,
                "intent": out.intent,
                "parse_mode": parse_mode,
                "action_count": len(out.actions),
                "candidate_count": len(out.candidates),
                "read_only": True,
            },
            token_usage=usage,
            timer=timer,
        )
        await db.commit()
        return out
    except (AiSchemaValidationError, AiPolicyError, HTTPException, ValueError) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        timer.add_event("failure", status="error", capability_id=capability.capability_id, reason=str(detail)[:500])
        await record_ai_log(
            db=db,
            user=user,
            action="global_ai_chat",
            request_summary=payload.message[:300],
            response_summary=None,
            input_payload=payload.model_dump(),
            output_payload={},
            status="error",
            metadata={"capability_id": capability.capability_id},
            error=str(detail),
            token_usage=usage,
            timer=timer,
        )
        await db.commit()
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(detail)) from exc


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


@router.post(
    "/capabilities/report.explain_config/answer",
    response_model=ReportExplainConfigOut,
    dependencies=[Depends(require_op("report.list", "V"))],
)
async def explain_report_config_capability(
    payload: ReportExplainConfigIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ReportExplainConfigOut:
    timer = AiAuditTimer()
    capability = _ensure_capability("report.explain_config")
    effective_payload = payload
    try:
        timer.add_event("entry", capability_id=capability.capability_id, route="/ai/capabilities/report.explain_config/answer")
        timer.add_event("capability", capability_id=capability.capability_id, risk_level=capability.risk_level)
        validate_model_payload(ReportExplainConfigIn, payload, label="report.explain_config input")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="input")
        validate_capability_policy(capability, used_tools=["report.read_config"])
        timer.add_event("policy_validation", capability_id=capability.capability_id, target="capability")
        if payload.report_id is not None:
            from app.reports.models import Report

            row = await db.get(Report, payload.report_id)
            if row is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
            if not payload.columns:
                effective_payload = _report_explain_payload_from_row(row)
                effective_payload.question = payload.question
                effective_payload.history = payload.history
            elif not effective_payload.report_name:
                effective_payload.report_name = row.name
        timer.add_event(
            "tool",
            tool_name="report.read_config",
            capability_id=capability.capability_id,
            report_id=effective_payload.report_id,
            field_count=len(effective_payload.columns),
            filter_count=len(effective_payload.filters),
        )
        out = _explain_report_config(effective_payload)
        usage: dict[str, Any] | None = None
        answer_mode = "fallback"
        try:
            answer, usage, answer_mode = await _answer_report_config_with_model(
                payload=effective_payload,
                base=out,
                db=db,
                timer=timer,
            )
            out.answer = answer
        except (AiProviderEndpointError, httpx.HTTPStatusError, Exception) as exc:
            timer.add_event(
                "model_call",
                status="error",
                capability_id=capability.capability_id,
                reason=str(exc)[:500],
            )
            out.answer = _fallback_report_answer(effective_payload, out)
            answer_mode = "fallback_model_error"
        out.mode = "read_only_chat"
        out.trace_id = timer.trace_id
        validate_model_payload(ReportExplainConfigOut, out, label="report.explain_config output")
        timer.add_event("schema_validation", capability_id=capability.capability_id, target="output")
        await record_ai_log(
            db=db,
            user=user,
            action="report_explain_config",
            request_summary=(effective_payload.question or effective_payload.report_name or f"report:{effective_payload.report_id}")[:300],
            response_summary=(out.answer or out.summary)[:500],
            input_payload=effective_payload.model_dump(),
            output_payload=out.model_dump(),
            status="success",
            metadata={
                "capability_id": capability.capability_id,
                "report_id": effective_payload.report_id,
                "field_count": out.field_count,
                "filter_count": out.filter_count,
                "sort_count": out.sort_count,
                "aggregation_count": out.aggregation_count,
                "answer_mode": answer_mode,
                "read_only": True,
            },
            token_usage=usage,
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
            action="report_explain_config",
            request_summary=(payload.report_name or f"report:{payload.report_id}")[:300],
            response_summary=None,
            input_payload=payload.model_dump(),
            output_payload={},
            status="error",
            metadata={"capability_id": capability.capability_id, "report_id": payload.report_id},
            error=str(detail),
            timer=timer,
        )
        await db.commit()
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(detail)) from exc


@router.post("/bad-cases", response_model=AiBadCaseCaptureOut)
async def capture_ai_bad_case(
    payload: AiBadCaseCaptureIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AiBadCaseCaptureOut:
    timer = AiAuditTimer()
    source_log = (
        await db.execute(
            select(SystemLog)
            .where(SystemLog.trace_id == payload.trace_id)
            .order_by(desc(SystemLog.created_at), desc(SystemLog.id))
            .limit(1)
        )
    ).scalar_one_or_none()
    source_metadata = (source_log.metadata_json or {}) if source_log is not None else {}
    capability_id = payload.capability_id or source_metadata.get("capability_id")
    timer.add_event(
        "entry",
        route="/ai/bad-cases",
        capability_id=capability_id,
        source_trace_id=payload.trace_id,
    )
    timer.add_event(
        "bad_case_capture",
        capability_id=capability_id,
        source_trace_id=payload.trace_id,
        source=payload.source,
        failure_stage=payload.failure_stage,
        source_log_found=source_log is not None,
    )
    metadata = {
        "source_trace_id": payload.trace_id,
        "capability_id": capability_id,
        "source": payload.source,
        "failure_stage": payload.failure_stage,
        "repair_suggestion": payload.repair_suggestion,
        "source_log_found": source_log is not None,
        "source_log": {
            "action": source_log.action if source_log is not None else None,
            "status": source_log.status if source_log is not None else None,
            "request_summary": source_log.request_summary if source_log is not None else None,
            "response_summary": source_log.response_summary if source_log is not None else None,
            "error": source_log.error if source_log is not None else None,
        },
        "manual_metadata": payload.metadata,
    }
    await record_ai_log(
        db=db,
        user=user,
        action="bad_case_capture",
        request_summary=(payload.user_message or payload.reason)[:300],
        response_summary=payload.reason[:500],
        input_payload=payload.model_dump(),
        output_payload={
            "captured": True,
            "source_trace_id": payload.trace_id,
            "source_log_found": source_log is not None,
        },
        status="captured",
        metadata=metadata,
        timer=timer,
    )
    await db.commit()
    return AiBadCaseCaptureOut(
        captured=True,
        source_trace_id=payload.trace_id,
        capture_trace_id=timer.trace_id,
        source_log_found=source_log is not None,
    )


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
