"""align pipeline step execution resource columns with the UCP model

Revision ID: 0116
Revises: 0115
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0116"
down_revision = "0115"
branch_labels = None
depends_on = None


def _column_names(bind) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns("ucp_pipeline_step_execution")}


def _index_names(bind) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes("ucp_pipeline_step_execution")}


def _foreign_key_names(bind) -> set[str]:
    return {foreign_key["name"] for foreign_key in sa.inspect(bind).get_foreign_keys("ucp_pipeline_step_execution")}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _column_names(bind)

    if "resource_id" not in columns:
        op.add_column("ucp_pipeline_step_execution", sa.Column("resource_id", sa.BigInteger(), nullable=True))
    if "resource_code" not in columns:
        op.add_column("ucp_pipeline_step_execution", sa.Column("resource_code", sa.String(64), nullable=True))
        if "connector_code" in columns:
            op.execute("UPDATE ucp_pipeline_step_execution SET resource_code = connector_code WHERE resource_code IS NULL")

    foreign_keys = _foreign_key_names(bind)
    if "fk_pipeline_step_exec_resource" not in foreign_keys:
        op.create_foreign_key(
            "fk_pipeline_step_exec_resource",
            "ucp_pipeline_step_execution",
            "ucp_resource",
            ["resource_id"],
            ["id"],
            ondelete="SET NULL",
        )

    if "ix_step_exec_resource" not in _index_names(bind):
        op.create_index("ix_step_exec_resource", "ucp_pipeline_step_execution", ["resource_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if "ix_step_exec_resource" in _index_names(bind):
        op.drop_index("ix_step_exec_resource", table_name="ucp_pipeline_step_execution")
    if "fk_pipeline_step_exec_resource" in _foreign_key_names(bind):
        op.drop_constraint("fk_pipeline_step_exec_resource", "ucp_pipeline_step_execution", type_="foreignkey")
    columns = _column_names(bind)
    if "resource_code" in columns:
        op.drop_column("ucp_pipeline_step_execution", "resource_code")
    if "resource_id" in columns:
        op.drop_column("ucp_pipeline_step_execution", "resource_id")
