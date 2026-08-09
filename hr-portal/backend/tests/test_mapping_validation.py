import pytest

from app.mapping.dto import (
    FieldRule,
    FieldRuleConfig,
    MappingDocumentV1,
    MappingRuleSetV1,
    MatchRule,
    ReferenceLookupRule,
    ReferenceLookupRuleConfig,
)
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.policy import build_policy
from app.mapping.validator import MappingValidator


def make_document(*rules, version=1):
    return MappingDocumentV1(
        mappingSchemaVersion=version,
        ruleSet=MappingRuleSetV1(code="validation", name="校验", rules=list(rules)),
    )


def test_validator_rejects_source_field_outside_field_whitelist_with_field():
    document = make_document(
        FieldRule(
            id="field",
            sourceFields=["not_allowed"],
            targetFields=["target"],
            config=FieldRuleConfig(mode="copy"),
        )
    )
    policy = build_policy(
        "warehouse", source_field_ids=["allowed"], target_field_ids=["target"]
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(document, policy)

    assert exc_info.value.code == MappingErrorCode.MAPPING_FIELD_FORBIDDEN
    assert exc_info.value.field == "not_allowed"


def test_validator_rejects_target_field_outside_whitelist_and_readonly_target():
    validator = MappingValidator()
    rule = FieldRule(
        id="field",
        sourceFields=["source"],
        targetFields=["not_allowed"],
        config=FieldRuleConfig(mode="copy"),
    )
    with pytest.raises(MappingException) as forbidden:
        validator.validate(
            make_document(rule),
            build_policy("workflow", target_field_ids=["allowed"]),
        )
    assert forbidden.value.code == MappingErrorCode.MAPPING_FIELD_FORBIDDEN
    assert forbidden.value.field == "not_allowed"

    readonly_rule = FieldRule(
        id="readonly-rule",
        sourceFields=["source"],
        targetFields=["readonly"],
        config=FieldRuleConfig(mode="copy"),
    )
    with pytest.raises(MappingException) as readonly:
        validator.validate(
            make_document(readonly_rule),
            build_policy("workflow", target_readonly=["readonly"]),
        )
    assert readonly.value.code == MappingErrorCode.MAPPING_FIELD_FORBIDDEN
    assert readonly.value.field == "readonly"


def test_validator_rejects_protected_target_key():
    document = make_document(
        FieldRule(
            id="primary-key-write",
            sourceFields=["source"],
            targetFields=["id"],
            config=FieldRuleConfig(mode="copy"),
        )
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(
            document, build_policy("warehouse", target_protected_keys=["id"])
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_TARGET_FIELD_PROTECTED


def test_validator_blocks_duplicate_target_fields():
    document = make_document(
        FieldRule(
            id="first",
            sourceFields=["a"],
            targetFields=["same"],
            config=FieldRuleConfig(mode="copy"),
        ),
        FieldRule(
            id="second",
            sourceFields=["b"],
            targetFields=["same"],
            config=FieldRuleConfig(mode="copy"),
        ),
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(document, build_policy("warehouse"))

    assert exc_info.value.code == MappingErrorCode.MAPPING_TARGET_DUPLICATE
    assert exc_info.value.field == "same"


def test_validator_blocks_lookup_output_map_protected_key_even_when_target_fields_hide_it():
    document = make_document(
        ReferenceLookupRule(
            id="lookup",
            sourceFields=["code"],
            targetFields=["id"],
            config=ReferenceLookupRuleConfig(
                referenceDatasetId="refs",
                outputMap={"id": "reference_id"},
                matchRules=[MatchRule(id="mr", priority=1, sourceField="code", referenceField="code")],
            ),
        )
    )
    policy = build_policy(
        "warehouse",
        source_field_ids=["code"],
        target_field_ids=["id", "name"],
        target_protected_keys=["id"],
        allowed_reference_datasets=["refs"],
        allowed_reference_fields=["code", "reference_id"],
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(document, policy)

    assert exc_info.value.code == MappingErrorCode.MAPPING_TARGET_FIELD_PROTECTED


def test_validator_blocks_lookup_output_map_duplicate_target():
    document = make_document(
        FieldRule(id="field", sourceFields=["source"], targetFields=["name"], config=FieldRuleConfig(mode="copy")),
        ReferenceLookupRule(
            id="lookup",
            sourceFields=["code"],
            targetFields=["name"],
            config=ReferenceLookupRuleConfig(
                referenceDatasetId="refs",
                outputMap={"name": "reference_name"},
                matchRules=[MatchRule(id="mr", priority=1, sourceField="code", referenceField="code")],
            ),
        ),
    )
    policy = build_policy(
        "warehouse",
        source_field_ids=["source", "code"],
        target_field_ids=["name"],
        allowed_reference_datasets=["refs"],
        allowed_reference_fields=["code", "reference_name"],
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(document, policy)

    assert exc_info.value.code == MappingErrorCode.MAPPING_TARGET_DUPLICATE
    assert exc_info.value.field == "name"


def test_validator_blocks_lookup_internal_reference_field_outside_whitelist():
    document = make_document(
        ReferenceLookupRule(
            id="lookup",
            sourceFields=["code"],
            targetFields=["name"],
            config=ReferenceLookupRuleConfig(
                referenceDatasetId="refs",
                outputMap={"name": "secret"},
                matchRules=[
                    MatchRule(
                        id="mr",
                        priority=1,
                        sourceField="not_allowed_source",
                        referenceField="not_allowed_ref",
                        conditions={"secret_condition": "x"},
                    )
                ],
            ),
        )
    )
    policy = build_policy(
        "warehouse",
        source_field_ids=["code"],
        target_field_ids=["name"],
        allowed_reference_datasets=["refs"],
        allowed_reference_fields=["code", "name"],
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(document, policy)

    assert exc_info.value.code == MappingErrorCode.MAPPING_FIELD_FORBIDDEN


def test_validator_fails_closed_when_bound_asset_has_empty_field_catalog():
    document = make_document(
        FieldRule(
            id="field",
            sourceFields=["source"],
            targetFields=["target"],
            config=FieldRuleConfig(mode="copy"),
        )
    )
    policy = build_policy(
        "warehouse",
        source_asset_id="missing_source_asset",
        target_asset_id="missing_target_asset",
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(document, policy)

    assert exc_info.value.code == MappingErrorCode.MAPPING_FIELD_FORBIDDEN


def test_validator_fails_closed_when_lookup_catalog_is_empty():
    document = make_document(
        ReferenceLookupRule(
            id="lookup",
            sourceFields=["code"],
            targetFields=["name"],
            config=ReferenceLookupRuleConfig(
                referenceDatasetId="untrusted_dataset",
                outputMap={"name": "name"},
                matchRules=[
                    MatchRule(
                        id="mr",
                        priority=1,
                        sourceField="code",
                        referenceField="code",
                    )
                ],
            ),
        )
    )
    policy = build_policy(
        "warehouse",
        source_field_ids=["code"],
        target_field_ids=["name"],
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(document, policy)

    assert exc_info.value.code == MappingErrorCode.MAPPING_REFERENCE_DATASET_FORBIDDEN


def test_validator_rejects_missing_schema_hash_when_server_policy_has_hash():
    document = make_document(
        FieldRule(
            id="field",
            sourceFields=["source"],
            targetFields=["target"],
            config=FieldRuleConfig(mode="copy"),
        )
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(
            document,
            build_policy(
                "warehouse",
                source_schema_hash="source-hash",
                target_schema_hash="target-hash",
            ),
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_SCHEMA_CHANGED


def test_validator_blocks_two_way_field_rename_cycle():
    document = make_document(
        FieldRule(
            id="a-to-b",
            sourceFields=["a"],
            targetFields=["b"],
            config=FieldRuleConfig(mode="rename"),
        ),
        FieldRule(
            id="b-to-a",
            sourceFields=["b"],
            targetFields=["a"],
            config=FieldRuleConfig(mode="rename"),
        ),
    )

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(document, build_policy("warehouse"))

    assert exc_info.value.code == MappingErrorCode.MAPPING_CYCLE_DETECTED


def test_validator_blocks_non_v1_document_before_rule_checks():
    document = make_document(version=2)

    with pytest.raises(MappingException) as exc_info:
        MappingValidator().validate(document, build_policy("warehouse"))

    assert exc_info.value.code == MappingErrorCode.MAPPING_SCHEMA_CHANGED
