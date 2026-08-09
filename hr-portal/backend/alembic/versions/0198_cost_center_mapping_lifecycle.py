"""成本中心 Mapping 周期生命周期。"""
from alembic import op
import sqlalchemy as sa

revision = "0198_cost_center_mapping_lifecycle"
down_revision = "0197_mapping_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cost_center_mapping_periods",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("period", sa.String(6), nullable=False),
        sa.Column("binding_id", sa.BigInteger, sa.ForeignKey("mapping_bindings.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("expected_version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("source_codes", sa.JSON, nullable=True),
        sa.Column("source_snapshot", sa.JSON, nullable=True),
        sa.Column("copied_from_period", sa.String(6), nullable=True),
        sa.Column("published_at", sa.DateTime, nullable=True),
        sa.Column("published_by", sa.String(128), nullable=True),
        sa.Column("publish_audit_id", sa.BigInteger, sa.ForeignKey("mapping_publish_audits.id"), nullable=True),
        sa.Column("rebuild_run_id", sa.BigInteger, sa.ForeignKey("mapping_rebuild_runs.id"), nullable=True),
        sa.Column("rebuild_status", sa.String(32), nullable=False, server_default="not_started"),
        sa.Column("notification_status", sa.String(32), nullable=False, server_default="not_started"),
        sa.Column("review_required", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("period", name="uq_cost_center_mapping_period"),
    )
    op.create_index("ix_cost_center_mapping_period_status", "cost_center_mapping_periods", ["status"])

    op.create_table(
        "cost_center_mapping_exceptions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("period_id", sa.BigInteger, sa.ForeignKey("cost_center_mapping_periods.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_code", sa.String(128), nullable=False),
        sa.Column("target_code", sa.String(128), nullable=False),
        sa.Column("attributes", sa.JSON, nullable=True),
        sa.Column("actor", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("period_id", "source_code", name="uq_cost_center_mapping_exception"),
    )
    op.create_index("ix_cost_center_mapping_exception_period", "cost_center_mapping_exceptions", ["period_id"])

    op.create_table(
        "cost_center_mapping_diffs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("period_id", sa.BigInteger, sa.ForeignKey("cost_center_mapping_periods.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_code", sa.String(128), nullable=False),
        sa.Column("diff_type", sa.String(32), nullable=False),
        sa.Column("previous_value", sa.JSON, nullable=True),
        sa.Column("current_value", sa.JSON, nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("confirmed_by", sa.String(128), nullable=True),
        sa.Column("confirmed_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_cost_center_mapping_diff_period", "cost_center_mapping_diffs", ["period_id", "status"])

    op.create_table(
        "cost_center_mapping_notifications",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("period_id", sa.BigInteger, sa.ForeignKey("cost_center_mapping_periods.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notification_key", sa.String(256), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text, nullable=True),
        sa.Column("event_id", sa.String(128), nullable=True),
        sa.Column("sent_at", sa.DateTime, nullable=True),
        sa.Column("next_retry_at", sa.DateTime, nullable=True),
        sa.Column("exhausted_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("period_id", "notification_key", name="uq_cost_center_mapping_notification"),
    )
    op.create_index("ix_cost_center_mapping_notification_status", "cost_center_mapping_notifications", ["status"])


def downgrade() -> None:
    op.drop_table("cost_center_mapping_notifications")
    op.drop_table("cost_center_mapping_diffs")
    op.drop_table("cost_center_mapping_exceptions")
    op.drop_table("cost_center_mapping_periods")
