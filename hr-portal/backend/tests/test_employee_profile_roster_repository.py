from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Column, MetaData, String, Table, bindparam
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import false, true

from app.ai.employee_profile_repository import (
    EMPLOYEE_PROFILE_FIELD_COLUMNS,
    EMPLOYEE_PROFILE_LOOKUP_LIMIT,
    EmployeeProfileRosterContractError,
    build_employee_profile_lookup_statement,
    employee_profile_projection,
)


def _model(include_hire_date=True):
    columns = [
        Column("id", BigInteger, primary_key=True),
        Column("employee_no", String(64)),
        Column("chinese_name", String(128)),
        Column("english_name", String(128)),
        Column("full_name", String(256)),
        Column("bu", String(128)),
        Column("department", String(128)),
        Column("position", String(128)),
        Column("standard_position", String(128)),
        Column("position_level", String(64)),
        Column("employee_type", String(64)),
        Column("employment_status", String(64)),
        Column("org_node_code", String(64)),
    ]
    if include_hire_date:
        columns.append(Column("hire_date", String(32)))
    return SimpleNamespace(__table__=Table("emp_realtime_roster", MetaData(), *columns))


def test_projection_has_only_fixed_business_aliases():
    projection = employee_profile_projection(_model())
    assert [column.name for column in projection] == list(EMPLOYEE_PROFILE_FIELD_COLUMNS)
    assert [column.element.name for column in projection] == list(EMPLOYEE_PROFILE_FIELD_COLUMNS.values())


def test_lookup_is_parameterized_scoped_and_limited():
    model = _model()
    statement = build_employee_profile_lookup_statement(
        model,
        lookup_type="employee_no",
        scope_filter=model.__table__.c.org_node_code == bindparam("scope_org_code"),
    )
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "employee_lookup_value" in compiled
    assert "scope_org_code" in compiled
    assert "ORDER BY emp_realtime_roster.employee_no ASC" in compiled
    assert "LIMIT %(param_1)s" in compiled
    assert statement._limit_clause.value == EMPLOYEE_PROFILE_LOOKUP_LIMIT


def test_name_lookup_supports_chinese_partial_match_but_keeps_english_identifiers_exact():
    statement = build_employee_profile_lookup_statement(
        _model(), lookup_type="employee_name", scope_filter=true()
    )
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "chinese_name" in compiled
    assert "english_name" in compiled
    assert "full_name" in compiled
    assert "ILIKE" in compiled


def test_missing_required_column_or_lookup_type_fails_closed():
    with pytest.raises(EmployeeProfileRosterContractError, match="hire_date"):
        employee_profile_projection(_model(include_hire_date=False))
    with pytest.raises(EmployeeProfileRosterContractError, match="unsupported"):
        build_employee_profile_lookup_statement(_model(), lookup_type="unknown", scope_filter=false())
