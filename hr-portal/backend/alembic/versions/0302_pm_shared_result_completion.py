"""Persist shared formal results, private drafts and explicit calibration completion."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0302_pm_shared_result_completion"
down_revision = "0301_pm_reconsideration_result"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_project_members", sa.Column("shared_result_state", postgresql.JSONB(none_as_null=True), nullable=True))
    op.add_column("performance_node_tasks", sa.Column("actor_drafts", postgresql.JSONB(none_as_null=True), nullable=True))
    op.add_column("performance_node_tasks", sa.Column("calibration_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("performance_node_tasks", sa.Column("calibration_completed_by", sa.String(128), nullable=True))


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT EXISTS (SELECT 1 FROM performance_project_members WHERE shared_result_state IS NOT NULL) OR EXISTS (SELECT 1 FROM performance_node_tasks WHERE actor_drafts IS NOT NULL OR calibration_completed_at IS NOT NULL)")).scalar():
        raise RuntimeError("SHARED_RESULT_HISTORY_EXISTS")
    for column in ("calibration_completed_by", "calibration_completed_at", "actor_drafts"):
        op.drop_column("performance_node_tasks", column)
    op.drop_column("performance_project_members", "shared_result_state")
