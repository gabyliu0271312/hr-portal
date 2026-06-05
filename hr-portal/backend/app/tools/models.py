"""HR 小工具相关模型"""
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class CompensationCap(Base):
    __tablename__ = "compensation_caps"
    __table_args__ = (
        UniqueConstraint("region", "effective_start", "effective_end", name="uq_comp_cap_period"),
        Index("ix_comp_caps_region_period", "region", "effective_start", "effective_end"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    effective_start: Mapped[date] = mapped_column(Date, nullable=False)
    effective_end: Mapped[date] = mapped_column(Date, nullable=False)
    cap_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class InstallmentRule(Base):
    """补偿金分期支付规则（每行 = 一期）。

    取整算法固定为「前面各期向下取整、最后一期取剩余」，保证各期合计 = 补偿总额。
    期数/比例/付款月份偏移/付款日均可在「补偿金规则维护」页配置。
    """

    __tablename__ = "installment_rules"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    period_no: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)  # 期号 1,2,3...
    ratio: Mapped[float] = mapped_column(Numeric(6, 3), nullable=False)  # 该期比例（百分比，如 25.000）
    months_after: Mapped[int] = mapped_column(Integer, nullable=False)  # 离职后第几个月付款
    pay_day: Mapped[int] = mapped_column(Integer, nullable=False, default=15)  # 该月几号付款
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
