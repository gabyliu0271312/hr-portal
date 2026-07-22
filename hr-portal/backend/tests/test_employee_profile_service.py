from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Column, MetaData, String, Table
from sqlalchemy.sql import true

from app.ai import employee_profile_service as service_module
from app.ai.employee_profile_catalog import EmployeeProfileCatalogItem
from app.ai.employee_profile_schemas import EmployeeProfileQuerySpec


class _Result:
    def __init__(self, rows): self._rows = rows
    def mappings(self): return self
    def all(self): return self._rows


class _Db:
    def __init__(self, rows): self.rows = rows; self.statements = []
    async def execute(self, statement, params): self.statements.append((statement, params)); return _Result(self.rows)


def _model(*, include_employment_status=True):
    columns = [
        Column("id", BigInteger, primary_key=True),
        Column("employee_no", String),
        Column("chinese_name", String),
        Column("english_name", String),
        Column("full_name", String),
        Column("department", String),
        Column("company_name", String),
        Column("org_node_code", String),
    ]
    if include_employment_status:
        columns.append(Column("employment_status", String))
    table = Table("emp_realtime_roster", MetaData(), *columns)
    return SimpleNamespace(__table__=table)


@pytest.fixture(autouse=True)
def catalog_and_permissions(monkeypatch, request):
    catalog = (EmployeeProfileCatalogItem("department", "department", "Department", "string", True, 1, 1), EmployeeProfileCatalogItem("company_name", "company_name", "Company", "string", False, None, 2))
    async def requested(_db, codes): return tuple(item for item in catalog if not codes or item.field_code in codes)
    async def scope(*_args, **_kwargs): return true()
    monkeypatch.setattr(service_module, "_roster_model", _model)
    if request.node.name != "test_requested_catalog_returns_only_explicit_fields_in_session_order":
        monkeypatch.setattr(service_module, "_requested_catalog", requested)
    monkeypatch.setattr(service_module, "build_scope_filter", scope)
    monkeypatch.setattr(service_module, "is_unrestricted", lambda _scope: True)
    return catalog


@pytest.mark.asyncio
async def test_dynamic_catalog_field_is_projected_labeled_and_scoped(monkeypatch):
    seen = {}
    async def access(_user, _table, _db, *, tool_key): seen["tool_key"] = tool_key; return {}
    monkeypatch.setattr(service_module, "resolve_field_access", access)
    result = await service_module.EmployeeProfileQueryService().query(EmployeeProfileQuerySpec(lookup_type="employee_no", lookup_value="E001", requested_field_codes=["company_name"]), user=SimpleNamespace(id=1), db=_Db([{"employee_id": 1, "company_name": "Acme", "full_name": "Alice", "organization_name": "Platform", "employment_status": "Active"}]))
    assert result.match_kind == "unique"
    assert result.rows == ({"employee_id": 1, "company_name": "Acme"},)
    assert result.field_labels == {"company_name": "Company"}
    assert seen["tool_key"] == "employee.profile.query"


@pytest.mark.asyncio
async def test_hidden_dynamic_field_returns_neutral_no_match(monkeypatch):
    async def access(*_args, **_kwargs): return {"company_name": "hide"}
    monkeypatch.setattr(service_module, "resolve_field_access", access)
    result = await service_module.EmployeeProfileQueryService().query(EmployeeProfileQuerySpec(lookup_type="employee_no", lookup_value="E001", requested_field_codes=["company_name"]), user=SimpleNamespace(id=1), db=_Db([{"employee_id": 1, "company_name": "Acme"}]))
    assert result.match_kind == "no_match" and result.rows == ()


@pytest.mark.asyncio
async def test_missing_optional_candidate_column_does_not_block_employee_lookup(monkeypatch):
    async def access(*_args, **_kwargs): return {}

    monkeypatch.setattr(service_module, "_roster_model", lambda: _model(include_employment_status=False))
    monkeypatch.setattr(service_module, "resolve_field_access", access)
    db = _Db([{"employee_id": 1, "company_name": "Acme", "employee_no": "106401", "full_name": "Alice"}])

    result = await service_module.EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(lookup_type="employee_no", lookup_value="106401", requested_field_codes=["company_name"]),
        user=SimpleNamespace(id=1),
        db=db,
    )

    compiled = str(db.statements[0][0])
    assert "employment_status" not in compiled
    assert result.match_kind == "unique"
    assert result.employee_no == "106401"
    assert result.full_name == "Alice"


@pytest.mark.asyncio
async def test_requested_catalog_returns_only_explicit_fields_in_session_order(monkeypatch):
    catalog = (
        EmployeeProfileCatalogItem("department", "department", "Department", "string", True, 1, 1, True),
        EmployeeProfileCatalogItem("hire_date", "hire_date", "Hire date", "date", True, 2, 2, True),
        EmployeeProfileCatalogItem("business_unit", "business_unit", "BU", "string", False, None, 3, True),
        EmployeeProfileCatalogItem("company_name", "company_name", "Company", "string", False, None, 4, True),
    )
    async def load(_db): return catalog
    monkeypatch.setattr(service_module, "load_employee_profile_catalog", load)
    resolved = await service_module._requested_catalog(object(), ["company_name", "business_unit", "company_name"])
    assert [item.field_code for item in resolved] == ["company_name", "business_unit"]
