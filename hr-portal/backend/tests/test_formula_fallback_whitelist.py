# -*- coding: utf-8 -*-
"""阻断问题4：legacy fallback 不得绕过函数白名单（不依赖数据库）。

验证：
- ast_with_legacy_fallback 模式下，AST 返回 unsupported_function 回退到 legacy，
  若 legacy 把 VLOOKUP 等未知函数原样拼进 SQL，必须被函数白名单拦截为 invalid。
- 合法 legacy 公式（SUM/COUNT/NULLIF/FILTER 等）仍可通过白名单。
- 直接 legacy 引擎路径同样经过白名单校验。
- 字符串字面量内部的 NAME( 不应误报。
- 安全白名单函数（SUM/COUNT/AVG/MAX/MIN/ROUND/ABS/COALESCE/EXTRACT/NULLIF/FILTER）放行。
"""
import asyncio

import pytest

import app.ai_formula.formula_to_sql as fts
from app.ai_formula.ast import FormulaCompileError, FormulaCompileResult
from app.ai_formula.ast.safety import (
    unauthorized_functions,
    validate_sql_function_whitelist,
)


def _unsupported(result_func="VLOOKUP"):
    return FormulaCompileResult(
        valid=False,
        sql="",
        normalized_formula="=x",
        has_aggregate=False,
        dependencies=[],
        functions=[],
        warnings=[],
        errors=[
            FormulaCompileError(
                code="unsupported_function",
                message=f"暂不支持函数 {result_func}",
                function=result_func,
            )
        ],
        ast=None,
        compiler={"engine": "ast", "version": "1.0.0"},
    )


def _fake_field_map():
    # 让 legacy 能把裸字段名解析为带引号标识符
    return {
        "score": ("current", "score"),
        "current.score": ("current", "score"),
    }


# ==================== 白名单单元验证 ====================
def test_whitelist_allows_safe_functions():
    sql = 'SUM("current"."score") / NULLIF(COUNT(*), 0)::numeric'
    assert unauthorized_functions(sql) == []
    assert validate_sql_function_whitelist(sql) == []


def test_whitelist_allows_filter_clause():
    sql = 'COUNT(*) FILTER (WHERE "current"."score" IS NOT NULL)'
    assert unauthorized_functions(sql) == []


def test_whitelist_allows_coalesce_extract():
    assert unauthorized_functions('COALESCE("a"."x", 0)') == []
    assert unauthorized_functions('EXTRACT(YEAR FROM "a"."d")') == []


def test_whitelist_rejects_vlookup():
    errs = unauthorized_functions('VLOOKUP("current"."score", 1)')
    assert errs, "VLOOKUP 应被白名单拦截"
    assert errs[0].code == "unauthorized_function"
    assert "VLOOKUP" in errs[0].message


def test_whitelist_rejects_unknown_aggregate():
    errs = unauthorized_functions('EVILFUNC("a"."x")')
    assert errs and errs[0].code == "unauthorized_function"


def test_whitelist_ignores_string_literals():
    # 单引号字符串字面量内部的 VLOOKUP( 不应误报为函数调用
    assert unauthorized_functions("col = 'VLOOKUP(foo)'") == []
    # 双引号标识符应被剥离，不会误判为函数
    assert unauthorized_functions('"current"."employee_type" = \'x\'') == []


def test_whitelist_ignores_select_handled_by_safety():
    # SELECT 由 safety_issues 处理，白名单不应重复报告为 unauthorized_function
    assert unauthorized_functions("SELECT 1") == []


# ==================== 回退路径集成（真实 legacy 翻译器） ====================
def test_fallback_rejects_unauthorized_function(monkeypatch):
    async def fake_ast(*a, **k):
        return _unsupported("VLOOKUP")

    async def fake_build(*a, **k):
        return _fake_field_map()

    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(fts, "_build_field_mapping", fake_build)
    monkeypatch.setattr(
        fts.settings, "FORMULA_COMPILER_ENGINE", "ast_with_legacy_fallback"
    )
    out = asyncio.run(fts.translate_formula_to_sql(None, "=VLOOKUP(score, 1)", 1))
    # 被函数白名单拦截为 invalid —— 因此不会被接受/落库
    assert out["valid"] is False
    assert any("VLOOKUP" in e for e in out["errors"])
    # 安全校验已将其判为非法，metric 保存流程会因 valid=False 而阻断
    assert out["compile_engine"] == "legacy"


def test_fallback_keeps_safe_legacy_sql(monkeypatch):
    async def fake_ast(*a, **k):
        return _unsupported("X")

    async def fake_build(*a, **k):
        return _fake_field_map()

    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(fts, "_build_field_mapping", fake_build)
    monkeypatch.setattr(
        fts.settings, "FORMULA_COMPILER_ENGINE", "ast_with_legacy_fallback"
    )
    out = asyncio.run(
        fts.translate_formula_to_sql(None, "=SUM(score)/COUNT(*)", 1)
    )
    assert out["valid"] is True
    assert "SUM(" in out["sql"]
    assert "NULLIF(" in out["sql"]


def test_fallback_rejects_couna_in_legacy(monkeypatch):
    # COUNTA 仅 AST 支持；legacy 会原样输出 COUNTA( → 必须被白名单拦截
    async def fake_ast(*a, **k):
        return _unsupported("COUNTA")

    async def fake_build(*a, **k):
        return _fake_field_map()

    monkeypatch.setattr(fts, "_ast_compile_formula", fake_ast)
    monkeypatch.setattr(fts, "_build_field_mapping", fake_build)
    monkeypatch.setattr(
        fts.settings, "FORMULA_COMPILER_ENGINE", "ast_with_legacy_fallback"
    )
    out = asyncio.run(fts.translate_formula_to_sql(None, "=COUNTA(score)", 1))
    assert out["valid"] is False
    assert any("COUNTA" in e for e in out["errors"])


# ==================== 直接 legacy 引擎路径 ====================
def test_direct_legacy_rejects_unauthorized_function(monkeypatch):
    async def fake_build(*a, **k):
        return _fake_field_map()

    monkeypatch.setattr(fts, "_build_field_mapping", fake_build)
    monkeypatch.setattr(fts.settings, "FORMULA_COMPILER_ENGINE", "legacy")
    out = asyncio.run(fts.translate_formula_to_sql(None, "=VLOOKUP(score, 1)", 1))
    assert out["compile_engine"] == "legacy"
    assert out["valid"] is False
    assert any("VLOOKUP" in e for e in out["errors"])


def test_direct_legacy_keeps_safe_sql(monkeypatch):
    async def fake_build(*a, **k):
        return _fake_field_map()

    monkeypatch.setattr(fts, "_build_field_mapping", fake_build)
    monkeypatch.setattr(fts.settings, "FORMULA_COMPILER_ENGINE", "legacy")
    out = asyncio.run(
        fts.translate_formula_to_sql(None, "=SUM(score)/COUNT(*)", 1)
    )
    assert out["valid"] is True
