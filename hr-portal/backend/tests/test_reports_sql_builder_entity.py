from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Column, Date, MetaData, Numeric, String, Table, select
from sqlalchemy.orm import aliased

from app.data.dynamic_loader import _make_model_from_table
from app.data.models import DATA_TABLES, TableColumn
from app.datasets.models import DataSet, DataSetRelation, DataSetTable, DatasetCalculatedField
from app.reports import sql_builder
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

    def scalars(self):
        if self.rows is not None:
            return FakeScalarResult(self.rows)
        return FakeScalarResult([] if self.value is None else [self.value])

    def all(self):
        return list(self.rows or [])


class FakeRow:
    def __init__(self, **mapping):
        self._mapping = mapping


class FakeSession:
    def __init__(self, *, results=(), get_map=None):
        self.results = list(results)
        self.get_map = get_map or {}
        self.executed = []

    async def get(self, model, obj_id):
        return self.get_map.get((model, obj_id))

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        result = self.results.pop(0) if self.results else FakeResult(rows=[])
        return result if isinstance(result, FakeResult) else FakeResult(result)


def make_entity_model(table_name: str, extra_columns: list[Column]):
    table = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        *extra_columns,
    )
    return _make_model_from_table(table_name, table)


def register_table(table_name: str, model):
    old = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    return old


def restore_table(table_name: str, old):
    if old is None:
        DATA_TABLES.pop(table_name, None)
    else:
        DATA_TABLES[table_name] = old


def make_column(table_name: str, column_code: str, **overrides):
    data = {
        "table_name": table_name,
        "column_code": column_code,
        "column_label": column_code,
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
        "global_field_id": None,
        "description": None,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    data.update(overrides)
    return TableColumn(**data)


def dataset_rows(dataset_id: int, tables: list[DataSetTable], rels=None):
    return [
        FakeResult(rows=tables),
        FakeResult(rows=rels or []),
    ]


def assert_no_raw_sql(db: FakeSession):
    sql = "\n".join(str(statement) for statement, _ in db.executed).lower()
    assert "raw" not in sql
    assert "jsonb" not in sql


@pytest.fixture(autouse=True)
def no_custom_functions(monkeypatch):
    async def empty_functions(db):
        return {}

    monkeypatch.setattr(sql_builder, "executable_functions", empty_functions)


async def test_report_detail_query_uses_entity_columns_for_select_filter_and_sort():
    table_name = "report_entity_detail"
    model = make_entity_model(
        table_name,
        [
            Column("employee_no", String),
            Column("amount", Numeric),
            Column("hire_date", Date),
        ],
    )
    old = register_table(table_name, model)
    ds = DataSet(id=1, name="detail")
    table = DataSetTable(dataset_id=1, table_name=table_name, alias="r")
    columns = [
        make_column(table_name, "employee_no", column_label="工号"),
        make_column(table_name, "amount", column_label="金额", data_type="number", display_order=20),
        make_column(table_name, "hire_date", column_label="入职日期", data_type="date", display_order=30),
    ]
    db = FakeSession(
        get_map={(DataSet, 1): ds},
        results=[
            *dataset_rows(1, [table]),
            FakeResult(rows=columns),
            FakeResult(rows=[]),
            FakeResult(value=1),
            FakeResult(rows=[
                FakeRow(
                    __r__id=1,
                    __r__employee_no="E001",
                    __r__amount=Decimal("123.45"),
                    __r__hire_date=date(2026, 6, 1),
                )
            ]),
        ],
    )

    try:
        cols, items, total = await sql_builder.run_dataset_query(
            dataset_id=1,
            columns=["r.employee_no", "r.amount", "r.hire_date"],
            filters=[{"column": "r.amount", "op": "gte", "value": "100"}],
            filter_logic=None,
            sorts=[{"column": "r.hire_date", "order": "desc"}],
            value_rules=[],
            aggregate=False,
            aggregations={},
            transpose={},
            rounding_corrections=[],
            page=1,
            page_size=20,
            user=None,
            db=db,
        )
    finally:
        restore_table(table_name, old)

    assert total == 1
    assert [c["code"] for c in cols] == ["r.employee_no", "r.amount", "r.hire_date"]
    assert items == [
        {
            "r.employee_no": "E001",
            "r.amount": "123.45",
            "r.hire_date": "2026-06-01",
        }
    ]
    assert_no_raw_sql(db)


async def test_report_join_query_uses_entity_columns_in_join_condition():
    roster_table = "report_entity_roster"
    salary_table = "report_entity_salary"
    roster_model = make_entity_model(roster_table, [Column("employee_no", String)])
    salary_model = make_entity_model(
        salary_table,
        [Column("employee_no", String), Column("amount", Numeric)],
    )
    old_roster = register_table(roster_table, roster_model)
    old_salary = register_table(salary_table, salary_model)
    ds = DataSet(id=2, name="join")
    tables = [
        DataSetTable(dataset_id=2, table_name=roster_table, alias="r"),
        DataSetTable(dataset_id=2, table_name=salary_table, alias="s"),
    ]
    rel = DataSetRelation(
        dataset_id=2,
        left_alias="r",
        right_alias="s",
        join_type="left",
        keys=[{"left": "employee_no", "right": "employee_no"}],
    )
    db = FakeSession(
        get_map={(DataSet, 2): ds},
        results=[
            *dataset_rows(2, tables, [rel]),
            FakeResult(rows=[make_column(roster_table, "employee_no", column_label="工号")]),
            FakeResult(rows=[
                make_column(salary_table, "employee_no", column_label="工号"),
                make_column(salary_table, "amount", column_label="金额", data_type="number"),
            ]),
            FakeResult(rows=[]),
            FakeResult(value=1),
            FakeResult(rows=[FakeRow(__r__id=1, __s__id=2, __r__employee_no="E001", __s__amount=Decimal("88.50"))]),
        ],
    )

    try:
        _cols, items, total = await sql_builder.run_dataset_query(
            dataset_id=2,
            columns=["r.employee_no", "s.amount"],
            filters=[],
            filter_logic=None,
            sorts=[],
            value_rules=[],
            aggregate=False,
            aggregations={},
            transpose={},
            rounding_corrections=[],
            page=1,
            page_size=50,
            user=None,
            db=db,
        )
    finally:
        restore_table(roster_table, old_roster)
        restore_table(salary_table, old_salary)

    assert total == 1
    assert items[0]["r.employee_no"] == "E001"
    assert items[0]["s.amount"] == "88.50"
    sql = "\n".join(str(statement) for statement, _ in db.executed).lower()
    assert "join" in sql
    assert "employee_no" in sql
    assert "raw" not in sql
    assert "jsonb" not in sql


async def test_report_aggregate_keeps_database_numeric_values():
    table_name = "report_entity_aggregate"
    model = make_entity_model(
        table_name,
        [Column("department", String), Column("amount", Numeric)],
    )
    old = register_table(table_name, model)
    ds = DataSet(id=3, name="aggregate")
    table = DataSetTable(dataset_id=3, table_name=table_name, alias="r")
    columns = [
        make_column(table_name, "department", column_label="部门", agg_role="dimension"),
        make_column(table_name, "amount", column_label="金额", data_type="number", agg_role="measure"),
    ]
    db = FakeSession(
        get_map={(DataSet, 3): ds},
        results=[
            *dataset_rows(3, [table]),
            FakeResult(rows=columns),
            FakeResult(rows=[]),
            FakeResult(rows=[
                FakeRow(__r__id=1, __r__department="研发", __r__amount=Decimal("10.10")),
                FakeRow(__r__id=2, __r__department="研发", __r__amount=Decimal("20.20")),
            ]),
        ],
    )

    try:
        _cols, items, total = await sql_builder.run_dataset_query(
            dataset_id=3,
            columns=["r.department", "r.amount"],
            filters=[],
            filter_logic=None,
            sorts=[],
            value_rules=[],
            aggregate=True,
            aggregations={"r.amount": "sum"},
            transpose={},
            rounding_corrections=[],
            page=1,
            page_size=50,
            user=None,
            db=db,
        )
    finally:
        restore_table(table_name, old)

    assert total == 1
    assert items == [{"r.department": "研发", "r.amount": 30.3}]
    assert_no_raw_sql(db)


async def test_report_calculated_field_uses_selected_entity_dependencies():
    table_name = "report_entity_calc"
    model = make_entity_model(table_name, [Column("amount", Numeric)])
    old = register_table(table_name, model)
    ds = DataSet(id=4, name="calc")
    table = DataSetTable(dataset_id=4, table_name=table_name, alias="r")
    calc = DatasetCalculatedField(
        id=1,
        dataset_id=4,
        code="double_amount",
        label="双倍金额",
        formula='=FIELD("r.amount") * 2',
        data_type="number",
        agg_role="measure",
        depends_on=["r.amount"],
        used_functions=[],
        is_sensitive=False,
        is_active=True,
    )
    db = FakeSession(
        get_map={(DataSet, 4): ds},
        results=[
            *dataset_rows(4, [table]),
            FakeResult(rows=[make_column(table_name, "amount", column_label="金额", data_type="number")]),
            FakeResult(rows=[calc]),
            FakeResult(rows=[
                FakeRow(__r__id=1, __r__amount=Decimal("10")),
                FakeRow(__r__id=2, __r__amount=Decimal("3")),
            ]),
        ],
    )

    try:
        cols, items, total = await sql_builder.run_dataset_query(
            dataset_id=4,
            columns=["calc.double_amount"],
            filters=[{"column": "calc.double_amount", "op": "gte", "value": 15}],
            filter_logic=None,
            sorts=[],
            value_rules=[],
            aggregate=False,
            aggregations={},
            transpose={},
            rounding_corrections=[],
            page=1,
            page_size=50,
            user=None,
            db=db,
        )
    finally:
        restore_table(table_name, old)

    assert cols == [
        {
            "code": "calc.double_amount",
            "label": "双倍金额",
            "data_type": "number",
            "is_sensitive": False,
        }
    ]
    assert total == 1
    assert items == [{"calc.double_amount": 20.0}]
    assert_no_raw_sql(db)


async def test_report_query_rejects_legacy_raw_source_table():
    table_name = "report_legacy_source"
    old = register_table(table_name, make_legacy_raw_model(table_name))
    ds = DataSet(id=5, name="legacy")
    table = DataSetTable(dataset_id=5, table_name=table_name, alias="r")
    db = FakeSession(
        get_map={(DataSet, 5): ds},
        results=[*dataset_rows(5, [table])],
    )

    try:
        with pytest.raises(RuntimeError, match="不是实体列结构"):
            await sql_builder.run_dataset_query(
                dataset_id=5,
                columns=["r.employee_no"],
                filters=[],
                filter_logic=None,
                sorts=[],
                value_rules=[],
                aggregate=False,
                aggregations={},
                transpose={},
                rounding_corrections=[],
                page=1,
                page_size=50,
                user=None,
                db=db,
            )
    finally:
        restore_table(table_name, old)


async def test_report_scope_filter_rebuild_binds_to_aliased_entity_column(monkeypatch):
    table_name = "report_entity_scope"
    model = make_entity_model(table_name, [Column("employee_no", String)])
    alias_model = aliased(model, name="r")

    import app.permissions.scope_filter as scope_filter

    async def not_super(user, db):
        return False

    async def role_columns(table, db):
        return {"employee_no": "employee_no"}

    async def user_tags(user_id, db):
        tag = SimpleNamespace(org_scope_enabled=False, person_scope_enabled=True)
        flt = SimpleNamespace(field_code="employee_no", values=["E001"], operator="eq")
        return [(tag, [], [flt])]

    monkeypatch.setattr(scope_filter, "_is_super_admin", not_super)
    monkeypatch.setattr(scope_filter, "_get_role_columns", role_columns)
    monkeypatch.setattr(scope_filter, "_get_user_tags", user_tags)

    clause = await sql_builder._rebuild_scope_filter_for_alias(
        SimpleNamespace(id=1),
        table_name,
        alias_model,
        FakeSession(),
    )
    sql = str(select(alias_model.id).where(clause)).lower()

    assert "employee_no" in sql
    assert "raw" not in sql
    assert "jsonb" not in sql
