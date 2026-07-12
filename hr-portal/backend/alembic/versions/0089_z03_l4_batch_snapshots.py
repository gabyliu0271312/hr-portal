# -*- coding: utf-8 -*-
"""Z03 L4: l4_publish_batches snapshot columns (dataset_outputs/lineage/permissions/bi_contract)

Revision ID: 0089_z03_l4_batch_snapshots
Revises: 0088_z03_l4_audit_steps
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0089_z03_l4_batch_snapshots"
down_revision = "0088_z03_l4_audit_steps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("l4_publish_batches", sa.Column("dataset_outputs_before", sa.JSON, nullable=True, server_default="[]"))
    op.add_column("l4_publish_batches", sa.Column("lineage_before", sa.JSON, nullable=True, server_default="[]"))
    op.add_column("l4_publish_batches", sa.Column("permissions_before", sa.JSON, nullable=True, server_default="[]"))
    op.add_column("l4_publish_batches", sa.Column("bi_contract_before", sa.JSON, nullable=True, server_default="[]"))


def downgrade() -> None:
    op.drop_column("l4_publish_batches", "bi_contract_before")
    op.drop_column("l4_publish_batches", "permissions_before")
    op.drop_column("l4_publish_batches", "lineage_before")
    op.drop_column("l4_publish_batches", "dataset_outputs_before")
