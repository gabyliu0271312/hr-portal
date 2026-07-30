"""add transactional UCP outbox

Revision ID: 0150
Revises: 0149
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0150"
down_revision = "0149"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ucp_outbox_message",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("topic", sa.String(length=64), nullable=False),
        sa.Column("dedup_key", sa.String(length=192), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("topic", "dedup_key", name="uq_ucp_outbox_topic_dedup"),
    )
    op.create_index("ix_ucp_outbox_status_retry", "ucp_outbox_message", ["status", "next_attempt_at"])


def downgrade() -> None:
    op.drop_index("ix_ucp_outbox_status_retry", table_name="ucp_outbox_message")
    op.drop_table("ucp_outbox_message")
