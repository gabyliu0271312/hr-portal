import pytest

from app.mapping.dto import (
    FieldRule,
    FieldRuleConfig,
    FormatRule,
    FormatRuleConfig,
    IdentityWithOverridesRule,
    IdentityWithOverridesRuleConfig,
    MappingDocumentV1,
    MappingRuleSetV1,
    MatchRule,
    LookupConfig,
    ReferenceLookupRule,
    ReferenceLookupRuleConfig,
    SplitMergeRule,
    SplitMergeRuleConfig,
    TypeConvertRule,
    TypeConvertRuleConfig,
    ValueMapRule,
    ValueMapRuleConfig,
)
from app.mapping.errors import MappingErrorCode
from app.mapping.executor import MappingExecutor
from app.mapping.policy import build_policy
from app.mapping.regex_safety import validate_safe_pattern


def test_safe_regex_rejects_redos_structures_and_backreferences():
    for pattern in (r"(a+)+$", r"(a*)*", r"a{1,3}+", r"(a|aa)+$", r"\1"):
        with pytest.raises(ValueError):
            validate_safe_pattern(pattern)

    assert validate_safe_pattern(r"[^0-9]+") == r"[^0-9]+"


def document(*rules):
    return MappingDocumentV1(
        ruleSet=MappingRuleSetV1(code="executor", name="执行器", rules=list(rules))
    )


@pytest.mark.asyncio
async def test_executor_runs_all_seven_rule_types_on_normal_paths():
    result = await MappingExecutor().execute(
        document(
            FieldRule(
                id="field",
                sourceFields=["name"],
                targetFields=["full_name"],
                config=FieldRuleConfig(mode="copy"),
            ),
            ValueMapRule(
                id="value-map",
                sourceFields=["status"],
                targetFields=["status_label"],
                config=ValueMapRuleConfig(mappings={"A": "active"}),
            ),
            ReferenceLookupRule(
                id="lookup",
                sourceFields=["dept_code"],
                targetFields=["dept_name"],
                config=ReferenceLookupRuleConfig(
                    referenceDatasetId="departments",
                    outputMap={"dept_name": "name"},
                    matchRules=[
                        MatchRule(
                            id="lookup-rule",
                            priority=1,
                            sourceField="dept_code",
                            referenceField="code",
                            conditions={"tenant": "acme"},
                        )
                    ],
                ),
            ),
            IdentityWithOverridesRule(
                id="identity",
                sourceFields=["legacy_code"],
                targetFields=["code"],
                config=IdentityWithOverridesRuleConfig(overrides={"old": "new"}),
            ),
            TypeConvertRule(
                id="convert",
                sourceFields=["amount"],
                targetFields=["amount_number"],
                config=TypeConvertRuleConfig(targetType="integer"),
            ),
            FormatRule(
                id="format",
                sourceFields=["label"],
                targetFields=["normalized_label"],
                config=FormatRuleConfig(formatType="upper"),
            ),
            SplitMergeRule(
                id="split",
                sourceFields=["full_name"],
                targetFields=["first_name", "last_name"],
                config=SplitMergeRuleConfig(action="split", delimiter=" "),
            ),
        ),
        [
            {
                "name": "Alice Smith",
                "status": "A",
                "dept_code": "D1",
                "legacy_code": "old",
                "amount": "12.5",
                "label": "employee",
            }
        ],
        reference_snapshot={"departments": {("acme", "D1"): {"name": "Finance"}}},
    )

    assert result.errors == []
    assert result.stats.input == result.stats.output == 1
    assert result.stats.matched == 7
    assert result.outputRows[0] == {
        "name": "Alice Smith",
        "status": "A",
        "dept_code": "D1",
        "legacy_code": "old",
        "amount": "12.5",
        "label": "employee",
        "full_name": "Alice Smith",
        "status_label": "active",
        "dept_name": "Finance",
        "code": "new",
        "amount_number": 12,
        "normalized_label": "EMPLOYEE",
        "first_name": "Alice",
        "last_name": "Smith",
    }
    assert {entry.ruleId for entry in result.trace} == {
        "field",
        "value-map",
        "lookup",
        "identity",
        "convert",
        "format",
        "split",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("unmatched", "expected", "extra"),
    [
        ("keep", "X", {}),
        ("set_default", "UNKNOWN", {}),
        ("set_null", None, {}),
        ("flag", "X", {"_unmapped_target": True}),
    ],
)
async def test_value_map_unmatched_behaviors(unmatched, expected, extra):
    rule = ValueMapRule(
        id="unmatched",
        sourceFields=["source"],
        targetFields=["target"],
        config=ValueMapRuleConfig(
            mappings={"known": "mapped"},
            unmatched=unmatched,
            defaultValue="UNKNOWN",
        ),
    )
    result = await MappingExecutor().execute(document(rule), [{"source": "X"}])

    assert result.errors == []
    expected_row = {"source": "X", **extra}
    if unmatched != "keep":
        expected_row["target"] = expected
    assert result.outputRows == [expected_row]
    assert result.stats.unmatched == 1
    assert result.trace[0].outcome == "unmatched"


@pytest.mark.asyncio
async def test_sensitive_policy_masks_lookup_trace_values():
    rule = ReferenceLookupRule(
        id="lookup-sensitive",
        sourceFields=["employee_no"],
        targetFields=["employee_name"],
        config=ReferenceLookupRuleConfig(
            referenceDatasetId="employees",
            outputMap={"employee_name": "name"},
            matchRules=[
                MatchRule(
                    id="mr",
                    priority=1,
                    sourceField="employee_no",
                    referenceField="employee_no",
                )
            ],
        ),
    )
    result = await MappingExecutor().preview(
        document(rule),
        [{"employee_no": "13800138000"}],
        reference_snapshot={"employees": {("13800138000",): {"name": "张三"}}},
        policy=build_policy(
            "warehouse",
            source_sensitive_field_ids=["employee_no"],
            target_sensitive_field_ids=["employee_name"],
        ),
    )

    assert result.outputRows[0]["employee_name"] != "张三"
    assert result.outputRows[0]["employee_no"] != "13800138000"
    assert result.trace[0].referenceKey != ("13800138000",)
    assert result.trace[0].before != "13800138000"


@pytest.mark.asyncio
async def test_lookup_only_fill_empty_preserves_existing_value_and_fills_empty_value():
    rule = ReferenceLookupRule(
        id="lookup-only-empty",
        sourceFields=["code"],
        targetFields=["name"],
        config=ReferenceLookupRuleConfig(
            referenceDatasetId="refs",
            outputMap={"name": "label"},
            matchRules=[
                MatchRule(
                    id="mr",
                    priority=1,
                    sourceField="code",
                    referenceField="code",
                    onMatch="only_fill_empty",
                )
            ],
        ),
    )
    result = await MappingExecutor().execute(
        document(rule),
        [{"code": "D1", "name": "已有值"}, {"code": "D1", "name": ""}],
        reference_snapshot={"refs": {("D1",): {"label": "Finance"}}},
    )

    assert result.outputRows == [
        {"code": "D1", "name": "已有值"},
        {"code": "D1", "name": "Finance"},
    ]


@pytest.mark.asyncio
async def test_executor_reports_unmatched_lookup_and_rejects_it_when_configured():
    keep_rule = ReferenceLookupRule(
        id="lookup-keep",
        sourceFields=["code"],
        targetFields=["name"],
        config=ReferenceLookupRuleConfig(
            referenceDatasetId="refs",
            outputMap={"name": "name"},
            matchRules=[
                MatchRule(id="mr", priority=1, sourceField="code", referenceField="code")
            ],
            unmatched="flag",
        ),
    )
    result = await MappingExecutor().execute(
        document(keep_rule), [{"code": "missing"}], reference_snapshot={"refs": {}}
    )
    assert result.outputRows == [{"code": "missing", "_unmapped_name": True}]
    assert result.stats.unmatched == 1

    reject_rule = ReferenceLookupRule(
        id="lookup-reject",
        sourceFields=["code"],
        targetFields=["name"],
        config=ReferenceLookupRuleConfig(
            referenceDatasetId="refs",
            outputMap={"name": "name"},
            matchRules=[],
            unmatched="reject",
        ),
    )
    rejected = await MappingExecutor().execute(
        document(reject_rule), [{"code": "missing"}], reference_snapshot={"refs": {}}
    )
    assert rejected.outputRows == []
    assert rejected.errors[0].code == MappingErrorCode.MAPPING_LOOKUP_NO_MATCH.value
    assert rejected.trace[0].outcome == "error"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("rule", "row", "expected", "error_code"),
    [
        (
            TypeConvertRule(
                id="bad-type",
                sourceFields=["value"],
                targetFields=["converted"],
                config=TypeConvertRuleConfig(targetType="integer", onError="flag"),
            ),
            {"value": "not-a-number"},
            {"value": "not-a-number", "converted": "not-a-number", "_error_converted": "could not convert string to float: 'not-a-number'"},
            MappingErrorCode.MAPPING_TYPE_CONVERSION_FAILED.value,
        ),
        (
            FormatRule(
                id="bad-format",
                sourceFields=["value"],
                targetFields=["formatted"],
                config=FormatRuleConfig(
                    formatType="date",
                    options={"from_format": "%Y-%m-%d"},
                    onError="set_null",
                ),
            ),
            {"value": "not-a-date"},
            {"value": "not-a-date", "formatted": None},
            MappingErrorCode.MAPPING_FORMAT_INVALID.value,
        ),
    ],
)
async def test_executor_error_policies_return_error_trace(rule, row, expected, error_code):
    result = await MappingExecutor().execute(document(rule), [row])

    assert result.outputRows == [expected]
    assert result.stats.errors == 0
    assert result.errors == []
    assert result.trace[0].outcome == "error"
    assert result.trace[0].errorCode == error_code


@pytest.mark.asyncio
async def test_executor_reject_error_is_reported_and_row_is_dropped():
    rule = TypeConvertRule(
        id="reject-type",
        sourceFields=["value"],
        targetFields=["converted"],
        config=TypeConvertRuleConfig(targetType="integer", onError="reject"),
    )
    result = await MappingExecutor().execute(document(rule), [{"value": "bad"}])

    assert result.outputRows == []
    assert result.stats.errors == 1
    assert result.errors[0].code == MappingErrorCode.MAPPING_TYPE_CONVERSION_FAILED.value
    assert result.errors[0].field == "value"
    assert result.trace[0].outcome == "error"
    assert result.trace[0].errorCode == MappingErrorCode.MAPPING_TYPE_CONVERSION_FAILED.value


@pytest.mark.asyncio
async def test_lookup_configs_use_priority_per_dataset_and_default_value():
    rule = ReferenceLookupRule(
        id="generic-lookup",
        sourceFields=["employee_no", "client"],
        targetFields=["expense_type"],
        config=ReferenceLookupRuleConfig(
            lookupConfigs=[
                LookupConfig("employee", 10, "dwd_employee_reference", "employee_no", "employee_id", "expense", "expense_type", {"field_type": "employee"}),
                LookupConfig("client", 20, "dwd_client_reference", "client", "client_code", "expense", "expense_type", {}),
            ],
            unmatched="set_default",
            defaultValue="wage",
        ),
    )
    result = await MappingExecutor().execute(
        document(rule),
        [{"employee_no": "E1", "client": "C1"}, {"employee_no": "E2", "client": "C1"}, {"employee_no": "E3", "client": "C2"}],
        reference_snapshot={
            "dwd_employee_reference": [{"employee_id": "E1", "field_type": "employee", "expense": "salary"}],
            "dwd_client_reference": [{"client_code": "C1", "expense": "contract"}],
        },
    )
    assert [row["expense_type"] for row in result.outputRows] == ["salary", "contract", "wage"]
