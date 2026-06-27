from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.audit import AiAuditTimer, record_ai_log
from app.ai.capabilities import CAPABILITY_BY_ID, CapabilityDefinition, get_capability, user_has_permission, visible_capabilities
from app.ai.context_builder import build_context_packet
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
from app.ai.conversation import ChatSession, load_or_create as load_or_create_conversation, persist as persist_conversation
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
from app.data.models import CostCenterNode, OrgNode
from app.permissions.scope_filter import _is_super_admin
from app.scopes.models import ScopeTag, ScopeTagFilter, ScopeTagSelection, UserScopeTag
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
    recent_results: list[dict[str, Any]] = Field(default_factory=list, max_length=5)


class AiChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    page_path: str | None = Field(default=None, max_length=300)
    conversation_id: int | None = Field(default=None, ge=1)
    history: list[AiChatMessage] = Field(default_factory=list, max_length=20)
    selected_employee_id: int | None = Field(default=None, ge=1)


class AiActionOut(BaseModel):
    type: str
    label: str
    route: str = ""
    query: dict[str, Any] = Field(default_factory=dict)


class AiChatOut(BaseModel):
    intent: str
    answer: str
    status: str
    trace_id: str | None = None
    conversation_id: int | None = None
    actions: list[AiActionOut] = Field(default_factory=list)
    candidates: list[EmployeeCandidate] = Field(default_factory=list)
    compensation: CompensationCalcOut | None = None
    missing_fields: list[str] = Field(default_factory=list)
    extracted: dict[str, Any] = Field(default_factory=dict)
    artifact: dict[str, Any] | None = Field(default=None)


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

    context_packet = build_context_packet(
        page={
            "kind": "report_config",
            "report_id": payload.report_id,
            "report_name": payload.report_name,
        },
        permission={
            "required": {"resource": "report.list", "operation": "V"},
            "mode": "read_only",
        },
        data={
            "columns": payload.columns,
            "visible_fields": visible_fields,
            "filters": payload.filters,
            "sorts": payload.sorts,
            "aggregate": payload.aggregate,
            "aggregations": payload.aggregations,
        },
        domain_context={
            "capability_id": "report.explain_config",
            "side_effect": "none",
        },
    )
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


def _normalize_followup_action(value: Any) -> str:
    text = str(value or "").strip()
    allowed = {"calculate", "agreement_preview", "agreement_print", "compare_results"}
    return text if text in allowed else "calculate"


def _clean_name(value: Any) -> str:
    """轻量清洗模型给出的姓名/工号:去引号和首尾标点。语义解析由大模型负责,这里不做。"""
    text = str(value or "").strip()
    text = re.sub(r"^[「」“”\"'\s]+|[「」“”\"'\s]+$", "", text)
    return text[:80]


def _context_employee_keyword(context: CompensationChatContext | None) -> str:
    if context is None:
        return ""
    return _clean_name(context.employee_keyword or context.employee_name or "")


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
        "followup_action": _normalize_followup_action(extracted.get("followup_action")),
        "changed_fields": list(extracted.get("changed_fields") or []),
    }
    if selected_employee_id:
        merged["changed_fields"].append("employee_id")
    keyword = _clean_name(extracted.get("employee_keyword"))
    if keyword:
        merged["employee_keyword"] = keyword
        # 用户本轮换了人:换人 = 该员工从默认重新算。清掉沿用的旧 employee_id,
        # 并把离职日期/地区/方案重置为默认(下方再用本轮显式给的值覆盖),
        # 不把上一个人的离职日期、工作地区、N/N+1 方案静默套给新人。
        if not selected_employee_id:
            prev_keyword = _context_employee_keyword(context)
            changed_person = "employee_keyword" in (extracted.get("changed_fields") or []) or keyword != prev_keyword
            if changed_person:
                merged["employee_id"] = None
                merged["leave_date"] = None
                merged["region"] = None
                merged["plan"] = "N+1"
    if extracted.get("leave_date"):
        merged["leave_date"] = extracted.get("leave_date")
    if extracted.get("plan"):
        merged["plan"] = _normalize_plan(extracted.get("plan"))
    if extracted.get("region"):
        merged["region"] = extracted.get("region")
    return merged


async def _extract_compensation_request_with_model(
    payload: AiChatIn,
    session: ChatSession,
    db: AsyncSession,
    timer: AiAuditTimer,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, str]:
    """纯大模型解析:把自然语言抽成结构化补偿金请求。无正则兜底解析。

    无法解析(模型报错/非法 JSON)时返回 (None, ...),由上层提示用户换种说法。
    模型可用性由 global_ai_chat 上游统一保证。
    """
    config = await active_ai_config(db)
    prev_ctx = _comp_ctx_from_session(session)
    model = (config.model_reasoning or config.model_fast_json or "").strip()
    today = date.today().isoformat()
    messages = [
        {
            "role": "system",
            "content": (
                "你是 HR Portal 全局 AI 入口的补偿金意图解析器。"
                "只输出 JSON 对象，不解释。"
                f"今天是 {today}（Asia/Shanghai）。"
                "如果用户想计算补偿金，提取 employee_keyword、leave_date(YYYY-MM-DD 或 null)、plan(N 或 N+1)、region。"
                "同时识别 followup_action: 默认为 calculate；如果用户基于上一轮补偿金结果要求预览/查看解除协议，"
                "输出 agreement_preview；如果用户明确要求打印解除协议或打印刚才这份，输出 agreement_print；"
                "如果用户询问最近两次试算、N 与 N+1、两个方案或前后结果的差异/差额/多多少钱，输出 compare_results。"
                "用户给的离职日期可能不完整或用口语，例如“7月9号”“7/9”“下个月15号”“明天”“月底”，"
                "请结合今天把它解析成完整的 YYYY-MM-DD；缺年份时默认今年（若该日期明显已过去很久可用明年）。"
                "无法判断具体日期时 leave_date 才返回 null。"
                "如果用户是在修改上一轮补偿金任务，例如“方案改为N”“日期改成2026-06-30”，"
                "仍输出 intent=compensation.calculate，但只填写被用户明确修改的字段，并在 changed_fields 中列出字段名。"
                "如果用户要改成另一个人，例如“人员改成刘琦”“换成张三”，"
                "提取新的 employee_keyword=刘琦/张三，并在 changed_fields 中包含 employee_keyword。"
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
                    "today": today,
                    "message": payload.message,
                    "page_path": payload.page_path,
                    "compensation_context": prev_ctx.model_dump(mode="json") if prev_ctx else None,
                    "history": [item.model_dump() for item in payload.history[-6:]],
                    "output_schema_hint": {
                        "intent": "compensation.calculate 或 general_question",
                        "employee_keyword": "string 或 null，仅当用户明确指定员工",
                        "leave_date": "YYYY-MM-DD 或 null；口语/缺年份的日期请结合 today 解析后再填",
                        "plan": "N、N+1 或 null，仅当用户明确指定或修改",
                        "region": "string 或 null",
                        "followup_action": "calculate、agreement_preview、agreement_print 或 compare_results",
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
            changed_fields = []
        return {
            "intent": str(raw.get("intent") or "compensation.calculate"),
            "employee_keyword": _clean_name(raw.get("employee_keyword")),
            "leave_date": raw.get("leave_date") or None,
            "plan": _normalize_optional_plan(raw.get("plan")),
            "region": raw.get("region") or None,
            "followup_action": _normalize_followup_action(raw.get("followup_action")),
            "changed_fields": changed_fields,
        }, usage, "model"
    except Exception as exc:
        timer.add_event("model_call", status="error", capability_id="ai.chat", reason=str(exc)[:500])
        return None, None, "parse_error"


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


def _agreement_document_action(ctx: CompensationChatContext, action_type: str) -> AiActionOut:
    is_print = action_type == "agreement_print"
    query: dict[str, Any] = {
        "business_type": "agreement",
        "template_code": "agreement_release",
        "source_capability_id": COMP_CAP,
        "employee_id": ctx.employee_id,
        "leave_date": ctx.leave_date.isoformat() if ctx.leave_date else None,
        "plan": _normalize_plan(ctx.plan),
        "region": ctx.region,
    }
    return AiActionOut(
        type="document_print" if is_print else "document_preview",
        label="打印解除协议" if is_print else "预览解除协议",
        route="",
        query=query,
    )


def _comp_result_snapshot(result: CompensationCalcOut) -> dict[str, Any]:
    employee_name = result.employee.name or result.employee.chinese_name or result.employee.english_name or result.employee.employee_no
    return {
        "employee_id": result.employee.id,
        "employee_name": employee_name,
        "employee_no": result.employee.employee_no,
        "leave_date": result.leave_date.isoformat(),
        "plan": result.plan,
        "service_years_n": result.service_years_n,
        "compensation_base": result.compensation_base,
        "n_amount": result.n_amount,
        "extra_amount": result.extra_amount,
        "total_amount": result.total_amount,
    }


def _append_recent_comp_result(ctx: CompensationChatContext, result: CompensationCalcOut) -> CompensationChatContext:
    snapshot = _comp_result_snapshot(result)
    recent = [item for item in (ctx.recent_results or []) if isinstance(item, dict)]
    recent.append(snapshot)
    ctx.recent_results = recent[-5:]
    return ctx


def _format_comp_result_label(item: dict[str, Any]) -> str:
    employee = item.get("employee_name") or item.get("employee_no") or "该员工"
    return f"{employee} / {item.get('leave_date') or '--'} / 方案 {item.get('plan') or '--'}"


def _compare_comp_result_snapshots(
    previous: dict[str, Any],
    current: dict[str, Any],
    *,
    subject: str = "两次补偿金试算",
) -> AiChatOut:
    previous_total = float(previous.get("total_amount") or 0)
    current_total = float(current.get("total_amount") or 0)
    delta = current_total - previous_total
    abs_delta = abs(delta)
    higher = current if current_total >= previous_total else previous
    lower = previous if current_total >= previous_total else current
    answer = (
        f"{subject}差额为 {abs_delta:.2f}。"
        f"{_format_comp_result_label(higher)} 合计 {float(higher.get('total_amount') or 0):.2f}，"
        f"{_format_comp_result_label(lower)} 合计 {float(lower.get('total_amount') or 0):.2f}。"
    )
    if (previous.get("plan"), current.get("plan")) in {("N+1", "N"), ("N", "N+1")}:
        answer += "差额主要来自 +1 金额。"
    else:
        answer += "差异可能来自方案、离职日期、员工或地区等试算条件变化。"
    return AiChatOut(
        intent="compensation.calculate",
        status="compare_results",
        answer=answer,
        extracted={"followup_action": "compare_results"},
    )


def _compare_recent_comp_results(ctx: CompensationChatContext | None) -> AiChatOut | None:
    recent = [item for item in ((ctx.recent_results if ctx else None) or []) if isinstance(item, dict)]
    if len(recent) < 2:
        return None
    return _compare_comp_result_snapshots(recent[-2], recent[-1], subject="最近两次补偿金试算")


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


COMP_CAP = "compensation.calculate_preview"


def _comp_ctx_from_session(session: ChatSession) -> CompensationChatContext | None:
    """从通用会话槽位还原上一轮补偿金上下文。"""
    slots = session.capability_state(COMP_CAP)
    if not slots:
        return None
    try:
        return CompensationChatContext(**slots)
    except (TypeError, ValueError):
        return None


def _comp_ctx_to_session(
    session: ChatSession, ctx: CompensationChatContext | None, *, active: bool = True
) -> None:
    """把本轮补偿金上下文写回通用会话槽位;active=True 表示任务仍在途。"""
    session.set_capability_state(COMP_CAP, ctx.model_dump(mode="json") if ctx else {})
    if active:
        session.active_capability_id = COMP_CAP


async def _handle_compensation_chat(
    payload: AiChatIn,
    extracted: dict[str, Any],
    session: ChatSession,
    user: User,
    db: AsyncSession,
    timer: AiAuditTimer,
) -> AiChatOut:
    employee_capability = _ensure_capability("compensation.employee_resolve")
    calc_capability = _ensure_capability("compensation.calculate_preview")
    doc_preview_capability = _ensure_capability("document.preview_from_context")
    doc_print_capability = _ensure_capability("document.print_from_context")
    validate_capability_policy(employee_capability, used_tools=["compensation.employee_search"])
    validate_capability_policy(calc_capability, used_tools=["compensation.employee_search", "compensation.calculate"])
    validate_capability_policy(doc_preview_capability, used_tools=["document.prepare_from_context", "document.preview"])
    validate_capability_policy(doc_print_capability, used_tools=["document.prepare_from_context", "document.pdf"])
    if not await user_has_permission(user, db, calc_capability.required_permission):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权使用补偿金计算")

    prev_ctx = _comp_ctx_from_session(session)
    explicit_employee_keyword = _clean_name(extracted.get("employee_keyword"))
    explicit_leave_date = extracted.get("leave_date")
    has_explicit_compare_inputs = bool(payload.selected_employee_id or explicit_employee_keyword or explicit_leave_date)
    extracted = _merge_compensation_request(
        extracted,
        prev_ctx,
        selected_employee_id=payload.selected_employee_id,
    )
    keyword = str(extracted.get("employee_keyword") or "").strip()
    selected_employee_id = extracted.get("employee_id")
    followup_action = _normalize_followup_action(extracted.get("followup_action"))
    if followup_action == "compare_results" and not has_explicit_compare_inputs:
        compared = _compare_recent_comp_results(prev_ctx)
        if compared is not None:
            _comp_ctx_to_session(session, prev_ctx, active=True)
            compared.trace_id = timer.trace_id
            compared.extracted = extracted
            return compared
    if followup_action in {"agreement_preview", "agreement_print"}:
        if (
            not selected_employee_id
            or not extracted.get("leave_date")
            or not extracted.get("plan")
        ):
            _comp_ctx_to_session(session, prev_ctx, active=True)
            return AiChatOut(
                intent="compensation.calculate",
                status="need_compensation_context",
                answer="还没有可用于生成协议的完整补偿金结果。请先完成补偿金试算，再让我预览或打印协议。",
                trace_id=timer.trace_id,
                missing_fields=["employee_id", "leave_date", "plan"],
                actions=[_compensation_action(_compensation_route_query(plan=extracted.get("plan") or "N+1"))],
                extracted=extracted,
            )
        parsed_leave_date = date.fromisoformat(str(extracted.get("leave_date")))
        ctx = CompensationChatContext(
            employee_id=selected_employee_id,
            employee_keyword=keyword or _context_employee_keyword(prev_ctx),
            employee_name=prev_ctx.employee_name if prev_ctx else None,
            leave_date=parsed_leave_date,
            plan=_normalize_plan(extracted.get("plan")),
            region=extracted.get("region"),
            recent_results=prev_ctx.recent_results if prev_ctx else [],
        )
        _comp_ctx_to_session(session, ctx, active=True)
        capability = doc_print_capability if followup_action == "agreement_print" else doc_preview_capability
        timer.add_event(
            "tool",
            tool_name="document.action_from_context",
            capability_id=capability.capability_id,
            business_type="agreement",
            action=followup_action,
        )
        action = _agreement_document_action(ctx, followup_action)
        answer = "已准备好解除协议预览。" if followup_action == "agreement_preview" else "已准备好打印解除协议。"
        return AiChatOut(
            intent="compensation.calculate",
            status=followup_action,
            answer=answer,
            trace_id=timer.trace_id,
            actions=[action],
            extracted=extracted,
        )
    if not keyword and not selected_employee_id:
        if followup_action == "compare_results":
            _comp_ctx_to_session(session, prev_ctx, active=True)
            return AiChatOut(
                intent="compensation.calculate",
                status="need_more_results",
                answer="我还没有两次可对比的补偿金试算结果。请先完成至少两次试算，例如分别算 N 和 N+1，再让我比较差额。",
                trace_id=timer.trace_id,
                missing_fields=["recent_results"],
                extracted=extracted,
            )
        _comp_ctx_to_session(session, prev_ctx, active=True)
        return AiChatOut(
            intent="compensation.calculate",
            status="need_employee",
            answer="请告诉我要计算哪位员工的补偿金，可以输入姓名、工号或英文名。",
            trace_id=timer.trace_id,
            missing_fields=["employee_keyword"],
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
            _comp_ctx_to_session(session, prev_ctx, active=True)
            return AiChatOut(
                intent="compensation.calculate",
                status="not_found",
                answer=f"没有找到「{keyword}」对应、且你有权限查看的员工。请换工号或更完整姓名再试。",
                trace_id=timer.trace_id,
                actions=[_compensation_action(_compensation_route_query(keyword=keyword, plan=extracted.get("plan") or "N+1"))],
                extracted=extracted,
            )
        if len(candidates) > 1:
            _comp_ctx_to_session(session, prev_ctx, active=True)
            return AiChatOut(
                intent="compensation.calculate",
                status="need_employee_selection",
                answer=f"我找到了 {len(candidates)} 个可能的员工，请先选择具体人员后再计算。",
                trace_id=timer.trace_id,
                candidates=candidates,
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
            pending_ctx = CompensationChatContext(
                employee_id=selected_employee_id,
                employee_keyword=keyword or _context_employee_keyword(prev_ctx),
                employee_name=prev_ctx.employee_name if prev_ctx else None,
                leave_date=None,
                plan=extracted.get("plan") or "N+1",
                region=extracted.get("region"),
                recent_results=prev_ctx.recent_results if prev_ctx else [],
            )
            _comp_ctx_to_session(session, pending_ctx, active=True)
            return AiChatOut(
                intent="compensation.calculate",
                status="need_more_info",
                answer="我已找到员工，但缺少离职日期。请补充离职日期，例如：2026-06-30。",
                trace_id=timer.trace_id,
                candidates=candidates,
                missing_fields=missing,
                actions=[_compensation_action(_compensation_route_query(employee_id=selected_employee_id, keyword=keyword, plan=extracted.get("plan") or "N+1", region=extracted.get("region")))],
                extracted=extracted,
            )

    try:
        parsed_leave_date = date.fromisoformat(str(leave_date))
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="离职日期格式无法识别，请使用 YYYY-MM-DD") from exc
    if followup_action == "compare_results":
        compare_results: dict[str, CompensationCalcOut] = {}
        for plan in ("N", "N+1"):
            compare_calc_in = CompensationCalcIn(
                employee_id=selected_employee_id,
                leave_date=parsed_leave_date,
                plan=plan,
                region=extracted.get("region"),
            )
            validate_model_payload(CompensationCalcIn, compare_calc_in, label=f"compensation.calculate_preview {plan} input")
            timer.add_event(
                "tool",
                tool_name="compensation.calculate",
                capability_id=calc_capability.capability_id,
                employee_id=selected_employee_id,
                plan=plan,
            )
            compare_result, _raw = await calculate_compensation_impl(compare_calc_in, user, db)
            validate_model_payload(CompensationCalcOut, compare_result, label=f"compensation.calculate_preview {plan} output")
            compare_results[plan] = compare_result

        n_result = compare_results["N"]
        n1_result = compare_results["N+1"]
        next_context = _context_from_result(n1_result, keyword=keyword or n1_result.employee.name)
        next_context.recent_results = prev_ctx.recent_results if prev_ctx else []
        next_context = _append_recent_comp_result(next_context, n_result)
        next_context = _append_recent_comp_result(next_context, n1_result)
        _comp_ctx_to_session(session, next_context, active=True)
        compared = _compare_comp_result_snapshots(
            _comp_result_snapshot(n_result),
            _comp_result_snapshot(n1_result),
            subject="N 与 N+1 两个方案",
        )
        compared.trace_id = timer.trace_id
        compared.extracted = extracted
        compared.compensation = n1_result
        compared.actions = [
            _compensation_action(
                _compensation_route_query(
                    employee_id=selected_employee_id,
                    keyword=keyword or n1_result.employee.name,
                    leave_date=n1_result.leave_date.isoformat(),
                    plan=n1_result.plan,
                    region=n1_result.work_region,
                ),
                label="打开并核对 N+1 补偿金计算",
            )
        ]
        return compared

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
    next_context.recent_results = prev_ctx.recent_results if prev_ctx else []
    next_context = _append_recent_comp_result(next_context, result)
    # 成功后仍保留 active + 完整槽位:允许后续"方案改为N"等裸续接;关键词可随时切走,不会永久粘死。
    _comp_ctx_to_session(session, next_context, active=True)
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
        actions=[_compensation_action(query, label="打开并核对补偿金计算")],
        extracted=extracted,
    )


# ──────────────────────────────────────────────────────────────────────────
# 能力：查询我的数据权限范围（scope.describe_my_scope）
# 纯只读、无参 query：读当前用户绑定的数据范围标签，翻译成人话，不查数据明细。
# 与 permissions/scope_filter.py 的 fail-closed 语义对齐（超管放行全部 / 无标签看不到行）。
# ──────────────────────────────────────────────────────────────────────────

_SCOPE_FIELD_CN = {
    "employment_type": "员工类型",
    "employment_entity": "公司名称",
    "person": "姓名",
}
_SCOPE_OP_CN = {"eq": "属于", "neq": "排除"}


async def _extract_my_scope_request(
    payload: AiChatIn,
    session: ChatSession,
    db: AsyncSession,
    timer: AiAuditTimer,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, str]:
    """无参 query：无需模型解析，固定返回空参数。"""
    return {}, None, "noop"


async def _load_my_scope_bundles(user: User, db: AsyncSession) -> list[dict[str, Any]]:
    """查当前用户绑定的所有标签，组装成翻译用结构（节点 node_id 已映射为中文名）。"""
    tags = (
        await db.execute(
            select(ScopeTag)
            .join(UserScopeTag, UserScopeTag.tag_id == ScopeTag.id)
            .where(UserScopeTag.user_id == user.id)
            .order_by(ScopeTag.dimension, ScopeTag.name)
        )
    ).scalars().all()

    bundles: list[dict[str, Any]] = []
    for tag in tags:
        sels = (
            await db.execute(
                select(ScopeTagSelection)
                .where(
                    ScopeTagSelection.tag_id == tag.id,
                    ScopeTagSelection.node_id.is_not(None),
                )
                .order_by(ScopeTagSelection.id)
            )
        ).scalars().all()
        filters = (
            await db.execute(
                select(ScopeTagFilter)
                .where(ScopeTagFilter.tag_id == tag.id)
                .order_by(ScopeTagFilter.order_index, ScopeTagFilter.id)
            )
        ).scalars().all()

        NodeModel = CostCenterNode if tag.dimension == "cost_center" else OrgNode
        selections: list[dict[str, Any]] = []
        for s in sels:
            node = await db.get(NodeModel, s.node_id)
            selections.append(
                {
                    "name": node.name if node is not None else None,
                    "include_descendants": s.include_descendants,
                }
            )

        bundles.append(
            {
                "name": tag.name,
                "description": tag.description,
                "dimension": tag.dimension,
                "org_scope_enabled": tag.org_scope_enabled,
                "org_scope_unlimited": tag.org_scope_unlimited,
                "person_scope_enabled": tag.person_scope_enabled,
                "selections": selections,
                "filters": [
                    {
                        "field_code": f.field_code,
                        "operator": f.operator,
                        "values": list(f.values or []),
                    }
                    for f in filters
                ],
            }
        )
    return bundles


def _describe_my_scope(is_super: bool, bundles: list[dict[str, Any]]) -> str:
    """把数据范围标签翻译成中文段落（与过滤引擎行为对齐）。"""
    if is_super:
        return "你是超级管理员，不受数据范围限制，可以查看系统内全部数据。"
    if not bundles:
        return (
            "你当前没有被授予任何数据范围标签，因此暂时看不到任何业务数据。"
            "请联系系统管理员为你分配数据范围。"
        )

    lines = [f"你当前共有 {len(bundles)} 个数据范围标签："]
    for i, t in enumerate(bundles, start=1):
        title = f"{i}. 「{t['name']}」"
        if t.get("description"):
            title += f"（{t['description']}）"
        seg = [title]

        # 组织范围段
        if not t["org_scope_enabled"]:
            seg.append("   · 组织范围：未启用（该标签不限定组织维度）")
        elif t["org_scope_unlimited"]:
            dim = "成本中心" if t["dimension"] == "cost_center" else "组织"
            seg.append(f"   · 组织范围：不限（{dim}维度下全部节点）")
        else:
            dim = "成本中心" if t["dimension"] == "cost_center" else "组织部门"
            phrases = []
            for s in t["selections"]:
                name = s["name"] or "（已失效节点）"
                phrases.append(name + ("及下级" if s["include_descendants"] else ""))
            nodes = "、".join(phrases) if phrases else "（未选择有效节点）"
            seg.append(f"   · 组织范围（{dim}）：{nodes}")

        # 人员范围段（同一标签多条 filter = AND）
        if not t["person_scope_enabled"]:
            seg.append("   · 人员范围：未启用（不额外限定人员）")
        else:
            conds = [
                f"{_SCOPE_FIELD_CN.get(f['field_code'], f['field_code'])} "
                f"{_SCOPE_OP_CN.get(f['operator'], f['operator'])} "
                f"[{'、'.join(f['values'])}]"
                for f in t["filters"]
            ]
            seg.append("   · 人员范围（需同时满足）：" + " 且 ".join(conds))

        if t["org_scope_enabled"] and t["person_scope_enabled"]:
            seg.append("   · 该标签内：上述组织范围与人员范围需【同时满足】")
        lines.append("\n".join(seg))

    if len(bundles) > 1:
        lines.append("说明：你拥有多个标签时，可见范围是各标签的【并集】（满足任意一个标签即可见）。")
    return "\n\n".join(lines)


async def _handle_my_scope_chat(
    payload: AiChatIn,
    extracted: dict[str, Any],
    session: ChatSession,
    user: User,
    db: AsyncSession,
    timer: AiAuditTimer,
) -> AiChatOut:
    capability = _ensure_capability("scope.describe_my_scope")
    validate_capability_policy(capability, used_tools=[])
    session.clear_active()
    is_super = await _is_super_admin(user, db)
    bundles = [] if is_super else await _load_my_scope_bundles(user, db)
    answer = _describe_my_scope(is_super, bundles)
    timer.add_event(
        "capability",
        capability_id=capability.capability_id,
        is_super_admin=is_super,
        tag_count=len(bundles),
    )
    return AiChatOut(
        intent="scope.describe_my_scope",
        status="ok",
        answer=answer,
        trace_id=timer.trace_id,
    )


# ──────────────────────────────────────────────────────────────────────────
# 能力：生成自动化规则草稿（automation.rule.create_draft）
# LLM-first 语义解析：用大模型从自然语言提取触发器、动作、接收人等槽位。
# 信息不足时返回追问，草稿生成后调用规则校验。
# ──────────────────────────────────────────────────────────────────────────

def _automation_trigger_types() -> list[str]:
    """?????????????????????? AI ??????????"""
    from app.automation.trigger_registry import list_triggers

    return [meta.trigger_type for meta in list_triggers()]


def _automation_trigger_types_text() -> str:
    return ", ".join(_automation_trigger_types())


async def _extract_automation_rule_request(
    payload: AiChatIn,
    session: ChatSession,
    db: AsyncSession,
    timer: AiAuditTimer,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, str]:
    """LLM extractor：从自然语言提取自动化规则槽位。

    返回 (extracted, artifact, parse_mode):
    - extracted: 提取的槽位字典
    - artifact: 规则草稿 artifact（信息充足时）；否则 None
    - parse_mode: "llm_extract" 或 "missing_slots"
    """
    config = await active_ai_config(db)
    model = (config.model_reasoning or config.model_fast_json or "").strip()
    if not model or not config.api_key_encrypted:
        return None, None, "no_model"
    trigger_types_text = _automation_trigger_types_text()

    # 构建 prompt：让 LLM 提取结构化槽位
    messages = [
        {
            "role": "system",
            "content": (
                "你是 HR Portal 自动化规则助手。根据用户自然语言描述，提取自动化规则的结构化槽位。\n"
                "可提取的槽位：\n"
                "1. trigger_type: 触发器类型，必须从以下值选其一：\n"
                f"   {trigger_types_text}\n"
                "2. trigger_biz_id: 关联的业务 ID（如报表 ID），不知道可不填\n"
                "3. action_type: 动作类型，当前只支持 feishu_send_message\n"
                "4. feishu_receivers: 飞书接收人描述（如'薪酬组群'、'张三'）\n"
                "5. feishu_message_template: 消息模板描述（如'附上报表链接'）\n"
                "6. rule_name: 规则名称，可根据描述自动生成\n"
                "7. missing_slots: 缺失的关键槽位数组\n"
                "8. follow_up_question: 追问用户的问题（如有缺失槽位）\n\n"
                "只输出 JSON 对象，格式：\n"
                '{"trigger_type": "...", "trigger_biz_id": "...", "action_type": "...", '
                '"feishu_receivers": "...", "feishu_message_template": "...", '
                '"rule_name": "...", "missing_slots": [...], "follow_up_question": "..."}\n'
                "不要输出解释文字，只输出 JSON。"
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "message": payload.message,
                    "history": [item.model_dump() for item in payload.history[-6:]],
                },
                ensure_ascii=False,
            ),
        },
    ]

    timer.add_event("model_call", capability_id="automation.rule.create_draft", purpose="extract_slots", model=model)
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
        timer.add_event("model_call", status="success", purpose="extract_slots", usage=usage)
    except Exception as exc:
        timer.add_event("model_call", status="error", purpose="extract_slots", reason=str(exc)[:300])
        return None, None, "error"

    trigger_type = raw.get("trigger_type")
    missing_slots = raw.get("missing_slots") or []
    follow_up = raw.get("follow_up_question") or ""

    # 校验 trigger_type 合法性
    if trigger_type and trigger_type not in _automation_trigger_types():
        missing_slots.append("trigger_type")
        follow_up = follow_up or f"触发器类型「{trigger_type}」不合法，请明确说明触发条件（如'报表运行成功后'）。"

    extracted = {
        "trigger_type": trigger_type,
        "trigger_biz_id": raw.get("trigger_biz_id"),
        "action_type": raw.get("action_type") or "feishu_send_message",
        "feishu_receivers": raw.get("feishu_receivers"),
        "feishu_message_template": raw.get("feishu_message_template"),
        "rule_name": raw.get("rule_name"),
    }

    # 信息不足 → 追问
    if missing_slots:
        artifact = {
            "artifact_type": "automation_rule",
            "status": "draft",
            "rule_draft": None,
            "validation_errors": [],
            "missing_slots": missing_slots,
            "follow_up_question": follow_up,
        }
        return extracted, artifact, "missing_slots"

    # 信息充足 → 生成草稿 artifact
    rule_draft = _build_automation_rule_draft(extracted)
    artifact = {
        "artifact_type": "automation_rule",
        "status": "draft",
        "rule_draft": rule_draft,
        "validation_errors": [],
        "missing_slots": [],
        "follow_up_question": None,
    }
    return extracted, artifact, "llm_extract"


def _build_automation_rule_draft(extracted: dict[str, Any]) -> dict[str, Any]:
    """根据提取的槽位构建 AutomationRuleCreate 草稿内容。"""
    trigger_type = extracted.get("trigger_type") or "scheduled_report_success"
    trigger_config = {}
    biz_id = extracted.get("trigger_biz_id")
    if biz_id:
        trigger_config["biz_id"] = str(biz_id)

    # 构建飞书消息动作配置
    feishu_receivers = extracted.get("feishu_receivers") or ""
    feishu_template = extracted.get("feishu_message_template") or "任务已完成，请查看详情。"

    # 接收人规则：AI 不猜测具体 ID，生成符合 NotificationConfig 的结构
    # 群聊：chat_ids 由前端/后端 resolver 填充；用户：user_ids 同理
    receivers: list[dict[str, Any]] = []
    receiver_query = feishu_receivers or None
    if feishu_receivers:
        if "群" in feishu_receivers:
            receivers.append({"type": "fixed_chats", "chat_ids": []})
        else:
            receivers.append({"type": "fixed_users", "user_ids": []})

    actions_config = [
        {
            "type": "feishu_send_message",
            "name": "发送飞书消息",
            "enabled": True,
            "config": {
                "receivers": receivers,
                "message": {
                    "message_format": "markdown",
                    "title_template": "{{rule_name}} 触发通知",
                    "content_template": feishu_template,
                    "resources": [],
                },
                "require_completion": False,
            },
        }
    ]

    rule_name = extracted.get("rule_name") or f"自动规则-{trigger_type}"
    return {
        "name": rule_name,
        "description": f"由 AI 生成的自动化规则，触发器：{trigger_type}",
        "biz_type": None,
        "trigger_type": trigger_type,
        "trigger_config": trigger_config,
        "condition_config": [],
        "actions_config": actions_config,
        "enabled": False,  # 草稿默认不启用
        "source": "ai_generated",
        # AI 无法解析具体 ID，附加自然语言查询供前端选择器降级
        "receiver_query": receiver_query,
    }


async def _handle_automation_rule_chat(
    payload: AiChatIn,
    extracted: dict[str, Any],
    session: ChatSession,
    user: User,
    db: AsyncSession,
    timer: AiAuditTimer,
) -> AiChatOut:
    """处理自动化规则草稿生成请求。

    流程：
    1. 如果 extractor 返回了 artifact（含草稿或追问），直接使用
    2. 调用规则校验（如果草稿存在）
    3. 返回 AiChatOut 含 artifact
    """
    capability = _ensure_capability("automation.rule.create_draft")
    validate_capability_policy(capability, used_tools=[])

    # extractor 已经生成了 artifact，直接从 session 或 extracted 获取
    # 这里重新生成以确保一致性（extractor 已设置 session.active_capability_id）
    session.active_capability_id = capability.capability_id

    rule_draft = _build_automation_rule_draft(extracted)
    missing_slots = []
    needs_config = []  # 槽位已提取但缺少具体配置（如 receiver_query 有值但无 ID）
    follow_up = None

    # 校验必填槽位
    if not extracted.get("trigger_type"):
        missing_slots.append("trigger_type")
    if not extracted.get("feishu_receivers"):
        missing_slots.append("feishu_receivers")

    # 检查接收人配置：如果有 receiver_query 但 action 中 receiver IDs 为空，标记 needs_config
    if extracted.get("feishu_receivers"):
        actions = rule_draft.get("actions_config", [])
        for action in actions:
            if action.get("type") == "feishu_send_message":
                recvs = action.get("config", {}).get("receivers", [])
                has_ids = any(
                    (r.get("type") == "fixed_chats" and r.get("chat_ids"))
                    or (r.get("type") == "fixed_users" and r.get("user_ids"))
                    for r in recvs
                )
                if not has_ids and recvs:
                    needs_config.append("receiver_ids (请在前端选择具体用户/群)")

    if missing_slots:
        follow_up = "请补充以下信息：" + "、".join(missing_slots)
        artifact = {
            "artifact_type": "automation_rule",
            "status": "draft",
            "rule_draft": rule_draft,
            "validation_errors": [],
            "missing_slots": missing_slots,
            "needs_config": needs_config,
            "follow_up_question": follow_up,
        }
        return AiChatOut(
            intent="automation.rule.create_draft",
            status="missing_slots",
            answer=follow_up,
            trace_id=timer.trace_id,
            conversation_id=session.conversation_id,
            artifact=artifact,
            extracted=extracted,
        )

    # 信息充足：生成草稿并校验
    from app.automation.schemas import AutomationRuleCreate
    try:
        validate_model_payload(AutomationRuleCreate, AutomationRuleCreate(**rule_draft), label="automation_rule_draft")
    except Exception as ve:
        timer.add_event("validation", status="error", reason=str(ve)[:300])
        # 校验失败 → 返回带错误的草稿
        artifact = {
            "artifact_type": "automation_rule",
            "status": "draft",
            "rule_draft": rule_draft,
            "validation_errors": [str(ve)[:500]],
            "missing_slots": [],
            "needs_config": needs_config,
            "follow_up_question": f"规则草稿校验失败：{ve}",
        }
        return AiChatOut(
            intent="automation.rule.create_draft",
            status="validation_error",
            answer=f"规则草稿校验失败：{ve}",
            trace_id=timer.trace_id,
            conversation_id=session.conversation_id,
            artifact=artifact,
            extracted=extracted,
        )

    artifact = {
        "artifact_type": "automation_rule",
        "status": "draft",
        "rule_draft": rule_draft,
        "validation_errors": [],
        "missing_slots": [],
        "needs_config": needs_config,
        "follow_up_question": None,
    }
    config_notice = "⚠️ 提示：接收人已识别但待配置具体用户/群，请在前端选择器中选择。\n" if needs_config else ""
    answer = (
        f"已为你生成自动化规则草稿「{rule_draft['name']}」：\n"
        f"- 触发器：{rule_draft['trigger_type']}\n"
        f"- 动作：发送飞书消息\n"
        f"{config_notice}"
        f"请在下方预览并确认，确认后可保存并启用。"
    )
    return AiChatOut(
        intent="automation.rule.create_draft",
        status="draft_created",
        answer=answer,
        trace_id=timer.trace_id,
        conversation_id=session.conversation_id,
        artifact=artifact,
        extracted=extracted,
    )


# ──────────────────────────────────────────────────────────────────────────
# 全局 AI chat 通用路由（LLM-first 底层组件）。
# 规则（所有 chat 能力统一遵循,新增能力只追加 ChatRoute,不改本段）:
#   1. 路由完全由大模型意图分类决定,不用关键词匹配。
#   2. 语义解析完全交给各能力的 LLM extractor,不写正则解析器。
#   3. 多轮续接由会话层 active_capability_id 承载(状态,不是关键词):
#      分类为 general_question 但有在途任务时,续接到该任务。
# ──────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class ChatRoute:
    intent: str
    capability_id: str
    description: str  # 供意图分类器识别该能力的自然语言说明
    extractor: Callable[[AiChatIn, ChatSession, AsyncSession, AiAuditTimer], Awaitable[tuple[dict[str, Any] | None, dict[str, Any] | None, str]]]
    handler: Callable[[AiChatIn, dict[str, Any], ChatSession, User, AsyncSession, AiAuditTimer], Awaitable[AiChatOut]]


CHAT_ROUTES: tuple[ChatRoute, ...] = (
    ChatRoute(
        intent="compensation.calculate",
        capability_id="compensation.calculate_preview",
        description="员工离职补偿金 / 赔偿金的只读试算与跳转(含修改上一轮的员工/离职日期/方案)",
        extractor=_extract_compensation_request_with_model,
        handler=_handle_compensation_chat,
    ),
    ChatRoute(
        intent="scope.describe_my_scope",
        capability_id="scope.describe_my_scope",
        description="查询/解释当前登录用户自己的数据权限范围（能看到哪些组织、成本中心、人员范围）。是翻译范围规则本身，不是查询具体员工或业务数据。",
        extractor=_extract_my_scope_request,
        handler=_handle_my_scope_chat,
    ),
    ChatRoute(
        intent="automation.rule.create_draft",
        capability_id="automation.rule.create_draft",
        description=(
            "根据用户自然语言描述生成自动化规则草稿（触发器 + 飞书消息动作）。"
            "例如：当月度成本报表每天早上 9 点运行完成后，给薪酬组飞书群发消息。"
        ),
        extractor=_extract_automation_rule_request,
        handler=_handle_automation_rule_chat,
    ),
)


def _route_by_capability(capability_id: str | None) -> ChatRoute | None:
    if not capability_id:
        return None
    for route in CHAT_ROUTES:
        if route.capability_id == capability_id:
            return route
    return None


def _route_by_intent(intent: str) -> ChatRoute | None:
    for route in CHAT_ROUTES:
        if route.intent == intent:
            return route
    return None


async def _classify_chat_intent(
    payload: AiChatIn, session: ChatSession, db: AsyncSession, timer: AiAuditTimer
) -> tuple[str, dict[str, Any] | None]:
    """大模型意图分类(感知在途任务):在已注册 chat 意图中选一个,否则 general_question。

    分类器知道当前有没有在途任务,因此能把"方案改为N""2026-06-30"这类续接
    判回在途能力的 intent;真正离题才返回 general_question。模型可用性由上游保证。
    """
    config = await active_ai_config(db)
    model = (config.model_reasoning or config.model_fast_json or "").strip()
    catalog = "\n".join(f"- {route.intent}: {route.description}" for route in CHAT_ROUTES)
    active = _route_by_capability(session.active_capability_id)
    active_hint = (
        f"用户当前有一个在途任务: {active.intent}({active.description})。"
        "如果本轮消息是在补充或修改这个在途任务(例如只回一个日期、‘方案改为N’、‘人员改成张三’),"
        "请返回该在途任务的 intent,而不是 general_question。"
        if active
        else "用户当前没有在途任务。"
    )
    messages = [
        {
            "role": "system",
            "content": (
                "你是 HR Portal 全局 AI 入口的意图路由器,只输出 JSON 对象:{\"intent\": \"...\"}。"
                "在以下已注册意图中选择最匹配的一个;都不匹配时返回 general_question。\n"
                + catalog
                + "\n"
                + active_hint
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "message": payload.message,
                    "history": [item.model_dump() for item in payload.history[-6:]],
                },
                ensure_ascii=False,
            ),
        },
    ]
    timer.add_event("model_call", capability_id="ai.chat", purpose="intent_classify", model=model)
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
        intent = str(raw.get("intent") or "general_question")
        if _route_by_intent(intent) is None:
            intent = "general_question"
        return intent, usage
    except Exception as exc:
        timer.add_event(
            "model_call",
            status="error",
            capability_id="ai.chat",
            purpose="intent_classify",
            reason=str(exc)[:300],
        )
        return "general_question", None


async def _resolve_chat_route(
    payload: AiChatIn, session: ChatSession, db: AsyncSession, timer: AiAuditTimer
) -> tuple[ChatRoute | None, str, dict[str, Any] | None]:
    """大模型意图分类主导 → 会话续接兜底。调度器不认识任何具体能力,也不做关键词匹配。"""
    # 1) 大模型意图分类(感知在途任务):命中已注册能力即路由(覆盖新建任务和切换能力)。
    intent, usage = await _classify_chat_intent(payload, session, db, timer)
    route = _route_by_intent(intent)
    if route is not None:
        timer.add_event(
            "capability_resolve",
            capability_id=route.capability_id,
            route_intent=route.intent,
            parse_mode="intent_classify",
        )
        return route, "intent_classify", usage
    # 2) 分类为 general_question,但有在途任务 → 续接(状态续接,非关键词)。
    route = _route_by_capability(session.active_capability_id)
    if route is not None:
        timer.add_event(
            "capability_resolve",
            capability_id=route.capability_id,
            route_intent=route.intent,
            parse_mode="session_continuation",
        )
        return route, "session_continuation", usage
    return None, "intent_classify", usage


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
        validate_capability_policy(
            capability,
            used_tools=[
                "compensation.employee_resolve",
                "compensation.calculate_preview",
                "document.preview_from_context",
                "document.print_from_context",
            ],
        )
        timer.add_event("policy_validation", capability_id=capability.capability_id, target="capability")
        conv, session = await load_or_create_conversation(db, user, payload.conversation_id)
        timer.add_event("conversation", conversation_id=session.conversation_id, active_capability_id=session.active_capability_id)
        ai_config = await active_ai_config(db)
        if not ai_config or not ai_config.api_key_encrypted or not (ai_config.model_reasoning or ai_config.model_fast_json):
            # 全局 AI 入口完全依赖大模型做意图识别和语义解析,未配置模型时直接降级提示,不做正则猜测。
            out = AiChatOut(
                intent="general_question",
                status="ai_unconfigured",
                answer="当前未配置可用的 AI 模型,无法理解自然语言请求。请联系管理员在「系统设置 → AI 配置」中启用模型,或在对应功能页手动操作。",
                trace_id=timer.trace_id,
                conversation_id=session.conversation_id,
            )
            parse_mode = "no_model"
        else:
            route, parse_mode, usage = await _resolve_chat_route(payload, session, db, timer)
            if route is None:
                session.clear_active()
                out = AiChatOut(
                    intent="general_question",
                    status="unsupported",
                    answer="当前全局 AI 支持：补偿金只读试算、查询你的数据权限范围。你可以说：帮我算某某的补偿金 / 我能看到哪些数据权限范围。",
                    trace_id=timer.trace_id,
                )
            else:
                extracted, extract_usage, extract_mode = await route.extractor(payload, session, db, timer)
                usage = extract_usage or usage
                parse_mode = f"{parse_mode}+{extract_mode}"
                if extracted is None:
                    # 大模型解析失败:不猜,提示用户换种说法;保留在途任务以便重试。
                    out = AiChatOut(
                        intent=route.intent,
                        status="unclear",
                        answer="我没太理解你的意思,可以说得更具体些吗?例如:帮我算 张三 2026-06-30 的 N+1 补偿金。",
                        trace_id=timer.trace_id,
                    )
                else:
                    out = await route.handler(payload, extracted, session, user, db, timer)
        out.conversation_id = session.conversation_id
        await persist_conversation(db, conv, session)
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
                "conversation_id": session.conversation_id,
                "active_capability_id": session.active_capability_id,
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
