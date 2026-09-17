"""Persist performance review rule remarks."""

from alembic import op
import sqlalchemy as sa


revision = "0214_performance_review_rule_remark"
down_revision = "0213_performance_review_questions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "performance_review_rules",
        sa.Column("remark", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("performance_review_rules", "remark")
