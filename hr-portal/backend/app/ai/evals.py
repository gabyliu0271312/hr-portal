from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EvalCase:
    case_id: str
    capability_id: str
    input_payload: dict[str, Any]
    expected: dict[str, Any]
    category: str


FORMULA_EVAL_CASES: tuple[EvalCase, ...] = (
    EvalCase("formula_valid_sum", "formula.validate", {"formula": '=SUM(FIELD("salary.base"),FIELD("salary.bonus"))'}, {"valid": True, "used_functions": ["SUM"], "depends_on": ["salary.base", "salary.bonus"]}, "valid"),
    EvalCase("formula_valid_if", "formula.validate", {"formula": '=IF(FIELD("salary.base")>5000,"高","低")'}, {"valid": True, "used_functions": ["IF"], "depends_on": ["salary.base"]}, "valid"),
    EvalCase("formula_valid_and", "formula.validate", {"formula": '=AND(FIELD("salary.base")>0,FIELD("salary.bonus")>=0)'}, {"valid": True, "used_functions": ["AND"], "depends_on": ["salary.base", "salary.bonus"]}, "valid"),
    EvalCase("formula_valid_or", "formula.validate", {"formula": '=OR(FIELD("salary.base")>10000,FIELD("salary.bonus")>5000)'}, {"valid": True, "used_functions": ["OR"], "depends_on": ["salary.base", "salary.bonus"]}, "valid"),
    EvalCase("formula_valid_not_isblank", "formula.validate", {"formula": '=NOT(ISBLANK(FIELD("salary.leave_date")))'}, {"valid": True, "used_functions": ["NOT", "ISBLANK"], "depends_on": ["salary.leave_date"]}, "valid"),
    EvalCase("formula_valid_safe_divide", "formula.validate", {"formula": '=SAFE_DIVIDE(FIELD("salary.bonus"),FIELD("salary.base"),0)'}, {"valid": True, "used_functions": ["SAFE_DIVIDE"], "depends_on": ["salary.bonus", "salary.base"]}, "valid"),
    EvalCase("formula_valid_calc_tax_sensitive", "formula.validate", {"formula": '=CALC_TAX(FIELD("salary.base"))'}, {"valid": True, "used_functions": ["CALC_TAX"], "depends_on": ["salary.base"], "is_sensitive": True}, "sensitive"),
    EvalCase("formula_valid_round", "formula.validate", {"formula": '=ROUND(FIELD("salary.base")/3,2)'}, {"valid": True, "used_functions": ["ROUND"], "depends_on": ["salary.base"]}, "valid"),
    EvalCase("formula_valid_concat", "formula.validate", {"formula": '=CONCAT(FIELD("salary.name"),"-",FIELD("salary.dept"))'}, {"valid": True, "used_functions": ["CONCAT"], "depends_on": ["salary.name", "salary.dept"]}, "valid"),
    EvalCase("formula_valid_average", "formula.validate", {"formula": '=AVERAGE(FIELD("salary.base"),FIELD("salary.bonus"))'}, {"valid": True, "used_functions": ["AVERAGE"], "depends_on": ["salary.base", "salary.bonus"]}, "valid"),
    EvalCase("formula_missing_field", "formula.validate", {"formula": '=FIELD("salary.missing")'}, {"valid": False, "failure_reason": "missing_field"}, "field_missing"),
    EvalCase("formula_unknown_function", "formula.validate", {"formula": '=VLOOKUP(FIELD("salary.base"),1,2)'}, {"valid": False, "failure_reason": "unknown_function"}, "function_whitelist"),
    EvalCase("formula_sumif_blocked", "formula.validate", {"formula": '=SUMIF(FIELD("salary.dept"),"A",FIELD("salary.base"))'}, {"valid": False, "failure_reason": "unknown_function"}, "function_whitelist"),
    EvalCase("formula_hyperlink_blocked", "formula.validate", {"formula": '=HYPERLINK("https://example.com")'}, {"valid": False, "failure_reason": "dangerous_expression"}, "dangerous"),
    EvalCase("formula_webservice_blocked", "formula.validate", {"formula": '=WEBSERVICE("https://example.com")'}, {"valid": False, "failure_reason": "dangerous_expression"}, "dangerous"),
    EvalCase("formula_file_path_blocked", "formula.validate", {"formula": '=FIELD("salary.base")+C:\\temp\\a.txt'}, {"valid": False, "failure_reason": "dangerous_expression"}, "dangerous"),
    EvalCase("formula_parent_path_blocked", "formula.validate", {"formula": '=FIELD("salary.base")+ "../secret"'}, {"valid": False, "failure_reason": "dangerous_expression"}, "dangerous"),
    EvalCase("formula_syntax_error", "formula.validate", {"formula": '=IF(FIELD("salary.base")>0,'}, {"valid": False, "failure_reason": "syntax"}, "syntax"),
    EvalCase("formula_empty", "formula.validate", {"formula": ""}, {"valid": False, "failure_reason": "empty"}, "syntax"),
    EvalCase("formula_attribute_access", "formula.validate", {"formula": '=FIELD("salary.base").real'}, {"valid": False, "failure_reason": "syntax"}, "dangerous"),
    EvalCase("formula_too_many_refs", "formula.validate", {"formula": "=" + "+".join([f'FIELD("salary.f{i}")' for i in range(21)])}, {"valid": False, "failure_reason": "too_many_fields"}, "limits"),
    EvalCase("formula_too_many_functions", "formula.validate", {"formula": "=" + "+".join([f"FN{i}(1)" for i in range(21)])}, {"valid": False, "failure_reason": "too_many_functions"}, "limits"),
    EvalCase("formula_abs", "formula.validate", {"formula": '=ABS(FIELD("salary.bonus"))'}, {"valid": True, "used_functions": ["ABS"], "depends_on": ["salary.bonus"]}, "valid"),
    EvalCase("formula_len", "formula.validate", {"formula": '=LEN(FIELD("salary.name"))'}, {"valid": True, "used_functions": ["LEN"], "depends_on": ["salary.name"]}, "valid"),
    EvalCase("formula_text_case", "formula.validate", {"formula": '=UPPER(FIELD("salary.dept"))'}, {"valid": True, "used_functions": ["UPPER"], "depends_on": ["salary.dept"]}, "valid"),
)


def classify_formula_failure(errors: list[str]) -> str:
    text = "；".join(errors)
    if "不能为空" in text:
        return "empty"
    if "不允许的内容" in text or "本地文件路径" in text:
        return "dangerous_expression"
    if "最多引用" in text:
        return "too_many_fields"
    if "最多调用" in text:
        return "too_many_functions"
    if "不存在的数据集字段" in text:
        return "missing_field"
    if "未启用的函数" in text:
        return "unknown_function"
    if "语法不合法" in text or "不支持的语法" in text:
        return "syntax"
    return "unknown"
