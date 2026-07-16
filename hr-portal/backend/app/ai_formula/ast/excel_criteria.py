# -*- coding: utf-8 -*-
"""Excel 条件语义编译（AST 阶段 8：AST0008）。

将 COUNTIF/SUMIF 等的条件字符串翻译为 SQL 布尔条件。
覆盖第 8 章全部规则：精确值、*、前缀/后缀/单字符通配、
数值/日期比较、不等于、等于空等。

返回：(sql_condition, warnings)
"""
from __future__ import annotations

import re
from typing import Any

from .errors import FormulaCompileWarning

# 比较运算符（2 字符优先）
_COMPARISONS = ["<=", ">=", "<>", ">", "<", "="]

_DATE_RE = re.compile(r"^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?$")
_NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")

_NUMBER_TYPES = ("number", "numeric", "integer", "int", "decimal", "float", "double")


def _escape_sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _escape_like_pattern(value: str) -> str:
    """Excel 通配符 -> SQL LIKE pattern（保留反斜杠 % _ 转义）。"""
    out: list[str] = []
    for ch in value:
        if ch in ("\\", "%", "_"):
            out.append("\\" + ch)
        elif ch == "*":
            out.append("%")
        elif ch == "?":
            out.append("_")
        else:
            out.append(ch)
    return "".join(out)


def _is_date_type(data_type: str | None) -> bool:
    if not data_type:
        return False
    t = data_type.lower()
    return t in ("date", "timestamp", "datetime", "timestamptz", "timestamp with time zone")


def _build_condition(
    col_sql: str,
    op: str,
    rest: str,
    *,
    data_type: str | None,
    warnings: list[FormulaCompileWarning],
) -> str:
    """构造 col {op} value 的标准比较条件。

    处理日期/数值/文本的自动推断，并在类型未知时产出
    criteria_type_inferred 警告（命中第 8.2 章）。
    """
    sql_op = "<>" if op == "<>" else op
    # 日期
    if _DATE_RE.match(rest):
        if not _is_date_type(data_type):
            warnings.append(
                FormulaCompileWarning(
                    code="criteria_type_inferred",
                    message=f"条件 {op}{rest!r} 已按日期自动推断，请确认字段类型是否为日期",
                )
            )
        return f"{col_sql} {sql_op} DATE '{rest}'"
    # 数值
    if _NUM_RE.match(rest):
        if not data_type or data_type.lower() not in _NUMBER_TYPES:
            warnings.append(
                FormulaCompileWarning(
                    code="criteria_type_inferred",
                    message=f"条件 {op}{rest!r} 已按数值自动推断，请确认字段类型是否为数值",
                )
            )
        return f"{col_sql} {sql_op} {rest}"
    # 文本
    return f"{col_sql} {sql_op} {_escape_sql_string(rest)}"


def compile_criterion(
    col_sql: str,
    criterion: str,
    *,
    data_type: str | None = None,
) -> tuple[str, list[FormulaCompileWarning]]:
    warnings: list[FormulaCompileWarning] = []
    c = (criterion or "").strip()

    # 通配 *（任意非空文本）
    if c == "*":
        return (
            f"{col_sql} IS NOT NULL AND {col_sql}::text <> ''",
            warnings,
        )

    # 前导比较运算符
    op = None
    rest = c
    for cand in _COMPARISONS:
        if c.startswith(cand):
            op = cand
            rest = c[len(cand):].strip()
            break

    if op is None:
        # 无运算符：通配或精确文本
        if "*" in c or "?" in c:
            pattern = _escape_like_pattern(c)
            return (f"{col_sql}::text LIKE '{pattern}' ESCAPE '\\'", warnings)
        return (f"{col_sql} = {_escape_sql_string(c)}", warnings)

    if rest == "":
        if op == "=":
            return (f"{col_sql} IS NULL OR {col_sql}::text = ''", warnings)
        if op == "<>":
            return (f"{col_sql} IS NOT NULL AND {col_sql}::text <> ''", warnings)
        # 其它运算符缺少右值，按文本空处理
        return (f"{col_sql} {op} ''", warnings)

    # 非空前导运算符
    condition = _build_condition(
        col_sql, op, rest, data_type=data_type, warnings=warnings
    )
    # Excel <>x 等价于“不等于 x”，NULL 也应计入（NULL 不等于 x）
    if op == "<>":
        return (f"({condition}) OR {col_sql} IS NULL", warnings)
    return (condition, warnings)
