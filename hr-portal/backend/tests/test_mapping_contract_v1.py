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
    ReferenceLookupRule,
    ReferenceLookupRuleConfig,
    SplitMergeRule,
    SplitMergeRuleConfig,
    TypeConvertRule,
    TypeConvertRuleConfig,
    ValueMapRule,
    ValueMapRuleConfig,
)


def make_document():
    return MappingDocumentV1(
        ruleSet=MappingRuleSetV1(
            code="contract-v1",
            name="合同测试",
            sourceAsset="source.asset",
            targetAsset="target.asset",
            sourceSchemaHash="source-hash",
            targetSchemaHash="target-hash",
            rules=[
                FieldRule(
                    id="field-1",
                    displayOrder=1,
                    sourceFields=["name"],
                    targetFields=["full_name"],
                    config=FieldRuleConfig(mode="copy"),
                ),
                ValueMapRule(
                    id="value-map-1",
                    displayOrder=2,
                    sourceFields=["status"],
                    targetFields=["status_label"],
                    config=ValueMapRuleConfig(
                        mappings={"A": "在职"},
                        unmatched="set_default",
                        defaultValue="未知",
                    ),
                ),
                ReferenceLookupRule(
                    id="lookup-1",
                    displayOrder=3,
                    sourceFields=["dept_code"],
                    targetFields=["dept_name"],
                    config=ReferenceLookupRuleConfig(
                        referenceDatasetId="departments",
                        outputMap={"dept_name": "name"},
                        matchRules=[
                            MatchRule(
                                id="match-1",
                                priority=1,
                                sourceField="dept_code",
                                referenceField="code",
                                conditions={"tenant": "acme"},
                                onMatch="continue",
                            )
                        ],
                        unmatched="keep",
                    ),
                ),
                IdentityWithOverridesRule(
                    id="identity-1",
                    sourceFields=["code"],
                    targetFields=["normalized_code"],
                    config=IdentityWithOverridesRuleConfig(
                        overrides={"legacy": "current"},
                        unmatched="flag",
                    ),
                ),
                TypeConvertRule(
                    id="convert-1",
                    sourceFields=["amount"],
                    targetFields=["amount_number"],
                    config=TypeConvertRuleConfig(targetType="number", onError="set_null"),
                ),
                FormatRule(
                    id="format-1",
                    sourceFields=["label"],
                    targetFields=["normalized_label"],
                    config=FormatRuleConfig(
                        formatType="upper",
                        options={"locale": "en"},
                        onError="keep",
                    ),
                ),
                SplitMergeRule(
                    id="split-merge-1",
                    sourceFields=["first", "last"],
                    targetFields=["display_name"],
                    config=SplitMergeRuleConfig(
                        action="merge", delimiter=" ", nullBehavior="keep_null"
                    ),
                ),
            ],
        )
    )


def test_mapping_document_roundtrip_preserves_all_v1_rule_shapes():
    document = make_document()

    encoded = document.to_dict()
    decoded = MappingDocumentV1.from_dict(encoded)

    assert decoded.to_dict() == encoded
    assert decoded.mappingSchemaVersion == 1
    assert [rule.type for rule in decoded.ruleSet.rules] == [
        "field",
        "value_map",
        "reference_lookup",
        "identity_with_overrides",
        "type_convert",
        "format",
        "split_merge",
    ]
    assert decoded.ruleSet.rules[2].config.matchRules[0].conditions == {"tenant": "acme"}


@pytest.mark.parametrize("version", [None, 0, 2, "1"])
def test_mapping_document_rejects_non_v1_schema_versions(version):
    payload = make_document().to_dict()
    if version is None:
        payload.pop("mappingSchemaVersion")
    else:
        payload["mappingSchemaVersion"] = version

    with pytest.raises(ValueError, match="mappingSchemaVersion must be 1"):
        MappingDocumentV1.from_dict(payload)


def test_mapping_document_rejects_unknown_rule_type():
    payload = make_document().to_dict()
    payload["ruleSet"]["rules"] = [
        {
            "id": "future-rule",
            "type": "future_rule",
            "sourceFields": [],
            "targetFields": [],
        }
    ]

    with pytest.raises(ValueError, match="Unknown rule type: future_rule"):
        MappingDocumentV1.from_dict(payload)
