"""add reusable Feishu Bitable table configurations

Revision ID: 0113
Revises: 0112
Create Date: 2026-07-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0113"
down_revision = "0112"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ucp_bitable_table_config",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("resource_id", sa.BigInteger(), sa.ForeignKey("ucp_resource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("object_code", sa.String(64), nullable=False),
        sa.Column("object_name", sa.String(128), nullable=False),
        sa.Column("app_token", sa.String(128), nullable=False),
        sa.Column("table_id", sa.String(128), nullable=False),
        sa.Column("view_id", sa.String(128), nullable=True),
        sa.Column("field_mapping", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("filter_config", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("page_size", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("max_records", sa.Integer(), nullable=False, server_default="10000"),
        sa.Column("is_active", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("resource_id", "object_code", name="uq_ucp_bitable_table_resource_code"),
    )
    op.create_index("ix_ucp_bitable_table_resource_active", "ucp_bitable_table_config", ["resource_id", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_ucp_bitable_table_resource_active", table_name="ucp_bitable_table_config")
    op.drop_table("ucp_bitable_table_config")