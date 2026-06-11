from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import Menu, Role, RoleMenu, User, UserRole


Permission = tuple[str, str] | None


@dataclass(frozen=True)
class CapabilityDefinition:
    capability_id: str
    name: str
    module: str
    type: str
    description: str
    version: str = "0.1.0"
    is_enabled: bool = True
    ai_visible: bool = True
    required_permission: Permission = None
    risk_level: str = "low"
    side_effect_tags: list[str] = field(default_factory=list)
    confirmation: str = "none"
    tools: list[str] = field(default_factory=list)
    policy_profile: dict[str, Any] = field(default_factory=dict)
    model_profile: str = "fast_json"
    audit_enabled: bool = True
    sensitive_context: str = "metadata_only"
    examples: list[str] = field(default_factory=list)
    failure_modes: list[str] = field(default_factory=list)
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] = field(default_factory=dict)


CAPABILITIES: tuple[CapabilityDefinition, ...] = (
    CapabilityDefinition(
        capability_id="ai.capability.list",
        name="查询 AI 能力清单",
        module="ai",
        type="query",
        description="查询当前用户可见且可用的 AI Capability。",
        side_effect_tags=[],
        policy_profile={"output_contract": "schema_validated"},
        model_profile="none",
        sensitive_context="none",
        examples=["我现在可以用哪些 AI 能力？"],
    ),
    CapabilityDefinition(
        capability_id="ai.chat",
        name="全局 AI 对话入口",
        module="ai",
        type="chat",
        description="全局页面级 AI 对话入口，识别用户目标并受控调用已注册 Capability。",
        side_effect_tags=[],
        tools=["compensation.employee_resolve", "compensation.calculate_preview"],
        policy_profile={
            "output_contract": "ai_chat_schema",
            "allowed_side_effect": "none",
            "tool_scope": "registered_capabilities_only",
        },
        model_profile="reasoning",
        sensitive_context="metadata_only",
        examples=["帮我计算刘琦的补偿金", "帮我打开补偿金计算并算一下张三 N+1"],
        failure_modes=["意图无法识别", "用户无对应业务权限", "员工重名需用户选择", "缺少离职日期或地区"],
    ),
    CapabilityDefinition(
        capability_id="function_catalog.query",
        name="查询公式函数库",
        module="ai_formula",
        type="answer",
        description="查询公式函数是否存在、是否启用以及如何使用。",
        required_permission=("system.function_library", "V"),
        side_effect_tags=[],
        tools=["function_catalog.list_enabled"],
        policy_profile={"output_contract": "schema_validated", "deny_patterns": []},
        model_profile="fast_json",
        sensitive_context="none",
        examples=["SAFE_DIVIDE 怎么用？", "当前启用了哪些公式函数？"],
        failure_modes=["函数不存在", "函数未启用", "用户无权查看函数库"],
    ),
    CapabilityDefinition(
        capability_id="formula.generate",
        name="生成公式草稿",
        module="ai_formula",
        type="draft",
        description="根据自然语言、数据集字段和函数元数据生成平台可保存的公式草稿。",
        required_permission=("datasource.datasets", "C"),
        risk_level="medium",
        side_effect_tags=["draft_only"],
        tools=["dataset.list_fields", "function_catalog.list_enabled", "formula.validate"],
        policy_profile={
            "output_contract": "formula_draft_schema",
            "deny_patterns": ["sql", "code", "url", "file_path", "external_link", "macro"],
            "field_context": "authorized_metadata_only",
            "allowed_side_effect": "draft_only",
        },
        model_profile="fast_json",
        sensitive_context="authorized_metadata_only",
        examples=["如果员工是刘琦，则返回 1，否则 2", "用基本工资计算个税"],
        failure_modes=["字段不存在", "函数未启用", "模型未返回合法 JSON", "公式后端校验失败"],
    ),
    CapabilityDefinition(
        capability_id="formula.validate",
        name="校验公式",
        module="ai_formula",
        type="diagnose",
        description="校验公式语法、字段引用、函数白名单和危险表达式。",
        required_permission=("datasource.datasets", "V"),
        risk_level="low",
        side_effect_tags=[],
        tools=["dataset.list_fields", "function_catalog.list_enabled"],
        policy_profile={
            "output_contract": "formula_validate_schema",
            "deny_patterns": ["sql", "code", "url", "file_path", "external_link", "macro"],
            "field_context": "authorized_metadata_only",
        },
        model_profile="none",
        sensitive_context="authorized_metadata_only",
        examples=["帮我检查这个公式为什么保存失败"],
        failure_modes=["字段不存在", "函数未启用", "危险公式", "公式语法不合法"],
    ),
    CapabilityDefinition(
        capability_id="formula.repair",
        name="修复公式草稿",
        module="ai_formula",
        type="draft",
        description="根据校验错误和当前公式生成新的公式草稿。",
        required_permission=("datasource.datasets", "C"),
        risk_level="medium",
        side_effect_tags=["draft_only"],
        tools=["formula.validate", "dataset.list_fields", "function_catalog.list_enabled"],
        policy_profile={
            "output_contract": "formula_draft_schema",
            "deny_patterns": ["sql", "code", "url", "file_path", "external_link", "macro"],
            "field_context": "authorized_metadata_only",
            "allowed_side_effect": "draft_only",
        },
        model_profile="fast_json",
        sensitive_context="authorized_metadata_only",
        examples=["把这个公式修到能保存", "把刘琦改成张三"],
        failure_modes=["字段不存在", "函数未启用", "修复后仍未通过校验"],
    ),
    CapabilityDefinition(
        capability_id="calculated_field.save",
        name="保存数据集计算字段",
        module="datasets",
        type="write",
        description="把用户确认后的公式草稿保存为数据集级计算字段。",
        required_permission=("datasource.datasets", "C"),
        risk_level="high",
        side_effect_tags=["writes_data", "high_risk"],
        confirmation="required",
        tools=["calculated_field.create", "formula.validate"],
        policy_profile={
            "output_contract": "calculated_field_schema",
            "requires_confirmation": True,
            "allowed_side_effect": "writes_data",
        },
        model_profile="none",
        sensitive_context="none",
        examples=["保存为计算字段"],
        failure_modes=["用户未确认", "计算字段编码重复", "公式校验失败", "用户无权创建字段"],
    ),
    CapabilityDefinition(
        capability_id="codegen.suggest",
        name="英文编码建议",
        module="codegen",
        type="draft",
        description="把中文表名/字段名翻译成语义化的英文 snake_case 标识符,AI 生成候选、本地规则兜底,最终由用户确认或修改。",
        required_permission=None,
        risk_level="low",
        side_effect_tags=["draft_only"],
        tools=[],
        policy_profile={
            "output_contract": "code_suggest_schema",
            "deny_patterns": ["sql", "code", "url", "file_path", "external_link", "macro"],
            "field_context": "metadata_only",
            "allowed_side_effect": "draft_only",
        },
        model_profile="fast_json",
        sensitive_context="metadata_only",
        examples=["员工月度考勤表 → emp_monthly_attendance", "补偿金分期发放表 → severance_installment"],
        failure_modes=["AI 未配置或超时", "模型未返回合法 JSON", "翻译结果非法回退规则"],
    ),
    CapabilityDefinition(
        capability_id="compensation.employee_resolve",
        name="解析补偿金员工",
        module="tools",
        type="query",
        description="根据姓名、工号或英文名搜索当前用户有权限查看的补偿金计算候选员工。",
        required_permission=("tools.compensation_calc", "V"),
        risk_level="low",
        side_effect_tags=[],
        tools=["compensation.employee_search"],
        policy_profile={
            "output_contract": "compensation_employee_candidates_schema",
            "allowed_side_effect": "none",
            "field_context": "authorized_business_data",
        },
        model_profile="none",
        sensitive_context="authorized_business_data",
        examples=["查找刘琦用于补偿金计算"],
        failure_modes=["员工不存在", "员工重名", "用户无数据范围权限"],
    ),
    CapabilityDefinition(
        capability_id="compensation.calculate_preview",
        name="补偿金只读试算",
        module="tools",
        type="preview",
        description="根据已确认员工、离职日期、地区和方案调用补偿金计算逻辑，只返回试算结果和跳转建议，不写入数据。",
        required_permission=("tools.compensation_calc", "V"),
        risk_level="medium",
        side_effect_tags=[],
        tools=["compensation.employee_search", "compensation.calculate"],
        policy_profile={
            "output_contract": "compensation_preview_schema",
            "allowed_side_effect": "none",
            "field_context": "authorized_business_data",
        },
        model_profile="none",
        sensitive_context="authorized_business_data",
        examples=["计算刘琦 2026-06-30 N+1 补偿金"],
        failure_modes=["缺少离职日期", "未配置补偿金上限", "用户无基本工资权限", "员工无数据范围权限"],
    ),
    CapabilityDefinition(
        capability_id="report.explain_config",
        name="解释报表配置",
        module="reports",
        type="answer",
        description="基于报表结构化配置生成只读说明，用于验证 AI 底座可迁移到公式以外的低风险场景。",
        required_permission=("report.list", "V"),
        risk_level="low",
        side_effect_tags=[],
        tools=["report.read_config"],
        policy_profile={
            "output_contract": "report_explain_config_schema",
            "allowed_side_effect": "none",
            "field_context": "metadata_only",
        },
        model_profile="reasoning",
        sensitive_context="metadata_only",
        examples=["解释这张报表当前展示了哪些字段和筛选条件", "继续追问这个筛选条件为什么这样配置"],
        failure_modes=["报表配置为空", "用户无权查看报表", "输入配置结构不合法"],
    ),
)


CAPABILITY_BY_ID: dict[str, CapabilityDefinition] = {
    item.capability_id: item for item in CAPABILITIES
}


def get_capability(capability_id: str) -> CapabilityDefinition | None:
    return CAPABILITY_BY_ID.get(capability_id)


async def user_has_permission(user: User, db: AsyncSession, permission: Permission) -> bool:
    if permission is None:
        return True
    menu_code, op = permission
    op = op.upper()
    flag_col = {
        "V": RoleMenu.can_view,
        "C": RoleMenu.can_create,
        "U": RoleMenu.can_update,
        "D": RoleMenu.can_delete,
        "E": RoleMenu.can_export,
    }.get(op)
    if flag_col is None:
        return False
    stmt = (
        select(RoleMenu.id)
        .join(Role, Role.id == RoleMenu.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .join(Menu, Menu.id == RoleMenu.menu_id)
        .where(
            UserRole.user_id == user.id,
            Role.is_active.is_(True),
            Menu.code == menu_code,
            flag_col.is_(True),
        )
        .limit(1)
    )
    return (await db.execute(stmt)).first() is not None


async def visible_capabilities(user: User, db: AsyncSession) -> list[CapabilityDefinition]:
    result: list[CapabilityDefinition] = []
    for item in CAPABILITIES:
        if not item.is_enabled or not item.ai_visible:
            continue
        if await user_has_permission(user, db, item.required_permission):
            result.append(item)
    return result
