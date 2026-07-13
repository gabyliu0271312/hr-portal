"""0069 UCP Phase 4: bind credentials to connector system.

Idempotent for legacy/prod schemas.
"""
from alembic import op
import sqlalchemy as sa

revision = "0069"
down_revision = "0068"
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
    if not _table_exists("connector_credentials"):
        return
    if not _column_exists("connector_credentials", "system_id"):
        op.add_column("connector_credentials", sa.Column("system_id", sa.BigInteger(), nullable=True))
    if not _column_exists("connector_credentials", "env_tag"):
        op.add_column("connector_credentials", sa.Column("env_tag", sa.String(length=32), nullable=True))
    if not _column_exists("connector_credentials", "is_primary"):
        op.add_column("connector_credentials", sa.Column("is_primary", sa.Integer(), nullable=False, server_default="1"))
    _create_index_if_missing("ix_connector_credentials_system", "connector_credentials", ["system_id"])
    if _table_exists("connector_system") and not _fk_exists("connector_credentials", "fk_connector_credentials_system"):
        op.create_foreign_key("fk_connector_credentials_system", "connector_credentials", "connector_system", ["system_id"], ["id"], ondelete="RESTRICT")
    _create_index_if_missing(
        "uq_connector_credentials_primary_per_system",
        "connector_credentials",
        ["system_id"],
        unique=True,
        postgresql_where=sa.text("is_primary = 1 AND system_id IS NOT NULL"),
    )


def downgrade() -> None:
    if not _table_exists("connector_credentials"):
        return
    if _index_exists("connector_credentials", "uq_connector_credentials_primary_per_system"):
        op.drop_index("uq_connector_credentials_primary_per_system", table_name="connector_credentials")
    if _fk_exists("connector_credentials", "fk_connector_credentials_system"):
        op.drop_constraint("fk_connector_credentials_system", "connector_credentials", type_="foreignkey")
    if _index_exists("connector_credentials", "ix_connector_credentials_system"):
        op.drop_index("ix_connector_credentials_system", table_name="connector_credentials")
    for column in ("is_primary", "env_tag", "system_id"):
        if _column_exists("connector_credentials", column):
            op.drop_column("connector_credentials", column)
