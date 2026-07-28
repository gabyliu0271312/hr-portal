"""catalog action contract

Revision ID: 0134_catalog_action_contract
Revises: 0133
"""
from alembic import op
import sqlalchemy as sa


revision = "0134_catalog_action_contract"
down_revision = "0133"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ucp_operation_definition", sa.Column("field_catalog", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("ucp_operation_definition", sa.Column("masking_rules", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.add_column("ucp_operation_definition", sa.Column("error_rules", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("ucp_operation_definition", sa.Column("sample_response", sa.JSON(), nullable=True))
    op.add_column("ucp_operation_definition", sa.Column("sample_schema_hash", sa.String(length=96), nullable=True))
    op.add_column("ucp_operation_definition", sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ucp_operation_definition", sa.Column("is_legacy", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    for column in ("is_legacy", "last_tested_at", "sample_schema_hash", "sample_response", "error_rules", "masking_rules", "field_catalog"):
        op.drop_column("ucp_operation_definition", column)
