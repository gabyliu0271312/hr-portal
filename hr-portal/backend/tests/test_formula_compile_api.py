# -*- coding: utf-8 -*-
"""AST0014：公式编译预览 API 单元测试（不依赖数据库）。

验证：
- POST /warehouse/metrics/compile-formula 返回 SQL / 依赖字段 / 函数 / warnings / errors。
- 可选返回 AST（include_ast=True）。
- 无权限访问数据集时返回 403。
"""
import asyncio

import pytest
from fastapi import HTTPException, status

import app.ai_formula.router as rtr
from app.ai_formula.ast import FormulaCompileResult
from app.ai_formula.router import FormulaCompileIn


def _fake_result(include_ast=False):
    return FormulaCompileResult(
        valid=True,
        sql="COUNT(*) FILTER (WHERE \"current\".\"x\" = 'a')",
        normalized_formula="=x",
        has_aggregate=True,
        dependencies=[{"field_code": "x", "field_label": "x",
                      "source_alias": "current", "source_column": "x"}],
        functions=["COUNTIF"],
        warnings=[],
        errors=[],
        ast={"type": "FunctionCall", "name": "COUNTIF"} if include_ast else None,
        compiler={"engine": "ast", "version": "1.0.0"},
    )


def _payload(include_ast=False):
    return FormulaCompileIn(
        dataset_id=1,
        formula_expr="=COUNTIF(current.x, \"a\")",
        mode="metric",
        include_ast=include_ast,
        preview=False,
    )


def test_compile_api_success(monkeypatch):
    async def fake_compile(*a, **k):
        return _fake_result()
    monkeypatch.setattr(rtr, "compile_formula_to_sql", fake_compile)
    async def _allow(*a, **k):
        return None
    monkeypatch.setattr(rtr, "_ensure_dataset_access", _allow)
    out = asyncio.run(rtr.compile_formula_endpoint(_payload(), object(), object()))
    assert out["valid"] is True
    assert out["sql"].startswith("COUNT(*)")
    assert out["dependencies"]
    assert out["functions"] == ["COUNTIF"]


def test_compile_api_include_ast(monkeypatch):
    async def fake_compile(*a, **k):
        return _fake_result(include_ast=True)
    monkeypatch.setattr(rtr, "compile_formula_to_sql", fake_compile)
    async def _allow(*a, **k):
        return None
    monkeypatch.setattr(rtr, "_ensure_dataset_access", _allow)
    out = asyncio.run(
        rtr.compile_formula_endpoint(_payload(include_ast=True), object(), object())
    )
    assert out["ast"] is not None
    assert out["ast"]["type"] == "FunctionCall"


def test_compile_api_forbidden(monkeypatch):
    async def fake_compile(*a, **k):
        return _fake_result()
    monkeypatch.setattr(rtr, "compile_formula_to_sql", fake_compile)

    def _deny(*a, **k):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该数据集")

    monkeypatch.setattr(rtr, "_ensure_dataset_access", _deny)
    with pytest.raises(HTTPException) as ei:
        asyncio.run(rtr.compile_formula_endpoint(_payload(), object(), object()))
    assert ei.value.status_code == 403


def test_compile_api_invalid_formula(monkeypatch):
    from app.ai_formula.ast import FormulaCompileError

    bad = FormulaCompileResult(
        valid=False, sql="", normalized_formula="=x",
        has_aggregate=False, dependencies=[], functions=[],
        warnings=[], errors=[FormulaCompileError(code="unknown_field", message="字段不存在")],
        ast=None, compiler={"engine": "ast", "version": "1.0.0"},
    )
    async def fake_compile(*a, **k):
        return bad
    monkeypatch.setattr(rtr, "compile_formula_to_sql", fake_compile)
    async def _allow(*a, **k):
        return None
    monkeypatch.setattr(rtr, "_ensure_dataset_access", _allow)
    out = asyncio.run(rtr.compile_formula_endpoint(_payload(), object(), object()))
    assert out["valid"] is False
    assert out["errors"]


def test_compile_api_dataset_unavailable(monkeypatch):
    """数据集字段读取失败时，编译 API 必须返回结构化 dataset_unavailable，
    而不是抛出 500（回归 compiler._result 参数名 bug）。走真实 compile_formula_to_sql。"""
    async def _allow(*a, **k):
        return None
    monkeypatch.setattr(rtr, "_ensure_dataset_access", _allow)

    async def _boom(dataset_id, db):
        raise RuntimeError("dataset field meta 读取失败")
    monkeypatch.setattr("app.ai_formula.field_refs.dataset_field_meta", _boom)

    # 不 mock compile_formula_to_sql，验证真实兜底不抛异常
    out = asyncio.run(rtr.compile_formula_endpoint(_payload(), object(), object()))
    assert out["valid"] is False
    assert any(e["code"] == "dataset_unavailable" for e in out["errors"])
    assert out["sql"] == ""
