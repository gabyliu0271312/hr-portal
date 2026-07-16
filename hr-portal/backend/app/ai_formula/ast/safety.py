# -*- coding: utf-8 -*-
"""生成 SQL 的安全校验（AST 阶段：SQL 安全规则，第 9 章）。

校验规则：
1. 不允许分号 ;
2. 不允许 DDL/DML 关键字
3. 不允许子查询（SELECT）
4. 不允许残留未翻译的 Excel 函数名
5. 不允许原样拼接用户 SQL（由生成器保证，此处做兜底检测）
"""
from __future__ import annotations

import re

from .errors import FormulaCompileError

# DDL/DML 关键字（单词边界匹配，避免误伤 create_time 等字段名）
_BLOCK_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER",
    "TRUNCATE", "CREATE", "GRANT", "REVOKE",
]

_BLOCK_RE = re.compile(
    r"\b(" + "|".join(_BLOCK_KEYWORDS) + r")\b", re.IGNORECASE
)

_SELECT_RE = re.compile(r"\bSELECT\b", re.IGNORECASE)

# 未翻译的 Excel 函数名（应已被生成器翻译，兜底检测）
_LEFTOVER_RE = re.compile(
    r"\b(COUNTIF|SUMIF|COUNTIFS|SUMIFS|AVERAGEIF|AVERAGEIFS|FIELD)\s*\(",
    re.IGNORECASE,
)


def safety_issues(sql: str) -> list[FormulaCompileError]:
    if not sql:
        return []
    issues: list[FormulaCompileError] = []
    if ";" in sql:
        issues.append(
            FormulaCompileError(
                code="sql_semicolon",
                message="生成的 SQL 不允许包含分号 ;",
                suggestion="请不要在公式中使用分号",
            )
        )
    m = _BLOCK_RE.search(sql)
    if m:
        issues.append(
            FormulaCompileError(
                code="sql_forbidden_keyword",
                message=f"生成的 SQL 包含禁止的关键字：{m.group(0).upper()}",
                suggestion="公式只允许聚合与标量计算，不允许写 DDL/DML",
            )
        )
    if _SELECT_RE.search(sql):
        issues.append(
            FormulaCompileError(
                code="sql_subquery",
                message="生成的 SQL 不允许包含子查询（SELECT）",
                suggestion="本期不支持子查询，请改写公式",
            )
        )
    m = _LEFTOVER_RE.search(sql)
    if m:
        issues.append(
            FormulaCompileError(
                code="untranslated_function",
                message=f"生成的 SQL 残留未翻译的 Excel 函数：{m.group(0).rstrip('(').upper()}",
                suggestion="该函数应在编译阶段被翻译，请报告此异常",
            )
        )
    return issues


# ==================== 函数白名单校验（阻断问题4 / AST0019） ====================
# 仅允许下列 SQL 安全函数出现在最终生成的 SQL 中。
# 任何未知函数名残留一律拒绝——杜绝 legacy 把 VLOOKUP 等原样拼进 SQL。
# 涵盖 AST 与 legacy 实际会安全生成的函数：
# - 聚合/标量：SUM COUNT AVG MAX MIN ROUND ABS
# - 条件/除法保护：NULLIF（除零保护）、FILTER（COUNTIF 等条件聚合子句）
# - 其他安全标量：COALESCE（IFERROR）、EXTRACT（YEAR/MONTH）
_SAFE_SQL_FUNCTIONS = frozenset(
    {
        "SUM", "COUNT", "AVG", "MAX", "MIN", "ROUND", "ABS",
        "COALESCE", "EXTRACT", "NULLIF", "FILTER",
    }
)

# 下列关键字由 safety_issues 单独处理（$;/DDL/DML/SELECT），
# 白名单检查不再将其重复报为“非白名单函数”。
_WHITELIST_IGNORE = frozenset(_BLOCK_KEYWORDS) | {"SELECT"}

# 匹配函数调用 NAME( （NAME 为标识符，后接可选空白与左括号）
_FUNC_CALL_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\s*\(")


def _strip_sql_strings(sql: str) -> str:
    """将 SQL 中的字符串字面量（单/双引号）整体替换为空格。

    避免把字面量内部的 NAME( 误判为函数调用（例如条件值
    col = 'VLOOKUP(foo)' 中的 VLOOKUP 不应被当作真实函数）。
    处理标准 SQL 的双写引号转义（'' 与 ""）。
    """
    out: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if ch in ("'", '"'):
            quote = ch
            out.append(" ")
            i += 1
            while i < n:
                c = sql[i]
                if c == quote:
                    if i + 1 < n and sql[i + 1] == quote:
                        # 转义引号（双写），仍属于字符串内部
                        out.append(" ")
                        i += 2
                        continue
                    out.append(" ")
                    i += 1
                    break
                out.append(" ")
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def validate_sql_function_whitelist(sql: str) -> list[str]:
    """扫描 SQL 中出现的函数调用名，返回不在安全白名单内的函数名列表（去重）。

    先做字符串剥离，避免字面量内的 NAME( 误报。
    """
    if not sql:
        return []
    stripped = _strip_sql_strings(sql)
    bad: list[str] = []
    seen: set[str] = set()
    for m in _FUNC_CALL_RE.finditer(stripped):
        name = m.group(1).upper()
        if name in _SAFE_SQL_FUNCTIONS or name in _WHITELIST_IGNORE:
            continue
        if name not in seen:
            seen.add(name)
            bad.append(name)
    return bad


def unauthorized_functions(sql: str) -> list[FormulaCompileError]:
    """与 safety_issues 对齐，返回非白名单函数残留的结构化错误列表。

    返回空列表表示所有函数均在白名单内。
    """
    names = validate_sql_function_whitelist(sql)
    if not names:
        return []
    return [
        FormulaCompileError(
            code="unauthorized_function",
            message=f"生成的 SQL 包含不在白名单内的函数：{', '.join(sorted(set(names)))}",
            suggestion="非白名单函数不得进入 SQL；请改用平台支持的聚合/标量函数，"
                      "或联系管理员按函数注册机制扩展白名单",
        )
    ]
