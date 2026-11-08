"""Add source_type to performance_node_tasks for 360 evaluation origin."""
from alembic import op
import sqlalchemy as sa

revision = "0299_pm_node_task_source_type"
down_revision = "0298_pm_focus_group_tag_colors"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "performance_node_tasks",
        sa.Column("source_type", sa.String(32), nullable=True),
    )


def downgrade():
    op.drop_column("performance_node_tasks", "source_type")
