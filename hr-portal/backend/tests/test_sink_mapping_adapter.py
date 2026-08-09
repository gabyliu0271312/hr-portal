from copy import deepcopy

import pytest

from app.mapping.adapters.warehouse_asset_sink_legacy import (
    WarehouseAssetSinkLegacyAdapter,
)
from app.mapping.dto import (
    FieldRule,
    FormatRule,
    TypeConvertRule,
    ValueMapRule,
    ValueMapRuleConfig,
)
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.policy import build_policy


@pytest.fixture
def adapter():
    return WarehouseAssetSinkLegacyAdapter()


@pytest.fixture
def policy():
    return build_policy(caller="warehouse_sink", source_asset_id="event.records")


def legacy_sink_config():
    return {
        "target_asset": "emp_monthly_allocation",
        "write_mode": "period_full_snapshot",
        "primary_key": ["cost_period", "employee_no", "code"],
        "field_whitelist": [
            "cost_period",
            "employee_no",
            "employee",
            "code",
            "headcount",
        ],
        "batch_key": "request_id",
        "period_field": "cost_period",
        "mapping": [
            {
                "source": "period",
                "target": "cost_period",
                "transform": "yyyy_mm_to_yyyymm",
                "required": True,
            },
            {
                "source": "employee_no",
                "target": "employee_no",
                "transform": "string",
                "required": True,
            },
            {
                "source": "employee_name",
                "target": "employee",
                "transform": "trim",
                "required": True,
            },
            {
                "source": "project_code",
                "target": "code",
                "transform": "identity",
                "required": True,
            },
            {
                "source": "allocation_percentage",
                "target": "headcount",
                "transform": "decimal_divide_100",
                "required": True,
                "minimum": 0,
                "maximum": 1,
            },
            {
                "source": "amount",
                "target": "amount",
                "transform": "decimal",
            },
        ],
        "validations": [
            {
                "type": "group_sum_equals",
                "group_by": ["cost_period", "employee_no"],
                "sum_field": "headcount",
                "expected": 1,
                "tolerance": "0.0001",
            }
        ],
    }


def test_read_maps_supported_transforms_to_public_rules(adapter, policy):
    raw = legacy_sink_config()

    result = adapter.read(raw, policy=policy)

    assert result.storageMode == "legacy_v1"
    assert result.document.mappingSchemaVersion == 1
    assert result.document.ruleSet.sourceAsset == "event.records"
    assert result.document.ruleSet.targetAsset == raw["target_asset"]
    rules = result.document.ruleSet.rules
    assert isinstance(rules[0], FormatRule)
    assert rules[0].config.formatType == "yyyy_mm_to_yyyymm"
    assert isinstance(rules[1], TypeConvertRule)
    assert rules[1].config.targetType == "string"
    assert isinstance(rules[2], FormatRule)
    assert rules[2].config.formatType == "trim"
    assert isinstance(rules[3], FieldRule)
    assert isinstance(rules[4], FormatRule)
    assert rules[4].config.formatType == "unit_convert"
    assert rules[4].config.options == {"multiplier": 0.01}
    assert isinstance(rules[5], TypeConvertRule)
    assert rules[5].config.targetType == "number"


def test_read_write_round_trip_preserves_legacy_config(adapter, policy):
    raw = legacy_sink_config()
    result = adapter.read(raw, policy=policy)

    written = adapter.write(
        result.document,
        policy=policy,
        compatibility=result.compatibility,
        storage_mode="legacy_v1",
    )

    assert written == raw


def test_unknown_fields_and_sink_validation_contract_round_trip(adapter, policy):
    raw = legacy_sink_config()
    raw["future_sink_option"] = {"enabled": True}
    raw["mapping"][2]["future_rule_option"] = ["keep", "exactly"]
    raw["validations"][0]["future_validation_option"] = "strict"

    result = adapter.read(raw, policy=policy)

    unknown = result.compatibility.unknownFields
    assert unknown["future_sink_option"] == {"enabled": True}
    assert unknown["mapping[2].future_rule_option"] == ["keep", "exactly"]
    assert unknown["mapping[4].required"] is True
    assert unknown["mapping[4].minimum"] == 0
    assert unknown["mapping[4].maximum"] == 1
    assert unknown["validations"] == raw["validations"]
    assert result.legacySnapshot == raw

    written = adapter.write(
        result.document,
        policy=policy,
        compatibility=result.compatibility,
        storage_mode="legacy_v1",
    )
    assert written == raw


def test_write_cannot_change_or_bypass_sink_strong_contract(adapter, policy):
    raw = legacy_sink_config()
    result = adapter.read(raw, policy=policy)
    original_contract = {
        key: deepcopy(raw[key])
        for key in (
            "target_asset",
            "write_mode",
            "primary_key",
            "field_whitelist",
            "batch_key",
            "period_field",
            "validations",
        )
    }
    first_rule = result.document.ruleSet.rules[0]
    first_rule.sourceFields = ["locked_period"]

    written = adapter.write(
        result.document,
        policy=policy,
        compatibility=result.compatibility,
        storage_mode="component_v1",
    )

    assert written["mapping"][0]["source"] == "locked_period"
    assert {
        key: written[key]
        for key in original_contract
    } == original_contract


def test_lossy_write_is_blocked_for_unrepresentable_public_rule(adapter, policy):
    result = adapter.read(legacy_sink_config(), policy=policy)
    result.document.ruleSet.rules[0] = ValueMapRule(
        id="0",
        sourceFields=["period"],
        targetFields=["cost_period"],
        config=ValueMapRuleConfig(mappings={"2026-08": "202608"}),
    )

    with pytest.raises(MappingException) as exc_info:
        adapter.write(
            result.document,
            policy=policy,
            compatibility=result.compatibility,
            storage_mode="legacy_v1",
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED


def test_lossy_write_is_blocked_when_snapshot_or_supported_transform_is_missing(
    adapter,
    policy,
):
    unsupported = legacy_sink_config()
    unsupported["mapping"][0]["transform"] = "custom_script"
    result = adapter.read(unsupported, policy=policy)
    assert result.compatibility.writable is False
    assert result.compatibility.lossyFields == ["mapping[0]"]

    with pytest.raises(MappingException) as exc_info:
        adapter.write(
            result.document,
            policy=policy,
            compatibility=result.compatibility,
            storage_mode="legacy_v1",
        )
    assert exc_info.value.code == MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED

    valid = adapter.read(legacy_sink_config(), policy=policy)
    valid.compatibility.unknownFields.clear()
    with pytest.raises(MappingException) as missing_snapshot:
        adapter.write(
            valid.document,
            policy=policy,
            compatibility=valid.compatibility,
            storage_mode="legacy_v1",
        )
    assert missing_snapshot.value.code == MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED
