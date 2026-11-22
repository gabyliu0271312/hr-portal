"""Persist independent completion for frozen calibration rule responsibilities."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0322_pm_calibration_completion"
down_revision = "0321_pm_pre_lock_adjustment"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_node_tasks", sa.Column("calibration_rule_completions", postgresql.JSONB(none_as_null=True), nullable=True))


def downgrade():
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM performance_node_tasks WHERE calibration_rule_completions IS NOT NULL)")).scalar():
        raise RuntimeError("CALIBRATION_COMPLETION_HISTORY_EXISTS")
    op.drop_column("performance_node_tasks", "calibration_rule_completions")
