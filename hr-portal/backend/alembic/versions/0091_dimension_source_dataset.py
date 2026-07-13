"""dimension: add source_dataset_id with historical backfill

Revision ID: 0091
Revises: 0090_z03_l4_pending_dws_version
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = '0091'
down_revision = '0090_z03_l4_pending_dws_version'

def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("dimensions")}
    if "source_dataset_id" not in columns:
        op.add_column("dimensions", sa.Column("source_dataset_id", sa.BigInteger(), nullable=True))

    # Backfill historical dimensions: bound_table -> unique DWD dataset table
    conn.execute(sa.text("""
        UPDATE dimensions d
        SET source_dataset_id = sub.dataset_id
        FROM (
            SELECT dt.table_name, MIN(dt.dataset_id) AS dataset_id
            FROM dataset_tables dt
            JOIN datasets ds ON ds.id = dt.dataset_id AND ds.warehouse_layer = 'DWD'
            GROUP BY dt.table_name
            HAVING COUNT(DISTINCT dt.dataset_id) = 1
        ) sub
        WHERE d.bound_table = sub.table_name
          AND d.source_dataset_id IS NULL
          AND d.bound_table IS NOT NULL
    """))

    import logging
    logger = logging.getLogger("alembic")
    ambiguous = conn.execute(sa.text("""
        SELECT d.id, d.dimension_code, d.bound_table, COUNT(DISTINCT dt.dataset_id) AS n
        FROM dimensions d
        JOIN dataset_tables dt ON dt.table_name = d.bound_table
        JOIN datasets ds ON ds.id = dt.dataset_id AND ds.warehouse_layer = 'DWD'
        WHERE d.source_dataset_id IS NULL AND d.bound_table IS NOT NULL
        GROUP BY d.id, d.dimension_code, d.bound_table
        HAVING COUNT(DISTINCT dt.dataset_id) > 1
    """)).fetchall()
    if ambiguous:
        logger.warning("[0091] %d dimensions have ambiguous bound_table -> multiple DWD datasets, left NULL", len(ambiguous))
        for row in ambiguous:
            logger.warning("  id=%d code=%s table=%s matches=%d", row[0], row[1], row[2], row[3])

    orphaned = conn.execute(sa.text("""
        SELECT id, dimension_code, bound_table, bound_field
        FROM dimensions
        WHERE source_dataset_id IS NULL
          AND (bound_table IS NOT NULL OR bound_field IS NOT NULL)
    """)).fetchall()
    if orphaned:
        logger.warning("[0091] %d dimensions have no matching DWD dataset (orphaned)", len(orphaned))
        for row in orphaned:
            logger.warning("  id=%d code=%s table=%s field=%s", row[0], row[1], row[2] or '-', row[3] or '-')

def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("dimensions")}
    if "source_dataset_id" in columns:
        op.drop_column("dimensions", "source_dataset_id")
