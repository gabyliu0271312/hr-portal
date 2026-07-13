"""dimension: add source_dataset_id FK + index

Revision ID: 0093
Revises: 0092_merge_0073_0091
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = '0093'
down_revision = '0092'


def _index_exists(inspector, table_name: str, index_name: str) -> bool:
    return any(i.get("name") == index_name for i in inspector.get_indexes(table_name))


def _fk_exists(inspector, table_name: str, fk_name: str) -> bool:
    return any(fk.get("name") == fk_name for fk in inspector.get_foreign_keys(table_name))


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not _index_exists(inspector, "dimensions", "ix_dimensions_source_dataset"):
        op.create_index("ix_dimensions_source_dataset", "dimensions", ["source_dataset_id"])

    inspector = sa.inspect(conn)
    if not _fk_exists(inspector, "dimensions", "fk_dimensions_source_dataset"):
        op.create_foreign_key(
            "fk_dimensions_source_dataset",
            "dimensions",
            "datasets",
            ["source_dataset_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _fk_exists(inspector, "dimensions", "fk_dimensions_source_dataset"):
        op.drop_constraint("fk_dimensions_source_dataset", "dimensions", type_="foreignkey")

    inspector = sa.inspect(conn)
    if _index_exists(inspector, "dimensions", "ix_dimensions_source_dataset"):
        op.drop_index("ix_dimensions_source_dataset", "dimensions")
