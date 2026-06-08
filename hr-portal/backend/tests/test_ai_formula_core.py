import pytest

from app.ai.provider import AiProviderJsonError, parse_json_content, parse_json_like_content
from app.ai_formula.field_refs import FieldMeta, display_to_internal, extract_field_refs, internal_to_display
from app.ai_formula.formula_evaluator import evaluate_formula, formula_syntax_issues
from app.ai_formula.formula_parser import extract_formula_meta, normalize_formula
from app.ai_formula.formula_safety import safety_issues
from app.ai_formula.router import _formula_draft_error_detail


def test_extract_field_refs_keeps_order_and_dedupes():
    formula = '=FIELD("salary.base") + FIELD("salary.bonus") + FIELD("salary.base")'

    assert extract_field_refs(formula) == ["salary.base", "salary.bonus"]
    assert extract_formula_meta(formula) == (["salary.base", "salary.bonus"], [])


def test_parse_json_content_accepts_common_llm_wrappers():
    assert parse_json_content('{"ok": true}') == {"ok": True}
    assert parse_json_content('```json\n{"ok": true}\n```') == {"ok": True}
    assert parse_json_content('好的，结果如下：\n{"ok": true}\n已完成') == {"ok": True}


def test_parse_json_content_rejects_empty_content():
    with pytest.raises(AiProviderJsonError):
        parse_json_content("")


def test_parse_json_like_content_recovers_unescaped_quotes_in_explanation():
    content = """{
  "field_label": "员工判断",
  "formula_display": "IF(FIELD(\\"salary.姓名\\") = \\"刘琦\\", 1, 2)",
  "formula": "IF(FIELD(\\"salary.姓名\\") = \\"刘琦\\", 1, 2)",
  "data_type": "number",
  "agg_role": "measure",
  "explanation": "判断 salary.姓名 是否等于"刘琦"，是则返回 1，否则返回 2。",
  "depends_on": ["salary.姓名"],
  "used_functions": ["IF"],
  "warnings": []
}"""

    parsed = parse_json_like_content(content)

    assert parsed["field_label"] == "员工判断"
    assert parsed["formula"] == 'IF(FIELD("salary.姓名") = "刘琦", 1, 2)'
    assert parsed["depends_on"] == ["salary.姓名"]


def test_display_field_refs_convert_to_internal_field_calls():
    fields = [
        FieldMeta(
            code="realtime.cost_month",
            label="realtime.成本归属年月",
            data_type="string",
            is_sensitive=False,
            agg_role="dimension",
            alias="realtime",
            column_code="cost_month",
        )
    ]

    formula = '=IF(realtime.成本归属年月="202501",1,0)'

    assert display_to_internal(formula, fields) == '=IF(FIELD("realtime.cost_month")="202501",1,0)'


def test_internal_field_refs_convert_to_plain_display_refs():
    fields = [
        FieldMeta(
            code="realtime.cost_month",
            label="realtime.成本归属年月",
            data_type="string",
            is_sensitive=False,
            agg_role="dimension",
            alias="realtime",
            column_code="cost_month",
        )
    ]

    formula = '=IF(FIELD("realtime.cost_month")="202501",1,0)'

    assert internal_to_display(formula, fields) == '=IF(realtime.成本归属年月="202501",1,0)'


def test_display_ref_conversion_skips_string_literals():
    fields = [
        FieldMeta(
            code="realtime.cost_month",
            label="realtime.成本归属年月",
            data_type="string",
            is_sensitive=False,
            agg_role="dimension",
            alias="realtime",
            column_code="cost_month",
        )
    ]

    formula = '=IF(realtime.成本归属年月="realtime.成本归属年月",1,0)'

    assert display_to_internal(formula, fields) == '=IF(FIELD("realtime.cost_month")="realtime.成本归属年月",1,0)'


def test_evaluate_formula_subset():
    row = {"salary.base": "10000", "salary.rate": "0.1"}

    value = evaluate_formula(
        '=IF(FIELD("salary.base")>5000,ROUND(FIELD("salary.base")*FIELD("salary.rate"),2),0)',
        field_resolver=lambda code: row.get(code),
    )

    assert value == 1000.0


def test_formula_safety_blocks_external_access():
    assert safety_issues('=HYPERLINK("https://example.com")')


def test_formula_syntax_blocks_attribute_access_and_unknown_functions():
    issues = formula_syntax_issues('=FIELD("salary.base").real', allowed_functions={"FIELD"})

    assert issues

    unknown = formula_syntax_issues("=UNKNOWN(1)", allowed_functions={"FIELD"})

    assert "UNKNOWN" in "；".join(unknown)


def test_normalize_formula_converts_common_full_width_symbols():
    formula = normalize_formula('IF（FIELD（"salary.name"）＝"刘琦"，1，2）')

    assert formula == '=IF(FIELD("salary.name")="刘琦",1,2)'
    assert not formula_syntax_issues(formula, allowed_functions={"FIELD", "IF"})


def test_formula_draft_error_detail_hides_raw_json_error():
    detail = _formula_draft_error_detail(ValueError("invalid character '（' line 1"))

    assert "invalid character" not in detail
    assert "可用公式" in detail


def test_custom_function_can_call_enabled_builtin():
    value = evaluate_formula(
        '=MY_RATIO(FIELD("a"), FIELD("b"))',
        field_resolver=lambda code: {"a": "10", "b": "4"}.get(code),
        custom_functions={
            "MY_RATIO": lambda amount, divisor: evaluate_formula(
                '=SAFE_DIVIDE(FIELD("amount"), FIELD("divisor"), 0)',
                field_resolver=lambda code: {"amount": amount, "divisor": divisor}.get(code),
                custom_functions={"SAFE_DIVIDE": lambda a, b, default=0: float(a) / float(b) if float(b) else default},
            )
        },
    )

    assert value == 2.5
