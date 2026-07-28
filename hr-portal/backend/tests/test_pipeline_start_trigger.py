import pytest
from types import SimpleNamespace

from app.ucp.pipeline_engine import (
    PipelineContext,
    _evaluate_route_condition,
    _execute_approval_step,
    _execute_branch_step,
    _execute_start_trigger_step,
    _should_execute_graph_step,
)
from app.ucp.pipeline_node_catalog import NODE_CATALOG, canonical_node_label, node_type_metadata
from app.ucp.pipeline_template import PipelineTemplateError, topologically_sort_nodes, validate_graph


def _start_node(**config):
    return {
        "id": "start_trigger",
        "type": "START_TRIGGER",
        "x": 0,
        "y": 120,
        "label": "Trigger start",
        "config": {
            "mode": "OR",
            "trigger_types": ["WEBHOOK", "SCHEDULE", "MANUAL"],
            "management_path": "/ucp/events/triggers",
            **config,
        },
    }


def _approval_node():
    return {
        "id": "approval",
        "type": "APPROVAL",
        "x": 300,
        "y": 120,
        "label": "Approval",
        "config": {},
    }


def test_start_trigger_graph_accepts_one_start_without_incoming_edge():
    nodes, edges = validate_graph(
        [_start_node(), _approval_node()],
        [{"from": "start_trigger", "to": "approval"}],
    )

    assert nodes[0]["type"] == "START_TRIGGER"
    assert edges == [{"from": "start_trigger", "to": "approval", "condition": ""}]


@pytest.mark.parametrize(
    ("nodes", "edges", "message"),
    [
        ([_approval_node()], [], "exactly one START_TRIGGER"),
        ([_start_node(), {**_start_node(), "id": "second_start"}], [], "exactly one START_TRIGGER"),
        ([_start_node(), _approval_node()], [{"from": "approval", "to": "start_trigger"}], "cannot have incoming"),
        ([_start_node(secret="not-allowed"), _approval_node()], [], "may only contain"),
    ],
)
def test_start_trigger_graph_rejects_invalid_start_contract(nodes, edges, message):
    with pytest.raises(PipelineTemplateError, match=message):
        validate_graph(nodes, edges)


def test_start_trigger_execution_preserves_trigger_context():
    context = PipelineContext("trace-1", "run-1")
    context.set("trigger", {"event_id": "evt-1"})

    result = _execute_start_trigger_step(
        {"mode": "OR", "trigger_types": ["WEBHOOK"]}, context
    )

    assert result == {
        "status": "success",
        "mode": "OR",
        "trigger_types": ["WEBHOOK"],
        "trigger_context_present": True,
    }
    assert context.get("trigger") == {"event_id": "evt-1"}


def test_node_catalog_exposes_the_draggable_start_trigger_and_executable_types():
    palette = node_type_metadata(palette_only=True)

    assert {item["type"] for item in palette} == set(NODE_CATALOG)
    assert len(NODE_CATALOG["START_TRIGGER"]["label"]) == 4
    assert NODE_CATALOG["START_TRIGGER"]["locked"] is False
    assert all(item["code"].startswith("N") and len(item["label"]) == 4 for item in palette)


def test_graph_order_follows_edges_not_node_array_order():
    nodes = [_start_node(), {**_approval_node(), "id": "second"}, {**_approval_node(), "id": "first"}]
    edges = [
        {"from": "start_trigger", "to": "first"},
        {"from": "first", "to": "second"},
    ]
    normalized_nodes, normalized_edges = validate_graph(nodes, edges)

    assert [node["id"] for node in topologically_sort_nodes(normalized_nodes, normalized_edges)] == [
        "start_trigger", "first", "second",
    ]


def test_graph_rejects_disconnected_node():
    with pytest.raises(PipelineTemplateError, match="reachable"):
        validate_graph([_start_node(), _approval_node()], [])


def test_legacy_node_label_is_preserved_as_alias_but_type_name_is_canonical():
    nodes, _ = validate_graph(
        [
            {**_start_node(), "label": "Trigger start"},
            {**_approval_node(), "label": "??????"},
        ],
        [{"from": "start_trigger", "to": "approval"}],
    )

    assert nodes[0]["label"] == canonical_node_label("START_TRIGGER")
    assert nodes[0]["config"]["business_alias"] == "Trigger start"
    assert nodes[1]["label"] == canonical_node_label("APPROVAL")
    assert nodes[1]["config"]["business_alias"] == "??????"


def _branch_node():
    return {
        "id": "branch",
        "type": "BRANCH",
        "x": 160,
        "y": 120,
        "label": "Branch",
        "config": {
            "condition_ast": {"version": 1, "mode": "ALL", "rules": [{"left_field_id": "is_employee_offboarded", "operator": "EQ", "right": True}]},
            "condition_field_catalog": [{"field_id": "is_employee_offboarded", "type": "boolean"}],
        },
    }


def test_branch_graph_requires_explicit_true_and_false_routes():
    nodes = [_start_node(), _branch_node(), _approval_node(), {**_approval_node(), "id": "false_target"}]
    edges = [
        {"from": "start_trigger", "to": "branch"},
        {"from": "branch", "to": "approval", "condition": "BRANCH_TRUE:branch"},
        {"from": "branch", "to": "false_target", "condition": "BRANCH_FALSE:branch"},
    ]

    assert validate_graph(nodes, edges)[1] == [
        {"from": "start_trigger", "to": "branch", "condition": ""},
        *edges[1:],
    ]

    edges[2]["condition"] = ""
    with pytest.raises(PipelineTemplateError, match="true and false conditional"):
        validate_graph(nodes, edges)


@pytest.mark.asyncio
async def test_graph_branch_uses_edge_routes_and_safe_context_access():
    context = PipelineContext("trace-1", "run-1")
    context.set("trigger", {"is_employee_offboarded": True})
    context.set("is_employee_offboarded", True)

    assert _should_execute_graph_step({"_incoming_edges": []}, context)

    result = await _execute_branch_step(
        {"step_id": "branch", **_branch_node()["config"], "_graph_routing": True},
        context,
        object(),
    )
    context.set("branch", result)

    assert result["branch_taken"] == "true_branch"
    assert _should_execute_graph_step(
        {"_incoming_edges": [{"from": "branch", "condition": "BRANCH_TRUE:branch"}]},
        context,
    )
    assert not _should_execute_graph_step(
        {"_incoming_edges": [{"from": "branch", "condition": "BRANCH_FALSE:branch"}]},
        context,
    )
    assert not _evaluate_route_condition("ctx.__class__", context)


@pytest.mark.asyncio
async def test_approval_without_approvers_fails_closed():
    with pytest.raises(RuntimeError, match="requires at least one approver"):
        await _execute_approval_step({}, PipelineContext("trace-1", "run-1"), object(), "trace-1", "run-1")


@pytest.mark.asyncio
async def test_approval_creates_request_and_returns_waiting_state(monkeypatch):
    from app.ucp import approval_service

    captured = {}

    async def submit_request(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id=42, request_code="APR-TEST")

    monkeypatch.setattr(approval_service, "submit_request", submit_request)

    result = await _execute_approval_step(
        {"step_id": "approval", "approvers": [{"user_id": "u-1", "user_name": "Approver"}]},
        PipelineContext("trace-1", "run-1"),
        object(),
        "trace-1",
        "run-1",
    )

    assert result["status"] == "waiting_approval"
    assert result["approval_id"] == 42
    assert captured["pipeline_run_id"] == "run-1"


@pytest.mark.asyncio
async def test_approved_pipeline_resumes_after_waiting_step(monkeypatch):
    from app.ucp import pipeline_engine

    execution = SimpleNamespace(
        pipeline_run_id="run-1",
        pipeline_code="OFFBOARDING",
        trace_id="trace-1",
        status="WAITING_APPROVAL",
        success_steps=2,
        failed_steps=0,
    )

    class Result:
        def scalar_one_or_none(self):
            return execution

    class Session:
        async def execute(self, _statement):
            return Result()

    captured = {}

    async def execute_pipeline(*args, **kwargs):
        captured.update(kwargs)
        captured["pipeline_code"] = args[0]
        return SimpleNamespace(status="SUCCESS", error_message=None)

    monkeypatch.setattr(pipeline_engine, "execute_pipeline", execute_pipeline)
    request = SimpleNamespace(
        business_type="pipeline_step",
        action_payload={
            "pipeline_run_id": "run-1",
            "pipeline_code": "OFFBOARDING",
            "trigger_payload": {"employee_id": "E-1"},
            "step_config": {"step_id": "approval"},
        },
    )

    await pipeline_engine.resume_pipeline_after_approval(Session(), request)

    assert captured["pipeline_code"] == "OFFBOARDING"
    assert captured["existing_execution"] is execution
    assert captured["resume_after_step_id"] == "approval"
