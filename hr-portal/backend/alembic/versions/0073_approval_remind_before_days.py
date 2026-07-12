"""Add missing remind_before_days column to approval_request

Revision ID: 0073
Revises: 0072
Create Date: 2026-07-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_col = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.columns "
            "WHERE table_name = 'approval_request' AND column_name = 'remind_before_days')"
        )
    ).scalar()
    if not has_col:
        op.add_column(
            "approval_request",
            sa.Column("remind_before_days", sa.Integer(), nullable=True, server_default="7"),
        )


def downgrade() -> None:
    conn = op.get_bind()
    has_col = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.columns "
            "WHERE table_name = 'approval_request' AND column_name = 'remind_before_days')"
        )
    ).scalar()
    if has_col:
        op.drop_column("approval_request", "remind_before_days")
