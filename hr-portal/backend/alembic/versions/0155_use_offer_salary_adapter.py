"""use the normalized Feishu Offer adapter for pending-hire enrichment

Revision ID: 0155_use_offer_salary_adapter
Revises: 0154_pending_hire_report_field_mapping
Create Date: 2026-07-30
"""
from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision = "0155_use_offer_salary_adapter"
down_revision = "0154_pending_hire_report_field_mapping"
branch_labels = None
depends_on = None


PIPELINE_CODE = "PENDING_HIRE_OFFER_ENRICHMENT"
TARGET_BONUS_FIELD_ID = "6909390106738821390"


def _json_value(value: object) -> list | None:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else None
    return None


def _ensure_bonus_lookup_params(items: object) -> tuple[list | None, bool]:
    if not isinstance(items, list):
        return None, False
    changed = False
    for step in items:
        if not isinstance(step, dict) or (step.get("id") or step.get("step_id")) != "lookup_offer":
            continue
        config = step.get("config") if isinstance(step.get("config"), dict) else step
        params = config.get("params")
        if not isinstance(params, dict):
            params = {}
            config["params"] = params
        if not params.get("target_bonus_custom_field_ids"):
            params["target_bonus_custom_field_ids"] = [TARGET_BONUS_FIELD_ID]
            changed = True
    return items, changed


def _update_pipeline_json(bind: sa.Connection, *, table: str, column: str, code_column: str) -> None:
    row = bind.execute(
        sa.text(f"SELECT id, {column} FROM {table} WHERE {code_column} = :pipeline_code"),
        {"pipeline_code": PIPELINE_CODE},
    ).mappings().first()
    if row is None:
        return
    items, changed = _ensure_bonus_lookup_params(_json_value(row[column]))
    if changed and items is not None:
        bind.execute(
            sa.text(f"UPDATE {table} SET {column} = CAST(:items AS json), updated_at = now() WHERE id = :id"),
            {"id": row["id"], "items": json.dumps(items, ensure_ascii=False)},
        )


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE ucp_operation_definition AS operation "
            "SET adapter_code = 'FEISHU_OFFER_DETAIL_ADAPTER' "
            "FROM ucp_connector_package AS package "
            "WHERE operation.package_id = package.id "
            "AND package.package_code = 'FEISHU_RECRUIT' "
            "AND operation.object_code = 'OFFER' "
            "AND operation.operation_code = 'QUERY_BY_CANDIDATE_ID'"
        )
    )
    _update_pipeline_json(
        bind,
        table="ucp_pipeline_template",
        column="nodes_json",
        code_column="template_code",
    )
    _update_pipeline_json(
        bind,
        table="ucp_pipeline_config",
        column="steps",
        code_column="pipeline_code",
    )


def downgrade() -> None:
    pass
