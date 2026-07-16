# -*- coding: utf-8 -*-
"""AST0016：AI 公式助手接入 AST 编译校验（不依赖数据库）。

验证 _ast_compile_for_draft（best-effort）：

- AI 公式有效 → 返回结构化结果，repair_hints 为空。
- AI 公式无效 → 结构化错误转为友好修复建议（repair_hints）。
- 任何异常被吞掉，绝不阻断 AI 草稿主流程。
- AI 只能产出公式，最终 SQL 由 AST 编译器生成（不直接生成 SQL 入库）。
"""
import asyncio

import pytest

import app.ai_formula.ast.compiler as ast_compiler
import app.ai_formula.router as rtr
from app.ai_formula.ast import FormulaCompileError, FormulaCompileResult


def _fake(valid=True, errors=None):
    return FormulaCompileResult(
        valid=valid,
        sql="X",
        normalized_formula="=x",
        has_aggregate=True,
        dependencies=[],
        functions=[],
        warnings=[],
        errors=errors or [],
        ast=None,
        compiler={"engine": "ast", "version": "1.0.0"},
    )


def test_guardrail_success(monkeypatch):
    async def fc(*a, **k):
        return _fake()
    monkeypatch.setattr(ast_compiler, "compile_formula_to_sql", fc)
    out = asyncio.run(rtr._ast_compile_for_draft(object(), "=x", 1))
    assert out["valid"] is True
    assert out["repair_hints"] == []


def test_guardrail_error_to_hints(monkeypatch):
    err = FormulaCompileError(
        code="unknown_field", message="字段不存在", suggestion="改用 alias.列"
    )
    async def fc(*a, **k):
        return _fake(valid=False, errors=[err])
    monkeypatch.setattr(ast_compiler, "compile_formula_to_sql", fc)
    out = asyncio.run(rtr._ast_compile_for_draft(object(), "=x", 1))
    assert out["valid"] is False
    assert len(out["repair_hints"]) == 1
    assert "改用" in out["repair_hints"][0]


def test_guardrail_exception_swallowed(monkeypatch):
    async def fc(*a, **k):
        raise RuntimeError("boom")
    monkeypatch.setattr(ast_compiler, "compile_formula_to_sql", fc)
    out = asyncio.run(rtr._ast_compile_for_draft(object(), "=x", 1))
    # best-effort：异常被吞掉，返回 None，不影响草稿主流程
    assert out is None


def test_ai_does_not_generate_sql_directly(monkeypatch):
    # 契约：AI 草稿产出的是 formula（公式），SQL 由 AST 编译器生成。
    # _ast_compile_for_draft 接收的是 formula 文本，返回中 sql 由编译器产生。
    async def fc(*a, **k):
        return _fake()
    monkeypatch.setattr(ast_compiler, "compile_formula_to_sql", fc)
    out = asyncio.run(rtr._ast_compile_for_draft(object(), "=COUNT(current.a)", 1))
    assert "sql" in out
    assert out["compiler"]["engine"] == "ast"
