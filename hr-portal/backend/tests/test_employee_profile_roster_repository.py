from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Column, MetaData, String, Table, bindparam
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import false, true

from app.ai.employee_profile_repository import (
    EMPLOYEE_PROFILE_LOOKUP_LIMIT,
    EmployeeProfileRosterContractError,
    build_employee_profile_lookup_statement,
)


def _model(include_full_name=True):
    columns = [
        Column("id", BigInteger, primary_key=True), Column("employee_no", String(64)),
        Column("chinese_name", String(128)), Column("english_name", String(128)),
        Column("department", String(128)), Column("company_name", String(128)),
        Column("employment_status", String(64)), Column("org_node_code", String(64)),
    ]
    if include_full_name:
        columns.append(Column("full_name", String(256)))
    return SimpleNamespace(__table__=Table("emp_realtime_roster", MetaData(), *columns))


def test_projection_uses_only_server_catalog_mapping_without_select_star():
    statement = build_employee_profile_lookup_statement(_model(), lookup_type="employee_no", scope_filter=true(), field_columns={"department": "department", "company_name": "company_name"})
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "SELECT *" not in compiled
    assert "department AS department" in compiled
    assert "company_name AS company_name" in compiled


def test_lookup_is_parameterized_scoped_and_limited():
    model = _model()
    statement = build_employee_profile_lookup_statement(model, lookup_type="employee_no", scope_filter=model.__table__.c.org_node_code == bindparam("scope_org_code"), field_columns={"department": "department"})
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "employee_lookup_value" in compiled and "scope_org_code" in compiled
    assert statement._limit_clause.value == EMPLOYEE_PROFILE_LOOKUP_LIMIT


def test_name_lookup_supports_partial_english_name_matches():
    statement = build_employee_profile_lookup_statement(
        _model(), lookup_type="employee_name", scope_filter=true(), field_columns={"department": "department"}
    )
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "english_name ILIKE" in compiled
    assert "full_name ILIKE" in compiled


def test_unknown_catalog_column_and_missing_identity_column_fail_closed():
    with pytest.raises(EmployeeProfileRosterContractError, match="missing_column"):
        build_employee_profile_lookup_statement(_model(), lookup_type="employee_no", scope_filter=true(), field_columns={"x": "missing_column"})
    with pytest.raises(EmployeeProfileRosterContractError, match="full_name"):
        build_employee_profile_lookup_statement(_model(include_full_name=False), lookup_type="employee_name", scope_filter=false(), field_columns={"department": "department"})
