"""phase5 monitor 加 system_id / resource_id 维度 (Phase 5-3)

Revision ID: 0071
Revises: 0070
Create Date: 2026-07-03 19:10
"""
from alembic import op
import sqlalchemy as sa


revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. pipeline execution 加 system_id / resource_id
    op.add_column(
        "connector_pipeline_execution",
        sa.Column("system_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "connector_pipeline_execution",
        sa.Column("resource_id", sa.BigInteger(), nullable=True),
    )
    op.create_index(
        "ix_pipeline_exec_system",
        "connector_pipeline_execution",
        ["system_id"],
    )
    op.create_index(
        "ix_pipeline_exec_resource",
        "connector_pipeline_execution",
        ["resource_id"],
    )
    op.create_foreign_key(
        "fk_pipeline_exec_resource",
        "connector_pipeline_execution",
        "connector_resource",
        ["resource_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 2. event 加 system_code / resource_id (与 trigger 的语义对齐)
    op.add_column(
        "ucp_event",
        sa.Column("system_code", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "ucp_event",
        sa.Column("resource_id", sa.BigInteger(), nullable=True),
    )
    op.create_index(
        "ix_ucp_event_system_code",
        "ucp_event",
        ["system_code"],
    )
    op.create_index(
        "ix_ucp_event_resource",
        "ucp_event",
        ["resource_id"],
    )
    op.create_foreign_key(
        "fk_ucp_event_resource",
        "ucp_event",
        "connector_resource",
        ["resource_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_ucp_event_resource", "ucp_event", type_="foreignkey")
    op.drop_index("ix_ucp_event_resource", table_name="ucp_event")
    op.drop_index("ix_ucp_event_system_code", table_name="ucp_event")
    op.drop_column("ucp_event", "resource_id")
    op.drop_column("ucp_event", "system_code")

    op.drop_constraint("fk_pipeline_exec_resource", "connector_pipeline_execution", type_="foreignkey")
    op.drop_index("ix_pipeline_exec_resource", table_name="connector_pipeline_execution")
    op.drop_index("ix_pipeline_exec_system", table_name="connector_pipeline_execution")
    op.drop_column("connector_pipeline_execution", "resource_id")
    op.drop_column("connector_pipeline_execution", "system_id")
