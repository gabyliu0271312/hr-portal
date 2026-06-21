from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Boolean, Column, MetaData, String, Table
from sqlalchemy.sql.elements import False_, True_

from app.data.dynamic_loader import _make_model_from_table
from app.data.models import CostCenterNode, DATA_TABLES, OrgNode, RegisteredTable, TableColumn
from app.permissions import scope_filter
from app.scopes.models import ScopeTag, ScopeTagFilter, ScopeTagSelection
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

    def scalars(self):
        if self.rows is not None:
            return FakeScalarResult(self.rows)
        return FakeScalarResult([] if self.value is None else [self.value])

    def all(self):
        return list(self.rows or [])

    def first(self):
        if self.rows:
            return self.rows[0]
        return self.value


class FakeSession:
    def __init__(self, *, results=(), get_map=None):
        self.results = list(results)
        self.get_map = get_map or {}
        self.executed = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        result = self.results.pop(0) if self.results else None
        if isinstance(result, FakeResult):
            return result
        return FakeResult(result)

    async def get(self, model, obj_id):
        return self.get_map.get((model, obj_id))


def make_entity_model(table_name: str):
    table = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("synced_at", String),
        Column("cc_code", String),
        Column("employment_type", String),
    )
    return _make_model_from_table(table_name, table)


def make_column(**overrides):
    data = {
        "table_name": "scope_entity_table",
        "column_code": "cc_code",
        "column_label": "成本中心编码",
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


def make_tag(**overrides):
    data = {
        "id": 1,
        "name": "成本中心标签",
        "dimension": "cost_center",
        "org_scope_enabled": True,
        "org_scope_unlimited": False,
        "person_scope_enabled": False,
    }
    data.update(overrides)
    return ScopeTag(**data)


def make_filter(**overrides):
    data = {
        "id": 1,
        "tag_id": 1,
        "field_code": "employment_type",
        "operator": "eq",
        "values": ["正式"],
        "order_index": 1,
    }
    data.update(overrides)
    return ScopeTagFilter(**data)


def set_table(table_name: str, model):
    old = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    return old


def restore_table(table_name: str, old):
    if old is None:
        DATA_TABLES.pop(table_name, None)
    else:
        DATA_TABLES[table_name] = old


def compiled_sql(clause) -> str:
    return str(clause.compile(compile_kwargs={"literal_binds": True}))


async def test_build_scope_filter_uses_entity_columns_for_org_and_person(monkeypatch):
    table_name = "scope_entity_table"
    model = make_entity_model(table_name)
    old_model = set_table(table_name, model)
    node = CostCenterNode(
        id=10,
        code="CC001",
        name="研发中心",
        level=1,
        is_leaf=True,
        is_active=True,
    )
    tag = make_tag(person_scope_enabled=True)
    selection = ScopeTagSelection(id=1, tag_id=1, node_id=10, include_descendants=False)
    role_columns = [
        make_column(table_name=table_name, column_code="cc_code", scope_role="cc_code"),
        make_column(
            table_name=table_name,
            column_code="employment_type",
            column_label="员工类型",
            scope_role="employment_type",
            display_order=20,
        ),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=[]),  # _is_super_admin
            FakeResult(rows=role_columns),  # _get_role_columns
            FakeResult(rows=[tag]),  # scope tags
            FakeResult(rows=[selection]),  # selections
            FakeResult(rows=[make_filter()]),  # filters
        ],
        get_map={(CostCenterNode, 10): node},
    )

    try:
        clause = await scope_filter.build_scope_filter(SimpleNamespace(id=99), table_name, db)
    finally:
        restore_table(table_name, old_model)

    sql = compiled_sql(clause)
    assert "cc_code" in sql
    assert "employment_type" in sql
    assert "CC001" in sql
    assert "正式" in sql
    assert "raw" not in sql.lower()
    assert "jsonb" not in sql.lower()


async def test_build_scope_filter_rejects_legacy_raw_model():
    table_name = "scope_legacy_raw"
    old_model = set_table(table_name, make_legacy_raw_model(table_name))
    role_columns = [
        make_column(table_name=table_name, column_code="cc_code", scope_role="cc_code")
    ]
    tag = make_tag()
    selection = ScopeTagSelection(id=1, tag_id=1, node_id=10, include_descendants=False)
    node = CostCenterNode(
        id=10,
        code="CC001",
        name="研发中心",
        level=1,
        is_leaf=True,
        is_active=True,
    )
    db = FakeSession(
        results=[
            FakeResult(rows=[]),
            FakeResult(rows=role_columns),
            FakeResult(rows=[tag]),
            FakeResult(rows=[selection]),
            FakeResult(rows=[]),
        ],
        get_map={(CostCenterNode, 10): node},
    )

    try:
        with pytest.raises(RuntimeError, match="不是实体列结构"):
            await scope_filter.build_scope_filter(SimpleNamespace(id=99), table_name, db)
    finally:
        restore_table(table_name, old_model)


async def test_build_scope_filter_missing_scope_role_fails_closed(monkeypatch):
    table_name = "scope_no_role"
    old_model = set_table(table_name, make_entity_model(table_name))
    db = FakeSession(
        results=[
            FakeResult(rows=[]),
            FakeResult(rows=[]),
        ]
    )

    try:
        clause = await scope_filter.build_scope_filter(SimpleNamespace(id=99), table_name, db)
    finally:
        restore_table(table_name, old_model)

    assert isinstance(clause, False_)


async def test_build_scope_filter_super_admin_allows_all():
    table_name = "scope_super_admin"
    old_model = set_table(table_name, make_entity_model(table_name))
    db = FakeSession(results=[FakeResult(rows=[("超级管理员",)])])

    try:
        clause = await scope_filter.build_scope_filter(SimpleNamespace(id=99), table_name, db)
    finally:
        restore_table(table_name, old_model)

    assert isinstance(clause, True_)


async def test_build_scope_filter_missing_physical_scope_column_raises():
    table_name = "scope_missing_column"
    model = make_entity_model(table_name)
    old_model = set_table(table_name, model)
    role_columns = [
        make_column(table_name=table_name, column_code="missing_cc", scope_role="cc_code")
    ]
    tag = make_tag()
    selection = ScopeTagSelection(id=1, tag_id=1, node_id=10, include_descendants=False)
    node = CostCenterNode(
        id=10,
        code="CC001",
        name="研发中心",
        level=1,
        is_leaf=True,
        is_active=True,
    )
    db = FakeSession(
        results=[
            FakeResult(rows=[]),
            FakeResult(rows=role_columns),
            FakeResult(rows=[tag]),
            FakeResult(rows=[selection]),
            FakeResult(rows=[]),
        ],
        get_map={(CostCenterNode, 10): node},
    )

    try:
        with pytest.raises(RuntimeError, match="缺少权限实体列"):
            await scope_filter.build_scope_filter(SimpleNamespace(id=99), table_name, db)
    finally:
        restore_table(table_name, old_model)


def _make_plain_entity(table_name: str, *cols: str):
    from sqlalchemy import BigInteger as _BI
    table = Table(
        table_name,
        MetaData(),
        Column("id", _BI, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("synced_at", String),
        *[Column(c, String) for c in cols],
    )
    return _make_model_from_table(table_name, table)


async def test_build_scope_filter_passthrough_via_roster():
    """G3：目标表只有 employee_no、无 scope_role 列 → 经花名册子查询穿透。"""
    target_name = "scope_passthrough_salary"
    target_model = _make_plain_entity(target_name, "employee_no")
    roster_model = _make_plain_entity(scope_filter.ROSTER_TABLE, "employee_no", "org_node_code")
    old_target = set_table(target_name, target_model)
    old_roster = set_table(scope_filter.ROSTER_TABLE, roster_model)

    tag = make_tag(dimension="org")
    selection = ScopeTagSelection(id=1, tag_id=1, node_id=10, include_descendants=False)
    node = OrgNode(id=10, code="ORG001", name="技术中心", level=1, is_leaf=True, is_active=True)
    roster_role_col = make_column(
        table_name=scope_filter.ROSTER_TABLE,
        column_code="org_node_code",
        scope_role="org_node_code",
    )

    db = FakeSession(
        results=[
            FakeResult(rows=[]),                  # _is_super_admin
            FakeResult(rows=[]),                  # _get_role_columns(target) → 空
            FakeResult(rows=[("employee_no",)]),  # _get_roster_join_col → employee_no
            FakeResult(rows=[tag]),               # tags
            FakeResult(rows=[selection]),         # selections
            FakeResult(rows=[]),                  # filters
            FakeResult(rows=[roster_role_col]),   # _get_role_columns(roster)
        ],
        get_map={(OrgNode, 10): node},
    )

    try:
        clause = await scope_filter.build_scope_filter(SimpleNamespace(id=99), target_name, db)
    finally:
        restore_table(target_name, old_target)
        restore_table(scope_filter.ROSTER_TABLE, old_roster)

    sql = compiled_sql(clause).upper()
    assert "IN (SELECT" in sql                       # 子查询穿透
    assert scope_filter.ROSTER_TABLE.upper() in sql  # 从花名册取
    assert "EMPLOYEE_NO" in sql
    assert "ORG001" in sql                           # 组织约束下放到花名册


async def test_build_scope_filter_no_role_no_join_fails_closed():
    """无 scope_role 列且无 roster_join_col → fail-closed。"""
    target_name = "scope_no_role_no_join"
    target_model = _make_plain_entity(target_name, "employee_no")
    old_target = set_table(target_name, target_model)
    db = FakeSession(
        results=[
            FakeResult(rows=[]),  # _is_super_admin
            FakeResult(rows=[]),  # _get_role_columns(target) → 空
            FakeResult(rows=[]),  # _get_roster_join_col → 无（.first()=None）
        ]
    )
    try:
        clause = await scope_filter.build_scope_filter(SimpleNamespace(id=99), target_name, db)
    finally:
        restore_table(target_name, old_target)
    assert isinstance(clause, False_)


async def test_build_scope_filter_person_first_uses_only_org_tags():
    table_name = "scope_strategy_person"
    model = _make_plain_entity(table_name, "org_node_code", "cc_code")
    old_model = set_table(table_name, model)
    org_tag = make_tag(id=1, name="组织标签", dimension="org")
    cc_tag = make_tag(id=2, name="成本标签", dimension="cost_center")
    org_sel = ScopeTagSelection(id=1, tag_id=1, node_id=10, include_descendants=False)
    cc_sel = ScopeTagSelection(id=2, tag_id=2, node_id=20, include_descendants=False)
    org_node = OrgNode(id=10, code="ORG001", name="技术中心", level=1, is_leaf=True, is_active=True)
    cc_node = CostCenterNode(id=20, code="CC001", name="项目中心", level=1, is_leaf=True, is_active=True)
    role_columns = [
        make_column(table_name=table_name, column_code="org_node_code", scope_role="org_node_code"),
        make_column(table_name=table_name, column_code="cc_code", scope_role="cc_code"),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=[]),
            FakeResult(rows=role_columns),
            FakeResult(rows=[]),  # _get_roster_join_col
            FakeResult(rows=[org_tag, cc_tag]),
            FakeResult(rows=[org_sel]),
            FakeResult(rows=[]),
            FakeResult(rows=[cc_sel]),
            FakeResult(rows=[]),
        ],
        get_map={(OrgNode, 10): org_node, (CostCenterNode, 20): cc_node},
    )

    try:
        clause = await scope_filter.build_scope_filter(
            SimpleNamespace(id=99), table_name, db, strategy="person_first"
        )
    finally:
        restore_table(table_name, old_model)

    sql = compiled_sql(clause)
    assert "ORG001" in sql
    assert "CC001" not in sql


async def test_build_scope_filter_person_first_passthrough_even_when_table_has_cc_role():
    target_name = "scope_strategy_salary"
    target_model = _make_plain_entity(target_name, "employee_no", "cc_code")
    roster_model = _make_plain_entity(scope_filter.ROSTER_TABLE, "employee_no", "org_node_code")
    old_target = set_table(target_name, target_model)
    old_roster = set_table(scope_filter.ROSTER_TABLE, roster_model)
    tag = make_tag(id=1, name="组织标签", dimension="org")
    selection = ScopeTagSelection(id=1, tag_id=1, node_id=10, include_descendants=False)
    node = OrgNode(id=10, code="ORG001", name="技术中心", level=1, is_leaf=True, is_active=True)
    target_role_col = make_column(
        table_name=target_name,
        column_code="cc_code",
        scope_role="cc_code",
    )
    roster_role_col = make_column(
        table_name=scope_filter.ROSTER_TABLE,
        column_code="org_node_code",
        scope_role="org_node_code",
    )
    db = FakeSession(
        results=[
            FakeResult(rows=[]),
            FakeResult(rows=[target_role_col]),
            FakeResult(rows=[("employee_no",)]),
            FakeResult(rows=[tag]),
            FakeResult(rows=[selection]),
            FakeResult(rows=[]),
            FakeResult(rows=[roster_role_col]),
        ],
        get_map={(OrgNode, 10): node},
    )

    try:
        clause = await scope_filter.build_scope_filter(
            SimpleNamespace(id=99), target_name, db, strategy="person_first"
        )
    finally:
        restore_table(target_name, old_target)
        restore_table(scope_filter.ROSTER_TABLE, old_roster)

    sql = compiled_sql(clause).upper()
    assert "IN (SELECT" in sql
    assert "ORG001" in sql
    assert "CC_CODE" not in sql
