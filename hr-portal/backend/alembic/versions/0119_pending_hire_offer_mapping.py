"""configure pending-hire offer enrichment field mappings

Revision ID: 0119
Revises: 0118
Create Date: 2026-07-24
"""
from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision = "0119"
down_revision = "0118"
branch_labels = None
depends_on = None


PENDING_HIRE_MAPPING = {
    "工号": "employ_no",
    "姓名": "name",
    "姓名（中文名）": "chinese_name",
    "飞书投递id": "feishu_applicaiton_id",
}


def upgrade() -> None:
    bind = op.get_bind()

    data_objects = bind.execute(
        sa.text(
            "SELECT id, field_mapping FROM ucp_resource_data_object "
            "WHERE object_code = 'pending_empply'"
        )
    ).mappings()
    for data_object in data_objects:
        if data_object["field_mapping"] not in ({}, None):
            continue
        bind.execute(
            sa.text("UPDATE ucp_resource_data_object SET field_mapping = CAST(:mapping AS json) WHERE id = :id"),
            {"id": data_object["id"], "mapping": json.dumps(PENDING_HIRE_MAPPING, ensure_ascii=False)},
        )

    templates = bind.execute(
        sa.text(
            "SELECT id, nodes_json FROM ucp_pipeline_template "
            "WHERE template_code = 'PENDING_HIRE_OFFER_ENRICHMENT'"
        )
    ).mappings()
    for template in templates:
        nodes = template["nodes_json"]
        if isinstance(nodes, str):
            nodes = json.loads(nodes)
        if not isinstance(nodes, list):
            continue
        changed = False
        for node in nodes:
            if not isinstance(node, dict):
                continue
            config = node.get("config")
            if not isinstance(config, dict):
                continue
            if node.get("id") == "lookup_offer":
                config["lookup_field"] = "feishu_applicaiton_id"
                config["parameter_name"] = "application_id"
                changed = True
            elif node.get("id") == "merge_offer":
                config["field_mapping"] = [{"source": "salary_amount", "target": "base_salary"}]
                changed = True
            elif node.get("id") == "write_asset":
                config["primary_key"] = "employ_no"
                config["field_whitelist"] = [
                    "employ_no",
                    "name",
                    "chinese_name",
                    "feishu_applicaiton_id",
                    "base_salary",
                    "target_bonus",
                ]
                changed = True
        if changed:
            bind.execute(
                sa.text("UPDATE ucp_pipeline_template SET nodes_json = CAST(:nodes AS json), updated_at = now() WHERE id = :id"),
                {"id": template["id"], "nodes": json.dumps(nodes, ensure_ascii=False)},
            )


def downgrade() -> None:
    pass