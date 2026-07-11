"""触发器注册表

用于管理所有触发器类型的元数据，使触发器扩展更规范。
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class TriggerMeta(BaseModel):
    """触发器元数据"""
    trigger_type: str
    name: str
    description: str
    config_schema: dict[str, Any] | None = None


TRIGGER_REGISTRY: dict[str, TriggerMeta] = {}


def register_trigger(meta: TriggerMeta) -> None:
    """注册触发器类型"""
    if meta.trigger_type in TRIGGER_REGISTRY:
        raise ValueError(f"触发器类型已注册: {meta.trigger_type}")
    TRIGGER_REGISTRY[meta.trigger_type] = meta


def get_trigger_meta(trigger_type: str) -> TriggerMeta | None:
    """获取触发器元数据"""
    return TRIGGER_REGISTRY.get(trigger_type)


def list_triggers() -> list[TriggerMeta]:
    """列出所有已注册的触发器类型"""
    return list(TRIGGER_REGISTRY.values())


# ===== 注册所有触发器类型 =====

def _register_default_triggers() -> None:
    """注册系统默认的触发器类型"""
    defaults = [
        TriggerMeta(
            trigger_type="scheduled_job_success",
            name="定时任务成功",
            description="门户定时任务执行成功时触发",
        ),
        TriggerMeta(
            trigger_type="scheduled_job_failed",
            name="定时任务失败",
            description="门户定时任务执行失败时触发",
        ),
        TriggerMeta(
            trigger_type="scheduled_job_finished",
            name="定时任务完成",
            description="门户定时任务执行完成时触发（无论成功失败）",
        ),
        TriggerMeta(
            trigger_type="report_run_success",
            name="报表运行成功",
            description="报表手动运行成功时触发",
        ),
        TriggerMeta(
            trigger_type="report_run_failed",
            name="报表运行失败",
            description="报表手动运行失败时触发",
        ),
        TriggerMeta(
            trigger_type="scheduled_report_success",
            name="报表定时运行成功",
            description="报表定时运行成功时触发",
        ),
        TriggerMeta(
            trigger_type="scheduled_report_failed",
            name="报表定时运行失败",
            description="报表定时运行失败时触发",
        ),
        # ===== Z01 ODS→DWD 自动化事件 =====
        TriggerMeta(
            trigger_type="datasource_sync_completed",
            name="数据源同步完成",
            description="DataSource 定时同步或手动拉取完成后触发",
        ),
        TriggerMeta(
            trigger_type="ods_table_data_changed",
            name="ODS 表数据变更",
            description="ODS 表数据发生变化时触发（接口同步/Excel上传/手动编辑/批量操作）",
        ),
        TriggerMeta(
            trigger_type="ods_table_metadata_changed",
            name="ODS 表元数据变更",
            description="ODS 表字段元数据（展示名/主键/敏感标记/可见性/排序/描述/字段增删/code变更）发生变化时触发",
        ),
        TriggerMeta(
            trigger_type="standardization_rule_changed",
            name="清洗规则变更",
            description="数据加工配方构建器中清洗规则新增/修改/删除时触发",
        ),
        TriggerMeta(
            trigger_type="ods_dwd_automation_config_changed",
            name="ODS→DWD 自动化配置变更",
            description="ODS→DWD 自动化规则配置新增/修改/删除时触发",
        ),
        # ===== Z03 L4 全自动级联事件 =====
        TriggerMeta(
            trigger_type="metric_saved",
            name="指标保存",
            description="指标定义保存或发布时触发",
        ),
        TriggerMeta(
            trigger_type="dwd_data_refreshed",
            name="DWD 数据刷新",
            description="DWD 表数据刷新完成后触发",
        ),
        TriggerMeta(
            trigger_type="dwd_schema_changed",
            name="DWD 结构变更",
            description="DWD 表字段结构变更时触发",
        ),
        TriggerMeta(
            trigger_type="dwd_metadata_changed",
            name="DWD 元数据变更",
            description="DWD 表元数据变更时触发",
        ),
        TriggerMeta(
            trigger_type="datasource_sync_completed",
            name="数据源同步完成 (L4)",
            description="DataSource 同步完成后 L4 检查下游指标",
        ),
        TriggerMeta(
            trigger_type="ods_table_metadata_changed",
            name="ODS 元数据变更 (L4)",
            description="ODS 表元数据变更后 L4 检查下游指标",
        ),
        TriggerMeta(
            trigger_type="standardization_rule_changed",
            name="清洗规则变更 (L4)",
            description="标准化规则变更后 L4 检查下游指标",
        ),
        TriggerMeta(
            trigger_type="ods_dwd_automation_config_changed",
            name="自动化配置变更 (L4)",
            description="ODS→DWD 自动化配置变更后 L4 检查",
        ),
    ]
    for meta in defaults:
        if meta.trigger_type not in TRIGGER_REGISTRY:
            TRIGGER_REGISTRY[meta.trigger_type] = meta


_register_default_triggers()
