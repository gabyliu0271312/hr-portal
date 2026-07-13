"""0066 UCP Phase 3-7: adapter registry.

Idempotent for legacy/prod schemas.
"""
from alembic import op
import sqlalchemy as sa

revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


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


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if _table_exists(table_name) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    if not _table_exists("adapter_definition"):
        op.create_table(
            "adapter_definition",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("adapter_code", sa.String(64), nullable=False, unique=True),
            sa.Column("adapter_type", sa.String(16), nullable=False),
            sa.Column("name", sa.String(128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("schema_json", sa.JSON(), nullable=True),
            sa.Column("sample_payload", sa.JSON(), nullable=True),
            sa.Column("version", sa.String(32), nullable=False, server_default="1.0.0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_by", sa.String(64), nullable=False, server_default="system"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    _create_index_if_missing("ix_adapter_definition_type", "adapter_definition", ["adapter_type"])
    _create_index_if_missing("ix_adapter_definition_active", "adapter_definition", ["is_active"])


def downgrade() -> None:
    if _table_exists("adapter_definition"):
        op.drop_table("adapter_definition")
