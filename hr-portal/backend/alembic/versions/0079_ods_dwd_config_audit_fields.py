"""Z01: ODS→DWD config auto-created audit fields

Revision ID: 0079_ods_dwd_config_audit_fields
Revises: 0078_ods_dwd_automation_configs
Create Date: 2026-07-11
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0079_ods_dwd_config_audit_fields"
down_revision = "0078_ods_dwd_automation_configs"
branch_labels = None
depends_on = None


def _column_names() -> set[str]:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "ods_dwd_automation_configs" not in inspector.get_table_names():
        return set()
    return {c["name"] for c in inspector.get_columns("ods_dwd_automation_configs")}


def _add_column_if_missing(existing: set[str], name: str, column: sa.Column) -> None:
    if name not in existing:
        op.add_column("ods_dwd_automation_configs", column)
        existing.add(name)


def upgrade() -> None:
    existing = _column_names()
    _add_column_if_missing(existing, "auto_created", sa.Column("auto_created", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    _add_column_if_missing(existing, "trigger_event", sa.Column("trigger_event", sa.String(64), nullable=True))
    _add_column_if_missing(existing, "default_strategy", sa.Column("default_strategy", sa.String(64), nullable=True))
    _add_column_if_missing(existing, "risk_decision", sa.Column("risk_decision", sa.String(32), nullable=True))
    _add_column_if_missing(existing, "trace_id", sa.Column("trace_id", sa.String(64), nullable=True))
    _add_column_if_missing(existing, "source_system", sa.Column("source_system", sa.String(32), nullable=False, server_default="manual"))


def downgrade() -> None:
    existing = _column_names()
    for name in ["source_system", "trace_id", "risk_decision", "default_strategy", "trigger_event", "auto_created"]:
        if name in existing:
            op.drop_column("ods_dwd_automation_configs", name)
