from __future__ import annotations

from collections.abc import Iterable, Mapping

from app.permissions.strategy import (
    PERSON_SCOPE_ROLES,
    SCOPE_STRATEGY_CC_FIRST,
    SCOPE_STRATEGY_CROSS_FILTER,
    SCOPE_STRATEGY_PERSON_FIRST,
    normalize_scope_strategy,
    SCOPE_STRATEGIES,
)


def analyze_scope_configuration(
    *,
    table_name: str,
    strategy: str | None,
    role_columns: Iterable[str] | Mapping[str, str],
    physical_columns: Iterable[str],
    roster_join_col: str | None,
    roster_role_columns: Iterable[str] | Mapping[str, str],
    roster_registered: bool,
) -> list[dict[str, str]]:
    """Return metadata-only scope issues for one registered table."""
    physical = set(physical_columns)
    anchors = role_columns if isinstance(role_columns, Mapping) else {role: role for role in role_columns}
    roles = {role for role, column in anchors.items() if column in physical}
    roster_roles = set(roster_role_columns)
    normalized = normalize_scope_strategy(strategy)
    issues: list[dict[str, str]] = []

    if strategy and strategy.strip() not in SCOPE_STRATEGIES:
        issues.append({"code": "INVALID_SCOPE_STRATEGY", "severity": "error",
                       "message": "范围策略未知，必须先修复配置"})
    if any(column not in physical for column in anchors.values()):
        issues.append({"code": "INVALID_SCOPE_ANCHOR_COLUMN", "severity": "error",
                       "message": "权限锚点不存在于物理表"})
    passthrough_valid = bool(roster_join_col and roster_join_col in physical and roster_registered)

    if roster_join_col:
        if roster_join_col not in physical:
            issues.append({
                "code": "INVALID_ROSTER_JOIN_COLUMN",
                "severity": "error",
                "message": "人员穿透字段不存在于物理表",
            })
        elif not roster_registered:
            issues.append({
                "code": "ROSTER_TABLE_UNAVAILABLE",
                "severity": "error",
                "message": "人员穿透目标表未注册",
            })

    if normalized == SCOPE_STRATEGY_PERSON_FIRST:
        required = PERSON_SCOPE_ROLES
    elif normalized == SCOPE_STRATEGY_CC_FIRST:
        required = {"cc_code"}
    else:
        required = PERSON_SCOPE_ROLES | {"cc_code"}

    direct_resolved = bool(roles & required)
    passthrough_resolved = bool(passthrough_valid and roster_roles & required)

    if not direct_resolved and not passthrough_resolved:
        issues.append({
            "code": "SCOPE_NOT_RESOLVABLE",
            "severity": "error",
            "message": "当前范围策略没有可验证的权限锚点或人员穿透路径",
        })

    if normalized == SCOPE_STRATEGY_CROSS_FILTER:
        person_available = bool(roles & PERSON_SCOPE_ROLES) or bool(
            passthrough_valid and roster_roles & PERSON_SCOPE_ROLES
        )
        cc_available = "cc_code" in roles or bool(
            passthrough_valid and "cc_code" in roster_roles
        )
        if person_available != cc_available:
            issues.append({
                "code": "CROSS_FILTER_PARTIAL_DOMAINS",
                "severity": "warning",
                "message": "cross_filter只配置了部分权限域，不能作为完整多域合同",
            })

    return issues
