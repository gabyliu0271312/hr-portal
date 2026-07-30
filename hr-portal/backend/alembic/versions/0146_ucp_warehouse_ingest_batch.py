"""add UCP warehouse ingest batches

Revision ID: 0146
Revises: 0145
Create Date: 2026-07-29 11:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0146"
down_revision = "0145"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ucp_warehouse_ingest_batch",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "resource_id",
            sa.BigInteger(),
            sa.ForeignKey("ucp_resource.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("target_asset", sa.String(length=64), nullable=False),
        sa.Column("event_id", sa.String(length=128), nullable=False),
        sa.Column("batch_id", sa.String(length=128), nullable=False),
        sa.Column("period_value", sa.String(length=64), nullable=True),
        sa.Column("payload_checksum", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="RECEIVED"),
        sa.Column("received_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("written_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pipeline_run_id", sa.String(length=64), nullable=True),
        sa.Column("trace_id", sa.String(length=64), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("resource_id", "event_id", name="uq_ucp_ingest_batch_resource_event"),
        sa.UniqueConstraint("resource_id", "target_asset", "batch_id", name="uq_ucp_ingest_batch_resource_asset_batch"),
    )
    op.create_index(
        "ix_ucp_ingest_batch_asset_period_status",
        "ucp_warehouse_ingest_batch",
        ["target_asset", "period_value", "status"],
    )
    op.create_index(
        "ix_ucp_ingest_batch_resource_received",
        "ucp_warehouse_ingest_batch",
        ["resource_id", "received_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ucp_ingest_batch_resource_received", table_name="ucp_warehouse_ingest_batch")
    op.drop_index("ix_ucp_ingest_batch_asset_period_status", table_name="ucp_warehouse_ingest_batch")
    op.drop_table("ucp_warehouse_ingest_batch")
