"""add explicit lifecycle time strategy to offboarding template

Revision ID: 0127
Revises: 0126
Create Date: 2026-07-25
"""
import json

import sqlalchemy as sa
from alembic import op


revision = "0127"
down_revision = "0126"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    row = bind.execute(sa.text("SELECT id, nodes_json, edges_json FROM ucp_pipeline_template WHERE template_code = :code"), {"code": "TPL_OFFBOARDING_ACCOUNT"}).mappings().first()
    if not row:
        return
    nodes = list(row["nodes_json"] or [])
    if not any(node.get("id") == "effective_time" for node in nodes):
        nodes.insert(0, {"id": "effective_time", "type": "TIME_STRATEGY", "x": 100, "y": 120, "label": "Offboarding effective-time policy", "config": {"strategy": "LIFECYCLE_RULE", "effective_time_field": "termination_effective_at"}})
    edges = [edge for edge in (row["edges_json"] or []) if edge.get("from") != "effective_time"]
    edges.insert(0, {"from": "effective_time", "to": "approval"})
    bind.execute(sa.text("UPDATE ucp_pipeline_template SET nodes_json = CAST(:nodes AS JSONB), edges_json = CAST(:edges AS JSONB), description = :description WHERE id = :id"), {"id": row["id"], "nodes": json.dumps(nodes), "edges": json.dumps(edges), "description": "Webhook event starts account offboarding through the lifecycle effective-time policy before approval."})


def downgrade() -> None:
    bind = op.get_bind()
    row = bind.execute(sa.text("SELECT id, nodes_json, edges_json FROM ucp_pipeline_template WHERE template_code = :code"), {"code": "TPL_OFFBOARDING_ACCOUNT"}).mappings().first()
    if not row:
        return
    nodes = [node for node in (row["nodes_json"] or []) if node.get("id") != "effective_time"]
    edges = [edge for edge in (row["edges_json"] or []) if edge.get("from") != "effective_time"]
    bind.execute(sa.text("UPDATE ucp_pipeline_template SET nodes_json = CAST(:nodes AS JSONB), edges_json = CAST(:edges AS JSONB) WHERE id = :id"), {"id": row["id"], "nodes": json.dumps(nodes), "edges": json.dumps(edges)})
