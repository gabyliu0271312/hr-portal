# -*- coding: utf-8 -*-
"""AST0005：Parser 函数调用单元测试（不依赖数据库）。"""
import pytest

from app.ai_formula.ast import ParseError, parse


def test_countif_parse():
    node = parse('COUNTIF(current.员工类型,"正式员工")')
    assert node.type == "FunctionCall"
    assert node.name == "COUNTIF"
    assert len(node.args) == 2
    assert node.args[0].type == "FieldRef"
    assert node.args[1].type == "Literal"
    assert node.args[1].value == "正式员工"


def test_nested_function_in_args():
    node = parse('ROUND(COUNTIF(a,"x")/COUNTIF(a,"*"),4)')
    assert node.name == "ROUND"
    assert len(node.args) == 2
    # 第一个参数是除法 BinaryOp，其左右都是 COUNTIF 函数
    div = node.args[0]
    assert div.type == "BinaryOp"
    assert div.op == "/"
    assert div.left.name == "COUNTIF"
    assert div.right.name == "COUNTIF"
    assert node.args[1].value == 4


def test_if_with_comparison():
    node = parse('IF(A>0,"是","否")')
    assert node.name == "IF"
    assert len(node.args) == 3
    assert node.args[0].type == "Comparison"
    assert node.args[0].op == ">"
    assert node.args[1].value == "是"
    assert node.args[2].value == "否"


def test_multi_arg_sumifs():
    node = parse('SUMIFS(cost,type,"正式员工",month,">=1")')
    assert node.name == "SUMIFS"
    assert len(node.args) == 5
    assert all(a.type in ("FieldRef", "Literal") for a in node.args)


def test_unclosed_function_paren():
    with pytest.raises(ParseError) as ei:
        parse("SUM(a,b")
    assert ei.value.error.code == "syntax_unclosed_parenthesis"
    assert "SUM" in ei.value.error.message


def test_extra_comma():
    with pytest.raises(ParseError):
        parse("SUM(a,,b)")
