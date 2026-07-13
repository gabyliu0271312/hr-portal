"""0061 UCP Phase 3-1: event bus base schema.

Idempotent for legacy/prod schemas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0061"
down_revision: Union[str, None] = "0060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(i.get("name") == index_name for i in _inspector().get_indexes(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if _table_exists(table_name) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    if not _table_exists("ucp_event"):
        op.create_table(
            "ucp_event",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("event_id", sa.String(128), nullable=False, unique=True),
            sa.Column("event_type", sa.String(64), nullable=False),
            sa.Column("source", sa.String(32), nullable=False),
            sa.Column("trigger", sa.String(16), nullable=False, server_default="REALTIME"),
            sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="RECEIVED"),
            sa.Column("trace_id", sa.String(64), nullable=True),
            sa.Column("matched_trigger_id", sa.BigInteger(), nullable=True),
            sa.Column("matched_trigger_code", sa.String(64), nullable=True),
            sa.Column("pipeline_run_id", sa.String(64), nullable=True),
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_code", sa.String(64), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("event_timestamp", sa.DateTime(timezone=True), nullable=True),
            sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )

    _create_index_if_missing("idx_ucp_event_status", "ucp_event", ["status"])
    _create_index_if_missing("idx_ucp_event_type", "ucp_event", ["event_type"])
    _create_index_if_missing("idx_ucp_event_source", "ucp_event", ["source"])
    _create_index_if_missing("idx_ucp_event_received_at", "ucp_event", ["received_at"])

    if not _table_exists("connector_event_trigger"):
        op.create_table(
            "connector_event_trigger",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("trigger_code", sa.String(64), nullable=False, unique=True),
            sa.Column("trigger_name", sa.String(128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("event_source", sa.String(32), nullable=False),
            sa.Column("event_types", sa.String(512), nullable=False),
            sa.Column("pipeline_code", sa.String(64), nullable=False),
            sa.Column("filter_rule", sa.JSON(), nullable=True),
            sa.Column("signing_secret", sa.String(256), nullable=True),
            sa.Column("signature_header", sa.String(64), nullable=True, server_default="X-Signature"),
            sa.Column("feishu_verification_token", sa.String(256), nullable=True),
            sa.Column("feishu_encrypt_key", sa.String(256), nullable=True),
            sa.Column("run_as_type", sa.String(32), nullable=False, server_default="SERVICE_ACCOUNT"),
            sa.Column("service_account_code", sa.String(64), nullable=True),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("webhook_path", sa.String(128), nullable=True, unique=True),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("updated_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )


def downgrade() -> None:
    if _table_exists("connector_event_trigger"):
        op.drop_table("connector_event_trigger")
    if _table_exists("ucp_event"):
        op.drop_table("ucp_event")
