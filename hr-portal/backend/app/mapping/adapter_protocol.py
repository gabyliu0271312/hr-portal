"""Adapter Protocol (冻结合同)

每个 adapter 必须实现:
- read: 旧配置 → MappingDocumentV1 + 兼容状态
- write: MappingDocumentV1 → 旧配置 (或有损阻断)
- 无损回写: unknownFields 必须保留
- 有损回写: 返回 MAPPING_LOSSY_WRITE_BLOCKED
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional, Protocol, TypeAlias, runtime_checkable

from app.mapping.dto import MappingCompatibilityV1, MappingDocumentV1
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.policy import MappingCallerPolicyV1


AdapterStorageMode: TypeAlias = Literal["legacy_v1", "component_v1"]


@dataclass
class MappingAdapterReadResult:
    """adapter.read 返回结果"""

    document: MappingDocumentV1
    compatibility: MappingCompatibilityV1
    storageMode: AdapterStorageMode = "component_v1"
    legacySnapshot: Optional[dict[str, Any]] = None  # 只读 legacy 快照


@runtime_checkable
class MappingAdapter(Protocol):
    """公共 Adapter 协议"""

    @property
    def caller(self) -> str: ...

    def read(
        self,
        raw_config: dict[str, Any],
        *,
        policy: MappingCallerPolicyV1,
    ) -> MappingAdapterReadResult:
        """从旧配置读取, 转换为公共 DTO + 兼容状态"""
        ...

    def write(
        self,
        document: MappingDocumentV1,
        *,
        policy: MappingCallerPolicyV1,
        compatibility: MappingCompatibilityV1,
        storage_mode: AdapterStorageMode = "component_v1",
    ) -> dict[str, Any]:
        """
        将公共 DTO 回写为旧格式配置。

        如果无法无损回写, 抛出 MAPPING_LOSSY_WRITE_BLOCKED。
        """
        ...

    def validate_legacy(
        self,
        raw_config: dict[str, Any],
    ) -> MappingCompatibilityV1:
        """验证旧配置的兼容状态"""
        ...


def check_lossy_write(
    compatibility: MappingCompatibilityV1,
    *,
    storage_mode: AdapterStorageMode,
) -> None:
    """检查是否有损写入, 有损时阻断"""

    if not compatibility.writable:
        raise MappingException(
            MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
            f"无法无损回写: 存在有损字段 {compatibility.lossyFields}",
            http_status=422,
            details={
                "lossyFields": compatibility.lossyFields,
                "unknownFields": compatibility.unknownFields,
                "storageMode": storage_mode,
            },
        )

    if storage_mode == "legacy_v1" and compatibility.requiresMigration:
        raise MappingException(
            MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
            "当前文档需要迁移到 component_v1, 无法以 legacy_v1 保存",
            http_status=422,
            details={
                "requiresMigration": True,
                "lossyFields": compatibility.lossyFields,
            },
        )


def check_legacy_downgrade(
    document: MappingDocumentV1,
    *,
    can_downgrade: bool,
) -> None:
    """检查是否可以降级为 legacy v1"""

    if not can_downgrade:
        raise MappingException(
            MappingErrorCode.MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED,
            "当前规则集包含 legacy v1 无法表达的能力, 不支持降级",
            http_status=422,
        )
