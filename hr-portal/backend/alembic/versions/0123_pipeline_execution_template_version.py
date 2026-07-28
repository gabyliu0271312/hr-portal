"""persist the pipeline template version used for each execution

Revision ID: 0123
Revises: 0122
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0123"
down_revision = "0122"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ucp_pipeline_execution", sa.Column("template_version", sa.String(length=32), nullable=True))
    op.create_index("ix_pipeline_exec_template_version", "ucp_pipeline_execution", ["pipeline_code", "template_version"])


def downgrade() -> None:
    op.drop_index("ix_pipeline_exec_template_version", table_name="ucp_pipeline_execution")
    op.drop_column("ucp_pipeline_execution", "template_version")
