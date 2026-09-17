"""Add performance review rules and questions."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0213_performance_review_questions"
down_revision = "0212_merge_result_column_labels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performance_review_rules",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("review_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by_type", sa.String(length=32), nullable=False),
        sa.Column("created_by_ref", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("review_type IN ('评级', '评分', '评分映射等级型')", name="ck_performance_review_rule_type"),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_performance_review_rule_status"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_performance_review_rules_status_name",
        "performance_review_rules",
        ["status", "name"],
    )

    op.create_table(
        "performance_review_questions",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=False, server_default="zh-CN"),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("is_sub_question", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("parent_question_id", sa.BigInteger(), nullable=True),
        sa.Column("rule_id", sa.BigInteger(), nullable=False),
        sa.Column("created_by_type", sa.String(length=32), nullable=False),
        sa.Column("created_by_ref", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "(is_sub_question = true AND parent_question_id IS NOT NULL) OR "
            "(is_sub_question = false AND parent_question_id IS NULL)",
            name="ck_performance_review_question_parent",
        ),
        sa.ForeignKeyConstraint(["parent_question_id"], ["performance_review_questions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["rule_id"], ["performance_review_rules.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_performance_review_questions_parent",
        "performance_review_questions",
        ["parent_question_id"],
    )
    op.create_index(
        "ix_performance_review_questions_rule",
        "performance_review_questions",
        ["rule_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_performance_review_questions_rule", table_name="performance_review_questions")
    op.drop_index("ix_performance_review_questions_parent", table_name="performance_review_questions")
    op.drop_table("performance_review_questions")
    op.drop_index("ix_performance_review_rules_status_name", table_name="performance_review_rules")
    op.drop_table("performance_review_rules")
