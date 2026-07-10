"""Normalize single-table dataset codes

Revision ID: 0077_normalize_single_table_dataset_names
Revises: 0076_push_targets_source_ref_columns
Create Date: 2026-07-10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0077_normalize_single_table_dataset_names"
down_revision = "0076_push_targets_source_ref_columns"
branch_labels = None
depends_on = None


def _unique_code(base: str, used: set[str]) -> str:
    base = (base or "ds_dataset").replace(" ", "_")[:64]
    code = base
    suffix = 2
    while code in used:
        tail = f"_{suffix}"
        code = f"{base[:64 - len(tail)]}{tail}"
        suffix += 1
    used.add(code)
    return code


def upgrade() -> None:
    bind = op.get_bind()
    legacy_prefix = "\u5355\u8868\u6570\u636e\u96c6%"

    existing_names = {row[0] for row in bind.execute(sa.text("SELECT name FROM datasets")).fetchall()}

    rows = bind.execute(sa.text("""
        SELECT d.id,
               d.name,
               d.label,
               dt.table_name,
               COALESCE(rt.table_label, dt.table_name) AS table_label
        FROM datasets d
        JOIN dataset_tables dt ON dt.dataset_id = d.id
        LEFT JOIN registered_tables rt ON rt.table_name = dt.table_name
        WHERE dt.alias = 'current'
          AND (d.name LIKE :legacy_prefix OR d.name LIKE 'ds_%')
          AND NOT EXISTS (
              SELECT 1 FROM dataset_tables dt2
              WHERE dt2.dataset_id = d.id AND dt2.id <> dt.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM dataset_relations dr
              WHERE dr.dataset_id = d.id
          )
        ORDER BY d.id
    """), {"legacy_prefix": legacy_prefix}).mappings().all()

    for row in rows:
        old_name = row["name"]
        table_name = row["table_name"]
        desired_base = f"ds_{table_name}"[:64]

        # Keep already-normalized names, but fill label if missing.
        if old_name and old_name.startswith("ds_"):
            new_name = old_name
        else:
            existing_names.discard(old_name)
            new_name = _unique_code(desired_base, existing_names)

        new_label = row["label"] or row["table_label"] or table_name
        bind.execute(
            sa.text("UPDATE datasets SET name = :name, label = :label WHERE id = :id"),
            {"name": new_name, "label": new_label, "id": row["id"]},
        )


def downgrade() -> None:
    # DataSet.name is a system identifier. Reconstructing old display-style names
    # would be lossy and may break references, so downgrade intentionally keeps
    # normalized codes.
    pass
