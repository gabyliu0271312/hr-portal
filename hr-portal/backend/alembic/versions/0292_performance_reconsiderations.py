"""Persist result reconsiderations and pending task notifications."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0292_performance_reconsiderations"
down_revision = "0291_identity_switch_delivery_mode"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_result_reconsiderations",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("performance_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_snapshot_id", sa.BigInteger(), sa.ForeignKey("performance_project_member_snapshots.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("node_snapshot_id", sa.BigInteger(), sa.ForeignKey("performance_project_node_snapshots.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("employee_no", sa.String(64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("result_version", postgresql.JSONB(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "employee_no", name="uq_pm_reconsideration_person"),
    )
    op.create_table(
        "performance_reconsideration_notifications",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("task_id", sa.BigInteger(), sa.ForeignKey("performance_node_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("task_id", name="uq_pm_reconsideration_notification_task"),
        sa.CheckConstraint("status IN ('pending', 'sent', 'retrying', 'skipped')", name="ck_pm_reconsideration_notification_status"),
    )
    op.create_index("ix_pm_reconsideration_notification_due", "performance_reconsideration_notifications", ["status", "next_retry_at"])


def downgrade():
    op.drop_table("performance_reconsideration_notifications")
    op.drop_table("performance_result_reconsiderations")
