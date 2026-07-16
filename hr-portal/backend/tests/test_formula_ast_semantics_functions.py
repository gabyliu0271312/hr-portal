# -*- coding: utf-8 -*-
"""AST0007：函数签名与白名单校验单元测试（不依赖数据库）。"""
from app.ai_formula.ast import (
    FieldInfo,
    FieldResolver,
    FormulaCompileOptions,
    compile_formula,
)


def _compile(formula, fields):
    resolver = FieldResolver([FieldInfo(**f) for f in fields])
    return compile_formula(formula, resolver, options=FormulaCompileOptions())


def _fields(*cols):
    return [{"alias": "current", "column": c} for c in cols]


def test_countif_too_few_args():
    r = _compile("=COUNTIF(current.a)", _fields("a"))
    assert not r.valid
    assert any(e.code == "function_arg_count" for e in r.errors)


def test_countif_too_many_args():
    r = _compile("=COUNTIF(current.a,current.b,current.c)", _fields("a", "b", "c"))
    assert not r.valid
    assert any(e.code == "function_arg_count" for e in r.errors)


def test_unsupported_function():
    r = _compile("=HYPERLINK(current.a)", _fields("a"))
    assert not r.valid
    bad = [e for e in r.errors if e.code == "unsupported_function"]
    assert bad
    assert bad[0].function == "HYPERLINK"


def test_has_aggregate_true():
    r = _compile("=COUNT(current.a)", _fields("a"))
    assert r.valid
    assert r.has_aggregate is True
    assert "COUNT" in r.functions


def test_sumifs_odd_rule_error():
    # SUMIFS 需要奇数个参数；4 个（偶数）应报错
    r = _compile(
        "=SUMIFS(current.cost,current.t1,current.c1,current.t2)",
        _fields("cost", "t1", "c1", "t2"),
    )
    assert not r.valid
    assert any(e.code == "function_arg_count" for e in r.errors)


def test_countifs_even_rule_error():
    # COUNTIFS 需要偶数个参数；3 个（奇数）应报错
    r = _compile("=COUNTIFS(current.a,current.b,current.c)", _fields("a", "b", "c"))
    assert not r.valid
    assert any(e.code == "function_arg_count" for e in r.errors)


def test_conditional_aggregates_set_flag():
    r = _compile("=COUNTIF(current.a,current.b)", _fields("a", "b"))
    assert r.has_aggregate is True
