"""add standard SaaS capability package models

Revision ID: 0114
Revises: 0113
Create Date: 2026-07-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0114"
down_revision = "0113"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("ucp_connector_package", sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("package_code", sa.String(64), nullable=False), sa.Column("package_name", sa.String(128), nullable=False), sa.Column("connection_mode", sa.String(32), nullable=False, server_default="STANDARD_SAAS"), sa.Column("version", sa.String(32), nullable=False, server_default="1.0.0"), sa.Column("status", sa.String(16), nullable=False, server_default="DRAFT"), sa.Column("host_allowlist", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("description", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.UniqueConstraint("package_code", name="uq_ucp_connector_package_code"))
    op.create_index("ix_ucp_connector_package_status", "ucp_connector_package", ["status"])
    op.create_table("ucp_operation_definition", sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("package_id", sa.BigInteger(), sa.ForeignKey("ucp_connector_package.id", ondelete="RESTRICT"), nullable=False), sa.Column("object_code", sa.String(64), nullable=False), sa.Column("operation_code", sa.String(64), nullable=False), sa.Column("operation_name", sa.String(128), nullable=False), sa.Column("adapter_code", sa.String(64), nullable=True), sa.Column("required_scopes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("input_schema", sa.JSON(), nullable=False, server_default=sa.text("'{}'")), sa.Column("output_schema", sa.JSON(), nullable=False, server_default=sa.text("'{}'")), sa.Column("risk_level", sa.String(32), nullable=False, server_default="read_low"), sa.Column("version", sa.String(32), nullable=False, server_default="1.0.0"), sa.Column("status", sa.String(16), nullable=False, server_default="DRAFT"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.UniqueConstraint("package_id", "object_code", "operation_code", "version", name="uq_ucp_operation_definition_version"))
    op.create_index("ix_ucp_operation_definition_package", "ucp_operation_definition", ["package_id", "status"])
    op.create_table("ucp_system_capability", sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("system_id", sa.BigInteger(), sa.ForeignKey("ucp_system.id", ondelete="RESTRICT"), nullable=False), sa.Column("operation_id", sa.BigInteger(), sa.ForeignKey("ucp_operation_definition.id", ondelete="RESTRICT"), nullable=False), sa.Column("credential_id", sa.BigInteger(), sa.ForeignKey("ucp_credentials.id", ondelete="SET NULL"), nullable=True), sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("connection_status", sa.String(32), nullable=False, server_default="UNVERIFIED"), sa.Column("verification_status", sa.String(32), nullable=False, server_default="NOT_TESTED"), sa.Column("runtime_config", sa.JSON(), nullable=False, server_default=sa.text("'{}'")), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.UniqueConstraint("system_id", "operation_id", name="uq_ucp_system_capability_operation"))
    op.create_index("ix_ucp_system_capability_system", "ucp_system_capability", ["system_id", "enabled"])
    op.create_table("ucp_capability_test_run", sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("capability_id", sa.BigInteger(), sa.ForeignKey("ucp_system_capability.id", ondelete="RESTRICT"), nullable=False), sa.Column("status", sa.String(32), nullable=False), sa.Column("request_summary", sa.JSON(), nullable=False, server_default=sa.text("'{}'")), sa.Column("response_summary", sa.JSON(), nullable=False, server_default=sa.text("'{}'")), sa.Column("error_code", sa.String(64), nullable=True), sa.Column("error_message", sa.Text(), nullable=True), sa.Column("trace_id", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.create_index("ix_ucp_capability_test_run_capability", "ucp_capability_test_run", ["capability_id", "created_at"])
    op.create_index("ix_ucp_capability_test_run_trace", "ucp_capability_test_run", ["trace_id"])


def downgrade() -> None:
    op.drop_index("ix_ucp_capability_test_run_trace", table_name="ucp_capability_test_run")
    op.drop_index("ix_ucp_capability_test_run_capability", table_name="ucp_capability_test_run")
    op.drop_table("ucp_capability_test_run")
    op.drop_index("ix_ucp_system_capability_system", table_name="ucp_system_capability")
    op.drop_table("ucp_system_capability")
    op.drop_index("ix_ucp_operation_definition_package", table_name="ucp_operation_definition")
    op.drop_table("ucp_operation_definition")
    op.drop_index("ix_ucp_connector_package_status", table_name="ucp_connector_package")
    op.drop_table("ucp_connector_package")
