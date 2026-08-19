"""Warehouse Standardization Adapter

公共 DTO ↔ standardization_rules 双向无损转换。
未知 rule_config 属性必须 round-trip 保留。
无法无损表达时阻断并返回 MAPPING_LOSSY_WRITE_BLOCKED。
"""

from __future__ import annotations

from typing import Any, Optional

from app.mapping.dto import (
    MappingDocumentV1,
    MappingRuleV1,
    MappingRuleSetV1,
    MappingCompatibilityV1,
    MappingRuleBase,
    FieldRule,
    FieldRuleConfig,
    ValueMapRule,
    ValueMapRuleConfig,
    ReferenceLookupRule,
    ReferenceLookupRuleConfig,
    LookupConfig,
    MatchRule,
    IdentityWithOverridesRule,
    IdentityWithOverridesRuleConfig,
    TypeConvertRule,
    TypeConvertRuleConfig,
    FormatRule,
    FormatRuleConfig,
    SplitMergeRule,
    SplitMergeRuleConfig,
    RULE_TYPE_FIELD,
    RULE_TYPE_VALUE_MAP,
    RULE_TYPE_REFERENCE_LOOKUP,
    RULE_TYPE_IDENTITY_WITH_OVERRIDES,
    RULE_TYPE_TYPE_CONVERT,
    RULE_TYPE_FORMAT,
    RULE_TYPE_SPLIT_MERGE,
    UNMATCHED_KEEP,
    UNMATCHED_SET_DEFAULT,
    UNMATCHED_SET_NULL,
    UNMATCHED_FLAG,
    UNMATCHED_REJECT,
    ON_ERROR_REJECT,
    ON_MATCH_USE_AND_STOP,
    ON_MATCH_CONTINUE,
    ON_MATCH_ONLY_FILL_EMPTY,
    MAPPING_SCHEMA_VERSION,
)
from app.mapping.policy import MappingCallerPolicyV1, build_policy
from app.mapping.adapter_protocol import (
    MappingAdapter,
    MappingAdapterReadResult,
    AdapterStorageMode,
)
from app.mapping.errors import MappingException, MappingErrorCode
from app.mapping.dto import ALL_RULE_TYPES


# 012 权威 10 类枚举
WAREHOUSE_RULE_TYPES_10 = (
    "rename",
    "type_convert",
    "value_map",
    "unit_convert",
    "split_merge",
    "deduplicate",
    "null_handling",
    "format_standardize",
    "reference_lookup",
    "identity_with_overrides",
)

# 公共 → Warehouse 映射
PUBLIC_TO_WAREHOUSE = {
    RULE_TYPE_FIELD: "rename",
    RULE_TYPE_VALUE_MAP: "value_map",
    RULE_TYPE_REFERENCE_LOOKUP: "reference_lookup",
    RULE_TYPE_IDENTITY_WITH_OVERRIDES: "identity_with_overrides",
    RULE_TYPE_TYPE_CONVERT: "type_convert",
    RULE_TYPE_FORMAT: "format_standardize",  # 或 unit_convert
    RULE_TYPE_SPLIT_MERGE: "split_merge",
}

# Warehouse → 公共 映射
WAREHOUSE_TO_PUBLIC = {
    "rename": RULE_TYPE_FIELD,
    "value_map": RULE_TYPE_VALUE_MAP,
    "reference_lookup": RULE_TYPE_REFERENCE_LOOKUP,
    "identity_with_overrides": RULE_TYPE_IDENTITY_WITH_OVERRIDES,
    "type_convert": RULE_TYPE_TYPE_CONVERT,
    "format_standardize": RULE_TYPE_FORMAT,
    "unit_convert": RULE_TYPE_FORMAT,
    "split_merge": RULE_TYPE_SPLIT_MERGE,
    # 数仓专属
    "deduplicate": None,  # 保留为数仓专属
    "null_handling": None,  # 保留为数仓专属
}


class WarehouseStandardizationAdapter:
    """Warehouse adapter: 公共 DTO ↔ standardization_rules"""

    @property
    def caller(self) -> str:
        return "warehouse"

    def read(
        self,
        raw_config: dict[str, Any],
        *,
        policy: MappingCallerPolicyV1,
    ) -> MappingAdapterReadResult:
        """
        raw_config 格式:
        {
            "asset_type": "table",
            "asset_code": "ods_xxx",
            "rules": [
                {
                    "id": 1,
                    "rule_type": "rename",
                    "source_field": "a",
                    "target_field": "b",
                    "rule_config": {...},
                    "enabled": true,
                    "display_order": 1,
                    "_unknown_extra": ...  # 未知字段保留
                }
            ]
        }
        """
        rules: list[MappingRuleV1] = []
        unknown_fields: dict[str, Any] = {}
        lossy_fields: list[str] = []
        has_warehouse_exclusive = False
        raw_rules_by_id: dict[str, dict[str, Any]] = {}

        for raw_rule in raw_config.get("rules", []):
            rtype = raw_rule.get("rule_type", "")
            rule_id = str(raw_rule.get("id", "?"))
            raw_rules_by_id[rule_id] = raw_rule

            # 数仓专属规则不映射为公共类型, 但保留
            if rtype in ("deduplicate", "null_handling"):
                has_warehouse_exclusive = True
                unknown_fields[f"rule_{raw_rule.get('id', '?')}"] = {
                    "rule_type": rtype,
                    "source_field": raw_rule.get("source_field"),
                    "target_field": raw_rule.get("target_field"),
                    "rule_config": raw_rule.get("rule_config"),
                }
                continue

            public_type = WAREHOUSE_TO_PUBLIC.get(rtype)
            if public_type is None:
                # 未知规则类型显式记录为不可写，避免静默丢失。
                unknown_fields[f"rule_{raw_rule.get('id', '?')}"] = raw_rule
                lossy_fields.append(f"rule_type:{rtype}")
                continue

            rule = self._convert_warehouse_rule_to_public(raw_rule, public_type)
            if rule is not None:
                rules.append(rule)

            # 检查 rule_config 中是否有未知字段，并保存完整配置供 write 无损合并。
            rc = raw_rule.get("rule_config") or {}
            known_keys = self._get_known_config_keys(rtype)
            unknown_config = {k: v for k, v in rc.items() if k not in known_keys}
            if unknown_config:
                unknown_fields[f"rule_{rule_id}_config"] = unknown_config

        doc = MappingDocumentV1(
            mappingSchemaVersion=MAPPING_SCHEMA_VERSION,
            ruleSet=MappingRuleSetV1(
                code=raw_config.get("asset_code", ""),
                name=raw_config.get("asset_code", ""),
                sourceAsset=raw_config.get("asset_code"),
                targetAsset=raw_config.get("target_table"),
                sourceSchemaHash="",
                targetSchemaHash="",
                rules=rules,
            ),
        )

        compat = MappingCompatibilityV1(
            sourceFormat="standardization_rules",
            readable=True,
            writable=not lossy_fields and (not has_warehouse_exclusive or not lossy_fields),
            requiresMigration=has_warehouse_exclusive,
            lossyFields=lossy_fields,
            unknownFields=unknown_fields,
        )

        return MappingAdapterReadResult(
            document=doc,
            compatibility=compat,
            storageMode="legacy_v1" if not has_warehouse_exclusive else "component_v1",
        )

    def write(
        self,
        document: MappingDocumentV1,
        *,
        policy: MappingCallerPolicyV1,
        compatibility: MappingCompatibilityV1,
        storage_mode: AdapterStorageMode = "component_v1",
    ) -> dict[str, Any]:
        """将公共 DTO 回写为 standardization_rules 格式"""

        # 检查有损写入
        if not compatibility.writable:
            raise MappingException(
                MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
                f"无法无损回写: 存在有损字段 {compatibility.lossyFields}",
                http_status=422,
                details={
                    "lossyFields": compatibility.lossyFields,
                    "unknownFields": compatibility.unknownFields,
                },
            )

        rules_out: list[dict[str, Any]] = []

        for rule in document.ruleSet.rules:
            wh_type = PUBLIC_TO_WAREHOUSE.get(rule.type)
            if wh_type is None:
                raise MappingException(
                    MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
                    f"无法将公共规则类型 {rule.type} 转换为 warehouse 类型",
                    http_status=422,
                )

            wh_rule = self._convert_public_rule_to_warehouse(rule, wh_type)
            raw_config = compatibility.unknownFields.get(f"rule_{rule.id}_config")
            if isinstance(raw_config, dict):
                wh_rule["rule_config"] = {**raw_config, **wh_rule.get("rule_config", {})}
            rules_out.append(wh_rule)

        # 保留 unknownFields 中的数仓专属规则
        for key, val in compatibility.unknownFields.items():
            if key.startswith("rule_") and isinstance(val, dict) and "rule_type" in val:
                rules_out.append(val)

        return {
            "asset_type": "table",
            "asset_code": document.ruleSet.sourceAsset or document.ruleSet.code,
            "target_table": document.ruleSet.targetAsset,
            "rules": rules_out,
        }

    def validate_legacy(self, raw_config: dict[str, Any]) -> MappingCompatibilityV1:
        """验证旧配置兼容状态"""
        result = self.read(raw_config, policy=build_policy(caller="warehouse"))
        return result.compatibility

    # -- 转换: Warehouse → 公共 -----------------------------------------------

    def _convert_warehouse_rule_to_public(
        self,
        raw: dict[str, Any],
        public_type: str,
    ) -> MappingRuleV1 | None:
        rtype = raw.get("rule_type", "")
        rc = raw.get("rule_config") or {}
        src = raw.get("source_field", "")
        tgt = raw.get("target_field", "")
        rid = str(raw.get("id", ""))
        enabled = raw.get("enabled", True)
        order = raw.get("display_order", 0)

        base = {
            "id": rid,
            "enabled": enabled,
            "displayOrder": order,
            "sourceFields": [src] if src else [],
            "targetFields": [tgt] if tgt else [],
        }

        if public_type == RULE_TYPE_FIELD:
            return FieldRule(**base, type=RULE_TYPE_FIELD, config=FieldRuleConfig(mode="rename"))

        elif public_type == RULE_TYPE_VALUE_MAP:
            # 兼容对象和数组格式
            mappings = rc.get("mappings", {})
            if isinstance(mappings, list):
                mappings = {item.get("from", ""): item.get("to", "") for item in mappings if isinstance(item, dict)}
            unmatched = self._map_unmatched_wh_to_public(rc.get("unmapped", "keep"))
            return ValueMapRule(
                **base,
                type=RULE_TYPE_VALUE_MAP,
                config=ValueMapRuleConfig(
                    mappings=mappings,
                    unmatched=unmatched,
                    defaultValue=rc.get("default"),
                ),
            )

        elif public_type == RULE_TYPE_REFERENCE_LOOKUP:
            raw_lookup_configs = rc.get("lookup_configs") or []
            if raw_lookup_configs:
                lookup_configs = [
                    LookupConfig(
                        id=item.get("id", f"lookup_{index}"),
                        priority=int(item.get("priority", index)),
                        referenceDatasetId=item.get("reference_dataset_id", item.get("referenceDatasetId", "")),
                        sourceField=item.get("source_field", item.get("sourceField", "")),
                        referenceMatchField=item.get("reference_match_field", item.get("referenceMatchField", "")),
                        referenceReturnField=item.get("reference_return_field", item.get("referenceReturnField", "")),
                        targetField=item.get("target_field", item.get("targetField", base["targetFields"][0] if base["targetFields"] else "")),
                        conditions=dict(item.get("conditions") or {}),
                    )
                    for index, item in enumerate(raw_lookup_configs)
                ]
            else:
                target = rc.get("target", base["targetFields"][0] if base["targetFields"] else "expense_type")
                result_col = rc.get("result_col", "cost_classification")
                lookup_table = rc.get("lookup_table", "")
                lookup_configs = [
                    LookupConfig(
                        id=mr.get("id", f"lookup_{index}"),
                        priority=int(mr.get("priority", index)),
                        referenceDatasetId=lookup_table,
                        sourceField=mr.get("source_field", mr.get("src_field", "")),
                        referenceMatchField=mr.get("reference_field", rc.get("value_col", "value")),
                        referenceReturnField=result_col,
                        targetField=target,
                        conditions=dict(mr.get("conditions") or ({rc.get("type_col", "field_type"): mr["match_type"]} if mr.get("match_type") else {})),
                    )
                    for index, mr in enumerate(rc.get("rules", []))
                ]
            return ReferenceLookupRule(
                **base,
                targetFields=[lookup_configs[0].targetField] if lookup_configs else base["targetFields"],
                type=RULE_TYPE_REFERENCE_LOOKUP,
                config=ReferenceLookupRuleConfig(
                    lookupConfigs=lookup_configs,
                    referenceDatasetId=rc.get("lookup_table", ""),
                    outputMap={rc.get("target", "expense_type"): rc.get("result_col", "cost_classification")},
                    unmatched=self._map_unmatched_wh_to_public(rc.get("unmatched", "set_default")),
                    defaultValue=rc.get("default"),
                ),
            )

        elif public_type == RULE_TYPE_IDENTITY_WITH_OVERRIDES:
            return IdentityWithOverridesRule(
                **base,
                type=RULE_TYPE_IDENTITY_WITH_OVERRIDES,
                config=IdentityWithOverridesRuleConfig(
                    defaultBehavior="keep_source",
                    overrides=rc.get("overrides", {}),
                    unmatched=self._map_unmatched_wh_to_public(rc.get("unmatched", "keep")),
                ),
            )

        elif public_type == RULE_TYPE_TYPE_CONVERT:
            return TypeConvertRule(
                **base,
                type=RULE_TYPE_TYPE_CONVERT,
                config=TypeConvertRuleConfig(
                    targetType=rc.get("target_type", "string"),
                    onError=self._map_onerror_wh_to_public(rc.get("on_error", "reject")),
                ),
            )

        elif public_type == RULE_TYPE_FORMAT:
            # 判断是 format_standardize 还是 unit_convert
            fmt = rc.get("format", rc.get("format_type", "trim"))
            if rtype == "unit_convert":
                return FormatRule(
                    **base,
                    type=RULE_TYPE_FORMAT,
                    config=FormatRuleConfig(
                        formatType="unit_convert",
                        options={
                            "multiplier": rc.get("multiplier", 1),
                            "decimal_places": rc.get("decimal_places", 2),
                        },
                        onError=ON_ERROR_REJECT,
                    ),
                )
            else:
                return FormatRule(
                    **base,
                    type=RULE_TYPE_FORMAT,
                    config=FormatRuleConfig(
                        formatType=fmt,
                        options={
                            k: v for k, v in rc.items()
                            if k not in ("format", "format_type")
                        },
                        onError=ON_ERROR_REJECT,
                    ),
                )

        elif public_type == RULE_TYPE_SPLIT_MERGE:
            action = rc.get("action", "merge")
            if action == "split":
                return SplitMergeRule(
                    **base,
                    type=RULE_TYPE_SPLIT_MERGE,
                    config=SplitMergeRuleConfig(
                        action="split",
                        delimiter=rc.get("separator", rc.get("delimiter", "")),
                        nullBehavior="keep_null",
                    ),
                )
            else:
                return SplitMergeRule(
                    **base,
                    type=RULE_TYPE_SPLIT_MERGE,
                    config=SplitMergeRuleConfig(
                        action="merge",
                        delimiter=rc.get("delimiter", ""),
                        nullBehavior="keep_null",
                    ),
                )

        return None

    # -- 转换: 公共 → Warehouse -----------------------------------------------

    def _convert_public_rule_to_warehouse(
        self,
        rule: MappingRuleV1,
        wh_type: str,
    ) -> dict[str, Any]:
        src = rule.sourceFields[0] if rule.sourceFields else ""
        tgt = rule.targetFields[0] if rule.targetFields else ""

        result: dict[str, Any] = {
            "id": int(rule.id) if rule.id.isdigit() else None,
            "rule_type": wh_type,
            "source_field": src,
            "target_field": tgt,
            "enabled": rule.enabled,
            "display_order": rule.displayOrder,
        }

        if isinstance(rule, FieldRule):
            result["rule_config"] = {"mode": rule.config.mode}

        elif isinstance(rule, ValueMapRule):
            result["rule_config"] = {
                "mappings": dict(rule.config.mappings),
                "unmapped": self._map_unmatched_public_to_wh(rule.config.unmatched),
                "default": rule.config.defaultValue,
            }

        elif isinstance(rule, ReferenceLookupRule):
            cfg = rule.config
            lookup_configs = [
                {
                    "id": item.id,
                    "priority": item.priority,
                    "reference_dataset_id": item.referenceDatasetId,
                    "source_field": item.sourceField,
                    "reference_match_field": item.referenceMatchField,
                    "reference_return_field": item.referenceReturnField,
                    "target_field": item.targetField,
                    "conditions": dict(item.conditions),
                }
                for item in cfg.lookupConfigs
            ]
            result["rule_config"] = {
                "lookup_configs": lookup_configs,
                "unmatched": self._map_unmatched_public_to_wh(cfg.unmatched),
                "default": cfg.defaultValue,
            }
            if lookup_configs:
                first = lookup_configs[0]
                homogeneous = all(
                    item["reference_dataset_id"] == first["reference_dataset_id"]
                    and item["reference_return_field"] == first["reference_return_field"]
                    for item in lookup_configs
                )
                if homogeneous:
                    result["rule_config"].update({
                        "lookup_table": first["reference_dataset_id"],
                        "target": first["target_field"],
                        "result_col": first["reference_return_field"],
                        "rules": [
                            {
                                "id": item["id"],
                                "priority": item["priority"],
                                "source_field": item["source_field"],
                                "reference_field": item["reference_match_field"],
                                "conditions": item["conditions"],
                            }
                            for item in lookup_configs
                        ],
                    })
            else:
                result["rule_config"].update({
                    "lookup_table": cfg.referenceDatasetId,
                    "target": list(cfg.outputMap.keys())[0] if cfg.outputMap else "expense_type",
                    "result_col": list(cfg.outputMap.values())[0] if cfg.outputMap else "cost_classification",
                    "rules": [
                        {
                            "id": mr.id,
                            "priority": mr.priority,
                            "source_field": mr.sourceField,
                            "reference_field": mr.referenceField,
                            "conditions": dict(mr.conditions),
                            "on_match": mr.onMatch,
                        }
                        for mr in cfg.matchRules
                    ],
                })

        elif isinstance(rule, IdentityWithOverridesRule):
            result["rule_config"] = {
                "default_behavior": rule.config.defaultBehavior,
                "overrides": dict(rule.config.overrides),
                "unmatched": self._map_unmatched_public_to_wh(rule.config.unmatched),
            }

        elif isinstance(rule, TypeConvertRule):
            result["rule_config"] = {
                "target_type": rule.config.targetType,
                "on_error": self._map_onerror_public_to_wh(rule.config.onError),
            }

        elif isinstance(rule, FormatRule):
            if rule.config.formatType == "unit_convert":
                result["rule_type"] = "unit_convert"
                result["rule_config"] = {
                    "multiplier": rule.config.options.get("multiplier", 1),
                    "decimal_places": rule.config.options.get("decimal_places", 2),
                }
            else:
                result["rule_config"] = {
                    "format": rule.config.formatType,
                    **rule.config.options,
                }

        elif isinstance(rule, SplitMergeRule):
            if rule.config.action == "split":
                result["rule_config"] = {
                    "action": "split",
                    "separator": rule.config.delimiter,
                    "target_fields": rule.targetFields,
                }
            else:
                result["rule_config"] = {
                    "action": "merge",
                    "sources": rule.sourceFields,
                    "delimiter": rule.config.delimiter,
                }

        return result

    # -- 辅助 ----------------------------------------------------------------

    def _map_unmatched_wh_to_public(self, wh_val: str) -> str:
        """Warehouse unmapped → 公共 unmatched"""
        mapping = {
            "keep": UNMATCHED_KEEP,
            "set_default": UNMATCHED_SET_DEFAULT,
            "set_null": UNMATCHED_SET_NULL,
            "flag": UNMATCHED_FLAG,
            "reject": UNMATCHED_REJECT,
            # 旧格式可能使用的值
            "mark": UNMATCHED_FLAG,
            "default": UNMATCHED_SET_DEFAULT,
        }
        return mapping.get(wh_val, UNMATCHED_KEEP)

    def _map_unmatched_public_to_wh(self, pub_val: str) -> str:
        """公共 unmatched → Warehouse unmapped"""
        mapping = {
            UNMATCHED_KEEP: "keep",
            UNMATCHED_SET_DEFAULT: "set_default",
            UNMATCHED_SET_NULL: "set_null",
            UNMATCHED_FLAG: "flag",
            UNMATCHED_REJECT: "reject",
        }
        return mapping.get(pub_val, "keep")

    def _map_onerror_wh_to_public(self, wh_val: str) -> str:
        mapping = {
            "set_null": "set_null",
            "keep": "keep",
            "mark": "flag",
            "reject": "reject",
        }
        return mapping.get(wh_val, "reject")

    def _map_onerror_public_to_wh(self, pub_val: str) -> str:
        mapping = {
            "set_null": "set_null",
            "keep": "keep",
            "flag": "mark",
            "reject": "reject",
        }
        return mapping.get(pub_val, "reject")

    def _get_known_config_keys(self, rtype: str) -> set[str]:
        """返回每种 rule_type 已知的 rule_config 键"""
        known = {
            "rename": set(),
            "type_convert": {"target_type", "on_error", "from_type", "to_type"},
            "value_map": {"mappings", "unmapped", "default"},
            "unit_convert": {"multiplier", "decimal_places", "from_unit", "to_unit", "factor"},
            "split_merge": {"action", "separator", "delimiter", "target_fields", "sources", "null_behavior"},
            "deduplicate": {"by", "keys", "keep", "strategy", "limit"},
            "null_handling": {"strategy", "default", "default_value", "upstream_field", "mark_value"},
            "format_standardize": {"format", "format_type", "from_format", "to_format", "case_type", "max_length", "pad_char", "length", "side", "pattern", "replacement"},
            "reference_lookup": {"lookup_table", "target", "result_col", "rules", "unmatched", "default", "type_col", "value_col", "result_col"},
            "identity_with_overrides": {"default_behavior", "overrides", "unmatched"},
        }
        return known.get(rtype, set())
