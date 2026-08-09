"""Create performance cycle configuration and lifecycle metadata.

Revision ID: 0182_performance_cycles
Revises: 0181_merge_enum_default_heads
Create Date: 2026-08-07
"""
from alembic import op
import sqlalchemy as sa

revision = "0182_performance_cycles"
down_revision = "0181_merge_enum_default_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performance_cycles",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("cycle_ref", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=False, server_default="zh-CN"),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("period_type", sa.String(length=32), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lock_rule", sa.String(length=16), nullable=False),
        sa.Column("lock_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pre_lock_sync_mode", sa.String(length=16), nullable=False, server_default="MANUAL"),
        sa.Column("leaver_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("leaver_start_date", sa.Date(), nullable=True),
        sa.Column("leaver_end_date", sa.Date(), nullable=True),
        sa.Column("leaver_participation_mode", sa.String(length=16), nullable=False, server_default="CREATE_TASK"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="DRAFT"),
        sa.Column("created_by_type", sa.String(length=32), nullable=False),
        sa.Column("created_by_ref", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("lock_rule IN ('IMMEDIATE', 'SCHEDULED')", name="ck_performance_cycle_lock_rule"),
        sa.CheckConstraint("pre_lock_sync_mode IN ('MANUAL', 'AUTO_DAILY')", name="ck_performance_cycle_pre_lock_sync_mode"),
        sa.CheckConstraint("leaver_participation_mode IN ('CREATE_TASK', 'REPORT_ONLY')", name="ck_performance_cycle_leaver_mode"),
        sa.CheckConstraint("status IN ('DRAFT', 'LOCKED')", name="ck_performance_cycle_status"),
        sa.CheckConstraint("end_at > start_at", name="ck_performance_cycle_end_after_start"),
        sa.CheckConstraint("lock_rule = 'IMMEDIATE' OR lock_at IS NOT NULL", name="ck_performance_cycle_scheduled_lock_at"),
        sa.UniqueConstraint("cycle_ref", name="uq_performance_cycles_cycle_ref"),
    )
    op.create_index("ix_performance_cycles_start_at", "performance_cycles", ["start_at"])
    op.create_index("ix_performance_cycles_lock_at", "performance_cycles", ["lock_at"])


def downgrade() -> None:
    op.drop_index("ix_performance_cycles_lock_at", table_name="performance_cycles")
    op.drop_index("ix_performance_cycles_start_at", table_name="performance_cycles")
    op.drop_table("performance_cycles")