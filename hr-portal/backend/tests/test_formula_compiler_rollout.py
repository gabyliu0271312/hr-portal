# -*- coding: utf-8 -*-
"""AST0019：灰度开关与回退策略（不依赖数据库）。

验证（通过 monkeypatch settings + 编译器）：

- 默认新环境使用 ast。
- ast_with_legacy_fallback：AST 不支持时回 legacy，且记录 warning。
- fallback 不允许绕过安全校验（legacy SQL 含 DDL/DML → 仍判 invalid）。
"""
import asyncio

import pytest

import app.ai_formula.formula_to_sql as fts
from app.ai_formula.ast import FormulaCompileError, FormulaCompileResult


def _ast_fake(valid=True, errors=None):
    return FormulaCompileResult(
        valid=valid,
        sql="OK",
        normalized_formula="=x",
        has_aggregate=True,
        dependencies=[],
        functions=[],
        warnings=[],
        errors=errors or [],
        ast=None,
        compiler={"engine": "ast", "version": "1.0.0"},
    )


def test_default_engine_is_ast():
    assert fts.settings.FORMULA_COMPILER_ENGINE == "ast"


def test_ast_with_legacy_fallback_records_warning(monkeypatch):
    bad = _ast_fake(
        valid=False,
        errors=[FormulaCompileError(code="unsupported_function", message="x", function="X")],
    )
    async def fake_ast(*a, **k):
        return bad

    async def fake_legacy(*a, **k):
        return {"sql": "LEG", "valid": True, "errors": [], "has_aggregate": True}

    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(fts, "_legacy_translate_formula_to_sql", fake_legacy)
    monkeypatch.setattr(
        fts.settings, "FORMULA_COMPILER_ENGINE", "ast_with_legacy_fallback"
    )
    out = asyncio.run(fts.translate_formula_to_sql(None, "=x", 1))
    assert out["compile_engine"] == "legacy"
    assert any("回退" in w for w in out["warnings"])


def test_fallback_cannot_bypass_safety(monkeypatch):
    bad = _ast_fake(
        valid=False,
        errors=[FormulaCompileError(code="unsupported_function", message="x", function="X")],
    )
    # legacy 返回含 DDL 的危险 SQL —— fallback 后仍需安全校验
    async def fake_ast(*a, **k):
        return bad

    async def fake_legacy(*a, **k):
        return {"sql": "DROP TABLE t", "valid": True, "errors": [], "has_aggregate": True}

    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(fts, "_legacy_translate_formula_to_sql", fake_legacy)
    monkeypatch.setattr(
        fts.settings, "FORMULA_COMPILER_ENGINE", "ast_with_legacy_fallback"
    )
    out = asyncio.run(fts.translate_formula_to_sql(None, "=x", 1))
    # 安全校验拦截：valid=False 且 errors 含安全提示
    assert out["valid"] is False
    assert any("DROP" in e for e in out["errors"])


def test_ast_with_fallback_success_normalizes_engine(monkeypatch):
    """Rec3：ast_with_legacy_fallback 且 AST 编译成功时，
    compile_engine 应为 ast（实际执行引擎），
    rollout_engine 单独记录灰度策略。"""
    good = _ast_fake(valid=True)
    async def fake_ast(*a, **k):
        return good

    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(
        fts.settings, "FORMULA_COMPILER_ENGINE", "ast_with_legacy_fallback"
    )
    out = asyncio.run(fts.translate_formula_to_sql(None, "=x", 1))
    assert out["compile_engine"] == "ast", (
        f"compile_engine 应为实际执行引擎 ast，但得到 {out.get('compile_engine')}"
    )
    assert out["rollout_engine"] == "ast_with_legacy_fallback", (
        f"灰度策略应记录在 rollout_engine，但得到 {out.get('rollout_engine')}"
    )


def test_ast_direct_success_compile_engine_is_ast(monkeypatch):
    """Rec3：纯 ast 模式编译成功时，compile_engine 为 ast，
    rollout_engine 为 None。"""
    good = _ast_fake(valid=True)
    async def fake_ast(*a, **k):
        return good

    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(fts.settings, "FORMULA_COMPILER_ENGINE", "ast")
    out = asyncio.run(fts.translate_formula_to_sql(None, "=x", 1))
    assert out["compile_engine"] == "ast"
    assert out.get("rollout_engine") is None


def test_direct_legacy_engine_has_no_rollout(monkeypatch):
    """Rec3：直接 legacy 模式时 rollout_engine 为 None，
    compile_engine 为 legacy。"""
    async def fake_legacy(*a, **k):
        return {"sql": "SUM(x)", "valid": True, "errors": [], "has_aggregate": True}

    monkeypatch.setattr(fts, "_legacy_translate_formula_to_sql", fake_legacy)
    monkeypatch.setattr(fts.settings, "FORMULA_COMPILER_ENGINE", "legacy")
    out = asyncio.run(fts.translate_formula_to_sql(None, "=x", 1))
    assert out["compile_engine"] == "legacy"
    assert out.get("rollout_engine") is None
