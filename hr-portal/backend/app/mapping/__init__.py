"""统一数据映射组件 (017)

公共合同冻结合同:
- MappingDocumentV1 (mappingSchemaVersion=1)
- MappingCallerPolicyV1
- MappingCompatibilityV1 / MappingResultV1
- 纯 MappingExecutor (不写 DB/不执行 Pipeline/不发送通知)
- Adapter protocol (read/write/无损回写/有损阻断)
"""

from app.mapping.dto import (
    MappingDocumentV1,
    MappingRuleV1,
    MappingRuleSetV1,
    MappingRuleBase,
    MappingResultV1,
    MappingTraceEntry,
    MappingStats,
    MappingError,
    MappingCompatibilityV1,
    MappingSchemaVersion,
)
from app.mapping.policy import (
    MappingCaller,
    MappingCallerPolicyV1,
    build_policy,
)
from app.mapping.errors import (
    MappingErrorCode,
    MappingException,
    MAPPING_CALLER_UNSUPPORTED,
    MAPPING_RULE_TYPE_FORBIDDEN,
    MAPPING_ASSET_FORBIDDEN,
    MAPPING_FIELD_FORBIDDEN,
    MAPPING_REFERENCE_DATASET_FORBIDDEN,
    MAPPING_TARGET_FIELD_PROTECTED,
    MAPPING_EFFECT_FORBIDDEN,
    MAPPING_SCHEMA_CHANGED,
    MAPPING_VERSION_CONFLICT,
    MAPPING_LOSSY_WRITE_BLOCKED,
    MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED,
    MAPPING_VALUE_UNMAPPED,
    MAPPING_LOOKUP_DUPLICATE_KEY,
    MAPPING_LOOKUP_CONFLICT,
    MAPPING_LOOKUP_NO_MATCH,
    MAPPING_TYPE_CONVERSION_FAILED,
    MAPPING_FORMAT_INVALID,
    MAPPING_SPLIT_MERGE_INVALID,
    MAPPING_CYCLE_DETECTED,
    MAPPING_TARGET_DUPLICATE,
)
from app.mapping.executor import MappingExecutor
from app.mapping import rules as _rules  # noqa: F401 - 注册内置规则插件
from app.mapping.adapter_protocol import (
    MappingAdapter,
    MappingAdapterReadResult,
    AdapterStorageMode,
)

__all__ = [
    # DTO
    "MappingDocumentV1",
    "MappingRuleV1",
    "MappingRuleSetV1",
    "MappingRuleBase",
    "MappingResultV1",
    "MappingTraceEntry",
    "MappingStats",
    "MappingError",
    "MappingCompatibilityV1",
    "MappingSchemaVersion",
    # Policy
    "MappingCaller",
    "MappingCallerPolicyV1",
    "build_policy",
    # Errors
    "MappingErrorCode",
    "MappingException",
    "MAPPING_CALLER_UNSUPPORTED",
    "MAPPING_RULE_TYPE_FORBIDDEN",
    "MAPPING_ASSET_FORBIDDEN",
    "MAPPING_FIELD_FORBIDDEN",
    "MAPPING_REFERENCE_DATASET_FORBIDDEN",
    "MAPPING_TARGET_FIELD_PROTECTED",
    "MAPPING_EFFECT_FORBIDDEN",
    "MAPPING_SCHEMA_CHANGED",
    "MAPPING_VERSION_CONFLICT",
    "MAPPING_LOSSY_WRITE_BLOCKED",
    "MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED",
    "MAPPING_VALUE_UNMAPPED",
    "MAPPING_LOOKUP_DUPLICATE_KEY",
    "MAPPING_LOOKUP_CONFLICT",
    "MAPPING_LOOKUP_NO_MATCH",
    "MAPPING_TYPE_CONVERSION_FAILED",
    "MAPPING_FORMAT_INVALID",
    "MAPPING_SPLIT_MERGE_INVALID",
    "MAPPING_CYCLE_DETECTED",
    "MAPPING_TARGET_DUPLICATE",
    # Executor
    "MappingExecutor",
    # Adapter
    "MappingAdapter",
    "MappingAdapterReadResult",
    "AdapterStorageMode",
]
