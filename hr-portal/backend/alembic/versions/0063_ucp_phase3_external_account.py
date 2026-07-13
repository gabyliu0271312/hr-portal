"""0063 UCP Phase 3-4: external account lifecycle.

Idempotent for legacy/prod schemas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0063"
down_revision: Union[str, None] = "0062"
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
    if not _table_exists("external_account"):
        op.create_table(
            "external_account",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("system_code", sa.String(32), nullable=False),
            sa.Column("employee_id", sa.String(64), nullable=False),
            sa.Column("employee_name", sa.String(64), nullable=True),
            sa.Column("employee_mobile_masked", sa.String(32), nullable=True),
            sa.Column("external_user_id", sa.String(128), nullable=False),
            sa.Column("external_account_name", sa.String(128), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column("last_action", sa.String(16), nullable=True),
            sa.Column("last_pipeline_run_id", sa.String(64), nullable=True),
            sa.Column("last_event_id", sa.String(128), nullable=True),
            sa.Column("last_error_code", sa.String(64), nullable=True),
            sa.Column("last_error_message", sa.Text(), nullable=True),
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("extra", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("system_code", "external_user_id", name="uq_external_account_system_user"),
        )
    _create_index_if_missing("ix_external_account_employee", "external_account", ["system_code", "employee_id"])
    _create_index_if_missing("ix_external_account_status", "external_account", ["status"])

    if not _table_exists("external_account_audit"):
        op.create_table(
            "external_account_audit",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("account_id", sa.BigInteger(), nullable=False),
            sa.Column("system_code", sa.String(32), nullable=False),
            sa.Column("employee_id", sa.String(64), nullable=False),
            sa.Column("external_user_id", sa.String(128), nullable=True),
            sa.Column("action", sa.String(16), nullable=False),
            sa.Column("result", sa.String(16), nullable=False),
            sa.Column("trigger_source", sa.String(16), nullable=False, server_default="PIPELINE"),
            sa.Column("pipeline_run_id", sa.String(64), nullable=True),
            sa.Column("event_id", sa.String(128), nullable=True),
            sa.Column("approval_id", sa.BigInteger(), nullable=True),
            sa.Column("operator", sa.String(64), nullable=True),
            sa.Column("request_payload", sa.JSON(), nullable=True),
            sa.Column("response_payload", sa.JSON(), nullable=True),
            sa.Column("error_code", sa.String(64), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    _create_index_if_missing("ix_external_account_audit_account", "external_account_audit", ["account_id"])
    _create_index_if_missing("ix_external_account_audit_employee", "external_account_audit", ["system_code", "employee_id"])
    _create_index_if_missing("ix_external_account_audit_action", "external_account_audit", ["action", "result"])
    _create_index_if_missing("ix_external_account_audit_created", "external_account_audit", ["created_at"])


def downgrade() -> None:
    if _table_exists("external_account_audit"):
        op.drop_table("external_account_audit")
    if _table_exists("external_account"):
        op.drop_table("external_account")
