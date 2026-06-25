import pytest
from fastapi import HTTPException

from app.ai.provider import (
    AiProviderJsonError,
    generate_json_openai_compatible,
    parse_json_content,
    parse_json_like_content,
)
from app.ai_formula.field_refs import FieldMeta, display_to_internal, extract_field_refs, internal_to_display
from app.ai_formula.formula_evaluator import evaluate_formula, formula_syntax_issues
from app.ai_formula.formula_parser import extract_formula_meta, normalize_formula
from app.ai_formula.formula_safety import safety_issues
from app.ai_formula.router import FormulaDraftIn, _formula_draft_error_detail, draft_formula_impl
from app.ai_formula.validator import validate_dataset_formula


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


def test_parse_json_like_content_recovers_formula_with_text_literals():
    content = """{
  "intent": "formula_draft",
  "should_update_formula": true,
  "formula": "=IF(ISBLANK(salary.离职日期), "在职", "已离职")",
  "explanation": "已删除可维护值以外的多余处理。",
  "warnings": []
}"""

    parsed = parse_json_like_content(content)

    assert parsed["intent"] == "formula_draft"
    assert parsed["should_update_formula"] is True
    assert parsed["formula"] == '=IF(ISBLANK(salary.离职日期), "在职", "已离职")'


@pytest.mark.asyncio
async def test_generate_json_repairs_malformed_model_output(monkeypatch):
    calls: list[list[dict[str, str]]] = []

    async def fake_chat_completion_openai_compatible(**kwargs):
        calls.append(kwargs["messages"])
        if len(calls) == 1:
            return {}, "我会插入第4条：NOT(ISBLANK(salary.离职日期))", {"total_tokens": 5}
        return (
            {},
            '{"intent":"formula_draft","should_update_formula":true,"formula":"=NOT(ISBLANK(salary.离职日期))","explanation":"已插入第4条公式。"}',
            {"total_tokens": 8},
        )

    monkeypatch.setattr(
        "app.ai.provider.chat_completion_openai_compatible",
        fake_chat_completion_openai_compatible,
    )

    parsed, usage = await generate_json_openai_compatible(
        api_key="key",
        base_url="https://example.test/v1",
        model="strong-model",
        messages=[{"role": "user", "content": "将第4条插入到公式"}],
        repair_instructions="Return formula assistant JSON.",
    )

    assert len(calls) == 2
    assert parsed["should_update_formula"] is True
    assert parsed["formula"] == "=NOT(ISBLANK(salary.离职日期))"
    assert usage and usage["repair"]["total_tokens"] == 8


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


@pytest.mark.parametrize(
    "formula,expected",
    [
        ('=EOMONTH("2026-01-15", 0)', "2026-01-31"),
        ('=EOMONTH("2026-01-15", 1)', "2026-02-28"),
        ('=EOMONTH("2026-03-10", -1)', "2026-02-28"),
        ('=EOMONTH("2026-11-20", 3)', "2027-02-28"),
        ('=EOMONTH("2026-01-05", -2)', "2025-11-30"),
        ('=EOMONTH("2024-02-01", 0)', "2024-02-29"),
        ('=EOMONTH("2026/06/15", 1)', "2026-07-31"),
        ('=EOMONTH("", 0)', ""),
        ('=EOMONTH("abc", 0)', ""),
    ],
)
def test_eomonth_matches_excel_semantics(formula, expected):
    assert evaluate_formula(formula, field_resolver=lambda _: "") == expected


def test_eomonth_registered_as_executable_builtin():
    from app.ai_formula.formula_evaluator import _builtin_functions
    from app.ai_formula.function_catalog import base_formula_function_codes

    assert "EOMONTH" in base_formula_function_codes()
    assert "EOMONTH" in _builtin_functions()


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


@pytest.mark.asyncio
async def test_draft_formula_uses_model_action_for_function_template(monkeypatch):
    class DummyDataset:
        id = 1
        name = "薪酬数据集"

    class DummyConfig:
        api_key_encrypted = "encrypted"
        base_url = "https://example.test/v1"
        model_fast_json = "strong-model"
        timeout_seconds = 30

    class DummyUser:
        id = 7

    fields = [
        FieldMeta(
            code="salary.base",
            label="salary.基本工资",
            data_type="number",
            is_sensitive=False,
            agg_role="measure",
            alias="salary",
            column_code="base",
        )
    ]

    async def fake_dataset_field_meta(dataset_id, db):
        return DummyDataset(), fields

    async def fake_dataset_field_meta_for_ai(dataset_id, user, db):
        return DummyDataset(), fields, {
            "total_fields": len(fields),
            "visible_fields": len(fields),
            "filtered_sensitive_fields": [],
            "context_policy": "authorized_metadata_only",
        }

    async def fake_enabled_function_rows(db):
        return []

    async def fake_active_ai_config(db):
        return DummyConfig()

    async def fake_generate_json_openai_compatible(**kwargs):
        system_prompt = kwargs["messages"][0]["content"]
        user_prompt = kwargs["messages"][1]["content"]
        assert "start from Current formula" in system_prompt
        assert "manual_value or value_to_fill" in system_prompt
        assert "Current formula:" in user_prompt
        return (
            {
                "intent": "formula_draft",
                "should_update_formula": True,
                "field_label": "条件计算",
                "formula": "=IF(condition,value_if_true,value_if_false)",
                "data_type": "number",
                "agg_role": "measure",
                "explanation": "已插入 IF 函数模板，请填写条件和返回值。",
                "change_summary": "插入 IF 模板",
                "warnings": [],
            },
            {"total_tokens": 10},
        )

    async def fake_validate_dataset_formula(dataset_id, formula, db):
        return {
            "valid": False,
            "formula": formula,
            "depends_on": [],
            "used_functions": ["IF"],
            "is_sensitive": False,
            "warnings": [],
            "errors": ["模板参数需要替换为实际条件和值"],
            "preview_value": None,
        }

    async def fake_record_ai_log(**kwargs):
        return None

    async def fake_ensure_dataset_access(*args):
        return None

    monkeypatch.setattr("app.ai_formula.router._ensure_dataset_access", fake_ensure_dataset_access)
    monkeypatch.setattr("app.ai_formula.router.dataset_field_meta", fake_dataset_field_meta)
    monkeypatch.setattr("app.ai_formula.router.dataset_field_meta_for_ai", fake_dataset_field_meta_for_ai)
    monkeypatch.setattr("app.ai_formula.router.enabled_function_rows", fake_enabled_function_rows)
    monkeypatch.setattr("app.ai_formula.router.active_ai_config", fake_active_ai_config)
    monkeypatch.setattr("app.ai_formula.router.decrypt", lambda value: "api-key")
    monkeypatch.setattr(
        "app.ai_formula.router.generate_json_openai_compatible",
        fake_generate_json_openai_compatible,
    )
    monkeypatch.setattr("app.ai_formula.router.validate_dataset_formula", fake_validate_dataset_formula)
    monkeypatch.setattr("app.ai_formula.router.record_ai_log", fake_record_ai_log)

    class DummyDb:
        async def execute(self, *args, **kwargs):
            class Result:
                def scalars(self):
                    return self

                def all(self):
                    return []

            return Result()

        async def commit(self):
            return None

    out = await draft_formula_impl(
        FormulaDraftIn(dataset_id=1, message="帮我把 if 函数放到计算公式处，我自己来填条件"),
        DummyUser(),
        DummyDb(),
    )

    assert out.intent == "formula_draft"
    assert out.should_update_formula is True
    assert out.formula == "=IF(condition,value_if_true,value_if_false)"
    assert out.used_functions == ["IF"]
    assert out.validation_status == "invalid"


@pytest.mark.asyncio
async def test_draft_formula_updates_when_model_returns_formula_without_flag(monkeypatch):
    class DummyDataset:
        id = 1
        name = "员工数据集"

    class DummyConfig:
        api_key_encrypted = "encrypted"
        base_url = "https://example.test/v1"
        model_fast_json = "strong-model"
        timeout_seconds = 30

    class DummyUser:
        id = 7

    fields = [
        FieldMeta(
            code="salary.离职日期",
            label="salary.离职日期",
            data_type="string",
            is_sensitive=False,
            agg_role="dimension",
            alias="salary",
            column_code="离职日期",
        )
    ]

    async def fake_dataset_field_meta(dataset_id, db):
        return DummyDataset(), fields

    async def fake_dataset_field_meta_for_ai(dataset_id, user, db):
        return DummyDataset(), fields, {
            "total_fields": len(fields),
            "visible_fields": len(fields),
            "filtered_sensitive_fields": [],
            "context_policy": "authorized_metadata_only",
        }

    async def fake_enabled_function_rows(db):
        return []

    async def fake_active_ai_config(db):
        return DummyConfig()

    async def fake_generate_json_openai_compatible(**kwargs):
        return (
            {
                "intent": "formula_draft",
                "formula": '=IF(ISBLANK(value), "在职", "已离职")',
                "explanation": "已移除离职日期字段引用，保留 value 由你自行维护。",
                "change_summary": "移除字段引用",
                "warnings": [],
            },
            {"total_tokens": 10},
        )

    async def fake_validate_dataset_formula(dataset_id, formula, db):
        return {
            "valid": False,
            "formula": formula,
            "depends_on": [],
            "used_functions": ["IF", "ISBLANK"],
            "is_sensitive": False,
            "warnings": [],
            "errors": ["value 需要替换为实际值或字段"],
            "preview_value": None,
        }

    async def fake_record_ai_log(**kwargs):
        return None

    async def fake_ensure_dataset_access(*args):
        return None

    monkeypatch.setattr("app.ai_formula.router._ensure_dataset_access", fake_ensure_dataset_access)
    monkeypatch.setattr("app.ai_formula.router.dataset_field_meta", fake_dataset_field_meta)
    monkeypatch.setattr("app.ai_formula.router.dataset_field_meta_for_ai", fake_dataset_field_meta_for_ai)
    monkeypatch.setattr("app.ai_formula.router.enabled_function_rows", fake_enabled_function_rows)
    monkeypatch.setattr("app.ai_formula.router.active_ai_config", fake_active_ai_config)
    monkeypatch.setattr("app.ai_formula.router.decrypt", lambda value: "api-key")
    monkeypatch.setattr(
        "app.ai_formula.router.generate_json_openai_compatible",
        fake_generate_json_openai_compatible,
    )
    monkeypatch.setattr("app.ai_formula.router.validate_dataset_formula", fake_validate_dataset_formula)
    monkeypatch.setattr("app.ai_formula.router.record_ai_log", fake_record_ai_log)

    class DummyDb:
        async def execute(self, *args, **kwargs):
            class Result:
                def scalars(self):
                    return self

                def all(self):
                    return []

            return Result()

        async def commit(self):
            return None

    out = await draft_formula_impl(
        FormulaDraftIn(
            dataset_id=1,
            message="将公式处理的离职日期删除，我自己来维护",
            current_formula='=IF(ISBLANK(salary.离职日期), "在职", "已离职")',
        ),
        DummyUser(),
        DummyDb(),
    )

    assert out.should_update_formula is True
    assert out.formula == '=IF(ISBLANK(value), "在职", "已离职")'
    assert out.validation_status == "invalid"


@pytest.mark.asyncio
async def test_draft_formula_rejects_empty_update_from_model(monkeypatch):
    class DummyDataset:
        id = 1
        name = "employees"

    class DummyConfig:
        api_key_encrypted = "encrypted"
        base_url = "https://example.test/v1"
        model_fast_json = "strong-model"
        timeout_seconds = 30

    class DummyUser:
        id = 7

    async def fake_dataset_field_meta(dataset_id, db):
        return DummyDataset(), []

    async def fake_dataset_field_meta_for_ai(dataset_id, user, db):
        return DummyDataset(), [], {
            "total_fields": 0,
            "visible_fields": 0,
            "filtered_sensitive_fields": [],
            "context_policy": "authorized_metadata_only",
        }

    async def fake_enabled_function_rows(db):
        return []

    async def fake_active_ai_config(db):
        return DummyConfig()

    async def fake_generate_json_openai_compatible(**kwargs):
        return (
            {
                "intent": "formula_draft",
                "should_update_formula": True,
                "formula": "=",
                "explanation": "empty update",
                "warnings": [],
            },
            {"total_tokens": 10},
        )

    async def fake_validate_dataset_formula(dataset_id, formula, db):
        raise AssertionError("empty formulas should be rejected before validation")

    log_calls: list[dict] = []

    async def fake_record_ai_log(**kwargs):
        log_calls.append(kwargs)

    async def fake_ensure_dataset_access(*args):
        return None

    monkeypatch.setattr("app.ai_formula.router._ensure_dataset_access", fake_ensure_dataset_access)
    monkeypatch.setattr("app.ai_formula.router.dataset_field_meta", fake_dataset_field_meta)
    monkeypatch.setattr("app.ai_formula.router.dataset_field_meta_for_ai", fake_dataset_field_meta_for_ai)
    monkeypatch.setattr("app.ai_formula.router.enabled_function_rows", fake_enabled_function_rows)
    monkeypatch.setattr("app.ai_formula.router.active_ai_config", fake_active_ai_config)
    monkeypatch.setattr("app.ai_formula.router.decrypt", lambda value: "api-key")
    monkeypatch.setattr(
        "app.ai_formula.router.generate_json_openai_compatible",
        fake_generate_json_openai_compatible,
    )
    monkeypatch.setattr("app.ai_formula.router.validate_dataset_formula", fake_validate_dataset_formula)
    monkeypatch.setattr("app.ai_formula.router.record_ai_log", fake_record_ai_log)

    class DummyDb:
        async def execute(self, *args, **kwargs):
            class Result:
                def scalars(self):
                    return self

                def all(self):
                    return []

            return Result()

        async def commit(self):
            return None

    with pytest.raises(HTTPException) as exc_info:
        await draft_formula_impl(
            FormulaDraftIn(
                dataset_id=1,
                message="remove the field reference and I will maintain the value manually",
                current_formula='=IF(ISBLANK(salary.leave_date), "active", "left")',
            ),
            DummyUser(),
            DummyDb(),
        )

    assert exc_info.value.status_code == 400
    assert log_calls[-1]["status"] == "error"
