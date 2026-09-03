from __future__ import annotations

from typing import Any, Literal

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


class DimensionTuple(BaseModel):
    model_config = {"extra": "forbid"}
    values: dict[str, Any]


class DimensionTargetTuple(DimensionTuple):
    modes: dict[str, Literal["auto", "source", "custom", "preserve"]]


class DimensionMergeRule(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    mode: Literal["exact", "expand"] = "exact"
    expand_by: list[str] = Field(default_factory=list)
    dimension_signature: list[str] = Field(min_length=1)
    sources: list[DimensionTuple] = Field(min_length=1)
    target: DimensionTargetTuple


class ReportConfig(BaseModel):
    columns: list[str | ColumnInstance] = Field(default_factory=list)
    filters: list[FilterCond] = Field(default_factory=list)
    quality_period_field: str | None = None
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
    dimension_merge_rules: list[DimensionMergeRule] = Field(default_factory=list)

    @field_validator("column_settings")
    @classmethod
    def validate_display_formats(cls, settings: dict[str, dict]) -> dict[str, dict]:
        valid_types = {"default", "number", "percent"}
        valid_rules = {"half_up", "ceil", "floor"}
        valid_units = {"none", "thousand", "ten_thousand", "million", "ten_million", "hundred_million", "K", "M"}
        for instance_id, setting in settings.items():
            if not isinstance(setting, dict):
                raise ValueError(f"列设置必须是对象: {instance_id}")
            display_format = setting.get("display_format")
            if display_format is None:
                continue
            if not isinstance(display_format, dict):
                raise ValueError(f"显示格式必须是对象: {instance_id}")
            kind = display_format.get("type", "default")
            if kind not in valid_types:
                raise ValueError(f"显示格式类型非法: {instance_id}")
            if kind == "default":
                if any(key in display_format for key in ("precision", "unit", "thousands_separator", "rounding_rule")):
                    raise ValueError(f"默认显示格式不允许自定义参数: {instance_id}")
                continue
            precision = display_format.get("precision", 2)
            if not isinstance(precision, int) or isinstance(precision, bool) or not 0 <= precision <= 6:
                raise ValueError(f"显示格式小数位数必须为 0 到 6: {instance_id}")
            if display_format.get("rounding_rule", "half_up") not in valid_rules:
                raise ValueError(f"显示格式取整规则非法: {instance_id}")
            if kind == "number" and display_format.get("unit", "none") not in valid_units:
                raise ValueError(f"显示格式单位非法: {instance_id}")
            if kind == "percent" and any(key in display_format for key in ("unit", "thousands_separator")):
                raise ValueError(f"百分比格式不支持数据单位或千分位: {instance_id}")
        return settings

    @field_validator("columns")
    @classmethod
    def normalize_column_instances(cls, columns: list[str | ColumnInstance]) -> list[ColumnInstance]:
        return _normalize_columns(columns)

    def validate_config_references(self) -> "ReportConfig":
        from app.reports.validation import validate_report_config_references
        return validate_report_config_references(self)