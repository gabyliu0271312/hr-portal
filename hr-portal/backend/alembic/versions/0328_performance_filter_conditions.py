"""Persist default filter condition field settings independently."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0328_performance_filter_conditions"
down_revision = "0327_member_filter_presets"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_filter_condition_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("filter_conditions", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("updated_by_type", sa.String(32), nullable=True),
        sa.Column("updated_by_ref", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="ck_performance_filter_condition_singleton"),
        sa.CheckConstraint("jsonb_typeof(filter_conditions) = 'array'", name="ck_performance_filter_condition_array"),
    )


def downgrade():
    op.drop_table("performance_filter_condition_settings")
