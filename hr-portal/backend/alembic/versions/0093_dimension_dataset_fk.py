"""dimension: add source_dataset_id FK + index

Revision ID: 0093
Revises: 0092_merge_0073_0091
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = '0093'
down_revision = '0092'

def upgrade():
    op.create_index("ix_dimensions_source_dataset", "dimensions", ["source_dataset_id"])
    op.create_foreign_key("fk_dimensions_source_dataset", "dimensions", "datasets", ["source_dataset_id"], ["id"], ondelete="SET NULL")

def downgrade():
    op.drop_constraint("fk_dimensions_source_dataset", "dimensions", type_="foreignkey")
    op.drop_index("ix_dimensions_source_dataset", "dimensions")
