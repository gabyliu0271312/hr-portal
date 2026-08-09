import pytest

from app.mapping.adapters.ucp_transform_v1 import UcpTransformV1Adapter
from app.mapping.dto import (
    FieldRule,
    FieldRuleConfig,
    MappingCompatibilityV1,
    MappingDocumentV1,
    MappingRuleSetV1,
    RULE_TYPE_FIELD,
    ValueMapRule,
    ValueMapRuleConfig,
)
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.policy import build_policy


@pytest.fixture
def adapter():
    return UcpTransformV1Adapter()


@pytest.fixture
def policy():
    return build_policy(caller="ucp_transform")


def legacy_mapping(mode="strict"):
    return {
        "mapping": {
            "version": 1,
            "mode": mode,
            "source_operation_id": "source-op",
            "source_schema_hash": "sha256:source",
            "target_operation_id": "target-op",
            "target_schema_hash": "sha256:target",
            "target_field_catalog": [{"field_id": "employee_name"}],
            "rules": [
                {
                    "source_field_id": "name",
                    "target_field_id": "employee_name",
                    "source_kind": "upstream_field",
                }
            ],
        }
    }


@pytest.mark.parametrize("mode", ["strict", "mapped_plus_same_name"])
def test_read_legacy_modes_to_field_rules(adapter, policy, mode):
    result = adapter.read(legacy_mapping(mode), policy=policy)

    assert result.storageMode == "legacy_v1"
    assert result.document.mappingSchemaVersion == 1
    assert len(result.document.ruleSet.rules) == 1
    rule = result.document.ruleSet.rules[0]
    assert isinstance(rule, FieldRule)
    assert rule.type == RULE_TYPE_FIELD
    assert rule.sourceFields == ["name"]
    assert rule.targetFields == ["employee_name"]
    assert result.compatibility.unknownFields["__legacy_mapping_mode__"] == mode
    assert result.legacySnapshot == legacy_mapping(mode)["mapping"]


def test_field_only_read_write_preserves_legacy_mapping(adapter, policy):
    raw = legacy_mapping("strict")
    result = adapter.read(raw, policy=policy)

    written = adapter.write(
        result.document,
        policy=policy,
        compatibility=result.compatibility,
        storage_mode="legacy_v1",
    )

    assert written == raw


def test_unknown_legacy_fields_are_retained_and_round_trip(adapter, policy):
    raw = legacy_mapping()
    raw["mapping"]["future_option"] = {"keep": True}
    raw["mapping"]["rules"][0]["future_rule_option"] = "value"

    result = adapter.read(raw, policy=policy)

    assert result.compatibility.unknownFields["mapping.future_option"] == {"keep": True}
    assert result.compatibility.unknownFields["rules[0].future_rule_option"] == "value"
    written = adapter.write(
        result.document,
        policy=policy,
        compatibility=result.compatibility,
        storage_mode="legacy_v1",
    )
    assert written["mapping"] == raw["mapping"]


def test_component_v1_has_priority_and_is_not_double_executed(adapter, policy):
    raw = legacy_mapping()
    component = MappingDocumentV1(
        ruleSet=MappingRuleSetV1(
            code="component",
            name="component",
            rules=[
                FieldRule(
                    id="component-rule",
                    sourceFields=["component_source"],
                    targetFields=["component_target"],
                    config=FieldRuleConfig(mode="rename"),
                )
            ],
        )
    )
    raw["mapping_component"] = component.to_dict()

    result = adapter.read(raw, policy=policy)

    assert result.storageMode == "component_v1"
    assert [rule.id for rule in result.document.ruleSet.rules] == ["component-rule"]
    assert result.legacySnapshot == raw["mapping"]


def test_non_field_rule_cannot_downgrade_to_legacy(adapter, policy):
    document = MappingDocumentV1(
        ruleSet=MappingRuleSetV1(
            code="component",
            name="component",
            rules=[
                ValueMapRule(
                    id="value-map",
                    sourceFields=["status"],
                    targetFields=["status"],
                    config=ValueMapRuleConfig(mappings={"A": "active"}),
                )
            ],
        )
    )

    with pytest.raises(MappingException) as exc_info:
        adapter.write(
            document,
            policy=policy,
            compatibility=MappingCompatibilityV1(sourceFormat="ucp_transform_component_v1"),
            storage_mode="legacy_v1",
        )
    assert exc_info.value.code == MappingErrorCode.MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED
