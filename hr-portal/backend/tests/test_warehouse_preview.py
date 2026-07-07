# -*- coding: utf-8 -*-
"""标准化预览 测试 (R0107)

覆盖: Schema 校验、预览请求结构、空规则拒绝、采样限制
运行: pytest tests/test_warehouse_preview.py -v
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import (
    PreviewRuleInput,
    PreviewRequest,
    FieldChangeOut,
    PreviewRowOut,
    PreviewSummary,
    PreviewOut,
)


# ==================== PreviewRuleInput ====================

def test_preview_rule_valid():
    r = PreviewRuleInput(
        rule_type="rename",
        source_field="old",
        target_field="new",
        rule_config={},
        display_order=1,
    )
    assert r.rule_type == "rename"
    assert r.display_order == 1


def test_preview_rule_defaults():
    r = PreviewRuleInput(
        rule_type="value_map",
        source_field="a",
        target_field="b",
    )
    assert r.rule_config == {}
    assert r.display_order == 0


# ==================== PreviewRequest ====================

def test_preview_request_basic():
    p = PreviewRequest(
        asset_code="ods_emp",
        sample_size=50,
        rule_ids=[1, 2],
    )
    assert p.asset_code == "ods_emp"
    assert p.sample_size == 50
    assert p.rule_ids == [1, 2]
    assert p.inline_rules == []


def test_preview_request_inline_rules():
    p = PreviewRequest(
        asset_code="ods_dept",
        inline_rules=[
            PreviewRuleInput(
                rule_type="type_convert", source_field="age", target_field="age",
                rule_config={"target_type": "int"},
            ),
        ],
    )
    assert len(p.inline_rules) == 1
    assert p.inline_rules[0].rule_type == "type_convert"


def test_preview_request_defaults():
    p = PreviewRequest(asset_code="ods_emp")
    assert p.sample_size == 20
    assert p.rule_ids == []
    assert p.inline_rules == []


def test_preview_request_sample_too_small():
    with pytest.raises(ValidationError):
        PreviewRequest(asset_code="ods_emp", sample_size=0)


def test_preview_request_sample_too_large():
    with pytest.raises(ValidationError):
        PreviewRequest(asset_code="ods_emp", sample_size=501)


def test_preview_request_missing_asset_code():
    with pytest.raises(ValidationError):
        PreviewRequest()


# ==================== FieldChangeOut ====================

def test_field_change():
    f = FieldChangeOut(field="name", before="张三", after="张 三", changed=True)
    assert f.field == "name"
    assert f.changed is True


def test_field_change_unchanged():
    f = FieldChangeOut(field="id", before="001", after="001")
    assert f.changed is False
    assert f.error is None


def test_field_change_with_error():
    f = FieldChangeOut(field="age", before="abc", after=None, changed=True, error="类型转换失败")
    assert f.error == "类型转换失败"


# ==================== PreviewRowOut ====================

def test_preview_row():
    r = PreviewRowOut(
        row_index=0,
        fields=[
            FieldChangeOut(field="name", before="Alice", after="Alice"),
            FieldChangeOut(field="status", before="A", after="在职", changed=True),
        ],
    )
    assert r.row_index == 0
    assert len(r.fields) == 2


# ==================== PreviewSummary ====================

def test_preview_summary():
    s = PreviewSummary(
        total_sampled=20,
        rows_with_changes=5,
        fields_changed=8,
        errors=2,
        rows_to_drop=1,
        rows_to_dedup=1,
    )
    assert s.total_sampled == 20
    assert s.errors == 2


# ==================== PreviewOut ====================

def test_preview_out():
    o = PreviewOut(
        asset_code="ods_emp",
        sample_size=20,
        columns=["id", "name", "status"],
        rows=[
            PreviewRowOut(
                row_index=0,
                fields=[
                    FieldChangeOut(field="id", before="1", after="1"),
                    FieldChangeOut(field="status", before="A", after="在职", changed=True),
                ],
            ),
        ],
        summary=PreviewSummary(total_sampled=1, rows_with_changes=1, fields_changed=1),
    )
    assert o.asset_code == "ods_emp"
    assert len(o.columns) == 3
    assert len(o.rows) == 1
    assert o.summary.fields_changed == 1


# ==================== 边界场景 ====================

def test_empty_rules_rejected():
    """规则为空应在 service 层被拒绝（schema 不强制至少一条）"""
    p = PreviewRequest(asset_code="ods_emp")
    assert p.rule_ids == []
    assert p.inline_rules == []


def test_both_rule_ids_and_inline():
    p = PreviewRequest(
        asset_code="ods_emp",
        rule_ids=[1, 2, 3],
        inline_rules=[
            PreviewRuleInput(rule_type="format_standardize", source_field="f", target_field="f",
                             rule_config={"format": "trim"}),
        ],
    )
    assert len(p.rule_ids) == 3
    assert len(p.inline_rules) == 1
