"""Persist performance template metadata before workflow editing."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0209_performance_templates"
down_revision = "0208_identity_number_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performance_templates",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("language", sa.String(length=16), nullable=False, server_default="zh-CN"),
        sa.Column("english_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("calculation_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("selected_rules", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_by_type", sa.String(length=32), nullable=False),
        sa.Column("created_by_ref", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_performance_templates_name"),
    )


def downgrade() -> None:
    op.drop_table("performance_templates")
