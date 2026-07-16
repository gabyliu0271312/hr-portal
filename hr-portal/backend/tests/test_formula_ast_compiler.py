# -*- coding: utf-8 -*-
"""AST0012：统一 compiler.py 单元测试（不依赖数据库）。

验证：normalize → lexer → parser → semantics → sql_generator → safety 全流程；
成功返回 FormulaCompileResult；失败返回结构化 errors 而非抛裸异常。
"""
import asyncio

import pytest

from app.ai_formula.ast import (
    COMPILER_ENGINE,
    COMPILER_VERSION,
    FieldInfo,
    FieldResolver,
    FormulaCompileOptions,
    FormulaCompileResult,
    compile_formula,
)
from app.ai_formula.ast.compiler import compile_formula_to_sql


def _compile(formula, fields, include_ast=False):
    resolver = FieldResolver([FieldInfo(**f) for f in fields])
    return compile_formula(
        formula, resolver, options=FormulaCompileOptions(include_ast=include_ast)
    )


def _f(*cols):
    return [{"alias": "current", "column": c} for c in cols]


def test_full_pipeline_success():
    r = _compile("=COUNT(current.a) / COUNT(current.b)", _f("a", "b"))
    assert isinstance(r, FormulaCompileResult)
    assert r.valid
    assert r.has_aggregate
    assert r.sql
    assert r.compiler["engine"] == COMPILER_ENGINE
    assert r.compiler["version"] == COMPILER_VERSION
    assert set(r.functions) == {"COUNT"}


def test_empty_formula_structured_error():
    resolver = FieldResolver([])
    r = compile_formula("=", resolver, options=FormulaCompileOptions())
    assert not r.valid
    assert any(e.code == "empty_formula" for e in r.errors)
    assert r.sql == ""


def test_failure_returns_errors_not_exception():
    # 不支持的函数不应抛出异常
    r = _compile("=HYPERLINK(current.a)", _f("a"))
    assert isinstance(r, FormulaCompileResult)
    assert r.valid is False
    assert r.errors
    assert r.sql == ""


def test_unknown_field_structured():
    r = _compile("=missing", [])
    assert not r.valid
    assert any(e.code == "unknown_field" for e in r.errors)


def test_include_ast():
    r = _compile("=COUNT(current.a)", _f("a"), include_ast=True)
    assert r.ast is not None
    assert r.ast["type"] == "FunctionCall"
    assert r.ast["name"] == "COUNT"


def test_normalized_formula_keeps_equals():
    r = _compile("=COUNT(current.a)", _f("a"))
    assert r.normalized_formula.startswith("=")


def test_compiler_constants():
    assert COMPILER_ENGINE == "ast"
    assert COMPILER_VERSION == "1.0.0"


def test_to_dict_shape():
    r = _compile("=COUNT(current.a)", _f("a"))
    d = r.to_dict()
    for key in (
        "valid",
        "sql",
        "normalized_formula",
        "has_aggregate",
        "dependencies",
        "functions",
        "warnings",
        "errors",
        "ast",
        "compiler",
    ):
        assert key in d


# --- compile_formula_to_sql：数据集字段获取失败的兜底（回归 _result 参数名 bug）---

def test_dataset_field_meta_raises_returns_structured_error(monkeypatch):
    """dataset_field_meta 抛异常时，必须返回结构化 dataset_unavailable，
    绝不能因 _result() 参数名（normalized vs normalized_formula）二次抛 TypeError。"""

    async def _boom(dataset_id, db):
        raise RuntimeError("connection reset")

    monkeypatch.setattr("app.ai_formula.field_refs.dataset_field_meta", _boom)

    r = asyncio.run(compile_formula_to_sql(object(), "=COUNT(current.a)", 999))
    assert isinstance(r, FormulaCompileResult)
    assert r.valid is False
    assert r.sql == ""
    assert any(e.code == "dataset_unavailable" for e in r.errors)
    # normalized_formula 应正常回填（=前缀保留），证明未在 _result 处抛异常
    assert r.normalized_formula.startswith("=")


def test_dataset_not_found_returns_structured_error(monkeypatch):
    """dataset 不存在（下游以异常表达）同样走结构化兜底，不抛裸异常。"""

    async def _not_found(dataset_id, db):
        raise ValueError(f"dataset {dataset_id} 不存在")

    monkeypatch.setattr("app.ai_formula.field_refs.dataset_field_meta", _not_found)

    r = asyncio.run(compile_formula_to_sql(object(), "=COUNT(current.a)", -1))
    assert r.valid is False
    assert any(e.code == "dataset_unavailable" for e in r.errors)
    assert "不存在" in "".join(e.message for e in r.errors)
