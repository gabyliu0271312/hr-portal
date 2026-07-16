# -*- coding: utf-8 -*-
"""AST0003：AST 节点单元测试（不依赖数据库）。

每个节点含 span 且可 to_dict() 序列化。
"""
import json

from app.ai_formula.ast import (
    BinaryOpNode,
    ComparisonNode,
    FieldRefNode,
    FunctionCallNode,
    LiteralNode,
    SourceSpan,
    UnaryOpNode,
)


def _span():
    return SourceSpan(0, 1, "x")


def test_literal_node():
    n = LiteralNode(10, "number", span=_span())
    d = n.to_dict()
    assert d["type"] == "Literal"
    assert d["value"] == 10
    assert "span" in d


def test_field_ref_node_optional_attrs():
    n = FieldRefNode(raw="current.员工类型", alias="current", column="employee_type", span=_span())
    d = n.to_dict()
    assert d["type"] == "FieldRef"
    assert d["raw"] == "current.员工类型"
    # resolved 之前不应出现 resolved_* 键
    assert "resolved_alias" not in d
    n2 = FieldRefNode(raw="x", resolved=True, resolved_alias="c", resolved_column="y", span=_span())
    assert n2.to_dict()["resolved_alias"] == "c"


def test_function_call_node():
    n = FunctionCallNode(
        "COUNTIF",
        [LiteralNode("正式员工", "string", span=_span()), FieldRefNode(raw="x", span=_span())],
        span=_span(),
    )
    d = n.to_dict()
    assert d["type"] == "FunctionCall"
    assert d["name"] == "COUNTIF"
    assert len(d["args"]) == 2


def test_binary_op_node():
    n = BinaryOpNode(
        "/", LiteralNode(1, "number", span=_span()), LiteralNode(2, "number", span=_span()),
        span=_span(),
    )
    d = n.to_dict()
    assert d["type"] == "BinaryOp"
    assert d["op"] == "/"
    assert d["left"]["type"] == "Literal"
    assert d["right"]["type"] == "Literal"


def test_unary_op_node():
    n = UnaryOpNode("-", LiteralNode(1, "number", span=_span()), span=_span())
    d = n.to_dict()
    assert d["type"] == "UnaryOp"
    assert d["op"] == "-"
    assert d["operand"]["type"] == "Literal"


def test_comparison_node():
    n = ComparisonNode(
        ">=", LiteralNode(1, "number", span=_span()), LiteralNode(2, "number", span=_span()),
        span=_span(),
    )
    d = n.to_dict()
    assert d["type"] == "Comparison"
    assert d["op"] == ">="


def test_all_nodes_json_serializable():
    tree = BinaryOpNode(
        "/",
        FunctionCallNode(
            "COUNTIF",
            [FieldRefNode(raw="a", span=_span()), LiteralNode("x", "string", span=_span())],
            span=_span(),
        ),
        LiteralNode(1, "number", span=_span()),
        span=_span(),
    )
    json.dumps(tree.to_dict())
