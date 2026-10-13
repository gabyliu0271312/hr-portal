"""Role-based disclosure rules for evaluated-person profile fields."""
from __future__ import annotations

from copy import deepcopy

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.employee_roster_contract import format_job_sequence, organization_leaf
from app.performance.auth_context import PerformanceAccessContext
from app.performance.models import (
    PerformanceHrbpPermission,
    PerformanceProject,
    PerformanceProjectMember,
    PerformanceProjectNodeSnapshot,
    PerformanceSubjectVisibilitySetting,
)

SUBJECT_VISIBILITY_FIELDS = (
    ("department", "部门"),
    ("position_level", "职级"),
    ("job_sequence", "序列"),
    ("direct_supervisor", "直属上级"),
    ("hire_date", "入职日期"),
    ("employee_type", "人员类型"),
)
SUBJECT_VISIBILITY_FIELD_LABELS = dict(SUBJECT_VISIBILITY_FIELDS)
SUBJECT_VISIBILITY_ROLES = (
    ("reviewee", "被评估人"),
    ("leader", "实线上级"),
    ("dotted_leader", "虚线上级"),
    ("pdt_manager", "PDT 管理者"),
    ("metric_reviewer", "指标评价人"),
    ("reviewer_360", "360°评估人"),
    ("adjuster", "校准人"),
    ("hrbp", "HRBP"),
    ("activity_manager", "项目管理员"),
    ("other", "其他角色"),
)
SUBJECT_VISIBILITY_ROLE_LABELS = dict(SUBJECT_VISIBILITY_ROLES)
DEFAULT_SUBJECT_VISIBILITY_RULES = {
    "reviewee": ["department", "position_level", "job_sequence"],
    "leader": ["department", "position_level", "job_sequence", "direct_supervisor", "hire_date"],
    "dotted_leader": ["department", "position_level", "job_sequence", "direct_supervisor", "hire_date"],
    "pdt_manager": ["department"],
    "metric_reviewer": ["department"],
    "reviewer_360": ["department", "job_sequence", "direct_supervisor", "hire_date"],
    "adjuster": ["department", "position_level", "job_sequence", "direct_supervisor", "hire_date"],
    "hrbp": ["department", "position_level", "job_sequence", "direct_supervisor", "hire_date"],
    "activity_manager": ["department", "position_level", "job_sequence", "direct_supervisor", "hire_date", "employee_type"],
    "other": ["department", "job_sequence", "direct_supervisor", "hire_date"],
}


def normalize_subject_visibility_rules(raw: object) -> dict[str, list[str]]:
    source = raw if isinstance(raw, dict) else {}
    allowed = set(SUBJECT_VISIBILITY_FIELD_LABELS)
    result: dict[str, list[str]] = {}
    for role_key, _ in SUBJECT_VISIBILITY_ROLES:
        values = source.get(role_key, DEFAULT_SUBJECT_VISIBILITY_RULES[role_key])
        if not isinstance(values, list):
            values = DEFAULT_SUBJECT_VISIBILITY_RULES[role_key]
        result[role_key] = list(dict.fromkeys(str(value) for value in values if str(value) in allowed))
    return result


async def load_subject_visibility_rules(db: AsyncSession) -> dict[str, list[str]]:
    setting = await db.get(PerformanceSubjectVisibilitySetting, 1)
    return normalize_subject_visibility_rules(getattr(setting, "rules", None))


def _executor_label(node: PerformanceProjectNodeSnapshot) -> str:
    config = getattr(node, "config", None) or {}
    template = config.get("template") if isinstance(config.get("template"), dict) else {}
    return str(template.get("executor_label") or config.get("executor_label") or "").strip()


async def resolve_subject_visibility_role(
    db: AsyncSession,
    context: PerformanceAccessContext,
    actor_ref: str,
    member: PerformanceProjectMember | None,
    node: PerformanceProjectNodeSnapshot,
    project: PerformanceProject | None,
) -> str:
    target_ref = getattr(member, "employee_no", None) if member else None
    if target_ref and actor_ref == target_ref:
        return "reviewee"
    if member and actor_ref == str(getattr(member, "direct_supervisor_employee_no", None) or ""):
        return "leader"
    if project and context.display_name in (getattr(project, "administrators", None) or []):
        return "activity_manager"
    cycle_ref = getattr(project, "cycle_ref", None) if project else None
    if cycle_ref:
        try:
            hrbp = await db.scalar(
                select(PerformanceHrbpPermission.id).where(
                    PerformanceHrbpPermission.cycle_ref == cycle_ref,
                    PerformanceHrbpPermission.hrbp_employee_no == actor_ref,
                ).limit(1)
            )
        except (AttributeError, AssertionError):
            hrbp = None
        if hrbp is not None:
            return "hrbp"
    label = _executor_label(node)
    if label == "被评估人":
        return "reviewee"
    if label == "实线上级":
        return "leader"
    if label == "虚线上级":
        return "dotted_leader"
    if label == "HRBP":
        return "hrbp"
    if label in {"PDT 管理者", "PDT负责人", "PDT 负责人"}:
        return "pdt_manager"
    if getattr(node, "node_type", "") == "calibration" or label == "校准人":
        return "adjuster"
    if "360" in getattr(node, "node_type", "") or "360" in label:
        return "reviewer_360"
    if getattr(node, "node_type", "") == "evaluation":
        return "metric_reviewer"
    return "other"


def mask_profile_values(values: dict, visible_fields: list[str]) -> dict:
    allowed = set(visible_fields)
    for key in ("department", "position_level", "job_sequence", "direct_supervisor", "hire_date", "employee_type", "employment_status"):
        if key not in allowed:
            values[key] = None
    if "department" not in allowed:
        for key in ("company_org", "department", "department_2", "department_3", "department_4", "department_5"):
            values[key] = None
    if "job_sequence" not in allowed:
        values["job_family"] = None
        values["job_category"] = None
    return values


def subject_profile_items(
    member: PerformanceProjectMember | None,
    visible_fields: list[str],
    *,
    direct_supervisor_name: str | None = None,
) -> list[dict[str, str]]:
    if member is None:
        return []
    hire_date = getattr(member, "hire_date", None)
    values = {
        "department": organization_leaf(member),
        "position_level": getattr(member, "position_level", None),
        "job_sequence": format_job_sequence(getattr(member, "job_family", None), getattr(member, "job_category", None)),
        "direct_supervisor": direct_supervisor_name or getattr(member, "direct_supervisor_employee_no", None),
        "hire_date": hire_date.isoformat() if hire_date else None,
        "employee_type": getattr(member, "employee_type", None),
    }
    return [
        {"key": key, "label": SUBJECT_VISIBILITY_FIELD_LABELS[key], "value": str(values[key])}
        for key in visible_fields
        if values.get(key) not in (None, "")
    ]


def default_subject_visibility_rules() -> dict[str, list[str]]:
    return deepcopy(DEFAULT_SUBJECT_VISIBILITY_RULES)
