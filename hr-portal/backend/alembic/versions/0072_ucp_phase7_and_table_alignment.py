"""Phase 5-7 tables + connector_* → ucp_* rename alignment

Revision ID: 0072
Revises: 0071
Create Date: 2026-07-12

This migration:
  1. Renames connector_* tables → ucp_* (safe — checks existence first)
  2. Applies 0069-0071 ALTERs on renamed ucp_* tables (column existence guarded)
  3. Adds missing columns (ucp_system: domain/tags/sensitivity; ucp_credentials: expires_at/remind_before_days)
  4. Creates Phase 4-7 tables missing from prior migrations
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0072"
down_revision = "0071"
branch_labels = None
depends_on = None


# ── helpers ──

def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM pg_catalog.pg_tables "
            "WHERE tablename = :n AND schemaname = 'public')"
        ),
        {"n": name},
    )
    return bool(row.scalar())


def _safe_rename(old: str, new: str) -> None:
    """Rename table only if old exists and new does not."""
    if _table_exists(old) and not _table_exists(new):
        op.rename_table(old, new)


# ── rename map: connector_* → ucp_* ──

RENAMES = [
    # 0056 Phase 1A
    ("connector_credentials", "ucp_credentials"),
    ("connector_system_config", "ucp_system_config"),
    ("connector_config_version", "ucp_config_version"),
    ("connector_pipeline_config", "ucp_pipeline_config"),
    ("connector_pipeline_execution", "ucp_pipeline_execution"),
    ("connector_pipeline_step_execution", "ucp_pipeline_step_execution"),
    ("connector_loop_item_execution", "ucp_loop_item_execution"),
    ("connector_execution_log", "ucp_execution_log"),
    ("connector_notification_log", "ucp_notification_log"),
    # 0059 Phase 2-1
    ("connector_test_log", "ucp_test_log"),
    # 0060 Phase 2-9/10
    ("connector_notification_template", "ucp_notification_template"),
    # 0061 Phase 3-1
    ("connector_event_trigger", "ucp_event_trigger"),
    # 0068 Phase 4
    ("connector_system", "ucp_system"),
    ("connector_resource", "ucp_resource"),
]


# ── upgrade ──

def upgrade() -> None:
    # 1. Rename connector_* → ucp_*
    for old, new in RENAMES:
        _safe_rename(old, new)

    # 2. Add columns to ucp_system (Phase 4)
    for col_name, col_type, col_kw in [
        ("domain", sa.String(64), {"nullable": True}),
        ("tags", sa.JSON(), {"nullable": True}),
        ("sensitivity", sa.String(16), {"nullable": True, "server_default": "internal"}),
    ]:
        if _table_exists("ucp_system"):
            conn = op.get_bind()
            has_col = conn.execute(
                sa.text(
                    "SELECT EXISTS (SELECT FROM information_schema.columns "
                    "WHERE table_name = 'ucp_system' AND column_name = :c)"
                ),
                {"c": col_name},
            ).scalar()
            if not has_col:
                op.add_column("ucp_system", sa.Column(col_name, col_type, **col_kw))

    # 3. Add columns to ucp_credentials (Phase 4 expiry)
    if _table_exists("ucp_credentials"):
        conn = op.get_bind()
        for col_name, col_type, col_kw in [
            ("expires_at", sa.DateTime(timezone=True), {"nullable": True}),
            ("remind_before_days", sa.Integer(), {"nullable": True, "server_default": "7"}),
        ]:
            has_col = conn.execute(
                sa.text(
                    "SELECT EXISTS (SELECT FROM information_schema.columns "
                    "WHERE table_name = 'ucp_credentials' AND column_name = :c)"
                ),
                {"c": col_name},
            ).scalar()
            if not has_col:
                op.add_column("ucp_credentials", sa.Column(col_name, col_type, **col_kw))

    # ── 4. Apply 0069 ALTERs: credential → system bindings ──
    if _table_exists("ucp_credentials"):
        conn = op.get_bind()
        for col_name, col_type, col_kw in [
            ("system_id", sa.BigInteger(), {"nullable": True}),
            ("env_tag", sa.String(32), {"nullable": True}),
            ("is_primary", sa.Integer(), {"nullable": False, "server_default": "1"}),
        ]:
            has_col = conn.execute(
                sa.text(
                    "SELECT EXISTS (SELECT FROM information_schema.columns "
                    "WHERE table_name = 'ucp_credentials' AND column_name = :c)"
                ),
                {"c": col_name},
            ).scalar()
            if not has_col:
                op.add_column("ucp_credentials", sa.Column(col_name, col_type, **col_kw))

        # index + FK for system_id
        insp = sa.inspect(conn)
        idx_names = {i["name"] for i in insp.get_indexes("ucp_credentials")}
        fk_names = {f["name"] for f in insp.get_foreign_keys("ucp_credentials")}

        if "ix_ucp_credentials_system" not in idx_names:
            op.create_index("ix_ucp_credentials_system", "ucp_credentials", ["system_id"])
        if "fk_ucp_credentials_system" not in fk_names and _table_exists("ucp_system"):
            op.create_foreign_key(
                "fk_ucp_credentials_system", "ucp_credentials", "ucp_system",
                ["system_id"], ["id"], ondelete="RESTRICT",
            )
        # partial unique index
        if "uq_ucp_credentials_primary_per_system" not in idx_names:
            op.create_index(
                "uq_ucp_credentials_primary_per_system", "ucp_credentials", ["system_id"],
                unique=True,
                postgresql_where=sa.text("is_primary = 1 AND system_id IS NOT NULL"),
            )

    # ── 5. Apply 0070 ALTERs: event_trigger → resource bindings ──
    if _table_exists("ucp_event_trigger"):
        conn = op.get_bind()
        for col_name, col_type, col_kw in [
            ("source_resource_id", sa.BigInteger(), {"nullable": True}),
            ("source_system_code", sa.String(64), {"nullable": True}),
        ]:
            has_col = conn.execute(
                sa.text(
                    "SELECT EXISTS (SELECT FROM information_schema.columns "
                    "WHERE table_name = 'ucp_event_trigger' AND column_name = :c)"
                ),
                {"c": col_name},
            ).scalar()
            if not has_col:
                op.add_column("ucp_event_trigger", sa.Column(col_name, col_type, **col_kw))

        insp = sa.inspect(conn)
        idx_names = {i["name"] for i in insp.get_indexes("ucp_event_trigger")}
        fk_names = {f["name"] for f in insp.get_foreign_keys("ucp_event_trigger")}

        if "ix_ucp_event_trigger_resource" not in idx_names:
            op.create_index("ix_ucp_event_trigger_resource", "ucp_event_trigger", ["source_resource_id"])
        if "ix_ucp_event_trigger_system_code" not in idx_names:
            op.create_index("ix_ucp_event_trigger_system_code", "ucp_event_trigger", ["source_system_code"])
        if "fk_ucp_event_trigger_resource" not in fk_names and _table_exists("ucp_resource"):
            op.create_foreign_key(
                "fk_ucp_event_trigger_resource", "ucp_event_trigger", "ucp_resource",
                ["source_resource_id"], ["id"], ondelete="SET NULL",
            )

    # ── 6. Apply 0071 ALTERs: pipeline_execution + event → resource bindings ──
    if _table_exists("ucp_pipeline_execution"):
        conn = op.get_bind()
        for col_name, col_type, col_kw in [
            ("system_id", sa.BigInteger(), {"nullable": True}),
            ("resource_id", sa.BigInteger(), {"nullable": True}),
        ]:
            has_col = conn.execute(
                sa.text(
                    "SELECT EXISTS (SELECT FROM information_schema.columns "
                    "WHERE table_name = 'ucp_pipeline_execution' AND column_name = :c)"
                ),
                {"c": col_name},
            ).scalar()
            if not has_col:
                op.add_column("ucp_pipeline_execution", sa.Column(col_name, col_type, **col_kw))

        insp = sa.inspect(conn)
        idx_names = {i["name"] for i in insp.get_indexes("ucp_pipeline_execution")}
        fk_names = {f["name"] for f in insp.get_foreign_keys("ucp_pipeline_execution")}

        if "ix_pipeline_exec_system" not in idx_names:
            op.create_index("ix_pipeline_exec_system", "ucp_pipeline_execution", ["system_id"])
        if "ix_pipeline_exec_resource" not in idx_names:
            op.create_index("ix_pipeline_exec_resource", "ucp_pipeline_execution", ["resource_id"])
        if "fk_pipeline_exec_resource" not in fk_names and _table_exists("ucp_resource"):
            op.create_foreign_key(
                "fk_pipeline_exec_resource", "ucp_pipeline_execution", "ucp_resource",
                ["resource_id"], ["id"], ondelete="SET NULL",
            )

    if _table_exists("ucp_event"):
        conn = op.get_bind()
        for col_name, col_type, col_kw in [
            ("system_code", sa.String(64), {"nullable": True}),
            ("resource_id", sa.BigInteger(), {"nullable": True}),
        ]:
            has_col = conn.execute(
                sa.text(
                    "SELECT EXISTS (SELECT FROM information_schema.columns "
                    "WHERE table_name = 'ucp_event' AND column_name = :c)"
                ),
                {"c": col_name},
            ).scalar()
            if not has_col:
                op.add_column("ucp_event", sa.Column(col_name, col_type, **col_kw))

        insp = sa.inspect(conn)
        idx_names = {i["name"] for i in insp.get_indexes("ucp_event")}
        fk_names = {f["name"] for f in insp.get_foreign_keys("ucp_event")}

        if "ix_ucp_event_system_code" not in idx_names:
            op.create_index("ix_ucp_event_system_code", "ucp_event", ["system_code"])
        if "ix_ucp_event_resource" not in idx_names:
            op.create_index("ix_ucp_event_resource", "ucp_event", ["resource_id"])
        if "fk_ucp_event_resource" not in fk_names and _table_exists("ucp_resource"):
            op.create_foreign_key(
                "fk_ucp_event_resource", "ucp_event", "ucp_resource",
                ["resource_id"], ["id"], ondelete="SET NULL",
            )

    # ── 7. Phase 4: Alert Rules ──
    if not _table_exists("ucp_alert_rule"):
        op.create_table(
            "ucp_alert_rule",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("rule_code", sa.String(64), nullable=False, unique=True),
            sa.Column("rule_name", sa.String(128), nullable=False),
            sa.Column("rule_type", sa.String(32), nullable=False),
            sa.Column("threshold_value", sa.Float(), nullable=False, server_default="0"),
            sa.Column("threshold_unit", sa.String(16), nullable=True),
            sa.Column("target_filter", sa.JSON(), nullable=True),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("notify_channels", sa.String(64), nullable=True),
            sa.Column("notify_receivers", sa.JSON(), nullable=True),
            sa.Column("cooldown_minutes", sa.Integer(), nullable=False, server_default="60"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if not _table_exists("ucp_alert_log"):
        op.create_table(
            "ucp_alert_log",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("rule_id", sa.BigInteger(),
                      sa.ForeignKey("ucp_alert_rule.id", ondelete="SET NULL"), nullable=True),
            sa.Column("rule_code", sa.String(64), nullable=True),
            sa.Column("alert_level", sa.String(16), nullable=False, server_default="WARN"),
            sa.Column("alert_type", sa.String(32), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("ref_id", sa.String(128), nullable=True),
            sa.Column("current_value", sa.Float(), nullable=True),
            sa.Column("threshold_value", sa.Float(), nullable=True),
            sa.Column("notify_status", sa.String(16), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_alert_log_rule", "ucp_alert_log", ["rule_id"])
        op.create_index("ix_ucp_alert_log_created", "ucp_alert_log", ["created_at"])

    # ── 8. Phase 5: API Template Library ──
    if not _table_exists("ucp_api_template"):
        op.create_table(
            "ucp_api_template",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("template_code", sa.String(64), nullable=False, unique=True),
            sa.Column("template_name", sa.String(128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category", sa.String(32), nullable=True, server_default="CUSTOM"),
            sa.Column("system_type", sa.String(32), nullable=True),
            sa.Column("method", sa.String(16), nullable=False, server_default="GET"),
            sa.Column("base_url", sa.String(512), nullable=True),
            sa.Column("path", sa.String(512), nullable=True),
            sa.Column("content_type", sa.String(64), nullable=True, server_default="application/json"),
            sa.Column("timeout_seconds", sa.Integer(), nullable=True, server_default="30"),
            sa.Column("headers_config", sa.JSON(), nullable=True),
            sa.Column("query_config", sa.JSON(), nullable=True),
            sa.Column("body_template", sa.JSON(), nullable=True),
            sa.Column("auth_type", sa.String(32), nullable=True),
            sa.Column("data_path", sa.String(256), nullable=True),
            sa.Column("total_path", sa.String(256), nullable=True),
            sa.Column("next_cursor_path", sa.String(256), nullable=True),
            sa.Column("pagination_type", sa.String(16), nullable=True, server_default="NONE"),
            sa.Column("page_param", sa.String(32), nullable=True, server_default="page"),
            sa.Column("page_size_param", sa.String(32), nullable=True, server_default="pageSize"),
            sa.Column("rate_limit_qps", sa.Integer(), nullable=True),
            sa.Column("rate_limit_concurrency", sa.Integer(), nullable=True),
            sa.Column("retry_max", sa.Integer(), nullable=True, server_default="3"),
            sa.Column("retry_backoff", sa.String(16), nullable=True, server_default="exponential"),
            sa.Column("field_mappings", sa.JSON(), nullable=True),
            sa.Column("error_code_map", sa.JSON(), nullable=True),
            sa.Column("sample_response", sa.JSON(), nullable=True),
            sa.Column("version", sa.String(32), nullable=False, server_default="1.0.0"),
            sa.Column("is_published", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("allowed_domains", sa.JSON(), nullable=True),
            sa.Column("tags", sa.JSON(), nullable=True),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("updated_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_api_template_category", "ucp_api_template", ["category"])
        op.create_index("ix_ucp_api_template_system", "ucp_api_template", ["system_type"])

    if not _table_exists("ucp_api_template_version"):
        op.create_table(
            "ucp_api_template_version",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("template_id", sa.BigInteger(),
                      sa.ForeignKey("ucp_api_template.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version", sa.String(32), nullable=False),
            sa.Column("snapshot", sa.JSON(), nullable=False),
            sa.Column("change_note", sa.String(256), nullable=True),
            sa.Column("created_by", sa.String(64), nullable=False, server_default="system"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_unique_constraint("uq_api_tpl_version", "ucp_api_template_version", ["template_id", "version"])
        op.create_index("ix_api_tpl_version_tpl", "ucp_api_template_version", ["template_id"])

    # ── 9. Phase 6: Governance / iPaaS ──
    if not _table_exists("ucp_asset_tag"):
        op.create_table(
            "ucp_asset_tag",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("asset_type", sa.String(32), nullable=False),
            sa.Column("asset_id", sa.BigInteger(), nullable=False),
            sa.Column("tag_key", sa.String(64), nullable=False),
            sa.Column("tag_value", sa.String(128), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_asset_tag_asset", "ucp_asset_tag", ["asset_type", "asset_id"])
        op.create_index("ix_ucp_asset_tag_key", "ucp_asset_tag", ["tag_key"])

    if not _table_exists("ucp_sla_config"):
        op.create_table(
            "ucp_sla_config",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("sla_code", sa.String(64), nullable=False, unique=True),
            sa.Column("sla_name", sa.String(128), nullable=True),
            sa.Column("target_type", sa.String(32), nullable=False),
            sa.Column("target_id", sa.BigInteger(), nullable=False),
            sa.Column("success_rate_target", sa.Float(), nullable=True),
            sa.Column("p95_duration_ms_max", sa.Integer(), nullable=True),
            sa.Column("p99_duration_ms_max", sa.Integer(), nullable=True),
            sa.Column("recovery_time_minutes", sa.Integer(), nullable=True),
            sa.Column("window_hours", sa.Integer(), nullable=False, server_default="24"),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_sla_config_target", "ucp_sla_config", ["target_type", "target_id"])

    if not _table_exists("ucp_sla_record"):
        op.create_table(
            "ucp_sla_record",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("sla_id", sa.BigInteger(),
                      sa.ForeignKey("ucp_sla_config.id", ondelete="CASCADE"), nullable=False),
            sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
            sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("total_executions", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("success_rate", sa.Float(), nullable=True),
            sa.Column("p95_duration_ms", sa.Integer(), nullable=True),
            sa.Column("p99_duration_ms", sa.Integer(), nullable=True),
            sa.Column("is_met", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("unmet_reasons", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_sla_record_sla", "ucp_sla_record", ["sla_id"])
        op.create_index("ix_ucp_sla_record_window", "ucp_sla_record", ["window_start"])

    if not _table_exists("ucp_change_request"):
        op.create_table(
            "ucp_change_request",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("change_code", sa.String(64), nullable=False, unique=True),
            sa.Column("change_type", sa.String(32), nullable=False),
            sa.Column("change_target_id", sa.BigInteger(), nullable=False),
            sa.Column("change_target_code", sa.String(64), nullable=False),
            sa.Column("change_summary", sa.String(255), nullable=True),
            sa.Column("before_snapshot", sa.JSON(), nullable=True),
            sa.Column("after_snapshot", sa.JSON(), nullable=True),
            sa.Column("risk_level", sa.String(16), nullable=False, server_default="LOW"),
            sa.Column("status", sa.String(32), nullable=False, server_default="DRAFT"),
            sa.Column("approval_id", sa.BigInteger(), nullable=True),
            sa.Column("publish_window_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("publish_window_end", sa.DateTime(timezone=True), nullable=True),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("rolled_back_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("affected_assets", sa.JSON(), nullable=True),
            sa.Column("rollback_version", sa.Integer(), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_change_status", "ucp_change_request", ["status"])
        op.create_index("ix_ucp_change_target", "ucp_change_request", ["change_type", "change_target_id"])

    if not _table_exists("ucp_governance_score"):
        op.create_table(
            "ucp_governance_score",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("asset_type", sa.String(32), nullable=False),
            sa.Column("asset_id", sa.BigInteger(), nullable=False),
            sa.Column("asset_code", sa.String(64), nullable=False),
            sa.Column("overall_score", sa.Float(), nullable=True),
            sa.Column("reliability_score", sa.Float(), nullable=True),
            sa.Column("performance_score", sa.Float(), nullable=True),
            sa.Column("security_score", sa.Float(), nullable=True),
            sa.Column("alert_score", sa.Float(), nullable=True),
            sa.Column("score_detail", sa.JSON(), nullable=True),
            sa.Column("window_hours", sa.Integer(), nullable=False, server_default="168"),
            sa.Column("calculated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_gov_score_asset", "ucp_governance_score", ["asset_type", "asset_id"])
        op.create_index("ix_ucp_gov_score_calc", "ucp_governance_score", ["calculated_at"])

    # ── 10. Phase 7: Master Data Governance ──
    if not _table_exists("ucp_resource_snapshot"):
        op.create_table(
            "ucp_resource_snapshot",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("resource_id", sa.BigInteger(),
                      sa.ForeignKey("ucp_resource.id", ondelete="SET NULL"), nullable=True),
            sa.Column("pipeline_run_id", sa.String(64), nullable=False),
            sa.Column("step_run_id", sa.String(64), nullable=False),
            sa.Column("snapshot_code", sa.String(128), nullable=False),
            sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("schema_json", sa.JSON(), nullable=True),
            sa.Column("data_json", sa.JSON(), nullable=True),
            sa.Column("storage_type", sa.String(32), nullable=False, server_default=sa.text("'DB'")),
            sa.Column("storage_uri", sa.String(512), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_snap_resource", "ucp_resource_snapshot", ["resource_id"])
        op.create_index("ix_snap_pipeline", "ucp_resource_snapshot", ["pipeline_run_id"])
        op.create_index("ix_snap_created", "ucp_resource_snapshot", ["created_at"])

    if not _table_exists("ucp_master_data_object"):
        op.create_table(
            "ucp_master_data_object",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("object_code", sa.String(64), nullable=False, unique=True),
            sa.Column("object_name", sa.String(128), nullable=False),
            sa.Column("object_type", sa.String(32), nullable=False),
            sa.Column("system_code", sa.String(64), nullable=False),
            sa.Column("system_name", sa.String(128), nullable=True),
            sa.Column("source_type", sa.String(32), nullable=False, server_default="REFERENCE"),
            sa.Column("owner", sa.String(64), nullable=True),
            sa.Column("field_definitions", sa.JSON(), nullable=True),
            sa.Column("sync_status", sa.String(32), nullable=True, server_default="NOT_SYNCED"),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("record_count", sa.Integer(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_md_object_system", "ucp_master_data_object", ["system_code"])
        op.create_index("ix_ucp_md_object_type", "ucp_master_data_object", ["object_type"])

    if not _table_exists("ucp_id_mapping"):
        op.create_table(
            "ucp_id_mapping",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("object_type", sa.String(32), nullable=False),
            sa.Column("hr_id", sa.String(128), nullable=False),
            sa.Column("external_system", sa.String(64), nullable=False),
            sa.Column("external_id", sa.String(128), nullable=False),
            sa.Column("external_name", sa.String(256), nullable=True),
            sa.Column("mapping_type", sa.String(16), nullable=False, server_default="ONE_TO_ONE"),
            sa.Column("is_conflict", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("conflict_reason", sa.String(256), nullable=True),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("updated_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_unique_constraint("uq_id_mapping_ext", "ucp_id_mapping",
                                     ["object_type", "external_system", "external_id"])
        op.create_index("ix_ucp_id_mapping_hr", "ucp_id_mapping", ["object_type", "hr_id"])
        op.create_index("ix_ucp_id_mapping_system", "ucp_id_mapping", ["external_system"])

    if not _table_exists("ucp_id_mapping_audit"):
        op.create_table(
            "ucp_id_mapping_audit",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("mapping_id", sa.BigInteger(), nullable=True),
            sa.Column("action", sa.String(16), nullable=False),
            sa.Column("before_value", sa.JSON(), nullable=True),
            sa.Column("after_value", sa.JSON(), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("operator", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_id_mapping_audit_mapping", "ucp_id_mapping_audit", ["mapping_id"])
        op.create_index("ix_ucp_id_mapping_audit_created", "ucp_id_mapping_audit", ["created_at"])

    if not _table_exists("ucp_diff_job"):
        op.create_table(
            "ucp_diff_job",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("job_code", sa.String(64), nullable=False, unique=True),
            sa.Column("job_name", sa.String(128), nullable=False),
            sa.Column("source_resource_id", sa.BigInteger(), nullable=True, index=True),
            sa.Column("target_resource_id", sa.BigInteger(), nullable=True, index=True),
            sa.Column("source_system", sa.String(64), nullable=False),
            sa.Column("target_system", sa.String(64), nullable=False),
            sa.Column("object_type", sa.String(32), nullable=False),
            sa.Column("compare_fields", sa.JSON(), nullable=True),
            sa.Column("key_field", sa.String(64), nullable=False, server_default="id"),
            sa.Column("cron_expression", sa.String(64), nullable=True),
            sa.Column("is_scheduled", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_run_status", sa.String(32), nullable=True),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_diff_job_source", "ucp_diff_job", ["source_system", "target_system"])

    if not _table_exists("ucp_diff_record"):
        op.create_table(
            "ucp_diff_record",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("job_id", sa.BigInteger(),
                      sa.ForeignKey("ucp_diff_job.id", ondelete="CASCADE"), nullable=False),
            sa.Column("run_code", sa.String(64), nullable=False),
            sa.Column("object_key", sa.String(128), nullable=False),
            sa.Column("object_name", sa.String(256), nullable=True),
            sa.Column("diff_type", sa.String(32), nullable=False),
            sa.Column("diff_detail", sa.JSON(), nullable=True),
            sa.Column("process_status", sa.String(32), nullable=False, server_default="PENDING"),
            sa.Column("suggested_action", sa.String(32), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("resolved_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_diff_record_job", "ucp_diff_record", ["job_id"])
        op.create_index("ix_ucp_diff_record_run", "ucp_diff_record", ["run_code"])
        op.create_index("ix_ucp_diff_record_diff", "ucp_diff_record", ["diff_type", "process_status"])

    if not _table_exists("ucp_quality_rule"):
        op.create_table(
            "ucp_quality_rule",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("rule_code", sa.String(64), nullable=False, unique=True),
            sa.Column("rule_name", sa.String(128), nullable=False),
            sa.Column("resource_id", sa.BigInteger(), nullable=True, index=True),
            sa.Column("object_type", sa.String(32), nullable=False),
            sa.Column("system_code", sa.String(64), nullable=True),
            sa.Column("field_name", sa.String(64), nullable=True),
            sa.Column("rule_type", sa.String(32), nullable=False),
            sa.Column("rule_config", sa.JSON(), nullable=True),
            sa.Column("severity", sa.String(16), nullable=False, server_default="WARN"),
            sa.Column("cron_expression", sa.String(64), nullable=True),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_quality_rule_type", "ucp_quality_rule", ["rule_type"])
        op.create_index("ix_ucp_quality_rule_object", "ucp_quality_rule", ["object_type", "system_code"])

    if not _table_exists("ucp_quality_issue"):
        op.create_table(
            "ucp_quality_issue",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("rule_id", sa.BigInteger(),
                      sa.ForeignKey("ucp_quality_rule.id", ondelete="CASCADE"), nullable=False),
            sa.Column("scan_run_code", sa.String(64), nullable=False),
            sa.Column("object_type", sa.String(32), nullable=False),
            sa.Column("object_key", sa.String(128), nullable=False),
            sa.Column("system_code", sa.String(64), nullable=True),
            sa.Column("field_name", sa.String(64), nullable=True),
            sa.Column("issue_type", sa.String(32), nullable=False),
            sa.Column("current_value", sa.Text(), nullable=True),
            sa.Column("expected_value", sa.String(256), nullable=True),
            sa.Column("status", sa.String(32), nullable=False, server_default="OPEN"),
            sa.Column("severity", sa.String(16), nullable=False, server_default="WARN"),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("resolved_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_quality_issue_rule", "ucp_quality_issue", ["rule_id"])
        op.create_index("ix_ucp_quality_issue_status", "ucp_quality_issue", ["status"])
        op.create_index("ix_ucp_quality_issue_scan", "ucp_quality_issue", ["scan_run_code"])

    if not _table_exists("ucp_conflict_record"):
        op.create_table(
            "ucp_conflict_record",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("conflict_code", sa.String(64), nullable=False, unique=True),
            sa.Column("source_type", sa.String(32), nullable=False),
            sa.Column("source_id", sa.BigInteger(), nullable=True),
            sa.Column("object_type", sa.String(32), nullable=False),
            sa.Column("object_key", sa.String(128), nullable=False),
            sa.Column("object_name", sa.String(256), nullable=True),
            sa.Column("conflict_type", sa.String(32), nullable=False),
            sa.Column("conflict_summary", sa.String(512), nullable=True),
            sa.Column("conflict_detail", sa.JSON(), nullable=True),
            sa.Column("resolution_strategy", sa.String(32), nullable=True),
            sa.Column("resolution_detail", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(32), nullable=False, server_default="OPEN"),
            sa.Column("affected_assets", sa.JSON(), nullable=True),
            sa.Column("assigned_to", sa.String(64), nullable=True),
            sa.Column("resolved_by", sa.String(64), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_conflict_source", "ucp_conflict_record", ["source_type", "source_id"])
        op.create_index("ix_ucp_conflict_status", "ucp_conflict_record", ["status"])
        op.create_index("ix_ucp_conflict_object", "ucp_conflict_record", ["object_type", "object_key"])

    if not _table_exists("ucp_governance_task"):
        op.create_table(
            "ucp_governance_task",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("task_code", sa.String(64), nullable=False, unique=True),
            sa.Column("task_name", sa.String(256), nullable=False),
            sa.Column("source_type", sa.String(32), nullable=False),
            sa.Column("source_id", sa.BigInteger(), nullable=True),
            sa.Column("object_type", sa.String(32), nullable=True),
            sa.Column("object_key", sa.String(128), nullable=True),
            sa.Column("system_code", sa.String(64), nullable=True),
            sa.Column("status", sa.String(32), nullable=False, server_default="TODO"),
            sa.Column("priority", sa.String(16), nullable=False, server_default="MEDIUM"),
            sa.Column("assigned_to", sa.String(64), nullable=True),
            sa.Column("assigned_by", sa.String(64), nullable=True),
            sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("verified_by", sa.String(64), nullable=True),
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("resolution_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_ucp_gov_task_status", "ucp_governance_task", ["status"])
        op.create_index("ix_ucp_gov_task_assignee", "ucp_governance_task", ["assigned_to"])
        op.create_index("ix_ucp_gov_task_source", "ucp_governance_task", ["source_type", "source_id"])

    if not _table_exists("ucp_governance_report"):
        op.create_table(
            "ucp_governance_report",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("report_period", sa.String(32), nullable=False),
            sa.Column("system_code", sa.String(64), nullable=True),
            sa.Column("object_type", sa.String(32), nullable=True),
            sa.Column("owner", sa.String(64), nullable=True),
            sa.Column("total_issues", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("resolved_issues", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("open_issues", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("overdue_issues", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("closure_rate", sa.Float(), nullable=True),
            sa.Column("avg_resolution_hours", sa.Float(), nullable=True),
            sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_ucp_gov_report_period", "ucp_governance_report", ["report_period"])
        op.create_index("ix_ucp_gov_report_system", "ucp_governance_report", ["system_code"])


# ── downgrade ──

def downgrade() -> None:
    # Drop Phase 7 tables
    for tbl in [
        "ucp_governance_report", "ucp_governance_task", "ucp_conflict_record",
        "ucp_quality_issue", "ucp_quality_rule", "ucp_diff_record", "ucp_diff_job",
        "ucp_id_mapping_audit", "ucp_id_mapping", "ucp_master_data_object",
        "ucp_resource_snapshot",
    ]:
        if _table_exists(tbl):
            op.drop_table(tbl)

    # Drop Phase 6 tables
    for tbl in [
        "ucp_governance_score", "ucp_change_request", "ucp_sla_record",
        "ucp_sla_config", "ucp_asset_tag",
    ]:
        if _table_exists(tbl):
            op.drop_table(tbl)

    # Drop Phase 5 tables
    for tbl in ["ucp_api_template_version", "ucp_api_template"]:
        if _table_exists(tbl):
            op.drop_table(tbl)

    # Drop Phase 4 tables
    for tbl in ["ucp_alert_log", "ucp_alert_rule"]:
        if _table_exists(tbl):
            op.drop_table(tbl)

    # Reverse 0071 ALTERs: pipeline_execution + event
    if _table_exists("ucp_pipeline_execution"):
        conn = op.get_bind()
        insp = sa.inspect(conn)
        fk_names = {f["name"] for f in insp.get_foreign_keys("ucp_pipeline_execution")}
        if "fk_pipeline_exec_resource" in fk_names:
            op.drop_constraint("fk_pipeline_exec_resource", "ucp_pipeline_execution", type_="foreignkey")
        idx_names = {i["name"] for i in insp.get_indexes("ucp_pipeline_execution")}
        if "ix_pipeline_exec_resource" in idx_names:
            op.drop_index("ix_pipeline_exec_resource", table_name="ucp_pipeline_execution")
        if "ix_pipeline_exec_system" in idx_names:
            op.drop_index("ix_pipeline_exec_system", table_name="ucp_pipeline_execution")
        for col_name in ["resource_id", "system_id"]:
            has_col = conn.execute(
                sa.text("SELECT EXISTS (SELECT FROM information_schema.columns "
                        "WHERE table_name='ucp_pipeline_execution' AND column_name=:c)"),
                {"c": col_name},
            ).scalar()
            if has_col:
                op.drop_column("ucp_pipeline_execution", col_name)

    if _table_exists("ucp_event"):
        conn = op.get_bind()
        insp = sa.inspect(conn)
        fk_names = {f["name"] for f in insp.get_foreign_keys("ucp_event")}
        if "fk_ucp_event_resource" in fk_names:
            op.drop_constraint("fk_ucp_event_resource", "ucp_event", type_="foreignkey")
        idx_names = {i["name"] for i in insp.get_indexes("ucp_event")}
        if "ix_ucp_event_resource" in idx_names:
            op.drop_index("ix_ucp_event_resource", table_name="ucp_event")
        if "ix_ucp_event_system_code" in idx_names:
            op.drop_index("ix_ucp_event_system_code", table_name="ucp_event")
        for col_name in ["resource_id", "system_code"]:
            has_col = conn.execute(
                sa.text("SELECT EXISTS (SELECT FROM information_schema.columns "
                        "WHERE table_name='ucp_event' AND column_name=:c)"),
                {"c": col_name},
            ).scalar()
            if has_col:
                op.drop_column("ucp_event", col_name)

    # Reverse 0070 ALTERs: event_trigger
    if _table_exists("ucp_event_trigger"):
        conn = op.get_bind()
        insp = sa.inspect(conn)
        fk_names = {f["name"] for f in insp.get_foreign_keys("ucp_event_trigger")}
        if "fk_ucp_event_trigger_resource" in fk_names:
            op.drop_constraint("fk_ucp_event_trigger_resource", "ucp_event_trigger", type_="foreignkey")
        idx_names = {i["name"] for i in insp.get_indexes("ucp_event_trigger")}
        if "ix_ucp_event_trigger_system_code" in idx_names:
            op.drop_index("ix_ucp_event_trigger_system_code", table_name="ucp_event_trigger")
        if "ix_ucp_event_trigger_resource" in idx_names:
            op.drop_index("ix_ucp_event_trigger_resource", table_name="ucp_event_trigger")
        for col_name in ["source_system_code", "source_resource_id"]:
            has_col = conn.execute(
                sa.text("SELECT EXISTS (SELECT FROM information_schema.columns "
                        "WHERE table_name='ucp_event_trigger' AND column_name=:c)"),
                {"c": col_name},
            ).scalar()
            if has_col:
                op.drop_column("ucp_event_trigger", col_name)

    # Reverse 0069 ALTERs: credentials → system bindings
    if _table_exists("ucp_credentials"):
        conn = op.get_bind()
        insp = sa.inspect(conn)
        idx_names = {i["name"] for i in insp.get_indexes("ucp_credentials")}
        if "uq_ucp_credentials_primary_per_system" in idx_names:
            op.drop_index("uq_ucp_credentials_primary_per_system", table_name="ucp_credentials")
        fk_names = {f["name"] for f in insp.get_foreign_keys("ucp_credentials")}
        if "fk_ucp_credentials_system" in fk_names:
            op.drop_constraint("fk_ucp_credentials_system", "ucp_credentials", type_="foreignkey")
        if "ix_ucp_credentials_system" in idx_names:
            op.drop_index("ix_ucp_credentials_system", table_name="ucp_credentials")
        for col_name in ["is_primary", "env_tag", "system_id"]:
            has_col = conn.execute(
                sa.text("SELECT EXISTS (SELECT FROM information_schema.columns "
                        "WHERE table_name='ucp_credentials' AND column_name=:c)"),
                {"c": col_name},
            ).scalar()
            if has_col:
                op.drop_column("ucp_credentials", col_name)

    # Remove columns from ucp_credentials
    if _table_exists("ucp_credentials"):
        conn = op.get_bind()
        for col_name in ["remind_before_days", "expires_at"]:
            has_col = conn.execute(
                sa.text(
                    "SELECT EXISTS (SELECT FROM information_schema.columns "
                    "WHERE table_name = 'ucp_credentials' AND column_name = :c)"
                ),
                {"c": col_name},
            ).scalar()
            if has_col:
                op.drop_column("ucp_credentials", col_name)

    # Remove columns from ucp_system
    if _table_exists("ucp_system"):
        conn = op.get_bind()
        for col_name in ["sensitivity", "tags", "domain"]:
            has_col = conn.execute(
                sa.text(
                    "SELECT EXISTS (SELECT FROM information_schema.columns "
                    "WHERE table_name = 'ucp_system' AND column_name = :c)"
                ),
                {"c": col_name},
            ).scalar()
            if has_col:
                op.drop_column("ucp_system", col_name)

    # Reverse renames
    for old, new in reversed(RENAMES):
        if _table_exists(new) and not _table_exists(old):
            op.rename_table(new, old)
