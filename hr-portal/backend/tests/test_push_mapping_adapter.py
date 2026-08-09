import asyncio
from copy import deepcopy

import pytest

from app.mapping.adapters.push_target_legacy import PushTargetLegacyAdapter
from app.mapping.dto import FieldRule, FieldRuleConfig, ValueMapRule, ValueMapRuleConfig
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.executor import MappingExecutor
from app.mapping.policy import build_policy


@pytest.fixture
def adapter():
    return PushTargetLegacyAdapter()


@pytest.fixture
def policy():
    return build_policy(
        caller="push_target",
        source_asset_id="employee_source",
        target_asset_id="partner_payload",
    )


def legacy_apply(row: dict, mappings: list[dict]) -> dict:
    if not mappings:
        return row
    mapping_dict = {
        mapping["source"]: mapping["target"]
        for mapping in mappings
        if mapping.get("source") and mapping.get("target")
    }
    return {mapping_dict.get(key, key): value for key, value in row.items()}


def public_apply(document, row: dict) -> dict:
    result = asyncio.run(MappingExecutor().execute(document, [row]))
    assert result.errors == []
    return result.outputRows[0]


def test_empty_mapping_keeps_original_push_semantics(adapter, policy):
    raw = {"id": 17, "name": "空映射", "field_mappings": []}
    row = {"employee_no": "E001", "employee_name": "Alice"}

    result = adapter.read(raw, policy=policy)

    assert result.storageMode == "legacy_v1"
    assert result.document.ruleSet.rules == []
    assert public_apply(result.document, row) == legacy_apply(row, raw["field_mappings"])
    assert adapter.write(
        result.document,
        policy=policy,
        compatibility=result.compatibility,
        storage_mode="legacy_v1",
    ) == raw


def test_regular_mapping_uses_rename_and_passes_unmapped_fields_through(adapter, policy):
    raw = {
        "id": 17,
        "name": "员工推送",
        "field_mappings": [
            {"source": "employee_no", "target": "staff_code"},
            {"source": "employee_name", "target": "staff_name"},
        ],
    }
    row = {
        "employee_no": "E001",
        "employee_name": "Alice",
        "department": "Finance",
    }

    result = adapter.read(raw, policy=policy)

    assert all(isinstance(rule, FieldRule) for rule in result.document.ruleSet.rules)
    assert all(rule.config.mode == "rename" for rule in result.document.ruleSet.rules)
    assert public_apply(result.document, row) == legacy_apply(row, raw["field_mappings"])
    assert public_apply(result.document, row) == {
        "staff_code": "E001",
        "staff_name": "Alice",
        "department": "Finance",
    }


def test_unknown_fields_are_preserved_in_lossless_round_trip(adapter, policy):
    raw = {
        "id": 17,
        "name": "带扩展字段",
        "push_type": "http_push",
        "future_target_option": {"batch": "strict"},
        "field_mappings": [
            {
                "source": "employee_no",
                "target": "staff_code",
                "future_rule_option": ["keep", "exactly"],
            }
        ],
    }

    result = adapter.read(raw, policy=policy)

    assert result.compatibility.writable is True
    assert result.compatibility.unknownFields["future_target_option"] == {"batch": "strict"}
    assert result.compatibility.unknownFields[
        "field_mappings[0].future_rule_option"
    ] == ["keep", "exactly"]
    assert result.legacySnapshot == raw
    assert adapter.write(
        result.document,
        policy=policy,
        compatibility=result.compatibility,
        storage_mode="legacy_v1",
    ) == raw


def test_save_and_reopen_preserves_document_and_payload_semantics(adapter, policy):
    raw = {
        "id": 17,
        "name": "保存重开",
        "field_mappings": [
            {"source": "employee_no", "target": "staff_code", "label": "工号"}
        ],
    }
    row = {"employee_no": "E001", "department": "Finance"}
    first_open = adapter.read(raw, policy=policy)
    saved = adapter.write(
        first_open.document,
        policy=policy,
        compatibility=first_open.compatibility,
        storage_mode="legacy_v1",
    )
    reopened = adapter.read(saved, policy=policy)

    assert reopened.document.to_dict() == first_open.document.to_dict()
    assert saved == raw
    assert public_apply(reopened.document, row) == legacy_apply(row, saved["field_mappings"])


def test_editing_mapping_updates_payload_without_losing_unknown_fields(adapter, policy):
    raw = {
        "id": 17,
        "field_mappings": [
            {"source": "employee_no", "target": "staff_code", "future": True}
        ],
    }
    result = adapter.read(raw, policy=policy)
    rule = result.document.ruleSet.rules[0]
    rule.targetFields = ["worker_code"]

    saved = adapter.write(
        result.document,
        policy=policy,
        compatibility=result.compatibility,
        storage_mode="legacy_v1",
    )

    assert saved["field_mappings"] == [
        {"source": "employee_no", "target": "worker_code", "future": True}
    ]
    row = {"employee_no": "E001", "department": "Finance"}
    assert public_apply(result.document, row) == legacy_apply(row, saved["field_mappings"])


@pytest.mark.parametrize(
    "replacement",
    [
        FieldRule(
            id="0",
            sourceFields=["employee_no"],
            targetFields=["staff_code"],
            config=FieldRuleConfig(mode="copy"),
        ),
        ValueMapRule(
            id="0",
            sourceFields=["employee_no"],
            targetFields=["staff_code"],
            config=ValueMapRuleConfig(mappings={"E001": "S001"}),
        ),
    ],
)
def test_unrepresentable_public_mapping_is_blocked(adapter, policy, replacement):
    raw = {
        "id": 17,
        "field_mappings": [{"source": "employee_no", "target": "staff_code"}],
    }
    result = adapter.read(deepcopy(raw), policy=policy)
    result.document.ruleSet.rules[0] = replacement

    with pytest.raises(MappingException) as exc_info:
        adapter.write(
            result.document,
            policy=policy,
            compatibility=result.compatibility,
            storage_mode="legacy_v1",
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED


def test_malformed_legacy_mapping_blocks_lossy_write(adapter, policy):
    raw = {"field_mappings": [{"source": "employee_no", "future": "preserve"}]}
    result = adapter.read(raw, policy=policy)

    assert result.compatibility.writable is False
    assert result.compatibility.lossyFields == ["field_mappings[0]"]
    with pytest.raises(MappingException) as exc_info:
        adapter.write(
            result.document,
            policy=policy,
            compatibility=result.compatibility,
            storage_mode="legacy_v1",
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED
