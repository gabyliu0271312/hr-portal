from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Column, MetaData, String, Table, bindparam, true
from sqlalchemy.dialects import postgresql

import app.ai.employee_profile_service as employee_profile_service
from app.ai.employee_profile_service import (
    EmployeeProfileQueryService,
    EmployeeProfileServiceContractError,
)
from app.ai.employee_profile_schemas import EmployeeProfileQuerySpec
from app.data.models import DATA_TABLES


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class FakeDb:
    def __init__(self, rows):
        self.rows = rows
        self.executed = []

    async def execute(self, statement, params):
        self.executed.append((statement, params))
        return FakeResult(self.rows)


def _model():
    return SimpleNamespace(
        __table__=Table(
            "emp_realtime_roster",
            MetaData(),
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
            Column("hire_date", String(32)),
            Column("org_node_code", String(64)),
        )
    )


def _row(employee_id: int):
    return {
        "employee_id": employee_id,
        "full_name": f"Employee {employee_id}",
        "employee_no": f"E{employee_id:03}",
        "business_unit": "Technology Platform",
        "organization_name": "Platform",
        "position_name": "Engineer",
        "standard_position": "Backend Engineer",
        "position_level": "P6",
        "employee_type": "Regular",
        "employment_status": "Active",
        "hire_date": "2021-01-01",
    }


@pytest.fixture(autouse=True)
def allow_all_profile_fields(monkeypatch):
    async def resolve_visible(*args, **kwargs):
        return {}

    monkeypatch.setattr(employee_profile_service, "resolve_field_access", resolve_visible)


@pytest.fixture
def roster_model():
    table_name = "emp_realtime_roster"
    old_model = DATA_TABLES.get(table_name)
    model = _model()
    DATA_TABLES[table_name] = model
    try:
        yield model
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model


@pytest.mark.asyncio
async def test_service_builds_scope_before_parameterized_limited_query(monkeypatch, roster_model):
    events = []

    async def restricted_scope(user, table, db, *, strategy):
        events.append(("scope", table, strategy))
        return roster_model.__table__.c.org_node_code == bindparam("scope_org")

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", restricted_scope)
    db = FakeDb([_row(1)])

    result = await EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(lookup_type="employee_no", lookup_value="E001"),
        user=SimpleNamespace(id=7),
        db=db,
    )

    statement, params = db.executed[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert events == [("scope", "emp_realtime_roster", "person_first")]
    assert params == {"employee_lookup_value": "E001"}
    assert "employee_lookup_value" in compiled
    assert "scope_org" in compiled
    assert "ORDER BY emp_realtime_roster.employee_no ASC" in compiled
    assert statement._limit_clause.value == 6
    assert result.match_kind == "unique"
    assert result.scope_filter_applied is True
    assert result.scope_filter_restrictive is True
    assert result.permission_filtered is True


@pytest.mark.asyncio
async def test_unrestricted_scope_still_runs_unified_scope_chain(monkeypatch, roster_model):
    calls = []

    async def unrestricted_scope(user, table, db, *, strategy):
        calls.append((table, strategy))
        return true()

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", unrestricted_scope)
    result = await EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(lookup_type="employee_no", lookup_value="E001"),
        user=SimpleNamespace(id=1),
        db=FakeDb([_row(1)]),
    )

    assert calls == [("emp_realtime_roster", "person_first")]
    assert result.scope_filter_applied is True
    assert result.scope_filter_restrictive is False
    assert result.permission_filtered is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("lookup_type", "row_count", "expected"),
    [
        ("employee_no", 0, "no_match"),
        ("employee_no", 1, "unique"),
        ("name", 5, "candidates"),
        ("name", 6, "too_many"),
        ("employee_no", 2, "too_many"),
    ],
)
async def test_service_classifies_matches_without_post_query_scope_filtering(
    monkeypatch, roster_model, lookup_type, row_count, expected
):
    async def scope(user, table, db, *, strategy):
        return roster_model.__table__.c.org_node_code == bindparam("scope_org")

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", scope)
    rows = [_row(index) for index in range(1, row_count + 1)]
    result = await EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(lookup_type=lookup_type, lookup_value="E001"),
        user=SimpleNamespace(id=7),
        db=FakeDb(rows),
    )

    assert result.match_kind == expected
    assert [row["employee_id"] for row in result.rows] == list(range(1, row_count + 1))


@pytest.mark.asyncio
async def test_scope_failure_or_unregistered_roster_never_executes_lookup(monkeypatch, roster_model):
    class NoExecuteDb:
        async def execute(self, statement, params):
            raise AssertionError("lookup SQL must not execute")

    async def scope_failure(user, table, db, *, strategy):
        raise RuntimeError("scope resolution failed")

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", scope_failure)
    with pytest.raises(RuntimeError, match="scope resolution failed"):
        await EmployeeProfileQueryService().query(
            EmployeeProfileQuerySpec(lookup_type="name", lookup_value="Alice"),
            user=SimpleNamespace(id=7),
            db=NoExecuteDb(),
        )

    DATA_TABLES.pop("emp_realtime_roster")
    with pytest.raises(EmployeeProfileServiceContractError, match="not registered"):
        await EmployeeProfileQueryService().query(
            EmployeeProfileQuerySpec(lookup_type="name", lookup_value="Alice"),
            user=SimpleNamespace(id=7),
            db=NoExecuteDb(),
        )


@pytest.mark.asyncio
async def test_candidate_visibility_failure_never_returns_a_partial_candidate_set(monkeypatch, roster_model):
    async def scope(user, table, db, *, strategy):
        return roster_model.__table__.c.org_node_code == bindparam("scope_org")

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", scope)
    result = await EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(lookup_type="name", lookup_value="Alice"),
        user=SimpleNamespace(id=7),
        db=FakeDb([_row(1), _row(2)]),
        candidate_displayable=lambda row: row["employee_id"] == 1,
    )

    assert result.match_kind == "too_many"
    assert result.rows == ()


@pytest.mark.asyncio
async def test_details_use_default_or_explicit_requested_field_intersection(monkeypatch, roster_model):
    async def scope(user, table, db, *, strategy):
        return true()

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", scope)
    service = EmployeeProfileQueryService()

    default_result = await service.query(
        EmployeeProfileQuerySpec(lookup_type="employee_no", lookup_value="E001"),
        user=SimpleNamespace(id=7),
        db=FakeDb([_row(1)]),
    )
    assert set(default_result.rows[0]) == {
        "employee_id",
        "full_name",
        "employee_no",
        "organization_name",
        "hire_date",
        "employee_type",
        "standard_position",
        "position_level",
    }

    explicit_result = await service.query(
        EmployeeProfileQuerySpec(
            lookup_type="employee_no",
            lookup_value="E001",
            requested_field_codes=["employee_no", "hire_date"],
        ),
        user=SimpleNamespace(id=7),
        db=FakeDb([_row(1)]),
    )
    assert set(explicit_result.rows[0]) == {"employee_id", "employee_no", "hire_date"}


@pytest.mark.asyncio
async def test_hidden_detail_fields_are_deleted_and_all_hidden_is_neutral_no_match(monkeypatch, roster_model):
    async def scope(user, table, db, *, strategy):
        return true()

    async def hide_employee_no(*args, **kwargs):
        return {"employee_no": "hide"}

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", scope)
    monkeypatch.setattr(employee_profile_service, "resolve_field_access", hide_employee_no)
    result = await EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(
            lookup_type="employee_no",
            lookup_value="E001",
            requested_field_codes=["full_name", "employee_no"],
        ),
        user=SimpleNamespace(id=7),
        db=FakeDb([_row(1)]),
    )
    assert result.rows == ({"employee_id": 1, "full_name": "Employee 1"},)
    assert result.masking_applied is False

    async def hide_all(*args, **kwargs):
        return {
            "chinese_name": "hide",
            "full_name": "hide",
            "employee_no": "hide",
            "department": "hide",
            "position": "hide",
            "standard_position": "hide",
            "position_level": "hide",
            "employee_type": "hide",
            "employment_status": "hide",
            "hire_date": "hide",
        }

    monkeypatch.setattr(employee_profile_service, "resolve_field_access", hide_all)
    hidden_result = await EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(lookup_type="employee_no", lookup_value="E001"),
        user=SimpleNamespace(id=7),
        db=FakeDb([_row(1)]),
    )
    assert hidden_result.match_kind == "no_match"
    assert hidden_result.rows == ()


@pytest.mark.asyncio
async def test_candidates_use_independent_visible_display_whitelist(monkeypatch, roster_model):
    async def scope(user, table, db, *, strategy):
        return true()

    async def hide_organization(*args, **kwargs):
        return {"department": "hide"}

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", scope)
    monkeypatch.setattr(employee_profile_service, "resolve_field_access", hide_organization)
    result = await EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(
            lookup_type="name",
            lookup_value="Employee",
            requested_field_codes=["hire_date"],
        ),
        user=SimpleNamespace(id=7),
        db=FakeDb([_row(1), _row(2)]),
    )

    assert result.match_kind == "candidates"
    assert result.effective_requested_field_codes[0].value == "hire_date"
    assert all(set(row) == {"employee_id", "full_name", "employment_status"} for row in result.rows)


@pytest.mark.asyncio
async def test_candidate_without_any_visible_nonempty_display_field_degrades_whole_set(monkeypatch, roster_model):
    async def scope(user, table, db, *, strategy):
        return true()

    async def hide_candidate_fields(*args, **kwargs):
        return {
            "chinese_name": "hide",
            "full_name": "hide",
            "department": "hide",
            "employment_status": "hide",
        }

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", scope)
    monkeypatch.setattr(employee_profile_service, "resolve_field_access", hide_candidate_fields)
    result = await EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(lookup_type="name", lookup_value="Employee"),
        user=SimpleNamespace(id=7),
        db=FakeDb([_row(1), _row(2)]),
    )

    assert result.match_kind == "too_many"
    assert result.rows == ()


@pytest.mark.asyncio
async def test_employee_profile_never_uses_legacy_sensitive_mask_fallback(monkeypatch, roster_model):
    import app.permissions.masker as masker

    async def scope(user, table, db, *, strategy):
        return true()

    async def unexpected_sensitive_lookup(*args, **kwargs):
        raise AssertionError("get_sensitive_columns must not be used for employee profiles")

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", scope)
    monkeypatch.setattr(masker, "get_sensitive_columns", unexpected_sensitive_lookup)
    result = await EmployeeProfileQueryService().query(
        EmployeeProfileQuerySpec(lookup_type="employee_no", lookup_value="E001"),
        user=SimpleNamespace(id=7),
        db=FakeDb([_row(1)]),
    )

    assert result.masking_applied is False


@pytest.mark.asyncio
async def test_selected_employee_rechecks_current_scope_and_immutable_field_codes(monkeypatch, roster_model):
    async def restricted_scope(user, table, db, *, strategy):
        return roster_model.__table__.c.org_node_code == bindparam("scope_org")

    monkeypatch.setattr(employee_profile_service, "build_scope_filter", restricted_scope)
    service = EmployeeProfileQueryService()
    result = await service.query_selected_employee(
        employee_id=1,
        effective_requested_field_codes=(
            employee_profile_service.EmployeeProfileFieldCode.ORGANIZATION_NAME,
            employee_profile_service.EmployeeProfileFieldCode.HIRE_DATE,
        ),
        user=SimpleNamespace(id=7),
        db=FakeDb([_row(1)]),
    )

    assert result.match_kind == "unique"
    assert result.rows == ({"employee_id": 1, "organization_name": "Platform", "hire_date": "2021-01-01"},)
    assert result.permission_filtered is True

    no_match = await service.query_selected_employee(
        employee_id=1,
        effective_requested_field_codes=(
            employee_profile_service.EmployeeProfileFieldCode.ORGANIZATION_NAME,
        ),
        user=SimpleNamespace(id=7),
        db=FakeDb([]),
    )
    assert no_match.match_kind == "no_match"
    assert no_match.rows == ()
