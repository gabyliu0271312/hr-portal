# -*- coding: utf-8 -*-
"""AST0001：错误模型单元测试（不依赖数据库）。

覆盖 SourceSpan / FormulaCompileError / FormulaCompileWarning / flatten_errors。
"""
import json

import pytest

from app.ai_formula.ast import (
    FormulaCompileError,
    FormulaCompileWarning,
    SourceSpan,
    flatten_errors,
)


def test_source_span_to_dict():
    s = SourceSpan(start=2, end=5, fragment="SUM")
    d = s.to_dict()
    assert d == {"start": 2, "end": 5, "fragment": "SUM"}


def test_source_span_contains():
    outer = SourceSpan(0, 10)
    inner = SourceSpan(2, 5)
    assert outer.contains(inner) is True
    assert outer.contains(SourceSpan(2, 12)) is False
    assert outer.contains(None) is False


def test_error_required_fields():
    e = FormulaCompileError(code="unknown_field", message="字段不存在", field="员工类型")
    d = e.to_dict()
    assert d["code"] == "unknown_field"
    assert d["message"] == "字段不存在"
    assert d["field"] == "员工类型"
    # 可选字段不应出现
    assert "suggestion" not in d
    assert "start" not in d


def test_error_full_fields():
    e = FormulaCompileError(
        code="unsupported_function",
        message="暂不支持函数 IFERROR",
        start=3,
        end=10,
        fragment="IFERROR",
        suggestion="请使用白名单内的函数",
        function="IFERROR",
    )
    d = e.to_dict()
    assert d["start"] == 3
    assert d["end"] == 10
    assert d["fragment"] == "IFERROR"
    assert d["suggestion"] == "请使用白名单内的函数"
    assert d["function"] == "IFERROR"


def test_warning_to_dict():
    w = FormulaCompileWarning(
        code="criteria_type_inferred",
        message="条件已按数值自动推断",
        start=1,
        end=3,
        fragment=">=100",
        suggestion="请确认字段类型",
    )
    d = w.to_dict()
    assert d["code"] == "criteria_type_inferred"
    assert d["suggestion"] == "请确认字段类型"
    # 可选字段缺失时不出现
    w2 = FormulaCompileWarning(code="x", message="y")
    assert "start" not in w2.to_dict()


def test_flatten_errors_uses_suggestion():
    errs = [
        FormulaCompileError(
            code="e1", message="错误信息", suggestion="修复建议"
        ),
        FormulaCompileError(code="e2", message="只有消息"),
    ]
    out = flatten_errors(errs)
    assert out[0] == "错误信息（建议：修复建议）"
    assert out[1] == "只有消息"


def test_error_is_json_serializable():
    e = FormulaCompileError(
        code="unsupported_function",
        message="暂不支持函数 IFERROR",
        function="IFERROR",
        suggestion="换一个函数",
    )
    json.dumps(e.to_dict())
