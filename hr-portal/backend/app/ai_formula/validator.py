from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_formula.custom_functions import (
    available_function_codes,
    enabled_function_rows,
    executable_functions,
    sensitive_system_builtin_codes,
)
from app.ai_formula.field_refs import dataset_field_meta, extract_field_refs, row_field_resolver
from app.ai_formula.formula_evaluator import evaluate_formula, formula_syntax_issues
from app.ai_formula.formula_parser import extract_formula_meta, normalize_formula
from app.ai_formula.formula_safety import safety_issues


async def validate_dataset_formula(
    dataset_id: int,
    formula: str,
    db: AsyncSession,
    *,
    sample_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized = normalize_formula(formula)
    issues = safety_issues(normalized)
    if not normalized:
        issues.append("公式不能为空")
    _, fields = await dataset_field_meta(dataset_id, db)
    field_codes = {f.code for f in fields}
    field_by_code = {f.code: f for f in fields}
    depends_on, used_functions = extract_formula_meta(normalized)
    if len(depends_on) > 20:
        issues.append("单个计算字段最多引用 20 个源字段")
    if len(used_functions) > 20:
        issues.append("单个计算字段最多调用 20 个函数")
    missing = [code for code in depends_on if code not in field_codes]
    if missing:
        issues.append(f"公式引用了不存在的数据集字段: {missing}")
    available_functions = await available_function_codes(db)
    allowed_functions = {"FIELD"} | available_functions
    issues.extend(formula_syntax_issues(normalized, allowed_functions=allowed_functions))
    unknown_funcs = [
        code
        for code in used_functions
        if code not in available_functions
    ]
    if unknown_funcs:
        issues.append(f"公式使用了未启用的函数: {unknown_funcs}")
    function_rows = await enabled_function_rows(db)
    sensitive_functions = {
        row.code.upper()
        for row in function_rows
        if row.is_sensitive_output and row.function_type in {"system_builtin", "expression"}
    } | sensitive_system_builtin_codes()
    referenced_sensitive_fields = [
        code for code in depends_on if code in field_by_code and field_by_code[code].is_sensitive
    ]
    sensitive_function_hits = [code for code in used_functions if code in sensitive_functions]
    is_sensitive = bool(sensitive_function_hits)
    warnings: list[str] = []
    if referenced_sensitive_fields:
        warnings.append(
            "公式引用了敏感源字段；计算字段不继承字段分类/可见分类授权，请按结果含义单独决定是否标记敏感。"
        )
    preview_value = None
    if not issues and sample_row is not None:
        preview_value = evaluate_formula(
            normalized,
            field_resolver=row_field_resolver(sample_row),
            custom_functions=await executable_functions(db),
        )
    return {
        "valid": not issues,
        "formula": normalized,
        "depends_on": depends_on,
        "used_functions": used_functions,
        "is_sensitive": is_sensitive,
        "warnings": warnings,
        "errors": issues,
        "preview_value": preview_value,
    }
