"""Add optimistic lifecycle state to result reconsiderations."""
from alembic import op
import sqlalchemy as sa

revision = "0300_pm_reconsideration_lifecycle"
down_revision = "0299_pm_node_task_source_type"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_result_reconsiderations", sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("performance_result_reconsiderations", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))


def downgrade():
    op.drop_column("performance_result_reconsiderations", "version")
    op.drop_column("performance_result_reconsiderations", "withdrawn_at")
