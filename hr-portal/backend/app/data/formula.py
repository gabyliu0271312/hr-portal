"""计算字段：安全的四则运算表达式求值器

公式串以 [列编码] 引用字段，运算符/数字/括号为字面量。例：
    [应发工资] + [社保] - 5000
    ([应发工资] - 5000) * 0.1

求值流程：把 [列编码] 替换成行内数值后，用 ast 白名单解析并计算，
不使用 eval。任一引用列缺失/非数值、除零、解析失败 → 返回 ""（留空）。
"""
from __future__ import annotations

import ast
import re
from typing import Any


_REF_RE = re.compile(r"\[([^\[\]]+)\]")

# 允许的 ast 节点（白名单）
_ALLOWED_BINOPS = (ast.Add, ast.Sub, ast.Mult, ast.Div)


def extract_refs(expr: str) -> list[str]:
    """返回公式里引用的列编码（按出现顺序去重）"""
    seen: list[str] = []
    for m in _REF_RE.findall(expr or ""):
        code = m.strip()
        if code and code not in seen:
            seen.append(code)
    return seen


def _to_number(v: Any) -> float | None:
    try:
        if isinstance(v, str):
            v = v.replace(",", "").strip()
        return float(v)
    except (TypeError, ValueError):
        return None


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise ValueError("only numeric constants allowed")
        return float(node.value)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        v = _eval_node(node.operand)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp) and isinstance(node.op, _ALLOWED_BINOPS):
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        # Div
        if right == 0:
            raise ZeroDivisionError
        return left / right
    raise ValueError(f"disallowed expression node: {type(node).__name__}")


def eval_formula(expr: str, row: dict) -> Any:
    """按行求值公式；任一引用缺失/非数值、除零、解析失败 → ""，否则 round(.,2)"""
    if not expr:
        return ""
    # 1) 替换 [列编码] → 数值字面量
    refs = extract_refs(expr)
    values: dict[str, float] = {}
    for code in refs:
        num = _to_number(row.get(code))
        if num is None:
            return ""
        values[code] = num

    def _sub(m: re.Match) -> str:
        code = m.group(1).strip()
        return repr(values[code])

    substituted = _REF_RE.sub(_sub, expr)

    # 2) 安全解析 + 求值
    try:
        tree = ast.parse(substituted, mode="eval")
        result = _eval_node(tree)
    except (SyntaxError, ValueError, ZeroDivisionError, TypeError):
        return ""
    if result != result or result in (float("inf"), float("-inf")):  # NaN/Inf
        return ""
    return round(result, 2)