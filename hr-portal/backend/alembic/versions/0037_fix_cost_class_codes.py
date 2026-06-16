"""Fix emp_monthly_cost_class column codes that contain spaces.

This lookup table was created with the legacy raw-JSON schema (0017). When 0033
dropped the raw column, the hand-maintained mapping data was lost, and 0036 could
only recreate physical columns for codes that were valid identifiers. The codes
"field type" and "cost classification" contain spaces (invalid identifiers), so
their physical columns were never created and the LOOKUP_FIELDS join fails with
"缺少实体列: ['field_type', 'cost_classification']".

This migration normalizes those codes to snake_case in table_columns metadata and
ensures the physical columns exist, so the salary-table lookup can resolve again.
Existing row data is not affected (it was already lost when raw was dropped).
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0037_fix_cost_class_codes"
down_revision: Union[str, None] = "0036_backfill_entity_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "emp_monthly_cost_class"
RENAMES = {
    "field type": "field_type",
    "cost classification": "cost_classification",
}


def _quote_ident(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) * 2)}"'


def _meta_has(bind, code: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                "SELECT 1 FROM table_columns "
                "WHERE table_name = :t AND column_code = :c LIMIT 1"
            ),
            {"t": TABLE, "c": code},
        ).first()
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE):
        return

    phys_cols = {c["name"] for c in inspector.get_columns(TABLE)}
    table_q = _quote_ident(TABLE)

    for old, new in RENAMES.items():
        # 1) 物理列：带空格旧列存在则改名；否则确保规范列存在
        if old in phys_cols and new not in phys_cols:
            op.execute(
                f"ALTER TABLE {table_q} "
                f"RENAME COLUMN {_quote_ident(old)} TO {_quote_ident(new)}"
            )
            phys_cols.discard(old)
            phys_cols.add(new)
        elif new not in phys_cols:
            op.execute(
                f"ALTER TABLE {table_q} "
                f"ADD COLUMN IF NOT EXISTS {_quote_ident(new)} TEXT"
            )
            phys_cols.add(new)

        # 2) 元数据 code 规范化
        if _meta_has(bind, old):
            if _meta_has(bind, new):
                bind.execute(
                    sa.text(
                        "DELETE FROM table_columns "
                        "WHERE table_name = :t AND column_code = :c"
                    ),
                    {"t": TABLE, "c": old},
                )
            else:
                bind.execute(
                    sa.text(
                        "UPDATE table_columns SET column_code = :new "
                        "WHERE table_name = :t AND column_code = :old"
                    ),
                    {"new": new, "old": old, "t": TABLE},
                )


def downgrade() -> None:
    # Canonical identifier fix is intentionally not reversed.
    pass
