"""Safe, scope-first SQL primitives for employee profile lookup."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from sqlalchemy import bindparam, or_, select
from sqlalchemy.sql.elements import ColumnElement

EMPLOYEE_PROFILE_ROSTER_TABLE = "emp_realtime_roster"
EMPLOYEE_PROFILE_SCOPE_STRATEGY = "person_first"
EMPLOYEE_PROFILE_LOOKUP_LIMIT = 6
EMPLOYEE_PROFILE_STABLE_SORT_COLUMN = "employee_no"
EMPLOYEE_PROFILE_SCOPE_COLUMN = "org_node_code"
EMPLOYEE_PROFILE_INTERNAL_ID_COLUMN = "id"
EmployeeProfileLookupType = Literal["employee_no", "employee_name"]


class EmployeeProfileRosterContractError(ValueError):
    """Raised when the roster does not expose the fixed lookup identity columns."""


def validate_employee_profile_roster_model(model) -> None:
    required = {"employee_no", "chinese_name", "english_name", "full_name", EMPLOYEE_PROFILE_INTERNAL_ID_COLUMN, EMPLOYEE_PROFILE_SCOPE_COLUMN}
    missing = sorted(required - set(model.__table__.columns.keys()))
    if missing:
        raise EmployeeProfileRosterContractError("emp_realtime_roster is missing: " + ", ".join(missing))


def _projection(model, field_columns: Mapping[str, str], *, include_employee_id: bool):
    validate_employee_profile_roster_model(model)
    columns = model.__table__.columns
    unknown = sorted(set(field_columns.values()) - set(columns.keys()))
    if unknown:
        raise EmployeeProfileRosterContractError("emp_realtime_roster is missing: " + ", ".join(unknown))
    projection = [columns[column_name].label(field_code) for field_code, column_name in field_columns.items()]
    if include_employee_id:
        return [columns[EMPLOYEE_PROFILE_INTERNAL_ID_COLUMN].label("employee_id"), *projection]
    return projection


def build_employee_profile_lookup_statement(model, *, lookup_type: EmployeeProfileLookupType, scope_filter: ColumnElement[bool], field_columns: Mapping[str, str]):
    validate_employee_profile_roster_model(model)
    columns = model.__table__.columns
    if lookup_type == "employee_no":
        lookup_filter = columns["employee_no"] == bindparam("employee_lookup_value")
    elif lookup_type == "employee_name":
        lookup_filter = or_(columns["chinese_name"].ilike("%" + bindparam("employee_lookup_value") + "%"), columns["english_name"] == bindparam("employee_lookup_value"), columns["full_name"] == bindparam("employee_lookup_value"))
    else:
        raise EmployeeProfileRosterContractError(f"unsupported lookup type: {lookup_type}")
    return select(*_projection(model, field_columns, include_employee_id=True)).where(scope_filter, lookup_filter).order_by(columns[EMPLOYEE_PROFILE_STABLE_SORT_COLUMN].asc()).limit(EMPLOYEE_PROFILE_LOOKUP_LIMIT)


def build_employee_profile_selected_lookup_statement(model, *, scope_filter: ColumnElement[bool], field_columns: Mapping[str, str]):
    validate_employee_profile_roster_model(model)
    columns = model.__table__.columns
    return select(*_projection(model, field_columns, include_employee_id=True)).where(scope_filter, columns[EMPLOYEE_PROFILE_INTERNAL_ID_COLUMN] == bindparam("employee_profile_employee_id")).order_by(columns[EMPLOYEE_PROFILE_STABLE_SORT_COLUMN].asc()).limit(2)
