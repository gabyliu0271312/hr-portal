import pytest

from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.wage_dual_run import (
    ReferenceLookupMap,
    WAGE_CATEGORY_CLIENT,
    WAGE_CATEGORY_DEFAULT,
    WAGE_CATEGORY_DUPLICATE,
    WAGE_CATEGORY_EMPTY,
    WAGE_CATEGORY_EMPLOYEE,
    build_wage_mapping_document,
    build_wage_reference_snapshot,
    run_wage_dual_run,
)


LEGACY_CONFIG = {
    "target": "expense_type",
    "lookup_table": "emp_monthly_cost_class",
    "type_col": "field_type",
    "value_col": "value",
    "result_col": "cost_classification",
    "rules": [
        {"match_type": "工号", "src_field": "employee_no"},
        {"match_type": "甲方", "src_field": "client"},
    ],
    "default": "工资",
}


def legacy_evaluator(row, lookup_maps):
    for cfg, lookup_map in lookup_maps:
        if row.get(cfg["target"]) not in (None, ""):
            continue
        for rule in cfg["rules"]:
            value = row.get(rule["src_field"])
            if value in (None, ""):
                continue
            result = lookup_map.get((rule["match_type"], str(value)))
            if result not in (None, ""):
                row[cfg["target"]] = result
                break
        else:
            row[cfg["target"]] = cfg["default"]


def lookup_maps(reference_rows):
    legacy_map = ReferenceLookupMap(reference_rows=reference_rows)
    for row in reference_rows:
        legacy_map[(str(row["field_type"]), str(row["value"]))] = row["cost_classification"]
    return [(LEGACY_CONFIG, legacy_map)]


def test_wage_document_freezes_employee_first_client_second_and_default():
    document = build_wage_mapping_document()
    rule = document.ruleSet.rules[0]

    assert rule.type == "reference_lookup"
    assert [item.sourceField for item in rule.config.matchRules] == ["employee_no", "client"]
    assert [item.priority for item in rule.config.matchRules] == [10, 20]
    assert [item.conditions for item in rule.config.matchRules] == [
        {"field_type": "工号"},
        {"field_type": "甲方"},
    ]
    assert rule.config.defaultValue == "工资"


@pytest.mark.asyncio
async def test_dual_run_matches_employee_client_default_empty_and_leading_zero():
    references = [
        {"field_type": "工号", "value": "00123", "cost_classification": "研发工资"},
        {"field_type": "甲方", "value": "客户A", "cost_classification": "项目工资"},
    ]
    rows = [
        {"pay_month": "202607", "employee_no": "00123", "client": "客户A"},
        {"pay_month": "202607", "employee_no": "E999", "client": "客户A"},
        {"pay_month": "202607", "employee_no": "E998", "client": "客户B"},
        {"pay_month": "202607", "employee_no": "", "client": None},
    ]

    outcome = await run_wage_dual_run(
        rows,
        lookup_maps(references),
        business_key_fields=["pay_month", "employee_no"],
        legacy_evaluator=legacy_evaluator,
    )

    assert [row["expense_type"] for row in outcome.legacyRows] == [
        "研发工资", "项目工资", "工资", "工资",
    ]
    assert outcome.componentRows == outcome.legacyRows
    assert outcome.selectedRows == outcome.legacyRows
    assert outcome.report.same == 4
    assert outcome.report.different == 0
    assert outcome.report.categoryCounts == {
        WAGE_CATEGORY_EMPLOYEE: 1,
        WAGE_CATEGORY_CLIENT: 1,
        WAGE_CATEGORY_DEFAULT: 1,
        WAGE_CATEGORY_DUPLICATE: 0,
        WAGE_CATEGORY_EMPTY: 1,
    }
    assert outcome.report.diffs[0].businessKey == {
        "pay_month": "202607",
        "employee_no": "00123",
    }


def test_duplicate_same_result_warns_without_overwriting_meaning():
    references = [
        {"field_type": "工号", "value": "E001", "cost_classification": "研发工资"},
        {"field_type": "工号", "value": "E001", "cost_classification": "研发工资"},
    ]

    snapshot = build_wage_reference_snapshot(references)

    assert snapshot.data["emp_monthly_cost_class"][("工号", "E001")] == {
        "cost_classification": "研发工资"
    }
    assert snapshot.duplicate_keys == {("工号", "E001")}
    assert snapshot.warnings[0].code == MappingErrorCode.MAPPING_LOOKUP_DUPLICATE_KEY.value


@pytest.mark.asyncio
async def test_dual_run_classifies_duplicate_same_result():
    references = [
        {"field_type": "工号", "value": "E001", "cost_classification": "研发工资"},
        {"field_type": "工号", "value": "E001", "cost_classification": "研发工资"},
    ]

    outcome = await run_wage_dual_run(
        [{"pay_month": "202607", "employee_no": "E001", "client": "客户A"}],
        lookup_maps(references),
        business_key_fields=["pay_month", "employee_no"],
        legacy_evaluator=legacy_evaluator,
    )

    assert outcome.report.categoryCounts[WAGE_CATEGORY_DUPLICATE] == 1
    assert outcome.report.diffs[0].matchPath == WAGE_CATEGORY_EMPLOYEE
    assert outcome.report.different == 0


def test_duplicate_different_results_blocks_reference_publish():
    references = [
        {"field_type": "甲方", "value": "客户A", "cost_classification": "项目工资"},
        {"field_type": "甲方", "value": "客户A", "cost_classification": "外包工资"},
    ]

    with pytest.raises(MappingException) as exc_info:
        build_wage_reference_snapshot(references)

    assert exc_info.value.code == MappingErrorCode.MAPPING_LOOKUP_CONFLICT


@pytest.mark.asyncio
async def test_shadow_conflict_keeps_legacy_but_gray_blocks_cutover():
    references = [
        {"field_type": "甲方", "value": "客户A", "cost_classification": "项目工资"},
        {"field_type": "甲方", "value": "客户A", "cost_classification": "外包工资"},
    ]
    rows = [{"pay_month": "202607", "employee_no": "E001", "client": "客户A"}]

    shadow = await run_wage_dual_run(
        rows,
        lookup_maps(references),
        business_key_fields=["pay_month", "employee_no"],
        legacy_evaluator=legacy_evaluator,
        mode="shadow",
    )
    assert shadow.selectedRows == shadow.legacyRows
    assert shadow.report.publishBlocked is True
    assert shadow.report.blockCode == MappingErrorCode.MAPPING_LOOKUP_CONFLICT.value

    with pytest.raises(MappingException) as exc_info:
        await run_wage_dual_run(
            rows,
            lookup_maps(references),
            business_key_fields=["pay_month", "employee_no"],
            legacy_evaluator=legacy_evaluator,
            mode="gray",
            component_percent=100,
        )
    assert exc_info.value.code == MappingErrorCode.MAPPING_LOOKUP_CONFLICT


@pytest.mark.asyncio
async def test_gray_uses_component_only_after_zero_diff_and_rollback_restores_legacy():
    references = [
        {"field_type": "工号", "value": "E001", "cost_classification": "研发工资"},
        {"field_type": "甲方", "value": "客户A", "cost_classification": "项目工资"},
    ]
    rows = [
        {"pay_month": "202607", "employee_no": "E001", "client": "客户A"},
        {"pay_month": "202607", "employee_no": "E002", "client": "客户A"},
    ]

    gray = await run_wage_dual_run(
        rows,
        lookup_maps(references),
        business_key_fields=["pay_month", "employee_no"],
        legacy_evaluator=legacy_evaluator,
        mode="gray",
        component_percent=100,
    )
    assert gray.selectedRows == gray.componentRows
    assert gray.report.selectedEvaluator == "component"
    assert gray.report.componentRows == 2
    assert gray.report.different == 0

    rollback = await run_wage_dual_run(
        rows,
        lookup_maps(references),
        business_key_fields=["pay_month", "employee_no"],
        legacy_evaluator=legacy_evaluator,
        mode="rollback",
        component_percent=100,
    )
    assert rollback.selectedRows == rollback.legacyRows
    assert rollback.report.selectedEvaluator == "legacy"
    assert rollback.report.componentRows == 0


@pytest.mark.asyncio
async def test_gray_blocks_when_legacy_and_component_results_differ():
    references = [
        {"field_type": "工号", "value": "E001", "cost_classification": "研发工资"},
    ]

    def divergent_legacy(row, _lookup_maps):
        row["expense_type"] = "旧错误结果"

    with pytest.raises(MappingException) as exc_info:
        await run_wage_dual_run(
            [{"pay_month": "202607", "employee_no": "E001", "client": "客户A"}],
            lookup_maps(references),
            business_key_fields=["pay_month", "employee_no"],
            legacy_evaluator=divergent_legacy,
            mode="gray",
            component_percent=10,
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_LOOKUP_CONFLICT
    assert exc_info.value.details["different"] == 1
