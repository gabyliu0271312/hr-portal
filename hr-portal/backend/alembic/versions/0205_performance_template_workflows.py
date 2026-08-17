"""Persist performance template workflow drafts.

Revision ID: 0205_performance_template_workflows
Revises: 0204_remove_merge_key_mapping_source_dimension
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0205_performance_template_workflows"
down_revision = "0204_remove_merge_key_mapping_source_dimension"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performance_template_workflows",
        sa.Column("template_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "nodes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("cycle_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("project_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_by_type", sa.String(length=32), nullable=True),
        sa.Column("updated_by_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("template_id"),
    )


def downgrade() -> None:
    op.drop_table("performance_template_workflows")
