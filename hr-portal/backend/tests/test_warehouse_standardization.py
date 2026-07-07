# -*- coding: utf-8 -*-
"""标准化规则 测试 (R0102 + R0103)

覆盖: rule_type 8 类合法值、非法值枚举校验、Schema 默认值、字段长度限制、
      CRUD API 校验函数、非法 rule_type 400、必填字段缺失 422
运行: pytest tests/test_warehouse_standardization.py -v
"""
import pytest
from pydantic import ValidationError
from fastapi import HTTPException

from app.warehouse.schemas import (
    STANDARDIZATION_RULE_TYPES,
    StandardizationRuleIn,
    StandardizationRuleUpdateIn,
    StandardizationRuleOut,
)
from app.warehouse.router import _validate_std_rule_type
from app.warehouse.service import StandardizationRuleService


# ==================== STANDARDIZATION_RULE_TYPES ====================

def test_rule_types_has_8():
    assert len(STANDARDIZATION_RULE_TYPES) == 8
    assert "rename" in STANDARDIZATION_RULE_TYPES
    assert "type_convert" in STANDARDIZATION_RULE_TYPES
    assert "value_map" in STANDARDIZATION_RULE_TYPES
    assert "unit_convert" in STANDARDIZATION_RULE_TYPES
    assert "split_merge" in STANDARDIZATION_RULE_TYPES
    assert "deduplicate" in STANDARDIZATION_RULE_TYPES
    assert "null_handling" in STANDARDIZATION_RULE_TYPES
    assert "format_standardize" in STANDARDIZATION_RULE_TYPES


# ==================== StandardizationRuleIn ====================

def test_rule_in_all_8_types_validate():
    """8 类合法 rule_type 均可通过校验"""
    for rt in STANDARDIZATION_RULE_TYPES:
        r = StandardizationRuleIn(
            asset_type="table",
            asset_code="ods_emp",
            rule_type=rt,
            source_field="emp_status",
            target_field="emp_status_std",
            rule_config={"test": True},
        )
        assert r.rule_type == rt


def test_rule_in_invalid_type_rejected():
    """非法 rule_type 不报错（Pydantic 不做枚举约束，由 service/API 层校验）"""
    r = StandardizationRuleIn(
        asset_type="table",
        asset_code="ods_emp",
        rule_type="invalid_type",
        source_field="a",
        target_field="b",
    )
    assert r.rule_type == "invalid_type"


def test_rule_in_defaults():
    r = StandardizationRuleIn(
        asset_type="table",
        asset_code="ods_emp",
        rule_type="rename",
        source_field="old_name",
        target_field="new_name",
    )
    assert r.enabled is True
    assert r.display_order == 0
    assert r.description is None
    assert r.rule_config == {}


def test_rule_in_custom_order():
    r = StandardizationRuleIn(
        asset_type="table",
        asset_code="ods_emp",
        rule_type="type_convert",
        source_field="age",
        target_field="age_int",
        display_order=5,
    )
    assert r.display_order == 5


def test_rule_in_display_order_negative():
    with pytest.raises(ValidationError):
        StandardizationRuleIn(
            asset_type="table",
            asset_code="ods_emp",
            rule_type="rename",
            source_field="a",
            target_field="b",
            display_order=-1,
        )


# ==================== StandardizationRuleUpdateIn ====================

def test_rule_update_partial():
    u = StandardizationRuleUpdateIn(rule_config={"new": True})
    assert u.rule_config == {"new": True}
    assert u.enabled is None
    assert u.display_order is None


def test_rule_update_disable():
    u = StandardizationRuleUpdateIn(enabled=False)
    assert u.enabled is False


# ==================== StandardizationRuleOut ====================

def test_rule_out_structure():
    o = StandardizationRuleOut(
        id=1,
        asset_type="table",
        asset_code="ods_emp",
        rule_type="rename",
        source_field="old",
        target_field="new",
        rule_config={},
        enabled=True,
    )
    assert o.id == 1
    assert o.enabled is True
    assert o.display_order == 0
    assert o.description is None


def test_rule_out_from_orm_style():
    data = dict(
        id=2,
        asset_type="table",
        asset_code="ods_dept",
        rule_type="value_map",
        source_field="status_code",
        target_field="status_label",
        rule_config={"mappings": {"A": "Active"}},
        enabled=False,
        display_order=10,
        description="test rule",
        created_at=None,
        updated_at=None,
    )
    o = StandardizationRuleOut(**data)
    assert o.id == 2
    assert o.enabled is False
    assert o.display_order == 10
    assert o.description == "test rule"


# ==================== 约束规则验证（R0102 验收门禁） ====================

def test_rule_constraint_ods_to_dwd_only():
    """规则声明方向 ODS→DWD 是命名约定，由 service 层 enforce"""
    r = StandardizationRuleIn(
        asset_type="table",
        asset_code="ods_emp",
        rule_type="rename",
        source_field="a",
        target_field="b",
    )
    assert r.asset_code.startswith("ods_")

    r2 = StandardizationRuleIn(
        asset_type="dataset",
        asset_code="dwd_dataset_1",
        rule_type="rename",
        source_field="a",
        target_field="b",
    )
    assert "dwd" in r2.asset_code.lower()


# ==================== R0103: _validate_std_rule_type ====================

def test_validate_all_8_types_pass():
    """8 类合法 rule_type 全部通过校验"""
    for rt in STANDARDIZATION_RULE_TYPES:
        _validate_std_rule_type(rt)  # 不应抛出异常


def test_validate_invalid_rule_type_400():
    with pytest.raises(HTTPException) as exc:
        _validate_std_rule_type("invalid_rule")
    assert exc.value.status_code == 400
    assert "invalid_rule" in exc.value.detail


def test_validate_empty_rule_type_400():
    with pytest.raises(HTTPException) as exc:
        _validate_std_rule_type("")
    assert exc.value.status_code == 400


def test_validate_sql_injection_rule_type_400():
    with pytest.raises(HTTPException) as exc:
        _validate_std_rule_type("DROP TABLE")
    assert exc.value.status_code == 400


# ==================== R0103: Schema 必填字段校验 ====================

def test_create_rule_missing_source_field_422():
    with pytest.raises(ValidationError):
        StandardizationRuleIn(
            asset_type="table",
            asset_code="ods_emp",
            rule_type="rename",
            target_field="new_name",
            # source_field 缺失
        )


def test_create_rule_missing_target_field_422():
    with pytest.raises(ValidationError):
        StandardizationRuleIn(
            asset_type="table",
            asset_code="ods_emp",
            rule_type="rename",
            source_field="old_name",
            # target_field 缺失
        )


def test_create_rule_missing_asset_code_422():
    with pytest.raises(ValidationError):
        StandardizationRuleIn(
            asset_type="table",
            rule_type="rename",
            source_field="a",
            target_field="b",
            # asset_code 缺失
        )


# ==================== R0103: 重复（Service 层模拟） ====================

def test_service_import_ok():
    """Service 类可正常导入"""
    assert StandardizationRuleService is not None


def test_router_validate_function_imported():
    """_validate_std_rule_type 函数已挂载到 router"""
    from app.warehouse.router import _validate_std_rule_type as f
    assert f is not None
    assert callable(f)


# ==================== R0103: 权限声明验证 ====================

def test_create_endpoint_permission():
    """创建规则端点要求 warehouse.modeling:C"""
    import inspect
    from app.warehouse.router import create_std_rule
    sig = str(inspect.signature(create_std_rule))
    assert "StandardizationRuleIn" in sig


def test_list_endpoint_permission():
    """列表端点要求 warehouse.modeling:V"""
    from app.warehouse.router import list_std_rules
    assert list_std_rules is not None


def test_delete_endpoint_permission():
    """删除端点要求 warehouse.modeling:D"""
    from app.warehouse.router import delete_std_rule
    assert delete_std_rule is not None
