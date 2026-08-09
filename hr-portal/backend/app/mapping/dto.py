"""公共 Mapping DTO v1 (冻结合同)

mappingSchemaVersion=1 与 UCP mapping.version=1 是两个独立版本域, 禁止互相代用。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal, Optional, TypeAlias, Union


# -- 版本标识 ---------------------------------------------------------------

MAPPING_SCHEMA_VERSION = 1

MappingSchemaVersion: TypeAlias = Literal[1]


# -- 规则类型 ---------------------------------------------------------------

# 七类公共规则首期交付, 不得缩减或降期
RULE_TYPE_FIELD = "field"
RULE_TYPE_VALUE_MAP = "value_map"
RULE_TYPE_REFERENCE_LOOKUP = "reference_lookup"
RULE_TYPE_IDENTITY_WITH_OVERRIDES = "identity_with_overrides"
RULE_TYPE_TYPE_CONVERT = "type_convert"
RULE_TYPE_FORMAT = "format"
RULE_TYPE_SPLIT_MERGE = "split_merge"

ALL_RULE_TYPES: tuple[str, ...] = (
    RULE_TYPE_FIELD,
    RULE_TYPE_VALUE_MAP,
    RULE_TYPE_REFERENCE_LOOKUP,
    RULE_TYPE_IDENTITY_WITH_OVERRIDES,
    RULE_TYPE_TYPE_CONVERT,
    RULE_TYPE_FORMAT,
    RULE_TYPE_SPLIT_MERGE,
)

# -- 未命中策略 -------------------------------------------------------------

UNMATCHED_KEEP = "keep"
UNMATCHED_SET_DEFAULT = "set_default"
UNMATCHED_SET_NULL = "set_null"
UNMATCHED_FLAG = "flag"
UNMATCHED_REJECT = "reject"

ALL_UNMATCHED_BEHAVIORS: tuple[str, ...] = (
    UNMATCHED_KEEP,
    UNMATCHED_SET_DEFAULT,
    UNMATCHED_SET_NULL,
    UNMATCHED_FLAG,
    UNMATCHED_REJECT,
)

# -- 错误策略 ----------------------------------------------------------------

ON_ERROR_KEEP = "keep"
ON_ERROR_SET_NULL = "set_null"
ON_ERROR_FLAG = "flag"
ON_ERROR_REJECT = "reject"

ALL_ON_ERROR_BEHAVIORS: tuple[str, ...] = (
    ON_ERROR_KEEP,
    ON_ERROR_SET_NULL,
    ON_ERROR_FLAG,
    ON_ERROR_REJECT,
)

# -- 命中动作 ----------------------------------------------------------------

ON_MATCH_USE_AND_STOP = "use_and_stop"
ON_MATCH_CONTINUE = "continue"
ON_MATCH_ONLY_FILL_EMPTY = "only_fill_empty"

ALL_ON_MATCH_ACTIONS: tuple[str, ...] = (
    ON_MATCH_USE_AND_STOP,
    ON_MATCH_CONTINUE,
    ON_MATCH_ONLY_FILL_EMPTY,
)


# ===========================================================================
# DTO 定义
# ===========================================================================


@dataclass
class MappingRuleBase:
    """规则基础字段 (公共, 不含通用 priority)"""

    id: str
    type: str
    enabled: bool = True
    displayOrder: int = 0
    sourceFields: list[str] = field(default_factory=list)
    targetFields: list[str] = field(default_factory=list)


# -- field 规则 -------------------------------------------------------------


@dataclass
class FieldRuleConfig:
    mode: Literal["rename", "copy"] = "rename"


@dataclass
class FieldRule(MappingRuleBase):
    type: str = RULE_TYPE_FIELD
    config: FieldRuleConfig = field(default_factory=FieldRuleConfig)


# -- value_map 规则 ---------------------------------------------------------


@dataclass
class ValueMapRuleConfig:
    mappings: dict[str, str] = field(default_factory=dict)
    unmatched: str = UNMATCHED_KEEP
    defaultValue: Optional[str] = None


@dataclass
class ValueMapRule(MappingRuleBase):
    type: str = RULE_TYPE_VALUE_MAP
    config: ValueMapRuleConfig = field(default_factory=ValueMapRuleConfig)


# -- reference_lookup 规则 --------------------------------------------------


@dataclass
class MatchRule:
    id: str
    priority: int
    sourceField: str
    referenceField: str
    conditions: dict[str, Any] = field(default_factory=dict)
    onMatch: str = ON_MATCH_USE_AND_STOP


@dataclass
class ReferenceLookupRuleConfig:
    referenceDatasetId: str
    outputMap: dict[str, str] = field(default_factory=dict)
    matchRules: list[MatchRule] = field(default_factory=list)
    unmatched: str = UNMATCHED_KEEP
    defaultValue: Optional[str] = None


@dataclass
class ReferenceLookupRule(MappingRuleBase):
    type: str = RULE_TYPE_REFERENCE_LOOKUP
    config: ReferenceLookupRuleConfig = field(default_factory=ReferenceLookupRuleConfig)


# -- identity_with_overrides 规则 -------------------------------------------


@dataclass
class IdentityWithOverridesRuleConfig:
    defaultBehavior: Literal["keep_source"] = "keep_source"
    overrides: dict[str, str] = field(default_factory=dict)
    unmatched: str = UNMATCHED_KEEP


@dataclass
class IdentityWithOverridesRule(MappingRuleBase):
    type: str = RULE_TYPE_IDENTITY_WITH_OVERRIDES
    config: IdentityWithOverridesRuleConfig = field(
        default_factory=IdentityWithOverridesRuleConfig
    )


# -- type_convert 规则 ------------------------------------------------------


@dataclass
class TypeConvertRuleConfig:
    targetType: str = "string"
    onError: str = ON_ERROR_REJECT


@dataclass
class TypeConvertRule(MappingRuleBase):
    type: str = RULE_TYPE_TYPE_CONVERT
    config: TypeConvertRuleConfig = field(default_factory=TypeConvertRuleConfig)


# -- format 规则 ------------------------------------------------------------


@dataclass
class FormatRuleConfig:
    formatType: str = "trim"
    options: dict[str, Any] = field(default_factory=dict)
    onError: str = ON_ERROR_REJECT


@dataclass
class FormatRule(MappingRuleBase):
    type: str = RULE_TYPE_FORMAT
    config: FormatRuleConfig = field(default_factory=FormatRuleConfig)


# -- split_merge 规则 -------------------------------------------------------


@dataclass
class SplitMergeRuleConfig:
    action: Literal["split", "merge"] = "merge"
    delimiter: str = ""
    nullBehavior: str = "keep_null"


@dataclass
class SplitMergeRule(MappingRuleBase):
    type: str = RULE_TYPE_SPLIT_MERGE
    config: SplitMergeRuleConfig = field(default_factory=SplitMergeRuleConfig)


# -- 联合类型 ----------------------------------------------------------------

MappingRuleV1 = Union[
    FieldRule,
    ValueMapRule,
    ReferenceLookupRule,
    IdentityWithOverridesRule,
    TypeConvertRule,
    FormatRule,
    SplitMergeRule,
]


@dataclass
class MappingRuleSetV1:
    code: str
    name: str
    sourceAsset: Optional[str] = None
    targetAsset: Optional[str] = None
    sourceSchemaHash: str = ""
    targetSchemaHash: str = ""
    rules: list[MappingRuleV1] = field(default_factory=list)


@dataclass
class MappingDocumentV1:
    """公共 Mapping Document v1 (冻结合同)"""

    mappingSchemaVersion: int = MAPPING_SCHEMA_VERSION
    ruleSet: MappingRuleSetV1 = field(default_factory=lambda: MappingRuleSetV1(code="", name=""))

    def to_dict(self) -> dict[str, Any]:
        return _document_to_dict(self)

    @staticmethod
    def from_dict(data: dict[str, Any]) -> MappingDocumentV1:
        return _document_from_dict(data)


# -- 执行结果 ----------------------------------------------------------------


@dataclass
class MappingTraceEntry:
    rowIndex: int
    ruleId: str
    outcome: Literal["matched", "unmatched", "skipped", "error"]
    referenceKey: Any = None
    before: Any = None
    after: Any = None
    errorCode: Optional[str] = None


@dataclass
class MappingStats:
    input: int = 0
    output: int = 0
    matched: int = 0
    unmatched: int = 0
    errors: int = 0


@dataclass
class MappingError:
    code: str
    message: str
    rowIndex: Optional[int] = None
    ruleId: Optional[str] = None
    field: Optional[str] = None


@dataclass
class MappingResultV1:
    outputRows: list[dict[str, Any]] = field(default_factory=list)
    trace: list[MappingTraceEntry] = field(default_factory=list)
    stats: MappingStats = field(default_factory=MappingStats)
    errors: list[MappingError] = field(default_factory=list)


@dataclass
class MappingCompatibilityV1:
    """兼容状态 (adapter 读写时返回)"""

    sourceFormat: str = ""
    readable: bool = True
    writable: bool = True
    requiresMigration: bool = False
    lossyFields: list[str] = field(default_factory=list)
    unknownFields: dict[str, Any] = field(default_factory=dict)


# ===========================================================================
# 序列化 / 反序列化
# ===========================================================================


def _document_to_dict(doc: MappingDocumentV1) -> dict[str, Any]:
    rs = doc.ruleSet
    return {
        "mappingSchemaVersion": doc.mappingSchemaVersion,
        "ruleSet": {
            "code": rs.code,
            "name": rs.name,
            "sourceAsset": rs.sourceAsset,
            "targetAsset": rs.targetAsset,
            "sourceSchemaHash": rs.sourceSchemaHash,
            "targetSchemaHash": rs.targetSchemaHash,
            "rules": [_rule_to_dict(r) for r in rs.rules],
        },
    }


def _rule_to_dict(rule: MappingRuleV1) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": rule.id,
        "type": rule.type,
        "enabled": rule.enabled,
        "displayOrder": rule.displayOrder,
        "sourceFields": rule.sourceFields,
        "targetFields": rule.targetFields,
    }
    if isinstance(rule, FieldRule):
        d["config"] = {"mode": rule.config.mode}
    elif isinstance(rule, ValueMapRule):
        d["config"] = {
            "mappings": dict(rule.config.mappings),
            "unmatched": rule.config.unmatched,
            "defaultValue": rule.config.defaultValue,
        }
    elif isinstance(rule, ReferenceLookupRule):
        d["config"] = {
            "referenceDatasetId": rule.config.referenceDatasetId,
            "outputMap": dict(rule.config.outputMap),
            "matchRules": [
                {
                    "id": mr.id,
                    "priority": mr.priority,
                    "sourceField": mr.sourceField,
                    "referenceField": mr.referenceField,
                    "conditions": dict(mr.conditions),
                    "onMatch": mr.onMatch,
                }
                for mr in rule.config.matchRules
            ],
            "unmatched": rule.config.unmatched,
            "defaultValue": rule.config.defaultValue,
        }
    elif isinstance(rule, IdentityWithOverridesRule):
        d["config"] = {
            "defaultBehavior": rule.config.defaultBehavior,
            "overrides": dict(rule.config.overrides),
            "unmatched": rule.config.unmatched,
        }
    elif isinstance(rule, TypeConvertRule):
        d["config"] = {
            "targetType": rule.config.targetType,
            "onError": rule.config.onError,
        }
    elif isinstance(rule, FormatRule):
        d["config"] = {
            "formatType": rule.config.formatType,
            "options": dict(rule.config.options),
            "onError": rule.config.onError,
        }
    elif isinstance(rule, SplitMergeRule):
        d["config"] = {
            "action": rule.config.action,
            "delimiter": rule.config.delimiter,
            "nullBehavior": rule.config.nullBehavior,
        }
    return d


def _document_from_dict(data: dict[str, Any]) -> MappingDocumentV1:
    sv = data.get("mappingSchemaVersion")
    if sv != MAPPING_SCHEMA_VERSION:
        raise ValueError(
            f"mappingSchemaVersion must be {MAPPING_SCHEMA_VERSION}, got {sv}"
        )

    rs_data = data.get("ruleSet") or {}
    rules: list[MappingRuleV1] = []
    for rd in rs_data.get("rules") or []:
        rules.append(_rule_from_dict(rd))

    return MappingDocumentV1(
        mappingSchemaVersion=MAPPING_SCHEMA_VERSION,
        ruleSet=MappingRuleSetV1(
            code=rs_data.get("code", ""),
            name=rs_data.get("name", ""),
            sourceAsset=rs_data.get("sourceAsset"),
            targetAsset=rs_data.get("targetAsset"),
            sourceSchemaHash=rs_data.get("sourceSchemaHash", ""),
            targetSchemaHash=rs_data.get("targetSchemaHash", ""),
            rules=rules,
        ),
    )


def _rule_from_dict(rd: dict[str, Any]) -> MappingRuleV1:
    rtype = rd.get("type", "")
    base = {
        "id": rd.get("id", ""),
        "type": rtype,
        "enabled": rd.get("enabled", True),
        "displayOrder": rd.get("displayOrder", 0),
        "sourceFields": rd.get("sourceFields", []),
        "targetFields": rd.get("targetFields", []),
    }
    cfg = rd.get("config") or {}

    if rtype == RULE_TYPE_FIELD:
        return FieldRule(**base, config=FieldRuleConfig(mode=cfg.get("mode", "rename")))
    elif rtype == RULE_TYPE_VALUE_MAP:
        mappings = cfg.get("mappings", {})
        # 兼容旧 [{from, to}] 数组格式
        if isinstance(mappings, list):
            mappings = {item.get("from", ""): item.get("to", "") for item in mappings if isinstance(item, dict)}
        return ValueMapRule(
            **base,
            config=ValueMapRuleConfig(
                mappings=mappings,
                unmatched=cfg.get("unmatched", UNMATCHED_KEEP),
                defaultValue=cfg.get("defaultValue"),
            ),
        )
    elif rtype == RULE_TYPE_REFERENCE_LOOKUP:
        match_rules = [
            MatchRule(
                id=mr.get("id", ""),
                priority=mr.get("priority", 0),
                sourceField=mr.get("sourceField", ""),
                referenceField=mr.get("referenceField", ""),
                conditions=mr.get("conditions", {}),
                onMatch=mr.get("onMatch", ON_MATCH_USE_AND_STOP),
            )
            for mr in (cfg.get("matchRules") or [])
        ]
        return ReferenceLookupRule(
            **base,
            config=ReferenceLookupRuleConfig(
                referenceDatasetId=cfg.get("referenceDatasetId", ""),
                outputMap=cfg.get("outputMap", {}),
                matchRules=match_rules,
                unmatched=cfg.get("unmatched", UNMATCHED_KEEP),
                defaultValue=cfg.get("defaultValue"),
            ),
        )
    elif rtype == RULE_TYPE_IDENTITY_WITH_OVERRIDES:
        return IdentityWithOverridesRule(
            **base,
            config=IdentityWithOverridesRuleConfig(
                defaultBehavior=cfg.get("defaultBehavior", "keep_source"),
                overrides=cfg.get("overrides", {}),
                unmatched=cfg.get("unmatched", UNMATCHED_KEEP),
            ),
        )
    elif rtype == RULE_TYPE_TYPE_CONVERT:
        return TypeConvertRule(
            **base,
            config=TypeConvertRuleConfig(
                targetType=cfg.get("targetType", "string"),
                onError=cfg.get("onError", ON_ERROR_REJECT),
            ),
        )
    elif rtype == RULE_TYPE_FORMAT:
        return FormatRule(
            **base,
            config=FormatRuleConfig(
                formatType=cfg.get("formatType", "trim"),
                options=cfg.get("options", {}),
                onError=cfg.get("onError", ON_ERROR_REJECT),
            ),
        )
    elif rtype == RULE_TYPE_SPLIT_MERGE:
        return SplitMergeRule(
            **base,
            config=SplitMergeRuleConfig(
                action=cfg.get("action", "merge"),
                delimiter=cfg.get("delimiter", ""),
                nullBehavior=cfg.get("nullBehavior", "keep_null"),
            ),
        )
    else:
        raise ValueError(f"Unknown rule type: {rtype}")
