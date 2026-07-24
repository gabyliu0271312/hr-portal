"""retire mandatory legacy loop connector code

Revision ID: 0120
Revises: 0119
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0120"
down_revision = "0119"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"]: column for column in sa.inspect(bind).get_columns("ucp_loop_item_execution")}
    connector_code = columns.get("connector_code")
    if connector_code and not connector_code["nullable"]:
        op.alter_column("ucp_loop_item_execution", "connector_code", existing_type=sa.String(64), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"]: column for column in sa.inspect(bind).get_columns("ucp_loop_item_execution")}
    connector_code = columns.get("connector_code")
    if connector_code and connector_code["nullable"]:
        op.execute("UPDATE ucp_loop_item_execution SET connector_code = resource_code WHERE connector_code IS NULL")
        op.alter_column("ucp_loop_item_execution", "connector_code", existing_type=sa.String(64), nullable=False)