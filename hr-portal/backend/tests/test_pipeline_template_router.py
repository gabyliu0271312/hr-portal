from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.ucp.routers import pipeline_templates


@pytest.mark.asyncio
async def test_duplicate_template_create_returns_conflict(monkeypatch):
    async def existing_template(*_args, **_kwargs):
        return object()

    monkeypatch.setattr(pipeline_templates, "get_template", existing_template)
    payload = pipeline_templates.TemplateCreatePayload(
        template_code="PENDING_HIRE_OFFER_ENRICHMENT",
        name="Pending hire offer enrichment",
        nodes=[],
        edges=[],
    )

    with pytest.raises(HTTPException) as error:
        await pipeline_templates.route_create_template(
            payload,
            db=object(),
            user=SimpleNamespace(id=1),
        )

    assert error.value.status_code == 409


def test_warehouse_sink_rejects_period_snapshot_without_period_field():
    from app.ucp.pipeline_template import PipelineTemplateError, validate_graph

    nodes = [
        {"id": "start", "type": "START_TRIGGER", "x": 0, "y": 0, "label": "", "config": {"trigger_types": ["WEBHOOK"]}},
        {"id": "sink", "type": "WAREHOUSE_ASSET_SINK", "x": 1, "y": 1, "label": "", "config": {"target_asset": "emp_monthly_allocation", "write_mode": "period_full_snapshot"}},
    ]
    with pytest.raises(PipelineTemplateError, match="period_field"):
        validate_graph(nodes, [{"from": "start", "to": "sink"}])


def test_warehouse_sink_keeps_legacy_primary_key_modes_compatible():
    from app.ucp.pipeline_template import validate_graph

    nodes = [
        {"id": "start", "type": "START_TRIGGER", "x": 0, "y": 0, "label": "", "config": {"trigger_types": ["WEBHOOK"]}},
        {"id": "sink", "type": "WAREHOUSE_ASSET_SINK", "x": 1, "y": 1, "label": "", "config": {"target_asset": "pending_hires", "write_mode": "upsert", "primary_key": "application_id"}},
    ]
    normalized, _ = validate_graph(nodes, [{"from": "start", "to": "sink"}])
    assert normalized[1]["config"]["primary_key"] == "application_id"
