# -*- coding: utf-8 -*-
"""Track B 列实例测试

覆盖：
- _normalize_columns 校验
- 旧 string[] 兼容
- ColumnInstance 格式
- 前缀不匹配/重复ID/非法格式校验
"""
import pytest
from pydantic import ValidationError

from app.reports.router import _normalize_columns, ColumnInstance, ReportConfig


# ==================== _normalize_columns ====================

def test_normalize_string_list():
    """旧 string[] → ColumnInstance[]"""
    result = _normalize_columns(["emp.count", "dept.name"])
    assert len(result) == 2
    assert result[0].source_code == "emp.count"
    assert result[0].instance_id == "emp.count"
    assert result[1].source_code == "dept.name"


def test_normalize_column_instance_dict():
    """ColumnInstance dict → ColumnInstance"""
    result = _normalize_columns([
        {"source_code": "emp.count", "instance_id": "emp.count"},
        {"source_code": "emp.count", "instance_id": "emp.count#2", "label": "员工数 (2)"},
    ])
    assert len(result) == 2
    assert result[1].instance_id == "emp.count#2"


def test_normalize_mixed():
    """混合格式"""
    result = _normalize_columns(["emp.count", {"source_code": "emp.count", "instance_id": "emp.count#2"}])
    assert len(result) == 2


def test_report_config_normalizes_legacy_strings_to_instances():
    config = ReportConfig(columns=["emp.count"])
    assert config.columns == [ColumnInstance(source_code="emp.count", instance_id="emp.count")]


def test_report_config_rejects_invalid_instance_id():
    with pytest.raises(ValidationError, match="instance_id"):
        ReportConfig(columns=[{"source_code": "emp.count", "instance_id": "other.count#2"}])


def test_report_config_rejects_stale_output_instance_reference():
    config = ReportConfig(
        columns=[
            {"source_code": "emp.count", "instance_id": "emp.count"},
            {"source_code": "emp.count", "instance_id": "emp.count#2"},
        ],
        sorts=[{"column": "emp.count#3", "order": "asc"}],
    )
    with pytest.raises(ValueError, match="sorts.column"):
        config.validate_config_references()


def test_report_config_rejects_instance_id_in_filter():
    config = ReportConfig(
        columns=[
            {"source_code": "emp.count", "instance_id": "emp.count"},
            {"source_code": "emp.count", "instance_id": "emp.count#2"},
        ],
        filters=[{"column": "emp.count#2", "op": "eq", "value": 1}],
    )
    with pytest.raises(ValueError, match="filters.column"):
        config.validate_config_references()


# ==================== 校验 ====================

def test_reject_duplicate_instance_id():
    """重复 instance_id → ValueError"""
    with pytest.raises(ValueError, match="instance_id 重复"):
        _normalize_columns(["emp.count", "emp.count"])


def test_reject_duplicate_instance_id_dict():
    with pytest.raises(ValueError, match="instance_id 重复"):
        _normalize_columns([
            {"source_code": "emp.count", "instance_id": "emp.count#2"},
            {"source_code": "emp.count", "instance_id": "emp.count#2"},
        ])


def test_reject_prefix_mismatch():
    """instance_id 前缀不匹配 source_code → ValueError"""
    with pytest.raises(ValueError, match="前缀必须匹配"):
        _normalize_columns([
            {"source_code": "emp.count", "instance_id": "other.code#2"},
        ])


def test_reject_bad_suffix():
    """instance_id 后缀不是 N>=2 → ValueError"""
    with pytest.raises(ValueError, match="格式非法"):
        _normalize_columns([
            {"source_code": "emp.count", "instance_id": "emp.count#1"},
        ])


def test_reject_bad_instance_id_no_hash_no_match():
    """instance_id 不等于 source_code 也不是 source_code#N → ValueError"""
    with pytest.raises(ValueError, match="必须等于 source_code"):
        _normalize_columns([
            {"source_code": "emp.count", "instance_id": "spoofed"},
        ])


def test_reject_unsupported_type():
    """不支持的类型 → ValueError"""
    with pytest.raises(ValueError, match="不支持的列格式"):
        _normalize_columns([123])  # type: ignore


def test_accept_first_instance_no_suffix():
    """首实例不加后缀"""
    result = _normalize_columns(["emp.count"])
    assert result[0].instance_id == "emp.count"
    assert result[0].source_code == "emp.count"


def test_accept_duplicate_with_hash_suffix():
    """重复实例 #2, #3 合法"""
    result = _normalize_columns([
        {"source_code": "emp.count", "instance_id": "emp.count"},
        {"source_code": "emp.count", "instance_id": "emp.count#2"},
        {"source_code": "emp.count", "instance_id": "emp.count#3"},
    ])
    assert len(result) == 3
    assert result[2].instance_id == "emp.count#3"


def test_empty_list():
    """空列表"""
    assert _normalize_columns([]) == []


# ==================== ColumnInstance model ====================

def test_column_instance_minimal():
    ci = ColumnInstance(source_code="emp.count", instance_id="emp.count")
    assert ci.source_code == "emp.count"
    assert ci.instance_id == "emp.count"
    assert ci.label is None


def test_column_instance_full():
    ci = ColumnInstance(source_code="emp.count", instance_id="emp.count#2", label="员工数 (2)")
    assert ci.label == "员工数 (2)"


def test_column_instance_extra_fields_forbidden():
    with pytest.raises(Exception):
        ColumnInstance(source_code="x", instance_id="x", unknown="bad")  # type: ignore
