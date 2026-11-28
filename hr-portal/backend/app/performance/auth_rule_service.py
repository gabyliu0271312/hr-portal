"""Live subject matching shared by authorization previews and role resolution."""
from datetime import date

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select

from app.data.employee_roster_contract import (
    ORGANIZATION_FIELDS, EmployeeRosterContractError, employee_roster_table,
    normalize_employee_no, normalize_roster_date, normalize_roster_text,
    require_employee_roster_columns,
)
from app.performance.models import PerformanceAuthRule, PerformanceRole
from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people


AUTH_RULE_FIELDS = [
    ("department", "部门", ["include", "exclude"], "organization_tree"),
    ("employee", "员工", ["include", "exclude"], "people"),
    ("superior", "上级", ["include", "exclude"], "people"),
    ("directLeader", "直属上级", ["include", "exclude"], "people"),
    ("job_family", "序列", ["include", "exclude"], "job_families"),
    ("position_level", "职级", ["include", "exclude"], "position_levels"),
    ("hire_date", "入职时间", ["before", "not_before", "after", "not_after"], "hire_date_range"),
    ("employee_type", "人员类型", ["include", "exclude"], "employee_types"),
]


class AuthRuleCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: str = Field(min_length=1, max_length=32)
    operator: str = Field(min_length=1, max_length=16)
    values: list[str] = Field(min_length=1, max_length=500)

    @field_validator("values")
    @classmethod
    def normalize_values(cls, values):
        if any(not value.strip() for value in values):
            raise ValueError("规则条件值不能为空")
        return list(dict.fromkeys(value.strip() for value in values))

    @model_validator(mode="after")
    def validate_condition(self):
        operators = {key: values for key, _, values, _ in AUTH_RULE_FIELDS}
        if self.field not in operators or self.operator not in operators[self.field]:
            raise ValueError("不支持的范围字段或操作符")
        if self.field == "hire_date":
            if len(self.values) != 1 or date.fromisoformat(self.values[0]).isoformat() != self.values[0]:
                raise ValueError("日期条件必须为单个 YYYY-MM-DD 日期")
        return self


class AuthRuleGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conditions: list[AuthRuleCondition] = Field(min_length=1, max_length=100)


async def load_rule_roster_people(db):
    fields = ("employee_no", "display_name", "direct_supervisor", "employee_type", "employment_status", "job_family", "job_category", "position_level", "hire_date", *ORGANIZATION_FIELDS)
    try:
        columns = require_employee_roster_columns(employee_roster_table(), fields)
    except EmployeeRosterContractError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    rows = (await db.execute(select(*(column.label(key) for key, column in columns.items())))).mappings().all()
    return build_snapshot_people(
        RosterAuthorizationInput(
            employee_no=normalize_employee_no(row["employee_no"]) or "",
            display_name=normalize_roster_text(row["display_name"]) or "",
            direct_supervisor_source_value=normalize_roster_text(row["direct_supervisor"]),
            hire_date=normalize_roster_date(row["hire_date"]),
            **{field: normalize_roster_text(row[field]) for field in ("employee_type", "employment_status", "job_family", "job_category", "position_level", *ORGANIZATION_FIELDS)},
        )
        for row in rows if normalize_employee_no(row["employee_no"]) and normalize_roster_text(row["display_name"])
    )


def matches_condition(person, condition, people_by_no):
    field, operator, values = condition.field, condition.operator, condition.values
    if field == "hire_date":
        if person.hire_date is None:
            return False
        target = date.fromisoformat(values[0])
        return {"before": person.hire_date < target, "not_before": person.hire_date >= target,
                "after": person.hire_date > target, "not_after": person.hire_date <= target}[operator]
    if field == "department":
        actual = person.organization_ref
        matched = bool(actual and any(actual == value or actual.startswith(value + "/") for value in values))
    elif field == "superior":
        visited = {person.employee_no}
        supervisor = person.direct_supervisor_employee_no
        ancestors = set()
        while supervisor and supervisor not in visited:
            visited.add(supervisor)
            ancestors.add(supervisor)
            manager = people_by_no.get(supervisor)
            supervisor = manager.direct_supervisor_employee_no if manager else None
        matched = bool(ancestors.intersection(values))
    else:
        attribute = {"employee": "employee_no", "directLeader": "direct_supervisor_employee_no",
                     "job_family": "job_family", "position_level": "position_level", "employee_type": "employee_type"}[field]
        matched = getattr(person, attribute) in values
    return matched if operator == "include" else not matched


def resolve_people(groups, people):
    people_by_no = {person.employee_no: person for person in people}
    return sorted({
        person.employee_no for person in people
        if any(all(matches_condition(person, condition, people_by_no) for condition in group.conditions) for group in groups)
    })


async def matching_roles(db, employee_no, rows=None):
    if rows is None:
        rows = (await db.execute(select(PerformanceAuthRule, PerformanceRole.id, PerformanceRole.code).join(
            PerformanceRole, PerformanceRole.id == PerformanceAuthRule.role_id,
        ).where(PerformanceAuthRule.is_active.is_(True), PerformanceRole.is_active.is_(True),
                PerformanceRole.is_system.is_(False), PerformanceRole.role_type == "MANAGEMENT"))).all()
    if not rows or not employee_no:
        return []
    people = await load_rule_roster_people(db)
    person = next((person for person in people if person.employee_no == employee_no), None)
    if person is None or person.employment_status != "在职":
        return []
    people_by_no = {person.employee_no: person for person in people}
    result = {}
    for rule, role_id, code in rows:
        try:
            groups = [AuthRuleGroup.model_validate(group) for group in rule.or_scope]
        except (ValueError, TypeError):
            continue
        if any(all(matches_condition(person, condition, people_by_no) for condition in group.conditions) for group in groups):
            result[role_id] = code
    return sorted(result.items())
