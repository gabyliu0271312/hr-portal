"""Stable assessment identities shared by the role directory and workflow nodes."""
from sqlalchemy import select

from app.performance.models import PerformanceRole


ROLE_REVIEWEE = "assessment.reviewee"
ROLE_LINE_MANAGER = "assessment.line_manager"
ROLE_DOTTED_MANAGER = "assessment.dotted_manager"
ROLE_PROJECT_MANAGER = "assessment.project_manager"
ROLE_REVIEWER_360 = "assessment.reviewer_360"
ROLE_CALIBRATOR = "assessment.calibrator"
ROLE_METRIC_EVALUATOR = "assessment.metric_evaluator"

ASSESSMENT_ROLES = (
    (ROLE_REVIEWEE, "被评估人", "员工本人", "SUBJECT"),
    (ROLE_LINE_MANAGER, "实线上级", "从组织架构中获取", "REAL_LINE_MANAGER"),
    (ROLE_DOTTED_MANAGER, "虚线上级", "从组织架构中获取", "VIRTUAL_LINE_MANAGER"),
    (ROLE_PROJECT_MANAGER, "直属项目上级", "在周期中导入", "PROJECT_MANAGER"),
    (ROLE_REVIEWER_360, "360°评估人", "通过 360 邀请添加", "REVIEWER_360"),
    (ROLE_CALIBRATOR, "校准人", "在项目配置中指定", "PROJECT_CONFIGURED"),
    (ROLE_METRIC_EVALUATOR, "指标评价人", "在添加指标时指定", "INDICATOR_EVALUATOR"),
)
ROLE_BY_CODE = {role[0]: role for role in ASSESSMENT_ROLES}
ROLE_BY_LABEL = {role[1]: role for role in ASSESSMENT_ROLES}
MANAGER_LEVELS = {"DIRECT_MANAGER", "LEVEL_1_MANAGER", "LEVEL_2_MANAGER", "LEVEL_3_MANAGER_PLUS"}
MANAGER_ROLE_CODES = {ROLE_LINE_MANAGER, ROLE_DOTTED_MANAGER, ROLE_PROJECT_MANAGER}
FIXED_ROLE_BY_NODE_TYPE = {
    "work_summary": ROLE_REVIEWEE,
    "reviewer_360_invite": ROLE_REVIEWEE,
    "result_view": ROLE_REVIEWEE,
    "calibration": ROLE_CALIBRATOR,
}
ROLE_BY_EXECUTOR_TYPE = {
    "SUBJECT": ROLE_REVIEWEE,
    "REAL_LINE_MANAGER": ROLE_LINE_MANAGER,
    "VIRTUAL_LINE_MANAGER": ROLE_DOTTED_MANAGER,
    "PROJECT_MANAGER": ROLE_PROJECT_MANAGER,
    "REVIEWER_360": ROLE_REVIEWER_360,
    "PROJECT_CONFIGURED": ROLE_CALIBRATOR,
    "INDICATOR_EVALUATOR": ROLE_METRIC_EVALUATOR,
}


def node_role_code(node: dict) -> str | None:
    """Canonical executor identity for a template node or a node-snapshot template payload."""
    code = node.get("executor_role_code")
    if code in ROLE_BY_CODE:
        return code
    fixed = FIXED_ROLE_BY_NODE_TYPE.get(node.get("node_type"))
    if fixed:
        return fixed
    for executor_type in node.get("executor_types") or []:
        if executor_type in ROLE_BY_EXECUTOR_TYPE:
            return ROLE_BY_EXECUTOR_TYPE[executor_type]
        if executor_type in MANAGER_LEVELS:
            return ROLE_LINE_MANAGER
    return None


def normalize_executor_identity(node: dict) -> dict:
    kind = node.get("node_type")
    if kind == "result_reconsideration":
        return {**node, "executor_role_code": None}
    fixed = FIXED_ROLE_BY_NODE_TYPE.get(kind)
    code = fixed or node.get("executor_role_code")
    if code is None:
        label = node.get("executor_label") or "实线上级"
        role = ROLE_BY_LABEL.get("实线上级" if label == "直属上级" else label)
        if role is None:
            raise ValueError("不支持的环节执行人")
        code = role[0]
    if code not in ROLE_BY_CODE:
        raise ValueError("不支持的评估角色编码")
    allowed = {ROLE_LINE_MANAGER, ROLE_DOTTED_MANAGER} if kind in {"result_communication", "reviewer_360_confirm"} else set(ROLE_BY_CODE) - {ROLE_CALIBRATOR}
    if not fixed and code not in allowed:
        raise ValueError("当前环节不支持该评估角色")
    _, label, _, executor_type = ROLE_BY_CODE[code]
    if code == ROLE_LINE_MANAGER:
        levels = MANAGER_LEVELS - ({"LEVEL_3_MANAGER_PLUS"} if kind == "reviewer_360_confirm" else set())
        types = [value for value in node.get("executor_types") or [] if value in levels] or ["DIRECT_MANAGER"]
    else:
        types = [executor_type]
    return {**node, "executor_role_code": code, "executor_label": "在项目配置时指定" if fixed == ROLE_CALIBRATOR else label, "executor_types": list(dict.fromkeys(types))}


async def validate_executor_roles(db, nodes: list[dict]) -> None:
    codes = {node.get("executor_role_code") for node in nodes} - {None}
    if not codes:
        return
    roles = (await db.execute(select(PerformanceRole).where(PerformanceRole.code.in_(codes)))).scalars().all()
    available = {role.code for role in roles if role.role_type == "ASSESSMENT" and role.is_system and role.is_active}
    if codes - available:
        raise ValueError("评估角色目录缺失或不可用，请检查角色配置")
