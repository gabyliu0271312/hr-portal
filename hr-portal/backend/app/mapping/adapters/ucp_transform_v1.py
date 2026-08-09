"""UCP Transform Legacy v1 adapter.

Legacy ``config.mapping.version=1`` 只表达一对一标量字段映射；公共规则
文档保存在 ``mapping_component``，两个存储域不互相覆盖。
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.mapping.adapter_protocol import (
    AdapterStorageMode,
    MappingAdapterReadResult,
)
from app.mapping.dto import (
    FieldRule,
    FieldRuleConfig,
    MappingCompatibilityV1,
    MappingDocumentV1,
    MappingRuleSetV1,
    MAPPING_SCHEMA_VERSION,
    RULE_TYPE_FIELD,
)
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.policy import MappingCallerPolicyV1


_LEGACY_SOURCE_FORMAT = "ucp_transform_legacy_v1"
_COMPONENT_SOURCE_FORMAT = "ucp_transform_component_v1"
_SNAPSHOT_KEY = "__legacy_mapping_snapshot__"
_MODE_KEY = "__legacy_mapping_mode__"

# 这些是 Legacy v1 的正式字段；其余字段必须被记录，不能静默丢弃。
_LEGACY_MAPPING_KEYS = {
    "version",
    "mode",
    "source_operation_id",
    "source_schema_hash",
    "target_operation_id",
    "target_schema_hash",
    "target_field_catalog",
    "rules",
}
_LEGACY_RULE_KEYS = {"source_field_id", "target_field_id", "source_kind"}


class UcpTransformV1Adapter:
    """在 UCP Transform Legacy v1 与公共 MappingDocumentV1 间转换。"""

    @property
    def caller(self) -> str:
        return "ucp_transform"

    def read(
        self,
        raw_config: dict[str, Any],
        *,
        policy: MappingCallerPolicyV1,
    ) -> MappingAdapterReadResult:
        self._check_policy_caller(policy)

        # Component v1 是唯一运行时来源。即使旧 mapping 同时存在，也只读取
        # component，旧 mapping 只作为只读 snapshot 保存。
        component = raw_config.get("mapping_component")
        if isinstance(component, dict):
            document = MappingDocumentV1.from_dict(component)
            snapshot = self._legacy_snapshot(raw_config)
            unknown_fields = self._collect_legacy_unknown_fields(snapshot)
            compatibility = MappingCompatibilityV1(
                sourceFormat=_COMPONENT_SOURCE_FORMAT,
                readable=True,
                writable=True,
                requiresMigration=False,
                unknownFields=unknown_fields,
            )
            if snapshot is not None:
                compatibility.unknownFields[_SNAPSHOT_KEY] = deepcopy(snapshot)
            return MappingAdapterReadResult(
                document=document,
                compatibility=compatibility,
                storageMode="component_v1",
                legacySnapshot=snapshot,
            )

        mapping = raw_config.get("mapping")
        if not isinstance(mapping, dict) or mapping.get("version") != 1:
            raise ValueError("UCP Transform requires config.mapping.version=1 or mapping_component")
        if not policy.legacy.allowLegacyRead:
            raise MappingException(
                MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
                "当前 policy 禁止读取 UCP Transform Legacy v1",
                http_status=422,
            )

        mode = mapping.get("mode", "strict")
        if mode not in {"strict", "mapped_plus_same_name"}:
            raise ValueError("UCP Transform Legacy v1 mapping mode is unsupported")

        unknown_fields: dict[str, Any] = {}
        for key, value in mapping.items():
            if key not in _LEGACY_MAPPING_KEYS:
                unknown_fields[f"mapping.{key}"] = deepcopy(value)

        rules: list[FieldRule] = []
        lossy_fields: list[str] = []
        raw_rules = mapping.get("rules")
        if not isinstance(raw_rules, list):
            raise ValueError("UCP Transform Legacy v1 mapping.rules must be a list")
        for index, raw_rule in enumerate(raw_rules):
            if not isinstance(raw_rule, dict):
                unknown_fields[f"rules[{index}]"] = deepcopy(raw_rule)
                lossy_fields.append(f"rules[{index}]")
                continue
            for key, value in raw_rule.items():
                if key not in _LEGACY_RULE_KEYS:
                    unknown_fields[f"rules[{index}].{key}"] = deepcopy(value)

            source_kind = raw_rule.get("source_kind", "upstream_field")
            source = raw_rule.get("source_field_id")
            target = raw_rule.get("target_field_id")
            if source_kind != "upstream_field" or not isinstance(source, str) or not isinstance(target, str):
                unknown_fields[f"rules[{index}].legacy"] = deepcopy(raw_rule)
                lossy_fields.append(f"rules[{index}]")
                continue
            rules.append(
                FieldRule(
                    id=str(index),
                    type=RULE_TYPE_FIELD,
                    enabled=True,
                    displayOrder=index,
                    sourceFields=[source],
                    targetFields=[target],
                    config=FieldRuleConfig(mode="rename"),
                )
            )

        # Snapshot 既用于首次打开回显，也用于 write 时保留旧版的所有字段。
        unknown_fields[_SNAPSHOT_KEY] = deepcopy(mapping)
        unknown_fields[_MODE_KEY] = mode
        document = MappingDocumentV1(
            mappingSchemaVersion=MAPPING_SCHEMA_VERSION,
            ruleSet=MappingRuleSetV1(
                code=str(mapping.get("source_operation_id") or "ucp_transform"),
                name=str(mapping.get("target_operation_id") or "UCP Transform"),
                sourceAsset=_as_optional_str(mapping.get("source_operation_id")),
                targetAsset=_as_optional_str(mapping.get("target_operation_id")),
                sourceSchemaHash=str(mapping.get("source_schema_hash") or ""),
                targetSchemaHash=str(mapping.get("target_schema_hash") or ""),
                rules=rules,
            ),
        )
        # 不支持的 source_kind/形状不能无损地表达为 field rule。
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
            legacySnapshot=deepcopy(mapping),
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
        if storage_mode == "legacy_v1":
            if not policy.legacy.allowLegacyWrite:
                raise MappingException(
                    MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
                    "当前 policy 禁止写入 UCP Transform Legacy v1",
                    http_status=422,
                )
            self._check_legacy_downgrade(document)
            if not compatibility.writable:
                raise MappingException(
                    MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
                    f"无法无损回写: 存在有损字段 {compatibility.lossyFields}",
                    http_status=422,
                    details={"lossyFields": compatibility.lossyFields, "unknownFields": compatibility.unknownFields},
                )
            return {"mapping": self._to_legacy_mapping(document, compatibility)}

        if storage_mode != "component_v1":
            raise ValueError(f"Unsupported UCP Transform storage mode: {storage_mode}")
        result: dict[str, Any] = {"mapping_component": document.to_dict()}
        snapshot = compatibility.unknownFields.get(_SNAPSHOT_KEY)
        if isinstance(snapshot, dict):
            result["mapping"] = deepcopy(snapshot)
            result["legacy_mapping_snapshot"] = deepcopy(snapshot)
        return result

    def validate_legacy(self, raw_config: dict[str, Any]) -> MappingCompatibilityV1:
        from app.mapping.policy import build_policy

        return self.read(raw_config, policy=build_policy(caller=self.caller)).compatibility

    def _check_policy_caller(self, policy: MappingCallerPolicyV1) -> None:
        if policy.caller != self.caller:
            raise MappingException(
                MappingErrorCode.MAPPING_CALLER_UNSUPPORTED,
                f"UCP Transform adapter 不支持 caller={policy.caller}",
                http_status=422,
            )

    def _check_legacy_downgrade(self, document: MappingDocumentV1) -> None:
        unsupported = [rule.type for rule in document.ruleSet.rules if rule.type != RULE_TYPE_FIELD]
        if unsupported:
            raise MappingException(
                MappingErrorCode.MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED,
                "当前公共规则集包含 Legacy v1 无法表达的规则类型",
                http_status=422,
                details={"ruleTypes": unsupported},
            )

    def _to_legacy_mapping(
        self,
        document: MappingDocumentV1,
        compatibility: MappingCompatibilityV1,
    ) -> dict[str, Any]:
        snapshot = compatibility.unknownFields.get(_SNAPSHOT_KEY)
        legacy = deepcopy(snapshot) if isinstance(snapshot, dict) else {}
        legacy["version"] = 1
        legacy["mode"] = compatibility.unknownFields.get(_MODE_KEY, legacy.get("mode", "strict"))
        if "source_operation_id" in legacy or not isinstance(snapshot, dict):
            legacy["source_operation_id"] = document.ruleSet.sourceAsset
        if "target_operation_id" in legacy or not isinstance(snapshot, dict):
            legacy["target_operation_id"] = document.ruleSet.targetAsset
        if "source_schema_hash" in legacy or not isinstance(snapshot, dict):
            legacy["source_schema_hash"] = document.ruleSet.sourceSchemaHash
        if "target_schema_hash" in legacy or not isinstance(snapshot, dict):
            legacy["target_schema_hash"] = document.ruleSet.targetSchemaHash

        snapshot_rules = legacy.get("rules") if isinstance(legacy.get("rules"), list) else []
        rules_out: list[dict[str, Any]] = []
        for index, rule in enumerate(document.ruleSet.rules):
            raw_rule = snapshot_rules[index] if index < len(snapshot_rules) else None
            legacy_rule = deepcopy(raw_rule) if isinstance(raw_rule, dict) else {}
            legacy_rule.update(
                {
                    "source_field_id": rule.sourceFields[0] if rule.sourceFields else "",
                    "target_field_id": rule.targetFields[0] if rule.targetFields else "",
                    "source_kind": "upstream_field",
                }
            )
            rules_out.append(legacy_rule)
        legacy["rules"] = rules_out
        return legacy

    def _legacy_snapshot(self, raw_config: dict[str, Any]) -> dict[str, Any] | None:
        snapshot = raw_config.get("legacy_mapping_snapshot")
        if isinstance(snapshot, dict):
            return deepcopy(snapshot)
        mapping = raw_config.get("mapping")
        return deepcopy(mapping) if isinstance(mapping, dict) else None

    def _collect_legacy_unknown_fields(
        self,
        mapping: dict[str, Any] | None,
    ) -> dict[str, Any]:
        if mapping is None:
            return {}
        unknown_fields = {
            f"mapping.{key}": deepcopy(value)
            for key, value in mapping.items()
            if key not in _LEGACY_MAPPING_KEYS
        }
        raw_rules = mapping.get("rules")
        if isinstance(raw_rules, list):
            for index, raw_rule in enumerate(raw_rules):
                if not isinstance(raw_rule, dict):
                    unknown_fields[f"rules[{index}]"] = deepcopy(raw_rule)
                    continue
                for key, value in raw_rule.items():
                    if key not in _LEGACY_RULE_KEYS:
                        unknown_fields[f"rules[{index}].{key}"] = deepcopy(value)
        return unknown_fields


UCPTransformV1Adapter = UcpTransformV1Adapter
UcpTransformLegacyV1Adapter = UcpTransformV1Adapter


def _as_optional_str(value: Any) -> str | None:
    return value if isinstance(value, str) else None
