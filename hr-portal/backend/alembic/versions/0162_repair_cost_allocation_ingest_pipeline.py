"""Repair the deployed cost-allocation ingest pipeline step contract."""
from __future__ import annotations

import copy

import sqlalchemy as sa
from alembic import op


revision = "0162_repair_cost_allocation_ingest_pipeline"
down_revision = "0157_cost_allocation_webhook_instance"
branch_labels = None
depends_on = None


PIPELINE_CODE = "COST_ALLOCATION_LOCKED_INGEST"


def _pipeline_table():
    return sa.table(
        "ucp_pipeline_config",
        sa.column("pipeline_code", sa.String(64)),
        sa.column("steps", sa.JSON()),
    )


def upgrade() -> None:
    bind = op.get_bind()
    table = _pipeline_table()
    row = bind.execute(
        sa.select(table.c.steps).where(table.c.pipeline_code == PIPELINE_CODE)
    ).first()
    if not row:
        return
    steps = copy.deepcopy(row.steps or [])
    changed = False
    for step in steps:
        if step.get("type") != "WAREHOUSE_ASSET_SINK":
            continue
        nested = dict(step.pop("config", {}) or {})
        nested.setdefault("step_id", step.get("step_id") or step.get("id") or "write_asset")
        nested.setdefault("input_key", "${event.records}")
        nested.update({key: value for key, value in step.items() if key not in {"id", "type", "label"}})
        repaired = {
            "step_id": nested.pop("step_id"),
            "type": step.get("type"),
            **nested,
        }
        if step.get("label"):
            repaired["label"] = step["label"]
        step.clear()
        step.update(repaired)
        changed = True
    if changed:
        bind.execute(
            table.update()
            .where(table.c.pipeline_code == PIPELINE_CODE)
            .values(steps=steps)
        )


def downgrade() -> None:
    bind = op.get_bind()
    table = _pipeline_table()
    row = bind.execute(
        sa.select(table.c.steps).where(table.c.pipeline_code == PIPELINE_CODE)
    ).first()
    if not row:
        return
    steps = copy.deepcopy(row.steps or [])
    changed = False
    for step in steps:
        if step.get("type") != "WAREHOUSE_ASSET_SINK":
            continue
        config = {
            key: value
            for key, value in step.items()
            if key not in {"step_id", "type", "label"}
        }
        original = {"id": step.get("step_id", "write_asset"), "type": step["type"], "config": config}
        if step.get("label"):
            original["label"] = step["label"]
        step.clear()
        step.update(original)
        changed = True
    if changed:
        bind.execute(
            table.update()
            .where(table.c.pipeline_code == PIPELINE_CODE)
            .values(steps=steps)
        )
