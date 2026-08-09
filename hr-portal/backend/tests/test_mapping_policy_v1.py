import pytest

from app.mapping.dto import MappingDocumentV1, MappingRuleSetV1, ValueMapRule, ValueMapRuleConfig
from app.mapping.errors import MappingErrorCode
from app.mapping.policy import (
    ALL_CALLERS,
    CALLER_DEFAULT_RULE_TYPES,
    CALLER_PERMISSION_SCOPE,
    build_policy,
)
from app.mapping.validator import MappingValidator


def test_all_five_callers_have_frozen_policy_defaults():
    assert set(ALL_CALLERS) == {
        "warehouse",
        "workflow",
        "ucp_transform",
        "warehouse_sink",
        "push_target",
    }

    for caller in ALL_CALLERS:
        policy = build_policy(caller)
        assert policy.caller == caller
        assert policy.allowedRuleTypes == CALLER_DEFAULT_RULE_TYPES[caller]
        assert policy.metadata.policyVersion == 1
        assert policy.metadata.permissionScope == CALLER_PERMISSION_SCOPE[caller]
        assert policy.metadata.issuedAt
        assert policy.to_dict()["caller"] == caller


def test_policy_builder_rejects_unknown_caller():
    with pytest.raises(ValueError, match="Unsupported caller"):
        build_policy("unknown")


def test_policy_builder_honors_field_reference_effect_and_legacy_limits():
    policy = build_policy(
        "workflow",
        source_asset_id="source",
        source_schema_hash="source-hash",
        source_field_ids=["source_field"],
        target_asset_id="target",
        target_schema_hash="target-hash",
        target_field_ids=["target_field"],
        target_readonly=["readonly"],
        target_protected_keys=["id"],
        allowed_reference_datasets=["ref"],
        allowed_reference_fields=["ref_code"],
        max_lookup_rules=3,
        allow_preview=False,
        allow_save=False,
        allow_publish=False,
        allow_execute=False,
        allow_rebuild=False,
        legacy_source_format="legacy_v1",
        allow_legacy_read=False,
        allow_legacy_write=False,
        allow_migration=False,
    )

    assert policy.source.assetId == "source"
    assert policy.target.readonlyFieldIds == ["readonly"]
    assert policy.target.protectedKeyFieldIds == ["id"]
    assert policy.referenceLookup.maxRules == 3
    assert policy.effects.allowExecute is False
    assert policy.legacy.sourceFormat == "legacy_v1"
    assert policy.legacy.allowMigration is False


def test_five_callers_can_validate_the_same_minimal_component():
    document = MappingDocumentV1(
        ruleSet=MappingRuleSetV1(
            code="policy-check",
            name="策略检查",
            rules=[
                ValueMapRule(
                    id="status-map",
                    sourceFields=["status"],
                    targetFields=["status_label"],
                    config=ValueMapRuleConfig(mappings={"A": "active"}),
                )
            ],
        )
    )

    for caller in ALL_CALLERS:
        assert MappingValidator().validate(document, build_policy(caller)) == []


def test_policy_schema_hash_mismatch_is_stable_error():
    document = MappingDocumentV1(
        ruleSet=MappingRuleSetV1(
            code="hash-check", name="hash", sourceSchemaHash="actual"
        )
    )
    policy = build_policy("warehouse", source_schema_hash="expected")

    with pytest.raises(Exception) as exc_info:
        MappingValidator().validate(document, policy)

    assert exc_info.value.code == MappingErrorCode.MAPPING_SCHEMA_CHANGED
