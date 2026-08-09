"""Workflow 字段转换节点与公共 MappingDocumentV1 的纯配置 adapter。"""

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


_LEGACY_SOURCE_FORMAT = "workflow_field_mapping_legacy"
_COMPONENT_SOURCE_FORMAT = "workflow_mapping_component_v1"
_SNAPSHOT_KEY = "__legacy_workflow_snapshot__"
_LOCATION_KEY = "__legacy_workflow_mapping_location__"
_SHAPE_KEY = "__legacy_workflow_mapping_shape__"
_COMPONENT_KEY = "mapping_component"
_STORAGE_MODE_KEY = "storageMode"
_PERSISTED_SNAPSHOT_KEY = "legacy_mapping_snapshot"
_LEGACY_NODE_TYPES = {"FIELD_TRANSFORM", "FIELD_MAPPING", "TRANSFORM"}
_COMPONENT_NODE_TYPES = {*_LEGACY_NODE_TYPES, "DATA_MAPPING"}
_KNOWN_NODE_KEYS = {"id", "type", "x", "y", "label", "config"}
_KNOWN_VERSIONED_MAPPING_KEYS = {
    "version",
    "mode",
    "rules",
    "source_operation_id",
    "source_schema_hash",
    "target_operation_id",
    "target_schema_hash",
    "target_field_catalog",
}
_VERSIONED_RULE_KEYS = {"source_field_id", "target_field_id", "source_kind"}
_BEHAVIORAL_RULE_KEYS = {
    "expression",
    "formula",
    "script",
    "transform",
    "converter",
    "default",
    "default_value",
    "condition",
}
_PAIR_ALIASES = (
    ("source", "target"),
    ("source_field", "target_field"),
    ("sourceField", "targetField"),
    ("from", "to"),
)


class WorkflowMappingAdapter:
    """只转换 Workflow 节点配置，不执行流程或任何业务副作用。"""

    @property
    def caller(self) -> str:
        return "workflow"

    def read(
        self,
        raw_config: dict[str, Any],
        *,
        policy: MappingCallerPolicyV1,
    ) -> MappingAdapterReadResult:
        self._check_policy_caller(policy)
        if not isinstance(raw_config, dict):
            raise ValueError("Workflow mapping node must be an object")

        node_type = raw_config.get("type")
        if node_type not in _COMPONENT_NODE_TYPES:
            raise ValueError(f"Unsupported Workflow mapping node type: {node_type!r}")
        config = raw_config.get("config")
        if not isinstance(config, dict):
            raise ValueError("Workflow mapping node.config must be an object")

        component = config.get(_COMPONENT_KEY)
        if not isinstance(component, dict):
            top_level_component = raw_config.get(_COMPONENT_KEY)
            component = top_level_component if isinstance(top_level_component, dict) else None
        if component is not None:
            document = MappingDocumentV1.from_dict(component)
            snapshot = self._persisted_snapshot(raw_config)
            unknown_fields = self._collect_unknown_fields(snapshot or raw_config)
            if snapshot is not None:
                unknown_fields[_SNAPSHOT_KEY] = deepcopy(snapshot)
            return MappingAdapterReadResult(
                document=document,
                compatibility=MappingCompatibilityV1(
                    sourceFormat=_COMPONENT_SOURCE_FORMAT,
                    readable=True,
                    writable=True,
                    requiresMigration=False,
                    unknownFields=unknown_fields,
                ),
                storageMode="component_v1",
                legacySnapshot=deepcopy(snapshot),
            )

        if node_type not in _LEGACY_NODE_TYPES:
            raise ValueError(f"Workflow node type {node_type!r} has no mapping_component")
        if not policy.legacy.allowLegacyRead:
            self._raise_lossy("当前 policy 禁止读取 Workflow legacy 字段转换节点")

        location, raw_mapping = self._find_legacy_mapping(config)
        rules, shape, mapping_unknown, lossy_fields = self._legacy_rules(raw_mapping, location)
        snapshot = deepcopy(raw_config)
        unknown_fields = self._collect_unknown_fields(snapshot)
        unknown_fields.update(mapping_unknown)
        unknown_fields[_SNAPSHOT_KEY] = deepcopy(snapshot)
        unknown_fields[_LOCATION_KEY] = location
        unknown_fields[_SHAPE_KEY] = shape

        document = MappingDocumentV1(
            mappingSchemaVersion=MAPPING_SCHEMA_VERSION,
            ruleSet=MappingRuleSetV1(
                code=str(raw_config.get("id") or "workflow_mapping"),
                name=str(raw_config.get("label") or "Workflow Data Mapping"),
                sourceAsset=policy.source.assetId,
                targetAsset=policy.target.assetId,
                sourceSchemaHash=policy.source.schemaHash,
                targetSchemaHash=policy.target.schemaHash,
                rules=rules,
            ),
        )
        writable = not lossy_fields
        return MappingAdapterReadResult(
            document=document,
            compatibility=MappingCompatibilityV1(
                sourceFormat=_LEGACY_SOURCE_FORMAT,
                readable=True,
                writable=writable,
                requiresMigration=True,
                lossyFields=lossy_fields,
                unknownFields=unknown_fields,
            ),
            storageMode="component_v1",
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
        if storage_mode != "component_v1":
            self._raise_lossy("Workflow mapping adapter 只允许写入 component_v1")
        if not policy.legacy.allowMigration:
            self._raise_lossy("当前 policy 禁止升级 Workflow legacy 字段转换节点")
        if not compatibility.writable:
            self._raise_lossy(
                f"无法无损升级: 存在有损字段 {compatibility.lossyFields}",
                compatibility=compatibility,
            )

        snapshot = compatibility.unknownFields.get(_SNAPSHOT_KEY)
        if isinstance(snapshot, dict):
            output = deepcopy(snapshot)
        elif compatibility.sourceFormat == _COMPONENT_SOURCE_FORMAT:
            output = {"type": "DATA_MAPPING", "config": {}}
        else:
            self._raise_lossy("缺少完整 Workflow legacy snapshot，无法保护未知字段")
        config = output.get("config")
        if not isinstance(config, dict):
            self._raise_lossy("Workflow mapping node.config 不是对象")

        config[_COMPONENT_KEY] = document.to_dict()
        config[_STORAGE_MODE_KEY] = "component_v1"
        if isinstance(snapshot, dict):
            config[_PERSISTED_SNAPSHOT_KEY] = deepcopy(snapshot)
        output["config"] = config
        return output

    def upgrade(
        self,
        raw_config: dict[str, Any],
        *,
        policy: MappingCallerPolicyV1,
    ) -> dict[str, Any]:
        """生成 component_v1 节点，并在改写前保存完整 legacy snapshot。"""

        result = self.read(raw_config, policy=policy)
        return self.write(
            result.document,
            policy=policy,
            compatibility=result.compatibility,
            storage_mode="component_v1",
        )

    def rollback(
        self,
        raw_config: dict[str, Any],
        *,
        policy: MappingCallerPolicyV1,
    ) -> dict[str, Any]:
        """从升级前的只读 snapshot 恢复完整 Workflow 节点。"""

        self._check_policy_caller(policy)
        snapshot = self._persisted_snapshot(raw_config)
        if not isinstance(snapshot, dict):
            self._raise_lossy("缺少 Workflow 升级前 snapshot，无法回滚")
        return deepcopy(snapshot)

    def validate_legacy(self, raw_config: dict[str, Any]) -> MappingCompatibilityV1:
        return self.read(
            raw_config,
            policy=build_policy(caller=self.caller),
        ).compatibility

    def _find_legacy_mapping(self, config: dict[str, Any]) -> tuple[str, Any]:
        if "mapping" in config:
            return "config.mapping", config["mapping"]
        if "field_mapping" in config:
            return "config.field_mapping", config["field_mapping"]
        raise ValueError("Workflow mapping node requires config.mapping or config.field_mapping")

    def _legacy_rules(
        self,
        raw_mapping: Any,
        location: str,
    ) -> tuple[list[FieldRule], str, dict[str, Any], list[str]]:
        unknown_fields: dict[str, Any] = {}
        lossy_fields: list[str] = []

        if isinstance(raw_mapping, dict) and raw_mapping.get("mappingSchemaVersion") == 1:
            raise ValueError("公共 MappingDocumentV1 必须保存到 config.mapping_component")

        if isinstance(raw_mapping, dict) and isinstance(raw_mapping.get("rules"), list):
            shape = "versioned_rules"
            for key, value in raw_mapping.items():
                if key not in _KNOWN_VERSIONED_MAPPING_KEYS:
                    unknown_fields[f"{location}.{key}"] = deepcopy(value)
            items = raw_mapping["rules"]
            return self._rules_from_items(
                items,
                location=f"{location}.rules",
                aliases=(("source_field_id", "target_field_id"),),
                known_keys=_VERSIONED_RULE_KEYS,
                require_upstream_kind=True,
                unknown_fields=unknown_fields,
                lossy_fields=lossy_fields,
            ), shape, unknown_fields, lossy_fields

        if isinstance(raw_mapping, list):
            shape = "pair_list"
            return self._rules_from_items(
                raw_mapping,
                location=location,
                aliases=_PAIR_ALIASES,
                known_keys=set().union(*(set(pair) for pair in _PAIR_ALIASES)),
                require_upstream_kind=False,
                unknown_fields=unknown_fields,
                lossy_fields=lossy_fields,
            ), shape, unknown_fields, lossy_fields

        if isinstance(raw_mapping, dict):
            shape = "pair_object"
            rules: list[FieldRule] = []
            for index, (source, target) in enumerate(raw_mapping.items()):
                path = f"{location}.{source}"
                if not isinstance(source, str) or not source or not isinstance(target, str) or not target:
                    unknown_fields[path] = deepcopy(target)
                    lossy_fields.append(path)
                    continue
                rules.append(self._field_rule(index, source, target))
            return rules, shape, unknown_fields, lossy_fields

        raise ValueError(f"{location} must be an object or list")

    def _rules_from_items(
        self,
        items: list[Any],
        *,
        location: str,
        aliases: tuple[tuple[str, str], ...],
        known_keys: set[str],
        require_upstream_kind: bool,
        unknown_fields: dict[str, Any],
        lossy_fields: list[str],
    ) -> list[FieldRule]:
        rules: list[FieldRule] = []
        for index, item in enumerate(items):
            path = f"{location}[{index}]"
            if not isinstance(item, dict):
                unknown_fields[path] = deepcopy(item)
                lossy_fields.append(path)
                continue
            for key, value in item.items():
                if key not in known_keys:
                    unknown_fields[f"{path}.{key}"] = deepcopy(value)
                    if key in _BEHAVIORAL_RULE_KEYS:
                        lossy_fields.append(f"{path}.{key}")

            source = target = None
            for source_key, target_key in aliases:
                if source_key in item or target_key in item:
                    source, target = item.get(source_key), item.get(target_key)
                    break
            valid_kind = not require_upstream_kind or item.get("source_kind", "upstream_field") == "upstream_field"
            if (
                not valid_kind
                or not isinstance(source, str)
                or not source
                or not isinstance(target, str)
                or not target
            ):
                unknown_fields[f"{path}.legacy"] = deepcopy(item)
                lossy_fields.append(path)
                continue
            rules.append(self._field_rule(index, source, target))
        return rules

    def _field_rule(self, index: int, source: str, target: str) -> FieldRule:
        return FieldRule(
            id=str(index),
            enabled=True,
            displayOrder=index,
            sourceFields=[source],
            targetFields=[target],
            config=FieldRuleConfig(mode="rename"),
        )

    def _collect_unknown_fields(self, node: dict[str, Any]) -> dict[str, Any]:
        unknown_fields = {
            key: deepcopy(value)
            for key, value in node.items()
            if key not in _KNOWN_NODE_KEYS
        }
        config = node.get("config")
        if isinstance(config, dict):
            for key, value in config.items():
                if key not in {
                    "mapping",
                    "field_mapping",
                    _COMPONENT_KEY,
                    _STORAGE_MODE_KEY,
                    _PERSISTED_SNAPSHOT_KEY,
                    "legacySnapshot",
                }:
                    unknown_fields[f"config.{key}"] = deepcopy(value)
        return unknown_fields

    def _persisted_snapshot(self, raw_config: dict[str, Any]) -> dict[str, Any] | None:
        config = raw_config.get("config")
        if isinstance(config, dict):
            for key in (_PERSISTED_SNAPSHOT_KEY, "legacySnapshot"):
                snapshot = config.get(key)
                if isinstance(snapshot, dict):
                    return deepcopy(snapshot)
        for key in (_PERSISTED_SNAPSHOT_KEY, "legacySnapshot"):
            snapshot = raw_config.get(key)
            if isinstance(snapshot, dict):
                return deepcopy(snapshot)
        return None

    def _check_policy_caller(self, policy: MappingCallerPolicyV1) -> None:
        if policy.caller != self.caller:
            raise MappingException(
                MappingErrorCode.MAPPING_CALLER_UNSUPPORTED,
                f"Workflow mapping adapter 不支持 caller={policy.caller}",
                http_status=422,
            )

    def _raise_lossy(
        self,
        message: str,
        *,
        compatibility: MappingCompatibilityV1 | None = None,
    ) -> None:
        details: dict[str, Any] = {}
        if compatibility is not None:
            details = {
                "lossyFields": compatibility.lossyFields,
                "unknownFields": compatibility.unknownFields,
            }
        raise MappingException(
            MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
            message,
            http_status=422,
            details=details,
        )


WorkflowAdapter = WorkflowMappingAdapter
WorkflowDataMappingAdapter = WorkflowMappingAdapter
