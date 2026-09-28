"""Add remarks to performance review questions."""

from alembic import op
import sqlalchemy as sa


revision = "0244_performance_review_question_remark"
down_revision = "0243_performance_assessment_method_settings"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    return {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns("performance_review_questions")
    }


def upgrade() -> None:
    if "remark" not in _columns():
        op.add_column(
            "performance_review_questions",
            sa.Column("remark", sa.Text(), nullable=False, server_default=sa.text("''")),
        )
        op.alter_column("performance_review_questions", "remark", server_default=None)


def downgrade() -> None:
    if "remark" in _columns():
        op.drop_column("performance_review_questions", "remark")
