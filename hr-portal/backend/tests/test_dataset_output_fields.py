# -*- coding: utf-8 -*-
"""输出字段校验测试

覆盖 I0111 / K0404-K0407 / K0509-K0512 对应的后端 Schema 校验。
- 单元测试：Schema 字段必填、长度限制、唯一约束模拟
- 运行: pytest tests/test_dataset_output_fields.py -v
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import (
    DatasetOutputFieldIn,
    DatasetOutputFieldOut,
    WAREHOUSE_LAYERS,
)


# ==================== 字段长度校验 ====================

def test_source_alias_too_long():
    with pytest.raises(ValidationError):
        DatasetOutputFieldIn(
            source_alias="a" * 65, source_column="c",
            output_code="oc", output_label="ol",
        )


def test_source_column_too_long():
    with pytest.raises(ValidationError):
        DatasetOutputFieldIn(
            source_alias="a", source_column="c" * 129,
            output_code="oc", output_label="ol",
        )


def test_output_code_too_long():
    with pytest.raises(ValidationError):
        DatasetOutputFieldIn(
            source_alias="a", source_column="c",
            output_code="oc" * 129, output_label="ol",
        )


def test_output_label_too_long():
    with pytest.raises(ValidationError):
        DatasetOutputFieldIn(
            source_alias="a", source_column="c",
            output_code="oc", output_label="ol" * 129,
        )


# ==================== 必填校验 ====================

def test_missing_source_alias():
    with pytest.raises(ValidationError):
        DatasetOutputFieldIn(
            source_column="c", output_code="oc", output_label="ol",
        )


def test_missing_source_column():
    with pytest.raises(ValidationError):
        DatasetOutputFieldIn(
            source_alias="a", output_code="oc", output_label="ol",
        )


def test_missing_output_code():
    with pytest.raises(ValidationError):
        DatasetOutputFieldIn(
            source_alias="a", source_column="c", output_label="ol",
        )


def test_missing_output_label():
    with pytest.raises(ValidationError):
        DatasetOutputFieldIn(
            source_alias="a", source_column="c", output_code="oc",
        )


# ==================== 默认值 ====================

def test_output_field_defaults():
    f = DatasetOutputFieldIn(
        source_alias="a", source_column="c",
        output_code="oc", output_label="ol",
    )
    assert f.data_type == "string"
    assert f.agg_role == "dimension"
    assert f.is_sensitive is False
    assert f.is_visible is True
    assert f.display_order == 0
    assert f.description is None


# ==================== 边界情况 ====================

def test_output_field_minimal_valid():
    """最短合法输入"""
    f = DatasetOutputFieldIn(
        source_alias="a", source_column="b",
        output_code="c", output_label="d",
    )
    assert f.output_code == "c"


def test_output_field_out_has_dataset_id():
    f = DatasetOutputFieldOut(
        id=1, dataset_id=99,
        source_alias="a", source_column="c",
        output_code="oc", output_label="ol",
    )
    assert f.dataset_id == 99
    assert f.id == 1
