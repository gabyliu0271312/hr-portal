from __future__ import annotations

import ast
import re
from collections.abc import Callable
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from app.ai_formula.formula_safety import ensure_safe


_BOOL_REPLACEMENTS = (
    (re.compile(r"\bTRUE\b", re.IGNORECASE), "True"),
    (re.compile(r"\bFALSE\b", re.IGNORECASE), "False"),
)


def _to_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    try:
        if isinstance(value, str):
            value = value.replace(",", "").strip()
        return float(value)
    except (TypeError, ValueError):
        return None


def _money_round(value: Any, ndigits: int = 2) -> float | str:
    num = _to_number(value)
    if num is None:
        return ""
    try:
        quant = Decimal("1") if ndigits <= 0 else Decimal("1").scaleb(-ndigits)
        return float(Decimal(str(num)).quantize(quant, rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError):
        return ""


def _flatten(values: tuple[Any, ...]) -> list[Any]:
    out: list[Any] = []
    for value in values:
        if isinstance(value, (list, tuple)):
            out.extend(_flatten(tuple(value)))
        else:
            out.append(value)
    return out


def _fn_if(condition: Any, yes: Any, no: Any = "") -> Any:
    return yes if bool(condition) else no


def _fn_and(*values: Any) -> bool:
    return all(bool(v) for v in values)


def _fn_or(*values: Any) -> bool:
    return any(bool(v) for v in values)


def _fn_sum(*values: Any) -> float:
    total = 0.0
    for value in _flatten(values):
        num = _to_number(value)
        if num is not None:
            total += num
    return total


def _fn_average(*values: Any) -> Any:
    nums = [_to_number(v) for v in _flatten(values)]
    nums = [v for v in nums if v is not None]
    return sum(nums) / len(nums) if nums else ""


def _fn_min(*values: Any) -> Any:
    nums = [_to_number(v) for v in _flatten(values)]
    nums = [v for v in nums if v is not None]
    return min(nums) if nums else ""


def _fn_max(*values: Any) -> Any:
    nums = [_to_number(v) for v in _flatten(values)]
    nums = [v for v in nums if v is not None]
    return max(nums) if nums else ""


def _fn_isblank(value: Any = None) -> bool:
    return value in (None, "")


def _builtin_functions() -> dict[str, Callable[..., Any]]:
    return {
        "IF": _fn_if,
        "AND": _fn_and,
        "OR": _fn_or,
        "NOT": lambda value=False: not bool(value),
        "SUM": _fn_sum,
        "AVERAGE": _fn_average,
        "MIN": _fn_min,
        "MAX": _fn_max,
        "ROUND": lambda value, ndigits=0: _money_round(value, int(_to_number(ndigits) or 0)),
        "ABS": lambda value: abs(_to_number(value) or 0),
        "CONCAT": lambda *values: "".join("" if v is None else str(v) for v in values),
        "ISBLANK": _fn_isblank,
        "LEN": lambda value="": len(str(value or "")),
        "UPPER": lambda value="": str(value or "").upper(),
        "LOWER": lambda value="": str(value or "").lower(),
    }


class SafeFormulaEvaluator:
    def __init__(
        self,
        *,
        field_resolver: Callable[[str], Any],
        custom_functions: dict[str, Callable[..., Any]] | None = None,
    ):
        self.field_resolver = field_resolver
        self.functions = _builtin_functions()
        self.functions.update({k.upper(): v for k, v in (custom_functions or {}).items()})

    def evaluate(self, formula: str) -> Any:
        ensure_safe(formula)
        expr = self._to_python_expr(formula)
        try:
            tree = ast.parse(expr, mode="eval")
            return self._eval_node(tree)
        except Exception:
            return ""

    def _to_python_expr(self, formula: str) -> str:
        expr = (formula or "").strip()
        if expr.startswith("="):
            expr = expr[1:]
        expr = expr.replace("<>", "!=")
        expr = re.sub(r"(?<![<>=!])=(?!=)", "==", expr)
        for pattern, replacement in _BOOL_REPLACEMENTS:
            expr = pattern.sub(replacement, expr)
        return expr

    def _eval_node(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Expression):
            return self._eval_node(node.body)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.UnaryOp):
            value = self._eval_node(node.operand)
            if isinstance(node.op, ast.USub):
                return -(_to_number(value) or 0)
            if isinstance(node.op, ast.UAdd):
                return _to_number(value) or 0
            if isinstance(node.op, ast.Not):
                return not bool(value)
        if isinstance(node, ast.BinOp):
            return self._eval_binop(node)
        if isinstance(node, ast.BoolOp):
            values = [self._eval_node(v) for v in node.values]
            if isinstance(node.op, ast.And):
                return all(bool(v) for v in values)
            if isinstance(node.op, ast.Or):
                return any(bool(v) for v in values)
        if isinstance(node, ast.Compare):
            return self._eval_compare(node)
        if isinstance(node, ast.Call):
            return self._eval_call(node)
        raise ValueError(f"unsupported formula node: {type(node).__name__}")

    def _eval_binop(self, node: ast.BinOp) -> Any:
        left = self._eval_node(node.left)
        right = self._eval_node(node.right)
        if isinstance(node.op, ast.Add):
            if isinstance(left, str) or isinstance(right, str):
                return f"{'' if left is None else left}{'' if right is None else right}"
            return (_to_number(left) or 0) + (_to_number(right) or 0)
        if isinstance(node.op, ast.Sub):
            return (_to_number(left) or 0) - (_to_number(right) or 0)
        if isinstance(node.op, ast.Mult):
            return (_to_number(left) or 0) * (_to_number(right) or 0)
        if isinstance(node.op, ast.Div):
            divisor = _to_number(right)
            if divisor in (None, 0):
                return ""
            return (_to_number(left) or 0) / divisor
        raise ValueError("unsupported operator")

    def _eval_compare(self, node: ast.Compare) -> bool:
        left = self._eval_node(node.left)
        for op, comparator in zip(node.ops, node.comparators, strict=False):
            right = self._eval_node(comparator)
            if not self._compare_pair(left, right, op):
                return False
            left = right
        return True

    def _compare_pair(self, left: Any, right: Any, op: ast.cmpop) -> bool:
        ln = _to_number(left)
        rn = _to_number(right)
        a, b = (ln, rn) if ln is not None and rn is not None else (str(left or ""), str(right or ""))
        if isinstance(op, ast.Eq):
            return a == b
        if isinstance(op, ast.NotEq):
            return a != b
        if isinstance(op, ast.Gt):
            return a > b
        if isinstance(op, ast.GtE):
            return a >= b
        if isinstance(op, ast.Lt):
            return a < b
        if isinstance(op, ast.LtE):
            return a <= b
        raise ValueError("unsupported comparison")

    def _eval_call(self, node: ast.Call) -> Any:
        if not isinstance(node.func, ast.Name):
            raise ValueError("only function calls are allowed")
        name = node.func.id.upper()
        if name == "FIELD":
            if len(node.args) != 1 or not isinstance(node.args[0], ast.Constant):
                raise ValueError("FIELD requires one literal field code")
            return self.field_resolver(str(node.args[0].value))
        fn = self.functions.get(name)
        if fn is None:
            raise ValueError(f"unknown function: {name}")
        args = [self._eval_node(arg) for arg in node.args]
        return fn(*args)


def formula_syntax_issues(
    formula: str,
    *,
    allowed_functions: set[str] | None = None,
) -> list[str]:
    """Validate that the formula only uses the supported expression subset."""
    try:
        expr = SafeFormulaEvaluator(field_resolver=lambda _: "")._to_python_expr(formula)
        tree = ast.parse(expr, mode="eval")
    except (SyntaxError, ValueError) as exc:
        return [f"公式语法不合法: {exc}"]

    allowed = {name.upper() for name in allowed_functions} if allowed_functions else None
    issues: list[str] = []

    def check(node: ast.AST) -> None:
        if isinstance(node, ast.Expression):
            check(node.body)
            return
        if isinstance(node, ast.Constant):
            return
        if isinstance(node, ast.UnaryOp):
            if not isinstance(node.op, (ast.USub, ast.UAdd, ast.Not)):
                issues.append("公式包含不支持的一元运算")
            check(node.operand)
            return
        if isinstance(node, ast.BinOp):
            if not isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
                issues.append("公式仅支持 +、-、*、/ 四则运算")
            check(node.left)
            check(node.right)
            return
        if isinstance(node, ast.BoolOp):
            if not isinstance(node.op, (ast.And, ast.Or)):
                issues.append("公式包含不支持的布尔运算")
            for value in node.values:
                check(value)
            return
        if isinstance(node, ast.Compare):
            check(node.left)
            for op in node.ops:
                if not isinstance(op, (ast.Eq, ast.NotEq, ast.Gt, ast.GtE, ast.Lt, ast.LtE)):
                    issues.append("公式包含不支持的比较运算")
            for comparator in node.comparators:
                check(comparator)
            return
        if isinstance(node, ast.Call):
            if node.keywords:
                issues.append("函数调用不支持命名参数")
            if not isinstance(node.func, ast.Name):
                issues.append("函数调用只能使用函数名")
                return
            name = node.func.id.upper()
            if allowed is not None and name not in allowed:
                issues.append(f"公式使用了未启用的函数: {name}")
            if name == "FIELD":
                if len(node.args) != 1 or not isinstance(node.args[0], ast.Constant):
                    issues.append('FIELD 函数必须使用一个字面量字段编码，如 FIELD("salary.base")')
                elif not isinstance(node.args[0].value, str):
                    issues.append("FIELD 函数参数必须是字段编码字符串")
            for arg in node.args:
                check(arg)
            return
        issues.append(f"公式包含不支持的语法节点: {type(node).__name__}")

    check(tree)
    return issues


def evaluate_formula(
    formula: str,
    *,
    field_resolver: Callable[[str], Any],
    custom_functions: dict[str, Callable[..., Any]] | None = None,
) -> Any:
    return SafeFormulaEvaluator(
        field_resolver=field_resolver,
        custom_functions=custom_functions,
    ).evaluate(formula)
