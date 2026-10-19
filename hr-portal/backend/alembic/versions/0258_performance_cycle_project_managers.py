"""Store cycle-scoped project manager mappings without mutating locked people."""
from alembic import op
import sqlalchemy as sa

revision = "0258_performance_cycle_project_managers"
down_revision = "0257_performance_assessment_roles"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_cycle_project_managers",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("cycle_ref", sa.String(length=64), sa.ForeignKey("performance_cycles.cycle_ref", ondelete="CASCADE"), nullable=False),
        sa.Column("target_employee_no", sa.String(length=64), nullable=False),
        sa.Column("manager_employee_no", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("cycle_ref", "target_employee_no", name="uq_performance_cycle_project_manager_target"),
    )
    op.add_column("performance_project_members", sa.Column("project_manager_employee_no", sa.String(length=64), nullable=True))


def downgrade():
    op.drop_column("performance_project_members", "project_manager_employee_no")
    op.drop_table("performance_cycle_project_managers")
