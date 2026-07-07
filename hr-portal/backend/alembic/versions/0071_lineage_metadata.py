# -*- coding: utf-8 -*-
"""P0-5: lineage_edges 增加 metadata JSON 列

Revision ID: 0071_lineage_metadata
Revises: 0070_lineage_edges
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0071_lineage_metadata"
down_revision = "0070_lineage_edges"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("warehouse_lineage_edges", sa.Column("edge_metadata", sa.JSON, nullable=True, comment="血缘 metadata"))


def downgrade() -> None:
    op.drop_column("warehouse_lineage_edges", "edge_metadata")
