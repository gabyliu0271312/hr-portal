"""remove legacy system operation fields

Revision ID: 0136_remove_legacy_system_operations
Revises: 0135_catalog_test_instance_governance
"""
from alembic import op
import sqlalchemy as sa


revision = "0136_remove_legacy_system_operations"
down_revision = "0135_catalog_test_instance_governance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_ucp_operation_definition_system_status", table_name="ucp_operation_definition")
    op.drop_constraint("fk_ucp_operation_definition_system_id", "ucp_operation_definition", type_="foreignkey")
    op.drop_column("ucp_operation_definition", "system_id")
    op.drop_column("ucp_operation_definition", "scope")
    op.drop_column("ucp_operation_definition", "is_legacy")


def downgrade() -> None:
    op.add_column("ucp_operation_definition", sa.Column("is_legacy", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ucp_operation_definition", sa.Column("scope", sa.String(length=16), nullable=False, server_default="PACKAGE"))
    op.add_column("ucp_operation_definition", sa.Column("system_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_ucp_operation_definition_system",
        "ucp_operation_definition",
        "ucp_system",
        ["system_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_ucp_operation_definition_system_status", "ucp_operation_definition", ["system_id", "status"])
