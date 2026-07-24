"""align loop item execution resource code with the UCP model

Revision ID: 0118
Revises: 0117
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0118"
down_revision = "0117"
branch_labels = None
depends_on = None


def _column_names(bind) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns("ucp_loop_item_execution")}


def _index_names(bind) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes("ucp_loop_item_execution")}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _column_names(bind)
    if "resource_code" not in columns:
        op.add_column("ucp_loop_item_execution", sa.Column("resource_code", sa.String(64), nullable=True))
        if "connector_code" in columns:
            op.execute("UPDATE ucp_loop_item_execution SET resource_code = connector_code WHERE resource_code IS NULL")
    if "ix_loop_item_resource" not in _index_names(bind):
        op.create_index("ix_loop_item_resource", "ucp_loop_item_execution", ["resource_code"])


def downgrade() -> None:
    bind = op.get_bind()
    if "ix_loop_item_resource" in _index_names(bind):
        op.drop_index("ix_loop_item_resource", table_name="ucp_loop_item_execution")
    if "resource_code" in _column_names(bind):
        op.drop_column("ucp_loop_item_execution", "resource_code")