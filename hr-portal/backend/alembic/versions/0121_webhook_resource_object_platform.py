"""add webhook resource-object and unified pipeline trigger platform

Revision ID: 0121
Revises: 0120
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0121"
down_revision = "0120"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ucp_event_definition",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("package_id", sa.BigInteger(), nullable=True),
        sa.Column("event_code", sa.String(128), nullable=False),
        sa.Column("event_name", sa.String(128), nullable=False),
        sa.Column("source_system_type", sa.String(64), nullable=False),
        sa.Column("payload_schema", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("normalization_schema", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("verification_strategy", sa.String(64), nullable=False, server_default="NONE"),
        sa.Column("version", sa.String(32), nullable=False, server_default="1.0.0"),
        sa.Column("status", sa.String(16), nullable=False, server_default="DRAFT"),
        sa.Column("risk_level", sa.String(32), nullable=False, server_default="read_low"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("event_code", "version", name="uq_ucp_event_definition_code_version"),
    )
    op.create_index("ix_ucp_event_definition_source_status", "ucp_event_definition", ["source_system_type", "status"])
    op.add_column("ucp_resource_data_object", sa.Column("object_type", sa.String(32), nullable=False, server_default="REPORT"))
    op.add_column("ucp_resource_data_object", sa.Column("event_definition_id", sa.BigInteger(), nullable=True))
    op.add_column("ucp_resource_data_object", sa.Column("event_config", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.add_column("ucp_resource_data_object", sa.Column("verification_status", sa.String(32), nullable=False, server_default="NOT_REQUIRED"))
    op.add_column("ucp_resource_data_object", sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ucp_resource_data_object", sa.Column("schema_version", sa.String(32), nullable=True))
    op.create_foreign_key("fk_ucp_resource_object_event_definition", "ucp_resource_data_object", "ucp_event_definition", ["event_definition_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_ucp_resource_object_type_active", "ucp_resource_data_object", ["resource_id", "object_type", "is_active"])
    op.create_index("ix_ucp_resource_object_event_verified", "ucp_resource_data_object", ["event_definition_id", "verification_status"])
    op.add_column("ucp_event", sa.Column("resource_object_id", sa.BigInteger(), nullable=True))
    op.add_column("ucp_event", sa.Column("event_definition_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_ucp_event_resource_object", "ucp_event", "ucp_resource_data_object", ["resource_object_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_ucp_event_definition", "ucp_event", "ucp_event_definition", ["event_definition_id"], ["id"], ondelete="SET NULL")
    op.add_column("ucp_event_trigger", sa.Column("trigger_type", sa.String(32), nullable=False, server_default="WEBHOOK"))
    op.add_column("ucp_event_trigger", sa.Column("source_resource_object_id", sa.BigInteger(), nullable=True))
    op.add_column("ucp_event_trigger", sa.Column("schedule_config", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.add_column("ucp_event_trigger", sa.Column("input_schema", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.add_column("ucp_event_trigger", sa.Column("idempotency_expression", sa.String(256), nullable=True))
    op.add_column("ucp_event_trigger", sa.Column("failure_policy", sa.String(32), nullable=False, server_default="RETRY"))
    op.create_foreign_key("fk_ucp_trigger_resource_object", "ucp_event_trigger", "ucp_resource_data_object", ["source_resource_object_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_ucp_trigger_type_active", "ucp_event_trigger", ["trigger_type", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_ucp_trigger_type_active", table_name="ucp_event_trigger")
    op.drop_constraint("fk_ucp_trigger_resource_object", "ucp_event_trigger", type_="foreignkey")
    for column in ("failure_policy", "idempotency_expression", "input_schema", "schedule_config", "source_resource_object_id", "trigger_type"):
        op.drop_column("ucp_event_trigger", column)
    op.drop_constraint("fk_ucp_event_definition", "ucp_event", type_="foreignkey")
    op.drop_constraint("fk_ucp_event_resource_object", "ucp_event", type_="foreignkey")
    op.drop_column("ucp_event", "event_definition_id")
    op.drop_column("ucp_event", "resource_object_id")
    op.drop_index("ix_ucp_resource_object_event_verified", table_name="ucp_resource_data_object")
    op.drop_index("ix_ucp_resource_object_type_active", table_name="ucp_resource_data_object")
    op.drop_constraint("fk_ucp_resource_object_event_definition", "ucp_resource_data_object", type_="foreignkey")
    for column in ("schema_version", "last_verified_at", "verification_status", "event_config", "event_definition_id", "object_type"):
        op.drop_column("ucp_resource_data_object", column)
    op.drop_index("ix_ucp_event_definition_source_status", table_name="ucp_event_definition")
    op.drop_table("ucp_event_definition")
