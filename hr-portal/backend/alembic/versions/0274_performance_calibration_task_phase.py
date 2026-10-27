"""Scope calibration tasks to a frozen project phase."""
from alembic import op
import sqlalchemy as sa

revision = "0274_performance_calibration_task_phase"
down_revision = "0273_org_hierarchy_standard_fields"
branch_labels = None
depends_on = None

KEY = ["project_id", "member_snapshot_id", "node_snapshot_id", "target_employee_no", "handler_ref", "task_kind"]


def upgrade():
    op.add_column("performance_node_tasks", sa.Column("phase_id", sa.String(96), nullable=False, server_default=""))
    op.drop_constraint("uq_performance_node_task_generation", "performance_node_tasks", type_="unique")
    op.create_unique_constraint("uq_performance_node_task_generation", "performance_node_tasks", KEY + ["phase_id"])


def downgrade():
    bind = op.get_bind()
    phased = bind.execute(sa.text("SELECT 1 FROM performance_node_tasks WHERE phase_id <> '' LIMIT 1")).first()
    if phased:
        raise RuntimeError("存在校准阶段任务，禁止降级丢失阶段边界")
    op.drop_constraint("uq_performance_node_task_generation", "performance_node_tasks", type_="unique")
    op.drop_column("performance_node_tasks", "phase_id")
    op.create_unique_constraint("uq_performance_node_task_generation", "performance_node_tasks", KEY)
