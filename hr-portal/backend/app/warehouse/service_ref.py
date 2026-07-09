# -*- coding: utf-8 -*-
"""统一来源协议 — ServiceSourceRef

数据服务（API / 推送 / 订阅 / 消费资产）统一使用此协议标识来源资产。
禁止继续扩散 source_table 字符串魔法（如 report:{id}、dataset:{id}）。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# ── 类型常量 ────────────────────────────────

ServiceSourceType = str  # 'table' | 'dataset' | 'metric' | 'ads' | 'report'

SOURCE_TABLE   = "table"
SOURCE_DATASET = "dataset"
SOURCE_METRIC  = "metric"
SOURCE_ADS     = "ads"
SOURCE_REPORT  = "report"

ALLOWED_SOURCE_TYPES = frozenset({
    SOURCE_TABLE, SOURCE_DATASET, SOURCE_METRIC, SOURCE_ADS, SOURCE_REPORT,
})

# 旧格式前缀（仅读取兼容，禁止新写入）
LEGACY_REPORT_PREFIX = "report:"


# ── 核心数据结构 ─────────────────────────────

@dataclass
class ServiceSourceRef:
    """统一来源引用。

    P0 仅支持 source_type='table'（source_id = 物理表名）。
    P1 扩展支持 dataset / metric / ads / report。
    """
    source_type: ServiceSourceType
    source_id: str | int
    source_label: str | None = None
    source_layer: str | None = None  # DWD / DWS / ADS / METRIC / REPORT

    def __post_init__(self):
        if isinstance(self.source_id, int):
            self.source_id = str(self.source_id)
        if self.source_type not in ALLOWED_SOURCE_TYPES:
            raise ValueError(
                f"不支持的类型 {self.source_type}，允许: {sorted(ALLOWED_SOURCE_TYPES)}"
            )

    # ── 序列化 ────────────────────────────

    def to_dict(self) -> dict:
        return {
            "source_type": self.source_type,
            "source_id": self.source_id,
            "source_label": self.source_label,
            "source_layer": self.source_layer,
        }

    @classmethod
    def from_dict(cls, d: dict) -> ServiceSourceRef:
        return cls(
            source_type=d["source_type"],
            source_id=d["source_id"],
            source_label=d.get("source_label"),
            source_layer=d.get("source_layer"),
        )

    # ── 向后兼容 ───────────────────────────

    def to_legacy_source_table(self) -> str:
        """转为旧 PushTarget.source_table 格式（过渡期兼容）。"""
        if self.source_type == SOURCE_REPORT:
            return f"{LEGACY_REPORT_PREFIX}{self.source_id}"
        return str(self.source_id)


# ── 旧格式解析 ──────────────────────────────

def parse_legacy_source(source_table: str) -> ServiceSourceRef:
    """从旧 source_table 字符串解析为 ServiceSourceRef。

    - "report:123"  → source_type=report, source_id="123"
    - "dwd_employee" → source_type=table, source_id="dwd_employee"
    """
    s = str(source_table or "")
    if s.startswith(LEGACY_REPORT_PREFIX):
        report_id = s[len(LEGACY_REPORT_PREFIX):]
        return ServiceSourceRef(
            source_type=SOURCE_REPORT,
            source_id=report_id,
            source_label=f"报表 #{report_id}",
        )
    return ServiceSourceRef(
        source_type=SOURCE_TABLE,
        source_id=s,
        source_label=s,
    )


def is_legacy_report_source(source_table: str | None) -> bool:
    """判断旧 source_table 是否为报表来源。"""
    return str(source_table or "").startswith(LEGACY_REPORT_PREFIX)


# ── 校验 ────────────────────────────────────

async def resolve_source_layer(
    ref: ServiceSourceRef, db: AsyncSession
) -> str | None:
    """查询来源资产的实际分层。

    仅 source_type='table' 时查 registered_tables.warehouse_layer。
    其他类型返回 source_layer（由调用方传入或上层设置）。
    """
    if ref.source_type == SOURCE_TABLE and ref.source_layer is None:
        from app.warehouse.models import RegisteredTable

        row = await db.execute(
            select(RegisteredTable.warehouse_layer).where(
                RegisteredTable.table_name == ref.source_id
            )
        )
        layer = row.scalar_one_or_none()
        if layer:
            ref.source_layer = layer
    return ref.source_layer


async def assert_not_ods_source(ref: ServiceSourceRef, db: AsyncSession) -> None:
    """拒绝 ODS 来源用于消费（API / 推送 / 订阅 / 消费资产）。

    Raises:
        ValueError: 当来源层级为 ODS 时。
    """
    layer = ref.source_layer
    if layer is None and ref.source_type == SOURCE_TABLE:
        layer = await resolve_source_layer(ref, db)

    if layer and str(layer).upper() == "ODS":
        raise ValueError(
            f"ODS 层禁止创建数据服务。"
            f"来源 {ref.source_label or ref.source_id} 仍在原始层，"
            f"请先完成数据清洗（ODS → DWD）后再创建消费服务。"
        )
