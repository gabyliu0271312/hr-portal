from types import SimpleNamespace
from unittest.mock import AsyncMock

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


def _sink_graph(config):
    return [
        {"id": "start", "type": "START_TRIGGER", "config": {"trigger_types": ["WEBHOOK"]}},
        {"id": "sink", "type": "WAREHOUSE_ASSET_SINK", "config": config},
    ], [{"from": "start", "to": "sink"}]


def _component_config(rules):
    return {
        "target_asset": "pending_hires",
        "storageMode": "component_v1",
        "field_whitelist": ["application_id"],
        "mapping_component": {
            "mappingSchemaVersion": 1,
            "ruleSet": {"code": "SINK", "targetAsset": "pending_hires", "rules": rules},
        },
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("code", ["cost_center_sync", "Cost_CENTER_SYNC", "1AB", "AB-C", "AB", "A" * 65])
async def test_template_code_rejection_explains_uppercase_contract(code):
    from app.ucp.pipeline_template import PipelineTemplateError, create_template

    with pytest.raises(PipelineTemplateError) as error:
        await create_template(object(), template_code=code, name="成本中心同步")

    assert str(error.value) == (
        "template_code 格式错误：流程编码须以大写字母开头，仅允许大写字母、数字和下划线，"
        "长度为3–64位，例如 COST_CENTER_SYNC"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("code", ["ABC", "COST_CENTER_SYNC", "A" * 64])
async def test_valid_template_code_reaches_graph_validation_unchanged(code):
    from app.ucp.pipeline_template import PipelineTemplateError, create_template

    with pytest.raises(PipelineTemplateError, match="exactly one START_TRIGGER"):
        await create_template(object(), template_code=code, name="成本中心同步")


@pytest.mark.asyncio
async def test_template_create_route_returns_chinese_code_error(monkeypatch):
    monkeypatch.setattr(pipeline_templates, "get_template", AsyncMock(return_value=None))
    payload = pipeline_templates.TemplateCreatePayload(
        template_code="cost_center_sync", name="成本中心同步",
    )

    with pytest.raises(HTTPException) as error:
        await pipeline_templates.route_create_template(payload, db=object(), user=SimpleNamespace(id=1))

    assert error.value.status_code == 400
    assert "流程编码须以大写字母开头" in error.value.detail
    assert "COST_CENTER_SYNC" in error.value.detail


@pytest.mark.parametrize("field", ["source", "target"])
@pytest.mark.parametrize("value", [None, "", " \t", 1])
def test_warehouse_sink_rejects_mixed_complete_and_incomplete_legacy_rules(field, value):
    from app.ucp.pipeline_template import PipelineTemplateError, validate_graph

    incomplete = {"source": "offer_id", "target": "offer_id", field: value}
    config = {
        "target_asset": "pending_hires",
        "mapping": [{"source": "application_id", "target": "application_id"}, incomplete],
    }
    with pytest.raises(PipelineTemplateError, match=r"mapping\[1\].*source.*target"):
        validate_graph(*_sink_graph(config))


@pytest.mark.parametrize("rule_type", [
    "field", "value_map", "reference_lookup", "identity_with_overrides",
    "type_convert", "format", "split_merge",
])
@pytest.mark.parametrize("field", ["sourceFields", "targetFields"])
def test_warehouse_sink_rejects_enabled_component_draft_among_complete_rules(rule_type, field):
    from app.ucp.pipeline_template import PipelineTemplateError, validate_graph

    rules = [
        {"id": "complete", "type": "field", "sourceFields": ["application_id"], "targetFields": ["application_id"]},
        {"id": "draft", "type": rule_type, "sourceFields": ["offer_id"], "targetFields": ["offer_id"], field: []},
    ]
    with pytest.raises(PipelineTemplateError, match=rf"rules\[1\].{field}"):
        validate_graph(*_sink_graph(_component_config(rules)))


@pytest.mark.parametrize("field", ["sourceFields", "targetFields"])
@pytest.mark.parametrize("value", [None, "application_id", [""], [" \t"], [None], [1], ["application_id", ""]])
def test_warehouse_sink_rejects_invalid_component_field_arrays(field, value):
    from app.ucp.pipeline_template import PipelineTemplateError, validate_graph

    rule = {"id": "rule", "type": "field", "sourceFields": ["application_id"], "targetFields": ["application_id"], field: value}
    with pytest.raises(PipelineTemplateError, match=field):
        validate_graph(*_sink_graph(_component_config([rule])))


@pytest.mark.parametrize("rule_type", [
    "field", "value_map", "reference_lookup", "identity_with_overrides",
    "type_convert", "format", "split_merge",
])
def test_warehouse_sink_accepts_disabled_component_drafts(rule_type):
    from app.ucp.pipeline_template import validate_graph

    config = _component_config([
        {"id": "complete", "type": "field", "sourceFields": ["application_id"], "targetFields": ["application_id"]},
        {"id": "draft", "type": rule_type, "enabled": False},
    ])
    nodes, _ = validate_graph(*_sink_graph(config))
    assert nodes[1]["config"] == config


@pytest.mark.parametrize("action,sources,targets", [
    ("split", ["full_name"], ["first_name", "last_name"]),
    ("merge", ["first_name", "last_name"], ["full_name"]),
])
def test_warehouse_sink_keeps_split_merge_multifield_rules(action, sources, targets):
    from app.ucp.pipeline_template import validate_graph

    config = _component_config([
        {"id": "names", "type": "split_merge", "sourceFields": sources, "targetFields": targets, "config": {"action": action, "delimiter": " "}},
    ])
    nodes, _ = validate_graph(*_sink_graph(config))
    assert nodes[1]["config"] == config


@pytest.mark.asyncio
async def test_warehouse_sink_asset_targets_ignore_disabled_component_rules():
    from app.ucp.pipeline_template import _validate_warehouse_sink_assets, validate_graph

    config = _component_config([
        {"id": "complete", "type": "field", "sourceFields": ["application_id"], "targetFields": ["application_id"]},
        {"id": "disabled_duplicate", "type": "field", "enabled": False, "targetFields": ["application_id"]},
        {"id": "disabled_draft", "type": "split_merge", "enabled": False},
    ])
    nodes, _ = validate_graph(*_sink_graph(config))
    db = SimpleNamespace(
        scalar=AsyncMock(return_value=SimpleNamespace(asset_status="published")),
        execute=AsyncMock(return_value=SimpleNamespace(scalars=lambda: [SimpleNamespace(column_code="application_id")])),
    )
    await _validate_warehouse_sink_assets(db, nodes)
