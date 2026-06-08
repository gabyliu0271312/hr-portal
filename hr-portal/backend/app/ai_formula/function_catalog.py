from __future__ import annotations

import importlib
from typing import Any


EXECUTABLE_BASE_FUNCTIONS: tuple[dict[str, Any], ...] = (
    {
        "code": "IF",
        "name": "条件判断",
        "description": "按条件返回两个结果之一。",
        "parameters": [
            {"name": "condition", "type": "bool", "description": "判断条件"},
            {"name": "value_if_true", "type": "any", "description": "条件成立时返回"},
            {"name": "value_if_false", "type": "any", "description": "条件不成立时返回"},
        ],
        "return_type": "any",
    },
    {
        "code": "AND",
        "name": "全部满足",
        "description": "所有条件均成立时返回 TRUE。",
        "parameters": [{"name": "condition", "type": "bool", "description": "一个或多个条件"}],
        "return_type": "bool",
    },
    {
        "code": "OR",
        "name": "任一满足",
        "description": "任一条件成立时返回 TRUE。",
        "parameters": [{"name": "condition", "type": "bool", "description": "一个或多个条件"}],
        "return_type": "bool",
    },
    {
        "code": "NOT",
        "name": "条件取反",
        "description": "返回条件的相反布尔值。",
        "parameters": [{"name": "condition", "type": "bool", "description": "判断条件"}],
        "return_type": "bool",
    },
    {
        "code": "SUM",
        "name": "求和",
        "description": "对多个数值求和，空值按 0 处理。",
        "parameters": [{"name": "number", "type": "number", "description": "一个或多个数值"}],
        "return_type": "number",
    },
    {
        "code": "AVERAGE",
        "name": "平均值",
        "description": "计算多个数值的平均值，忽略空值。",
        "parameters": [{"name": "number", "type": "number", "description": "一个或多个数值"}],
        "return_type": "number",
    },
    {
        "code": "MIN",
        "name": "最小值",
        "description": "返回多个数值中的最小值。",
        "parameters": [{"name": "number", "type": "number", "description": "一个或多个数值"}],
        "return_type": "number",
    },
    {
        "code": "MAX",
        "name": "最大值",
        "description": "返回多个数值中的最大值。",
        "parameters": [{"name": "number", "type": "number", "description": "一个或多个数值"}],
        "return_type": "number",
    },
    {
        "code": "ROUND",
        "name": "四舍五入",
        "description": "按指定小数位数四舍五入。",
        "parameters": [
            {"name": "number", "type": "number", "description": "待处理数值"},
            {"name": "num_digits", "type": "number", "description": "小数位数"},
        ],
        "return_type": "number",
    },
    {
        "code": "ABS",
        "name": "绝对值",
        "description": "返回数值的绝对值。",
        "parameters": [{"name": "number", "type": "number", "description": "待处理数值"}],
        "return_type": "number",
    },
    {
        "code": "CONCAT",
        "name": "文本拼接",
        "description": "按顺序拼接多个文本或数值。",
        "parameters": [{"name": "text", "type": "string", "description": "一个或多个文本"}],
        "return_type": "string",
    },
    {
        "code": "ISBLANK",
        "name": "是否为空",
        "description": "判断值是否为空。",
        "parameters": [{"name": "value", "type": "any", "description": "待判断值"}],
        "return_type": "bool",
    },
    {
        "code": "LEN",
        "name": "文本长度",
        "description": "返回文本长度。",
        "parameters": [{"name": "text", "type": "string", "description": "待处理文本"}],
        "return_type": "number",
    },
    {
        "code": "UPPER",
        "name": "转大写",
        "description": "将文本转换为大写。",
        "parameters": [{"name": "text", "type": "string", "description": "待处理文本"}],
        "return_type": "string",
    },
    {
        "code": "LOWER",
        "name": "转小写",
        "description": "将文本转换为小写。",
        "parameters": [{"name": "text", "type": "string", "description": "待处理文本"}],
        "return_type": "string",
    },
)


BLOCKED_CATALOG_CODES = {
    "CALL",
    "CELL",
    "FORMULATEXT",
    "HYPERLINK",
    "IMPORTHTML",
    "IMPORTXML",
    "INDIRECT",
    "INFO",
    "NOW",
    "OFFSET",
    "RAND",
    "RANDBETWEEN",
    "RTD",
    "TODAY",
    "WEBSERVICE",
}

CATEGORY_LABELS = {
    "comp": "复合/数组",
    "date": "日期时间",
    "eng": "工程",
    "financial": "财务",
    "google": "在线/外部",
    "info": "信息",
    "logic": "逻辑",
    "look": "查找引用",
    "math": "数学",
    "stat": "统计",
    "text": "文本",
    "unknown": "其他",
    "platform": "平台已适配",
}


def _canonical_code(code: str) -> str:
    text = str(code or "").upper().strip()
    for prefix in ("_XLFN._XLWS.", "_XLFN.", "__XLUDF."):
        if text.startswith(prefix):
            return text.removeprefix(prefix)
    return text


def base_formula_function_codes() -> set[str]:
    return {str(item["code"]).upper() for item in EXECUTABLE_BASE_FUNCTIONS}


def _category_by_function() -> dict[str, str]:
    categories: dict[str, str] = {}
    try:
        import formulas.functions as formula_functions

        for raw_module in getattr(formula_functions, "SUBMODULES", []) or []:
            module_name = str(raw_module).strip(".")
            if not module_name:
                continue
            module = importlib.import_module(f"formulas.functions.{module_name}")
            for code in getattr(module, "FUNCTIONS", {}) or {}:
                categories.setdefault(_canonical_code(code), module_name)
    except Exception:
        return categories
    return categories


def _library_function_codes() -> set[str]:
    try:
        import formulas.functions as formula_functions

        return {_canonical_code(code) for code in formula_functions.get_functions()}
    except Exception:
        return set()


def _support_status(code: str) -> str:
    if code in BLOCKED_CATALOG_CODES:
        return "blocked"
    if code in base_formula_function_codes():
        return "executable"
    return "catalog_only"


def base_formula_function_catalog(*, include_catalog_only: bool = False) -> list[dict[str, Any]]:
    executable_by_code = {
        str(item["code"]).upper(): {
            **item,
            "parameters": [dict(param) for param in item.get("parameters", [])],
        }
        for item in EXECUTABLE_BASE_FUNCTIONS
    }
    if not include_catalog_only:
        return [
            {
                **item,
                "category": "platform",
                "category_label": CATEGORY_LABELS["platform"],
                "support_status": "executable",
                "is_executable": True,
                "provider": "platform",
            }
            for item in executable_by_code.values()
        ]

    categories = _category_by_function()
    codes = _library_function_codes() | set(executable_by_code)
    catalog: list[dict[str, Any]] = []
    for code in sorted(codes):
        item = dict(executable_by_code.get(code) or {})
        category = categories.get(code, "unknown")
        support_status = _support_status(code)
        catalog.append(
            {
                "code": code,
                "name": item.get("name") or code,
                "description": item.get("description") or f"Excel 函数目录项：{code}",
                "parameters": item.get("parameters") or [],
                "return_type": item.get("return_type") or "any",
                "category": category,
                "category_label": CATEGORY_LABELS.get(category, CATEGORY_LABELS["unknown"]),
                "support_status": support_status,
                "is_executable": support_status == "executable",
                "provider": "formulas",
            }
        )
    return catalog
