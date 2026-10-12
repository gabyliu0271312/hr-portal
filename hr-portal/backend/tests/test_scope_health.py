from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

from app.core.db import get_session
from app.core.deps import current_user
from app.warehouse import router as warehouse_router

from app.reports.scope_health import analyze_scope_configuration


def test_person_strategy_accepts_direct_org_anchor():
    assert analyze_scope_configuration(
        table_name="salary",
        strategy="person_first",
        role_columns=["org_node_code"],
        physical_columns=["employee_no", "org_node_code"],
        roster_join_col=None,
        roster_role_columns=[],
        roster_registered=True,
    ) == []


def test_cc_strategy_rejects_missing_anchor():
    issues = analyze_scope_configuration(
        table_name="allocation",
        strategy="cc_first",
        role_columns=[],
        physical_columns=["employee_no", "code"],
        roster_join_col="employee_no",
        roster_role_columns=["org_node_code"],
        roster_registered=True,
    )

    assert {issue["code"] for issue in issues} == {"SCOPE_NOT_RESOLVABLE"}


def test_invalid_roster_join_is_reported_without_raw_values():
    issues = analyze_scope_configuration(
        table_name="allocation",
        strategy="person_first",
        role_columns=[],
        physical_columns=["employee_no"],
        roster_join_col="missing_employee_no",
        roster_role_columns=["org_node_code"],
        roster_registered=True,
    )

    assert "INVALID_ROSTER_JOIN_COLUMN" in {issue["code"] for issue in issues}


def test_cross_filter_partial_domains_is_warning():
    issues = analyze_scope_configuration(
        table_name="allocation",
        strategy="cross_filter",
        role_columns=["cc_code"],
        physical_columns=["employee_no", "cc_code"],
        roster_join_col=None,
        roster_role_columns=[],
        roster_registered=True,
    )

    assert {issue["code"] for issue in issues} == {
        "CROSS_FILTER_PARTIAL_DOMAINS"
    }


def test_invalid_passthrough_does_not_count_as_resolved():
    issues = analyze_scope_configuration(
        table_name="allocation", strategy="person_first", role_columns=[],
        physical_columns=["employee_no"], roster_join_col="missing",
        roster_role_columns=["org_node_code"], roster_registered=True,
    )
    assert {issue["code"] for issue in issues} == {
        "INVALID_ROSTER_JOIN_COLUMN", "SCOPE_NOT_RESOLVABLE",
    }


def test_unknown_strategy_is_configuration_error():
    issues = analyze_scope_configuration(
        table_name="allocation", strategy="public_dim", role_columns=["cc_code"],
        physical_columns=["cc_code"], roster_join_col=None,
        roster_role_columns=[], roster_registered=False,
    )
    assert "INVALID_SCOPE_STRATEGY" in {issue["code"] for issue in issues}


def test_missing_physical_anchor_cannot_be_healthy():
    issues = analyze_scope_configuration(
        table_name="salary", strategy="person_first",
        role_columns={"org_node_code": "missing_org"}, physical_columns=["employee_no"],
        roster_join_col=None, roster_role_columns=[], roster_registered=False,
    )
    assert {issue["code"] for issue in issues} == {
        "INVALID_SCOPE_ANCHOR_COLUMN", "SCOPE_NOT_RESOLVABLE",
    }


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def unique(self):
        self.rows = list({id(row): row for row in self.rows}.values())
        return self

    def all(self):
        return self.rows

    def first(self):
        return self.rows[0] if self.rows else None


class _HealthDb:
    def __init__(self, *, allowed=True, exists=True):
        self.allowed = allowed
        self.exists = exists
        self.statements = []
        self.roster = SimpleNamespace(table_name="emp_realtime_roster")
        self.asset = SimpleNamespace(
            table_name="test_allocation", warehouse_layer="DWD", asset_status="published",
            scope_strategy="person_first", roster_join_col="employee_no",
        )

    async def get(self, model, object_id):
        assert model.__name__ == "DataSet"
        return SimpleNamespace(id=object_id, scope_strategy=None) if self.exists else None

    async def execute(self, stmt):
        self.statements.append(stmt)
        entity = stmt.column_descriptions[0]["entity"]
        params = stmt.compile().params
        if entity.__name__ == "RoleMenu":
            return _Result([object()] if self.allowed else [])
        if entity.__name__ == "RegisteredTable":
            if "emp_realtime_roster" in params.values():
                return _Result([self.roster])
            return _Result([self.asset])
        if entity.__name__ == "TableColumn":
            if "emp_realtime_roster" in params.values():
                return _Result([SimpleNamespace(scope_role="org_node_code", column_code="organization_code")])
            return _Result([])
        raise AssertionError(f"Unexpected metadata entity: {entity}")

    async def scalar(self, stmt):
        self.statements.append(stmt)
        return 2 if "reports" not in str(stmt) else 3


@pytest.fixture
def health_api(monkeypatch):
    def physical(*columns):
        return SimpleNamespace(__table__=SimpleNamespace(columns={column: object() for column in columns}))

    monkeypatch.setattr(warehouse_router, "DATA_TABLES", {
        "test_allocation": physical("id", "employee_no"),
        "emp_realtime_roster": physical("id", "employee_no", "organization_code"),
    })
    route = next(route for route in warehouse_router.router.routes if route.path == "/warehouse/scope-health")
    app = FastAPI()
    app.add_api_route(
        "/api/v1/warehouse/scope-health", route.endpoint, methods=["GET"],
        dependencies=route.dependencies, response_model=route.response_model,
    )
    db = _HealthDb()

    async def session():
        yield db

    async def user():
        return SimpleNamespace(id=4)

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[current_user] = user
    return app, db


@pytest.mark.asyncio
async def test_scope_health_filtered_dataset_uses_roster_outside_dataset(health_api):
    app, db = health_api
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-health", params={"dataset_id": 15})
    assert response.status_code == 200
    row = response.json()[0]
    assert row["issues"] == []
    assert row["dataset_count"] == 2 and row["report_count"] == 3
    assert row["roster_join_configured"] is True
    assert set(row) == {
        "table_name", "warehouse_layer", "asset_status", "scope_strategy",
        "roster_join_configured", "role_columns", "dataset_count", "report_count", "issues",
    }
    assert all("SELECT *" not in str(stmt) for stmt in db.statements)


@pytest.mark.asyncio
async def test_scope_health_rejects_missing_governance_permission(health_api):
    app, db = health_api
    db.allowed = False
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-health")
    assert response.status_code == 403
    assert len(db.statements) == 1
    assert "test_allocation" not in response.text


@pytest.mark.asyncio
async def test_scope_health_requires_login(health_api):
    app, db = health_api
    app.dependency_overrides.pop(current_user)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-health")
    assert response.status_code == 401
    assert db.statements == []


@pytest.mark.asyncio
async def test_scope_health_missing_dataset_is_404(health_api):
    app, db = health_api
    db.exists = False
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-health", params={"dataset_id": 999})
    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("dataset_id", ["0", "-1", "invalid"])
async def test_scope_health_invalid_dataset_parameter_is_422(health_api, dataset_id):
    app, _ = health_api
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-health", params={"dataset_id": dataset_id})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_scope_health_does_not_trust_unloaded_physical_roster(health_api, monkeypatch):
    app, _ = health_api
    monkeypatch.delitem(warehouse_router.DATA_TABLES, "emp_realtime_roster")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-health", params={"dataset_id": 15})
    assert response.status_code == 200
    assert {issue["code"] for issue in response.json()[0]["issues"]} == {
        "ROSTER_TABLE_UNAVAILABLE", "SCOPE_NOT_RESOLVABLE",
    }


@pytest.mark.asyncio
async def test_scope_health_unfiltered_metadata_list(health_api):
    app, _ = health_api
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-health")
    assert response.status_code == 200
    assert response.json()[0]["issues"] == []


@pytest.mark.asyncio
async def test_scope_health_uses_effective_dataset_strategy(health_api):
    app, db = health_api
    from unittest.mock import AsyncMock
    db.get = AsyncMock(return_value=SimpleNamespace(id=15, scope_strategy="cc_first"))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/warehouse/scope-health", params={"dataset_id": 15})
    assert response.status_code == 200
    row = response.json()[0]
    assert row["scope_strategy"] == "cc_first"
    assert {issue["code"] for issue in row["issues"]} == {"SCOPE_NOT_RESOLVABLE"}
