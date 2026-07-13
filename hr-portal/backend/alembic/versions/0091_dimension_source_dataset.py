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
    # 加列（幂等：兼容已手动执行过的环境）
    try:
        op.add_column("dimensions", sa.Column("source_dataset_id", sa.BigInteger(), nullable=True))
    except Exception:
        pass  # column already exists

    # 历史回填：根据 bound_table → dataset_tables.table_name 推导 DWD 数据集
    # 仅唯一匹配时自动回填；多匹配记录 warning 留人工确认
    conn = op.get_bind()
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
    # 记录无法自动迁移的维度
    import logging
    logger = logging.getLogger("alembic")
    # 多匹配：同一张表属于多个 DWD 数据集
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
        logger.warning("[0091] %d dimensions have ambiguous bound_table → multiple DWD datasets, left NULL", len(ambiguous))
        for row in ambiguous:
            logger.warning("  id=%d code=%s table=%s matches=%d", row[0], row[1], row[2], row[3])
    # 无匹配：bound_table 不属于任何 DWD 数据集
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
    op.drop_column("dimensions", "source_dataset_id")
