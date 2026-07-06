# -*- coding: utf-8 -*-
"""数据质量 (Q03) 测试

覆盖: Schema 校验、规则类型枚举、隐藏字段/脱敏逻辑、非法输入 400
"""
import pytest
from datetime import datetime
from pydantic import ValidationError

from app.warehouse.schemas import (
    QUALITY_RULE_TYPES,
    QUALITY_SEVERITIES,
    EXECUTABLE_RULE_TYPES,
    WarehouseQualityRuleIn,
    WarehouseQualityRuleUpdateIn,
    WarehouseQualityRuleOut,
    WarehouseQualityRunOut,
    QualityRunTriggerOut,
    QualityAlertSummaryOut,
)
from app.warehouse.quality_engine import _row_to_dict, _safe_ident, execute_quality_rule


# ==================== _safe_ident ====================

def test_safe_ident_normal():
    assert _safe_ident("employees") == "`employees`"


def test_safe_ident_with_dash():
    result = _safe_ident("my-table")
    assert result.startswith("`")
    assert result.endswith("`")


def test_safe_ident_empty_raises():
    with pytest.raises(ValueError):
        _safe_ident("")


def test_safe_ident_special_chars():
    with pytest.raises(ValueError):
        _safe_ident("x; DROP TABLE users;")


# ==================== _row_to_dict (隐藏列 + 脱敏) ====================

def test_row_to_dict_basic():
    row = ("zhangsan", "IT")
    keys = ("name", "dept")
    d = _row_to_dict(row, keys)
    assert d["name"] == "zhangsan"
    assert d["dept"] == "IT"


def test_row_to_dict_filter_hidden():
    """隐藏列不出现在结果中"""
    row = ("zhangsan", "secret_val")
    keys = ("name", "salary")
    d = _row_to_dict(row, keys, hidden={"salary"})
    assert "name" in d
    assert "salary" not in d


def test_row_to_dict_mask_sensitive():
    """脱敏列值替换为 ******"""
    row = ("zhangsan", "123456")
    keys = ("name", "id_card")
    d = _row_to_dict(row, keys, sensitive={"id_card"})
    assert d["name"] == "zhangsan"
    assert d["id_card"] == "******"


def test_row_to_dict_hidden_and_sensitive():
    """隐藏列过滤 + 脱敏列掩码同时生效"""
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
    """rule_type 为纯 str，schema 不做枚举校验（由 router 层 _validate_rule_type 处理）"""
    r = WarehouseQualityRuleIn(
        asset_type="table", asset_code="emp",
        rule_type="not_null", rule_config={"column": "x"},
    )
    assert r.rule_type == "not_null"


def test_rule_in_severity_default():
    """severity 默认 warn"""
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


# ==================== R2: fail-closed 回归 ====================


class _FakeSession:
    """最小 FakeSession，只用于触发 execute_quality_rule 的 fail-closed 路径"""
    async def execute(self, *args, **kwargs):
        return self
    def scalar(self): return 0
    def scalars(self): return type('_', (), {'all': lambda: [], 'first': lambda: None})()
    def fetchall(self): return []


@pytest.mark.asyncio
async def test_fail_closed_get_hidden_columns_raises(monkeypatch):
    """get_hidden_columns 异常时返回 error，sample_rows=[]"""
    async def raise_exc(*a, **kw):
        raise RuntimeError("masker unavailable")

    monkeypatch.setattr("app.warehouse.quality_engine.get_hidden_columns", raise_exc)

    result = await execute_quality_rule(
        _FakeSession(), 1, "table", "emp", "not_null",
        {"column": "name"}, user=object(),
    )
    assert result["status"] == "error"
    assert result["sample_rows"] == []
    assert "get_hidden_columns" in result["message"]


@pytest.mark.asyncio
async def test_fail_closed_get_sensitive_columns_raises(monkeypatch):
    """get_sensitive_columns 异常时返回 error，sample_rows=[]"""
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
    assert "get_sensitive_columns" in result["message"]


@pytest.mark.asyncio
async def test_fail_closed_no_user_skips_check(monkeypatch):
    """user=None 时跳过权限裁剪，正常执行（handler 内部可能因无数据而 pass）"""
    async def raise_exc(*a, **kw):
        raise RuntimeError("should not be called")

    monkeypatch.setattr("app.warehouse.quality_engine.get_hidden_columns", raise_exc)

    result = await execute_quality_rule(
        _FakeSession(), 1, "table", "emp", "not_null",
        {"column": "name"}, user=None,
    )
    # user=None 时不调用 masker，正常进入 handler
    assert result["status"] in ("pass", "fail")
