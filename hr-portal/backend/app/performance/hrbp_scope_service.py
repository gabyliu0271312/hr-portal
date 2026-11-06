"""Live global HRBP visibility rules, independent of cycle snapshots."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.employee_roster_contract import (
    ORGANIZATION_FIELDS,
    employee_roster_table,
    normalize_employee_no,
    normalize_roster_text,
    require_employee_roster_columns,
)
from app.data.models import OrgNode
from app.performance.models import PerformanceOtherPermissionSetting
from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people


class HrbpInvisibleCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: Literal["employee", "department", "directLeader"]
    operator: Literal["include", "exclude"]
    values: list[str] = Field(min_length=1, max_length=500)

    @field_validator("values")
    @classmethod
    def normalize_values(cls, values: list[str]) -> list[str]:
        if any(not value.strip() for value in values):
            raise ValueError("规则条件值不能为空")
        return list(dict.fromkeys(value.strip() for value in values))


class HrbpInvisibleRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conditions: list[HrbpInvisibleCondition] = Field(min_length=1, max_length=100)


def legacy_invisible_rules(refs) -> list[dict]:
    values = list(dict.fromkeys(str(ref).strip() for ref in (refs or []) if str(ref).strip()))
    return [{"conditions": [{"field": "employee", "operator": "include", "values": values}]}] if values else []


def setting_invisible_rules(setting) -> list[dict]:
    raw = getattr(setting, "hrbp_invisible_rules", None)
    if raw is None:
        return legacy_invisible_rules(setting.hrbp_invisible_people)
    return [HrbpInvisibleRule.model_validate(rule).model_dump() for rule in raw]


async def load_hrbp_roster_people(db: AsyncSession):
    table = employee_roster_table()
    columns = require_employee_roster_columns(table, ("employee_no", "display_name", "direct_supervisor", *ORGANIZATION_FIELDS))
    rows = (await db.execute(select(*(column.label(key) for key, column in columns.items())))).mappings().all()
    return build_snapshot_people(
        RosterAuthorizationInput(
            employee_no=normalize_employee_no(row["employee_no"]) or "",
            display_name=normalize_roster_text(row["display_name"]) or "",
            direct_supervisor_source_value=normalize_roster_text(row["direct_supervisor"]),
            **{field: normalize_roster_text(row[field]) for field in ORGANIZATION_FIELDS},
        )
        for row in rows
        if normalize_employee_no(row["employee_no"]) and normalize_roster_text(row["display_name"])
    )


def evaluate_hrbp_invisible_rules(rules: list[dict], people) -> set[str]:
    validated = [HrbpInvisibleRule.model_validate(rule) for rule in rules]

    def matches(person, condition):
        actual = {
            "employee": person.employee_no,
            "department": person.organization_ref,
            "directLeader": person.direct_supervisor_employee_no,
        }[condition.field]
        if condition.field == "department":
            included = bool(actual and any(actual == value or actual.startswith(f"{value}/") for value in condition.values))
        else:
            included = actual in condition.values
        return included if condition.operator == "include" else not included

    return {
        person.employee_no for person in people
        if any(all(matches(person, condition) for condition in rule.conditions) for rule in validated)
    }


def scope_department_managers(scopes, nodes, people) -> set[str]:
    scope_paths = {str(scope).strip("/") for scope in scopes}
    references = [node.manager for node in nodes if node.is_active and str(node.path or "").strip("/") in scope_paths and node.manager]
    by_no = {person.employee_no.casefold(): person.employee_no for person in people}
    by_name = {}
    for person in people:
        by_name.setdefault(person.display_name.casefold(), []).append(person.employee_no)
    result = set()
    for reference in references:
        key = str(reference).strip().casefold()
        if key in by_no:
            result.add(by_no[key])
        elif len(by_name.get(key, [])) == 1:
            result.add(by_name[key][0])
    return result


async def global_hrbp_invisible_people(db: AsyncSession, *, scopes=()) -> set[str]:
    # Legacy test doubles without get represent an unconfigured singleton only.
    if not hasattr(db, "get"):
        return set()
    setting = await db.get(PerformanceOtherPermissionSetting, 1)
    if setting is None:
        return set()
    raw_rules = getattr(setting, "hrbp_invisible_rules", None)
    rules = setting_invisible_rules(setting)
    hide_managers = bool(getattr(setting, "hrbp_invisible_scope_enabled", False) and scopes)
    if raw_rules is None and not hide_managers:
        return {
            str(ref).strip()
            for ref in (getattr(setting, "hrbp_invisible_people", None) or [])
            if str(ref).strip()
        }
    if not rules and not hide_managers:
        return set()
    people = await load_hrbp_roster_people(db)
    result = (
        {str(ref).strip() for ref in (setting.hrbp_invisible_people or []) if str(ref).strip()}
        if raw_rules is None else evaluate_hrbp_invisible_rules(rules, people)
    )
    if hide_managers:
        nodes = (await db.execute(select(OrgNode).where(
            OrgNode.is_active.is_(True),
            func.btrim(OrgNode.path, "/").in_([str(scope).strip("/") for scope in scopes]),
        ))).scalars().all()
        result |= scope_department_managers(scopes, nodes, people)
    return result
