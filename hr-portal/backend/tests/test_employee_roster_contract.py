from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import Column, Date, MetaData, Numeric, String, Table

from app.data.employee_roster_contract import (
    EmployeeRosterContractError,
    format_job_sequence,
    normalize_employee_no,
    organization_levels,
    organization_leaf,
    organization_path,
    require_employee_roster_columns,
)


def roster_table(*names: str):
    types = {"employee_no": Numeric, "hire_date": Date}
    return Table("roster", MetaData(), *(Column(name, types.get(name, String)) for name in names))


def test_contract_requires_exact_authoritative_columns_without_aliases():
    table = roster_table("employee_no", "full_name", "company_org", "department", "department_2", "department_3", "department_4", "department_5", "direct_supervisor", "hrbp", "employee_type", "employment_status", "job_family", "job_category", "position_level", "hire_date", "expected_departure_date")

    columns = require_employee_roster_columns(table)

    assert columns["direct_supervisor"].name == "direct_supervisor"
    assert columns["employee_type"].name == "employee_type"
    assert columns["job_family"].name == "job_family"


def test_contract_rejects_semantic_fallback_columns():
    table = roster_table("employee_no", "full_name", "company_org", "direct_manager", "hrbp", "employment_status", "job_category", "position_level", "hire_date")

    with pytest.raises(EmployeeRosterContractError) as error:
        require_employee_roster_columns(table)

    assert "direct_supervisor" in str(error.value)
    assert "employee_type" in str(error.value)
    assert "job_family" in str(error.value)


def test_job_sequence_joins_family_and_category_without_empty_segments():
    assert format_job_sequence("技术", "研发") == "技术-研发"
    assert format_job_sequence("技术", None) == "技术"
    assert format_job_sequence("", "研发") == "研发"
    assert format_job_sequence(None, None) is None


def test_numeric_employee_number_normalizes_without_decimal_suffix():
    assert normalize_employee_no(Decimal("1001")) == "1001"


def test_project_runtime_never_reads_live_roster_profile_fields():
    for path in (Path("app/performance/project_service.py"), Path("app/performance/projects_router.py")):
        source = path.read_text(encoding="utf-8")
        assert "emp_realtime_roster" not in source
        assert "DATA_TABLES" not in source
        assert "_roster_member_fields" not in source
        assert "_project_member_roster_fields" not in source


def test_organization_path_and_leaf_keep_levels_distinct():
    row = {"company_org": "集团", "department": "研发", "department_2": "  ", "department_3": "平台", "department_4": None, "department_5": "小组"}
    assert organization_levels(row) == ("集团", "研发", None, "平台", None, "小组")
    assert organization_path(row) == "集团/研发/平台/小组"
    assert organization_leaf(row) == "小组"
    assert organization_leaf({}) is None
