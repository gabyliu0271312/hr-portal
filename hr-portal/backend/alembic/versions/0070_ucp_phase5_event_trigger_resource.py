"""0070 UCP Phase 5-2: event trigger resource columns.

Idempotent for legacy/prod schemas.
"""
from alembic import op
import sqlalchemy as sa

revision = "0070"
down_revision = "0069"
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
    # PostgreSQL indexes are relations in the schema namespace.  In drifted
    # production DBs an index name can already exist even when SQLAlchemy
    # inspector does not report it for the expected table, so check pg_class
    # globally to avoid DuplicateTableError on CREATE INDEX.
    result = op.get_bind().execute(
        sa.text(
            """
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = :name
              AND n.nspname = current_schema()
              AND c.relkind IN ('i', 'I')
            LIMIT 1
            """
        ),
        {"name": index_name},
    ).scalar()
    return result is not None


def _fk_exists(table_name: str, fk_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(fk.get("name") == fk_name for fk in _inspector().get_foreign_keys(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], **kwargs) -> None:
    if _table_exists(table_name) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, **kwargs)


def upgrade() -> None:
    if not _table_exists("connector_event_trigger"):
        return
    if not _column_exists("connector_event_trigger", "source_resource_id"):
        op.add_column("connector_event_trigger", sa.Column("source_resource_id", sa.BigInteger(), nullable=True))
    if not _column_exists("connector_event_trigger", "source_system_code"):
        op.add_column("connector_event_trigger", sa.Column("source_system_code", sa.String(length=64), nullable=True))
    _create_index_if_missing("ix_connector_event_trigger_resource", "connector_event_trigger", ["source_resource_id"])
    _create_index_if_missing("ix_connector_event_trigger_system_code", "connector_event_trigger", ["source_system_code"])
    if _table_exists("connector_resource") and not _fk_exists("connector_event_trigger", "fk_connector_event_trigger_resource"):
        op.create_foreign_key("fk_connector_event_trigger_resource", "connector_event_trigger", "connector_resource", ["source_resource_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    if not _table_exists("connector_event_trigger"):
        return
    if _fk_exists("connector_event_trigger", "fk_connector_event_trigger_resource"):
        op.drop_constraint("fk_connector_event_trigger_resource", "connector_event_trigger", type_="foreignkey")
    for idx in ("ix_connector_event_trigger_system_code", "ix_connector_event_trigger_resource"):
        if _index_exists("connector_event_trigger", idx):
            op.drop_index(idx, table_name="connector_event_trigger")
    for col in ("source_system_code", "source_resource_id"):
        if _column_exists("connector_event_trigger", col):
            op.drop_column("connector_event_trigger", col)
