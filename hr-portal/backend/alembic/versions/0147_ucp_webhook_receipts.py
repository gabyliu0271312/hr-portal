"""add UCP webhook receipts and scoped external event IDs

Revision ID: 0147
Revises: 0146
Create Date: 2026-07-29 13:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0147"
down_revision = "0146"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ucp_event", sa.Column("external_event_id", sa.String(length=128), nullable=True))
    op.create_index(
        "ix_ucp_event_resource_external_event",
        "ucp_event",
        ["resource_id", "external_event_id"],
        unique=True,
    )
    op.create_table(
        "ucp_webhook_ingress_receipt",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("resource_id", sa.BigInteger(), sa.ForeignKey("ucp_resource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nonce_hash", sa.String(length=64), nullable=True),
        sa.Column("external_event_id_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("resource_id", "nonce_hash", name="uq_ucp_webhook_receipt_resource_nonce"),
        sa.UniqueConstraint("resource_id", "external_event_id_hash", name="uq_ucp_webhook_receipt_resource_event"),
    )
    op.create_index("ix_ucp_webhook_receipt_expires", "ucp_webhook_ingress_receipt", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_ucp_webhook_receipt_expires", table_name="ucp_webhook_ingress_receipt")
    op.drop_table("ucp_webhook_ingress_receipt")
    op.drop_index("ix_ucp_event_resource_external_event", table_name="ucp_event")
    op.drop_column("ucp_event", "external_event_id")