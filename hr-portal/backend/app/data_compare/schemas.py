"""数据对比 CompareSpec schema + API 请求/响应模型.

CompareSpec = 模型输出的结构化 JSON（不是 SQL），后端编译器填参。
三层结构：通用信封（所有对比类型的公共契约） + 专属参数（每个引擎独立字段）。
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator


# ──────────────────────────────────────────────
# 封闭枚举
# ──────────────────────────────────────────────


class PrefilterOp(str, Enum):
    """prefilter 操作符封闭枚举 —— 不是任意 SQL 表达式，保证安全。"""

    EQ = "eq"
    NE = "ne"
    IN = "in"
    NOT_IN = "not_in"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"
    CONTAINS = "contains"
    BETWEEN = "between"
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"


class FieldCompareMode(str, Enum):
    """字段对比模式"""

    EXACT = "exact"  # 精确比对
    TRIM = "trim"  # 去空格 + 大小写不敏感
    NUMERIC = "numeric"  # 数值容差比对


class AggFunction(str, Enum):
    """金额引擎支持的聚合函数"""

    SUM = "sum"
    COUNT = "count"
    AVG = "avg"


class ToleranceType(str, Enum):
    """容差类型"""

    ABSOLUTE = "absolute"
    PERCENT = "percent"


class CompareType(str, Enum):
    ROSTER = "roster"
    FIELD = "field"
    AMOUNT = "amount"


# ──────────────────────────────────────────────
# 通用信封
# ──────────────────────────────────────────────


class Prefilter(BaseModel):
    """单条前置过滤条件。op 是封闭枚举，value 走参数化绑定。"""

    column: str = Field(..., description="过滤字段（必须在 table_columns 白名单中）")
    op: PrefilterOp
    value: Any | None = None


class DataSource(BaseModel):
    """对比数据源定义"""

    table: str = Field(..., description="表名（必须存在于 registered_tables）")
    period: str | None = Field(None, description="月度表的期间 YYYYMM，非月度表为 null")
    prefilter: list[Prefilter] = Field(default_factory=list, description="对比前的行筛选条件")


class OutputConfig(BaseModel):
    """结果呈现控制"""

    only_diff: bool = Field(True, description="是否只看差异")
    group_count_by: str | None = Field(None, description="差异按某维度做计数分布")
    max_detail: int = Field(200, ge=1, le=1000, description="差异明细最大条数")


class DisplayConfig(BaseModel):
    """结果面板展示控制。

    该配置允许自然语言提示词影响展示层，但只控制安全的 UI 选项：
    - 采用哪类展示模板；
    - 明细表展示哪些列、强调哪些列；
    - 是否显示解释区/上下文区；
    - 明细排序和标题/说明。
    """

    template: Literal["auto", "roster", "field", "amount"] = Field(
        "auto", description="结果展示模板，auto 表示按 compare_type 自动选择"
    )
    title: str | None = Field(None, max_length=120, description="结果面板标题")
    subtitle: str | None = Field(None, max_length=300, description="结果面板副标题/说明")
    columns: list[str] = Field(default_factory=list, description="明细表优先展示列；为空则前端按类型自动选择")
    highlight_columns: list[str] = Field(default_factory=list, description="需要高亮的明细列")
    hidden_columns: list[str] = Field(default_factory=list, description="需要隐藏的明细列")
    primary_metric: str | None = Field(None, description="首要关注指标，如 diff_count/amount_diff/only_in_a_count")
    show_context: bool = Field(True, description="是否展示来源A/B、期间、耗时等上下文")
    show_explanation: bool = Field(True, description="是否展示差异解释")
    sort_by: str | None = Field(None, description="明细默认排序字段")
    sort_order: Literal["asc", "desc"] = "desc"


# ──────────────────────────────────────────────
# 三类引擎专属参数
# ──────────────────────────────────────────────


class RosterSpec(BaseModel):
    """名单对比专属参数"""

    direction: Literal["both", "only_in_a", "only_in_b"] = Field(
        "both", description="对比方向: both=双向, only_in_a=只看A缺B, only_in_b=只看B缺A"
    )
    display_fields: list[str] = Field(
        default_factory=lambda: ["employee_no", "employee_name"],
        description="差异行展示哪些列",
    )


class FieldPair(BaseModel):
    """字段对比中的一对映射。field_a / field_b 可以是不同列名。"""

    field_a: str = Field(..., description="A 表字段名")
    field_b: str = Field(..., description="B 表字段名")
    mode: FieldCompareMode = Field(FieldCompareMode.EXACT, description="对比模式")
    tolerance: float | None = Field(None, description="数值容差（仅 numeric 模式生效）")


class FieldSpec(BaseModel):
    """字段对比专属参数"""

    pairs: list[FieldPair] = Field(..., min_length=1, description="至少一对字段映射")


class MetricDef(BaseModel):
    """金额引擎的单个度量定义"""

    agg: AggFunction = Field(AggFunction.SUM, description="聚合函数")
    field: str = Field(..., description="金额字段名")


class ToleranceDef(BaseModel):
    """容差定义"""

    type: ToleranceType = Field(ToleranceType.ABSOLUTE)
    value: float = Field(0.0, ge=0.0)


class AmountSpec(BaseModel):
    """金额对比专属参数"""

    metric_a: MetricDef
    metric_b: MetricDef
    group_by: list[str] = Field(..., min_length=1, description="汇总维度（支持多维）")
    tolerance: ToleranceDef = Field(default_factory=ToleranceDef)


# ──────────────────────────────────────────────
# CompareSpec 完整信封（模型解析输出）
# ──────────────────────────────────────────────


class CompareSpec(BaseModel):
    """LLM 从自然语言解析出的对比参数 —— 最终版本。

    模型只输出此 JSON，完全不碰 SQL。
    后端 CompareTemplateEngine 根据 compare_type 选模板 → 编译 SQL。
    """

    compare_type: CompareType

    source_a: DataSource
    source_b: DataSource

    join_keys: list[str] = Field(..., min_length=1, description="关联键（支持多字段复合键）")
    output: OutputConfig = Field(default_factory=OutputConfig)
    display: DisplayConfig = Field(default_factory=DisplayConfig)

    # 以下三个互斥 —— 根据 compare_type 选填一个
    roster: RosterSpec | None = None
    field: FieldSpec | None = None
    amount: AmountSpec | None = None

    @field_validator("roster")
    @classmethod
    def roster_required_for_roster_type(cls, v, info):
        if info.data.get("compare_type") == CompareType.ROSTER and v is None:
            raise ValueError("compare_type=roster 时必须提供 roster 参数")
        return v

    @field_validator("field")
    @classmethod
    def field_required_for_field_type(cls, v, info):
        if info.data.get("compare_type") == CompareType.FIELD and v is None:
            raise ValueError("compare_type=field 时必须提供 field 参数")
        return v

    @field_validator("amount")
    @classmethod
    def amount_required_for_amount_type(cls, v, info):
        if info.data.get("compare_type") == CompareType.AMOUNT and v is None:
            raise ValueError("compare_type=amount 时必须提供 amount 参数")
        return v


# ──────────────────────────────────────────────
# API Request / Response
# ──────────────────────────────────────────────


class SkillCreate(BaseModel):
    """创建技能请求体"""

    name: str = Field(..., min_length=1, max_length=256)
    description: str | None = None
    instruction: str = Field(..., min_length=1, description="用户原始需求描述")
    params: dict = Field(..., description="CompareSpec JSON 结构化参数")
    status: Literal["draft", "active"] = "draft"


class SkillUpdate(BaseModel):
    """更新技能请求体"""

    name: str | None = Field(None, min_length=1, max_length=256)
    description: str | None = None
    instruction: str | None = Field(None, min_length=1)
    params: dict | None = None
    status: Literal["draft", "active", "archived"] | None = None


class SkillOut(BaseModel):
    """技能列表/详情响应"""

    id: int
    name: str
    description: str | None
    skill_type: str
    instruction: str
    params: dict
    status: str
    source: str
    last_run_at: datetime | None
    last_run_result: dict | None
    run_count: int
    created_by: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SkillListParams(BaseModel):
    """技能列表查询参数"""

    skill_type: str | None = "data_compare"
    status: str | None = None
    limit: int = Field(50, ge=1, le=200)
    offset: int = Field(0, ge=0)


class CompareResultSummary(BaseModel):
    """对比结果汇总"""

    total_compared: int = 0
    matched_count: int = 0
    diff_count: int = 0
    only_in_a_count: int = 0
    only_in_b_count: int = 0
    total_amount_a: float | None = None
    total_amount_b: float | None = None
    amount_diff: float | None = None


class CompareResult(BaseModel):
    """对比完整结果"""

    compare_type: str
    table_a: str
    table_b: str
    period_a: str | None = None
    period_b: str | None = None
    status: str = "consistent"  # consistent / partial_diff / significant_diff
    summary: CompareResultSummary
    details: list[dict] = Field(default_factory=list, description="差异明细（最多 max_detail 条）")
    conclusion: str = ""
    duration_ms: int | None = None
    display: DisplayConfig = Field(default_factory=DisplayConfig)


class SkillInvokeResponse(BaseModel):
    """直接执行对比的响应"""

    skill_id: int
    result: CompareResult
