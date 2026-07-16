# -*- coding: utf-8 -*-
"""AST0011：除法自动 NULLIF 保护单元测试（不依赖数据库）。

规则：A / B → A / NULLIF(B, 0)::numeric
- 分母是函数时整体包裹
- 分母是 COUNT(*) FILTER (...) 时整体包裹
- 返回小数而非整数除法
"""
from app.ai_formula.ast import (
    FieldInfo,
    FieldResolver,
    FormulaCompileOptions,
    compile_formula,
)


def _compile(formula, fields):
    resolver = FieldResolver([FieldInfo(**f) for f in fields])
    return compile_formula(formula, resolver, options=FormulaCompileOptions())


def _f(*cols):
    return [{"alias": "current", "column": c} for c in cols]


def test_simple_division_nullif():
    r = _compile("=current.a / current.b", _f("a", "b"))
    assert r.valid, r.errors
    assert r.sql == '"current"."a" / NULLIF("current"."b", 0)::numeric'


def test_divide_by_count_star():
    r = _compile("=current.a / COUNT(*)", _f("a"))
    assert "NULLIF(COUNT(*), 0)::numeric" in r.sql


def test_divide_by_filter():
    r = _compile('=current.a / COUNTIF(current.t, "*")', _f("a", "t"))
    assert "NULLIF(COUNT(*) FILTER (WHERE" in r.sql
    assert ", 0)::numeric" in r.sql


def test_numeric_division_marker():
    # 8/10 不应整数除尽：必须带 ::numeric
    r = _compile("=8 / 10", [])
    assert r.sql == "8 / NULLIF(10, 0)::numeric"
    assert "::numeric" in r.sql


def test_chained_division_each_protected():
    r = _compile("=A / B / C", _f("A", "B", "C"))
    assert r.sql.count("NULLIF") == 2
    assert r.sql.count("::numeric") == 2


def test_parenthesized_left():
    r = _compile("=(current.a + current.b) / current.c", _f("a", "b", "c"))
    assert r.sql == (
        '("current"."a" + "current"."b") / NULLIF("current"."c", 0)::numeric'
    )
