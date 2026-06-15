from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.data import columns_router
from app.data.models import DATA_TABLES, TableColumn


pytestmark = pytest.mark.asyncio


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class FakeResult:
    def __init__(self, value=None, rows=None):
        self.value = value
        self.rows = rows

    def scalar_one_or_none(self):
        return self.value

    def scalar_one(self):
        return self.value

    def scalars(self):
        if self.rows is not None:
            return FakeScalarResult(self.rows)
        return FakeScalarResult([] if self.value is None else [self.value])

    def all(self):
        return list(self.rows or [])


class FakeSession:
    def __init__(self, *, get_obj=None, results=()):
        self.get_obj = get_obj
        self.results = list(results)
        self.executed = []
        self.added = []
        self.deleted = []
        self.flushed = 0
        self.committed = False
        self.refreshed = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        result = self.results.pop(0) if self.results else None
        if isinstance(result, FakeResult):
            return result
        return FakeResult(result)

    async def get(self, model, obj_id):
        return self.get_obj

    def add(self, obj):
        self.added.append(obj)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def flush(self):
        self.flushed += 1
        for idx, obj in enumerate(self.added, start=1):
            if getattr(obj, "id", None) is None:
                obj.id = idx

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        self.refreshed.append(obj)
        if getattr(obj, "id", None) is None:
            obj.id = 1
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)


@pytest.fixture
def registered_table():
    DATA_TABLES["custom_entity"] = object()
    try:
        yield "custom_entity"
    finally:
        DATA_TABLES.pop("custom_entity", None)


def make_column(**overrides):
    data = {
        "id": 7,
        "table_name": "custom_entity",
        "column_code": "base_salary",
        "column_label": "基本工资",
        "data_type": "string",
        "is_pk_part": False,
        "is_sensitive": False,
        "is_visible": True,
        "display_order": 10,
        "auto_discovered": False,
        "copy_from_last_month": False,
        "enum_options": None,
        "agg_role": "dimension",
        "is_computed": False,
        "formula_expr": None,
        "global_field_id": None,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    data.update(overrides)
    return TableColumn(**data)


async def test_create_column_adds_physical_column_before_metadata(monkeypatch, registered_table):
    add_calls = []
    register_calls = []

    async def fake_add_source_column(db, table_name, column_code, data_type):
        add_calls.append((db, table_name, column_code, data_type))

    async def fake_register_source_table_model(db, table_name, *, force=False):
        register_calls.append((db, table_name, force))

    monkeypatch.setattr(columns_router, "add_source_column", fake_add_source_column)
    monkeypatch.setattr(
        columns_router,
        "register_source_table_model",
        fake_register_source_table_model,
    )
    db = FakeSession(results=[None])
    payload = columns_router.ColumnIn(
        column_code="base_salary",
        column_label="基本工资",
        data_type="number",
    )

    result = await columns_router.create_column(registered_table, payload, db=db)

    assert result.column_code == "base_salary"
    assert result.data_type == "number"
    assert add_calls == [(db, "custom_entity", "base_salary", "number")]
    assert register_calls == [(db, "custom_entity", True)]
    assert db.added[0].auto_discovered is False
    assert db.committed is True


async def test_create_column_rejects_invalid_column_name_before_db_work(registered_table):
    db = FakeSession()
    payload = columns_router.ColumnIn(
        column_code="bad-name",
        column_label="非法字段",
        data_type="string",
    )

    with pytest.raises(HTTPException) as exc_info:
        await columns_router.create_column(registered_table, payload, db=db)

    assert exc_info.value.status_code == 400
    assert db.executed == []
    assert db.added == []


async def test_update_column_requires_confirmation_when_existing_values(monkeypatch, registered_table):
    col = make_column(data_type="string")
    db = FakeSession(get_obj=col)
    alter_calls = []

    async def fake_column_exists(db_arg, table_name, column_code):
        return True

    async def fake_source_column_has_values(db_arg, table_name, column_code):
        return True

    async def fake_alter_source_column_type(*args, **kwargs):
        alter_calls.append((args, kwargs))

    monkeypatch.setattr(columns_router, "column_exists", fake_column_exists)
    monkeypatch.setattr(columns_router, "_source_column_has_values", fake_source_column_has_values)
    monkeypatch.setattr(columns_router, "alter_source_column_type", fake_alter_source_column_type)
    payload = columns_router.ColumnIn(
        column_code="base_salary",
        column_label="基本工资",
        data_type="number",
    )

    with pytest.raises(HTTPException) as exc_info:
        await columns_router.update_column(registered_table, col.id, payload, db=db)

    assert exc_info.value.status_code == 409
    assert alter_calls == []
    assert col.data_type == "string"


async def test_update_column_confirmed_type_change_alters_physical_column(
    monkeypatch,
    registered_table,
):
    col = make_column(data_type="string")
    db = FakeSession(get_obj=col)
    alter_calls = []
    register_calls = []

    async def fake_column_exists(db_arg, table_name, column_code):
        return True

    async def fake_source_column_has_values(db_arg, table_name, column_code):
        return True

    async def fake_alter_source_column_type(db_arg, table_name, column_code, data_type, *, using_expr=None):
        alter_calls.append((db_arg, table_name, column_code, data_type, using_expr))

    async def fake_register_source_table_model(db_arg, table_name, *, force=False):
        register_calls.append((db_arg, table_name, force))

    monkeypatch.setattr(columns_router, "column_exists", fake_column_exists)
    monkeypatch.setattr(columns_router, "_source_column_has_values", fake_source_column_has_values)
    monkeypatch.setattr(columns_router, "alter_source_column_type", fake_alter_source_column_type)
    monkeypatch.setattr(
        columns_router,
        "register_source_table_model",
        fake_register_source_table_model,
    )
    payload = columns_router.ColumnIn(
        column_code="base_salary",
        column_label="基本工资",
        data_type="number",
        confirm_type_change=True,
    )

    result = await columns_router.update_column(registered_table, col.id, payload, db=db)

    assert result.data_type == "number"
    assert alter_calls == [
        (db, "custom_entity", "base_salary", "number", 'NULLIF("base_salary"::text, \'\')::numeric')
    ]
    assert register_calls == [(db, "custom_entity", True)]
    assert db.committed is True


async def test_delete_column_checks_dependencies_before_drop(monkeypatch, registered_table):
    col = make_column()
    db = FakeSession(get_obj=col)
    drop_calls = []

    async def fake_dependency_reasons(db_arg, table_name, col_arg):
        return ["被报表引用"]

    async def fake_drop_source_column(db_arg, table_name, column_code):
        drop_calls.append((db_arg, table_name, column_code))

    monkeypatch.setattr(columns_router, "_column_dependency_reasons", fake_dependency_reasons)
    monkeypatch.setattr(columns_router, "drop_source_column", fake_drop_source_column)

    with pytest.raises(HTTPException) as exc_info:
        await columns_router.delete_column(registered_table, col.id, db=db)

    assert exc_info.value.status_code == 409
    assert drop_calls == []
    assert db.deleted == []


async def test_delete_column_drops_physical_column_and_metadata(monkeypatch, registered_table):
    col = make_column()
    db = FakeSession(get_obj=col)
    drop_calls = []
    register_calls = []

    async def fake_dependency_reasons(db_arg, table_name, col_arg):
        return []

    async def fake_drop_source_column(db_arg, table_name, column_code):
        drop_calls.append((db_arg, table_name, column_code))

    async def fake_register_source_table_model(db_arg, table_name, *, force=False):
        register_calls.append((db_arg, table_name, force))

    monkeypatch.setattr(columns_router, "_column_dependency_reasons", fake_dependency_reasons)
    monkeypatch.setattr(columns_router, "drop_source_column", fake_drop_source_column)
    monkeypatch.setattr(
        columns_router,
        "register_source_table_model",
        fake_register_source_table_model,
    )

    result = await columns_router.delete_column(registered_table, col.id, db=db)

    assert result == {"ok": True}
    assert drop_calls == [(db, "custom_entity", "base_salary")]
    assert db.deleted == [col]
    assert register_calls == [(db, "custom_entity", True)]
    assert db.committed is True
