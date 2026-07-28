"""add audited privileged event payload access

Revision ID: 0126
Revises: 0125
Create Date: 2026-07-25
"""
from alembic import op
import sqlalchemy as sa


revision = "0126"
down_revision = "0125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ucp_event_payload_access_audit",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.BigInteger(), sa.ForeignKey("ucp_event.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_uuid", sa.String(length=128), nullable=False),
        sa.Column("operator", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ucp_event_payload_audit_event", "ucp_event_payload_access_audit", ["event_id"])
    op.create_index("ix_ucp_event_payload_audit_created", "ucp_event_payload_access_audit", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ucp_event_payload_audit_created", table_name="ucp_event_payload_access_audit")
    op.drop_index("ix_ucp_event_payload_audit_event", table_name="ucp_event_payload_access_audit")
    op.drop_table("ucp_event_payload_access_audit")
