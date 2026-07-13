"""0062 UCP Phase 3-3: event delivery reliability.

Idempotent for legacy/prod schemas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0062"
down_revision: Union[str, None] = "0061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


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
    if not _table_exists("ucp_event_delivery"):
        op.create_table(
            "ucp_event_delivery",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("event_id", sa.BigInteger(), nullable=False),
            sa.Column("event_uuid", sa.String(128), nullable=False),
            sa.Column("trigger_id", sa.BigInteger(), nullable=True),
            sa.Column("trigger_code", sa.String(64), nullable=True),
            sa.Column("pipeline_run_id", sa.String(64), nullable=True),
            sa.Column("attempt", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column("error_code", sa.String(64), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_retry_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("trigger_source", sa.String(16), nullable=False, server_default="AUTO"),
            sa.Column("triggered_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    _create_index_if_missing("idx_ucp_delivery_event", "ucp_event_delivery", ["event_id"])
    _create_index_if_missing("idx_ucp_delivery_status", "ucp_event_delivery", ["status"])
    _create_index_if_missing("idx_ucp_delivery_next_retry", "ucp_event_delivery", ["next_retry_at"])
    _create_index_if_missing("idx_ucp_delivery_event_uuid", "ucp_event_delivery", ["event_uuid"])


def downgrade() -> None:
    if _table_exists("ucp_event_delivery"):
        op.drop_table("ucp_event_delivery")
