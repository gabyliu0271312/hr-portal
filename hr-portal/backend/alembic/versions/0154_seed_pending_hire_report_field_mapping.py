"""seed pending-hire report mapping for the offer enrichment pipeline

Revision ID: 0154_pending_hire_report_field_mapping
Revises: 0153_pending_hire_runtime_config
Create Date: 2026-07-30
"""
from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision = "0154_pending_hire_report_field_mapping"
down_revision = "0153_pending_hire_runtime_config"
branch_labels = None
depends_on = None


PIPELINE_CODE = "PENDING_HIRE_OFFER_ENRICHMENT"
PENDING_HIRE_REPORT_MAPPING = {
    "工号": "employee_number",
    "姓名": "employee_name",
    "英文名": "english_name",
    "姓名（中文名）": "chinese_name",
    "飞书投递id": "feishu_submission_id",
}


def _json_value(value: object) -> dict | list | None:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        parsed = json.loads(value)
        return parsed if isinstance(parsed, (dict, list)) else None
    return None


def _normalize_pipeline_steps(items: object) -> tuple[list | None, set[int], bool]:
    if not isinstance(items, list):
        return None, set(), False

    data_object_ids: set[int] = set()
    changed = False
    for step in items:
        if not isinstance(step, dict):
            continue
        config = step.get("config") if isinstance(step.get("config"), dict) else step
        step_id = step.get("id") or step.get("step_id")
        if step_id == "read_pending" and isinstance(config.get("data_object_id"), int):
            data_object_ids.add(config["data_object_id"])
        if step_id == "lookup_offer" and config.get("lookup_field") == "application_id":
            config["lookup_field"] = "feishu_submission_id"
            changed = True
    return items, data_object_ids, changed


def _seed_empty_data_object_mapping(bind: sa.Connection, data_object_ids: set[int]) -> None:
    for data_object_id in data_object_ids:
        data_object = bind.execute(
            sa.text(
                "SELECT id, field_mapping FROM ucp_resource_data_object "
                "WHERE id = :data_object_id"
            ),
            {"data_object_id": data_object_id},
        ).mappings().first()
        if data_object is None:
            continue
        field_mapping = _json_value(data_object["field_mapping"])
        if field_mapping not in (None, {}):
            continue
        bind.execute(
            sa.text(
                "UPDATE ucp_resource_data_object "
                "SET field_mapping = CAST(:field_mapping AS json), updated_at = now() "
                "WHERE id = :id"
            ),
            {
                "id": data_object["id"],
                "field_mapping": json.dumps(PENDING_HIRE_REPORT_MAPPING, ensure_ascii=False),
            },
        )


def upgrade() -> None:
    bind = op.get_bind()
    data_object_ids: set[int] = set()

    template = bind.execute(
        sa.text(
            "SELECT id, nodes_json FROM ucp_pipeline_template "
            "WHERE template_code = :pipeline_code"
        ),
        {"pipeline_code": PIPELINE_CODE},
    ).mappings().first()
    if template is not None:
        nodes, ids, changed = _normalize_pipeline_steps(_json_value(template["nodes_json"]))
        data_object_ids.update(ids)
        if changed and nodes is not None:
            bind.execute(
                sa.text(
                    "UPDATE ucp_pipeline_template "
                    "SET nodes_json = CAST(:nodes AS json), updated_at = now() WHERE id = :id"
                ),
                {"id": template["id"], "nodes": json.dumps(nodes, ensure_ascii=False)},
            )

    pipeline = bind.execute(
        sa.text(
            "SELECT id, steps FROM ucp_pipeline_config "
            "WHERE pipeline_code = :pipeline_code"
        ),
        {"pipeline_code": PIPELINE_CODE},
    ).mappings().first()
    if pipeline is not None:
        steps, ids, changed = _normalize_pipeline_steps(_json_value(pipeline["steps"]))
        data_object_ids.update(ids)
        if changed and steps is not None:
            bind.execute(
                sa.text(
                    "UPDATE ucp_pipeline_config "
                    "SET steps = CAST(:steps AS json), updated_at = now() WHERE id = :id"
                ),
                {"id": pipeline["id"], "steps": json.dumps(steps, ensure_ascii=False)},
            )

    _seed_empty_data_object_mapping(bind, data_object_ids)


def downgrade() -> None:
    pass
