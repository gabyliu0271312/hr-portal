# -*- coding: utf-8 -*-
"""AST0009：SQL 生成器基础表达式单元测试（不依赖数据库）。

覆盖字段双引号、字符串单引号转义、四则运算、比较、AND/OR/NOT、ROUND、ABS、& 拼接。
"""
from app.ai_formula.ast import (
    FieldInfo,
    FieldResolver,
    FormulaCompileOptions,
    compile_formula,
)


def _compile(formula, fields, include_ast=False):
    resolver = FieldResolver([FieldInfo(**f) for f in fields])
    return compile_formula(
        formula, resolver, options=FormulaCompileOptions(include_ast=include_ast)
    )


def _f(*cols):
    return [{"alias": "current", "column": c} for c in cols]


def test_field_quoted():
    r = _compile("=current.a", _f("a"))
    assert r.valid, r.errors
    assert r.sql == '"current"."a"'


def test_string_escape():
    r = _compile('=current.x = "a\'b"', _f("x"))
    assert r.valid, r.errors
    assert "'a''b'" in r.sql


def test_arithmetic_precedence():
    r = _compile("=A + B * C", _f("A", "B", "C"))
    assert r.valid, r.errors
    assert '"current"."A"' in r.sql
    assert '"current"."B" * "current"."C"' in r.sql
    assert " + " in r.sql


def test_concat_amp():
    r = _compile("=current.a & current.b", _f("a", "b"))
    assert '"current"."a" || "current"."b"' in r.sql


def test_round_abs():
    r = _compile("=ROUND(current.a, 2)", _f("a"))
    assert 'ROUND("current"."a", 2)' in r.sql
    r2 = _compile("=ABS(current.a)", _f("a"))
    assert 'ABS("current"."a")' in r2.sql


def test_and_or_not():
    r = _compile("=AND(current.a > 0, current.b > 0)", _f("a", "b"))
    assert "AND" in r.sql
    assert '"current"."a" > 0' in r.sql
    assert '"current"."b" > 0' in r.sql
    r2 = _compile("=OR(current.a > 0, current.b > 0)", _f("a", "b"))
    assert "OR" in r2.sql
    r3 = _compile("=NOT(current.a > 0)", _f("a"))
    assert "NOT" in r3.sql


def test_if_to_case():
    r = _compile('=IF(current.a > 0, "是", "否")', _f("a"))
    assert "CASE WHEN" in r.sql
    assert "THEN" in r.sql
    assert "ELSE" in r.sql
    assert "END" in r.sql
    assert "'是'" in r.sql
    assert "'否'" in r.sql


def test_isblank():
    r = _compile("=ISBLANK(current.a)", _f("a"))
    assert "IS NULL" in r.sql


def test_year_month_extract():
    r = _compile("=YEAR(current.d)", _f("d"))
    assert "EXTRACT(YEAR FROM" in r.sql
    r2 = _compile("=MONTH(current.d)", _f("d"))
    assert "EXTRACT(MONTH FROM" in r2.sql


def test_no_field_name_injection():
    # 字段名被双引号包裹，不会原样透传为裸标识符
    r = _compile("=current.a + 1", _f("a"))
    assert '"current"."a"' in r.sql
