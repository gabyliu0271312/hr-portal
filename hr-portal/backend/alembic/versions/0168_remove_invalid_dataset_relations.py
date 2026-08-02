"""Remove historical dataset relations that cannot be executed."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0168_remove_invalid_dataset_relations"
down_revision = "0167_repair_resource_template_source_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(
        sa.text(
            """
            DELETE FROM dataset_relations AS relation
            WHERE json_typeof(relation.keys) <> 'array'
               OR json_array_length(relation.keys) = 0
               OR EXISTS (
                    SELECT 1
                    FROM json_array_elements(
                        CASE
                            WHEN json_typeof(relation.keys) = 'array' THEN relation.keys
                            ELSE '[]'::json
                        END
                    ) AS key
                    LEFT JOIN information_schema.columns AS left_column
                      ON left_column.table_schema = 'public'
                     AND left_column.table_name = COALESCE(
                         (
                             SELECT table_name
                             FROM dataset_tables
                             WHERE dataset_id = relation.dataset_id
                               AND alias = relation.left_alias
                             LIMIT 1
                         ),
                         relation.left_alias
                     )
                     AND left_column.column_name = key->>'left'
                    LEFT JOIN information_schema.columns AS right_column
                      ON right_column.table_schema = 'public'
                     AND right_column.table_name = COALESCE(
                         (
                             SELECT table_name
                             FROM dataset_tables
                             WHERE dataset_id = relation.dataset_id
                               AND alias = relation.right_alias
                             LIMIT 1
                         ),
                         relation.right_alias
                     )
                     AND right_column.column_name = key->>'right'
                    WHERE json_typeof(key) <> 'object'
                       OR COALESCE(key->>'left', '') !~ '^[_a-z][_a-z0-9]*$'
                       OR COALESCE(key->>'right', '') !~ '^[_a-z][_a-z0-9]*$'
                       OR key->>'left' IN ('id', 'pk_hash', 'synced_at')
                       OR key->>'right' IN ('id', 'pk_hash', 'synced_at')
                       OR left_column.column_name IS NULL
                       OR right_column.column_name IS NULL
               )
            """
        )
    )


def downgrade() -> None:
    pass