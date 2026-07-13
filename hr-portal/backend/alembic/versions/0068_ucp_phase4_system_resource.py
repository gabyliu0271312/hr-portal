"""0068 UCP Phase 4: connector system/resource model.

Idempotent for legacy/prod schemas.
"""
from alembic import op
import sqlalchemy as sa

revision = "0068"
down_revision = "0067"
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
    if not _table_exists("connector_system"):
        op.create_table(
            "connector_system",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("system_code", sa.String(64), nullable=False, unique=True),
            sa.Column("system_name", sa.String(128), nullable=False),
            sa.Column("system_type", sa.String(32), nullable=False, server_default="CUSTOM"),
            sa.Column("icon", sa.String(64), nullable=True),
            sa.Column("owner", sa.String(64), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.SmallInteger(), nullable=False, server_default="1"),
            sa.Column("created_by", sa.String(64), nullable=True, server_default="system"),
            sa.Column("updated_by", sa.String(64), nullable=True, server_default="system"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    _create_index_if_missing("ix_connector_system_type", "connector_system", ["system_type"])

    if not _table_exists("connector_resource"):
        op.create_table(
            "connector_resource",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("system_id", sa.BigInteger(), nullable=False),
            sa.Column("resource_code", sa.String(64), nullable=False),
            sa.Column("resource_name", sa.String(128), nullable=False),
            sa.Column("adapter_code", sa.String(64), nullable=True),
            sa.Column("credential_id", sa.BigInteger(), nullable=True),
            sa.Column("protocol", sa.JSON(), nullable=True),
            sa.Column("report_config", sa.JSON(), nullable=True),
            sa.Column("mapping_config", sa.JSON(), nullable=True),
            sa.Column("file_config", sa.JSON(), nullable=True),
            sa.Column("scheduling", sa.JSON(), nullable=True),
            sa.Column("notification_config", sa.JSON(), nullable=True),
            sa.Column("retry_config", sa.JSON(), nullable=True),
            sa.Column("circuit_breaker_config", sa.JSON(), nullable=True),
            sa.Column("test_status", sa.String(32), nullable=False, server_default="NOT_TESTED"),
            sa.Column("test_result", sa.JSON(), nullable=True),
            sa.Column("test_time", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.SmallInteger(), nullable=False, server_default="0"),
            sa.Column("created_by", sa.String(64), nullable=True, server_default="system"),
            sa.Column("updated_by", sa.String(64), nullable=True, server_default="system"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("system_id", "resource_code", name="uq_resource_system_code"),
        )
    if _table_exists("connector_system") and not _fk_exists("connector_resource", "fk_connector_resource_system"):
        op.create_foreign_key(
            "fk_connector_resource_system",
            "connector_resource",
            "connector_system",
            ["system_id"],
            ["id"],
            ondelete="CASCADE",
        )
    if _table_exists("connector_credentials") and not _fk_exists("connector_resource", "fk_connector_resource_credential"):
        op.create_foreign_key(
            "fk_connector_resource_credential",
            "connector_resource",
            "connector_credentials",
            ["credential_id"],
            ["id"],
            ondelete="SET NULL",
        )
    _create_index_if_missing("ix_connector_resource_system", "connector_resource", ["system_id"])
    _create_index_if_missing("ix_connector_resource_credential", "connector_resource", ["credential_id"])
    _create_index_if_missing("ix_connector_resource_status", "connector_resource", ["status"])


def downgrade() -> None:
    if _table_exists("connector_resource"):
        op.drop_table("connector_resource")
    if _table_exists("connector_system"):
        op.drop_table("connector_system")
