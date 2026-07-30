"""repair pending-hire runtime pipeline field codes

Revision ID: 0153_pending_hire_runtime_config
Revises: 0151_pending_hire_template_field_codes
Create Date: 2026-07-30
"""
from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision = "0153_pending_hire_runtime_config"
down_revision = "0151_pending_hire_template_field_codes"
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


def _normalize_steps(steps: object) -> tuple[list | None, set[int], bool]:
    if not isinstance(steps, list):
        return None, set(), False

    data_object_ids: set[int] = set()
    changed = False
    for step in steps:
        if not isinstance(step, dict):
            continue
        payload = step.get("config") if isinstance(step.get("config"), dict) else step
        step_id = step.get("step_id") or step.get("id")
        if step_id == "read_pending" and isinstance(payload.get("data_object_id"), int):
            data_object_ids.add(payload["data_object_id"])
        if step_id in {"lookup_offer", "write_asset"}:
            normalized, step_changed = _replace_legacy_codes(payload)
            if step_changed:
                if payload is step:
                    step.clear()
                    step.update(normalized)
                else:
                    step["config"] = normalized
                changed = True
    return steps, data_object_ids, changed


def _update_data_object_mappings(bind: sa.Connection, data_object_ids: set[int]) -> None:
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
        if not isinstance(field_mapping, (dict, list)):
            continue
        normalized, mapping_changed = _replace_legacy_codes(field_mapping)
        if mapping_changed:
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


def upgrade() -> None:
    bind = op.get_bind()
    pipeline = bind.execute(
        sa.text(
            "SELECT id, steps FROM ucp_pipeline_config "
            "WHERE pipeline_code = :pipeline_code"
        ),
        {"pipeline_code": TEMPLATE_CODE},
    ).mappings().first()
    if pipeline is None:
        return

    steps = _json_value(pipeline["steps"])
    normalized, data_object_ids, changed = _normalize_steps(steps)
    if changed and normalized is not None:
        bind.execute(
            sa.text(
                "UPDATE ucp_pipeline_config "
                "SET steps = CAST(:steps AS json), updated_at = now() WHERE id = :id"
            ),
            {"id": pipeline["id"], "steps": json.dumps(normalized, ensure_ascii=False)},
        )
    _update_data_object_mappings(bind, data_object_ids)


def downgrade() -> None:
    pass
