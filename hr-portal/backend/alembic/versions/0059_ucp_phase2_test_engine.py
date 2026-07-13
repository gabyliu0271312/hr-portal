"""0059 UCP Phase 2-1: connector test engine

Add connector_test_log and test_config. Idempotent for legacy/prod schemas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0059_ucp_phase2_test_engine"
down_revision: Union[str, None] = "0058_rename_synced_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if _table_exists(table_name) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    if not _table_exists("connector_test_log"):
        op.create_table(
            "connector_test_log",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("connector_id", sa.BigInteger(), nullable=True),
            sa.Column("connector_code", sa.String(64), nullable=False),
            sa.Column("test_type", sa.String(32), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("request_params_masked", sa.JSON(), nullable=True),
            sa.Column("response_sample", sa.JSON(), nullable=True),
            sa.Column("error_code", sa.String(64), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("tested_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    _create_index_if_missing("ix_test_log_connector_code", "connector_test_log", ["connector_code"])
    _create_index_if_missing("ix_test_log_created_at", "connector_test_log", ["created_at"])
    _create_index_if_missing("ix_test_log_connector_type", "connector_test_log", ["connector_code", "test_type"])

    if _table_exists("connector_system_config") and not _column_exists("connector_system_config", "test_config"):
        op.add_column(
            "connector_system_config",
            sa.Column("test_config", sa.JSON(), nullable=True, comment="test config"),
        )


def downgrade() -> None:
    if _table_exists("connector_system_config") and _column_exists("connector_system_config", "test_config"):
        op.drop_column("connector_system_config", "test_config")
    if _table_exists("connector_test_log"):
        op.drop_table("connector_test_log")
