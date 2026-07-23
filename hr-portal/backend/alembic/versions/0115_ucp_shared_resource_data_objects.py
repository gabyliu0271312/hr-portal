"""add shared connector type and reusable UCP resource data objects

Revision ID: 0115
Revises: 0114
Create Date: 2026-07-23
"""
from alembic import op
import sqlalchemy as sa


revision = "0115"
down_revision = "0114"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ucp_resource", sa.Column("connector_type", sa.String(64), nullable=True))
    op.create_index("ix_ucp_resource_connector_type", "ucp_resource", ["connector_type"])
    op.create_table(
        "ucp_resource_data_object",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("resource_id", sa.BigInteger(), sa.ForeignKey("ucp_resource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("connector_type", sa.String(64), nullable=False),
        sa.Column("object_code", sa.String(64), nullable=False),
        sa.Column("object_name", sa.String(128), nullable=False),
        sa.Column("object_config", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("field_mapping", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("incremental_config", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("is_active", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("resource_id", "object_code", name="uq_ucp_resource_data_object_code"),
    )
    op.create_index("ix_ucp_resource_data_object_active", "ucp_resource_data_object", ["resource_id", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_ucp_resource_data_object_active", table_name="ucp_resource_data_object")
    op.drop_table("ucp_resource_data_object")
    op.drop_index("ix_ucp_resource_connector_type", table_name="ucp_resource")
    op.drop_column("ucp_resource", "connector_type")
