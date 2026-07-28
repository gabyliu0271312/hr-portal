"""add metadata-only webhook ingress attempt audit

Revision ID: 0125
Revises: 0124
Create Date: 2026-07-25
"""
from alembic import op
import sqlalchemy as sa


revision = "0125"
down_revision = "0124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ucp_webhook_ingress_attempt",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("resource_id", sa.BigInteger(), sa.ForeignKey("ucp_resource.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resource_code", sa.String(length=64), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("reason_code", sa.String(length=64), nullable=True),
        sa.Column("event_id", sa.String(length=128), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ucp_webhook_attempt_received", "ucp_webhook_ingress_attempt", ["received_at"])
    op.create_index("ix_ucp_webhook_attempt_resource_outcome", "ucp_webhook_ingress_attempt", ["resource_id", "outcome"])


def downgrade() -> None:
    op.drop_index("ix_ucp_webhook_attempt_resource_outcome", table_name="ucp_webhook_ingress_attempt")
    op.drop_index("ix_ucp_webhook_attempt_received", table_name="ucp_webhook_ingress_attempt")
    op.drop_table("ucp_webhook_ingress_attempt")
