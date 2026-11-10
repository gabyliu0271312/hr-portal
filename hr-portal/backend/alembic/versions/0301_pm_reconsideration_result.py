"""Freeze reconsideration result and persist its final decision."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0301_pm_reconsideration_result"
down_revision = "0300_pm_reconsideration_lifecycle"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_result_reconsiderations", sa.Column("result_snapshot", postgresql.JSONB(), nullable=True))
    op.add_column("performance_result_reconsiderations", sa.Column("effective_result", postgresql.JSONB(), nullable=True))
    op.add_column("performance_result_reconsiderations", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("performance_result_reconsiderations", sa.Column("closed_by_type", sa.String(32), nullable=True))
    op.add_column("performance_result_reconsiderations", sa.Column("closed_by_ref", sa.String(128), nullable=True))


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT EXISTS (SELECT 1 FROM performance_result_reconsiderations WHERE result_snapshot IS NOT NULL OR effective_result IS NOT NULL OR closed_at IS NOT NULL)")).scalar():
        raise RuntimeError("RECONSIDERATION_RESULT_HISTORY_EXISTS")
    for column in ("closed_by_ref", "closed_by_type", "closed_at", "effective_result", "result_snapshot"):
        op.drop_column("performance_result_reconsiderations", column)
