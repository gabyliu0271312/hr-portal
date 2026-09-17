"""Store rating display mode per review question."""

from alembic import op
import sqlalchemy as sa


revision = "0219_performance_question_display_mode"
down_revision = "0218_performance_content_library"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "performance_review_questions",
        sa.Column("display_mode", sa.String(length=16), nullable=False, server_default="标签样式"),
    )
    op.create_check_constraint(
        "ck_performance_review_question_display_mode",
        "performance_review_questions",
        "display_mode IN ('标签样式', '下拉样式')",
    )
    op.execute(
        """
        UPDATE performance_review_questions AS question
        SET display_mode = CASE
            WHEN rule.config ->> 'displayMode' IN ('标签样式', '下拉样式')
                THEN rule.config ->> 'displayMode'
            WHEN rule.config ->> 'display_mode' IN ('标签样式', '下拉样式')
                THEN rule.config ->> 'display_mode'
            ELSE '标签样式'
        END
        FROM performance_review_rules AS rule
        WHERE rule.id = question.rule_id
        """
    )
    op.execute(
        """
        UPDATE performance_review_rules
        SET config = config - 'displayMode' - 'display_mode'
        WHERE config ? 'displayMode' OR config ? 'display_mode'
        """
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_performance_review_question_display_mode",
        "performance_review_questions",
        type_="check",
    )
    op.drop_column("performance_review_questions", "display_mode")
