"""add role and user AI capability grants

Revision ID: 0111
Revises: 0110
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa


revision = "0111"
down_revision = "0110"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "role_ai_capability_grants",
        sa.Column("role_id", sa.BigInteger(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("capability_id", sa.String(length=96), primary_key=True),
    )
    op.create_table(
        "user_ai_capability_grants",
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("capability_id", sa.String(length=96), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("user_ai_capability_grants")
    op.drop_table("role_ai_capability_grants")
