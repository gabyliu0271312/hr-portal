# -*- coding: utf-8 -*-
"""AST0002：词法分析单元测试（不依赖数据库）。

覆盖中文字段、alias.字段、字符串内逗号/括号、比较运算符、数字。
"""
from app.ai_formula.ast import Lexer, TokenType


def _types(tokens):
    # 去掉末尾 EOF
    return [t.type for t in tokens if t.type != TokenType.EOF]


def test_chinese_ident():
    toks = Lexer("员工类型").tokenize()
    assert _types(toks) == [TokenType.IDENT]
    assert toks[0].value == "员工类型"


def test_qualified_field():
    toks = Lexer("current.员工类型").tokenize()
    assert _types(toks) == [TokenType.IDENT, TokenType.DOT, TokenType.IDENT]
    assert toks[0].value == "current"
    assert toks[2].value == "员工类型"


def test_string_with_comma_not_split():
    toks = Lexer('"正式员工, 男"').tokenize()
    assert _types(toks) == [TokenType.STRING]
    assert toks[0].value == "正式员工, 男"


def test_string_with_paren_ignored():
    toks = Lexer('"a(b)"').tokenize()
    assert _types(toks) == [TokenType.STRING]
    assert toks[0].value == "a(b)"


def test_multichar_operators():
    toks = Lexer("a>=100").tokenize()
    types = _types(toks)
    assert TokenType.GE in types
    assert TokenType.GT not in types  # 不应误拆成 > 和 =
    toks2 = Lexer("a<>b").tokenize()
    assert TokenType.NE in [t.type for t in toks2]
    toks3 = Lexer("a!=b").tokenize()
    assert TokenType.NE in [t.type for t in toks3]


def test_number_and_decimal():
    assert Lexer("123").tokenize()[0].value == "123"
    assert Lexer("123.45").tokenize()[0].value == "123.45"


def test_keywords_true_false_null():
    for kw, tt in (("TRUE", TokenType.TRUE), ("FALSE", TokenType.FALSE), ("NULL", TokenType.NULL)):
        assert Lexer(kw).tokenize()[0].type == tt


def test_amp_and_comma():
    toks = Lexer('a & b').tokenize()
    assert TokenType.AMP in _types(toks)
    toks2 = Lexer("a,b").tokenize()
    assert TokenType.COMMA in _types(toks2)


def test_string_unterminated_raises():
    import pytest
    from app.ai_formula.ast import LexError
    with pytest.raises(LexError):
        Lexer('"未闭合').tokenize()
