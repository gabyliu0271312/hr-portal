"""Persist performance metric type definitions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0249_performance_metric_types"
down_revision = "0248_performance_metric_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_metric_types",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("field_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("created_by_type", sa.String(32), nullable=False),
        sa.Column("created_by_ref", sa.String(64), nullable=False),
        sa.Column("updated_by", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("name", name="uq_performance_metric_types_name"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="ck_performance_metric_type_name"),
    )


def downgrade():
    op.drop_table("performance_metric_types")
