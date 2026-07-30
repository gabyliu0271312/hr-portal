"""Add business-facing datasource ingestion mode.

Revision ID: 0158
Revises: 0155_use_offer_salary_adapter
"""
from alembic import op
import sqlalchemy as sa

revision = "0158"
down_revision = "0155_use_offer_salary_adapter"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasources", sa.Column("ingestion_mode", sa.String(32), nullable=True))
    op.execute("""
        UPDATE datasources
        SET ingestion_mode = CASE
            WHEN sync_semantics = 'incremental_append' AND write_strategy = 'append' THEN 'append'
            WHEN sync_semantics = 'incremental_upsert' AND write_strategy = 'incremental_upsert' THEN 'incremental_upsert'
            WHEN sync_semantics = 'full_snapshot' AND write_strategy = 'incremental_upsert' AND missing_row_strategy = 'mark_inactive' THEN 'current_snapshot'
            ELSE NULL
        END
    """)


def downgrade() -> None:
    op.drop_column("datasources", "ingestion_mode")
