# -*- coding: utf-8 -*-
"""AST0013：translate_formula_to_sql 兼容调度单元测试（不依赖数据库）。

验证：
- 现有调用方无需改代码（签名兼容）。
- 返回结构向后兼容：sql / valid / errors / has_aggregate。
- 新增字段不破坏前端（compile_engine / compile_version 等）。
- 按 FORMULA_COMPILER_ENGINE 路由 ast / legacy / ast_with_legacy_fallback。
"""
import asyncio

import pytest

import app.ai_formula.formula_to_sql as fts
from app.ai_formula.ast import FormulaCompileError, FormulaCompileResult


def _fake_result(valid=True, errors=None):
    return FormulaCompileResult(
        valid=valid,
        sql="COUNT(*) FILTER (WHERE \"current\".\"x\" = 'a')",
        normalized_formula="=x",
        has_aggregate=True,
        dependencies=[{"field_code": "x", "field_label": "x",
                      "source_alias": "current", "source_column": "x"}],
        functions=["COUNTIF"],
        warnings=[],
        errors=errors or [],
        ast=None,
        compiler={"engine": "ast", "version": "1.0.0"},
    )


def test_ast_to_legacy_shape_backward_compat():
    out = fts._ast_to_legacy_shape(_fake_result(), "ast")
    # 向后兼容字段
    assert out["sql"].startswith("COUNT(*)")
    assert out["valid"] is True
    assert out["has_aggregate"] is True
    assert out["errors"] == []
    # 新增字段（不破坏前端）
    assert out["compile_engine"] == "ast"
    assert out["compile_version"] == "1.0.0"
    assert out["functions"] == ["COUNTIF"]
    assert out["dependencies"]
    assert out["ast"] is None
    assert "normalized_formula" in out


def test_ast_to_legacy_shape_carries_errors():
    err = FormulaCompileError(code="unknown_field", message="字段不存在", field="y")
    out = fts._ast_to_legacy_shape(_fake_result(valid=False, errors=[err]), "ast")
    assert out["valid"] is False
    assert "字段不存在" in out["errors"][0]


def test_routes_to_ast(monkeypatch):
    async def fake_ast(*a, **k):
        return _fake_result()
    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(fts.settings, "FORMULA_COMPILER_ENGINE", "ast")
    out = asyncio.run(fts.translate_formula_to_sql(None, "=x", 1))
    assert out["compile_engine"] == "ast"


def test_routes_to_legacy(monkeypatch):
    async def fake_legacy(*a, **k):
        return {"sql": "LEGACY", "valid": True, "errors": [], "has_aggregate": True}
    monkeypatch.setattr(fts, "_legacy_translate_formula_to_sql", fake_legacy)
    monkeypatch.setattr(fts.settings, "FORMULA_COMPILER_ENGINE", "legacy")
    out = asyncio.run(fts.translate_formula_to_sql(None, "=x", 1))
    assert out["compile_engine"] == "legacy"
    assert out["sql"] == "LEGACY"


def test_ast_no_fallback_on_unsupported(monkeypatch):
    bad = _fake_result(valid=False, errors=[
        FormulaCompileError(code="unsupported_function", message="暂不支持函数 X", function="X"),
    ])
    async def fake_ast(*a, **k):
        return bad
    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(fts.settings, "FORMULA_COMPILER_ENGINE", "ast")
    out = asyncio.run(fts.translate_formula_to_sql(None, "=x", 1))
    # ast 模式不回退，直接返回 ast 结构（valid=False 透传）
    assert out["compile_engine"] == "ast"
    assert out["valid"] is False


def test_ast_with_fallback_on_unsupported(monkeypatch):
    bad = _fake_result(valid=False, errors=[
        FormulaCompileError(code="unsupported_function", message="暂不支持函数 X", function="X"),
    ])
    async def fake_ast(*a, **k):
        return bad
    async def fake_legacy(*a, **k):
        return {"sql": "LEGACY", "valid": True, "errors": [], "has_aggregate": True}
    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(fts, "_legacy_translate_formula_to_sql", fake_legacy)
    monkeypatch.setattr(fts.settings, "FORMULA_COMPILER_ENGINE", "ast_with_legacy_fallback")
    out = asyncio.run(fts.translate_formula_to_sql(None, "=x", 1))
    assert out["compile_engine"] == "legacy"
