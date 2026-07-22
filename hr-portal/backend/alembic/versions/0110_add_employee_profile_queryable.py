"""add employee profile queryable capability flag

Revision ID: 0110
Revises: 0109
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa


revision = "0110"
down_revision = "0109"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employee_profile_field_settings",
        sa.Column("is_queryable", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("employee_profile_field_settings", "is_queryable")
