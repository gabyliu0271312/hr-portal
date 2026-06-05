from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, JSON, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.db import Base


class AllocationScheme(Base):
    """成本分摊方案。

    config 结构与 Report.config 完全一致，复用同一套报表查询逻辑。
    唯一差异：result_table 指定写入哪张月度结果表。
    """
    __tablename__ = "allocation_schemes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 数据源：与 Report 保持一致，二选一
    table_name: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    dataset_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True
    )

    # 写入目标（月度结果表）
    result_table: Mapped[str] = mapped_column(
        String(64), nullable=False, default="emp_monthly_cost_result"
    )

    # 报表配置（与 Report.config 结构完全相同）
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AllocationRun(Base):
    """成本分摊执行历史。"""
    __tablename__ = "allocation_runs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    scheme_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("allocation_schemes.id", ondelete="CASCADE"), nullable=False
    )
    period_ym: Mapped[str] = mapped_column(String(6), nullable=False)  # YYYYMM
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")  # success/failed
    rows_written: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
