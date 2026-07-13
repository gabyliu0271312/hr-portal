"""0071 UCP Phase 5-3: monitor system/resource dimensions.

Idempotent for legacy/prod schemas.
"""
from alembic import op
import sqlalchemy as sa

revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(c["name"] == column_name for c in _inspector().get_columns(table_name))


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(i.get("name") == index_name for i in _inspector().get_indexes(table_name))


def _fk_exists(table_name: str, fk_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(fk.get("name") == fk_name for fk in _inspector().get_foreign_keys(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], **kwargs) -> None:
    if _table_exists(table_name) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, **kwargs)


def upgrade() -> None:
    if _table_exists("connector_pipeline_execution"):
        if not _column_exists("connector_pipeline_execution", "system_id"):
            op.add_column("connector_pipeline_execution", sa.Column("system_id", sa.BigInteger(), nullable=True))
        if not _column_exists("connector_pipeline_execution", "resource_id"):
            op.add_column("connector_pipeline_execution", sa.Column("resource_id", sa.BigInteger(), nullable=True))
        _create_index_if_missing("ix_pipeline_exec_system", "connector_pipeline_execution", ["system_id"])
        _create_index_if_missing("ix_pipeline_exec_resource", "connector_pipeline_execution", ["resource_id"])
        if _table_exists("connector_resource") and not _fk_exists("connector_pipeline_execution", "fk_pipeline_exec_resource"):
            op.create_foreign_key("fk_pipeline_exec_resource", "connector_pipeline_execution", "connector_resource", ["resource_id"], ["id"], ondelete="SET NULL")

    if _table_exists("ucp_event"):
        if not _column_exists("ucp_event", "system_code"):
            op.add_column("ucp_event", sa.Column("system_code", sa.String(length=64), nullable=True))
        if not _column_exists("ucp_event", "resource_id"):
            op.add_column("ucp_event", sa.Column("resource_id", sa.BigInteger(), nullable=True))
        _create_index_if_missing("ix_ucp_event_system_code", "ucp_event", ["system_code"])
        _create_index_if_missing("ix_ucp_event_resource", "ucp_event", ["resource_id"])
        if _table_exists("connector_resource") and not _fk_exists("ucp_event", "fk_ucp_event_resource"):
            op.create_foreign_key("fk_ucp_event_resource", "ucp_event", "connector_resource", ["resource_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    if _table_exists("ucp_event"):
        if _fk_exists("ucp_event", "fk_ucp_event_resource"):
            op.drop_constraint("fk_ucp_event_resource", "ucp_event", type_="foreignkey")
        for idx in ("ix_ucp_event_resource", "ix_ucp_event_system_code"):
            if _index_exists("ucp_event", idx):
                op.drop_index(idx, table_name="ucp_event")
        for col in ("resource_id", "system_code"):
            if _column_exists("ucp_event", col):
                op.drop_column("ucp_event", col)

    if _table_exists("connector_pipeline_execution"):
        if _fk_exists("connector_pipeline_execution", "fk_pipeline_exec_resource"):
            op.drop_constraint("fk_pipeline_exec_resource", "connector_pipeline_execution", type_="foreignkey")
        for idx in ("ix_pipeline_exec_resource", "ix_pipeline_exec_system"):
            if _index_exists("connector_pipeline_execution", idx):
                op.drop_index(idx, table_name="connector_pipeline_execution")
        for col in ("resource_id", "system_id"):
            if _column_exists("connector_pipeline_execution", col):
                op.drop_column("connector_pipeline_execution", col)
