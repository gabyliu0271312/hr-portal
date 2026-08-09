"""Mapping 错误码 (冻结合同)

稳定错误码, 不得自行变体。
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional


class MappingErrorCode(str, Enum):
    """所有公共映射错误码"""

    # -- Policy/兼容错误 --
    MAPPING_CALLER_UNSUPPORTED = "MAPPING_CALLER_UNSUPPORTED"
    MAPPING_RULE_TYPE_FORBIDDEN = "MAPPING_RULE_TYPE_FORBIDDEN"
    MAPPING_ASSET_FORBIDDEN = "MAPPING_ASSET_FORBIDDEN"
    MAPPING_FIELD_FORBIDDEN = "MAPPING_FIELD_FORBIDDEN"
    MAPPING_REFERENCE_DATASET_FORBIDDEN = "MAPPING_REFERENCE_DATASET_FORBIDDEN"
    MAPPING_TARGET_FIELD_PROTECTED = "MAPPING_TARGET_FIELD_PROTECTED"
    MAPPING_EFFECT_FORBIDDEN = "MAPPING_EFFECT_FORBIDDEN"
    MAPPING_SCHEMA_CHANGED = "MAPPING_SCHEMA_CHANGED"
    MAPPING_VERSION_CONFLICT = "MAPPING_VERSION_CONFLICT"
    MAPPING_LOSSY_WRITE_BLOCKED = "MAPPING_LOSSY_WRITE_BLOCKED"
    MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED = "MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED"
    MAPPING_REVIEW_REQUIRED = "MAPPING_REVIEW_REQUIRED"

    # -- 规则执行错误 --
    MAPPING_VALUE_UNMAPPED = "MAPPING_VALUE_UNMAPPED"
    MAPPING_LOOKUP_DUPLICATE_KEY = "MAPPING_LOOKUP_DUPLICATE_KEY"
    MAPPING_LOOKUP_CONFLICT = "MAPPING_LOOKUP_CONFLICT"
    MAPPING_LOOKUP_NO_MATCH = "MAPPING_LOOKUP_NO_MATCH"
    MAPPING_TYPE_CONVERSION_FAILED = "MAPPING_TYPE_CONVERSION_FAILED"
    MAPPING_FORMAT_INVALID = "MAPPING_FORMAT_INVALID"
    MAPPING_SPLIT_MERGE_INVALID = "MAPPING_SPLIT_MERGE_INVALID"
    MAPPING_CYCLE_DETECTED = "MAPPING_CYCLE_DETECTED"
    MAPPING_TARGET_DUPLICATE = "MAPPING_TARGET_DUPLICATE"


# 便捷别名
MAPPING_CALLER_UNSUPPORTED = MappingErrorCode.MAPPING_CALLER_UNSUPPORTED
MAPPING_RULE_TYPE_FORBIDDEN = MappingErrorCode.MAPPING_RULE_TYPE_FORBIDDEN
MAPPING_ASSET_FORBIDDEN = MappingErrorCode.MAPPING_ASSET_FORBIDDEN
MAPPING_FIELD_FORBIDDEN = MappingErrorCode.MAPPING_FIELD_FORBIDDEN
MAPPING_REFERENCE_DATASET_FORBIDDEN = MappingErrorCode.MAPPING_REFERENCE_DATASET_FORBIDDEN
MAPPING_TARGET_FIELD_PROTECTED = MappingErrorCode.MAPPING_TARGET_FIELD_PROTECTED
MAPPING_EFFECT_FORBIDDEN = MappingErrorCode.MAPPING_EFFECT_FORBIDDEN
MAPPING_SCHEMA_CHANGED = MappingErrorCode.MAPPING_SCHEMA_CHANGED
MAPPING_VERSION_CONFLICT = MappingErrorCode.MAPPING_VERSION_CONFLICT
MAPPING_LOSSY_WRITE_BLOCKED = MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED
MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED = MappingErrorCode.MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED
MAPPING_REVIEW_REQUIRED = MappingErrorCode.MAPPING_REVIEW_REQUIRED
MAPPING_VALUE_UNMAPPED = MappingErrorCode.MAPPING_VALUE_UNMAPPED
MAPPING_LOOKUP_DUPLICATE_KEY = MappingErrorCode.MAPPING_LOOKUP_DUPLICATE_KEY
MAPPING_LOOKUP_CONFLICT = MappingErrorCode.MAPPING_LOOKUP_CONFLICT
MAPPING_LOOKUP_NO_MATCH = MappingErrorCode.MAPPING_LOOKUP_NO_MATCH
MAPPING_TYPE_CONVERSION_FAILED = MappingErrorCode.MAPPING_TYPE_CONVERSION_FAILED
MAPPING_FORMAT_INVALID = MappingErrorCode.MAPPING_FORMAT_INVALID
MAPPING_SPLIT_MERGE_INVALID = MappingErrorCode.MAPPING_SPLIT_MERGE_INVALID
MAPPING_CYCLE_DETECTED = MappingErrorCode.MAPPING_CYCLE_DETECTED
MAPPING_TARGET_DUPLICATE = MappingErrorCode.MAPPING_TARGET_DUPLICATE


class MappingException(Exception):
    """映射异常, 携带稳定错误码和 HTTP 状态码"""

    def __init__(
        self,
        code: MappingErrorCode,
        message: str,
        *,
        http_status: int = 422,
        field: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ):
        self.code = code
        self.message = message
        self.http_status = http_status
        self.field = field
        self.details = details or {}
        super().__init__(f"[{code.value}] {message}")

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "code": self.code.value,
            "message": self.message,
        }
        if self.field:
            d["field"] = self.field
        if self.details:
            d["details"] = self.details
        return d


# 便捷构造函数
def policy_error(code: MappingErrorCode, message: str, **kw: Any) -> MappingException:
    return MappingException(code, message, http_status=422, **kw)


def forbidden_error(message: str, **kw: Any) -> MappingException:
    return MappingException(
        MappingErrorCode.MAPPING_EFFECT_FORBIDDEN,
        message,
        http_status=403,
        **kw,
    )


def conflict_error(message: str, **kw: Any) -> MappingException:
    return MappingException(
        MappingErrorCode.MAPPING_VERSION_CONFLICT,
        message,
        http_status=409,
        **kw,
    )
