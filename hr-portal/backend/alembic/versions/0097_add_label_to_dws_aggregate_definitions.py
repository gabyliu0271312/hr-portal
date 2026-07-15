"""add label to dws_aggregate_definitions

Revision ID: 0097
Revises: 0096
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa


revision = "0097"
down_revision = "0096"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("dws_aggregate_definitions",
                  sa.Column("label", sa.String(128), nullable=True, comment="聚合展示名称"))


def downgrade():
    op.drop_column("dws_aggregate_definitions", "label")