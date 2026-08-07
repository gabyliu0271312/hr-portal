# -*- coding: utf-8 -*-
"""鏁版嵁璐ㄩ噺 (Q03) 娴嬭瘯

瑕嗙洊: Schema 鏍￠獙銆佽鍒欑被鍨嬫灇涓俱€侀殣钘忓瓧娈?鑴辨晱閫昏緫銆侀潪娉曡緭鍏?400
"""
import pytest
from sqlalchemy.dialects import postgresql
from datetime import datetime, timezone
from types import SimpleNamespace
from pydantic import ValidationError

from app.warehouse.schemas import (
    QUALITY_RULE_TYPES,
    QUALITY_SEVERITIES,
    EXECUTABLE_RULE_TYPES,
    WarehouseQualityRuleIn,
    WarehouseQualityRuleUpdateIn,
    WarehouseQualityRuleOut,
    WarehouseQualityRunOut,
    QualityRunTriggerIn,
    QualityRunTriggerOut,
    QualityAlertSummaryOut,
)
from app.warehouse.quality_engine import (
    _check_date_format,
    _check_enum,
    _check_not_null,
    _check_unique,
    _row_to_dict,
    _safe_ident,
    execute_quality_rule,
)
from app.warehouse.quality_service import _is_older_batch, _select_relation_states, run_quality_rule, upsert_quality_status


# ==================== _safe_ident ====================

def test_safe_ident_normal():
    assert _safe_ident("employees") == '"employees"'


def test_safe_ident_with_dash():
    with pytest.raises(ValueError):
        _safe_ident("my-table")


def test_safe_ident_empty_raises():
    with pytest.raises(ValueError):
        _safe_ident("")


def test_safe_ident_special_chars():
    with pytest.raises(ValueError):
        _safe_ident("x; DROP TABLE users;")


# ==================== _row_to_dict (闅愯棌鍒?+ 鑴辨晱) ====================

def test_row_to_dict_basic():
    row = ("zhangsan", "IT")
    keys = ("name", "dept")
    d = _row_to_dict(row, keys)
    assert d["name"] == "zhangsan"
    assert d["dept"] == "IT"


def test_row_to_dict_filter_hidden():
    """闅愯棌鍒椾笉鍑虹幇鍦ㄧ粨鏋滀腑"""
    row = ("zhangsan", "secret_val")
    keys = ("name", "salary")
    d = _row_to_dict(row, keys, hidden={"salary"})
    assert "name" in d
    assert "salary" not in d


def test_row_to_dict_mask_sensitive():
    """鑴辨晱鍒楀€兼浛鎹负 ******"""
    row = ("zhangsan", "123456")
    keys = ("name", "id_card")
    d = _row_to_dict(row, keys, sensitive={"id_card"})
    assert d["name"] == "zhangsan"
    assert d["id_card"] == "******"


def test_row_to_dict_hidden_and_sensitive():
    """闅愯棌鍒楄繃婊?+ 鑴辨晱鍒楁帺鐮佸悓鏃剁敓鏁?"""
    row = ("zhangsan", "123456", 50000)
    keys = ("name", "id_card", "salary")
    d = _row_to_dict(row, keys, hidden={"salary"}, sensitive={"id_card"})
    assert d["name"] == "zhangsan"
    assert d["id_card"] == "******"
    assert "salary" not in d


def test_row_to_dict_empty_sets():
    row = ("a", "b")
    keys = ("x", "y")
    d = _row_to_dict(row, keys, hidden=set(), sensitive=set())
    assert d == {"x": "a", "y": "b"}


def test_row_to_dict_none_sets():
    row = ("a", "b")
    keys = ("x", "y")
    d = _row_to_dict(row, keys)  # hidden/sensitive default None
    assert d == {"x": "a", "y": "b"}


# ==================== Schema: WarehouseQualityRuleIn ====================

def test_rule_in_valid():
    r = WarehouseQualityRuleIn(
        asset_type="table",
        asset_code="emp",
        rule_type="not_null",
        rule_config={"column": "name"},
        severity="warn",
    )
    assert r.asset_type == "table"
    assert r.severity == "warn"


def test_rule_in_defaults():
    r = WarehouseQualityRuleIn(
        asset_type="table",
        asset_code="emp",
        rule_type="not_null",
        rule_config={"column": "name"},
    )
    assert r.severity == "warn"


def test_rule_in_rule_type_str():
    """rule_type 涓虹函 str锛宻chema 涓嶅仛鏋氫妇鏍￠獙锛堢敱 router 灞?_validate_rule_type 澶勭悊锛?"""
    r = WarehouseQualityRuleIn(
        asset_type="table", asset_code="emp",
        rule_type="not_null", rule_config={"column": "x"},
    )
    assert r.rule_type == "not_null"


def test_rule_in_severity_default():
    """severity 榛樿 warn"""
    r = WarehouseQualityRuleIn(
        asset_type="table", asset_code="emp",
        rule_type="not_null", rule_config={"column": "x"},
    )
    assert r.severity == "warn"


def test_rule_in_missing_fields():
    with pytest.raises(ValidationError):
        WarehouseQualityRuleIn(asset_type="table")


# ==================== Schema: WarehouseQualityRuleUpdateIn ====================

def test_rule_update_partial():
    r = WarehouseQualityRuleUpdateIn(severity="error")
    assert r.severity == "error"
    assert r.rule_config is None


def test_rule_update_empty():
    r = WarehouseQualityRuleUpdateIn()
    assert r.rule_config is None
    assert r.severity is None


# ==================== Schema: QualityRunTriggerOut ====================

def test_run_trigger_pass():
    r = QualityRunTriggerOut(run_id=1, status="pass", message="ok")
    assert r.status == "pass"
    assert r.run_id == 1


def test_run_trigger_fail():
    r = QualityRunTriggerOut(run_id=2, status="fail", message="5 rows failed")
    assert r.status == "fail"
    assert r.run_id == 2


# ==================== Schema: QualityAlertSummaryOut ====================

def test_alert_summary():
    a = QualityAlertSummaryOut(
        total_rules=10, failed_rules=2, warning_rules=1,
        by_severity={"info": 4, "warn": 3, "error": 3},
    )
    assert a.total_rules == 10
    assert a.failed_rules == 2
    assert a.by_severity["error"] == 3


# ==================== Enums ====================

def test_executable_rule_types():
    """Q0307-Q0308: only 4 types are executable"""
    assert "not_null" in EXECUTABLE_RULE_TYPES
    assert "unique" in EXECUTABLE_RULE_TYPES
    assert "enum" in EXECUTABLE_RULE_TYPES
    assert "date_format" in EXECUTABLE_RULE_TYPES
    assert "referential_integrity" not in EXECUTABLE_RULE_TYPES
    assert "custom_sql" not in EXECUTABLE_RULE_TYPES


def test_quality_severities():
    assert set(QUALITY_SEVERITIES) == {"info", "warn", "error"}


# ==================== R2: fail-closed 鍥炲綊 ====================


class _FakeSession:
    """鏈€灏?FakeSession锛屽彧鐢ㄤ簬瑙﹀彂 execute_quality_rule 鐨?fail-closed 璺緞"""
    async def execute(self, *args, **kwargs):
        return self
    def scalar(self): return 0
    def scalars(self): return type('_', (), {'all': lambda: [], 'first': lambda: None})()
    def fetchall(self): return []


class _HashSampleResult:
    def __init__(self, scalar_value=0, rows=None):
        self.scalar_value = scalar_value
        self.rows = rows or []

    def scalar(self):
        return self.scalar_value

    def fetchall(self):
        return self.rows


class _HashSampleSession:
    def __init__(self):
        self.sql = []

    async def execute(self, statement, *args, **kwargs):
        query = str(statement)
        self.sql.append(query)
        if "GROUP BY" in query:
            return _HashSampleResult(rows=[("a" * 32, 3)])
        if "md5(" in query:
            return _HashSampleResult(rows=[("b" * 32,)])
        if "COUNT(*)" in query:
            return _HashSampleResult(scalar_value=1 if "WHERE" in query else 3)
        raise AssertionError(f"unexpected quality SQL: {query}")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "checker, config, hash_type",
    [
        (_check_not_null, {"column": "employee_no"}, None),
        (_check_unique, {"column": "employee_no"}, "duplicate"),
        (_check_enum, {"column": "status", "values": ["ACTIVE"]}, "invalid"),
        (_check_date_format, {"column": "pay_date", "format": "%Y-%m-%d"}, "invalid"),
    ],
)
async def test_basic_quality_rules_do_not_return_plaintext_rows(checker, config, hash_type):
    session = _HashSampleSession()
    result = await checker(session, "employees", config["column"], config, set(), set())

    assert result["sample_rows"] == []
    assert all("SELECT *" not in query for query in session.sql)
    hashes = result["sample_key_hashes"]
    if hash_type is None:
        assert hashes == []
    else:
        assert hashes[0]["type"] == hash_type
        assert len(hashes[0]["key_hash"]) == 32


def test_quality_run_response_excludes_plaintext_samples():
    result = WarehouseQualityRunOut(
        id=1,
        status="fail",
        sample_rows=[{"employee_no": "E-001", "customer_name": "Alice"}],
    )

    assert "sample_rows" not in result.model_dump()


@pytest.mark.asyncio
async def test_fail_closed_get_hidden_columns_raises(monkeypatch):
    """get_hidden_columns 寮傚父鏃惰繑鍥?error锛宻ample_rows=[]"""
    async def raise_exc(*a, **kw):
        raise RuntimeError("masker unavailable")

    monkeypatch.setattr("app.warehouse.quality_engine.get_hidden_columns", raise_exc)

    result = await execute_quality_rule(
        _FakeSession(), 1, "table", "emp", "not_null",
        {"column": "name"}, user=object(),
    )
    assert result["status"] == "error"
    assert result["sample_rows"] == []
    assert result["message"] == "QUALITY_PERMISSION_MASKING_FAILED"


@pytest.mark.asyncio
async def test_fail_closed_get_sensitive_columns_raises(monkeypatch):
    """get_sensitive_columns 寮傚父鏃惰繑鍥?error锛宻ample_rows=[]"""
    async def noop(*a, **kw): return set()
    async def raise_exc(*a, **kw):
        raise RuntimeError("masker unavailable")

    monkeypatch.setattr("app.warehouse.quality_engine.get_hidden_columns", noop)
    monkeypatch.setattr("app.warehouse.quality_engine.get_sensitive_columns", raise_exc)

    result = await execute_quality_rule(
        _FakeSession(), 1, "table", "emp", "not_null",
        {"column": "name"}, user=object(),
    )
    assert result["status"] == "error"
    assert result["sample_rows"] == []
    assert result["message"] == "QUALITY_PERMISSION_MASKING_FAILED"


@pytest.mark.asyncio
async def test_fail_closed_no_user_skips_check(monkeypatch):
    """user=None 鏃惰烦杩囨潈闄愯鍓紝姝ｅ父鎵ц锛坔andler 鍐呴儴鍙兘鍥犳棤鏁版嵁鑰?pass锛?"""
    async def raise_exc(*a, **kw):
        raise RuntimeError("should not be called")

    monkeypatch.setattr("app.warehouse.quality_engine.get_hidden_columns", raise_exc)

    result = await execute_quality_rule(
        _FakeSession(), 1, "table", "emp", "not_null",
        {"column": "name"}, user=None,
    )
    # user=None 鏃朵笉璋冪敤 masker锛屾甯歌繘鍏?handler
    assert result["status"] in ("pass", "fail")


# ==================== Dependency quality state safety ====================

def test_sync_run_batch_order_rejects_stale_status_update():
    assert _is_older_batch("sync_run:41", "sync_run:42") is True
    assert _is_older_batch("sync_run:42", "sync_run:41") is False
    assert _is_older_batch("manual:table:202607", "sync_run:42") is False


def test_quality_run_out_includes_dependency_diagnostics():
    result = WarehouseQualityRunOut(
        id=1,
        status="fail",
        period="202607",
        source_sync_batch_id="sync_run:42",
        asset_type="relation",
        asset_id=251,
        severity="block",
        duplicate_key_count=1,
        missing_key_count=1,
        sample_key_hashes=[{"type": "duplicate", "key_hash": "masked"}],
    )
    assert result.period == "202607"
    assert result.duplicate_key_count == 1
    assert result.sample_key_hashes[0]["key_hash"] == "masked"


def test_quality_run_trigger_period_contract():
    assert QualityRunTriggerIn(period="202607").period == "202607"
    with pytest.raises(ValidationError):
        QualityRunTriggerIn(period="2026-07")


def _relation_state(asset_id, status, batch, checked_at):
    return SimpleNamespace(
        id=asset_id,
        asset_id=asset_id,
        status=status,
        severity="info",
        source_sync_batch_id=batch,
        checked_at=checked_at,
    )


def test_relation_state_aggregation_reuses_unaffected_latest_states():
    states = _select_relation_states(
        [251, 252],
        [
            _relation_state(251, "passed", "sync_run:41", datetime(2026, 8, 6, tzinfo=timezone.utc)),
            _relation_state(252, "warning", "sync_run:40", datetime(2026, 8, 5, tzinfo=timezone.utc)),
        ],
        "sync_run:42",
    )
    assert {key: value.status for key, value in states.items()} == {251: "passed", 252: "warning"}


def test_relation_state_aggregation_prefers_current_batch_and_keeps_pending_missing():
    states = _select_relation_states(
        [251, 252, 253],
        [
            _relation_state(251, "failed", "sync_run:41", datetime(2026, 8, 6, tzinfo=timezone.utc)),
            _relation_state(251, "passed", "sync_run:42", datetime(2026, 8, 7, tzinfo=timezone.utc)),
            _relation_state(252, "pending", "sync_run:42", datetime(2026, 8, 7, tzinfo=timezone.utc)),
        ],
        "sync_run:42",
    )
    assert states[251].status == "passed"
    assert states[252].status == "pending"
    assert 253 not in states


class _SqlResult:
    def scalar(self):
        return 0

    def fetchall(self):
        return []

    def keys(self):
        return []


class _RecordingSqlSession:
    def __init__(self):
        self.sql = []

    async def execute(self, statement, params=None):
        self.sql.append((str(statement), params or {}))
        return _SqlResult()


@pytest.mark.asyncio
async def test_basic_quality_rules_generate_postgresql_sql():
    session = _RecordingSqlSession()
    await _check_not_null(session, "employee_table", "employee_no", {}, set(), set())
    await _check_unique(session, "employee_table", "employee_no", {}, set(), set())
    await _check_enum(session, "employee_table", "status", {"values": ["鍚敤", "鍋滅敤"]}, set(), set())
    await _check_date_format(session, "employee_table", "pay_month", {"format": "%Y-%m-%d"}, set(), set())

    sql = "\n".join(statement for statement, _ in session.sql)
    assert chr(96) not in sql
    assert '"employee_table"' in sql
    assert '"employee_no"' in sql
    assert '"status"' in sql
    assert 'STR_TO_DATE' not in sql
    assert '!~ :pattern' in sql


@pytest.mark.asyncio
async def test_quality_status_upsert_uses_atomic_postgresql_conflict_clause():
    status_row = SimpleNamespace(status="passed")

    class Result:
        def __init__(self, row=None):
            self.row = row

        def scalar_one(self):
            return self.row

        def scalars(self):
            return SimpleNamespace(all=lambda: [])

    class Db:
        def __init__(self):
            self.statements = []

        async def execute(self, statement):
            self.statements.append(statement)
            return Result(status_row)

        async def flush(self):
            return None

    db = Db()
    result = await upsert_quality_status(
        db,
        asset_type="table",
        asset_code="employee_table",
        period="202607",
        status="passed",
        source_sync_batch_id="sync_run:42",
    )

    assert result is status_row
    sql = str(db.statements[0].compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT (asset_type, asset_key, period) DO UPDATE" in sql
    assert "source_sync_sequence" in sql


@pytest.mark.asyncio
async def test_quality_run_reserves_dedupe_key_before_scanning(monkeypatch):
    rule = SimpleNamespace(
        id=7,
        asset_type="table",
        asset_code="employee_table",
        rule_type="not_null",
        rule_config={"column": "employee_no"},
        severity="warn",
        last_run_status=None,
        last_run_at=None,
    )
    reserved_run = SimpleNamespace()
    status_row = SimpleNamespace(status="passed")

    class Result:
        def __init__(self, inserted_id=None, row=None):
            self.inserted_id = inserted_id
            self.row = row

        def scalar_one_or_none(self):
            return self.inserted_id

        def scalar_one(self):
            return self.row

        def scalars(self):
            return SimpleNamespace(all=lambda: [])

    class Db:
        def __init__(self):
            self.statements = []

        async def get(self, model, item_id):
            if model.__name__ == "WarehouseQualityRule":
                return rule
            return reserved_run

        async def execute(self, statement):
            self.statements.append(statement)
            if len(self.statements) == 1:
                return Result(inserted_id=101)
            return Result(row=status_row)

        async def flush(self):
            return None

        def add(self, item):
            raise AssertionError("reserved runs must not use ORM insert")

    engine_calls = 0

    async def execute_once(*args, **kwargs):
        nonlocal engine_calls
        engine_calls += 1
        return {"status": "pass", "checked_count": 1, "failed_count": 0, "sample_key_hashes": [], "message": "ok"}

    monkeypatch.setattr("app.warehouse.quality_service.execute_quality_rule", execute_once)
    db = Db()
    run, result = await run_quality_rule(
        db,
        7,
        source_sync_batch_id="sync_run:42",
        user=None,
    )

    assert run is reserved_run
    assert result["status"] == "pass"
    assert engine_calls == 1
    sql = str(db.statements[0].compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING" in sql
    assert "RETURNING warehouse_quality_runs.id" in sql
