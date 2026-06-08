from __future__ import annotations

from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_formula.formula_evaluator import evaluate_formula
from app.ai_formula.function_catalog import base_formula_function_codes
from app.ai_formula.models import FormulaFunction, FormulaFunctionCatalogSetting


def _system_builtin_functions() -> dict[str, Callable[..., Any]]:
    return {
        "CALC_TAX": _calc_tax,
        "SAFE_DIVIDE": lambda a, b, default=0: _safe_divide(a, b, default),
    }


def system_builtin_codes() -> set[str]:
    return set(_system_builtin_functions().keys())


def sensitive_system_builtin_codes() -> set[str]:
    return {"CALC_TAX"}


def _num(value: Any) -> float:
    try:
        if isinstance(value, str):
            value = value.replace(",", "").strip()
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_divide(a: Any, b: Any, default: Any = 0) -> Any:
    divisor = _num(b)
    if divisor == 0:
        return default
    return _num(a) / divisor


def _calc_tax(amount: Any) -> float:
    taxable = max(_num(amount) - 5000, 0)
    brackets = [
        (36000, 0.03, 0),
        (144000, 0.10, 2520),
        (300000, 0.20, 16920),
        (420000, 0.25, 31920),
        (660000, 0.30, 52920),
        (960000, 0.35, 85920),
        (float("inf"), 0.45, 181920),
    ]
    for limit, rate, quick in brackets:
        if taxable <= limit:
            return round(taxable * rate - quick, 2)
    return 0.0


async def enabled_function_rows(db: AsyncSession) -> list[FormulaFunction]:
    return (
        await db.execute(
            select(FormulaFunction)
            .where(FormulaFunction.is_enabled.is_(True))
            .order_by(FormulaFunction.code)
        )
    ).scalars().all()


async def executable_functions(db: AsyncSession) -> dict[str, Callable[..., Any]]:
    rows = await enabled_function_rows(db)
    all_rows = (await db.execute(select(FormulaFunction))).scalars().all()
    configured_builtin_codes = {
        row.code.upper()
        for row in all_rows
        if row.function_type == "system_builtin"
    }
    enabled_builtin_codes = {
        row.code.upper()
        for row in rows
        if row.function_type == "system_builtin"
    }
    functions = {
        code: fn
        for code, fn in _system_builtin_functions().items()
        if (not configured_builtin_codes and not rows) or code in enabled_builtin_codes
    }
    for row in rows:
        code = row.code.upper()
        if row.function_type == "system_builtin":
            continue
        if row.function_type != "expression" or not row.formula_body:
            continue
        params = [p.get("name") for p in (row.parameters or []) if isinstance(p, dict) and p.get("name")]

        base_functions = dict(functions)

        def _make(body: str, names: list[str]):
            def _fn(*args: Any) -> Any:
                values = {name: args[i] if i < len(args) else "" for i, name in enumerate(names)}
                return evaluate_formula(
                    body,
                    field_resolver=lambda field: values.get(field, ""),
                    custom_functions=base_functions,
                )

            return _fn

        functions[code] = _make(row.formula_body, params)
    return functions


async def available_function_codes(db: AsyncSession) -> set[str]:
    rows = await enabled_function_rows(db)
    all_rows = (await db.execute(select(FormulaFunction))).scalars().all()
    configured_builtin_codes = {
        row.code.upper()
        for row in all_rows
        if row.function_type == "system_builtin"
    }
    enabled_builtin_codes = {
        row.code.upper()
        for row in rows
        if row.function_type == "system_builtin"
    }
    builtins = (
        set(_system_builtin_functions().keys())
        if not configured_builtin_codes and not rows
        else enabled_builtin_codes & set(_system_builtin_functions().keys())
    )
    catalog_settings = {
        row.code.upper(): row
        for row in (await db.execute(select(FormulaFunctionCatalogSetting))).scalars().all()
    }
    enabled_catalog_codes = set()
    for code in base_formula_function_codes():
        setting = catalog_settings.get(code)
        if setting is None:
            enabled_catalog_codes.add(code)
        elif setting.is_visible and setting.is_enabled:
            enabled_catalog_codes.add(code)
    return builtins | enabled_catalog_codes | {
        row.code.upper()
        for row in rows
        if row.function_type == "expression"
    }
