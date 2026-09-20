"""Add persisted tagged fill-in questions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0228_performance_tag_fill_questions"
down_revision = "0227_reconcile_performance_snapshot_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performance_tag_fill_questions",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("language", sa.String(length=16), nullable=False, server_default="zh-CN"),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("remark", sa.Text(), nullable=False, server_default=""),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_by_type", sa.String(length=32), nullable=False),
        sa.Column("created_by_ref", sa.String(length=64), nullable=False),
        sa.Column("created_by_name", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_performance_tag_fill_questions_name", "performance_tag_fill_questions", ["name"])


def downgrade() -> None:
    op.drop_index("ix_performance_tag_fill_questions_name", table_name="performance_tag_fill_questions")
    op.drop_table("performance_tag_fill_questions")
