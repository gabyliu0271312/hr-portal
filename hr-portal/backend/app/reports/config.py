from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator
class FilterCond(BaseModel):
    column: str
    op: str = "eq"
    value: Any = None
    visible: bool = True
    locked: bool = False


class SortCond(BaseModel):
    column: str
    order: str = "asc"


class ColumnInstance(BaseModel):
    """列实例：允许同一 source_code 出现多次，用 instance_id 区分。"""
    model_config = {"extra": "forbid"}
    source_code: str         # 原始字段 code
    instance_id: str         # 唯一实例 ID："emp.count" / "emp.count#2"
    label: str | None = None # 显示名："员工数" / "员工数 (2)"


def _normalize_columns(columns: list) -> list[ColumnInstance]:
    """将 columns 统一转为 ColumnInstance 列表（兼容旧 string[] 格式）。
    校验 instance_id 全局唯一、格式合法、与 source_code 前缀匹配。
    """
    result: list[ColumnInstance] = []
    seen_ids: set[str] = set()
    for item in columns:
        if isinstance(item, str):
            ci = ColumnInstance(source_code=item, instance_id=item)
        elif isinstance(item, ColumnInstance):
            ci = item
        elif isinstance(item, dict):
            ci = ColumnInstance(**item)
        else:
            raise ValueError(f"不支持的列格式: {type(item).__name__}")
        # 校验 instance_id 格式
        sc = ci.source_code
        iid = ci.instance_id
        if iid == sc:
            pass  # 首实例，OK
        elif "#" in iid:
            parts = iid.rsplit("#", 1)
            prefix, suffix = parts[0], parts[1]
            if prefix != sc:
                raise ValueError(
                    f"instance_id 前缀必须匹配 source_code: "
                    f"instance_id={iid}, source_code={sc}"
                )
            if not (suffix.isdigit() and int(suffix) >= 2):
                raise ValueError(f"instance_id 格式非法: {iid}，期望 source_code#N (N>=2)")
        else:
            raise ValueError(
                f"instance_id 必须等于 source_code 或 source_code#N: "
                f"instance_id={iid}, source_code={sc}"
            )
        # 全局唯一
        if iid in seen_ids:
            raise ValueError(f"instance_id 重复: {iid}")
        seen_ids.add(iid)
        result.append(ci)
    return result


def _columns_to_instance_ids(columns: list) -> list[str]:
    """从 columns 提取 instance_id 数组（用于解耦 columns 结构细节）。"""
    return [c.instance_id if isinstance(c, ColumnInstance) else
            (c["instance_id"] if isinstance(c, dict) else c)
            for c in columns]


class ReportConfig(BaseModel):
    columns: list[str | ColumnInstance] = Field(default_factory=list)
    filters: list[FilterCond] = Field(default_factory=list)
    sorts: list[SortCond] = Field(default_factory=list)
    value_rules: list[dict] = Field(default_factory=list)
    column_settings: dict[str, dict] = Field(default_factory=dict)
    default_split_rule: dict = Field(default_factory=dict)
    aggregate: bool = False
    default_aggregation: str = "sum"
    aggregations: dict[str, str] = Field(default_factory=dict)
    transpose: dict = Field(default_factory=dict)
    rounding_corrections: list[dict] = Field(default_factory=list)
    filter_logic: dict | None = None
    list_lookup: dict = Field(default_factory=dict)

    @field_validator("columns")
    @classmethod
    def normalize_column_instances(cls, columns: list[str | ColumnInstance]) -> list[ColumnInstance]:
        return _normalize_columns(columns)

    def validate_config_references(self) -> "ReportConfig":
        from app.reports.validation import validate_report_config_references
        return validate_report_config_references(self)