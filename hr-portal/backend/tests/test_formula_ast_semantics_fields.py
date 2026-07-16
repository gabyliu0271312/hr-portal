# -*- coding: utf-8 -*-
"""AST0006：字段映射语义分析单元测试（不依赖数据库）。"""
from app.ai_formula.ast import (
    FieldInfo,
    FieldResolver,
    FormulaCompileOptions,
    compile_formula,
)


def _compile(formula, fields):
    resolver = FieldResolver([FieldInfo(**f) for f in fields])
    return compile_formula(formula, resolver, options=FormulaCompileOptions())


def test_qualified_field_maps():
    r = _compile(
        "=current.员工类型",
        [{"alias": "current", "column": "employee_type", "label": "current.员工类型", "data_type": "text"}],
    )
    assert r.valid, r.errors
    assert '"current"."employee_type"' in r.sql


def test_bare_label_maps():
    r = _compile(
        "=员工类型",
        [{"alias": "current", "column": "employee_type", "label": "current.员工类型"}],
    )
    assert r.valid, r.errors
    assert '"current"."employee_type"' in r.sql


def test_unknown_field():
    r = _compile("=不存在", [{"alias": "current", "column": "x"}])
    assert not r.valid
    assert any(e.code == "unknown_field" for e in r.errors)


def test_ambiguous_field():
    r = _compile(
        "=dept",
        [
            {"alias": "current", "column": "dept", "label": "current.dept"},
            {"alias": "history", "column": "dept", "label": "history.dept"},
        ],
    )
    assert not r.valid
    assert any(e.code == "ambiguous_field" for e in r.errors)


def test_qualified_disambiguates():
    r = _compile(
        "=current.dept",
        [
            {"alias": "current", "column": "dept", "label": "current.dept"},
            {"alias": "history", "column": "dept", "label": "history.dept"},
        ],
    )
    assert r.valid, r.errors
    assert '"current"."dept"' in r.sql
    assert '"history"' not in r.sql


def test_dependencies_collected():
    r = _compile(
        "=COUNT(current.员工类型)",
        [{"alias": "current", "column": "employee_type", "label": "current.员工类型"}],
    )
    assert r.valid
    assert r.dependencies == [{
        "field_code": "employee_type",
        "field_label": "员工类型",
        "source_alias": "current",
        "source_column": "employee_type",
    }]
