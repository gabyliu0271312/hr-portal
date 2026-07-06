# -*- coding: utf-8 -*-
"""数据仓库 二期 ORM 模型

Q00 契约：
- 表名/字段名以 spec.md §5.5/§5.6 为准，不得自行发明
- 权限统一走 require_op("warehouse.governance", action)
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import declarative_base, relationship

from app.core.db import Base


# ==================== warehouse_quality_rules (Q0301) ====================

class WarehouseQualityRule(Base):
    """数据质量规则定义

    spec.md §5.5:
    - asset_type: table/dataset/field
    - rule_type: not_null/unique/enum/date_format/referential_integrity/custom_sql
    - severity: info/warn/error
    """

    __tablename__ = "warehouse_quality_rules"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    asset_type = Column(String(16), nullable=False, comment="table/dataset/field")
    asset_code = Column(String(256), nullable=False, comment="资产编码：table_name/dataset_id/table.column")
    rule_type = Column(
        String(32), nullable=False,
        comment="not_null/unique/enum/date_format/referential_integrity/custom_sql",
    )
    rule_config = Column(JSON, nullable=False, default=dict, comment="规则参数 JSON")
    enabled = Column(Boolean, nullable=False, default=True, comment="是否启用")
    severity = Column(String(16), nullable=False, default="warn", comment="info/warn/error")
    last_run_status = Column(String(16), nullable=True, comment="最近运行状态: pass/warn/fail/error")
    last_run_at = Column(DateTime, nullable=True, comment="最近运行时间")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    runs = relationship("WarehouseQualityRun", back_populates="rule", lazy="selectin")


# ==================== warehouse_quality_runs (Q0302) ====================

class WarehouseQualityRun(Base):
    """数据质量规则执行记录

    spec.md §5.6
    """

    __tablename__ = "warehouse_quality_runs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    rule_id = Column(
        BigInteger,
        ForeignKey("warehouse_quality_rules.id", ondelete="SET NULL"),
        nullable=True,
        comment="关联质量规则 ID（删除规则后保留历史记录）",
    )
    status = Column(String(16), nullable=False, comment="pass/warn/fail/error")
    checked_count = Column(Integer, nullable=False, default=0, comment="检查总行数")
    failed_count = Column(Integer, nullable=False, default=0, comment="失败行数")
    sample_rows = Column(JSON, nullable=True, comment="失败样例数据")
    message = Column(Text, nullable=True, comment="运行消息/错误摘要")
    started_at = Column(DateTime, nullable=True, comment="开始时间")
    finished_at = Column(DateTime, nullable=True, comment="结束时间")

    rule = relationship("WarehouseQualityRule", back_populates="runs", lazy="selectin")


# ==================== warehouse_alert_rules (Q0605) ====================

class WarehouseAlertRule(Base):
    """数据仓库告警规则

    Q0605 占位：本期只实现规则保存，不实现真实通知发送。
    alert_type: quality_fail/sync_fail/build_fail/metric_fail
    """

    __tablename__ = "warehouse_alert_rules"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    alert_type = Column(String(32), nullable=False, comment="quality_fail/sync_fail/build_fail/metric_fail")
    target_code = Column(String(256), nullable=False, comment="目标资产编码")
    enabled = Column(Boolean, nullable=False, default=True)
    severity = Column(String(16), nullable=False, default="warn")
    notify_channels = Column(JSON, nullable=True, comment="通知渠道配置（占位）")
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== warehouse_model_versions (Q0507) ====================

class WarehouseModelVersion(Base):
    """模型版本历史

    Q0507: 每次 publish-v2 写入一条新版本记录；rollback 从 snapshot 恢复。
    """

    __tablename__ = "warehouse_model_versions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    model_id = Column(BigInteger, nullable=False, comment="关联 datasets.id")
    version = Column(Integer, nullable=False, comment="版本号")
    status = Column(String(16), nullable=False, default="published")
    snapshot = Column(JSON, nullable=False, comment="模型完整快照（tables/relations/output_fields/model_meta）")
    diff_snapshot = Column(JSON, nullable=True, comment="发布差异快照")
    published_by = Column(BigInteger, nullable=True, comment="发布人 user.id")
    published_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
