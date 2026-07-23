"""add UCP account lifecycle rules and durable jobs

Revision ID: 0112
Revises: 0111
Create Date: 2026-07-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0112"
down_revision = "0111"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ucp_account_lifecycle_rule",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("rule_code", sa.String(64), nullable=False, unique=True),
        sa.Column("rule_name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_system_code", sa.String(64), nullable=False, server_default="FEISHU"),
        sa.Column("feishu_event_type", sa.String(128), nullable=True),
        sa.Column("internal_event_type", sa.String(128), nullable=False),
        sa.Column("target_system_code", sa.String(64), nullable=False),
        sa.Column("target_resource_code", sa.String(64), nullable=False),
        sa.Column("lifecycle_action", sa.String(16), nullable=False),
        sa.Column("filter_rule", sa.JSON(), nullable=True),
        sa.Column("field_mapping", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("account_match_strategy", sa.String(32), nullable=False, server_default="EMPLOYEE_ID"),
        sa.Column("approval_required", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_policy", sa.String(32), nullable=False, server_default="RETRY_AND_ALERT"),
        sa.Column("notification_config", sa.JSON(), nullable=True),
        sa.Column("status", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_ucp_lifecycle_rule_source_target", "ucp_account_lifecycle_rule", ["source_system_code", "target_system_code", "status"])
    op.create_index("ix_ucp_lifecycle_rule_event", "ucp_account_lifecycle_rule", ["source_system_code", "internal_event_type", "status"])
    op.create_table(
        "ucp_account_lifecycle_job",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("job_code", sa.String(64), nullable=False, unique=True),
        sa.Column("rule_id", sa.BigInteger(), sa.ForeignKey("ucp_account_lifecycle_rule.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("account_id", sa.BigInteger(), sa.ForeignKey("external_account.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_id", sa.BigInteger(), sa.ForeignKey("ucp_event.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="PENDING"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False, unique=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error_code", sa.String(64), nullable=True),
        sa.Column("last_error_message", sa.Text(), nullable=True),
        sa.Column("payload_snapshot", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_ucp_lifecycle_job_status_scheduled", "ucp_account_lifecycle_job", ["status", "scheduled_at"])
    op.create_index("ix_ucp_lifecycle_job_account", "ucp_account_lifecycle_job", ["account_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_ucp_lifecycle_job_account", table_name="ucp_account_lifecycle_job")
    op.drop_index("ix_ucp_lifecycle_job_status_scheduled", table_name="ucp_account_lifecycle_job")
    op.drop_table("ucp_account_lifecycle_job")
    op.drop_index("ix_ucp_lifecycle_rule_event", table_name="ucp_account_lifecycle_rule")
    op.drop_index("ix_ucp_lifecycle_rule_source_target", table_name="ucp_account_lifecycle_rule")
    op.drop_table("ucp_account_lifecycle_rule")
