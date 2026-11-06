"""Retain revoked calibration task generations without reusing their answers."""
from alembic import op
import sqlalchemy as sa

revision = "0293_performance_calibration_revocation"
down_revision = "0292_performance_reconsiderations"
branch_labels = None
depends_on = None


COLUMNS = ["project_id", "member_snapshot_id", "node_snapshot_id", "target_employee_no", "handler_ref", "task_kind", "phase_id"]


def upgrade():
    op.add_column("performance_node_tasks", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.drop_constraint("uq_performance_node_task_generation", "performance_node_tasks", type_="unique")
    op.create_index("uq_performance_node_task_generation", "performance_node_tasks", COLUMNS, unique=True, postgresql_where=sa.text("revoked_at IS NULL"))


def downgrade():
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM performance_node_tasks WHERE revoked_at IS NOT NULL)")).scalar():
        raise RuntimeError("Cannot downgrade: revoked task history must be preserved")
    op.drop_index("uq_performance_node_task_generation", table_name="performance_node_tasks")
    op.create_unique_constraint("uq_performance_node_task_generation", "performance_node_tasks", COLUMNS)
    op.drop_column("performance_node_tasks", "revoked_at")
