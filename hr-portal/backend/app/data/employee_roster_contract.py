"""Canonical employee roster field contract shared by all business modules."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Table

from app.data.models import DATA_TABLES

EMPLOYEE_ROSTER_TABLE = "emp_realtime_roster"
ORGANIZATION_FIELDS = ("company_org", "department", "department_2", "department_3", "department_4", "department_5")


@dataclass(frozen=True)
class EmployeeRosterField:
    key: str
    label: str
    source_column: str | None
    snapshot_column: str | None


EMPLOYEE_ROSTER_FIELDS = {
    field.key: field
    for field in (
        EmployeeRosterField("employee_no", "工号", "employee_no", "employee_no"),
        EmployeeRosterField("display_name", "姓名", "full_name", "display_name"),
        EmployeeRosterField("organization_ref", "部门路径（派生）", None, "organization_ref"),
        EmployeeRosterField("company_org", "公司级组织", "company_org", "company_org"),
        EmployeeRosterField("department", "一级部门", "department", "department"),
        EmployeeRosterField("department_2", "二级部门", "department_2", "department_2"),
        EmployeeRosterField("department_3", "三级部门", "department_3", "department_3"),
        EmployeeRosterField("department_4", "四级部门", "department_4", "department_4"),
        EmployeeRosterField("department_5", "五级部门", "department_5", "department_5"),
        EmployeeRosterField("direct_supervisor", "直属上级", "direct_supervisor", "direct_supervisor_source_value"),
        EmployeeRosterField("hrbp", "HRBP", "hrbp", "hrbp_source_value"),
        EmployeeRosterField("employee_type", "人员类型", "employee_type", "employee_type"),
        EmployeeRosterField("employment_status", "在职状态", "employment_status", "employment_status"),
        EmployeeRosterField("job_family", "职位族", "job_family", "job_family"),
        EmployeeRosterField("job_category", "职位类", "job_category", "job_category"),
        EmployeeRosterField("position_level", "职级", "position_level", "position_level"),
        EmployeeRosterField("hire_date", "入职日期", "hire_date", "hire_date"),
        EmployeeRosterField("departure_date", "预计离职日期", "expected_departure_date", "departure_date"),
    )
}
PERFORMANCE_SNAPSHOT_FIELD_KEYS = tuple(EMPLOYEE_ROSTER_FIELDS)


class EmployeeRosterContractError(RuntimeError):
    pass


def employee_roster_table() -> Table:
    model = DATA_TABLES.get(EMPLOYEE_ROSTER_TABLE)
    if model is None:
        raise EmployeeRosterContractError("员工实时花名册未准备好")
    return model.__table__


def require_employee_roster_columns(table: Table, keys: tuple[str, ...] = PERFORMANCE_SNAPSHOT_FIELD_KEYS) -> dict[str, object]:
    missing = [EMPLOYEE_ROSTER_FIELDS[key].source_column for key in keys if EMPLOYEE_ROSTER_FIELDS[key].source_column and EMPLOYEE_ROSTER_FIELDS[key].source_column not in table.c]
    if missing:
        raise EmployeeRosterContractError(f"员工实时花名册缺少权威字段: {', '.join(missing)}")
    return {key: table.c[EMPLOYEE_ROSTER_FIELDS[key].source_column] for key in keys if EMPLOYEE_ROSTER_FIELDS[key].source_column}


def normalize_roster_text(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def normalize_employee_no(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, Decimal) and value == value.to_integral_value():
        return str(value.to_integral_value())
    return normalize_roster_text(value)


def normalize_roster_date(value: object) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def format_job_sequence(job_family: object, job_category: object) -> str | None:
    parts = [part for value in (job_family, job_category) if (part := normalize_roster_text(value))]
    return "-".join(parts) or None


def organization_levels(source: object) -> tuple[str | None, ...]:
    return tuple(normalize_roster_text(source.get(key) if isinstance(source, dict) else getattr(source, key, None)) for key in ORGANIZATION_FIELDS)


def organization_path(source: object) -> str | None:
    return "/".join(part for part in organization_levels(source) if part) or None


def organization_leaf(source: object) -> str | None:
    return next((part for part in reversed(organization_levels(source)) if part), None)
