# -*- coding: utf-8 -*-
"""AST0018：正式员工比例端到端验收（不依赖数据库）。

公式：=COUNTIF(current.员工类型,"正式员工")/COUNTIF(current.员工类型,"*")
期望：
- 无 COUNTIF( 残留
- 分母自动 NULLIF(...,0)::numeric（小数除法）
- has_aggregate = True
- 结构等价于文档第 17 章示例
"""
import pytest

from app.ai_formula.ast import (
    FieldInfo,
    FieldResolver,
    FormulaCompileOptions,
    compile_formula,
)


def _resolver():
    return FieldResolver([
        FieldInfo(
            alias="current", column="employee_type",
            data_type="text", label="current.员工类型",
        ),
    ])


def test_employee_ratio_sql_structure():
    formula = '=COUNTIF(current.员工类型,"正式员工")/COUNTIF(current.员工类型,"*")'
    result = compile_formula(
        formula, _resolver(),
        options=FormulaCompileOptions(include_ast=True),
    )
    assert result.valid, result.errors
    sql = result.sql
    # 不残留 Excel 函数名
    assert "COUNTIF(" not in sql
    assert "COUNTIF " not in sql.upper()
    # 分子
    assert '"current"."employee_type" = \'正式员工\'' in sql
    # 分母 NULLIF + ::numeric
    assert "NULLIF(" in sql
    assert "::numeric" in sql
    assert 'IS NOT NULL AND "current"."employee_type"::text <> ' in sql
    # 聚合标记
    assert result.has_aggregate is True
    # 函数识别
    assert result.functions == ["COUNTIF"]
    # 依赖字段
    assert result.dependencies == [{
        "field_code": "employee_type",
        "field_label": "员工类型",
        "source_alias": "current",
        "source_column": "employee_type",
    }]
    # AST 可序列化
    assert result.ast is not None
    assert result.ast["type"] == "BinaryOp"
    assert result.ast["op"] == "/"


def test_employee_ratio_is_deterministic():
    formula = '=COUNTIF(current.员工类型,"正式员工")/COUNTIF(current.员工类型,"*")'
    a = compile_formula(formula, _resolver()).sql
    b = compile_formula(formula, _resolver()).sql
    assert a == b  # 确定性


def test_ratio_denominator_numeric_division():
    """分母为 0 时返回 null（由 NULLIF 保证），不发生整数除法。"""
    formula = '=COUNTIF(current.员工类型,"正式员工")/COUNTIF(current.员工类型,"*")'
    result = compile_formula(formula, _resolver())
    # 分母整体被包裹为 NULLIF(..., 0)::numeric
    assert "NULLIF(COUNT(*) FILTER (WHERE " in result.sql
    assert result.sql.rstrip().endswith("::numeric")
