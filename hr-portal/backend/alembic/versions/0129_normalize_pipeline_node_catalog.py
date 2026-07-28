"""normalize pipeline nodes for the unified catalog

Revision ID: 0129
Revises: 0128
Create Date: 2026-07-25
"""
import json

import sqlalchemy as sa
from alembic import op


revision = "0129"
down_revision = "0128"
branch_labels = None
depends_on = None


def _normalize_nodes(nodes: list | None) -> list:
    normalized = []
    for node in nodes or []:
        item = dict(node)
        if item.get("type") == "START_TRIGGER":
            config = dict(item.get("config") or {})
            config["trigger_types"] = [
                trigger_type for trigger_type in config.get("trigger_types", [])
                if trigger_type != "DATA_CHANGE"
            ]
            item["config"] = config
        normalized.append(item)
    return normalized


def _update(table_name: str) -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(f"SELECT id, nodes_json FROM {table_name}")).mappings().all()
    for row in rows:
        bind.execute(
            sa.text(f"UPDATE {table_name} SET nodes_json = CAST(:nodes AS JSONB) WHERE id = :id"),
            {"id": row["id"], "nodes": json.dumps(_normalize_nodes(row["nodes_json"]))},
        )


def upgrade() -> None:
    _update("ucp_pipeline_template")
    _update("ucp_pipeline_template_version")


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in ("ucp_pipeline_template_version", "ucp_pipeline_template"):
        rows = bind.execute(sa.text(f"SELECT id, nodes_json FROM {table_name}")).mappings().all()
        for row in rows:
            nodes = []
            for node in row["nodes_json"] or []:
                item = dict(node)
                if item.get("type") == "START_TRIGGER":
                    config = dict(item.get("config") or {})
                    trigger_types = list(config.get("trigger_types", []))
                    if "DATA_CHANGE" not in trigger_types:
                        trigger_types.append("DATA_CHANGE")
                    config["trigger_types"] = trigger_types
                    item["config"] = config
                nodes.append(item)
            bind.execute(
                sa.text(f"UPDATE {table_name} SET nodes_json = CAST(:nodes AS JSONB) WHERE id = :id"),
                {"id": row["id"], "nodes": json.dumps(nodes)},
            )
