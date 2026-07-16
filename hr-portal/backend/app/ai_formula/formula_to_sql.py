# -*- coding: utf-8 -*-
"""Excel 公式 → PostgreSQL SQL 翻译器

将用户输入的 Excel 风格公式（含 FIELD() 引用或 alias.字段名 引用）
翻译为可在 CREATE VIEW 中直接使用的 PostgreSQL 聚合表达式。

支持的翻译规则：
- SUM(x)        → SUM(x)
- COUNT(x)      → COUNT(x)
- AVERAGE(x)    → AVG(x)
- MAX(x)        → MAX(x)
- MIN(x)        → MIN(x)
- COUNTIF(c,v)  → COUNT(*) FILTER (WHERE c = v)
- SUMIF(cc,v,sc)→ SUM(sc) FILTER (WHERE cc = v)
- IF(c,a,b)     → CASE WHEN c THEN a ELSE b END
- AND(a,b,...)  → (a AND b AND ...)
- OR(a,b,...)   → (a OR b OR ...)
- NOT(x)        → (NOT x)
- ROUND(n,d)    → ROUND(n, d)
- ABS(n)        → ABS(n)
- ISBLANK(x)    → (x IS NULL)
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


# Excel 函数名 → SQL 函数名（直接映射）
DIRECT_SQL_FUNCTIONS = {
    "SUM": "SUM",
    "COUNT": "COUNT",
    "MAX": "MAX",
    "MIN": "MIN",
    "ROUND": "ROUND",
    "ABS": "ABS",
}

# 聚合函数集合（含条件聚合，用于检测公式是否包含聚合）
AGGREGATE_FUNCTIONS = {
    "SUM", "COUNT", "AVERAGE", "MAX", "MIN",
    "COUNTIF", "SUMIF", "COUNTIFS", "SUMIFS",
    "AVERAGEIF", "AVERAGEIFS",
}


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _split_args(expr: str) -> list[str]:
    """按逗号分割函数参数，正确处理嵌套括号和引号。"""
    args: list[str] = []
    depth = 0
    quote = ""
    current: list[str] = []
    for ch in expr:
        if quote:
            current.append(ch)
            if ch == quote:
                quote = ""
            continue
        if ch in ('"', "'"):
            quote = ch
            current.append(ch)
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            args.append("".join(current).strip())
            current = []
            continue
        current.append(ch)
    if current:
        args.append("".join(current).strip())
    return args


def _strip_quotes(value: str) -> str:
    """去掉首尾引号，SQL 字符串用单引号包裹。"""
    v = value.strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1]
    # 转义单引号
    v = v.replace("'", "''")
    return f"'{v}'"


def _translate_function(func_name: str, args: list[str]) -> str:
    """翻译单个 Excel 函数调用为 SQL 表达式。"""
    fn = func_name.upper()

    if fn in DIRECT_SQL_FUNCTIONS:
        sql_fn = DIRECT_SQL_FUNCTIONS[fn]
        if fn == "COUNT":
            return f"COUNT({'*' if not args else args[0]})"
        return f"{sql_fn}({', '.join(args)})"

    if fn == "AVERAGE":
        return f"AVG({', '.join(args)})"

    if fn == "COUNTIF":
        if len(args) >= 2:
            col, val = args[0], args[1]
            val = _strip_quotes(val) if (val.startswith('"') or val.startswith("'")) else val
            return f"COUNT(*) FILTER (WHERE {col} = {val})"
        return f"COUNT(*) FILTER (WHERE {args[0]})"

    if fn == "SUMIF":
        if len(args) >= 3:
            cond_col, cond_val, sum_col = args[0], args[1], args[2]
            cond_val = _strip_quotes(cond_val) if (cond_val.startswith('"') or cond_val.startswith("'")) else cond_val
            return f"SUM({sum_col}) FILTER (WHERE {cond_col} = {cond_val})"
        if len(args) >= 2:
            return f"SUM({args[0]}) FILTER (WHERE {args[1]})"
        return f"SUM({args[0]})"

    if fn == "COUNTIFS":
        if len(args) >= 4 and len(args) % 2 == 0:
            conditions = []
            for i in range(0, len(args), 2):
                col, val = args[i], args[i + 1]
                val = _strip_quotes(val) if (val.startswith('"') or val.startswith("'")) else val
                conditions.append(f"{col} = {val}")
            return f"COUNT(*) FILTER (WHERE {' AND '.join(conditions)})"
        return f"COUNT(*) FILTER (WHERE {' AND '.join(args)})"

    if fn == "SUMIFS":
        if len(args) >= 3:
            sum_col = args[0]
            conditions = []
            for i in range(1, len(args) - 1, 2):
                if i + 1 < len(args):
                    col, val = args[i], args[i + 1]
                    val = _strip_quotes(val) if (val.startswith('"') or val.startswith("'")) else val
                    conditions.append(f"{col} = {val}")
            if conditions:
                return f"SUM({sum_col}) FILTER (WHERE {' AND '.join(conditions)})"
        return f"SUM({args[0]})"

    if fn == "AVERAGEIF":
        if len(args) >= 3:
            cond_col, cond_val, avg_col = args[0], args[1], args[2]
            cond_val = _strip_quotes(cond_val) if (cond_val.startswith('"') or cond_val.startswith("'")) else cond_val
            return f"AVG({avg_col}) FILTER (WHERE {cond_col} = {cond_val})"
        if len(args) >= 2:
            return f"AVG({args[0]}) FILTER (WHERE {args[1]})"
        return f"AVG({args[0]})"

    if fn == "AVERAGEIFS":
        if len(args) >= 3:
            avg_col = args[0]
            conditions = []
            for i in range(1, len(args) - 1, 2):
                if i + 1 < len(args):
                    col, val = args[i], args[i + 1]
                    val = _strip_quotes(val) if (val.startswith('"') or val.startswith("'")) else val
                    conditions.append(f"{col} = {val}")
            if conditions:
                return f"AVG({avg_col}) FILTER (WHERE {' AND '.join(conditions)})"
        return f"AVG({args[0]})"

    if fn == "IF":
        if len(args) >= 3:
            return f"CASE WHEN {args[0]} THEN {args[1]} ELSE {args[2]} END"
        if len(args) == 2:
            return f"CASE WHEN {args[0]} THEN {args[1]} END"
        return f"CASE WHEN {args[0]} THEN 1 ELSE 0 END"

    if fn == "AND":
        inner = " AND ".join(args)
        return f"({inner})" if len(args) > 1 else inner

    if fn == "OR":
        inner = " OR ".join(args)
        return f"({inner})" if len(args) > 1 else inner

    if fn == "NOT":
        return f"(NOT {args[0]})" if args else "NOT TRUE"

    if fn == "ISBLANK":
        return f"({args[0]} IS NULL)" if args else "NULL"

    # 未知函数：原样返回（让数据库报错，而不是静默失败）
    return f"{fn}({', '.join(args)})"


def _translate_expr(expr: str) -> str:
    """递归翻译表达式中的函数调用。

    从外层向内层解析，处理嵌套函数调用如 IF(COUNTIF(...)>0, ...)。
    """
    expr = expr.strip()
    # 找到第一个顶层函数调用
    match = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s*\(', expr)
    if not match:
        return expr

    fn_name = match.group(1)
    # 找到匹配的右括号
    paren_start = match.end() - 1  # 指向 '('
    depth = 0
    for i, ch in enumerate(expr):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                inner = expr[paren_start + 1:i]
                rest = expr[i + 1:].strip()
                args = _split_args(inner)
                translated_args = [_translate_expr(arg) for arg in args]
                result = _translate_function(fn_name, translated_args)
                if rest:
                    return f"{result} {rest}"
                return result

    return expr


def _wrap_division_with_nullif(sql: str) -> str:
    """对除法运算的分母自动包裹 NULLIF(expr, 0)，防止 division by zero。

    策略：从右向左扫描，找到 / 运算符后，提取分母表达式并包裹 NULLIF。
    NULLIF(expr, 0) 对非零值无影响，只在分母为0时返回 NULL，避免 PostgreSQL 异常。

    需要正确处理嵌套函数调用作为分母的情况，例如：
      COUNT(*) → NULLIF(COUNT(*), 0)
      COUNT(*) FILTER (WHERE ...) → NULLIF(COUNT(*) FILTER (WHERE ...), 0)
      AVG(salary) → NULLIF(AVG(salary), 0)
    """
    # 找到所有 / 运算符的位置（不在引号内）
    positions: list[int] = []
    in_quote = False
    quote_char = ""
    for i, ch in enumerate(sql):
        if in_quote:
            if ch == quote_char:
                in_quote = False
            continue
        if ch in ("'", '"'):
            in_quote = True
            quote_char = ch
            continue
        if ch == '/' and i > 0:
            # 确保不是 * 之后的 /（即不是注释）
            positions.append(i)

    # 从右向左处理，避免左侧处理后位移影响右侧位置
    result = sql
    for pos in reversed(positions):
        # 提取分母：从 / 之后到下一个运算符或表达式结束
        # 分母可能是：简单标识符、函数调用、括号表达式、数字常量
        numerator_part = result[:pos].rstrip()
        denominator_and_rest = result[pos + 1:].lstrip()

        # 提取分母表达式的结束位置
        denom_end = _find_expr_end(denominator_and_rest)
        denominator = denominator_and_rest[:denom_end].strip()
        rest = denominator_and_rest[denom_end:]

        # 如果分母已经是 NULLIF(...) 包裹，跳过
        if denominator.upper().startswith("NULLIF"):
            continue

        # 包裹分母
        wrapped_denom = f"NULLIF({denominator}, 0)"
        result = f"{numerator_part} / {wrapped_denom}{rest}"

    return result


def _find_expr_end(s: str) -> int:
    """找到表达式的结束位置（从字符串开头算起）。

    表达式结束标志：遇到空格后跟运算符 +-*/ 或关键字 AND/OR/THEN/ELSE/END/CASE/WHEN/FILTER，
    或者字符串结束。
    正确处理嵌套括号。
    """
    depth = 0
    in_quote = False
    quote_char = ""
    i = 0

    while i < len(s):
        ch = s[i]

        if in_quote:
            if ch == quote_char:
                in_quote = False
            i += 1
            continue

        if ch in ("'", '"'):
            in_quote = True
            quote_char = ch
            i += 1
            continue

        if ch == '(':
            depth += 1
            i += 1
            continue

        if ch == ')':
            depth -= 1
            if depth < 0:
                # 多余的右括号，当前表达式到此结束
                return i
            i += 1
            continue

        # 在括号外，遇到运算符或关键字前有空格 → 表达式结束
        if depth == 0:
            # 检查是否遇到 * 或 + 或 - 运算符（前面不是字母，排除标识符中的情况）
            if ch in ('*', '+', '-') and i > 0 and s[i - 1] != '(':
                # 但 * 可能是 COUNT(*) 的一部分，需要检查上下文
                # 如果 * 前面是 ( 且后面是 )，它是一个完整的 COUNT(*) 表达式
                if ch == '*' and i > 0 and s[i - 1] == '(':
                    i += 1
                    continue
                return i
            # 检查是否遇到另一个 / 运算符
            if ch == '/':
                return i

            # 检查关键字分隔（空格+关键字）
            if ch == ' ':
                # 看空格后面是否是运算符或SQL关键字
                rest_after_space = s[i:].strip()
                upper_rest = rest_after_space.upper()
                keywords = ['AND ', 'OR ', 'THEN ', 'ELSE ', 'END ', 'CASE ', 'WHEN ',
                            'FILTER ', 'GROUP ', 'ORDER ', 'HAVING ', 'LIMIT ', 'UNION ',
                            'AS ', 'IS ', 'NOT ', 'IN ']
                for kw in keywords:
                    if upper_rest.startswith(kw):
                        return i
                # 空格后跟运算符
                if rest_after_space and rest_after_space[0] in ('+', '-', '*', '/', '=', '!', '<', '>'):
                    return i

        i += 1

    return len(s)


def _translate_comparison_operators(expr: str) -> str:
    """将 Excel 比较运算符转为 SQL 标准形式。

    <> → !=（已在 normalize 中处理）
    =  → =（SQL 标准）
    """
    return expr


async def _build_field_mapping(
    db: AsyncSession, dataset_id: int
) -> dict[str, tuple[str, str]]:
    """构建字段引用 → (source_alias, source_column) 的映射表。

    从 DatasetOutputField 读取所有输出字段，生成多种引用形式的映射：
    - output_code → (alias, source_column)
    - alias.output_code → (alias, source_column)
    - output_label → (alias, source_column)
    - alias.output_label → (alias, source_column)
    """
    from app.datasets.models import DatasetOutputField

    rows = (
        await db.execute(
            select(DatasetOutputField).where(
                DatasetOutputField.dataset_id == dataset_id
            )
        )
    ).scalars().all()

    mapping: dict[str, tuple[str, str]] = {}
    for f in rows:
        alias = f.source_alias
        col = f.source_column
        # output_code 的各种形式
        if f.output_code:
            mapping[f.output_code] = (alias, col)
            mapping[f"{alias}.{f.output_code}"] = (alias, col)
        # output_label 的各种形式
        if f.output_label:
            mapping[f.output_label] = (alias, col)
            mapping[f"{alias}.{f.output_label}"] = (alias, col)
        # source_column 本身（兼容直接用列名）
        mapping[col] = (alias, col)
        mapping[f"{alias}.{col}"] = (alias, col)

    return mapping


def _replace_field_refs(expr: str, field_map: dict[str, tuple[str, str]]) -> str:
    """替换表达式中的字段引用为带引号的 SQL 标识符。

    按 key 长度降序匹配，避免短 key 误匹配长 key 的前缀。
    跳过引号内的字符串。
    """
    # 按 key 长度降序排序
    sorted_keys = sorted(field_map.keys(), key=len, reverse=True)

    # 构建正则：匹配 alias.field_name 或纯 field_name 模式
    # 使用边界检测避免误匹配
    result = expr
    for key in sorted_keys:
        alias, col = field_map[key]
        replacement = f'{_quote_ident(alias)}.{_quote_ident(col)}'
        # 使用正则替换，确保在表达式边界处匹配
        # 匹配模式：key 前面不能是字母数字下划线或点，后面不能是字母数字下划线
        pattern = re.compile(
            rf'(?<![a-zA-Z0-9_."\'.]){re.escape(key)}(?![a-zA-Z0-9_])'
        )
        result = pattern.sub(replacement, result)

    return result


def _has_aggregate_functions(expr: str) -> bool:
    """检测表达式是否包含聚合函数。"""
    upper = expr.upper()
    for fn in AGGREGATE_FUNCTIONS:
        # 匹配函数调用模式：FN(
        if re.search(rf'\b{fn}\s*\(', upper):
            return True
    return False


async def translate_formula_to_sql(
    db: AsyncSession,
    formula: str,
    dataset_id: int,
) -> dict[str, Any]:
    """将 Excel 公式翻译为 PostgreSQL SQL 表达式。

    Returns:
        dict with keys:
        - sql: 翻译后的 SQL 表达式
        - valid: 是否翻译成功
        - errors: 错误列表
        - has_aggregate: 是否包含聚合函数
    """
    if not formula or not formula.strip():
        return {"sql": "", "valid": False, "errors": ["公式不能为空"], "has_aggregate": False}

    errors: list[str] = []

    # 1. 规范化：去掉 = 前缀，统一括号
    expr = formula.strip().lstrip("=").strip()

    # 2. 构建字段映射
    try:
        field_map = await _build_field_mapping(db, dataset_id)
    except Exception as e:
        return {"sql": "", "valid": False, "errors": [f"字段映射构建失败: {e}"], "has_aggregate": False}

    if not field_map:
        errors.append("数据集没有输出字段，无法翻译公式")

    # 3. 替换字段引用
    expr = _replace_field_refs(expr, field_map)

    # 4. 检测聚合函数
    has_aggregate = _has_aggregate_functions(expr)

    # 5. 翻译函数调用
    try:
        sql = _translate_expr(expr)
    except Exception as e:
        errors.append(f"公式翻译失败: {e}")
        return {"sql": "", "valid": False, "errors": errors, "has_aggregate": has_aggregate}

    # 6. 除零保护：对 / 运算符的分母自动包裹 NULLIF(expr, 0)
    sql = _wrap_division_with_nullif(sql)

    # 7. 校验：翻译后不应残留中文或未处理的 FIELD() 调用
    if "FIELD(" in sql.upper():
        errors.append("公式包含未翻译的 FIELD() 引用")

    valid = len(errors) == 0
    return {"sql": sql, "valid": valid, "errors": errors, "has_aggregate": has_aggregate}