# -*- coding: utf-8 -*-
"""标准化规则执行引擎测试 (R0104 + R0105)

覆盖: 全部 8 类规则正常转换和异常输入

运行: pytest tests/test_standardization_engine.py -v
"""
import pytest

from app.warehouse.standardization_engine import (
    execute_rules,
    execute_single_rule,
    _apply_rename,
    _apply_type_convert,
    _apply_value_map,
    _apply_unit_convert,
    _apply_split_merge,
    _apply_deduplicate,
    _apply_null_handling,
    _apply_format_standardize,
    _format_date, _parse_date, _build_date,
    _coerce,
    RULE_ORDER,
    RULE_EXECUTORS,
    SET_LEVEL_RULES,
)


# ==================== Fake Rule ====================

class FakeRule:
    """模拟 StandardizationRule ORM 对象"""
    def __init__(self, rule_type, source_field, target_field,
                 rule_config=None, enabled=True, display_order=0):
        self.rule_type = rule_type
        self.source_field = source_field
        self.target_field = target_field
        self.rule_config = rule_config or {}
        self.enabled = enabled
        self.display_order = display_order


# ==================== RULE_ORDER ====================

def test_rule_order_has_5_r0104_types():
    assert RULE_ORDER["rename"] == 0
    assert RULE_ORDER["type_convert"] == 1
    assert RULE_ORDER["value_map"] == 2
    assert RULE_ORDER["unit_convert"] == 3
    assert RULE_ORDER["split_merge"] == 4


def test_rule_executors_registered():
    for rt in ("rename", "type_convert", "value_map", "unit_convert", "split_merge"):
        assert rt in RULE_EXECUTORS
        assert callable(RULE_EXECUTORS[rt])


# ==================== _coerce ====================

def test_coerce_int():
    assert _coerce("123", "int") == 123
    assert _coerce(456, "int") == 456
    assert _coerce("12.9", "int") == 12  # float中间态
    assert _coerce(3.14, "int") == 3


def test_coerce_float():
    assert _coerce("3.14", "float") == 3.14
    assert _coerce(5, "float") == 5.0


def test_coerce_string():
    assert _coerce(123, "string") == "123"


def test_coerce_bool():
    assert _coerce("true", "bool") is True
    assert _coerce("1", "bool") is True
    assert _coerce("false", "bool") is False
    assert _coerce("0", "bool") is False
    assert _coerce(1, "bool") is True
    assert _coerce(0, "bool") is False


# ==================== _apply_rename ====================

def test_rename_simple():
    rule = FakeRule("rename", "emp_status", "emp_status_std")
    row = {"emp_status": "A", "name": "Alice"}
    _apply_rename(row, rule, "emp_status", "emp_status_std")
    assert "emp_status" not in row
    assert row["emp_status_std"] == "A"
    assert row["name"] == "Alice"


def test_rename_same_name_noop():
    rule = FakeRule("rename", "name", "name")
    row = {"name": "Bob"}
    _apply_rename(row, rule, "name", "name")
    assert row["name"] == "Bob"


def test_rename_missing_field_noop():
    rule = FakeRule("rename", "missing", "new_name")
    row = {"name": "Bob"}
    _apply_rename(row, rule, "missing", "new_name")
    assert row["name"] == "Bob"
    assert "new_name" not in row


# ==================== _apply_type_convert ====================

def test_type_convert_str_to_int():
    rule = FakeRule("type_convert", "age", "age",
                    {"target_type": "int"})
    row = {"age": "25"}
    _apply_type_convert(row, rule, "age", "age")
    assert row["age"] == 25


def test_type_convert_str_to_float():
    rule = FakeRule("type_convert", "score", "score",
                    {"target_type": "float"})
    row = {"score": "88.5"}
    _apply_type_convert(row, rule, "score", "score")
    assert row["score"] == 88.5


def test_type_convert_null_value():
    rule = FakeRule("type_convert", "age", "age",
                    {"target_type": "int"})
    row = {"age": None}
    _apply_type_convert(row, rule, "age", "age")
    assert row["age"] is None


def test_type_convert_invalid_set_null():
    rule = FakeRule("type_convert", "age", "age",
                    {"target_type": "int", "on_error": "set_null"})
    row = {"age": "not_a_number"}
    _apply_type_convert(row, rule, "age", "age")
    assert row["age"] is None


def test_type_convert_invalid_keep():
    rule = FakeRule("type_convert", "age", "age",
                    {"target_type": "int", "on_error": "keep"})
    row = {"age": "not_a_number"}
    _apply_type_convert(row, rule, "age", "age")
    assert row["age"] == "not_a_number"


def test_type_convert_invalid_mark():
    rule = FakeRule("type_convert", "age", "age",
                    {"target_type": "int", "on_error": "mark"})
    row = {"age": "not_a_number"}
    _apply_type_convert(row, rule, "age", "age")
    assert row["age"] is None
    assert row["age_type_error"] is True


# ==================== _apply_value_map ====================

def test_value_map_basic():
    rule = FakeRule("value_map", "status", "status_label",
                    {"mappings": {"A": "在职", "B": "离职"}})
    row = {"status": "A"}
    _apply_value_map(row, rule, "status", "status_label")
    assert row["status_label"] == "在职"


def test_value_map_unmapped_keep():
    rule = FakeRule("value_map", "status", "status_label",
                    {"mappings": {"A": "在职"}, "unmapped": "keep"})
    row = {"status": "C"}
    _apply_value_map(row, rule, "status", "status_label")
    assert row["status_label"] == "C"


def test_value_map_unmapped_set_null():
    rule = FakeRule("value_map", "status", "status_label",
                    {"mappings": {"A": "在职"}, "unmapped": "set_null"})
    row = {"status": "X"}
    _apply_value_map(row, rule, "status", "status_label")
    assert row["status_label"] is None


def test_value_map_unmapped_flag():
    rule = FakeRule("value_map", "status", "status_label",
                    {"mappings": {"A": "在职"}, "unmapped": "flag"})
    row = {"status": "X"}
    _apply_value_map(row, rule, "status", "status_label")
    assert row["status_label"] is None
    assert row["status_label_unmapped"] is True


def test_value_map_null():
    rule = FakeRule("value_map", "status", "status_label",
                    {"mappings": {"A": "在职"}})
    row = {"status": None}
    _apply_value_map(row, rule, "status", "status_label")
    assert row["status_label"] is None


def test_value_map_int_key():
    """数字值匹配到字符串 key"""
    rule = FakeRule("value_map", "code", "code_label",
                    {"mappings": {"1": "启用", "0": "禁用"}})
    row = {"code": 1}
    _apply_value_map(row, rule, "code", "code_label")
    assert row["code_label"] == "启用"


# ==================== _apply_unit_convert ====================

def test_unit_convert_basic():
    rule = FakeRule("unit_convert", "amount_fen", "amount_yuan",
                    {"multiplier": 0.01})
    row = {"amount_fen": 5000}
    _apply_unit_convert(row, rule, "amount_fen", "amount_yuan")
    assert row["amount_yuan"] == 50.0


def test_unit_convert_decimal_places():
    rule = FakeRule("unit_convert", "rate", "rate_pct",
                    {"multiplier": 100.0, "decimal_places": 1})
    row = {"rate": 0.0567}
    _apply_unit_convert(row, rule, "rate", "rate_pct")
    assert row["rate_pct"] == 5.7


def test_unit_convert_null():
    rule = FakeRule("unit_convert", "amount", "amount_cvt",
                    {"multiplier": 0.01})
    row = {"amount": None}
    _apply_unit_convert(row, rule, "amount", "amount_cvt")
    assert row["amount_cvt"] is None


def test_unit_convert_invalid():
    rule = FakeRule("unit_convert", "amount", "amount_cvt",
                    {"multiplier": 0.01})
    row = {"amount": "N/A"}
    _apply_unit_convert(row, rule, "amount", "amount_cvt")
    assert row["amount_cvt"] is None


# ==================== _apply_split_merge ====================

def test_split():
    rule = FakeRule("split_merge", "full_name", "",
                    {"action": "split", "delimiter": " ",
                     "target_fields": ["first_name", "last_name"]})
    row = {"full_name": "三 张"}
    _apply_split_merge(row, rule, "full_name", "")
    assert row["first_name"] == "三"
    assert row["last_name"] == "张"


def test_split_trim():
    rule = FakeRule("split_merge", "tags", "",
                    {"action": "split", "delimiter": ",",
                     "target_fields": ["tag1", "tag2", "tag3"]})
    row = {"tags": " a , b , c "}
    _apply_split_merge(row, rule, "tags", "")
    assert row["tag1"] == "a"
    assert row["tag2"] == "b"
    assert row["tag3"] == "c"


def test_split_fewer_parts():
    rule = FakeRule("split_merge", "name", "",
                    {"action": "split", "delimiter": ",",
                     "target_fields": ["a", "b", "c"]})
    row = {"name": "x,y"}
    _apply_split_merge(row, rule, "name", "")
    assert row["a"] == "x"
    assert row["b"] == "y"
    assert row["c"] is None


def test_merge():
    rule = FakeRule("split_merge", "", "full_name",
                    {"action": "merge", "sources": ["first_name", "last_name"],
                     "delimiter": ""})
    row = {"first_name": "张", "last_name": "三"}
    _apply_split_merge(row, rule, "", "full_name")
    assert row["full_name"] == "张三"


def test_merge_with_delimiter():
    rule = FakeRule("split_merge", "", "path",
                    {"action": "merge", "sources": ["dept", "team", "group"],
                     "delimiter": "/"})
    row = {"dept": "IT", "team": "Dev", "group": "A"}
    _apply_split_merge(row, rule, "", "path")
    assert row["path"] == "IT/Dev/A"


# ==================== execute_rules (批量管道) ====================

def test_execute_multiple_rules_in_order():
    """验证 rename → type_convert → value_map 顺序执行"""
    rules = [
        FakeRule("rename", "s", "status", display_order=0),
        FakeRule("type_convert", "code", "code", {"target_type": "int"}, display_order=0),
        FakeRule("value_map", "status", "status_label", {"mappings": {"A": "在职"}}, display_order=0),
    ]
    rows = [
        {"s": "A", "code": "100", "name": "Alice"},
        {"s": "B", "code": "200", "name": "Bob"},
    ]
    result = execute_rules(rules, rows)

    # rename 生效: "s" → "status"
    assert "s" not in result[0]
    assert result[0]["status"] == "A"
    # type_convert 生效
    assert result[0]["code"] == 100
    assert result[1]["code"] == 200
    # value_map 生效 (基于重命名后的字段)
    assert result[0]["status_label"] == "在职"


def test_execute_ods_data_not_modified():
    """原始 ODS 数据不被修改"""
    rules = [
        FakeRule("rename", "old_name", "new_name"),
    ]
    ods_rows = [{"old_name": "value", "x": 1}]
    original = [dict(r) for r in ods_rows]
    result = execute_rules(rules, ods_rows)

    # 原始数据不变
    assert ods_rows == original
    # 结果数据已修改
    assert result[0]["new_name"] == "value"
    assert "old_name" not in result[0]


def test_execute_empty_rules():
    rows = [{"a": 1}]
    result = execute_rules([], rows)
    assert result[0] == {"a": 1}
    assert result is not rows  # 是拷贝


def test_execute_disabled_rule_skipped():
    rules = [
        FakeRule("rename", "a", "b", enabled=False),
    ]
    rows = [{"a": 1}]
    result = execute_rules(rules, rows)
    assert result[0]["a"] == 1
    assert "b" not in result[0]


def test_execute_rename_then_other_refers_old_name():
    """重命名后，后续规则 source_field 引用原始名也能找到"""
    rules = [
        FakeRule("rename", "emp_status", "emp_status_std", display_order=0),
        FakeRule("value_map", "emp_status", "emp_status_label",
                 {"mappings": {"A": "在职"}}, display_order=1),
    ]
    rows = [{"emp_status": "A"}]
    result = execute_rules(rules, rows)
    assert result[0]["emp_status_std"] == "A"
    assert result[0]["emp_status_label"] == "在职"


def test_execute_sort_by_order():
    """display_order 小的先执行"""
    rules = [
        FakeRule("value_map", "v", "v_label", {"mappings": {"10": "十"}}, display_order=10),
        FakeRule("type_convert", "v", "v", {"target_type": "int"}, display_order=1),
    ]
    rows = [{"v": "10"}]
    result = execute_rules(rules, rows)
    assert result[0]["v"] == 10
    assert result[0]["v_label"] == "十"


# ==================== execute_single_rule ====================

def test_single_rule_does_not_modify_original():
    rule = FakeRule("rename", "x", "y")
    row = {"x": 1}
    result = execute_single_rule(rule, row)
    assert row["x"] == 1  # 原数据不变
    assert result["y"] == 1


def test_single_rule_disabled():
    rule = FakeRule("rename", "x", "y", enabled=False)
    result = execute_single_rule(rule, {"x": 1})
    assert result["x"] == 1


# ==================== 全链路组合 ====================

def test_full_pipeline():
    """模拟完整 ODS→DWD 链路：rename + type_convert + value_map + unit_convert"""
    rules = [
        FakeRule("rename", "salary_raw", "salary", display_order=0),
        FakeRule("type_convert", "salary", "salary", {"target_type": "float"}, display_order=1),
        FakeRule("unit_convert", "salary", "salary_k", {"multiplier": 0.001}, display_order=2),
        FakeRule("value_map", "level", "level_cn", {"mappings": {"P1": "初级", "P2": "中级"}}, display_order=3),
    ]
    rows = [
        {"salary_raw": "50000", "level": "P1", "name": "Alice"},
        {"salary_raw": "80000", "level": "P2", "name": "Bob"},
    ]
    result = execute_rules(rules, rows)

    assert result[0]["salary"] == 50000.0
    assert result[0]["salary_k"] == 50.0
    assert result[0]["level_cn"] == "初级"
    assert "salary_raw" not in result[0]

    assert result[1]["salary"] == 80000.0
    assert result[1]["salary_k"] == 80.0
    assert result[1]["level_cn"] == "中级"


# ==================== R0105: deduplicate ====================

def test_deduplicate_first():
    rule = FakeRule("deduplicate", "", "",
                    {"by": ["emp_id"], "keep": "first"})
    rows = [
        {"emp_id": "001", "name": "Alice"},
        {"emp_id": "002", "name": "Bob"},
        {"emp_id": "001", "name": "Alice_Dup"},
    ]
    result = _apply_deduplicate(rows, rule, "", "")
    assert len(result) == 2
    assert result[0]["name"] == "Alice"
    assert result[1]["name"] == "Bob"


def test_deduplicate_last():
    rule = FakeRule("deduplicate", "", "",
                    {"by": ["emp_id"], "keep": "last"})
    rows = [
        {"emp_id": "001", "name": "Alice"},
        {"emp_id": "001", "name": "Alice_Updated"},
    ]
    result = _apply_deduplicate(rows, rule, "", "")
    assert len(result) == 1
    assert result[0]["name"] == "Alice_Updated"


def test_deduplicate_multi_key():
    rule = FakeRule("deduplicate", "", "",
                    {"by": ["emp_id", "period"], "keep": "first"})
    rows = [
        {"emp_id": "001", "period": "2026Q1", "val": 100},
        {"emp_id": "001", "period": "2026Q2", "val": 200},
        {"emp_id": "001", "period": "2026Q1", "val": 999},
    ]
    result = _apply_deduplicate(rows, rule, "", "")
    assert len(result) == 2
    assert result[0]["val"] == 100


def test_deduplicate_no_by_field():
    rule = FakeRule("deduplicate", "", "", {"by": [], "keep": "first"})
    rows = [{"a": 1}, {"a": 1}]
    result = _apply_deduplicate(rows, rule, "", "")
    assert len(result) == 2  # no by → no dedup


def test_deduplicate_in_pipeline():
    """execute_rules 正确处理集合级 deduplicate"""
    rules = [
        FakeRule("deduplicate", "", "", {"by": ["id"], "keep": "first"}),
    ]
    rows = [{"id": "1", "v": "a"}, {"id": "2", "v": "b"}, {"id": "1", "v": "dup"}]
    result = execute_rules(rules, rows)
    assert len(result) == 2


# ==================== R0105: null_handling ====================

def test_null_fill_default():
    rule = FakeRule("null_handling", "name", "name",
                    {"strategy": "fill_default", "default": "未知"})
    row = {"name": None}
    _apply_null_handling(row, rule, "name", "name")
    assert row["name"] == "未知"


def test_null_fill_empty_string():
    rule = FakeRule("null_handling", "desc", "desc",
                    {"strategy": "fill_default", "default": "—"})
    row = {"desc": ""}
    _apply_null_handling(row, rule, "desc", "desc")
    assert row["desc"] == "—"


def test_null_no_fill_on_value():
    rule = FakeRule("null_handling", "name", "name",
                    {"strategy": "fill_default", "default": "未知"})
    row = {"name": "Alice"}
    _apply_null_handling(row, rule, "name", "name")
    assert row["name"] == "Alice"


def test_null_fill_upstream():
    rule = FakeRule("null_handling", "dept_name", "dept_name",
                    {"strategy": "fill_upstream", "upstream_field": "parent_name"})
    row = {"dept_name": None, "parent_name": "总公司"}
    _apply_null_handling(row, rule, "dept_name", "dept_name")
    assert row["dept_name"] == "总公司"


def test_null_flag():
    rule = FakeRule("null_handling", "phone", "phone",
                    {"strategy": "flag"})
    row = {"phone": None}
    _apply_null_handling(row, rule, "phone", "phone")
    assert row["phone_is_null"] is True


def test_null_drop_row():
    """drop_row 策略：execute_rules 丢弃空值行"""
    rules = [
        FakeRule("null_handling", "email", "email",
                 {"strategy": "drop_row"}),
    ]
    rows = [
        {"email": "a@test.com", "name": "Alice"},
        {"email": None, "name": "Bob"},
        {"email": "", "name": "Charlie"},
        {"email": "c@test.com", "name": "David"},
    ]
    result = execute_rules(rules, rows)
    assert len(result) == 2
    assert result[0]["name"] == "Alice"
    assert result[1]["name"] == "David"


# ==================== R0105: format_standardize ====================

def test_format_lower():
    rule = FakeRule("format_standardize", "code", "code",
                    {"format": "lower"})
    row = {"code": "ABC"}
    _apply_format_standardize(row, rule, "code", "code")
    assert row["code"] == "abc"


def test_format_upper():
    rule = FakeRule("format_standardize", "code", "code",
                    {"format": "upper"})
    row = {"code": "abc"}
    _apply_format_standardize(row, rule, "code", "code")
    assert row["code"] == "ABC"


def test_format_trim():
    rule = FakeRule("format_standardize", "name", "name",
                    {"format": "trim"})
    row = {"name": "  张 三  "}
    _apply_format_standardize(row, rule, "name", "name")
    assert row["name"] == "张 三"


def test_format_truncate():
    rule = FakeRule("format_standardize", "text", "text",
                    {"format": "truncate", "max_length": 5})
    row = {"text": "Hello World"}
    _apply_format_standardize(row, rule, "text", "text")
    assert row["text"] == "Hello"


def test_format_pad_left():
    rule = FakeRule("format_standardize", "id", "id",
                    {"format": "pad", "length": 5, "pad_char": "0", "side": "left"})
    row = {"id": "42"}
    _apply_format_standardize(row, rule, "id", "id")
    assert row["id"] == "00042"


def test_format_pad_right():
    rule = FakeRule("format_standardize", "code", "code",
                    {"format": "pad", "length": 6, "pad_char": " ", "side": "right"})
    row = {"code": "AB"}
    _apply_format_standardize(row, rule, "code", "code")
    assert row["code"] == "AB    "


def test_format_regex():
    rule = FakeRule("format_standardize", "phone", "phone",
                    {"format": "regex", "pattern": "[^0-9]", "replacement": ""})
    row = {"phone": "138-1234-5678"}
    _apply_format_standardize(row, rule, "phone", "phone")
    assert row["phone"] == "13812345678"


def test_format_null_value():
    rule = FakeRule("format_standardize", "field", "field",
                    {"format": "trim"})
    row = {"field": None}
    _apply_format_standardize(row, rule, "field", "field")
    assert row["field"] is None


# ==================== R0105: 日期格式 ====================

def test_parse_date_yyyymmdd():
    assert _parse_date("20260115", "yyyyMMdd") == (2026, 1, 15)


def test_parse_date_yyyy_mm_dd():
    assert _parse_date("2026-01-15", "yyyy-MM-dd") == (2026, 1, 15)


def test_parse_date_yyyy():
    assert _parse_date("2026", "yyyy") == (2026, 1, 1)


def test_parse_date_invalid():
    assert _parse_date("abc", "yyyyMMdd") is None
    assert _parse_date("", "yyyyMMdd") is None


def test_build_date():
    assert _build_date("yyyy-MM-dd", 2026, 1, 15) == "2026-01-15"
    assert _build_date("yyyyMMdd", 2026, 12, 1) == "20261201"
    assert _build_date("yyyy/MM/dd", 2026, 3, 5) == "2026/03/05"


def test_format_date_convert():
    rule = FakeRule("format_standardize", "birth", "birth",
                    {"format": "date", "from_format": "yyyyMMdd",
                     "to_format": "yyyy-MM-dd"})
    row = {"birth": "19900325"}
    _apply_format_standardize(row, rule, "birth", "birth")
    assert row["birth"] == "1990-03-25"


def test_format_date_invalid_keep():
    rule = FakeRule("format_standardize", "birth", "birth",
                    {"format": "date", "from_format": "yyyyMMdd",
                     "to_format": "yyyy-MM-dd"})
    row = {"birth": "INVALID"}
    _apply_format_standardize(row, rule, "birth", "birth")
    assert row["birth"] == "INVALID"  # 保持原值


# ==================== R0105: SET_LEVEL_RULES ====================

def test_set_level_rules():
    assert "deduplicate" in SET_LEVEL_RULES
    assert "rename" not in SET_LEVEL_RULES


# ==================== R0105: 全 8 类注册 ====================

def test_all_8_executors_registered():
    all_types = ("rename", "type_convert", "value_map", "unit_convert",
                 "split_merge", "deduplicate", "null_handling", "format_standardize")
    for rt in all_types:
        assert rt in RULE_EXECUTORS, f"{rt} not registered"


# ==================== R0105: 全链路+清洗 ====================

def test_full_pipeline_with_cleaning():
    """8 类规则全链路：结构转换 + 清洗"""
    rules = [
        FakeRule("rename", "s", "status", display_order=0),
        FakeRule("type_convert", "age_str", "age", {"target_type": "int"}, display_order=1),
        FakeRule("value_map", "status", "status_cn", {"mappings": {"A": "在职"}}, display_order=2),
        FakeRule("format_standardize", "name", "name", {"format": "trim"}, display_order=3),
        FakeRule("null_handling", "status_cn", "status_cn",
                 {"strategy": "fill_default", "default": "未知"}, display_order=4),
        FakeRule("deduplicate", "", "", {"by": ["id"], "keep": "first"}, display_order=5),
    ]
    rows = [
        {"id": "1", "s": "A", "age_str": "30", "name": " Alice "},
        {"id": "2", "s": None, "age_str": "25", "name": "Bob"},
        {"id": "1", "s": "A", "age_str": "31", "name": "Alice Dup"},
    ]
    result = execute_rules(rules, rows)

    assert len(result) == 2  # id=1 去重后只剩一条
    assert result[0]["age"] == 30
    assert result[0]["name"] == "Alice"
    assert result[0]["status_cn"] == "在职"
    assert result[1]["status_cn"] == "未知"  # null → 默认值
