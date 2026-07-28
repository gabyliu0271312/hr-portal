"""Add source-owned warehouse write policies.

Revision ID: 0141
Revises: 0140
"""
from alembic import op
import sqlalchemy as sa

revision = "0141"
down_revision = "0140"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasources", sa.Column("sync_semantics", sa.String(32), nullable=True))
    op.add_column("datasources", sa.Column("write_strategy", sa.String(32), nullable=True))
    op.add_column("datasources", sa.Column("missing_row_strategy", sa.String(32), nullable=True))
    op.add_column("datasources", sa.Column("business_key_fields", sa.JSON(), nullable=False, server_default="[]"))
    op.execute("""
        UPDATE datasources
        SET sync_semantics = 'full_snapshot',
            write_strategy = 'incremental_upsert',
            missing_row_strategy = 'hard_delete',
            business_key_fields = '["employ_no"]'::json
        WHERE table_name = 'ods_pending_onboarding_list'
    """)


def downgrade() -> None:
    op.drop_column("datasources", "business_key_fields")
    op.drop_column("datasources", "missing_row_strategy")
    op.drop_column("datasources", "write_strategy")
    op.drop_column("datasources", "sync_semantics")
