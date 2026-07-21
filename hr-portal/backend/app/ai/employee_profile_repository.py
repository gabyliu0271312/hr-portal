"""Fixed, scope-first SQL primitives for employee profile lookup."""
from __future__ import annotations

from typing import Literal

from sqlalchemy import bindparam, or_, select
from sqlalchemy.sql.elements import ColumnElement

EMPLOYEE_PROFILE_ROSTER_TABLE = "emp_realtime_roster"
EMPLOYEE_PROFILE_SCOPE_STRATEGY = "person_first"
EMPLOYEE_PROFILE_LOOKUP_LIMIT = 6
EMPLOYEE_PROFILE_STABLE_SORT_COLUMN = "employee_no"
EMPLOYEE_PROFILE_SCOPE_COLUMN = "org_node_code"
EMPLOYEE_PROFILE_INTERNAL_ID_COLUMN = "id"
EMPLOYEE_PROFILE_FIELD_COLUMNS: dict[str, str] = {
    "full_name": "full_name",
    "employee_no": "employee_no",
    "business_unit": "bu",
    "organization_name": "department",
    "position_name": "position",
    "standard_position": "standard_position",
    "position_level": "position_level",
    "employee_type": "employee_type",
    "employment_status": "employment_status",
    "hire_date": "hire_date",
}
EmployeeProfileLookupType = Literal["employee_no", "employee_name"]


class EmployeeProfileRosterContractError(ValueError):
    """Raised when the reflected roster lacks a required fixed column."""


def _columns(model) -> set[str]:
    return set(model.__table__.columns.keys())


def validate_employee_profile_roster_model(model) -> None:
    required = set(EMPLOYEE_PROFILE_FIELD_COLUMNS.values()) | {
        EMPLOYEE_PROFILE_INTERNAL_ID_COLUMN,
        EMPLOYEE_PROFILE_SCOPE_COLUMN,
        EMPLOYEE_PROFILE_STABLE_SORT_COLUMN,
        "chinese_name",
        "english_name",
    }
    missing = sorted(required - _columns(model))
    if missing:
        raise EmployeeProfileRosterContractError(
            "emp_realtime_roster is missing: " + ", ".join(missing)
        )


def employee_profile_projection(model):
    validate_employee_profile_roster_model(model)
    columns = model.__table__.columns
    return [
        columns[physical].label(business)
        for business, physical in EMPLOYEE_PROFILE_FIELD_COLUMNS.items()
    ]


def employee_profile_lookup_projection(model):
    validate_employee_profile_roster_model(model)
    columns = model.__table__.columns
    return [
        columns[EMPLOYEE_PROFILE_INTERNAL_ID_COLUMN].label("employee_id"),
        *employee_profile_projection(model),
    ]


def build_employee_profile_lookup_statement(
    model, *, lookup_type: EmployeeProfileLookupType, scope_filter: ColumnElement[bool]
):
    validate_employee_profile_roster_model(model)
    columns = model.__table__.columns
    if lookup_type == "employee_no":
        lookup_filter = columns["employee_no"] == bindparam("employee_lookup_value")
    elif lookup_type == "employee_name":
        lookup_filter = or_(
            columns["chinese_name"].ilike("%" + bindparam("employee_lookup_value") + "%"),
            columns["english_name"] == bindparam("employee_lookup_value"),
            columns["full_name"] == bindparam("employee_lookup_value"),
        )
    else:
        raise EmployeeProfileRosterContractError(f"unsupported lookup type: {lookup_type}")
    return (
        select(*employee_profile_lookup_projection(model))
        .where(scope_filter, lookup_filter)
        .order_by(columns[EMPLOYEE_PROFILE_STABLE_SORT_COLUMN].asc())
        .limit(EMPLOYEE_PROFILE_LOOKUP_LIMIT)
    )


def build_employee_profile_selected_lookup_statement(
    model, *, scope_filter: ColumnElement[bool]
):
    """Re-check one server-selected employee without accepting a client identifier."""
    validate_employee_profile_roster_model(model)
    columns = model.__table__.columns
    return (
        select(*employee_profile_lookup_projection(model))
        .where(
            scope_filter,
            columns[EMPLOYEE_PROFILE_INTERNAL_ID_COLUMN] == bindparam("employee_profile_employee_id"),
        )
        .order_by(columns[EMPLOYEE_PROFILE_STABLE_SORT_COLUMN].asc())
        .limit(2)
    )
