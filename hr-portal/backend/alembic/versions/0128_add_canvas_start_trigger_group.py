"""add canvas-native trigger start group to pipeline templates

Revision ID: 0128
Revises: 0127
Create Date: 2026-07-25
"""
import json

import sqlalchemy as sa
from alembic import op


revision = "0128"
down_revision = "0127"
branch_labels = None
depends_on = None


START_NODE = {
    "id": "start_trigger",
    "type": "START_TRIGGER",
    "x": 0,
    "y": 120,
    "label": "Trigger start",
    "config": {
        "mode": "OR",
        "trigger_types": ["WEBHOOK", "SCHEDULE", "MANUAL", "PLATFORM_EVENT", "DATA_CHANGE"],
        "management_path": "/ucp/events/triggers",
    },
}


def _with_start_trigger(nodes: list | None, edges: list | None) -> tuple[list, list]:
    normalized_nodes = list(nodes or [])
    normalized_edges = list(edges or [])
    if any(node.get("type") == "START_TRIGGER" for node in normalized_nodes):
        return normalized_nodes, normalized_edges

    inbound_node_ids = {edge.get("to") for edge in normalized_edges}
    root_node_ids = [
        node.get("id") for node in normalized_nodes
        if node.get("id") and node.get("id") not in inbound_node_ids
    ]
    normalized_nodes.insert(0, dict(START_NODE))
    normalized_edges = [
        {"from": "start_trigger", "to": node_id}
        for node_id in root_node_ids
    ] + normalized_edges
    return normalized_nodes, normalized_edges


def _without_start_trigger(nodes: list | None, edges: list | None) -> tuple[list, list]:
    normalized_nodes = [node for node in (nodes or []) if node.get("id") != "start_trigger"]
    normalized_edges = [
        edge for edge in (edges or [])
        if edge.get("from") != "start_trigger" and edge.get("to") != "start_trigger"
    ]
    return normalized_nodes, normalized_edges


def _update_table(table_name: str) -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, nodes_json, edges_json FROM {table_name}")
    ).mappings().all()
    for row in rows:
        nodes, edges = _with_start_trigger(row["nodes_json"], row["edges_json"])
        bind.execute(
            sa.text(
                f"UPDATE {table_name} "
                "SET nodes_json = CAST(:nodes AS JSONB), edges_json = CAST(:edges AS JSONB) "
                "WHERE id = :id"
            ),
            {"id": row["id"], "nodes": json.dumps(nodes), "edges": json.dumps(edges)},
        )


def _revert_table(table_name: str) -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, nodes_json, edges_json FROM {table_name}")
    ).mappings().all()
    for row in rows:
        nodes, edges = _without_start_trigger(row["nodes_json"], row["edges_json"])
        bind.execute(
            sa.text(
                f"UPDATE {table_name} "
                "SET nodes_json = CAST(:nodes AS JSONB), edges_json = CAST(:edges AS JSONB) "
                "WHERE id = :id"
            ),
            {"id": row["id"], "nodes": json.dumps(nodes), "edges": json.dumps(edges)},
        )


def upgrade() -> None:
    _update_table("ucp_pipeline_template")
    _update_table("ucp_pipeline_template_version")


def downgrade() -> None:
    _revert_table("ucp_pipeline_template_version")
    _revert_table("ucp_pipeline_template")
