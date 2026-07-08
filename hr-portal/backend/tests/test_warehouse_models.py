# -*- coding: utf-8 -*-
"""数据仓库模型 API 测试

覆盖 I0106-I0110 / K04-K05 对应的后端 Schema。
- 单元测试：Schema 校验、字段限制、nullable
- 运行: pytest tests/test_warehouse_models.py -v
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import (
    ModelTableIn,
    ModelRelationIn,
    WarehouseModelCreateIn,
    WarehouseModelOut,
    WarehouseModelDetailOut,
    WarehouseModelUpdateIn,
    DatasetOutputFieldIn,
    DatasetOutputFieldOut,
    PreviewOut,
    PreviewSummary,
)


# ==================== ModelTableIn ====================

def test_model_table_in_required():
    t = ModelTableIn(table_name="emp", alias="e")
    assert t.table_name == "emp"
    assert t.alias == "e"


def test_model_table_in_missing_fields():
    with pytest.raises(ValidationError):
        ModelTableIn(table_name="emp")


# ==================== ModelRelationIn ====================

def test_relation_in_defaults():
    r = ModelRelationIn(
        left_alias="a", right_alias="b",
        left_keys=["id"], right_keys=["eid"],
    )
    assert r.join_type == "left"
    assert r.cardinality == "1:N"


def test_relation_in_keys_default_empty():
    """left_keys/right_keys 默认为空列表"""
    r = ModelRelationIn(left_alias="a", right_alias="b")
    assert r.left_keys == []
    assert r.right_keys == []


# ==================== WarehouseModelCreateIn ====================

def test_model_create_minimal():
    m = WarehouseModelCreateIn(name="model1", tables=[], relations=[])
    assert m.name == "model1"
    assert m.warehouse_layer == "DWD"
    assert m.tables == []
    assert m.relations == []


def test_model_create_with_tables():
    m = WarehouseModelCreateIn(
        name="m1",
        tables=[ModelTableIn(table_name="t1", alias="a1")],
        relations=[ModelRelationIn(left_alias="a1", right_alias="a2", left_keys=["id"], right_keys=["tid"])],
    )
    assert len(m.tables) == 1
    assert m.tables[0].alias == "a1"
    assert len(m.relations) == 1


def test_model_create_name_too_long():
    with pytest.raises(ValidationError):
        WarehouseModelCreateIn(name="x" * 65, tables=[], relations=[])


# ==================== WarehouseModelOut ====================

def test_model_out_defaults():
    m = WarehouseModelOut(id=1, name="m1", status="draft")
    assert m.id == 1
    assert m.version == 1
    assert m.warehouse_layer == "DWD"
    assert m.status == "draft"
    assert m.table_count is None


# ==================== WarehouseModelDetailOut ====================

def test_model_detail_has_output_fields():
    m = WarehouseModelDetailOut(
        id=1, name="m1", status="draft",
        tables=[], relations=[], output_fields=[],
    )
    assert m.output_fields == []
    assert m.business_definition is None


# ==================== WarehouseModelUpdateIn ====================

def test_model_update_partial():
    u = WarehouseModelUpdateIn(name="updated")
    assert u.name == "updated"
    assert u.description is None


# ==================== DatasetOutputFieldIn ====================

def test_output_field_in_defaults():
    f = DatasetOutputFieldIn(
        source_alias="a", source_column="c",
        output_code="oc", output_label="ol",
    )
    assert f.data_type == "string"
    assert f.agg_role == "dimension"
    assert f.is_sensitive is False
    assert f.is_visible is True
    assert f.display_order == 0


def test_output_field_in_rejects_too_long():
    with pytest.raises(ValidationError):
        DatasetOutputFieldIn(
            source_alias="a", source_column="c",
            output_code="x" * 129, output_label="y",
        )


# ==================== DatasetOutputFieldOut ====================

def test_output_field_out():
    f = DatasetOutputFieldOut(
        source_alias="a", source_column="c",
        output_code="oc", output_label="ol",
        id=1, dataset_id=5,
    )
    assert f.id == 1
    assert f.dataset_id == 5


# ==================== Preview / Summary ====================

def test_preview_summary_defaults():
    s = PreviewSummary()
    assert s.total_sampled == 0
    assert s.rows_with_changes == 0
    assert s.fields_changed == 0


def test_preview_out_structure():
    p = PreviewOut(
        asset_code="ods_test",
        sample_size=20,
        columns=["a"],
        summary=PreviewSummary(total_sampled=100, rows_with_changes=20),
    )
    assert p.asset_code == "ods_test"
    assert p.sample_size == 20
    assert p.summary.total_sampled == 100
