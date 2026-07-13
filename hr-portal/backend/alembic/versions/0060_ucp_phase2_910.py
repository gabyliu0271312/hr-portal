"""0060 UCP Phase 2-9/2-10: rate limit config and notification templates.

Idempotent for legacy/prod schemas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0060"
down_revision: Union[str, None] = "0059_ucp_phase2_test_engine"
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
    if _table_exists("connector_system_config") and not _column_exists("connector_system_config", "rate_limit_config"):
        op.add_column("connector_system_config", sa.Column("rate_limit_config", sa.JSON(), nullable=True))

    if not _table_exists("connector_notification_template"):
        op.create_table(
            "connector_notification_template",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("template_code", sa.String(64), nullable=False, unique=True),
            sa.Column("template_name", sa.String(128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("trigger_scene", sa.String(32), nullable=False, server_default="on_success"),
            sa.Column("channel", sa.String(32), nullable=False, server_default="feishu"),
            sa.Column("message_format", sa.String(16), nullable=False, server_default="markdown"),
            sa.Column("title_template", sa.String(255), nullable=False),
            sa.Column("content_template", sa.Text(), nullable=False),
            sa.Column("receivers", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("variable_schema", sa.JSON(), nullable=True),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("updated_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
            sa.UniqueConstraint("template_code", name="uq_connector_template_code"),
        )

    _create_index_if_missing("ix_template_trigger_scene", "connector_notification_template", ["trigger_scene"])
    _create_index_if_missing("ix_template_active", "connector_notification_template", ["is_active"])


def downgrade() -> None:
    if _table_exists("connector_notification_template"):
        if _index_exists("connector_notification_template", "ix_template_active"):
            op.drop_index("ix_template_active", table_name="connector_notification_template")
        if _index_exists("connector_notification_template", "ix_template_trigger_scene"):
            op.drop_index("ix_template_trigger_scene", table_name="connector_notification_template")
        op.drop_table("connector_notification_template")
    if _table_exists("connector_system_config") and _column_exists("connector_system_config", "rate_limit_config"):
        op.drop_column("connector_system_config", "rate_limit_config")
