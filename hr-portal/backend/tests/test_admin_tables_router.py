from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.admin import tables_router
from app.data.models import RegisteredTable
from app.datasources.sync_service import PERIOD_TABLES


pytestmark = pytest.mark.asyncio


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


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


class FakeSession:
    def __init__(self, results=()):
        self.results = list(results)
        self.executed = []
        self.added = []
        self.added_all = []
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

    def add(self, obj):
        self.added.append(obj)

    def add_all(self, objs):
        self.added_all.extend(objs)

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
        if getattr(obj, "is_builtin", None) is None:
            obj.is_builtin = False

    async def delete(self, obj):
        self.deleted.append(obj)


@pytest.fixture
def fake_user():
    return SimpleNamespace(id=42)


def _install_create_table_fakes(monkeypatch):
    create_calls = []
    register_calls = []
    period_calls = []
    ensure_calls = []

    async def fake_create_source_table(db, table_name, columns):
        create_calls.append((db, table_name, list(columns)))

    async def fake_register_source_table_model(db, table_name, *, force=False):
        register_calls.append((db, table_name, force))
        return object()

    def fake_register_period_table(rt, *, overwrite=False):
        period_calls.append((rt, overwrite))

    async def fake_ensure_dwd_dataset(table_name, db, *, created_by, table_label):
        ensure_calls.append((table_name, db, created_by, table_label))
        return object()

    monkeypatch.setattr(tables_router, "create_source_table", fake_create_source_table)
    monkeypatch.setattr(
        tables_router,
        "register_source_table_model",
        fake_register_source_table_model,
    )
    monkeypatch.setattr(tables_router, "register_period_table", fake_register_period_table)
    monkeypatch.setattr(
        tables_router,
        "ensure_dwd_dataset",
        fake_ensure_dwd_dataset,
    )
    return create_calls, register_calls, period_calls, ensure_calls


async def test_create_table_builds_empty_entity_table(monkeypatch, fake_user):
    create_calls, register_calls, period_calls, ensure_calls = _install_create_table_fakes(
        monkeypatch
    )
    db = FakeSession(results=[None])
    payload = tables_router.CreateTableIn(
        table_name="ods_custom_entity",
        table_label="自定义实体表",
    )

    result = await tables_router.create_table(payload, user=fake_user, db=db)

    assert result.table_name == "ods_custom_entity"
    assert result.is_builtin is False
    assert create_calls[0][1] == "ods_custom_entity"
    assert create_calls[0][2] == []
    # ODS + DWD 两张表都注册到运行时
    assert register_calls == [(db, "ods_custom_entity", True), (db, "dwd_custom_entity", True)]
    assert period_calls[0][0].table_name == "ods_custom_entity"
    assert period_calls[0][1] is True
    # DWD 数据集（ds_dwd_ 前缀）
    assert ensure_calls == [("dwd_custom_entity", db, fake_user.id, "自定义实体表")]
    assert db.added and isinstance(db.added[0], RegisteredTable)
    assert db.added_all == []
    assert db.committed is True


async def test_create_table_can_create_initial_entity_columns(monkeypatch, fake_user):
    create_calls, _, period_calls, _ = _install_create_table_fakes(monkeypatch)
    db = FakeSession(results=[None])
    payload = tables_router.CreateTableIn(
        table_name="ods_custom_salary",
        table_label="自定义薪资表",
        is_period=True,
        period_col="month",
        columns=[
            tables_router.InitialColumnIn(
                column_code="employee_no",
                column_label="员工编号",
                data_type="string",
                display_order=20,
            ),
            tables_router.InitialColumnIn(
                column_code="base_salary",
                column_label="基本工资",
                data_type="number",
                is_sensitive=True,
                display_order=10,
                agg_role="measure",
            ),
        ],
    )

    await tables_router.create_table(payload, user=fake_user, db=db)

    ddl_columns = create_calls[0][2]
    assert [(c.column_code, c.data_type) for c in ddl_columns] == [
        ("base_salary", "number"),
        ("employee_no", "string"),
    ]
    # ODS columns (first 2) + DWD columns (last 2, copies)
    assert [(c.column_code, c.auto_discovered) for c in db.added_all] == [
        ("employee_no", False),
        ("base_salary", False),
        ("employee_no", False),
        ("base_salary", False),
    ]
    assert db.added_all[1].is_sensitive is True
    assert db.added_all[1].agg_role == "measure"
    assert period_calls[0][0].is_period is True
    assert period_calls[0][0].period_col == "month"


async def test_create_table_rejects_invalid_table_name_before_db_work(fake_user):
    db = FakeSession()
    payload = tables_router.CreateTableIn(
        table_name="bad-name",
        table_label="非法表",
    )

    with pytest.raises(HTTPException) as exc_info:
        await tables_router.create_table(payload, user=fake_user, db=db)

    assert exc_info.value.status_code == 400
    assert db.executed == []


async def test_create_table_rejects_non_ods_prefix(fake_user):
    db = FakeSession()
    payload = tables_router.CreateTableIn(
        table_name="custom_entity",
        table_label="自定义实体表",
    )

    with pytest.raises(HTTPException) as exc_info:
        await tables_router.create_table(payload, user=fake_user, db=db)

    assert exc_info.value.status_code == 400
    assert "ods_" in exc_info.value.detail


async def test_create_table_rejects_invalid_scope_strategy_before_db_work(fake_user):
    db = FakeSession()
    payload = tables_router.CreateTableIn(
        table_name="ods_custom_entity",
        table_label="Custom Entity",
        scope_strategy="bad_strategy",
    )

    with pytest.raises(HTTPException) as exc_info:
        await tables_router.create_table(payload, user=fake_user, db=db)

    assert exc_info.value.status_code == 400
    assert db.executed == []


async def test_create_table_rejects_duplicate_registered_table(monkeypatch, fake_user):
    create_calls, _, _, _ = _install_create_table_fakes(monkeypatch)
    db = FakeSession(
        results=[
            RegisteredTable(
                table_name="ods_custom_entity",
                table_label="已有表",
                is_builtin=False,
            )
        ]
    )
    payload = tables_router.CreateTableIn(
        table_name="ods_custom_entity",
        table_label="自定义实体表",
    )

    with pytest.raises(HTTPException) as exc_info:
        await tables_router.create_table(payload, user=fake_user, db=db)

    assert exc_info.value.status_code == 409
    assert create_calls == []


async def test_delete_table_drops_entity_table_and_cleans_runtime_state(monkeypatch):
    rt = RegisteredTable(
        table_name="custom_entity",
        table_label="自定义实体表",
        is_builtin=False,
    )
    db = FakeSession(results=[rt, None])
    drop_calls = []
    unregister_calls = []

    async def fake_find_single_table_dataset(table_name, db_arg):
        assert table_name == "custom_entity"
        assert db_arg is db
        return None

    async def fake_drop_source_table(db_arg, table_name, *, cascade=False):
        drop_calls.append((db_arg, table_name, cascade))

    def fake_unregister_source_table_model(table_name):
        unregister_calls.append(table_name)

    monkeypatch.setattr(
        tables_router,
        "find_single_table_dataset",
        fake_find_single_table_dataset,
    )
    monkeypatch.setattr(tables_router, "drop_source_table", fake_drop_source_table)
    monkeypatch.setattr(
        tables_router,
        "unregister_source_table_model",
        fake_unregister_source_table_model,
    )

    PERIOD_TABLES["custom_entity"] = {"period_col": "month"}
    try:
        result = await tables_router.delete_table("custom_entity", db=db)
    finally:
        PERIOD_TABLES.pop("custom_entity", None)

    assert result == {"ok": True}
    assert drop_calls == [(db, "custom_entity", True)]
    assert unregister_calls == ["custom_entity"]
    assert "custom_entity" not in PERIOD_TABLES
    assert db.deleted == [rt]
    assert db.committed is True


async def test_delete_table_rejects_builtin_table(monkeypatch):
    rt = RegisteredTable(
        table_name="emp_realtime_roster",
        table_label="员工实时花名册",
        is_builtin=True,
    )
    db = FakeSession(results=[rt])
    drop_calls = []

    async def fake_drop_source_table(db_arg, table_name, *, cascade=False):
        drop_calls.append((db_arg, table_name, cascade))

    monkeypatch.setattr(tables_router, "drop_source_table", fake_drop_source_table)

    with pytest.raises(HTTPException) as exc_info:
        await tables_router.delete_table("emp_realtime_roster", db=db)

    assert exc_info.value.status_code == 403
    assert drop_calls == []


async def test_delete_table_rejects_invalid_table_name_before_db_work():
    db = FakeSession()

    with pytest.raises(HTTPException) as exc_info:
        await tables_router.delete_table("bad-name", db=db)

    assert exc_info.value.status_code == 400
    assert db.executed == []
