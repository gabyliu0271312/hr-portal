"""Warehouse Asset Sink legacy mapping adapter.

公共 MappingDocumentV1 只承载字段转换。Sink validation、资产、写入模式、
主键、字段白名单、批次和期间合同始终保留在 legacy snapshot 中。
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.mapping.adapter_protocol import AdapterStorageMode, MappingAdapterReadResult
from app.mapping.dto import (
    FieldRule,
    FieldRuleConfig,
    FormatRule,
    FormatRuleConfig,
    MappingCompatibilityV1,
    MappingDocumentV1,
    MappingRuleSetV1,
    MappingRuleV1,
    TypeConvertRule,
    TypeConvertRuleConfig,
    MAPPING_SCHEMA_VERSION,
    ON_ERROR_REJECT,
)
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.policy import MappingCallerPolicyV1, build_policy


_LEGACY_SOURCE_FORMAT = "warehouse_asset_sink_legacy"
_SNAPSHOT_KEY = "__legacy_sink_snapshot__"
_MAPPING_SNAPSHOT_KEY = "__legacy_mapping_snapshot__"

_SINK_CONTRACT_KEYS = (
    "target_asset",
    "write_mode",
    "primary_key",
    "field_whitelist",
    "batch_key",
    "period_field",
)
_KNOWN_TOP_LEVEL_KEYS = {"mapping", "validations", *_SINK_CONTRACT_KEYS}
_KNOWN_MAPPING_KEYS = {
    "source",
    "target",
    "transform",
    "required",
    "minimum",
    "maximum",
}
_STRONG_MAPPING_KEYS = {"required", "minimum", "maximum"}
_SUPPORTED_TRANSFORMS = {
    "identity",
    "string",
    "trim",
    "yyyy_mm_to_yyyymm",
    "decimal",
    "decimal_divide_100",
}


class WarehouseAssetSinkLegacyAdapter:
    """在 Warehouse Asset Sink legacy config 与公共 DTO 间无损转换。"""

    @property
    def caller(self) -> str:
        return "warehouse_sink"

    def read(
        self,
        raw_config: dict[str, Any],
        *,
        policy: MappingCallerPolicyV1,
    ) -> MappingAdapterReadResult:
        self._check_policy_caller(policy)
        if not policy.legacy.allowLegacyRead:
            raise MappingException(
                MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
                "当前 policy 禁止读取 Warehouse Asset Sink legacy 配置",
                http_status=422,
            )
        if not isinstance(raw_config, dict):
            raise ValueError("Warehouse Asset Sink legacy config must be an object")

        raw_mapping = raw_config.get("mapping")
        if not isinstance(raw_mapping, list):
            raise ValueError("Warehouse Asset Sink legacy mapping must be a list")

        snapshot = deepcopy(raw_config)
        unknown_fields = self._collect_unknown_fields(snapshot)
        unknown_fields[_SNAPSHOT_KEY] = deepcopy(snapshot)
        # 与其他 legacy adapter 的通用快照键保持兼容；两者都保存完整 Sink 配置。
        unknown_fields[_MAPPING_SNAPSHOT_KEY] = deepcopy(snapshot)

        rules: list[MappingRuleV1] = []
        lossy_fields: list[str] = []
        for index, raw_rule in enumerate(raw_mapping):
            path = f"mapping[{index}]"
            if not isinstance(raw_rule, dict):
                unknown_fields[path] = deepcopy(raw_rule)
                lossy_fields.append(path)
                continue

            source = raw_rule.get("source")
            target = raw_rule.get("target")
            transform_value = raw_rule.get("transform", "identity")
            transform = "identity" if transform_value in (None, "") else transform_value
            if (
                not isinstance(source, str)
                or not source
                or not isinstance(target, str)
                or not target
                or not isinstance(transform, str)
                or transform not in _SUPPORTED_TRANSFORMS
            ):
                unknown_fields[f"{path}.legacy"] = deepcopy(raw_rule)
                lossy_fields.append(path)
                continue

            rules.append(
                self._legacy_rule_to_public(
                    index=index,
                    source=source,
                    target=target,
                    transform=transform,
                )
            )

        target_asset = raw_config.get("target_asset")
        target_asset_value = target_asset if isinstance(target_asset, str) else None
        document = MappingDocumentV1(
            mappingSchemaVersion=MAPPING_SCHEMA_VERSION,
            ruleSet=MappingRuleSetV1(
                code=target_asset_value or "warehouse_asset_sink",
                name=target_asset_value or "Warehouse Asset Sink",
                sourceAsset=policy.source.assetId,
                targetAsset=target_asset_value,
                sourceSchemaHash=policy.source.schemaHash,
                targetSchemaHash=policy.target.schemaHash,
                rules=rules,
            ),
        )
        writable = not lossy_fields
        compatibility = MappingCompatibilityV1(
            sourceFormat=_LEGACY_SOURCE_FORMAT,
            readable=True,
            writable=writable,
            requiresMigration=not writable,
            lossyFields=lossy_fields,
            unknownFields=unknown_fields,
        )
        return MappingAdapterReadResult(
            document=document,
            compatibility=compatibility,
            storageMode="legacy_v1",
            legacySnapshot=deepcopy(snapshot),
        )

    def write(
        self,
        document: MappingDocumentV1,
        *,
        policy: MappingCallerPolicyV1,
        compatibility: MappingCompatibilityV1,
        storage_mode: AdapterStorageMode = "component_v1",
    ) -> dict[str, Any]:
        self._check_policy_caller(policy)
        if storage_mode not in {"legacy_v1", "component_v1"}:
            raise ValueError(f"Unsupported Warehouse Asset Sink storage mode: {storage_mode}")
        if not policy.legacy.allowLegacyWrite:
            self._raise_lossy("当前 policy 禁止写入 Warehouse Asset Sink legacy 配置")
        if not compatibility.writable:
            self._raise_lossy(
                f"无法无损回写: 存在有损字段 {compatibility.lossyFields}",
                compatibility=compatibility,
            )

        snapshot = compatibility.unknownFields.get(_SNAPSHOT_KEY)
        if not isinstance(snapshot, dict):
            snapshot = compatibility.unknownFields.get(_MAPPING_SNAPSHOT_KEY)
        if not isinstance(snapshot, dict):
            self._raise_lossy("缺少完整 Warehouse Asset Sink legacy snapshot，无法保护强合同")

        legacy = deepcopy(snapshot)
        original_mapping = legacy.get("mapping")
        if not isinstance(original_mapping, list):
            self._raise_lossy("legacy snapshot.mapping 不是列表，无法无损回写")

        original_target = legacy.get("target_asset")
        if document.ruleSet.targetAsset != (
            original_target if isinstance(original_target, str) else None
        ):
            self._raise_lossy("公共组件不得修改 Warehouse Asset Sink target_asset")

        original_by_id = {
            str(index): raw_rule
            for index, raw_rule in enumerate(original_mapping)
            if isinstance(raw_rule, dict)
        }
        output_mapping: list[dict[str, Any]] = []
        retained_ids: set[str] = set()
        for rule in document.ruleSet.rules:
            source, target, transform = self._public_rule_to_legacy(rule)
            raw_rule = original_by_id.get(rule.id)
            output_rule = deepcopy(raw_rule) if isinstance(raw_rule, dict) else {}
            output_rule["source"] = source
            output_rule["target"] = target

            original_transform = output_rule.get("transform", "identity")
            normalized_original = (
                "identity" if original_transform in (None, "") else original_transform
            )
            if not isinstance(raw_rule, dict) or normalized_original != transform:
                if transform != "identity" or "transform" in output_rule:
                    output_rule["transform"] = transform

            output_mapping.append(output_rule)
            if rule.id in original_by_id:
                retained_ids.add(rule.id)

        for rule_id, raw_rule in original_by_id.items():
            if rule_id in retained_ids:
                continue
            protected_keys = (
                set(raw_rule) - {"source", "target", "transform"}
            ) | (set(raw_rule) & _STRONG_MAPPING_KEYS)
            if protected_keys:
                self._raise_lossy(
                    f"删除 mapping[{rule_id}] 会丢失 Sink validation 或未知字段",
                    details={"fields": sorted(protected_keys)},
                )

        legacy["mapping"] = output_mapping
        # target_asset/write_mode/primary_key/field_whitelist/batch_key/period_field、
        # validations 以及全部未知顶层字段均来自 snapshot，绝不由公共 DTO 覆盖。
        return legacy

    def validate_legacy(self, raw_config: dict[str, Any]) -> MappingCompatibilityV1:
        return self.read(
            raw_config,
            policy=build_policy(caller=self.caller),
        ).compatibility

    def _legacy_rule_to_public(
        self,
        *,
        index: int,
        source: str,
        target: str,
        transform: str,
    ) -> MappingRuleV1:
        base = {
            "id": str(index),
            "enabled": True,
            "displayOrder": index,
            "sourceFields": [source],
            "targetFields": [target],
        }
        if transform == "identity":
            return FieldRule(**base, config=FieldRuleConfig(mode="rename"))
        if transform in {"string", "decimal"}:
            return TypeConvertRule(
                **base,
                config=TypeConvertRuleConfig(
                    targetType="string" if transform == "string" else "number",
                    onError=ON_ERROR_REJECT,
                ),
            )
        if transform == "decimal_divide_100":
            return FormatRule(
                **base,
                config=FormatRuleConfig(
                    formatType="unit_convert",
                    options={"multiplier": 0.01},
                    onError=ON_ERROR_REJECT,
                ),
            )
        return FormatRule(
            **base,
            config=FormatRuleConfig(
                formatType=transform,
                options={},
                onError=ON_ERROR_REJECT,
            ),
        )

    def _public_rule_to_legacy(
        self,
        rule: MappingRuleV1,
    ) -> tuple[str, str, str]:
        if not rule.enabled:
            self._raise_lossy(f"legacy Sink 无法表达 disabled rule: {rule.id}")
        if len(rule.sourceFields) != 1 or len(rule.targetFields) != 1:
            self._raise_lossy(f"legacy Sink 规则 {rule.id} 只支持单一 source/target")
        source = rule.sourceFields[0]
        target = rule.targetFields[0]
        if not source or not target:
            self._raise_lossy(f"legacy Sink 规则 {rule.id} 的 source/target 不能为空")

        if isinstance(rule, FieldRule) and rule.config.mode == "rename":
            return source, target, "identity"
        if isinstance(rule, TypeConvertRule) and rule.config.onError == ON_ERROR_REJECT:
            if rule.config.targetType == "string":
                return source, target, "string"
            if rule.config.targetType == "number":
                return source, target, "decimal"
        if isinstance(rule, FormatRule) and rule.config.onError == ON_ERROR_REJECT:
            if rule.config.formatType in {"trim", "yyyy_mm_to_yyyymm"} and not rule.config.options:
                return source, target, rule.config.formatType
            if (
                rule.config.formatType == "unit_convert"
                and rule.config.options == {"multiplier": 0.01}
            ):
                return source, target, "decimal_divide_100"

        self._raise_lossy(f"公共规则 {rule.id} 无法由 Warehouse Asset Sink legacy transform 表达")
        raise AssertionError("unreachable")

    def _collect_unknown_fields(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        unknown_fields: dict[str, Any] = {}
        for key in _SINK_CONTRACT_KEYS:
            if key in snapshot:
                unknown_fields[key] = deepcopy(snapshot[key])
        if "validations" in snapshot:
            unknown_fields["validations"] = deepcopy(snapshot["validations"])

        for key, value in snapshot.items():
            if key not in _KNOWN_TOP_LEVEL_KEYS:
                unknown_fields[key] = deepcopy(value)

        raw_mapping = snapshot.get("mapping")
        if isinstance(raw_mapping, list):
            for index, raw_rule in enumerate(raw_mapping):
                if not isinstance(raw_rule, dict):
                    continue
                for key, value in raw_rule.items():
                    if key not in {"source", "target", "transform"}:
                        unknown_fields[f"mapping[{index}].{key}"] = deepcopy(value)
        return unknown_fields

    def _check_policy_caller(self, policy: MappingCallerPolicyV1) -> None:
        if policy.caller != self.caller:
            raise MappingException(
                MappingErrorCode.MAPPING_CALLER_UNSUPPORTED,
                f"Warehouse Asset Sink adapter 不支持 caller={policy.caller}",
                http_status=422,
            )

    def _raise_lossy(
        self,
        message: str,
        *,
        compatibility: MappingCompatibilityV1 | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        error_details = dict(details or {})
        if compatibility is not None:
            error_details.update(
                {
                    "lossyFields": compatibility.lossyFields,
                    "unknownFields": compatibility.unknownFields,
                }
            )
        raise MappingException(
            MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
            message,
            http_status=422,
            details=error_details,
        )


WarehouseAssetSinkLegacyV1Adapter = WarehouseAssetSinkLegacyAdapter
WarehouseAssetSinkAdapter = WarehouseAssetSinkLegacyAdapter
