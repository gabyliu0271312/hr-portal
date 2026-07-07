# -*- coding: utf-8 -*-
"""标准化模板 测试 (R0106)

覆盖: 模板 Schema 校验、模板规则快照结构、加载请求校验
运行: pytest tests/test_warehouse_templates.py -v
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import (
    TemplateRuleEntry,
    StandardizationTemplateIn,
    StandardizationTemplateUpdateIn,
    StandardizationTemplateOut,
    TemplateLoadRequest,
)


# ==================== TemplateRuleEntry ====================

def test_rule_entry_valid():
    e = TemplateRuleEntry(
        rule_type="rename",
        source_field="emp_status",
        target_field="emp_status_std",
        rule_config={},
        display_order=1,
        description="状态码标准化",
    )
    assert e.rule_type == "rename"
    assert e.display_order == 1
    assert e.description == "状态码标准化"


def test_rule_entry_defaults():
    e = TemplateRuleEntry(
        rule_type="value_map",
        source_field="status",
        target_field="status_label",
    )
    assert e.rule_config == {}
    assert e.display_order == 0
    assert e.description is None


def test_rule_entry_negative_order():
    with pytest.raises(ValidationError):
        TemplateRuleEntry(
            rule_type="rename",
            source_field="a",
            target_field="b",
            display_order=-1,
        )


# ==================== StandardizationTemplateIn ====================

def test_template_in_basic():
    t = StandardizationTemplateIn(
        name="员工表标准化模板",
        business_object="员工表",
        template_rules=[
            TemplateRuleEntry(
                rule_type="rename", source_field="code", target_field="status_code",
            ),
        ],
    )
    assert t.name == "员工表标准化模板"
    assert t.business_object == "员工表"
    assert len(t.template_rules) == 1


def test_template_in_empty_rules():
    t = StandardizationTemplateIn(
        name="空模板",
        business_object="岗位表",
    )
    assert t.template_rules == []


def test_template_in_name_too_long():
    with pytest.raises(ValidationError):
        StandardizationTemplateIn(
            name="x" * 129,
            business_object="test",
        )


def test_template_in_missing_business_object():
    with pytest.raises(ValidationError):
        StandardizationTemplateIn(name="test")


# ==================== StandardizationTemplateUpdateIn ====================

def test_template_update_partial():
    u = StandardizationTemplateUpdateIn(name="更新名称")
    assert u.name == "更新名称"
    assert u.description is None
    assert u.template_rules is None


def test_template_update_with_rules():
    rules = [
        TemplateRuleEntry(
            rule_type="type_convert", source_field="age", target_field="age",
            rule_config={"target_type": "int"},
        ),
    ]
    u = StandardizationTemplateUpdateIn(template_rules=rules)
    assert len(u.template_rules) == 1


# ==================== StandardizationTemplateOut ====================

def test_template_out_structure():
    o = StandardizationTemplateOut(
        id=1,
        name="员工表模板",
        business_object="员工表",
        template_rules=[
            {"rule_type": "rename", "source_field": "a", "target_field": "b"},
        ],
    )
    assert o.id == 1
    assert o.version == 1
    assert len(o.template_rules) == 1


# ==================== TemplateLoadRequest ====================

def test_load_request_defaults():
    r = TemplateLoadRequest(asset_code="ods_emp")
    assert r.asset_code == "ods_emp"
    assert r.asset_type == "table"
    assert r.on_conflict == "skip"


def test_load_request_overwrite():
    r = TemplateLoadRequest(
        asset_code="ods_emp",
        asset_type="dataset",
        on_conflict="overwrite",
    )
    assert r.on_conflict == "overwrite"
    assert r.asset_type == "dataset"


def test_load_request_missing_asset_code():
    with pytest.raises(ValidationError):
        TemplateLoadRequest()


# ==================== 模板规则兼容性验证 ====================

def test_template_rules_match_8_types():
    """模板规则快照的 rule_type 支持全部 8 类"""
    valid_types = ("rename", "type_convert", "value_map", "unit_convert",
                   "split_merge", "deduplicate", "null_handling", "format_standardize")
    for rt in valid_types:
        e = TemplateRuleEntry(
            rule_type=rt,
            source_field="f",
            target_field="f_std",
        )
        assert e.rule_type == rt


def test_full_template_from_existing_rules():
    """模拟从已有 rules 创建模板"""
    rules = [
        {"rule_type": "rename", "source_field": "id", "target_field": "emp_id",
         "rule_config": {}, "display_order": 0, "description": "主键重命名"},
        {"rule_type": "type_convert", "source_field": "age", "target_field": "age",
         "rule_config": {"target_type": "int", "on_error": "set_null"},
         "display_order": 1, "description": ""},
        {"rule_type": "value_map", "source_field": "status", "target_field": "status_label",
         "rule_config": {"mappings": {"A": "在职", "B": "离职"}, "unmapped": "keep"},
         "display_order": 2, "description": ""},
        {"rule_type": "null_handling", "source_field": "dept", "target_field": "dept",
         "rule_config": {"strategy": "fill_default", "default": "未知"},
         "display_order": 3, "description": ""},
        {"rule_type": "format_standardize", "source_field": "phone", "target_field": "phone",
         "rule_config": {"format": "regex", "pattern": "[^0-9]", "replacement": ""},
         "display_order": 4, "description": "手机号去符号"},
    ]
    entries = [TemplateRuleEntry(**r) for r in rules]
    assert len(entries) == 5

    tpl = StandardizationTemplateIn(
        name="员工表标准模板 v1",
        business_object="员工表",
        template_rules=entries,
    )
    assert len(tpl.template_rules) == 5
    assert tpl.template_rules[0].rule_type == "rename"
    assert tpl.template_rules[4].rule_type == "format_standardize"
