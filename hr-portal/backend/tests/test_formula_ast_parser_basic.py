# -*- coding: utf-8 -*-
"""AST0004：Parser 基础表达式单元测试（不依赖数据库）。"""
import pytest

from app.ai_formula.ast import ParseError, parse


def test_precedence_mul_before_add():
    node = parse("1 + 2 * 3")
    assert node.type == "BinaryOp"
    assert node.op == "+"
    assert node.left.value == 1
    assert node.right.type == "BinaryOp"
    assert node.right.op == "*"
    assert node.right.left.value == 2
    assert node.right.right.value == 3


def test_parentheses_override_precedence():
    node = parse("(1 + 2) / 3")
    assert node.op == "/"
    assert node.left.op == "+"
    assert node.left.left.value == 1
    assert node.right.value == 3


def test_unary_minus():
    node = parse("-SUM(x)")
    assert node.type == "UnaryOp"
    assert node.op == "-"
    assert node.operand.type == "FunctionCall"
    assert node.operand.name == "SUM"


def test_comparison():
    node = parse("A >= 10")
    assert node.type == "Comparison"
    assert node.op == ">="
    assert node.left.raw == "A"
    assert node.right.value == 10


def test_qualified_field_ref():
    node = parse("current.员工类型")
    assert node.type == "FieldRef"
    assert node.alias == "current"
    assert node.column == "员工类型"


def test_field_func_as_field():
    node = parse('FIELD("employee_type")')
    assert node.type == "FunctionCall"
    assert node.name == "FIELD"
    assert node.args[0].value == "employee_type"


def test_missing_rparen():
    with pytest.raises(ParseError) as ei:
        parse("COUNTIF(a")
    assert ei.value.error.code == "syntax_unclosed_parenthesis"


def test_empty_formula():
    with pytest.raises(ParseError) as ei:
        parse("")
    assert ei.value.error.code == "syntax_empty_formula"


def test_unexpected_rparen():
    with pytest.raises(ParseError):
        parse(")")


def test_missing_operand():
    with pytest.raises(ParseError):
        parse("1 +")
