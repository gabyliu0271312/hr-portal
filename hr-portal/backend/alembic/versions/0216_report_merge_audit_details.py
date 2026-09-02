"""Add paged system log details for report merge diffs."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0216_report_merge_audit_details"
down_revision = "0215_performance_sub_question_parent_optional"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_log_details",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("system_log_id", sa.BigInteger(), nullable=False),
        sa.Column("detail_type", sa.String(length=64), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["system_log_id"], ["system_logs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_system_log_details_log_id",
        "system_log_details",
        ["system_log_id", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_system_log_details_log_id", table_name="system_log_details")
    op.drop_table("system_log_details")
