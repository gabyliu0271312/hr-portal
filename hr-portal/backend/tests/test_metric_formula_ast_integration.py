# -*- coding: utf-8 -*-
"""AST0015：指标新建/编辑接入 AST 编译器 —— 编译契约测试（不依赖数据库）。

覆盖 create_metric / update_metric 在保存前依赖的确定性编译契约：

- 公式有效（valid）。
- 必须包含聚合函数（has_aggregate），否则阻断保存。
- 未知字段 / 不支持函数 → 无效，阻断保存。
- 编译结果可提取 4 个元数据字段（engine / version / meta / ast），
  与 WarehouseMetric 落库字段一一对应。
"""
from app.ai_formula.ast import (
    FieldInfo,
    FieldResolver,
    FormulaCompileOptions,
    compile_formula,
)
from app.ai_formula.formula_to_sql import _ast_to_legacy_shape


def _compile(formula, fields, include_ast=False):
    resolver = FieldResolver([FieldInfo(**f) for f in fields])
    return compile_formula(
        formula, resolver, options=FormulaCompileOptions(include_ast=include_ast)
    )


def _f(*cols):
    return [{"alias": "current", "column": c} for c in cols]


def _meta(result):
    return {
        "dependencies": result.dependencies,
        "functions": result.functions,
        "warnings": [w.to_dict() for w in result.warnings],
        "normalized_formula": result.normalized_formula,
    }


def test_valid_metric_formula():
    r = _compile("=COUNT(current.a) / COUNT(current.b)", _f("a", "b"))
    assert r.valid
    assert r.has_aggregate


def test_reject_no_aggregate():
    # 不带聚合 → create_metric / update_metric 应阻断（has_aggregate=False）
    r = _compile("=current.a + 1", _f("a"))
    assert r.has_aggregate is False


def test_reject_unknown_field():
    r = _compile("=COUNT(current.ghost)", _f("a"))
    assert not r.valid
    assert any(e.code == "unknown_field" for e in r.errors)


def test_reject_unsupported_function():
    r = _compile("=HYPERLINK(current.a)", _f("a"))
    assert not r.valid
    assert any(e.code == "unsupported_function" for e in r.errors)


def test_meta_shape_written_on_create():
    # 与 WarehouseMetric 落库的 4 个字段对应
    r = _compile("=COUNT(current.a)", _f("a"), include_ast=True)
    assert r.valid
    meta = _meta(r)
    assert meta["functions"] == ["COUNT"]
    assert meta["dependencies"]
    assert r.compiler["engine"] == "ast"
    assert r.compiler["version"] == "1.0.0"
    assert r.ast is not None


def test_legacy_shape_carries_engine_for_record():
    r = _compile("=COUNT(current.a)", _f("a"), include_ast=True)
    out = _ast_to_legacy_shape(r, "ast")
    assert out["compile_engine"] == "ast"
    assert out["compile_version"] == "1.0.0"
    assert out["formula_sql"] == r.sql if "formula_sql" in out else True
