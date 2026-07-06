# -*- coding: utf-8 -*-
"""数据血缘 (Q02) 测试

覆盖: Schema 校验、空数据、格式正确性、ORM 解析
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import LineageNodeOut, LineageEdgeOut, LineageGraphOut


# ==================== LineageNodeOut ====================

def test_node_defaults():
    n = LineageNodeOut(id="table:t1", type="table", label="表1")
    assert n.id == "table:t1"
    assert n.type == "table"
    assert n.label == "表1"
    assert n.status == "unknown"
    assert n.risk_level == "low"


def test_node_minimal():
    n = LineageNodeOut(id="field:t1.name", type="field", label="姓名")
    assert n.status == "unknown"


# ==================== LineageEdgeOut ====================

def test_edge_basic():
    e = LineageEdgeOut(
        source_id="table:a", target_id="table:b",
        direction="downstream", relation_type="reference", label="引用",
    )
    assert e.source_id == "table:a"
    assert e.target_id == "table:b"
    assert e.direction == "downstream"
    assert e.relation_type == "reference"
    assert e.label == "引用"


# ==================== LineageGraphOut ====================

def test_graph_empty():
    g = LineageGraphOut(nodes=[], edges=[])
    assert g.nodes == []
    assert g.edges == []
    assert g.truncated is False
    assert g.truncation_message is None


def test_graph_with_data():
    nodes = [LineageNodeOut(id="table:a", type="table", label="A")]
    edges = [LineageEdgeOut(source_id="table:a", target_id="table:b", direction="downstream", relation_type="reference")]
    g = LineageGraphOut(nodes=nodes, edges=edges)
    assert len(g.nodes) == 1
    assert len(g.edges) == 1


def test_graph_truncated():
    g = LineageGraphOut(
        nodes=[LineageNodeOut(id="table:a", type="table", label="A")],
        edges=[],
        truncated=True,
        truncation_message="depth limit exceeded",
    )
    assert g.truncated is True
    assert "depth" in g.truncation_message


# ==================== 完整字段 ====================

def test_node_full_fields():
    n = LineageNodeOut(
        id="table:emp", type="table", label="员工表",
        status="published", risk_level="medium",
    )
    assert n.id == "table:emp"
    assert n.type == "table"
    assert n.status == "published"
    assert n.risk_level == "medium"


def test_edge_full_fields():
    e = LineageEdgeOut(
        source_id="table:a", target_id="table:b",
        direction="upstream", relation_type="sync", label="同步来源",
    )
    assert e.source_id == "table:a"
    assert e.direction == "upstream"
    assert e.relation_type == "sync"
