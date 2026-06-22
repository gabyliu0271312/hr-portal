from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import BigInteger, Column, DateTime, MetaData, Numeric, String, Table

from app.data import router as data_router
from app.data.dynamic_loader import _make_model_from_table
from app.data.models import DATA_TABLES, TableColumn
from tests.entity_helpers import make_legacy_raw_model


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

    def scalar_one(self):
        return self.value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        if self.rows is not None:
            return FakeScalarResult(self.rows)
        return FakeScalarResult([] if self.value is None else [self.value])

    def all(self):
        return list(self.rows or [])


class FakeSession:
    def __init__(self, *, results=(), get_obj=None):
        self.results = list(results)
        self.get_obj = get_obj
        self.executed = []
        self.added = []
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

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        self.refreshed.append(obj)
        if getattr(obj, "id", None) is None:
            obj.id = 1


class FakeRow:
    def __init__(self, **mapping):
        self._mapping = mapping


def make_column(**overrides):
    data = {
        "table_name": "data_entity_table",
        "column_code": "employee_no",
        "column_label": "工号",
        "data_type": "string",
        "is_pk_part": False,
        "is_sensitive": False,
        "is_visible": True,
        "display_order": 10,
        "auto_discovered": True,
        "copy_from_last_month": False,
        "enum_options": None,
        "agg_role": "dimension",
        "is_computed": False,
        "formula_expr": None,
        "description": None,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    data.update(overrides)
    return TableColumn(**data)


def make_entity_model(table_name: str, extra_columns: list[Column]):
    table = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("synced_at", DateTime(timezone=True)),
        *extra_columns,
    )
    return _make_model_from_table(table_name, table)


@pytest.fixture
def patch_access(monkeypatch):
    import app.permissions.masker as masker
    import app.permissions.scope_filter as scope_filter

    async def allow_scope(user, table, db):
        return None

    async def no_hidden(user, table, db, tool_key=None):
        return set()

    async def no_sensitive(user, table, db):
        return set()

    async def empty_sensitive_categories(table, db):
        return set()

    async def labels(cols, db):
        return {c.column_code: c.column_label for c in cols}

    async def allow_op(*, user, db):
        return user

    monkeypatch.setattr(scope_filter, "build_scope_filter", allow_scope)
    monkeypatch.setattr(scope_filter, "is_unrestricted", lambda clause: True)
    monkeypatch.setattr(masker, "get_hidden_columns", no_hidden)
    monkeypatch.setattr(masker, "get_sensitive_columns", no_sensitive)
    monkeypatch.setattr(masker, "apply_mask", lambda item, sensitive_cols: item)
    monkeypatch.setattr(data_router, "_check_field_categories_sensitive", empty_sensitive_categories)
    monkeypatch.setattr(data_router, "effective_column_label_map", labels)
    monkeypatch.setattr(data_router, "require_op", lambda menu, op: allow_op)


def assert_no_raw_sql(db: FakeSession):
    sql = "\n".join(str(statement) for statement, _ in db.executed)
    assert "raw" not in sql.lower()
    assert "jsonb" not in sql.lower()


async def test_query_table_reads_entity_columns_and_filters(monkeypatch, patch_access):
    table_name = "data_entity_query"
    model = make_entity_model(
        table_name,
        [
            Column("employee_no", String),
            Column("amount", Numeric),
        ],
    )
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    row = model(
        id=1,
        pk_hash="pk1",
        synced_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
        employee_no="E001",
        amount=Decimal("123.45"),
    )
    columns = [
        make_column(table_name=table_name, column_code="employee_no", column_label="工号"),
        make_column(
            table_name=table_name,
            column_code="amount",
            column_label="金额",
            data_type="number",
            display_order=20,
        ),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=columns),
            FakeResult(value=1),
            FakeResult(rows=[row]),
        ]
    )

    try:
        page = await data_router.query_table(
            table_name,
            page=1,
            page_size=20,
            keyword="E00",
            filters='{"employee_no":"E001"}',
            user=SimpleNamespace(id=1),
            db=db,
        )
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model

    assert page.total == 1
    assert page.items == [
        {
            "_id": 1,
            "_synced_at": "2026-06-01T00:00:00+00:00",
            "employee_no": "E001",
            "amount": "123.45",
        }
    ]
    assert_no_raw_sql(db)


async def test_distinct_values_selects_entity_column(monkeypatch, patch_access):
    table_name = "data_entity_distinct"
    model = make_entity_model(
        table_name,
        [
            Column("department", String),
            Column("department_code", String),
        ],
    )
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    columns = [
        make_column(table_name=table_name, column_code="department", column_label="部门"),
        make_column(table_name=table_name, column_code="department_code", column_label="部门编码"),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=columns),
            FakeResult(rows=[FakeRow(value="研发部", extra="RD")]),
        ]
    )

    try:
        values = await data_router.distinct_values(
            table_name,
            column="department",
            label_extra="department_code",
            limit=500,
            user=SimpleNamespace(id=1),
            db=db,
        )
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model

    assert values == [data_router.DistinctOption(value="研发部", extra="RD")]
    assert_no_raw_sql(db)


async def test_export_csv_reads_entity_columns(monkeypatch, patch_access):
    table_name = "data_entity_export"
    model = make_entity_model(
        table_name,
        [
            Column("employee_no", String),
            Column("amount", Numeric),
        ],
    )
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    row = model(
        id=1,
        pk_hash="pk1",
        synced_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
        employee_no="E001",
        amount=Decimal("88.50"),
    )
    columns = [
        make_column(table_name=table_name, column_code="employee_no", column_label="工号"),
        make_column(
            table_name=table_name,
            column_code="amount",
            column_label="金额",
            data_type="number",
            display_order=20,
        ),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=columns),
            FakeResult(rows=[row]),
        ]
    )

    try:
        response = await data_router.export_csv(
            table_name,
            keyword="E00",
            filters='{"employee_no":"E001"}',
            user=SimpleNamespace(id=1),
            db=db,
        )
        chunks = []
        async for chunk in response.body_iterator:
            chunks.append(chunk)
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model

    text = b"".join(chunks).decode("utf-8-sig")
    assert "工号,金额" in text
    assert "E001,88.50" in text
    assert_no_raw_sql(db)


async def test_create_row_inserts_entity_columns(monkeypatch, patch_access):
    table_name = "data_entity_create"
    model = make_entity_model(
        table_name,
        [
            Column("employee_no", String),
            Column("amount", Numeric),
        ],
    )
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    columns = [
        make_column(
            table_name=table_name,
            column_code="employee_no",
            column_label="工号",
            auto_discovered=False,
            is_pk_part=True,
        ),
        make_column(
            table_name=table_name,
            column_code="amount",
            column_label="金额",
            data_type="number",
            auto_discovered=False,
        ),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=[("employee_no",), ("amount",)]),
            FakeResult(rows=[]),
            FakeResult(rows=[("employee_no",)]),
            FakeResult(rows=columns),
            FakeResult(value=None),
        ]
    )

    try:
        result = await data_router.create_row(
            table_name,
            data_router.RowCreateIn(values={"employee_no": "E001", "amount": "1,234.50"}),
            user=SimpleNamespace(id=1),
            db=db,
        )
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model

    assert result == {"ok": True, "id": 1}
    assert db.committed is True
    assert len(db.added) == 1
    assert not hasattr(db.added[0], "raw")
    assert db.added[0].employee_no == "E001"
    assert db.added[0].amount == Decimal("1234.50")


async def test_update_row_updates_entity_columns_and_computed(monkeypatch, patch_access):
    table_name = "data_entity_update"
    model = make_entity_model(
        table_name,
        [
            Column("base_bonus", Numeric),
            Column("allowance", Numeric),
            Column("total", Numeric),
        ],
    )
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    row = model(
        id=7,
        pk_hash="pk7",
        synced_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
        base_bonus=Decimal("10"),
        allowance=Decimal("2"),
        total=None,
    )
    columns = [
        make_column(
            table_name=table_name,
            column_code="base_bonus",
            column_label="基础奖金",
            data_type="number",
            auto_discovered=False,
        ),
        make_column(
            table_name=table_name,
            column_code="allowance",
            column_label="补贴",
            data_type="number",
            auto_discovered=False,
            display_order=20,
        ),
        make_column(
            table_name=table_name,
            column_code="total",
            column_label="合计",
            data_type="number",
            auto_discovered=False,
            is_computed=True,
            formula_expr="[base_bonus] + [allowance]",
            display_order=30,
        ),
    ]
    db = FakeSession(
        get_obj=row,
        results=[
            FakeResult(rows=[("base_bonus",), ("allowance",)]),
            FakeResult(rows=columns),
            FakeResult(rows=[("total", "[base_bonus] + [allowance]")]),
        ],
    )

    try:
        result = await data_router.update_row(
            table_name,
            7,
            data_router.RowUpdateIn(values={"allowance": "5"}),
            user=SimpleNamespace(id=1),
            db=db,
        )
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model

    assert result == {"ok": True}
    assert row.allowance == Decimal("5")
    assert row.total == Decimal("15.0")
    assert not hasattr(row, "raw")
    assert db.committed is True


async def test_bulk_update_rows_updates_entity_columns(monkeypatch, patch_access):
    table_name = "data_entity_bulk"
    model = make_entity_model(table_name, [Column("status", String)])
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    rows = [
        model(id=1, pk_hash="pk1", synced_at=datetime(2026, 6, 1, tzinfo=timezone.utc), status="停用"),
        model(id=2, pk_hash="pk2", synced_at=datetime(2026, 6, 1, tzinfo=timezone.utc), status="停用"),
    ]
    columns = [
        make_column(
            table_name=table_name,
            column_code="status",
            column_label="启用状态",
            auto_discovered=False,
        )
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=[("status",)]),
            FakeResult(rows=columns),
            FakeResult(rows=[]),
            FakeResult(rows=rows),
        ]
    )

    try:
        result = await data_router.bulk_update_rows(
            table_name,
            data_router.BulkRowUpdateIn(row_ids=[1, 2], values={"status": "启用"}),
            user=SimpleNamespace(id=1),
            db=db,
        )
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model

    assert result == {"ok": True, "updated": 2}
    assert [row.status for row in rows] == ["启用", "启用"]
    assert db.committed is True


async def test_data_view_rejects_legacy_raw_model(patch_access):
    table_name = "data_legacy_raw"
    model = make_legacy_raw_model(table_name)
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    db = FakeSession()

    try:
        with pytest.raises(HTTPException) as exc_info:
            await data_router.query_table(
                table_name,
                user=SimpleNamespace(id=1),
                db=db,
            )
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model

    assert exc_info.value.status_code == 409
    assert db.executed == []


async def test_query_table_masked_column_not_in_clear_select(monkeypatch, patch_access):
    """脱敏列：SQL 投影用 CASE 占位 ******，真值不进 SELECT（不出库）。"""
    import app.permissions.masker as masker

    async def sensitive_amount(user, table, db):
        return {"amount"}

    monkeypatch.setattr(masker, "get_sensitive_columns", sensitive_amount)

    table_name = "data_entity_mask"
    model = make_entity_model(
        table_name,
        [Column("employee_no", String), Column("amount", Numeric)],
    )
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    row = model(id=1, pk_hash="pk1", synced_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
                employee_no="E001", amount=Decimal("123.45"))
    columns = [
        make_column(table_name=table_name, column_code="employee_no"),
        make_column(table_name=table_name, column_code="amount", data_type="number", display_order=20),
    ]
    db = FakeSession(results=[FakeResult(rows=columns), FakeResult(value=1), FakeResult(rows=[row])])

    try:
        await data_router.query_table(table_name, page=1, page_size=20, user=SimpleNamespace(id=1), db=db)
    finally:
        DATA_TABLES.pop(table_name, None) if old_model is None else DATA_TABLES.__setitem__(table_name, old_model)

    main_sql = str(db.executed[-1][0].compile(compile_kwargs={"literal_binds": True}))
    assert "******" in main_sql           # 脱敏列以常量占位
    assert "CASE" in main_sql.upper()      # 通过 CASE 表达式占位，未直接取真值列
    assert "employee_no" in main_sql       # 非脱敏列正常投影


async def test_query_table_hidden_column_absent_from_select_and_output(monkeypatch, patch_access):
    """隐藏列：不进 SELECT，不出现在结果。"""
    import app.permissions.masker as masker

    async def hidden_amount(user, table, db, tool_key=None):
        return {"amount"}

    monkeypatch.setattr(masker, "get_hidden_columns", hidden_amount)

    table_name = "data_entity_hidden"
    model = make_entity_model(
        table_name,
        [Column("employee_no", String), Column("amount", Numeric)],
    )
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    row = model(id=1, pk_hash="pk1", synced_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
                employee_no="E001", amount=Decimal("123.45"))
    columns = [
        make_column(table_name=table_name, column_code="employee_no"),
        make_column(table_name=table_name, column_code="amount", data_type="number", display_order=20),
    ]
    db = FakeSession(results=[FakeResult(rows=columns), FakeResult(value=1), FakeResult(rows=[row])])

    try:
        page = await data_router.query_table(
            table_name, page=1, page_size=20, keyword="x", user=SimpleNamespace(id=1), db=db
        )
    finally:
        DATA_TABLES.pop(table_name, None) if old_model is None else DATA_TABLES.__setitem__(table_name, old_model)

    assert page.hidden_columns == ["amount"]
    assert all("amount" not in item for item in page.items)
    main_sql = str(db.executed[-1][0])
    assert "amount" not in main_sql        # 隐藏列既不投影、也不参与关键字搜索


async def test_distinct_values_blocks_sensitive_column(monkeypatch, patch_access):
    """distinct：脱敏/隐藏列直接拒绝，避免取值反推。"""
    import app.permissions.masker as masker

    async def sensitive_dept(user, table, db):
        return {"department"}

    monkeypatch.setattr(masker, "get_sensitive_columns", sensitive_dept)

    table_name = "data_entity_distinct_block"
    model = make_entity_model(table_name, [Column("department", String)])
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    columns = [make_column(table_name=table_name, column_code="department")]
    db = FakeSession(results=[FakeResult(rows=columns)])

    try:
        with pytest.raises(HTTPException) as exc:
            await data_router.distinct_values(
                table_name, column="department", limit=500, user=SimpleNamespace(id=1), db=db
            )
    finally:
        DATA_TABLES.pop(table_name, None) if old_model is None else DATA_TABLES.__setitem__(table_name, old_model)

    assert exc.value.status_code == 403
