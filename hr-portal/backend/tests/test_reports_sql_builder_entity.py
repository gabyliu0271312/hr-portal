from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import BigInteger, Column, Date, MetaData, Numeric, String, Table, select
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import False_

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


async def test_report_scope_filter_skips_alias_that_cannot_resolve_explicit_strategy(monkeypatch):
    roster_table = "report_scope_roster"
    allocation_table = "report_scope_allocation"
    roster_model = make_entity_model(roster_table, [Column("employee_no", String)])
    allocation_model = make_entity_model(
        allocation_table,
        [Column("employee_no", String), Column("code", String)],
    )
    old_roster = register_table(roster_table, roster_model)
    old_allocation = register_table(allocation_table, allocation_model)
    ds = DataSet(id=9, name="cc report", scope_strategy="cc_first")
    tables = [
        DataSetTable(dataset_id=9, table_name=roster_table, alias="r"),
        DataSetTable(dataset_id=9, table_name=allocation_table, alias="a"),
    ]
    rel = DataSetRelation(
        dataset_id=9,
        left_alias="r",
        right_alias="a",
        join_type="left",
        keys=[{"left": "employee_no", "right": "employee_no"}],
    )
    db = FakeSession(
        get_map={(DataSet, 9): ds},
        results=[
            *dataset_rows(9, tables, [rel]),
            FakeResult(rows=[make_column(roster_table, "employee_no")]),
            FakeResult(rows=[
                make_column(allocation_table, "employee_no"),
                make_column(allocation_table, "code", scope_role="cc_code"),
            ]),
            FakeResult(rows=[]),  # calculated fields
            FakeResult(rows=[]),  # hidden roster
            FakeResult(rows=[]),  # sensitive roster
            FakeResult(rows=[]),  # hidden allocation
            FakeResult(rows=[]),  # sensitive allocation
            FakeResult(rows=[
                (roster_table, "person_first"),
                (allocation_table, "cc_first"),
            ]),
            FakeResult(value=1),  # count
            FakeResult(rows=[
                FakeRow(__r__id=1, __a__id=2, __r__employee_no="E001", __a__code="CC001")
            ]),
        ],
    )

    async def fake_hidden(user, table, db, tool_key=None):
        return set()

    async def fake_sensitive(user, table, db):
        return set()

    async def fake_can_resolve(table, strategy, db):
        return table == allocation_table

    async def fake_build_scope(user, table, db, strategy=None):
        return False_() if table == allocation_table else None

    async def fake_rebuild(user, table, aliased_model, db, strategy=None):
        if table != allocation_table:
            raise AssertionError("roster alias should not rebuild cc_first scope")
        return aliased_model.__table__.c.code == "CC001"

    import app.permissions.masker as masker
    import app.permissions.scope_filter as scope_filter

    monkeypatch.setattr(masker, "get_hidden_columns", fake_hidden)
    monkeypatch.setattr(masker, "get_sensitive_columns", fake_sensitive)
    monkeypatch.setattr(scope_filter, "can_resolve_scope_strategy", fake_can_resolve)
    monkeypatch.setattr(scope_filter, "build_scope_filter", fake_build_scope)
    monkeypatch.setattr(sql_builder, "_rebuild_scope_filter_for_alias", fake_rebuild)

    try:
        _cols, _items, _total = await sql_builder.run_dataset_query(
            dataset_id=9,
            columns=["r.employee_no", "a.code"],
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
            user=SimpleNamespace(id=1),
            db=db,
        )
    finally:
        restore_table(roster_table, old_roster)
        restore_table(allocation_table, old_allocation)


async def test_report_list_lookup_union_resolves_name_values_to_employee_no():
    table_name = "report_entity_list_lookup_union"
    model = make_entity_model(
        table_name,
        [
            Column("employee_no", String),
            Column("full_name", String),
            Column("direct_supervisor", String),
            Column("management_level", String),
        ],
    )
    old = register_table(table_name, model)
    ds = DataSet(id=10, name="list lookup")
    table = DataSetTable(dataset_id=10, table_name=table_name, alias="r")
    columns = [
        make_column(table_name, "employee_no", column_label="工号"),
        make_column(table_name, "full_name", column_label="姓名"),
        make_column(table_name, "direct_supervisor", column_label="直接上级"),
        make_column(table_name, "management_level", column_label="管理职级"),
    ]
    db = FakeSession(
        get_map={(DataSet, 10): ds},
        results=[
            *dataset_rows(10, [table]),
            FakeResult(rows=columns),
            FakeResult(rows=[]),
            FakeResult(value=1),
            FakeResult(rows=[FakeRow(__r__id=1, __r__employee_no="M001", __r__full_name="张三")]),
        ],
    )

    try:
        _cols, items, total = await sql_builder.run_dataset_query(
            dataset_id=10,
            columns=["r.employee_no", "r.full_name"],
            filters=[],
            filter_logic=None,
            sorts=[],
            value_rules=[],
            aggregate=False,
            aggregations={},
            transpose={},
            rounding_corrections=[],
            list_lookup={
                "enabled": True,
                "operator": "union",
                "lookup": {"target_field": "r.employee_no"},
                "sources": [
                    {
                        "type": "field_values",
                        "source_field": "r.direct_supervisor",
                        "resolver": {
                            "match_field": "r.full_name",
                            "return_field": "r.employee_no",
                        },
                    },
                    {
                        "type": "filtered_rows",
                        "return_field": "r.employee_no",
                        "filters": [
                            {"column": "r.management_level", "op": "is_not_null"},
                        ],
                    },
                ],
            },
            page=1,
            page_size=50,
            user=None,
            db=db,
        )
    finally:
        restore_table(table_name, old)

    assert total == 1
    assert items == [{"r.employee_no": "M001", "r.full_name": "张三"}]
    sql = "\n".join(str(statement) for statement, _ in db.executed).lower()
    assert " union " in sql
    assert "lls_0_r.direct_supervisor" in sql
    assert "llr_0_r.full_name" in sql
    assert "llr_0_r.employee_no" in sql
    assert "management_level" in sql
    assert_no_raw_sql(db)


@pytest.mark.parametrize(
    ("operator", "expected_sql"),
    [
        ("intersect", " intersect "),
        ("except", " except "),
    ],
)
async def test_report_list_lookup_supports_intersect_and_except(operator, expected_sql):
    table_name = f"report_entity_list_lookup_{operator}"
    model = make_entity_model(
        table_name,
        [
            Column("employee_no", String),
            Column("direct_supervisor_no", String),
            Column("management_level", String),
        ],
    )
    old = register_table(table_name, model)
    ds = DataSet(id=11, name=operator)
    table = DataSetTable(dataset_id=11, table_name=table_name, alias="r")
    columns = [
        make_column(table_name, "employee_no"),
        make_column(table_name, "direct_supervisor_no"),
        make_column(table_name, "management_level"),
    ]
    db = FakeSession(
        get_map={(DataSet, 11): ds},
        results=[
            *dataset_rows(11, [table]),
            FakeResult(rows=columns),
            FakeResult(rows=[]),
            FakeResult(value=0),
            FakeResult(rows=[]),
        ],
    )

    try:
        _cols, _items, _total = await sql_builder.run_dataset_query(
            dataset_id=11,
            columns=["r.employee_no"],
            filters=[],
            filter_logic=None,
            sorts=[],
            value_rules=[],
            aggregate=False,
            aggregations={},
            transpose={},
            rounding_corrections=[],
            list_lookup={
                "enabled": True,
                "operator": operator,
                "lookup": {"target_field": "r.employee_no"},
                "sources": [
                    {
                        "type": "field_values",
                        "source_field": "r.direct_supervisor_no",
                        "resolver": {"enabled": False},
                    },
                    {
                        "type": "filtered_rows",
                        "return_field": "r.employee_no",
                        "filters": [
                            {"column": "r.management_level", "op": "is_not_null"},
                        ],
                    },
                ],
            },
            page=1,
            page_size=50,
            user=None,
            db=db,
        )
    finally:
        restore_table(table_name, old)

    sql = "\n".join(str(statement) for statement, _ in db.executed).lower()
    assert expected_sql in sql
    assert_no_raw_sql(db)


async def test_report_list_lookup_rejects_mismatched_source_key_type():
    table_name = "report_entity_list_lookup_type_mismatch"
    model = make_entity_model(
        table_name,
        [
            Column("employee_no", String),
            Column("full_name", String),
            Column("direct_supervisor", String),
            Column("management_level", Numeric),
        ],
    )
    old = register_table(table_name, model)
    ds = DataSet(id=12, name="list lookup mismatch")
    table = DataSetTable(dataset_id=12, table_name=table_name, alias="r")
    columns = [
        make_column(table_name, "employee_no", column_label="工号"),
        make_column(table_name, "full_name", column_label="姓名"),
        make_column(table_name, "direct_supervisor", column_label="直接上级"),
        make_column(table_name, "management_level", column_label="管理职级", data_type="number"),
    ]
    db = FakeSession(
        get_map={(DataSet, 12): ds},
        results=[
            *dataset_rows(12, [table]),
            FakeResult(rows=columns),
        ],
    )

    try:
        with pytest.raises(HTTPException) as exc:
            await sql_builder.run_dataset_query(
                dataset_id=12,
                columns=["r.employee_no", "r.full_name"],
                filters=[],
                filter_logic=None,
                sorts=[],
                value_rules=[],
                aggregate=False,
                aggregations={},
                transpose={},
                rounding_corrections=[],
                list_lookup={
                    "enabled": True,
                    "operator": "union",
                    "lookup": {"target_field": "r.employee_no"},
                    "sources": [
                        {
                            "type": "field_values",
                            "source_field": "r.direct_supervisor",
                            "resolver": {
                                "match_field": "r.full_name",
                                "return_field": "r.employee_no",
                            },
                        },
                        {
                            "type": "filtered_rows",
                            "return_field": "r.management_level",
                            "filters": [
                                {"column": "r.management_level", "op": "is_not_null"},
                            ],
                        },
                    ],
                },
                page=1,
                page_size=50,
                user=None,
                db=db,
            )
    finally:
        restore_table(table_name, old)

    assert exc.value.status_code == 400
    assert "名单回查第 2 个来源" in str(exc.value.detail)
    assert "请让所有名单来源返回同一种回查键" in str(exc.value.detail)


async def test_report_list_lookup_numeric_is_not_null_filter_does_not_compare_empty_string():
    table_name = "report_entity_list_lookup_numeric_filter"
    model = make_entity_model(
        table_name,
        [
            Column("employee_no", Numeric),
            Column("management_level", Numeric),
        ],
    )
    old = register_table(table_name, model)
    ds = DataSet(id=13, name="list lookup numeric filter")
    table = DataSetTable(dataset_id=13, table_name=table_name, alias="r")
    columns = [
        make_column(table_name, "employee_no", column_label="工号"),
        # Simulate stale metadata: physical column is Numeric but metadata still says string.
        make_column(table_name, "management_level", column_label="管理职级", data_type="string"),
    ]
    db = FakeSession(
        get_map={(DataSet, 13): ds},
        results=[
            *dataset_rows(13, [table]),
            FakeResult(rows=columns),
            FakeResult(rows=[]),
            FakeResult(value=0),
            FakeResult(rows=[]),
        ],
    )

    try:
        await sql_builder.run_dataset_query(
            dataset_id=13,
            columns=["r.employee_no"],
            filters=[],
            filter_logic=None,
            sorts=[],
            value_rules=[],
            aggregate=False,
            aggregations={},
            transpose={},
            rounding_corrections=[],
            list_lookup={
                "enabled": True,
                "operator": "union",
                "lookup": {"target_field": "r.employee_no"},
                "sources": [
                    {
                        "type": "filtered_rows",
                        "return_field": "r.employee_no",
                        "filters": [
                            {"column": "r.management_level", "op": "is_not_null"},
                        ],
                    },
                ],
            },
            page=1,
            page_size=50,
            user=None,
            db=db,
        )
    finally:
        restore_table(table_name, old)

    sql = "\n".join(str(statement) for statement, _ in db.executed).lower()
    assert "employee_no is not null" in sql
    assert "cast(lls_0_r.employee_no as varchar) !=" in sql
    assert "lls_0_r.employee_no != " not in sql
    assert "management_level is not null" in sql
    assert "cast(lls_0_r.management_level as varchar) !=" in sql
    assert "lls_0_r.management_level != " not in sql
