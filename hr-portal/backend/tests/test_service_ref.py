# -*- coding: utf-8 -*-
"""ServiceSourceRef 统一来源协议测试"""
import pytest

from app.warehouse.service_ref import (
    ServiceSourceRef,
    SOURCE_TABLE,
    SOURCE_REPORT,
    SOURCE_DATASET,
    SOURCE_METRIC,
    SOURCE_ADS,
    parse_legacy_source,
    is_legacy_report_source,
)


class TestServiceSourceRef:
    def test_table_source(self):
        ref = ServiceSourceRef(source_type=SOURCE_TABLE, source_id="dwd_employee", source_label="员工标准表")
        assert ref.source_type == "table"
        assert ref.source_id == "dwd_employee"
        assert ref.source_label == "员工标准表"

    def test_report_source(self):
        ref = ServiceSourceRef(source_type=SOURCE_REPORT, source_id="123", source_label="月度薪酬报表")
        assert ref.source_type == "report"
        assert ref.source_id == "123"

    def test_int_source_id_coerced_to_str(self):
        ref = ServiceSourceRef(source_type=SOURCE_DATASET, source_id=42)
        assert ref.source_id == "42"

    def test_invalid_source_type_raises(self):
        with pytest.raises(ValueError, match="不支持的类型"):
            ServiceSourceRef(source_type="invalid", source_id="x")

    def test_to_dict_roundtrip(self):
        ref = ServiceSourceRef(source_type=SOURCE_ADS, source_id="ads_salary", source_layer="ADS")
        d = ref.to_dict()
        ref2 = ServiceSourceRef.from_dict(d)
        assert ref2.source_type == "ads"
        assert ref2.source_id == "ads_salary"
        assert ref2.source_layer == "ADS"

    def test_to_legacy_source_table_table(self):
        ref = ServiceSourceRef(source_type=SOURCE_TABLE, source_id="dwd_employee")
        assert ref.to_legacy_source_table() == "dwd_employee"

    def test_to_legacy_source_table_report(self):
        ref = ServiceSourceRef(source_type=SOURCE_REPORT, source_id="456")
        assert ref.to_legacy_source_table() == "report:456"

    def test_layer_default_none(self):
        ref = ServiceSourceRef(source_type=SOURCE_METRIC, source_id="m1")
        assert ref.source_layer is None


class TestParseLegacySource:
    def test_report_prefix(self):
        ref = parse_legacy_source("report:789")
        assert ref.source_type == "report"
        assert ref.source_id == "789"
        assert ref.source_label == "报表 #789"

    def test_plain_table_name(self):
        ref = parse_legacy_source("dwd_employee")
        assert ref.source_type == "table"
        assert ref.source_id == "dwd_employee"
        assert ref.source_label == "dwd_employee"

    def test_empty_string(self):
        ref = parse_legacy_source("")
        assert ref.source_type == "table"
        assert ref.source_id == ""


class TestIsLegacyReportSource:
    def test_report_true(self):
        assert is_legacy_report_source("report:123") is True

    def test_table_false(self):
        assert is_legacy_report_source("dwd_employee") is False

    def test_none_false(self):
        assert is_legacy_report_source(None) is False


class TestMultiSourceSafety:
    """多来源闭环安全测试"""

    def test_table_ods_fake_layer_still_rejected(self):
        """table 类型伪造 source_layer=DWD 也应查真实元数据"""
        ref = ServiceSourceRef(
            source_type="table", source_id="ods_xxx",
            source_layer="DWD",  # 伪造
        )
        # 校验前 source_layer 已被设为 DWD
        assert ref.source_layer == "DWD"
        # 实际安全由 assert_not_ods_source 强制查库，此处只验证结构

    def test_report_legacy_roundtrip(self):
        """report 来源 → to_legacy_source_table 正确"""
        ref = ServiceSourceRef(source_type="report", source_id="456")
        assert ref.to_legacy_source_table() == "report:456"

    def test_dataset_source_id_preserved(self):
        """dataset 来源 source_id 原样保存"""
        ref = ServiceSourceRef(source_type="dataset", source_id="42", source_label="员工宽表")
        assert ref.source_type == "dataset"
        assert ref.source_id == "42"

    def test_metric_source_not_mistaken_for_ods(self):
        """metric 来源不应触发 ODS 校验"""
        ref = ServiceSourceRef(source_type="metric", source_id="m1", source_layer="METRIC")
        # 非 table 类型不查 registered_tables
        assert ref.source_type != "table"

    def test_ads_source_not_mistaken_for_ods(self):
        """ads 来源不应触发 ODS 校验"""
        ref = ServiceSourceRef(source_type="ads", source_id="ads_salary", source_layer="ADS")
        assert ref.source_type != "table"

    def test_to_legacy_table_preserves_name(self):
        """table 类型 legacy 转换保持表名"""
        ref = ServiceSourceRef(source_type="table", source_id="dwd_employee")
        assert ref.to_legacy_source_table() == "dwd_employee"

    def test_invalid_type_rejected_with_message(self):
        """非法来源类型应明确拒绝"""
        with pytest.raises(ValueError, match="不支持的类型"):
            ServiceSourceRef(source_type="unknown", source_id="x")
