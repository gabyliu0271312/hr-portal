"""0030 dataset-only reports and allocation schemes"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0030_dataset_only"
down_revision: Union[str, None] = "0029_global_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text(
        """
        DO $$
        DECLARE
            rec record;
            ds_id bigint;
            base_name text;
            final_name text;
            suffix int;
            suffix_text text;
        BEGIN
            FOR rec IN
                WITH source_tables AS (
                    SELECT DISTINCT table_name
                    FROM reports
                    WHERE dataset_id IS NULL AND COALESCE(table_name, '') <> ''
                    UNION
                    SELECT DISTINCT table_name
                    FROM allocation_schemes
                    WHERE dataset_id IS NULL AND COALESCE(table_name, '') <> ''
                )
                SELECT st.table_name, rt.table_label
                FROM source_tables st
                LEFT JOIN registered_tables rt ON rt.table_name = st.table_name
            LOOP
                SELECT dt.dataset_id INTO ds_id
                FROM dataset_tables dt
                WHERE dt.table_name = rec.table_name AND dt.alias = 'current'
                ORDER BY dt.dataset_id
                LIMIT 1;

                IF ds_id IS NULL THEN
                    base_name := LEFT(
                        '单表数据集 · ' || COALESCE(rec.table_label, rec.table_name),
                        64
                    );
                    final_name := base_name;
                    suffix := 2;
                    WHILE EXISTS (SELECT 1 FROM datasets d WHERE d.name = final_name) LOOP
                        suffix_text := ' #' || suffix::text;
                        final_name := LEFT(base_name, 64 - LENGTH(suffix_text)) || suffix_text;
                        suffix := suffix + 1;
                    END LOOP;

                    INSERT INTO datasets (name, description, is_active, created_at, updated_at)
                    VALUES (
                        final_name,
                        '系统自动创建，用于单表视图统一数据集化。',
                        true,
                        now(),
                        now()
                    )
                    RETURNING id INTO ds_id;

                    INSERT INTO dataset_tables (dataset_id, table_name, alias)
                    VALUES (ds_id, rec.table_name, 'current');
                END IF;
            END LOOP;
        END $$;
        """
    ))

    conn.execute(sa.text(
        """
        UPDATE reports r
        SET dataset_id = dt.dataset_id,
            table_name = ''
        FROM dataset_tables dt
        WHERE r.dataset_id IS NULL
          AND r.table_name = dt.table_name
          AND dt.alias = 'current'
        """
    ))
    conn.execute(sa.text(
        """
        UPDATE allocation_schemes s
        SET dataset_id = dt.dataset_id,
            table_name = ''
        FROM dataset_tables dt
        WHERE s.dataset_id IS NULL
          AND s.table_name = dt.table_name
          AND dt.alias = 'current'
        """
    ))

    # Early-stage hard cut: legacy rows without a resolvable table are not usable.
    conn.execute(sa.text("DELETE FROM reports WHERE dataset_id IS NULL"))
    conn.execute(sa.text("DELETE FROM allocation_schemes WHERE dataset_id IS NULL"))

    op.drop_constraint("reports_dataset_id_fkey", "reports", type_="foreignkey")
    op.create_foreign_key(
        "reports_dataset_id_fkey",
        "reports",
        "datasets",
        ["dataset_id"],
        ["id"],
    )
    op.alter_column("reports", "dataset_id", existing_type=sa.BigInteger(), nullable=False)

    op.drop_constraint("allocation_schemes_dataset_id_fkey", "allocation_schemes", type_="foreignkey")
    op.create_foreign_key(
        "allocation_schemes_dataset_id_fkey",
        "allocation_schemes",
        "datasets",
        ["dataset_id"],
        ["id"],
    )
    op.alter_column("allocation_schemes", "dataset_id", existing_type=sa.BigInteger(), nullable=False)


def downgrade() -> None:
    op.alter_column("allocation_schemes", "dataset_id", existing_type=sa.BigInteger(), nullable=True)
    op.drop_constraint("allocation_schemes_dataset_id_fkey", "allocation_schemes", type_="foreignkey")
    op.create_foreign_key(
        "allocation_schemes_dataset_id_fkey",
        "allocation_schemes",
        "datasets",
        ["dataset_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.alter_column("reports", "dataset_id", existing_type=sa.BigInteger(), nullable=True)
    op.drop_constraint("reports_dataset_id_fkey", "reports", type_="foreignkey")
    op.create_foreign_key(
        "reports_dataset_id_fkey",
        "reports",
        "datasets",
        ["dataset_id"],
        ["id"],
        ondelete="SET NULL",
    )
