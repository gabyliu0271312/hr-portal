"""catalog test instance governance

Revision ID: 0135_catalog_test_instance_governance
Revises: 0134_catalog_action_contract
"""
from alembic import op
import sqlalchemy as sa


revision = "0135_catalog_test_instance_governance"
down_revision = "0134_catalog_action_contract"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ucp_system", sa.Column("is_catalog_test_instance", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ucp_operation_definition", sa.Column("catalog_test_system_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_ucp_operation_catalog_test_system", "ucp_operation_definition", "ucp_system", ["catalog_test_system_id"], ["id"], ondelete="SET NULL")
    for column in ("tested_by_user_id", "submitted_by_user_id", "published_by_user_id"):
        op.add_column("ucp_operation_definition", sa.Column(column, sa.BigInteger(), nullable=True))


def downgrade() -> None:
    for column in ("published_by_user_id", "submitted_by_user_id", "tested_by_user_id"):
        op.drop_column("ucp_operation_definition", column)
    op.drop_constraint("fk_ucp_operation_catalog_test_system", "ucp_operation_definition", type_="foreignkey")
    op.drop_column("ucp_operation_definition", "catalog_test_system_id")
    op.drop_column("ucp_system", "is_catalog_test_instance")
