from __future__ import annotations

DEFAULT_SCOPE_STRATEGY = "cross_filter"
SCOPE_STRATEGY_PERSON_FIRST = "person_first"
SCOPE_STRATEGY_CC_FIRST = "cc_first"
SCOPE_STRATEGY_CROSS_FILTER = DEFAULT_SCOPE_STRATEGY

SCOPE_STRATEGIES = {
    SCOPE_STRATEGY_PERSON_FIRST,
    SCOPE_STRATEGY_CC_FIRST,
    SCOPE_STRATEGY_CROSS_FILTER,
}

PERSON_SCOPE_ROLES = {"org_node_code", "employment_type", "employment_entity", "person"}
CC_SCOPE_ROLES = {"cc_code"}


def normalize_scope_strategy(strategy: str | None) -> str:
    value = (strategy or DEFAULT_SCOPE_STRATEGY).strip()
    return value if value in SCOPE_STRATEGIES else DEFAULT_SCOPE_STRATEGY


def ensure_scope_strategy(strategy: str | None) -> str | None:
    if strategy in (None, ""):
        return None
    value = str(strategy).strip()
    if value not in SCOPE_STRATEGIES:
        raise ValueError(f"invalid scope_strategy: {strategy}")
    return value


def strategy_scope_roles(strategy: str | None) -> set[str]:
    value = normalize_scope_strategy(strategy)
    if value == SCOPE_STRATEGY_PERSON_FIRST:
        return set(PERSON_SCOPE_ROLES)
    if value == SCOPE_STRATEGY_CC_FIRST:
        return set(CC_SCOPE_ROLES)
    return set(PERSON_SCOPE_ROLES) | set(CC_SCOPE_ROLES)
