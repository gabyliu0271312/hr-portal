"""017 mapping metadata tables.

新增映射组件元数据表: 规则集目录、版本、绑定、依赖、发布审计、重算运行记录。
不复制 ODS→DWD 规则正文 (standardization_rules 仍为唯一事实源)。
"""

revision = "0197_mapping_metadata"
down_revision = "0195_quality_rule_dependency_index"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # mapping_rule_set_catalog
    op.create_table(
        "mapping_rule_set_catalog",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(128), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("current_version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("owner", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_mapping_rule_set_code"),
    )
    op.create_index("ix_mapping_rule_set_owner", "mapping_rule_set_catalog", ["owner"])

    # mapping_rule_set_versions
    op.create_table(
        "mapping_rule_set_versions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("catalog_id", sa.BigInteger, sa.ForeignKey("mapping_rule_set_catalog.id"), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("mapping_schema_version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("source_schema_hash", sa.String(256), nullable=False, server_default=""),
        sa.Column("target_schema_hash", sa.String(256), nullable=False, server_default=""),
        sa.Column("adapter", sa.String(64), nullable=False, server_default=""),
        sa.Column("storage_mode", sa.String(32), nullable=False, server_default="component_v1"),
        sa.Column("compatibility_state", sa.JSON, nullable=True),
        sa.Column("standardization_rule_ids", sa.JSON, nullable=True),
        sa.Column("caller_config_ref", sa.JSON, nullable=True),
        sa.Column("published_by", sa.String(128), nullable=True),
        sa.Column("published_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("catalog_id", "version", name="uq_mapping_version"),
    )
    op.create_index("ix_mapping_version_catalog", "mapping_rule_set_versions", ["catalog_id"])

    # mapping_bindings
    op.create_table(
        "mapping_bindings",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("caller", sa.String(32), nullable=False),
        sa.Column("asset_id", sa.String(256), nullable=False),
        sa.Column("binding_key", sa.String(256), nullable=False, server_default="default"),
        sa.Column("catalog_id", sa.BigInteger, sa.ForeignKey("mapping_rule_set_catalog.id"), nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("expected_version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("storage_mode", sa.String(32), nullable=False, server_default="component_v1"),
        sa.Column("legacy_snapshot", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("caller", "asset_id", "binding_key", name="uq_mapping_binding"),
    )
    op.create_index("ix_mapping_binding_caller", "mapping_bindings", ["caller", "asset_id"])

    # mapping_dependencies
    op.create_table(
        "mapping_dependencies",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("binding_id", sa.BigInteger, sa.ForeignKey("mapping_bindings.id"), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_id", sa.String(256), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.String(256), nullable=False),
        sa.Column("rebuild_policy", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_mapping_dep_source", "mapping_dependencies", ["source_type", "source_id"])
    op.create_index("ix_mapping_dep_target", "mapping_dependencies", ["target_type", "target_id"])

    # mapping_publish_audits
    op.create_table(
        "mapping_publish_audits",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("binding_id", sa.BigInteger, sa.ForeignKey("mapping_bindings.id"), nullable=False),
        sa.Column("event_id", sa.String(128), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("mapping_version", sa.Integer, nullable=False),
        sa.Column("schema_hash", sa.String(256), nullable=False, server_default=""),
        sa.Column("rebuild_policy", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("actor", sa.String(128), nullable=True),
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("occurred_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_mapping_audit_binding", "mapping_publish_audits", ["binding_id"])
    op.create_index("ix_mapping_audit_event", "mapping_publish_audits", ["event_id"])
    op.create_unique_constraint(
        "uq_mapping_audit_idempotency",
        "mapping_publish_audits",
        ["idempotency_key"],
    )

    # mapping_rebuild_runs
    op.create_table(
        "mapping_rebuild_runs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("binding_id", sa.BigInteger, sa.ForeignKey("mapping_bindings.id"), nullable=False),
        sa.Column("audit_id", sa.BigInteger, sa.ForeignKey("mapping_publish_audits.id"), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.String(256), nullable=False),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_mapping_rebuild_binding", "mapping_rebuild_runs", ["binding_id"])
    op.create_index("ix_mapping_rebuild_status", "mapping_rebuild_runs", ["status"])


def downgrade() -> None:
    op.drop_table("mapping_rebuild_runs")
    op.drop_table("mapping_publish_audits")
    op.drop_table("mapping_dependencies")
    op.drop_table("mapping_bindings")
    op.drop_table("mapping_rule_set_versions")
    op.drop_table("mapping_rule_set_catalog")
