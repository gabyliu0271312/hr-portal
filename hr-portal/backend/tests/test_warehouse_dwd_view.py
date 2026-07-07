# -*- coding: utf-8 -*-
"""DWD 视图生成 测试 (R0108)

覆盖: SQL 表达式生成（全部 8 类规则）、Schema 校验、视图定义结构
运行: pytest tests/test_warehouse_dwd_view.py -v
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import (
    DwdViewGenerateRequest,
    DwdViewGenerateOut,
)
from app.warehouse.service import _rule_to_sql_expr, _quote_ident


# ==================== _quote_ident ====================

def test_quote_normal():
    assert _quote_ident("employees") == "`employees`"


# ==================== _rule_to_sql_expr ====================

class FakeRule:
    def __init__(self, rule_type, source_field, target_field, rule_config=None):
        self.rule_type = rule_type
        self.source_field = source_field
        self.target_field = target_field
        self.rule_config = rule_config or {}


def test_sql_rename():
    r = FakeRule("rename", "emp_status", "emp_status_std")
    sql = _rule_to_sql_expr(r, "emp_status", "emp_status_std")
    assert "AS `emp_status_std`" in sql
    assert "t.`emp_status`" in sql


def test_sql_type_convert():
    r = FakeRule("type_convert", "age", "age",
                 {"target_type": "int"})
    sql = _rule_to_sql_expr(r, "age", "age")
    assert "CAST" in sql
    assert "SIGNED INTEGER" in sql


def test_sql_type_convert_float():
    r = FakeRule("type_convert", "score", "score",
                 {"target_type": "float"})
    sql = _rule_to_sql_expr(r, "score", "score")
    assert "DECIMAL" in sql


def test_sql_value_map():
    r = FakeRule("value_map", "status", "status_label",
                 {"mappings": {"A": "在职", "B": "离职"}})
    sql = _rule_to_sql_expr(r, "status", "status_label")
    assert "CASE" in sql
    assert "WHEN 'A' THEN '在职'" in sql
    assert "WHEN 'B' THEN '离职'" in sql


def test_sql_value_map_unmapped_keep():
    r = FakeRule("value_map", "x", "y",
                 {"mappings": {"1": "一"}, "unmapped": "keep"})
    sql = _rule_to_sql_expr(r, "x", "y")
    assert "ELSE t.`x`" in sql


def test_sql_value_map_unmapped_null():
    r = FakeRule("value_map", "x", "y",
                 {"mappings": {"1": "一"}, "unmapped": "set_null"})
    sql = _rule_to_sql_expr(r, "x", "y")
    assert "ELSE NULL" in sql


def test_sql_unit_convert():
    r = FakeRule("unit_convert", "amount", "amount_yuan",
                 {"multiplier": 0.01})
    sql = _rule_to_sql_expr(r, "amount", "amount_yuan")
    assert "* 0.01" in sql


def test_sql_merge():
    r = FakeRule("split_merge", "", "full_name",
                 {"action": "merge", "sources": ["first", "last"], "delimiter": ""})
    sql = _rule_to_sql_expr(r, "", "full_name")
    assert "CONCAT_WS" in sql


def test_sql_null_fill_default():
    r = FakeRule("null_handling", "dept", "dept",
                 {"strategy": "fill_default", "default": "未知"})
    sql = _rule_to_sql_expr(r, "dept", "dept")
    assert "COALESCE" in sql
    assert "未知" in sql


def test_sql_format_lower():
    r = FakeRule("format_standardize", "code", "code",
                 {"format": "lower"})
    sql = _rule_to_sql_expr(r, "code", "code")
    assert "LOWER" in sql


def test_sql_format_upper():
    r = FakeRule("format_standardize", "code", "code",
                 {"format": "upper"})
    sql = _rule_to_sql_expr(r, "code", "code")
    assert "UPPER" in sql


def test_sql_format_trim():
    r = FakeRule("format_standardize", "name", "name",
                 {"format": "trim"})
    sql = _rule_to_sql_expr(r, "name", "name")
    assert "TRIM" in sql


def test_sql_format_truncate():
    r = FakeRule("format_standardize", "text", "text",
                 {"format": "truncate", "max_length": 10})
    sql = _rule_to_sql_expr(r, "text", "text")
    assert "LEFT" in sql
    assert "10" in sql


def test_sql_format_pad_left():
    r = FakeRule("format_standardize", "id", "id",
                 {"format": "pad", "length": 5, "pad_char": "0", "side": "left"})
    sql = _rule_to_sql_expr(r, "id", "id")
    assert "LPAD" in sql


def test_sql_format_pad_right():
    r = FakeRule("format_standardize", "code", "code",
                 {"format": "pad", "length": 6, "pad_char": " ", "side": "right"})
    sql = _rule_to_sql_expr(r, "code", "code")
    assert "RPAD" in sql


def test_sql_format_regex():
    r = FakeRule("format_standardize", "phone", "phone",
                 {"format": "regex", "pattern": "[^0-9]", "replacement": ""})
    sql = _rule_to_sql_expr(r, "phone", "phone")
    assert "REGEXP_REPLACE" in sql


def test_sql_format_date():
    r = FakeRule("format_standardize", "birth", "birth",
                 {"format": "date", "from_format": "yyyyMMdd", "to_format": "yyyy-MM-dd"})
    sql = _rule_to_sql_expr(r, "birth", "birth")
    assert "STR_TO_DATE" in sql


def test_sql_deduplicate():
    r = FakeRule("deduplicate", "id", "")
    sql = _rule_to_sql_expr(r, "id", "")
    assert "deduplicate" in sql.lower()


# ==================== DwdViewGenerateRequest ====================

def test_request_basic():
    r = DwdViewGenerateRequest(asset_code="ods_emp")
    assert r.asset_code == "ods_emp"
    assert r.asset_type == "table"


def test_request_missing_asset_code():
    with pytest.raises(ValidationError):
        DwdViewGenerateRequest()


# ==================== DwdViewGenerateOut ====================

def test_out_structure():
    o = DwdViewGenerateOut(
        dataset_id=1,
        dataset_name="dwd_ods_emp",
        version=1,
        view_sql="CREATE VIEW ...",
        output_fields_count=12,
        rules_count=5,
    )
    assert o.dataset_id == 1
    assert o.warehouse_layer == "DWD"
    assert o.version == 1
    assert o.output_fields_count == 12
    assert o.rules_count == 5


# ==================== 全 8 类 SQL 生成器覆盖 ====================

def test_all_8_types_produce_sql():
    """全部 8 类规则都能生成非空 SQL 表达式"""
    configs = {
        "rename": {},
        "type_convert": {"target_type": "int"},
        "value_map": {"mappings": {"x": "y"}},
        "unit_convert": {"multiplier": 0.01},
        "split_merge": {"action": "merge", "sources": ["a"], "delimiter": ""},
        "deduplicate": {},
        "null_handling": {"strategy": "fill_default", "default": "N/A"},
        "format_standardize": {"format": "trim"},
    }
    for rt, cfg in configs.items():
        r = FakeRule(rt, "f", "f_std", cfg)
        sql = _rule_to_sql_expr(r, "f", "f_std")
        assert sql, f"{rt} returned empty SQL"
        assert "f" in sql, f"{rt} missing field reference"
