"""0064 UCP Phase 3-5: high-risk action approval.

Idempotent for legacy/prod schemas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0064"
down_revision: Union[str, None] = "0063"
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
    if not _table_exists("approval_request"):
        op.create_table(
            "approval_request",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("request_code", sa.String(64), nullable=False, unique=True),
            sa.Column("business_type", sa.String(64), nullable=False),
            sa.Column("business_key", sa.String(128), nullable=False),
            sa.Column("business_summary", sa.String(255), nullable=True),
            sa.Column("action", sa.String(32), nullable=False),
            sa.Column("action_payload", sa.JSON(), nullable=True),
            sa.Column("approval_mode", sa.String(16), nullable=False, server_default="SINGLE"),
            sa.Column("confirmation_type", sa.String(16), nullable=False, server_default="NONE"),
            sa.Column("confirmation_token", sa.String(64), nullable=True),
            sa.Column("approvers", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column("current_step", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_steps", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("approved_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rejected_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("trigger_source", sa.String(16), nullable=False, server_default="MANUAL"),
            sa.Column("triggered_by", sa.String(64), nullable=True),
            sa.Column("pipeline_run_id", sa.String(64), nullable=True),
            sa.Column("event_id", sa.String(128), nullable=True),
            sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("execution_result", sa.String(16), nullable=True),
            sa.Column("execution_error", sa.Text(), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )
    _create_index_if_missing("ix_approval_request_business", "approval_request", ["business_type", "business_key"])
    _create_index_if_missing("ix_approval_request_status", "approval_request", ["status"])
    _create_index_if_missing("ix_approval_request_triggered", "approval_request", ["triggered_by"])
    _create_index_if_missing("ix_approval_request_pipeline", "approval_request", ["pipeline_run_id"])

    if not _table_exists("approval_step"):
        op.create_table(
            "approval_step",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("request_id", sa.BigInteger(), nullable=False),
            sa.Column("step_index", sa.Integer(), nullable=False),
            sa.Column("approver_id", sa.String(64), nullable=False),
            sa.Column("approver_name", sa.String(64), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column("action_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("transferred_to", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    _create_index_if_missing("ix_approval_step_request", "approval_step", ["request_id"])
    _create_index_if_missing("ix_approval_step_approver", "approval_step", ["approver_id", "status"])

    if not _table_exists("approval_action"):
        op.create_table(
            "approval_action",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("request_id", sa.BigInteger(), nullable=False),
            sa.Column("step_id", sa.BigInteger(), nullable=True),
            sa.Column("action", sa.String(16), nullable=False),
            sa.Column("operator_id", sa.String(64), nullable=True),
            sa.Column("operator_name", sa.String(64), nullable=True),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    _create_index_if_missing("ix_approval_action_request", "approval_action", ["request_id"])
    _create_index_if_missing("ix_approval_action_created", "approval_action", ["created_at"])


def downgrade() -> None:
    if _table_exists("approval_action"):
        op.drop_table("approval_action")
    if _table_exists("approval_step"):
        op.drop_table("approval_step")
    if _table_exists("approval_request"):
        op.drop_table("approval_request")
