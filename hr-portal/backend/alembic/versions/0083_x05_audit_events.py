# -*- coding: utf-8 -*-
"""X05 audit: warehouse_automation_audit_events

Revision ID: 0083_x05_audit_events
Revises: 0082_x05_asset_consumers
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0083_x05_audit_events"
down_revision = "0082_x05_asset_consumers"
branch_labels = None
depends_on = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _index_exists(inspector, table_name: str, name: str) -> bool:
    return any(i.get("name") == name for i in inspector.get_indexes(table_name))


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not _table_exists(inspector, "warehouse_automation_audit_events"):
        op.create_table(
            "warehouse_automation_audit_events",
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("trace_id", sa.String(64), nullable=False, comment="trace id"),
            sa.Column("metric_id", sa.BigInteger, nullable=True),
            sa.Column("asset_type", sa.String(16), nullable=True, comment="dws / ads"),
            sa.Column("asset_id", sa.BigInteger, nullable=True),
            sa.Column("action", sa.String(32), nullable=False,
                      comment="diagnose / generate_dws_draft / preview / quality_gate / publish_dws / rollback_dws / generate_ads_draft / publish_ads / impact_analysis / generate_bi_contract / set_refresh_policy / rollback_ads"),
            sa.Column("status", sa.String(16), nullable=False, default="started", comment="started / success / failed / blocked / warning"),
            sa.Column("actor_id", sa.BigInteger, nullable=True),
            sa.Column("input_json", sa.JSON, nullable=True),
            sa.Column("output_json", sa.JSON, nullable=True),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("duration_ms", sa.Integer, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    inspector = sa.inspect(conn)
    if not _index_exists(inspector, "warehouse_automation_audit_events", "ix_audit_trace"):
        op.create_index("ix_audit_trace", "warehouse_automation_audit_events", ["trace_id"])
    inspector = sa.inspect(conn)
    if not _index_exists(inspector, "warehouse_automation_audit_events", "ix_audit_metric"):
        op.create_index("ix_audit_metric", "warehouse_automation_audit_events", ["metric_id"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "warehouse_automation_audit_events"):
        if _index_exists(inspector, "warehouse_automation_audit_events", "ix_audit_metric"):
            op.drop_index("ix_audit_metric", table_name="warehouse_automation_audit_events")
        inspector = sa.inspect(conn)
        if _index_exists(inspector, "warehouse_automation_audit_events", "ix_audit_trace"):
            op.drop_index("ix_audit_trace", table_name="warehouse_automation_audit_events")
        op.drop_table("warehouse_automation_audit_events")
