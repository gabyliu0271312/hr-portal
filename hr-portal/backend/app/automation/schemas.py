"""自动化规则 Pydantic Schema"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ===== Trigger 配置 =====

class ScheduleTriggerConfig(BaseModel):
    """定时触发器配置 — trigger_type='schedule' 专用"""
    schedule_type: str = "recurring"  # once | recurring
    start_time: str | None = None     # ISO datetime, 首次执行时间
    rrule: str | None = None          # RFC 5545 RRULE, 如 FREQ=DAILY;INTERVAL=1
    timezone: str = "Asia/Shanghai"


class TriggerConfig(BaseModel):
    """触发器配置，可携带业务相关筛选（如指定 report_id）。"""
    model_config = {"extra": "allow"}
    biz_id: str | None = None  # 如果只关注某个特定业务 ID，填此字段


# ===== Condition =====

class ConditionItem(BaseModel):
    """条件项，一期保留结构，不实现复杂引擎。"""
    field: str
    op: str = "eq"
    value: Any = None


# ===== Action 配置 =====

class ActionConfig(BaseModel):
    """动作配置，type 决定调用哪个 Action 实现。"""
    type: str  # 如 feishu_send_message
    name: str = ""
    enabled: bool = True
    run_on_error: bool = False
    config: dict[str, Any] = Field(default_factory=dict)


# ===== Rule =====

class AutomationRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    biz_type: str | None = None
    trigger_type: str | None = None  # 草稿模式可为空
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    condition_config: list[ConditionItem] = Field(default_factory=list)
    actions_config: list[ActionConfig] = Field(default_factory=list)  # 草稿模式可为空
    enabled: bool = True
    source: Literal["manual", "ai_generated", "system"] = "manual"
    source_artifact_id: int | None = None


class AutomationRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_type: str | None = None
    trigger_config: dict[str, Any] | None = None
    condition_config: list[ConditionItem] | None = None
    actions_config: list[ActionConfig] | None = None
    enabled: bool | None = None


class AutomationRuleOut(BaseModel):
    id: int
    name: str
    description: str | None
    biz_type: str | None
    trigger_type: str
    trigger_config: dict[str, Any]
    condition_config: list
    actions_config: list
    enabled: bool
    source: str
    source_artifact_id: int | None
    created_by: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ===== Execution =====

class AutomationExecutionOut(BaseModel):
    id: int
    rule_id: int
    event_id: str | None
    trigger_type: str
    biz_type: str | None
    biz_id: str | None
    status: str
    started_at: datetime
    finished_at: datetime | None
    error_message: str | None

    model_config = {"from_attributes": True}


class AutomationActionExecutionOut(BaseModel):
    id: int
    execution_id: int
    action_index: int
    action_type: str
    status: str
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
