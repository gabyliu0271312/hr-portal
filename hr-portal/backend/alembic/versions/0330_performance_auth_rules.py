"""Persist rule-based authorization records (scope conditions + management role)."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0330_performance_auth_rules"
down_revision = "0329_performance_detail_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_auth_rules",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("or_scope", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("role_id", sa.BigInteger(), sa.ForeignKey("performance_roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_type", sa.String(32), nullable=True),
        sa.Column("created_by_ref", sa.String(64), nullable=True),
        sa.Column("updated_by_type", sa.String(32), nullable=True),
        sa.Column("updated_by_ref", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Index("ix_performance_auth_rules_role_active", "role_id", "is_active"),
    )


def downgrade():
    op.drop_table("performance_auth_rules")
