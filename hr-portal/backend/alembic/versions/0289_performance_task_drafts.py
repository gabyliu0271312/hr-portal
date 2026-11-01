"""Separate task drafts from submitted answers without rewriting submitted history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0289_pm_task_drafts"
down_revision = "0288_pm_published_level"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_node_tasks", sa.Column("draft_answers", postgresql.JSONB(none_as_null=True), nullable=True))
    op.execute("UPDATE performance_node_tasks SET draft_answers = answers, answers = '{}'::jsonb WHERE submitted_at IS NULL AND answers <> '{}'::jsonb")


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT 1 FROM performance_node_tasks WHERE submitted_at IS NOT NULL AND draft_answers IS NOT NULL LIMIT 1")) is not None:
        raise RuntimeError("已有已提交任务的独立草稿，降级会丢失数据，禁止删除")
    op.execute("UPDATE performance_node_tasks SET answers = draft_answers WHERE submitted_at IS NULL AND draft_answers IS NOT NULL")
    op.drop_column("performance_node_tasks", "draft_answers")
