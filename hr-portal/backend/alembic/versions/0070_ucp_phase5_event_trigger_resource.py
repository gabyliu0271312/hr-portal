"""phase5 event_trigger 加 source_resource_id (Phase 5-2)

Revision ID: 0070
Revises: 0069
Create Date: 2026-07-03 18:50
"""
from alembic import op
import sqlalchemy as sa


revision = "0070"
down_revision = "0069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 触发器按"数据资源"粒度订阅事件, 不再只按模糊 event_source 字符串
    op.add_column(
        "connector_event_trigger",
        sa.Column("source_resource_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "connector_event_trigger",
        sa.Column("source_system_code", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_connector_event_trigger_resource",
        "connector_event_trigger",
        ["source_resource_id"],
    )
    op.create_index(
        "ix_connector_event_trigger_system_code",
        "connector_event_trigger",
        ["source_system_code"],
    )
    op.create_foreign_key(
        "fk_connector_event_trigger_resource",
        "connector_event_trigger",
        "connector_resource",
        ["source_resource_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_connector_event_trigger_resource", "connector_event_trigger", type_="foreignkey")
    op.drop_index("ix_connector_event_trigger_system_code", table_name="connector_event_trigger")
    op.drop_index("ix_connector_event_trigger_resource", table_name="connector_event_trigger")
    op.drop_column("connector_event_trigger", "source_system_code")
    op.drop_column("connector_event_trigger", "source_resource_id")
