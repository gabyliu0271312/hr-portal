"""phase4 credential 强绑 system

Revision ID: 0069
Revises: 0068
Create Date: 2026-07-03 17:15
"""
from alembic import op
import sqlalchemy as sa


revision = "0069"
down_revision = "0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. 添加字段(nullable=True 兼容历史)
    op.add_column(
        "connector_credentials",
        sa.Column("system_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "connector_credentials",
        sa.Column("env_tag", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "connector_credentials",
        sa.Column("is_primary", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index(
        "ix_connector_credentials_system",
        "connector_credentials",
        ["system_id"],
    )
    op.create_foreign_key(
        "fk_connector_credentials_system",
        "connector_credentials",
        "connector_system",
        ["system_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    # 2. 同一 system 下只能有一个 primary 凭证
    op.create_index(
        "uq_connector_credentials_primary_per_system",
        "connector_credentials",
        ["system_id"],
        unique=True,
        postgresql_where=sa.text("is_primary = 1 AND system_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_connector_credentials_primary_per_system", table_name="connector_credentials")
    op.drop_constraint("fk_connector_credentials_system", "connector_credentials", type_="foreignkey")
    op.drop_index("ix_connector_credentials_system", table_name="connector_credentials")
    op.drop_column("connector_credentials", "is_primary")
    op.drop_column("connector_credentials", "env_tag")
    op.drop_column("connector_credentials", "system_id")
