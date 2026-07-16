# -*- coding: utf-8 -*-
"""AST0014 preview=true 的样本预览执行器测试（全 DB-free）。

通过注入 fake db（其 execute 返回可编排的假结果）与 monkeypatch
验证 run_preview / _resolve_from_table 的边界：

- 聚合公式：返回单行标量（value / row_count=1）
- 空表聚合：value=0, row_count=1
- 非聚合多行：value 取首行，row_count=实际行数
- 执行异常：吞掉并转 warnings（preview_exec_error），绝不外抛
- 无源表：preview_no_table 警告
- _resolve_from_table：优先选被引用列最多的表
- compile_formula_to_sql 在 preview=True 时回填 preview_result
- 编译无效时不触发预览
"""
from __future__ import annotations

import asyncio

import pytest

from app.ai_formula.ast import FieldInfo, FormulaCompileOptions
from app.ai_formula.ast.preview import _resolve_from_table, run_preview


class _Rows:
    def __init__(self, data):
        self._d = data

    def all(self):
        return self._d

    def mappings(self):
        return self


class _FakeDB:
    def __init__(self, rows=None, raise_exc=None):
        self._rows = rows or []
        self._raise = raise_exc

    async def execute(self, *a, **k):
        if self._raise is not None:
            raise self._raise
        return _Rows(self._rows)


def _fields(*aliases):
    class _F:
        def __init__(self, alias):
            self.alias = alias

    return [_F(a) for a in aliases]


async def _resolve_emp(*a, **k):
    return ("t_emp", "current")


def test_preview_aggregate_returns_value(monkeypatch):
    monkeypatch.setattr(
        "app.ai_formula.ast.preview._resolve_from_table", _resolve_emp
    )
    db = _FakeDB(rows=[{"value": 0.82}])
    pr = asyncio.run(
        run_preview(
            db,
            "COUNT(*) FILTER (WHERE \"status\" = '正式员工')::numeric / NULLIF(COUNT(*),0)",
            1,
            fields=_fields("current"),
            limit=1,
        )
    )
    assert pr["value"] == 0.82
    assert pr["row_count"] == 1
    assert pr["warnings"] == []


def test_preview_empty_table_aggregate(monkeypatch):
    # COUNT 在空表上返回 0；预览应返回 0 而非 None
    monkeypatch.setattr(
        "app.ai_formula.ast.preview._resolve_from_table", _resolve_emp
    )
    db = _FakeDB(rows=[{"value": 0}])
    pr = asyncio.run(
        run_preview(db, "COUNT(*)", 1, fields=_fields("current"), limit=1)
    )
    assert pr["value"] == 0
    assert pr["row_count"] == 1
    assert pr["warnings"] == []


def test_preview_non_aggregate_multi_row(monkeypatch):
    # 表达式模式（非聚合）：返回多行，value 取首行
    monkeypatch.setattr(
        "app.ai_formula.ast.preview._resolve_from_table", _resolve_emp
    )
    db = _FakeDB(rows=[{"value": 1}, {"value": 2}, {"value": 3}])
    pr = asyncio.run(
        run_preview(db, '"salary"', 1, fields=_fields("current"), limit=1)
    )
    assert pr["value"] == 1
    assert pr["row_count"] == 3
    assert pr["warnings"] == []


def test_preview_exec_error_caught(monkeypatch):
    monkeypatch.setattr(
        "app.ai_formula.ast.preview._resolve_from_table", _resolve_emp
    )
    db = _FakeDB(raise_exc=RuntimeError("relation \"t_emp\" does not exist"))
    pr = asyncio.run(
        run_preview(db, "COUNT(*)", 1, fields=_fields("current"), limit=1)
    )
    assert pr["value"] is None
    assert pr["row_count"] == 0
    assert len(pr["warnings"]) == 1
    assert pr["warnings"][0]["code"] == "preview_exec_error"


def test_preview_no_table():
    # 空 fake db：_resolve_from_table 查不到源表 → preview_no_table
    pr = asyncio.run(
        run_preview(_FakeDB(), "COUNT(*)", 1, fields=_fields("current"), limit=1)
    )
    assert pr["value"] is None
    assert pr["row_count"] == 0
    assert any(w["code"] == "preview_no_table" for w in pr["warnings"])


def test_resolve_from_table_picks_most_referenced():
    # dataset 有 current(t_emp) 与 hr(t_hr) 两张表；
    # 公式引用 current 两次、hr 一次 → 应选 t_emp
    db = _FakeDB(rows=[("current", "t_emp"), ("hr", "t_hr")])
    tbl, alias = asyncio.run(
        _resolve_from_table(db, 1, _fields("current", "current", "hr"))
    )
    assert tbl == "t_emp"
    assert alias == "current"


def test_resolve_from_table_fallback_first():
    db = _FakeDB(rows=[("a", "t_a"), ("b", "t_b")])
    tbl, alias = asyncio.run(_resolve_from_table(db, 1, None))  # 无 fields → 取第一张
    assert tbl == "t_a"
    assert alias == "a"


def test_compile_to_sql_populates_preview(monkeypatch):
    from app.ai_formula.ast.compiler import compile_formula_to_sql

    async def _fake_meta(dataset_id, db):
        return (None, [FieldInfo(alias="current", column="a", data_type="integer")])

    monkeypatch.setattr(
        "app.ai_formula.field_refs.dataset_field_meta", _fake_meta
    )

    async def _fake_preview(db, sql, dataset_id, *, fields=None, limit=1):
        return {"value": 0.5, "row_count": 1, "warnings": []}

    monkeypatch.setattr(
        "app.ai_formula.ast.preview.run_preview", _fake_preview
    )

    db = _FakeDB()
    result = asyncio.run(
        compile_formula_to_sql(
            db,
            "=COUNT(current.a)",
            1,
            mode="metric",
            options=FormulaCompileOptions(preview=True),
        )
    )
    assert result.valid is True
    assert result.preview_result == {"value": 0.5, "row_count": 1, "warnings": []}


def test_compile_to_sql_skips_preview_when_invalid(monkeypatch):
    from app.ai_formula.ast.compiler import compile_formula_to_sql

    async def _fake_meta(dataset_id, db):
        return (None, [FieldInfo(alias="current", column="a", data_type="integer")])

    monkeypatch.setattr(
        "app.ai_formula.field_refs.dataset_field_meta", _fake_meta
    )

    called = {"n": 0}

    async def _fake_preview(db, sql, dataset_id, *, fields=None, limit=1):
        called["n"] += 1
        return {"value": 1, "row_count": 1, "warnings": []}

    monkeypatch.setattr(
        "app.ai_formula.ast.preview.run_preview", _fake_preview
    )

    # 引用不存在的字段 → 编译无效 → 不应触发预览
    db = _FakeDB()
    result = asyncio.run(
        compile_formula_to_sql(
            db,
            "=COUNT(current.nope)",
            1,
            mode="metric",
            options=FormulaCompileOptions(preview=True),
        )
    )
    assert result.valid is False
    assert called["n"] == 0
    assert result.preview_result is None
