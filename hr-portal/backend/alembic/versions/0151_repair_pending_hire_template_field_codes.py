"""repair pending-hire pipeline field codes after source rediscovery

Revision ID: 0151_pending_hire_template_field_codes
Revises: 0146_pending_employee_dynamic_schema
Create Date: 2026-07-30
"""
from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision = "0151_pending_hire_template_field_codes"
down_revision = "0146_pending_employee_dynamic_schema"
branch_labels = None
depends_on = None


TEMPLATE_CODE = "PENDING_HIRE_OFFER_ENRICHMENT"
LEGACY_FIELD_CODES = {
    "employ_no": "employee_number",
    "name": "full_name",
    "feishu_applicaiton_id": "feishu_submission_id",
}


def _json_value(value: object) -> dict | list | None:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        parsed = json.loads(value)
        return parsed if isinstance(parsed, (dict, list)) else None
    return None


def _replace_legacy_codes(value: object) -> tuple[object, bool]:
    if isinstance(value, str):
        replacement = LEGACY_FIELD_CODES.get(value)
        return (replacement, True) if replacement else (value, False)
    if isinstance(value, list):
        changed = False
        normalized = []
        for item in value:
            updated, item_changed = _replace_legacy_codes(item)
            normalized.append(updated)
            changed = changed or item_changed
        return normalized, changed
    if isinstance(value, dict):
        changed = False
        normalized = {}
        for key, item in value.items():
            updated, item_changed = _replace_legacy_codes(item)
            normalized[key] = updated
            changed = changed or item_changed
        return normalized, changed
    return value, False


def upgrade() -> None:
    bind = op.get_bind()
    template = bind.execute(
        sa.text(
            "SELECT id, nodes_json FROM ucp_pipeline_template "
            "WHERE template_code = :template_code"
        ),
        {"template_code": TEMPLATE_CODE},
    ).mappings().first()
    if template is None:
        return

    nodes = _json_value(template["nodes_json"])
    if not isinstance(nodes, list):
        return

    changed = False
    data_object_ids: set[int] = set()
    for node in nodes:
        if not isinstance(node, dict):
            continue
        config = node.get("config")
        if not isinstance(config, dict):
            continue
        if node.get("id") == "read_pending" and isinstance(config.get("data_object_id"), int):
            data_object_ids.add(config["data_object_id"])
        if node.get("id") in {"lookup_offer", "write_asset"}:
            normalized, config_changed = _replace_legacy_codes(config)
            if config_changed:
                node["config"] = normalized
                changed = True

    if changed:
        bind.execute(
            sa.text(
                "UPDATE ucp_pipeline_template "
                "SET nodes_json = CAST(:nodes AS json), updated_at = now() "
                "WHERE id = :id"
            ),
            {"id": template["id"], "nodes": json.dumps(nodes, ensure_ascii=False)},
        )

    for data_object_id in data_object_ids:
        data_objects = bind.execute(
            sa.text(
                "SELECT id, field_mapping FROM ucp_resource_data_object "
                "WHERE id = :data_object_id"
            ),
            {"data_object_id": data_object_id},
        ).mappings()
        for data_object in data_objects:
            field_mapping = _json_value(data_object["field_mapping"])
            if not isinstance(field_mapping, (dict, list)):
                continue
            normalized, mapping_changed = _replace_legacy_codes(field_mapping)
            if not mapping_changed:
                continue
            bind.execute(
                sa.text(
                    "UPDATE ucp_resource_data_object "
                    "SET field_mapping = CAST(:field_mapping AS json) WHERE id = :id"
                ),
                {
                    "id": data_object["id"],
                    "field_mapping": json.dumps(normalized, ensure_ascii=False),
                },
            )


def downgrade() -> None:
    pass
