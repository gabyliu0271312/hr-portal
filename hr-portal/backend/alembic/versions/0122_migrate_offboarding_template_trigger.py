"""migrate offboarding template away from a synthetic transform start node

Revision ID: 0122
Revises: 0121
Create Date: 2026-07-24
"""
from alembic import op
import json
import sqlalchemy as sa


revision = "0122"
down_revision = "0121"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    row = bind.execute(sa.text("SELECT id, nodes_json, edges_json FROM ucp_pipeline_template WHERE template_code = :code"), {"code": "TPL_OFFBOARDING_ACCOUNT"}).mappings().first()
    if not row:
        return
    nodes = [node for node in (row["nodes_json"] or []) if node.get("id") != "start"]
    edges = [edge for edge in (row["edges_json"] or []) if edge.get("from") != "start"]
    bind.execute(sa.text("UPDATE ucp_pipeline_template SET nodes_json = CAST(:nodes AS JSONB), edges_json = CAST(:edges AS JSONB), description = :description WHERE id = :id"), {"id": row["id"], "nodes": json.dumps(nodes), "edges": json.dumps(edges), "description": "Webhook event starts account offboarding; approval and lifecycle controls remain in the pipeline."})


def downgrade() -> None:
    bind = op.get_bind()
    row = bind.execute(sa.text("SELECT id, nodes_json, edges_json FROM ucp_pipeline_template WHERE template_code = :code"), {"code": "TPL_OFFBOARDING_ACCOUNT"}).mappings().first()
    if not row:
        return
    nodes = list(row["nodes_json"] or [])
    if not any(node.get("id") == "start" for node in nodes):
        nodes.insert(0, {"id": "start", "type": "TRANSFORM", "x": 100, "y": 120, "label": "Parse offboarding event", "config": {"mappings": [{"src": "payload.employee_id", "dst": "employee_id"}]}})
    edges = list(row["edges_json"] or [])
    if not any(edge.get("from") == "start" for edge in edges):
        edges.insert(0, {"from": "start", "to": "approval"})
    bind.execute(sa.text("UPDATE ucp_pipeline_template SET nodes_json = CAST(:nodes AS JSONB), edges_json = CAST(:edges AS JSONB) WHERE id = :id"), {"id": row["id"], "nodes": json.dumps(nodes), "edges": json.dumps(edges)})
