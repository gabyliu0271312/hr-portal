from app.mapping.adapters.warehouse_standardization import WarehouseStandardizationAdapter
from app.mapping.policy import build_policy


def test_unknown_rule_config_round_trip_and_legacy_value_map_shapes():
    raw = {
        "asset_type": "table",
        "asset_code": "ods_emp",
        "target_table": "dwd_emp",
        "rules": [
            {
                "id": 1,
                "rule_type": "value_map",
                "source_field": "status",
                "target_field": "status_label",
                "rule_config": {
                    "mappings": [{"from": "A", "to": "在职"}],
                    "unmapped": "keep",
                    "future_option": {"enabled": True},
                },
            },
        ],
    }
    adapter = WarehouseStandardizationAdapter()
    policy = build_policy(caller="warehouse")
    opened = adapter.read(raw, policy=policy)
    assert opened.document.ruleSet.rules[0].config.mappings == {"A": "在职"}
    assert opened.compatibility.unknownFields["rule_1_config"] == {"future_option": {"enabled": True}}

    written = adapter.write(
        opened.document,
        policy=policy,
        compatibility=opened.compatibility,
    )
    assert written["rules"][0]["rule_config"] == {
        "future_option": {"enabled": True},
        "mappings": {"A": "在职"},
        "unmapped": "keep",
        "default": None,
    }


def test_unknown_rule_type_is_not_writable():
    adapter = WarehouseStandardizationAdapter()
    result = adapter.read(
        {"asset_code": "ods_emp", "rules": [{"id": 9, "rule_type": "future_rule", "rule_config": {"x": 1}}]},
        policy=build_policy(caller="warehouse"),
    )
    assert result.compatibility.writable is False
    assert "rule_type:future_rule" in result.compatibility.lossyFields
