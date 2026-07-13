"""0065 UCP Phase 3-6: OA organization sync.

Idempotent for legacy/prod schemas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0065"
down_revision: Union[str, None] = "0064"
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
    if not _table_exists("oa_sync_run"):
        op.create_table(
            "oa_sync_run",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("run_code", sa.String(64), nullable=False, unique=True),
            sa.Column("trigger_type", sa.String(16), nullable=False, server_default="SCHEDULED"),
            sa.Column("source_system", sa.String(32), nullable=False, server_default="BEISEN"),
            sa.Column("target_system", sa.String(32), nullable=False, server_default="OA"),
            sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column("total_orgs", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("updated_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("moved_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("deleted_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("unchanged_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("approval_pending_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("triggered_by", sa.String(64), nullable=True),
            sa.Column("event_id", sa.String(128), nullable=True),
            sa.Column("pipeline_run_id", sa.String(64), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    _create_index_if_missing("ix_oa_sync_run_status", "oa_sync_run", ["status"])
    _create_index_if_missing("ix_oa_sync_run_created", "oa_sync_run", ["created_at"])

    if not _table_exists("oa_sync_record"):
        op.create_table(
            "oa_sync_record",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("run_id", sa.BigInteger(), nullable=False),
            sa.Column("org_code", sa.String(64), nullable=False),
            sa.Column("org_name", sa.String(128), nullable=False),
            sa.Column("parent_org_code", sa.String(64), nullable=True),
            sa.Column("source_status", sa.String(16), nullable=True),
            sa.Column("source_path", sa.String(512), nullable=True),
            sa.Column("target_org_id", sa.String(64), nullable=True),
            sa.Column("target_status", sa.String(16), nullable=True),
            sa.Column("diff_type", sa.String(16), nullable=False),
            sa.Column("diff_detail", sa.JSON(), nullable=True),
            sa.Column("process_status", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column("process_error", sa.Text(), nullable=True),
            sa.Column("approval_id", sa.BigInteger(), nullable=True),
            sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    _create_index_if_missing("ix_oa_sync_record_run", "oa_sync_record", ["run_id"])
    _create_index_if_missing("ix_oa_sync_record_org", "oa_sync_record", ["org_code"])
    _create_index_if_missing("ix_oa_sync_record_diff", "oa_sync_record", ["diff_type", "process_status"])


def downgrade() -> None:
    if _table_exists("oa_sync_record"):
        op.drop_table("oa_sync_record")
    if _table_exists("oa_sync_run"):
        op.drop_table("oa_sync_run")
