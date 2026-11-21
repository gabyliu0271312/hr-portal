"""Persist scoped performance member column preferences."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0320_pm_column_preferences"
down_revision = "0319_pm_cycle_360_privacy_policy"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_column_preferences",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("owner_type", sa.String(32), nullable=False),
        sa.Column("owner_id", sa.BigInteger(), nullable=False),
        sa.Column("employee_ref", sa.String(64), nullable=False, server_default=""),
        sa.Column("cycle_ref", sa.String(64), nullable=False),
        sa.Column("scene", sa.String(16), nullable=False),
        sa.Column("project_id", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("node_id", sa.String(96), nullable=False, server_default=""),
        sa.Column("role_key", sa.String(96), nullable=False, server_default=""),
        sa.Column("column_keys", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("owner_type", "owner_id", "employee_ref", "cycle_ref", "scene", "project_id", "node_id", "role_key", name="uq_pm_column_preference_scope"),
        sa.CheckConstraint("scene IN ('management','evaluation')", name="ck_pm_column_preference_scene"),
        sa.CheckConstraint("project_id>=0", name="ck_pm_column_preference_project"),
        sa.CheckConstraint("jsonb_typeof(column_keys)='array' AND jsonb_array_length(column_keys)<=128", name="ck_pm_column_preference_keys"),
    )


def downgrade():
    op.drop_table("performance_column_preferences")
