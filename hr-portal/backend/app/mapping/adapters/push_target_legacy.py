"""PushTarget legacy ``field_mappings`` adapter。

旧 PushTarget 只重命名已配置字段，未映射字段保持透传，因此公共 ``field``
规则使用 ``rename``；若使用 ``copy``，目标名不同时会错误保留已映射源字段。
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.mapping.adapter_protocol import AdapterStorageMode, MappingAdapterReadResult
from app.mapping.dto import (
    FieldRule,
    FieldRuleConfig,
    MappingCompatibilityV1,
    MappingDocumentV1,
    MappingRuleSetV1,
    MAPPING_SCHEMA_VERSION,
)
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.policy import MappingCallerPolicyV1, build_policy


_LEGACY_SOURCE_FORMAT = "push_target_field_mappings"
_SNAPSHOT_KEY = "__legacy_push_target_snapshot__"
_KNOWN_MAPPING_KEYS = {"source", "target"}


class PushTargetLegacyAdapter:
    """在 PushTarget legacy 配置与公共 MappingDocumentV1 间无损转换。"""

    @property
    def caller(self) -> str:
        return "push_target"

    def read(
        self,
        raw_config: dict[str, Any],
        *,
        policy: MappingCallerPolicyV1,
    ) -> MappingAdapterReadResult:
        self._check_policy_caller(policy)
        if not policy.legacy.allowLegacyRead:
            self._raise_lossy("当前 policy 禁止读取 PushTarget legacy field_mappings")
        if not isinstance(raw_config, dict):
            raise ValueError("PushTarget legacy config must be an object")

        raw_mappings = raw_config.get("field_mappings")
        if not isinstance(raw_mappings, list):
            raise ValueError("PushTarget legacy field_mappings must be a list")

        snapshot = deepcopy(raw_config)
        unknown_fields = self._collect_unknown_fields(snapshot)
        unknown_fields[_SNAPSHOT_KEY] = deepcopy(snapshot)
        rules: list[FieldRule] = []
        lossy_fields: list[str] = []

        for index, raw_mapping in enumerate(raw_mappings):
            path = f"field_mappings[{index}]"
            if not isinstance(raw_mapping, dict):
                unknown_fields[path] = deepcopy(raw_mapping)
                lossy_fields.append(path)
                continue

            source = raw_mapping.get("source")
            target = raw_mapping.get("target")
            if (
                not isinstance(source, str)
                or not source
                or not isinstance(target, str)
                or not target
            ):
                unknown_fields[f"{path}.legacy"] = deepcopy(raw_mapping)
                lossy_fields.append(path)
                continue

            rules.append(
                FieldRule(
                    id=str(index),
                    enabled=True,
                    displayOrder=index,
                    sourceFields=[source],
                    targetFields=[target],
                    config=FieldRuleConfig(mode="rename"),
                )
            )

        writable = not lossy_fields
        document = MappingDocumentV1(
            mappingSchemaVersion=MAPPING_SCHEMA_VERSION,
            ruleSet=MappingRuleSetV1(
                code=str(raw_config.get("id") or "push_target"),
                name=str(raw_config.get("name") or "PushTarget"),
                sourceAsset=policy.source.assetId,
                targetAsset=policy.target.assetId,
                sourceSchemaHash=policy.source.schemaHash,
                targetSchemaHash=policy.target.schemaHash,
                rules=rules,
            ),
        )
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
            raise ValueError(f"Unsupported PushTarget storage mode: {storage_mode}")
        if not policy.legacy.allowLegacyWrite:
            self._raise_lossy("当前 policy 禁止写入 PushTarget legacy field_mappings")
        if not compatibility.writable:
            self._raise_lossy(
                f"无法无损回写: 存在有损字段 {compatibility.lossyFields}",
                compatibility=compatibility,
            )

        snapshot = compatibility.unknownFields.get(_SNAPSHOT_KEY)
        if not isinstance(snapshot, dict):
            self._raise_lossy("缺少完整 PushTarget legacy snapshot，无法保护未知字段")
        original_mappings = snapshot.get("field_mappings")
        if not isinstance(original_mappings, list):
            self._raise_lossy("legacy snapshot.field_mappings 不是列表，无法无损回写")

        original_by_id = {
            str(index): raw_mapping
            for index, raw_mapping in enumerate(original_mappings)
            if isinstance(raw_mapping, dict)
        }
        retained_ids: set[str] = set()
        output_mappings: list[dict[str, Any]] = []
        for rule in sorted(document.ruleSet.rules, key=lambda item: item.displayOrder):
            source, target = self._public_rule_to_legacy(rule)
            original = original_by_id.get(rule.id)
            output = deepcopy(original) if isinstance(original, dict) else {}
            output["source"] = source
            output["target"] = target
            output_mappings.append(output)
            if rule.id in original_by_id:
                retained_ids.add(rule.id)

        for rule_id, original in original_by_id.items():
            if rule_id in retained_ids:
                continue
            unknown_keys = set(original) - _KNOWN_MAPPING_KEYS
            if unknown_keys:
                self._raise_lossy(
                    f"删除 field_mappings[{rule_id}] 会丢失未知字段",
                    details={"fields": sorted(unknown_keys)},
                )

        output_config = deepcopy(snapshot)
        output_config["field_mappings"] = output_mappings
        return output_config

    def validate_legacy(self, raw_config: dict[str, Any]) -> MappingCompatibilityV1:
        return self.read(
            raw_config,
            policy=build_policy(caller=self.caller),
        ).compatibility

    def _public_rule_to_legacy(self, rule: Any) -> tuple[str, str]:
        if not isinstance(rule, FieldRule):
            self._raise_lossy(f"公共规则 {rule.id} 不是 PushTarget legacy 可表达的 field 规则")
        if not rule.enabled:
            self._raise_lossy(f"PushTarget legacy 无法表达 disabled rule: {rule.id}")
        if rule.config.mode != "rename":
            self._raise_lossy(f"PushTarget legacy 无法表达 field {rule.config.mode} 模式: {rule.id}")
        if len(rule.sourceFields) != 1 or len(rule.targetFields) != 1:
            self._raise_lossy(f"PushTarget legacy 规则 {rule.id} 只支持单一 source/target")
        source = rule.sourceFields[0]
        target = rule.targetFields[0]
        if not source or not target:
            self._raise_lossy(f"PushTarget legacy 规则 {rule.id} 的 source/target 不能为空")
        return source, target

    def _collect_unknown_fields(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        unknown_fields = {
            key: deepcopy(value)
            for key, value in snapshot.items()
            if key != "field_mappings"
        }
        raw_mappings = snapshot.get("field_mappings")
        if isinstance(raw_mappings, list):
            for index, raw_mapping in enumerate(raw_mappings):
                if not isinstance(raw_mapping, dict):
                    continue
                for key, value in raw_mapping.items():
                    if key not in _KNOWN_MAPPING_KEYS:
                        unknown_fields[f"field_mappings[{index}].{key}"] = deepcopy(value)
        return unknown_fields

    def _check_policy_caller(self, policy: MappingCallerPolicyV1) -> None:
        if policy.caller != self.caller:
            raise MappingException(
                MappingErrorCode.MAPPING_CALLER_UNSUPPORTED,
                f"PushTarget adapter 不支持 caller={policy.caller}",
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


PushTargetLegacyV1Adapter = PushTargetLegacyAdapter
PushTargetMappingAdapter = PushTargetLegacyAdapter
