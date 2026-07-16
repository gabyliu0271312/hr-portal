# -*- coding: utf-8 -*-
"""AST0010：聚合函数 SQL 生成单元测试（不依赖数据库）。"""
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


def test_countif_filter():
    r = _compile('=COUNTIF(current.t, "正式员工")', _f("t"))
    assert r.valid, r.errors
    assert "COUNT(*) FILTER (WHERE" in r.sql
    assert '"current"."t" = \'正式员工\'' in r.sql
    assert r.has_aggregate


def test_countifs_and():
    r = _compile('=COUNTIFS(current.a, "x", current.b, ">0")', _f("a", "b"))
    assert "COUNT(*) FILTER (WHERE" in r.sql
    assert '"current"."a" = \'x\'' in r.sql
    assert '"current"."b" > 0' in r.sql
    assert " AND " in r.sql


def test_sumifs_order():
    r = _compile(
        '=SUMIFS(current.cost, current.type, "正式员工", current.month, ">=1")',
        _f("cost", "type", "month"),
    )
    assert "SUM(\"current\".\"cost\") FILTER (WHERE" in r.sql
    assert '"current"."type" = \'正式员工\'' in r.sql
    assert '"current"."month" >= 1' in r.sql


def test_counta():
    r = _compile("=COUNTA(current.a)", _f("a"))
    assert "COUNT(*) FILTER (WHERE" in r.sql
    assert "IS NOT NULL" in r.sql


def test_average_max_min_sum():
    assert 'AVG("current"."a")' in _compile("=AVERAGE(current.a)", _f("a")).sql
    assert 'MAX("current"."a")' in _compile("=MAX(current.a)", _f("a")).sql
    assert 'MIN("current"."a")' in _compile("=MIN(current.a)", _f("a")).sql
    assert 'SUM("current"."a")' in _compile("=SUM(current.a)", _f("a")).sql


def test_no_excel_function_leftover():
    r = _compile('=COUNTIF(current.t, "x")/COUNTIF(current.t, "*")', _f("t"))
    assert "COUNTIF(" not in r.sql
    assert "FILTER (WHERE" in r.sql
