from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Column, MetaData, String, Table

import app.ai.employee_profile_catalog as catalog
from app.data.models import DATA_TABLES


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class FakeDb:
    def __init__(self, responses):
        self.responses = list(responses)

    async def execute(self, statement):
        return FakeResult(self.responses.pop(0))


def _model():
    return SimpleNamespace(
        __table__=Table(
            "emp_realtime_roster",
            MetaData(),
            Column("id", BigInteger, primary_key=True),
            Column("employee_no", String(64)),
            Column("department", String(128)),
            Column("bu", String(128)),
            Column("payload", String(128)),
            Column("synced_at", String(64)),
            Column("_internal", String(64)),
        )
    )


@pytest.fixture
def roster_model():
    table_name = "emp_realtime_roster"
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = _model()
    try:
        yield
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model


@pytest.mark.asyncio
async def test_catalog_only_exposes_safe_reflected_fields_and_settings(roster_model):
    metadata = [
        SimpleNamespace(column_code="employee_no", column_label="工号", data_type="string"),
        SimpleNamespace(column_code="department", column_label="部门", data_type="string"),
        SimpleNamespace(column_code="bu", column_label="BU", data_type="string"),
        SimpleNamespace(column_code="payload", column_label="载荷", data_type="json"),
    ]
    settings = [
        SimpleNamespace(
            column_name="department",
            field_code="organization_name",
            display_name="所属组织",
            is_default_card=True,
            default_display_order=1,
                append_display_order=10,
                is_queryable=True,
        )
    ]

    result = await catalog.load_employee_profile_catalog(FakeDb([metadata, settings]))

    assert [(item.field_code, item.column_name) for item in result] == [
        ("organization_name", "department"),
        ("bu", "bu"),
        ("employee_no", "employee_no"),
    ]
    assert result[0].display_name == "所属组织"
    assert all(item.column_name not in {"id", "synced_at", "_internal", "payload"} for item in result)


@pytest.mark.asyncio
async def test_catalog_rejects_unknown_code(roster_model):
    with pytest.raises(catalog.EmployeeProfileCatalogError, match="unknown employee profile field"):
        await catalog.resolve_employee_profile_codes(FakeDb([[], [], []]), ["does_not_exist"])


@pytest.mark.asyncio
async def test_extractor_catalog_keeps_permitted_sensitive_field_metadata(monkeypatch):
    items = (
        catalog.EmployeeProfileCatalogItem(
            "base_salary", "base_salary", "\u57fa\u672c\u5de5\u8d44", "string", False, None, 1, True, "\u56fa\u5b9a\u85aa\u916c"
        ),
        catalog.EmployeeProfileCatalogItem(
            "position_salary", "position_salary", "\u5c97\u4f4d\u5de5\u8d44", "string", False, None, 2, True, "\u5c97\u4f4d\u85aa\u916c"
        ),
    )

    async def load(_db):
        return items

    async def access(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(catalog, "load_employee_profile_catalog", load)
    monkeypatch.setattr("app.permissions.masker.resolve_field_access", access)
    result = await catalog.load_employee_profile_extractor_catalog(
        FakeDb([[SimpleNamespace(column_code="base_salary", is_sensitive=False)]]),
        user=SimpleNamespace(id=1),
    )

    assert [item.field_code for item in result] == ["base_salary", "position_salary"]


@pytest.mark.asyncio
async def test_extractor_catalog_hides_sensitive_field_metadata_without_access(monkeypatch):
    items = (
        catalog.EmployeeProfileCatalogItem(
            "base_salary", "base_salary", "\u57fa\u672c\u5de5\u8d44", "string", False, None, 1, True, "\u56fa\u5b9a\u85aa\u916c"
        ),
        catalog.EmployeeProfileCatalogItem(
            "position_salary", "position_salary", "\u5c97\u4f4d\u5de5\u8d44", "string", False, None, 2, True, "\u5c97\u4f4d\u85aa\u916c"
        ),
    )

    async def load(_db):
        return items

    async def access(*_args, **_kwargs):
        return {"base_salary": "hide"}

    monkeypatch.setattr(catalog, "load_employee_profile_catalog", load)
    monkeypatch.setattr("app.permissions.masker.resolve_field_access", access)
    result = await catalog.load_employee_profile_extractor_catalog(
        FakeDb([[SimpleNamespace(column_code="base_salary", is_sensitive=False)]]),
        user=SimpleNamespace(id=2),
    )

    assert [item.field_code for item in result] == ["position_salary"]
