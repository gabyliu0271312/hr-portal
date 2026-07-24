"""align UCP execution log resource code with the model

Revision ID: 0117
Revises: 0116
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0117"
down_revision = "0116"
branch_labels = None
depends_on = None


def _column_names(bind) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns("ucp_execution_log")}


def _index_names(bind) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes("ucp_execution_log")}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _column_names(bind)
    if "resource_code" not in columns:
        op.add_column("ucp_execution_log", sa.Column("resource_code", sa.String(64), nullable=True))
        if "connector_code" in columns:
            op.execute("UPDATE ucp_execution_log SET resource_code = connector_code WHERE resource_code IS NULL")
    if "ix_exec_log_resource" not in _index_names(bind):
        op.create_index("ix_exec_log_resource", "ucp_execution_log", ["resource_code"])


def downgrade() -> None:
    bind = op.get_bind()
    if "ix_exec_log_resource" in _index_names(bind):
        op.drop_index("ix_exec_log_resource", table_name="ucp_execution_log")
    if "resource_code" in _column_names(bind):
        op.drop_column("ucp_execution_log", "resource_code")
