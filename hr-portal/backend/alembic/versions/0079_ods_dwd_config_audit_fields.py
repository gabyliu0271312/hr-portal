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


def upgrade() -> None:
    op.add_column("ods_dwd_automation_configs", sa.Column("auto_created", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("ods_dwd_automation_configs", sa.Column("trigger_event", sa.String(64), nullable=True))
    op.add_column("ods_dwd_automation_configs", sa.Column("default_strategy", sa.String(64), nullable=True))
    op.add_column("ods_dwd_automation_configs", sa.Column("risk_decision", sa.String(32), nullable=True))
    op.add_column("ods_dwd_automation_configs", sa.Column("trace_id", sa.String(64), nullable=True))
    op.add_column("ods_dwd_automation_configs", sa.Column("source_system", sa.String(32), nullable=False, server_default="manual"))


def downgrade() -> None:
    op.drop_column("ods_dwd_automation_configs", "source_system")
    op.drop_column("ods_dwd_automation_configs", "trace_id")
    op.drop_column("ods_dwd_automation_configs", "risk_decision")
    op.drop_column("ods_dwd_automation_configs", "default_strategy")
    op.drop_column("ods_dwd_automation_configs", "trigger_event")
    op.drop_column("ods_dwd_automation_configs", "auto_created")
