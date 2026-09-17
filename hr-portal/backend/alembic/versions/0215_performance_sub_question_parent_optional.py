"""Allow standalone sub review questions."""

from alembic import op

revision = "0215_performance_sub_question_parent_optional"
down_revision = "0214_performance_review_rule_remark"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_performance_review_question_parent",
        "performance_review_questions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_performance_review_question_parent",
        "performance_review_questions",
        "is_sub_question = true OR parent_question_id IS NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_performance_review_question_parent",
        "performance_review_questions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_performance_review_question_parent",
        "performance_review_questions",
        "(is_sub_question = true AND parent_question_id IS NOT NULL) OR "
        "(is_sub_question = false AND parent_question_id IS NULL)",
    )
