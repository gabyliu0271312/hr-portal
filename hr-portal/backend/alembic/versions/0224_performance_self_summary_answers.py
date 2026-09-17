"""Add PM-T009 self-summary answers to generated tasks."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0224_performance_self_summary_answers"
down_revision = "0223_performance_project_tasks"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("performance_node_tasks", sa.Column("answers", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("performance_node_tasks", sa.Column("answer_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("performance_node_tasks", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))

def downgrade() -> None:
    op.drop_column("performance_node_tasks", "submitted_at")
    op.drop_column("performance_node_tasks", "answer_version")
    op.drop_column("performance_node_tasks", "answers")
