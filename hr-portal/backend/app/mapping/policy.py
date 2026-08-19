"""MappingCallerPolicyV1 (冻结合同)

五类调用方唯一 policy 入口。
调用方不得通过隐藏字段绕过 policy。
所有字段引用仍需经过服务端元数据和权限校验。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal, Optional, TypeAlias

from app.mapping.dto import ALL_RULE_TYPES


# -- 调用方类型 --------------------------------------------------------------

MappingCaller: TypeAlias = Literal[
    "warehouse",
    "workflow",
    "ucp_transform",
    "warehouse_sink",
    "push_target",
]

ALL_CALLERS: tuple[str, ...] = (
    "warehouse",
    "workflow",
    "ucp_transform",
    "warehouse_sink",
    "push_target",
)


# -- 权限 scope 映射 --------------------------------------------------------

CALLER_PERMISSION_SCOPE: dict[str, str] = {
    "warehouse": "warehouse.modeling",
    "workflow": "ucp.pipelines",
    "ucp_transform": "ucp.pipelines",
    "warehouse_sink": "ucp.pipelines",
    "push_target": "warehouse.service",
}


# -- 调用方默认规则范围 ------------------------------------------------------

CALLER_DEFAULT_RULE_TYPES: dict[str, tuple[str, ...]] = {
    "warehouse": ALL_RULE_TYPES,
    "workflow": ALL_RULE_TYPES,
    "ucp_transform": ALL_RULE_TYPES,  # Legacy v1 只能表达 field, 但 Component v1 可用七类
    "warehouse_sink": ALL_RULE_TYPES,
    "push_target": ALL_RULE_TYPES,
}


@dataclass
class CallerPolicySource:
    assetId: Optional[str] = None
    schemaHash: str = ""
    allowedFieldIds: list[str] = field(default_factory=list)
    sensitiveFieldIds: list[str] = field(default_factory=list)


@dataclass
class CallerPolicyTarget:
    assetId: Optional[str] = None
    schemaHash: str = ""
    allowedFieldIds: list[str] = field(default_factory=list)
    readonlyFieldIds: list[str] = field(default_factory=list)
    protectedKeyFieldIds: list[str] = field(default_factory=list)
    sensitiveFieldIds: list[str] = field(default_factory=list)


@dataclass
class CallerPolicyReferenceLookup:
    allowedDatasetIds: list[str] = field(default_factory=list)
    allowedFieldIds: list[str] = field(default_factory=list)
    datasetFields: dict[str, list[str]] = field(default_factory=dict)
    maxRules: int = 20


@dataclass
class CallerPolicyEffects:
    allowPreview: bool = True
    allowSave: bool = True
    allowPublish: bool = True
    allowExecute: bool = True
    allowRebuild: bool = True


@dataclass
class CallerPolicyLegacy:
    sourceFormat: Optional[str] = None
    allowLegacyRead: bool = True
    allowLegacyWrite: bool = True
    allowMigration: bool = True


@dataclass
class CallerPolicyMetadata:
    policyVersion: int = 1
    permissionScope: str = ""
    issuedAt: str = ""


@dataclass
class MappingCallerPolicyV1:
    """调用方策略 (冻结合同)"""

    caller: str
    allowedRuleTypes: tuple[str, ...] = ALL_RULE_TYPES
    source: CallerPolicySource = field(default_factory=CallerPolicySource)
    target: CallerPolicyTarget = field(default_factory=CallerPolicyTarget)
    referenceLookup: CallerPolicyReferenceLookup = field(
        default_factory=CallerPolicyReferenceLookup
    )
    effects: CallerPolicyEffects = field(default_factory=CallerPolicyEffects)
    legacy: CallerPolicyLegacy = field(default_factory=CallerPolicyLegacy)
    metadata: CallerPolicyMetadata = field(default_factory=CallerPolicyMetadata)

    def sensitive_field_ids(self) -> set[str]:
        """返回由服务端字段目录签发的敏感字段集合。"""
        return set(self.source.sensitiveFieldIds) | set(self.target.sensitiveFieldIds)

    def to_dict(self) -> dict[str, Any]:
        return {
            "caller": self.caller,
            "allowedRuleTypes": list(self.allowedRuleTypes),
            "source": {
                "assetId": self.source.assetId,
                "schemaHash": self.source.schemaHash,
                "allowedFieldIds": list(self.source.allowedFieldIds),
                "sensitiveFieldIds": list(self.source.sensitiveFieldIds),
            },
            "target": {
                "assetId": self.target.assetId,
                "schemaHash": self.target.schemaHash,
                "allowedFieldIds": list(self.target.allowedFieldIds),
                "readonlyFieldIds": list(self.target.readonlyFieldIds),
                "protectedKeyFieldIds": list(self.target.protectedKeyFieldIds),
                "sensitiveFieldIds": list(self.target.sensitiveFieldIds),
            },
            "referenceLookup": {
                "allowedDatasetIds": list(self.referenceLookup.allowedDatasetIds),
                "allowedFieldIds": list(self.referenceLookup.allowedFieldIds),
                "datasetFields": {
                    dataset_id: list(field_ids)
                    for dataset_id, field_ids in self.referenceLookup.datasetFields.items()
                },
                "maxRules": self.referenceLookup.maxRules,
            },
            "effects": {
                "allowPreview": self.effects.allowPreview,
                "allowSave": self.effects.allowSave,
                "allowPublish": self.effects.allowPublish,
                "allowExecute": self.effects.allowExecute,
                "allowRebuild": self.effects.allowRebuild,
            },
            "legacy": {
                "sourceFormat": self.legacy.sourceFormat,
                "allowLegacyRead": self.legacy.allowLegacyRead,
                "allowLegacyWrite": self.legacy.allowLegacyWrite,
                "allowMigration": self.legacy.allowMigration,
            },
            "metadata": {
                "policyVersion": self.metadata.policyVersion,
                "permissionScope": self.metadata.permissionScope,
                "issuedAt": self.metadata.issuedAt,
            },
        }


def build_policy(
    caller: str,
    *,
    source_asset_id: Optional[str] = None,
    source_schema_hash: str = "",
    source_field_ids: Optional[list[str]] = None,
    source_sensitive_field_ids: Optional[list[str]] = None,
    target_asset_id: Optional[str] = None,
    target_schema_hash: str = "",
    target_field_ids: Optional[list[str]] = None,
    target_readonly: Optional[list[str]] = None,
    target_protected_keys: Optional[list[str]] = None,
    target_sensitive_field_ids: Optional[list[str]] = None,
    allowed_rule_types: Optional[tuple[str, ...]] = None,
    allowed_reference_datasets: Optional[list[str]] = None,
    allowed_reference_fields: Optional[list[str]] = None,
    reference_dataset_fields: Optional[dict[str, list[str]]] = None,
    max_lookup_rules: int = 20,
    allow_preview: bool = True,
    allow_save: bool = True,
    allow_publish: bool = True,
    allow_execute: bool = True,
    allow_rebuild: bool = True,
    legacy_source_format: Optional[str] = None,
    allow_legacy_read: bool = True,
    allow_legacy_write: bool = True,
    allow_migration: bool = True,
) -> MappingCallerPolicyV1:
    """构建调用方策略"""

    if caller not in ALL_CALLERS:
        raise ValueError(f"Unsupported caller: {caller}")

    rule_types = allowed_rule_types or CALLER_DEFAULT_RULE_TYPES.get(caller, ALL_RULE_TYPES)

    return MappingCallerPolicyV1(
        caller=caller,
        allowedRuleTypes=rule_types,
        source=CallerPolicySource(
            assetId=source_asset_id,
            schemaHash=source_schema_hash,
            allowedFieldIds=source_field_ids or [],
            sensitiveFieldIds=source_sensitive_field_ids or [],
        ),
        target=CallerPolicyTarget(
            assetId=target_asset_id,
            schemaHash=target_schema_hash,
            allowedFieldIds=target_field_ids or [],
            readonlyFieldIds=target_readonly or [],
            protectedKeyFieldIds=target_protected_keys or [],
            sensitiveFieldIds=target_sensitive_field_ids or [],
        ),
        referenceLookup=CallerPolicyReferenceLookup(
            allowedDatasetIds=allowed_reference_datasets or [],
            allowedFieldIds=allowed_reference_fields or [],
            datasetFields=reference_dataset_fields or {},
            maxRules=max_lookup_rules,
        ),
        effects=CallerPolicyEffects(
            allowPreview=allow_preview,
            allowSave=allow_save,
            allowPublish=allow_publish,
            allowExecute=allow_execute,
            allowRebuild=allow_rebuild,
        ),
        legacy=CallerPolicyLegacy(
            sourceFormat=legacy_source_format,
            allowLegacyRead=allow_legacy_read,
            allowLegacyWrite=allow_legacy_write,
            allowMigration=allow_migration,
        ),
        metadata=CallerPolicyMetadata(
            policyVersion=1,
            permissionScope=CALLER_PERMISSION_SCOPE.get(caller, ""),
            issuedAt=datetime.now(timezone.utc).isoformat(),
        ),
    )
