"""Persist cycle comparison rules, task state and notification outbox."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0307_performance_comparison"
down_revision = "0306_salary_allocation_result_menu"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_cycles", sa.Column("semester_diff_rules", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("performance_cycles", sa.Column("comparison_rules_revision", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint("ck_pm_cycle_comparison_rules", "performance_cycles", "CASE WHEN jsonb_typeof(semester_diff_rules) = 'array' THEN jsonb_array_length(semester_diff_rules) <= 1 ELSE false END")
    op.create_check_constraint("ck_pm_cycle_comparison_revision", "performance_cycles", "comparison_rules_revision >= 0")
    op.add_column("performance_node_tasks", sa.Column("comparison_state", postgresql.JSONB(none_as_null=True), nullable=True))
    op.create_table(
        "performance_comparison_notifications",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("cycle_ref", sa.String(64), nullable=False),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("performance_projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("task_id", sa.BigInteger(), sa.ForeignKey("performance_node_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recipient_task_id", sa.BigInteger(), sa.ForeignKey("performance_node_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recipient_ref", sa.String(128), nullable=False),
        sa.Column("rule_id", sa.String(64), nullable=False),
        sa.Column("event_key", sa.String(256), nullable=False),
        sa.Column("event_sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_log_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("event_key", name="uq_pm_comparison_notification_event"),
        sa.CheckConstraint("status IN ('pending', 'dispatching', 'sent', 'retrying', 'skipped', 'unknown')", name="ck_pm_comparison_notification_status"),
        sa.CheckConstraint("attempts >= 0 AND event_sequence >= 0", name="ck_pm_comparison_notification_counts"),
    )
    op.create_index("ix_pm_comparison_notification_due", "performance_comparison_notifications", ["status", "next_retry_at"])
    op.create_index("ix_pm_comparison_notification_rule", "performance_comparison_notifications", ["cycle_ref", "rule_id"])


def downgrade():
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM performance_comparison_notifications)
                OR EXISTS (SELECT 1 FROM performance_node_tasks WHERE comparison_state IS NOT NULL)
                OR EXISTS (SELECT 1 FROM performance_cycles WHERE semester_diff_rules <> '[]'::jsonb OR comparison_rules_revision > 0)
                OR EXISTS (SELECT 1 FROM performance_projects WHERE settings ? 'comparison_rules_snapshot')
                OR EXISTS (SELECT 1 FROM performance_audit_events WHERE event_type LIKE 'PERFORMANCE_COMPARISON_%' OR after_state ? 'comparison' OR after_state ? 'comparison_state' OR before_state ? 'comparison_state')
            THEN
                RAISE EXCEPTION 'Comparison evidence exists; downgrade would discard history';
            END IF;
        END $$;
    """)
    op.drop_table("performance_comparison_notifications")
    op.drop_column("performance_node_tasks", "comparison_state")
    op.drop_constraint("ck_pm_cycle_comparison_revision", "performance_cycles", type_="check")
    op.drop_constraint("ck_pm_cycle_comparison_rules", "performance_cycles", type_="check")
    op.drop_column("performance_cycles", "comparison_rules_revision")
    op.drop_column("performance_cycles", "semester_diff_rules")
