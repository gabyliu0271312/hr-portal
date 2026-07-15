"""backfill output fields for old datasets

Revision ID: 0096
Revises: 0095
Create Date: 2026-07-15

旧数据集在创建时没有自动填充 dataset_output_fields，
导致公式翻译找不到字段。本迁移对缺少输出字段的旧数据集，
从 table_columns 读取可见字段自动填充。
"""
from alembic import op
from sqlalchemy import text


revision = "0096"
down_revision = "0095"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 找到有 dataset_tables 但缺少 dataset_output_fields 的数据集
    ds_ids = conn.execute(text("""
        SELECT DISTINCT dt.dataset_id
        FROM dataset_tables dt
        WHERE NOT EXISTS (
            SELECT 1 FROM dataset_output_fields dof WHERE dof.dataset_id = dt.dataset_id
        )
    """)).fetchall()

    if not ds_ids:
        return

    count = 0
    for (ds_id,) in ds_ids:
        tables = conn.execute(text("""
            SELECT alias, table_name FROM dataset_tables WHERE dataset_id = :ds_id
        """), {"ds_id": ds_id}).fetchall()

        for alias, table_name in tables:
            cols = conn.execute(text("""
                SELECT column_code, column_label, data_type, agg_role, is_sensitive
                FROM table_columns
                WHERE table_name = :table_name AND is_visible = true
                ORDER BY display_order, id
            """), {"table_name": table_name}).fetchall()

            for i, col in enumerate(cols):
                conn.execute(text("""
                    INSERT INTO dataset_output_fields
                        (dataset_id, source_alias, source_column, output_code, output_label,
                         data_type, agg_role, is_sensitive, is_visible, display_order)
                    VALUES
                        (:ds_id, :alias, :col_code, :col_code, :col_label,
                         :data_type, :agg_role, :is_sensitive, true, :disp_order)
                    ON CONFLICT (dataset_id, output_code) DO NOTHING
                """), {
                    "ds_id": ds_id,
                    "alias": alias,
                    "col_code": col.column_code,
                    "col_label": col.column_label,
                    "data_type": col.data_type or "string",
                    "agg_role": col.agg_role or "dimension",
                    "is_sensitive": bool(col.is_sensitive),
                    "disp_order": i * 10,
                })
                count += 1

    print(f"backfilled {count} output fields across {len(ds_ids)} datasets")


def downgrade():
    """无需回退，此迁移仅填充数据"""
    pass