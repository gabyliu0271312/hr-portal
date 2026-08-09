from copy import deepcopy

import pytest

from app.mapping.adapters.workflow import WorkflowMappingAdapter
from app.mapping.dto import FieldRule
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.policy import build_policy


@pytest.fixture
def adapter():
    return WorkflowMappingAdapter()


@pytest.fixture
def policy():
    return build_policy(
        caller="workflow",
        source_asset_id="connector.records",
        target_asset_id="workflow.output",
    )


@pytest.mark.parametrize("node_type", ["FIELD_TRANSFORM", "FIELD_MAPPING", "TRANSFORM"])
def test_reads_legacy_workflow_node_types_as_public_field_rules(adapter, policy, node_type):
    raw = {
        "id": "map-employee",
        "type": node_type,
        "label": "员工字段转换",
        "config": {
            "mapping": [
                {"source": "employee_no", "target": "staff_code"},
                {"from": "employee_name", "to": "staff_name"},
            ]
        },
    }

    result = adapter.read(raw, policy=policy)

    assert result.storageMode == "component_v1"
    assert result.document.mappingSchemaVersion == 1
    assert result.document.ruleSet.sourceAsset == "connector.records"
    assert result.document.ruleSet.targetAsset == "workflow.output"
    assert all(isinstance(rule, FieldRule) for rule in result.document.ruleSet.rules)
    assert [rule.sourceFields for rule in result.document.ruleSet.rules] == [
        ["employee_no"],
        ["employee_name"],
    ]
    assert [rule.targetFields for rule in result.document.ruleSet.rules] == [
        ["staff_code"],
        ["staff_name"],
    ]
    assert result.compatibility.requiresMigration is True
    assert result.legacySnapshot == raw


def test_reads_config_field_mapping_object(adapter, policy):
    raw = {
        "id": "map-object",
        "type": "FIELD_MAPPING",
        "config": {"field_mapping": {"employee_no": "staff_code", "name": "staff_name"}},
    }

    result = adapter.read(raw, policy=policy)

    assert [
        (rule.sourceFields[0], rule.targetFields[0])
        for rule in result.document.ruleSet.rules
    ] == [("employee_no", "staff_code"), ("name", "staff_name")]


def test_unknown_fields_round_trip_through_write_reopen_and_upgrade(adapter, policy):
    raw = {
        "id": "map-future",
        "type": "TRANSFORM",
        "label": "保留扩展字段",
        "future_node_option": {"owner": "workflow"},
        "config": {
            "input_key": "${connector.data}",
            "failure_policy": "RETRY",
            "future_config_option": ["keep", "exactly"],
            "mapping": {
                "version": 1,
                "mode": "strict",
                "future_mapping_option": {"batch": True},
                "rules": [
                    {
                        "source_field_id": "employee_no",
                        "target_field_id": "staff_code",
                        "source_kind": "upstream_field",
                        "future_rule_option": "preserve",
                    }
                ],
            },
        },
    }

    opened = adapter.read(deepcopy(raw), policy=policy)
    unknown = opened.compatibility.unknownFields
    assert unknown["future_node_option"] == {"owner": "workflow"}
    assert unknown["config.future_config_option"] == ["keep", "exactly"]
    assert unknown["config.mapping.future_mapping_option"] == {"batch": True}
    assert unknown["config.mapping.rules[0].future_rule_option"] == "preserve"

    saved = adapter.write(
        opened.document,
        policy=policy,
        compatibility=opened.compatibility,
    )
    upgraded = adapter.upgrade(deepcopy(raw), policy=policy)
    reopened = adapter.read(saved, policy=policy)

    assert saved == upgraded
    assert saved["future_node_option"] == raw["future_node_option"]
    assert saved["config"]["mapping"] == raw["config"]["mapping"]
    assert saved["config"]["failure_policy"] == "RETRY"
    assert saved["config"]["storageMode"] == "component_v1"
    assert saved["config"]["mapping_component"] == opened.document.to_dict()
    assert saved["config"]["legacy_mapping_snapshot"] == raw
    assert reopened.storageMode == "component_v1"
    assert reopened.document.to_dict() == opened.document.to_dict()
    assert reopened.legacySnapshot == raw


def test_new_component_node_write_read_reopen_round_trip(adapter, policy):
    raw = {
        "id": "component-map",
        "type": "DATA_MAPPING",
        "config": {
            "mapping_component": {
                "mappingSchemaVersion": 1,
                "ruleSet": {
                    "code": "component-map",
                    "name": "公共映射",
                    "sourceAsset": None,
                    "targetAsset": None,
                    "sourceSchemaHash": "",
                    "targetSchemaHash": "",
                    "rules": [],
                },
            },
            "storageMode": "component_v1",
        },
    }

    opened = adapter.read(raw, policy=policy)
    saved = adapter.write(
        opened.document,
        policy=policy,
        compatibility=opened.compatibility,
    )
    reopened = adapter.read(saved, policy=policy)

    assert saved["type"] == "DATA_MAPPING"
    assert saved["config"]["storageMode"] == "component_v1"
    assert reopened.document.to_dict() == opened.document.to_dict()
    assert reopened.legacySnapshot is None


def test_lossy_legacy_mapping_blocks_write_and_upgrade(adapter, policy):
    raw = {
        "id": "map-script",
        "type": "FIELD_TRANSFORM",
        "config": {
            "field_mapping": [
                {
                    "source": "employee_no",
                    "target": "staff_code",
                    "expression": "custom(employee_no)",
                },
                {
                    "source": "department",
                    "target": ["department_code", "department_name"],
                },
            ]
        },
    }

    result = adapter.read(raw, policy=policy)
    assert result.compatibility.writable is False
    assert result.compatibility.requiresMigration is True
    assert result.compatibility.lossyFields == [
        "config.field_mapping[0].expression",
        "config.field_mapping[1]",
    ]

    with pytest.raises(MappingException) as write_error:
        adapter.write(
            result.document,
            policy=policy,
            compatibility=result.compatibility,
        )
    assert write_error.value.code == MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED

    with pytest.raises(MappingException) as upgrade_error:
        adapter.upgrade(raw, policy=policy)
    assert upgrade_error.value.code == MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED


def test_upgrade_snapshot_rollback_restores_exact_legacy_node(adapter, policy):
    raw = {
        "id": "map-rollback",
        "type": "FIELD_MAPPING",
        "x": 120,
        "y": 240,
        "label": "待升级字段映射",
        "future_node_option": "keep",
        "config": {
            "input_key": "${source.data}",
            "retry": {"max_attempts": 3},
            "field_mapping": [{"source": "name", "target": "employee_name", "future": True}],
        },
    }

    upgraded = adapter.upgrade(deepcopy(raw), policy=policy)
    assert upgraded["config"]["legacy_mapping_snapshot"] == raw

    upgraded["config"]["mapping_component"]["ruleSet"]["rules"][0]["targetFields"] = [
        "display_name"
    ]
    rolled_back = adapter.rollback(upgraded, policy=policy)

    assert rolled_back == raw
    assert "mapping_component" not in rolled_back["config"]
    assert "legacy_mapping_snapshot" not in rolled_back["config"]
