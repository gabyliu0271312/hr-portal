# -*- coding: utf-8 -*-
"""Track B AI 配置解释列实例契约测试。"""
from types import SimpleNamespace

from app.ai.router import (
    ReportExplainColumnInstance,
    ReportExplainConfigIn,
    _explain_report_config,
    _report_explain_payload_from_row,
)


def test_report_explain_preserves_duplicate_column_instances():
    payload = ReportExplainConfigIn(
        report_name="重复列报表",
        columns=[
            {"source_code": "emp.amount", "instance_id": "emp.amount", "label": "金额"},
            {"source_code": "emp.amount", "instance_id": "emp.amount#2", "label": "金额 (2)"},
        ],
        sorts=[{"column": "emp.amount#2", "order": "desc"}],
        aggregations={"emp.amount": "sum", "emp.amount#2": "count"},
        column_settings={"emp.amount#2": {"hidden": True}},
    )

    result = _explain_report_config(payload)

    assert result.field_count == 2
    assert result.visible_fields == ["emp.amount"]
    assert result.context_packet["data"]["columns"] == [
        {"source_code": "emp.amount", "instance_id": "emp.amount", "label": "金额"},
        {"source_code": "emp.amount", "instance_id": "emp.amount#2", "label": "金额 (2)"},
    ]
    assert result.context_packet["data"]["sorts"][0]["column"] == "emp.amount#2"
    assert result.context_packet["data"]["aggregations"]["emp.amount#2"] == "count"


def test_report_explain_reads_column_instances_from_saved_report_config():
    row = SimpleNamespace(
        id=7,
        name="历史重复列报表",
        description="",
        config={
            "columns": [
                {"source_code": "emp.amount", "instance_id": "emp.amount"},
                {"source_code": "emp.amount", "instance_id": "emp.amount#2", "label": "金额 (2)"},
            ],
            "column_settings": {"emp.amount#2": {"hidden": True}},
        },
    )

    payload = _report_explain_payload_from_row(row)

    assert isinstance(payload.columns[0], ReportExplainColumnInstance)
    assert payload.columns[1].instance_id == "emp.amount#2"
    assert _explain_report_config(payload).visible_fields == ["emp.amount"]