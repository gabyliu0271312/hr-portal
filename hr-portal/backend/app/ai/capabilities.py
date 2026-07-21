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
        tools=[
            "compensation.employee_resolve",
            "compensation.calculate_preview",
            "document.preview_from_context",
            "document.print_from_context",
        ],
        policy_profile={
            "output_contract": "ai_chat_schema",
            "allowed_side_effect": "none",
            "tool_scope": "registered_capabilities_only",
        },
        model_profile="reasoning",
        sensitive_context="metadata_only",
        examples=["帮我计算刘琦的补偿金", "帮我打开补偿金计算并算一下张三 N+1", "预览刚才这份解除协议"],
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
        capability_id="employee.profile.query",
        name="\u5458\u5de5\u6863\u6848\u67e5\u8be2",
        module="ai",
        type="query",
        description="\u6309\u59d3\u540d\u3001\u82f1\u6587\u540d\u3001\u5de5\u53f7\u67e5\u8be2\u5458\u5de5\u57fa\u7840\u4fe1\u606f",
        required_permission=("employee.profile", "V"),
        risk_level="medium",
        side_effect_tags=[],
        tools=["employee.profile.lookup"],
        policy_profile={"output_contract": "employee_profile_controlled"},
        model_profile="fast_json",
        sensitive_context="authorized_metadata_only",
        examples=["\u67e5\u8be2\u5458\u5de5 Tianhao.wu \u7684\u4fe1\u606f"],
        failure_modes=["\u5458\u5de5\u4e0d\u5b58\u5728", "\u65e0\u6743\u67e5\u8be2", "\u53ef\u89c1\u5b57\u6bb5\u4e0d\u8db3"],
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
            "output_contract": "ai_chat_schema",
            "allowed_side_effect": "none",
            "field_context": "authorized_business_data",
        },
        model_profile="none",
        sensitive_context="authorized_business_data",
        examples=["计算刘琦 2026-06-30 N+1 补偿金"],
        failure_modes=["缺少离职日期", "未配置补偿金上限", "用户无基本工资权限", "员工无数据范围权限"],
    ),
    CapabilityDefinition(
        capability_id="document.preview_from_context",
        name="基于上下文预览文档",
        module="tools",
        type="preview",
        description="基于已授权业务上下文生成模板文档预览。当前用于补偿金试算后的解除协议预览。",
        required_permission=("tools.compensation_calc", "V"),
        risk_level="medium",
        side_effect_tags=[],
        tools=["document.prepare_from_context", "document.preview"],
        policy_profile={
            "output_contract": "document_action_schema",
            "allowed_side_effect": "none",
            "field_context": "authorized_business_data",
        },
        model_profile="none",
        sensitive_context="authorized_business_data",
        examples=["预览刚才算好的解除协议"],
        failure_modes=["缺少业务上下文", "用户无模板权限", "模板未配置"],
    ),
    CapabilityDefinition(
        capability_id="document.print_from_context",
        name="基于上下文打印文档",
        module="tools",
        type="export",
        description="基于已授权业务上下文生成可打印 PDF。当前用于补偿金试算后的解除协议打印。",
        required_permission=("tools.compensation_calc", "V"),
        risk_level="medium",
        side_effect_tags=["export"],
        tools=["document.prepare_from_context", "document.pdf"],
        policy_profile={
            "output_contract": "document_action_schema",
            "allowed_side_effect": "export",
            "field_context": "authorized_business_data",
        },
        model_profile="none",
        sensitive_context="authorized_business_data",
        examples=["打印刚才这份解除协议"],
        failure_modes=["缺少业务上下文", "用户无模板权限", "PDF 转换失败"],
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
    CapabilityDefinition(
        capability_id="table_merge.suggest_mapping",
        name="生成表格归集映射草稿",
        module="table_tools",
        type="draft",
        description="读取多源 Excel 的表头结构,跨文件聚类语义相同的列,提议标准字段、源列→标准字段映射、派生规则与归集主键,产出待人确认的归集模板草稿。只产草稿不写库。",
        required_permission=("table_tools", "E"),
        risk_level="medium",
        side_effect_tags=["draft_only"],
        confirmation="none",
        tools=[],
        policy_profile={
            "output_contract": "merge_mapping_draft_schema",
            "deny_patterns": ["code", "url", "file_path", "external_link", "macro"],
            "field_context": "headers_only",
            "allowed_side_effect": "draft_only",
        },
        model_profile="fast_json",
        sensitive_context="metadata_only",
        examples=["这批社保表帮我提一组标准字段和映射", "北京公积金这张表的列怎么对到标准字段"],
        failure_modes=["AI 未配置或超时", "模型未返回合法 JSON", "口径歧义列需人工定夺", "表头解析失败"],
    ),
    CapabilityDefinition(
        capability_id="scope.describe_my_scope",
        name="查询我的数据权限范围",
        module="scopes",
        type="query",
        description="用自然语言解释当前登录用户被授予的数据范围（能看到哪些组织/成本中心、哪些人员范围），只翻译范围规则，不查数据明细。",
        required_permission=None,
        risk_level="low",
        side_effect_tags=[],
        tools=[],
        policy_profile={"output_contract": "ai_chat_schema", "allowed_side_effect": "none"},
        model_profile="none",
        sensitive_context="none",
        examples=["我能看到哪些数据权限范围？", "我的数据范围是什么", "我有哪些数据权限标签"],
        failure_modes=["用户未绑定任何标签", "树节点已失效"],
    ),
    # ========== 自动化规则 Capabilities ==========
    CapabilityDefinition(
        capability_id="automation.rule.create_draft",
        name="生成自动化规则草稿",
        module="automation",
        type="draft",
        description=(
            "根据用户自然语言描述生成自动化规则草稿（触发器 + 动作配置），"
            "包含 Scheduler Job 草稿和 AutomationRule 草稿。"
            "草稿不保存，需用户确认后才能写入。"
        ),
        required_permission=("automation.rules", "C"),
        risk_level="medium",
        side_effect_tags=["draft_only"],
        confirmation="none",
        tools=["automation.list_trigger_types", "automation.list_action_types"],
        policy_profile={
            "output_contract": "ai_chat_schema",
            "allowed_side_effect": "draft_only",
            "deny_patterns": ["sql", "code", "external_url"],
        },
        model_profile="reasoning",
        sensitive_context="metadata_only",
        examples=[
            "当月度成本报表每天早上 9 点运行完成后，给薪酬组飞书群发消息，附上报表链接",
            "报表运行失败时通知我",
        ],
        failure_modes=[
            "未说明报表名称",
            "未说明通知接收人",
            "群名匹配多个飞书群",
            "未说明成功还是失败触发",
        ],
        input_schema={
            "type": "object",
            "properties": {
                "user_message": {"type": "string", "description": "用户自然语言描述"},
                "context": {
                    "type": "object",
                    "properties": {
                        "page": {"type": "string"},
                    },
                },
            },
            "required": ["user_message"],
        },
        output_schema={
            "type": "object",
            "description": "通过 /ai/chat 返回的统一 CapabilityResultEnvelope；草稿位于 result.data。",
        },
    ),
    CapabilityDefinition(
        capability_id="automation.rule.validate",
        name="校验自动化规则草稿",
        module="automation",
        type="diagnose",
        description="校验自动化规则草稿的完整性和合法性，返回错误列表。",
        required_permission=("automation.rules", "V"),
        risk_level="low",
        side_effect_tags=[],
        confirmation="none",
        tools=["automation.validate_rule"],
        policy_profile={"output_contract": "schema_validated", "allowed_side_effect": "none"},
        model_profile="none",
        sensitive_context="none",
        examples=["检查这条规则配置是否完整"],
        failure_modes=["trigger_type 不合法", "动作配置缺失", "接收人未配置"],
    ),
    CapabilityDefinition(
        capability_id="automation.rule.save",
        name="保存自动化规则",
        module="automation",
        type="write",
        description="把用户确认后的自动化规则草稿保存到数据库。必须二次确认，不能绕过。",
        required_permission=("automation.rules", "C"),
        risk_level="high",
        side_effect_tags=["writes_data"],
        confirmation="required",
        tools=["automation.create_rule"],
        policy_profile={
            "output_contract": "automation_rule_schema",
            "requires_confirmation": True,
            "allowed_side_effect": "writes_data",
        },
        model_profile="none",
        sensitive_context="none",
        examples=["保存这条规则"],
        failure_modes=["用户未确认", "规则校验失败", "用户无权创建规则"],
    ),
    CapabilityDefinition(
        capability_id="automation.rule.enable",
        name="启用或停用自动化规则",
        module="automation",
        type="write",
        description="启用或停用指定自动化规则。必须确认，不能直接执行。",
        required_permission=("automation.rules", "U"),
        risk_level="medium",
        side_effect_tags=["writes_data"],
        confirmation="required",
        tools=["automation.enable_rule", "automation.disable_rule"],
        policy_profile={
            "output_contract": "automation_rule_schema",
            "requires_confirmation": True,
            "allowed_side_effect": "writes_data",
        },
        model_profile="none",
        sensitive_context="none",
        examples=["启用报表通知规则", "停用这条规则"],
        failure_modes=["规则不存在", "用户无权修改规则"],
    ),
    # ========== 飞书消息 Capabilities ==========
    CapabilityDefinition(
        capability_id="feishu.message.preview",
        name="预览飞书消息",
        module="automation",
        type="preview",
        description="预览飞书消息模板渲染结果和接收人解析结果，不发送。",
        required_permission=("automation.rules", "V"),
        risk_level="low",
        side_effect_tags=[],
        confirmation="none",
        tools=["feishu.resolve_receivers", "feishu.preview_message"],
        policy_profile={"output_contract": "schema_validated", "allowed_side_effect": "none"},
        model_profile="none",
        sensitive_context="metadata_only",
        examples=["预览这条规则会发给谁", "预览消息内容"],
        failure_modes=["接收人无飞书 ID", "模板变量未替换", "花名册找不到员工"],
    ),
    CapabilityDefinition(
        capability_id="feishu.message.test_send",
        name="测试发送飞书消息",
        module="automation",
        type="send",
        description="向配置的接收人测试发送飞书消息，is_test=true，写日志但不影响正式规则。必须确认。",
        required_permission=("automation.rules", "E"),
        risk_level="high",
        side_effect_tags=["external_send"],
        confirmation="required",
        tools=["feishu.send_test"],
        policy_profile={
            "output_contract": "schema_validated",
            "requires_confirmation": True,
            "allowed_side_effect": "external_send",
        },
        model_profile="none",
        sensitive_context="none",
        examples=["测试发送给薪酬组群"],
        failure_modes=["接收人无飞书 ID", "飞书接口调用失败", "用户无发送权限"],
    ),
    # ========== 数据对比 Capability ==========
    CapabilityDefinition(
        capability_id="data.compare",
        name="跨表数据对比检查",
        module="data_compare",
        type="query",
        description=(
            "根据自然语言描述对比两张表的数据一致性。支持三种对比类型："
            "1) 名单对比 — 检查双方员工是否一致；"
            "2) 字段对比 — 检查指定字段值是否一致，支持跨表不同字段名映射；"
            "3) 金额对比 — 按维度汇总后对比金额是否一致，支持多维分组与绝对/百分比容差。"
            "LLM 只输出结构化 CompareSpec JSON，后端 CompareTemplateEngine 编译为参数化 SQL，零注入风险。"
        ),
        required_permission=("system.data_compare", "V"),
        risk_level="low",
        side_effect_tags=[],
        confirmation="none",
        tools=[
            "data_compare.list_comparable_tables",
            "data_compare.get_table_columns",
            "data_compare.execute_compare",
        ],
        policy_profile={
            "output_contract": "ai_chat_schema",
            "allowed_side_effect": "none",
            "deny_patterns": [],
            "table_whitelist": "registered_tables_only",
            "column_whitelist": "table_columns_metadata_only",
            "row_filter": "scope_strategy_auto_inject",
        },
        model_profile="reasoning",
        sensitive_context="metadata_only",
        examples=[
            "对比6月月度花名册和月度工资表的员工名单",
            "检查6月工资表和花名册的部门、岗位信息是否一致",
            "对比6月工资表的应发合计和分摊表的分摊金额，按部门汇总",
            "对比花名册和实时花名册的部门、岗位、职级",
            "检查7月工资表和个税表名单，只对比正式员工",
        ],
        failure_modes=[
            "表不存在或未注册",
            "月份参数缺失（月度表必须指定 period_ym）",
            "关联键字段不存在于其中一张表",
            "对比字段不存在于其中一张表",
            "用户无权访问其中一张表（scope_strategy 拒绝）",
            "CompareSpec Schema 校验失败（字段白名单/类型不匹配）",
            "金额字段类型不兼容（非 number 类型）",
        ],
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
