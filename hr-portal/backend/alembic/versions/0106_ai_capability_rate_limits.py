"""add persistent AI capability rate limits

Revision ID: 0106
Revises: 0105
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0106"
down_revision = "0105"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_capability_rate_limits",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("capability_id", sa.String(length=64), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("request_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "capability_id", name="uq_ai_capability_rate_limits_user_capability"),
    )
    op.create_index(
        "ix_ai_capability_rate_limits_window",
        "ai_capability_rate_limits",
        ["window_started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_capability_rate_limits_window", table_name="ai_capability_rate_limits")
    op.drop_table("ai_capability_rate_limits")
