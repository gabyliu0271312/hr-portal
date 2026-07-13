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


def _columns() -> set[str]:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "l4_publish_batches" not in inspector.get_table_names():
        return set()
    return {c["name"] for c in inspector.get_columns("l4_publish_batches")}


def _add_if_missing(existing: set[str], name: str, column: sa.Column) -> None:
    if name not in existing:
        op.add_column("l4_publish_batches", column)
        existing.add(name)


def upgrade() -> None:
    existing = _columns()
    _add_if_missing(existing, "dataset_outputs_before", sa.Column("dataset_outputs_before", sa.JSON, nullable=True, server_default="[]"))
    _add_if_missing(existing, "lineage_before", sa.Column("lineage_before", sa.JSON, nullable=True, server_default="[]"))
    _add_if_missing(existing, "permissions_before", sa.Column("permissions_before", sa.JSON, nullable=True, server_default="[]"))
    _add_if_missing(existing, "bi_contract_before", sa.Column("bi_contract_before", sa.JSON, nullable=True, server_default="[]"))


def downgrade() -> None:
    existing = _columns()
    for name in ["bi_contract_before", "permissions_before", "lineage_before", "dataset_outputs_before"]:
        if name in existing:
            op.drop_column("l4_publish_batches", name)
