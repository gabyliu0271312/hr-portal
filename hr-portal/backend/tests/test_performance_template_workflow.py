from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException, status
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext
from app.performance.template_workflow_service import (
    TemplateWorkflowValidationError,
    default_workflow_nodes,
    normalize_workflow_nodes,
)
from app.performance.executor_config import normalize_executor_config, project_legacy_executor_fields
from app.performance.models import PerformanceTemplate, PerformanceTemplateWorkflow
from app.performance import templates_router
from app.performance.templates_router import WorkflowNode, WorkflowUpdate


def _evaluation(
    node_id: str,
    executor_label: str,
    *,
    allow: bool = False,
    scope: str = "ALL",
    invite_types: list[str] | None = None,
    require_previous: bool = False,
):
    return {
        "node_id": node_id,
        "node_type": "evaluation",
        "name": node_id,
        "description": "",
        "order": 99,
        "executor_types": [],
        "executor_label": executor_label,
        "evaluation_type": "MULTI" if executor_label == "360°评估人" else "SINGLE",
        "include_final_result": False,
        "system": False,
        "allow_invite_other_executors": allow,
        "invite_executor_scope": scope,
        "invite_executor_types": invite_types or [],
        "require_previous_node_completion": require_previous,
    }


def test_workflow_contract_defaults_new_invitation_fields():
    payload = WorkflowNode.model_validate(default_workflow_nodes()[0])
    result_view = WorkflowNode.model_validate(default_workflow_nodes()[1])

    assert payload.allow_invite_other_executors is False
    assert payload.invite_executor_scope == "ALL"
    assert payload.invite_executor_types == []
    assert payload.require_previous_node_completion is False
    assert payload.calibration_reason_enabled is False
    assert payload.calibration_reason_required is False
    assert payload.subject_confirm_required is False
    assert result_view.subject_confirm_required is False
    assert WorkflowUpdate(nodes=[payload]).nodes[0].node_id == "evaluation-1"


def test_content_library_preserves_same_name_and_repairs_id_collision():
    from app.performance.template_workflow_service import normalize_content_library

    contents = [
        {"content_id": "duplicate", "type": "work_summary", "name": "同名", "description": "", "items": []},
        {"content_id": "duplicate", "type": "work_summary", "name": "同名", "description": "", "items": []},
    ]

    normalized = normalize_content_library(contents)

    assert len(normalized) == 2
    assert len({content["content_id"] for content in normalized}) == 2
    assert [content["name"] for content in normalized] == ["同名", "同名"]



def test_workflow_content_survives_canonical_normalization():
    content = {
        "id": "work-summary-1",
        "type": "work_summary",
        "name": "工作总结",
        "description": "本周产出",
        "items": [{"id": "item-1", "label": "填写题名称", "hint": "提示", "richText": ""}],
    }
    node = _evaluation("evaluation-1", "实线上级")
    node["content"] = [content]

    normalized = normalize_workflow_nodes([node])

    assert normalized[0]["content"] == [content]
    assert WorkflowNode.model_validate(normalized[0]).content == [content]



def test_normalization_deduplicates_candidates_and_removes_stale_roles():
    nodes = [
        _evaluation(
            "360-1",
            "360°评估人",
            allow=True,
            scope="PARTIAL",
            invite_types=["实线上级", "实线上级", "已删除角色"],
        ),
        _evaluation("manager-1", "实线上级"),
    ]

    normalized = normalize_workflow_nodes(nodes)

    assert normalized[0]["order"] == 1
    assert normalized[0]["invite_executor_types"] == ["实线上级"]


def test_single_partial_360_node_requires_a_role():
    with pytest.raises(TemplateWorkflowValidationError, match="请选择允许邀请的执行人角色") as exc:
        normalize_workflow_nodes([
            _evaluation("360-1", "360°评估人", allow=True, scope="PARTIAL")
        ])

    assert exc.value.node_id == "360-1"


def test_two_empty_partial_360_nodes_report_only_the_first():
    with pytest.raises(TemplateWorkflowValidationError) as exc:
        normalize_workflow_nodes([
            _evaluation("360-1", "360°评估人", allow=True, scope="PARTIAL"),
            _evaluation("360-2", "360°评估人", allow=True, scope="PARTIAL"),
        ])

    assert exc.value.node_id == "360-1"


def test_one_valid_360_node_allows_another_partial_node_to_remain_empty():
    normalized = normalize_workflow_nodes([
        _evaluation("360-1", "360°评估人", allow=True, scope="PARTIAL"),
        _evaluation("360-2", "360°评估人", allow=True, scope="ALL"),
    ])

    assert normalized[0]["invite_executor_types"] == []


def test_one_selected_partial_role_allows_another_partial_node_to_remain_empty():
    normalized = normalize_workflow_nodes([
        _evaluation("360-1", "360°评估人", allow=True, scope="PARTIAL"),
        _evaluation(
            "360-2",
            "360°评估人",
            allow=True,
            scope="PARTIAL",
            invite_types=["360°评估人"],
        ),
    ])

    assert normalized[0]["invite_executor_types"] == []
    assert normalized[1]["invite_executor_types"] == ["360°评估人"]


def test_switching_executor_keeps_node_scoped_invitation_configuration():
    node = _evaluation(
        "evaluation-1",
        "被评估人",
        allow=True,
        scope="PARTIAL",
        invite_types=["实线上级"],
    )
    normalized = normalize_workflow_nodes([node, _evaluation("manager-1", "实线上级")])

    assert normalized[0]["allow_invite_other_executors"] is True
    assert normalized[0]["invite_executor_scope"] == "PARTIAL"
    assert normalized[0]["invite_executor_types"] == ["实线上级"]


def test_360_invitation_uses_fixed_subject_executor_and_previous_requirement_only_after_first_node():
    first = {
        "node_id": "invite-1", "node_type": "reviewer_360_invite", "name": "invite-1", "description": "", "order": 1,
        "executor_types": ["DIRECT_MANAGER"], "executor_label": "实线上级", "evaluation_type": None,
        "include_final_result": False, "system": False, "allow_invite_other_executors": False,
        "invite_executor_scope": "ALL", "invite_executor_types": [], "require_previous_node_completion": True,
    }
    second = {**first, "node_id": "invite-2", "order": 2}

    normalized = normalize_workflow_nodes([first, _evaluation("evaluation-1", "实线上级"), second])

    assert normalized[0]["executor_label"] == "被评估人"
    assert normalized[0]["executor_types"] == ["SUBJECT"]
    assert normalized[0]["require_previous_node_completion"] is False
    assert normalized[2]["executor_label"] == "被评估人"
    assert normalized[2]["executor_types"] == ["SUBJECT"]
    assert normalized[2]["require_previous_node_completion"] is True


def test_non_360_nodes_cannot_retain_previous_requirement():
    normalized = normalize_workflow_nodes([_evaluation("evaluation-1", "实线上级", require_previous=True)])

    assert normalized[0]["require_previous_node_completion"] is False
    assert normalized[0]["calibration_reason_enabled"] is False
    assert normalized[0]["calibration_reason_required"] is False


def test_result_view_subject_confirmation_defaults_off_and_is_scoped_to_result_view():
    result_view = {
        "node_id": "result-view-1", "node_type": "result_view", "name": "结果查看", "description": "", "order": 2,
        "executor_types": ["DIRECT_MANAGER"], "executor_label": "实线上级", "evaluation_type": None,
        "include_final_result": False, "system": True, "subject_confirm_required": True,
        "allow_invite_other_executors": False, "invite_executor_scope": "ALL", "invite_executor_types": [],
        "require_previous_node_completion": False,
    }
    evaluation = _evaluation("evaluation-1", "实线上级")

    normalized = normalize_workflow_nodes([evaluation, result_view])

    assert normalized[1]["executor_label"] == "被评估人"
    assert normalized[1]["executor_types"] == ["SUBJECT"]
    assert normalized[1]["subject_confirm_required"] is True
    assert normalized[0]["subject_confirm_required"] is False


def test_360_confirmation_reuses_manager_executor_contract_and_limits_real_line_levels():
    confirmation = {
        "node_id": "confirm-1", "node_type": "reviewer_360_confirm", "name": "confirm-1", "description": "", "order": 2,
        "executor_types": ["DIRECT_MANAGER", "LEVEL_1_MANAGER", "LEVEL_2_MANAGER", "LEVEL_3_MANAGER_PLUS", "LEVEL_2_MANAGER"],
        "executor_label": "不支持的执行人", "evaluation_type": None, "include_final_result": False, "system": False,
        "allow_invite_other_executors": False, "invite_executor_scope": "ALL", "invite_executor_types": [],
        "require_previous_node_completion": False,
    }

    normalized = normalize_workflow_nodes([_evaluation("evaluation-1", "实线上级"), confirmation])

    assert normalized[1]["executor_label"] == "实线上级"
    assert normalized[1]["executor_types"] == ["DIRECT_MANAGER", "LEVEL_1_MANAGER", "LEVEL_2_MANAGER"]


def test_360_confirmation_preserves_virtual_manager_and_defaults_empty_real_line_to_direct_manager():
    base = {
        "node_id": "confirm-1", "node_type": "reviewer_360_confirm", "name": "confirm-1", "description": "", "order": 2,
        "executor_types": [], "executor_label": "虚线上级", "evaluation_type": None, "include_final_result": False,
        "system": False, "allow_invite_other_executors": False, "invite_executor_scope": "ALL",
        "invite_executor_types": [], "require_previous_node_completion": False,
    }

    virtual = normalize_workflow_nodes([_evaluation("evaluation-1", "实线上级"), base])[1]
    real = normalize_workflow_nodes([_evaluation("evaluation-1", "实线上级"), {**base, "executor_label": "实线上级"}])[1]

    assert virtual["executor_label"] == "虚线上级"
    assert virtual["executor_types"] == []
    assert real["executor_types"] == ["DIRECT_MANAGER"]


def test_calibration_executor_is_a_project_configured_placeholder_for_template_api():
    calibration = {
        "node_id": "calibration-1", "node_type": "calibration", "name": "calibration-1", "description": "", "order": 2,
        "executor_types": ["DIRECT_MANAGER", "PROJECT_CONFIGURED"], "executor_label": "旧执行人", "evaluation_type": None,
        "include_final_result": False, "system": False, "allow_invite_other_executors": False,
        "invite_executor_scope": "ALL", "invite_executor_types": [], "require_previous_node_completion": False,
    }

    normalized = normalize_workflow_nodes([_evaluation("evaluation-1", "实线上级"), calibration])

    assert normalized[1]["executor_label"] == "在项目配置时指定"
    assert normalized[1]["executor_types"] == ["PROJECT_CONFIGURED"]
    assert normalized[1]["calibration_reason_enabled"] is True
    assert normalized[1]["calibration_reason_required"] is False


def test_calibration_reason_settings_round_trip_and_clear_required_when_disabled():
    calibration = {
        "node_id": "calibration-1", "node_type": "calibration", "name": "calibration-1", "description": "", "order": 2,
        "executor_types": ["PROJECT_CONFIGURED"], "executor_label": "在项目配置时指定", "evaluation_type": None,
        "include_final_result": False, "system": False, "allow_invite_other_executors": False,
        "invite_executor_scope": "ALL", "invite_executor_types": [], "require_previous_node_completion": False,
        "calibration_reason_enabled": True, "calibration_reason_required": True,
    }

    enabled = normalize_workflow_nodes([_evaluation("evaluation-1", "实线上级"), calibration])[1]
    disabled = normalize_workflow_nodes([
        _evaluation("evaluation-1", "实线上级"),
        {**calibration, "calibration_reason_enabled": False},
    ])[1]

    assert enabled["calibration_reason_enabled"] is True
    assert enabled["calibration_reason_required"] is True
    assert disabled["calibration_reason_enabled"] is False
    assert disabled["calibration_reason_required"] is False


def test_migration_is_based_on_current_single_head_and_is_reversible():
    migration = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0205_performance_template_workflows.py"
    ).read_text(encoding="utf-8")

    assert 'down_revision = "0204_remove_merge_key_mapping_source_dimension"' in migration
    assert 'op.create_table(\n        "performance_template_workflows"' in migration
    assert 'op.drop_table("performance_template_workflows")' in migration
    assert "'[]'::jsonb" in migration


@pytest.mark.asyncio
async def test_service_save_writes_workflow_and_audit_in_one_commit(monkeypatch):
    from app.performance.template_workflow_service import PerformanceTemplateWorkflowService

    class FakeDb:
        def __init__(self):
            self.added = []
            self.commits = 0

        def add(self, value):
            self.added.append(value)

        async def commit(self):
            self.commits += 1

        async def refresh(self, _value):
            return None

    db = FakeDb()
    service = PerformanceTemplateWorkflowService(db)

    async def no_record(_template_id):
        return None

    monkeypatch.setattr(service, "get_record", no_record)
    record = await service.save_nodes(
        77,
        [{**_evaluation("evaluation-1", "实线上级"), "include_final_result": True}],
        actor_type="PORTAL_USER",
        actor_ref="9",
    )

    assert record.template_id == 77
    assert record.nodes[0]["executor_label"] == "实线上级"
    assert db.commits == 1
    assert len(db.added) == 2
    audit = next(value for value in db.added if value is not record)
    assert audit.subject_type == "PERFORMANCE_TEMPLATE"
    assert audit.subject_ref == "77"


@pytest.mark.asyncio
async def test_service_rejects_zero_or_multiple_final_result_nodes_before_writing():
    from app.performance.template_workflow_service import PerformanceTemplateWorkflowService

    class FakeDb:
        def add(self, _value):
            raise AssertionError("invalid workflow must not write")

    service = PerformanceTemplateWorkflowService(FakeDb())
    for nodes in (
        [_evaluation("evaluation-1", "实线上级")],
        [
            {**_evaluation("evaluation-1", "实线上级"), "include_final_result": True},
            {**_evaluation("evaluation-2", "实线上级"), "include_final_result": True},
        ],
    ):
        with pytest.raises(TemplateWorkflowValidationError, match="请且仅请选择一个环节作为最终结果"):
            await service.save_nodes(77, nodes, actor_type="PORTAL_USER", actor_ref="9")


@pytest.fixture
def workflow_save_setup(monkeypatch):
    from app.performance.template_workflow_service import PerformanceTemplateWorkflowService

    db = _TemplateMetadataDb(None)
    service = PerformanceTemplateWorkflowService(db)

    async def get_record(_template_id):
        return db.workflow

    monkeypatch.setattr(service, "get_record", get_record)
    return service, db


def _view_source_content(content_id="final-content", content_type="rating", **overrides):
    return {
        "content_id": content_id,
        "type": content_type,
        "name": "终评内容",
        "items": [{"id": "item-1", "settings": {"mode": "fill"}}],
        **overrides,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("content_type", ["rating", "work_summary", "custom"])
@pytest.mark.parametrize("source_form", ["inline", "default-fill", "bindings"])
@pytest.mark.parametrize("view_form", ["inline", "bindings"])
async def test_service_saves_result_view_only_from_final_fill_and_reopens(
    workflow_save_setup, content_type, source_form, view_form,
):
    service, db = workflow_save_setup
    content = _view_source_content(content_type=content_type, items=[
        {"id": "hidden", "settings": {"mode": "hidden"}},
        {"id": "visible"},
    ])
    final = {**_evaluation("final", "实线上级"), "include_final_result": True}
    if source_form == "bindings":
        final["content_bindings"] = {"fill": [content["content_id"]]}
    else:
        final["content"] = [
            {**content, "content_slot": "fill"} if source_form == "inline" else content
        ]
    view = default_workflow_nodes()[1]
    if view_form == "inline":
        view["content"] = [{**content, "content_slot": "view"}]
    else:
        view["content_bindings"] = {"view": [content["content_id"]]}

    record = await service.save_nodes(
        77, [final, view], content_library=[content],
        actor_type="PORTAL_USER", actor_ref="9",
    )
    db.workflow = record
    reopened, _, _ = await service.get_nodes(77)
    library = await service.get_content_library(77)

    assert reopened[0]["content_bindings"]["fill"] == [content["content_id"]]
    assert reopened[1]["content_bindings"]["view"] == [content["content_id"]]
    assert record.content_library == [content]
    assert next(item for item in library if item["content_id"] == content["content_id"]) == content
    assert db.commits == 1
    assert len(db.added) == 2
    assert db.added[1].after_state["nodes"] == record.nodes


@pytest.mark.asyncio
@pytest.mark.parametrize("enabled", [False, True])
async def test_service_preserves_rating_level_rule_toggle(workflow_save_setup, enabled):
    service, db = workflow_save_setup
    content = _view_source_content(content_type="rating", items=[{
        "id": "rating", "label": "季度评级", "hint": "",
        "settings": {"levelRulesEnabled": enabled, "hideName": True, "required": False, "futureRules": {"keep": True}},
    }])
    content["settings"] = {"allowUnknown": enabled}
    final = {**_evaluation("final", "实线上级"), "include_final_result": True, "content": [content]}
    record = await service.save_nodes(77, [final], actor_type="PORTAL_USER", actor_ref="9")
    db.workflow = record
    reopened, _, _ = await service.get_nodes(77)
    assert reopened[0]["content"][0]["settings"]["allowUnknown"] is enabled
    assert reopened[0]["content"][0]["items"][0]["settings"] == content["items"][0]["settings"]


@pytest.mark.asyncio
async def test_service_keeps_node_content_independent_from_library_and_other_nodes(workflow_save_setup):
    from copy import deepcopy

    service, db = workflow_save_setup
    seed = _view_source_content(content_type="custom", name="种子", items=[{
        "id": "item-1", "label": "原题", "hint": "原提示", "options": [{"id": "a", "label": "原选项"}],
        "settings": {"required": False, "extra": {"keep": True}},
    }])
    local = deepcopy(seed)
    local["name"] = "环节一"
    local["items"][0].update(label="局部题目", hint="局部提示", options=[{"id": "b", "label": "局部选项"}])
    local["items"][0]["settings"].update(required=True, hideName=True, hideDescription=True)
    final = {**_evaluation("final", "实线上级"), "include_final_result": True, "content": [local]}
    other = {**_evaluation("other", "被评估人"), "content_bindings": {"fill": [seed["content_id"]]}}
    record = await service.save_nodes(77, [final, other], content_library=[seed], actor_type="PORTAL_USER", actor_ref="9")
    db.workflow = record
    assert record.content_library == [seed]
    assert record.nodes[0]["content"][0] == local
    assert record.nodes[1]["content"][0]["items"] == seed["items"]
    reopened, _, _ = await service.get_nodes(77)
    reopened[0]["content"][0]["items"][0]["options"][0]["label"] = "再改"
    assert reopened[1]["content"][0]["items"][0]["options"][0]["label"] == "原选项"
    assert record.nodes[0]["content"][0]["items"][0]["options"][0]["label"] == "局部选项"
    assert await service.get_content_library(77) == [seed]
    assert local["items"][0]["settings"]["extra"] == {"keep": True}


@pytest.mark.asyncio
async def test_service_resolves_final_fill_binding_from_existing_library(workflow_save_setup):
    service, db = workflow_save_setup
    content = _view_source_content()
    db.workflow = PerformanceTemplateWorkflow(template_id=77, nodes=[], content_library=[content])
    final = {
        **_evaluation("final", "实线上级"), "include_final_result": True,
        "content_bindings": {"fill": [content["content_id"]]},
    }
    view = {**default_workflow_nodes()[1], "content_bindings": {"view": [content["content_id"]]}}

    record = await service.save_nodes(
        77, [final, view], actor_type="PORTAL_USER", actor_ref="9",
    )

    assert record.content_library == [content]
    assert db.commits == 1
    assert len(db.added) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("library_source", ["existing", "request"])
@pytest.mark.parametrize("source_visible", [True, False])
async def test_service_final_fill_binding_ignores_other_node_inline_settings(
    workflow_save_setup, library_source, source_visible,
):
    service, db = workflow_save_setup
    source = _view_source_content(items=[{
        "id": "item-1", "settings": {"mode": "fill" if source_visible else "hidden"},
    }])
    other_content = _view_source_content(items=[{
        "id": "item-1", "settings": {"mode": "hidden" if source_visible else "fill"},
    }])
    existing = PerformanceTemplateWorkflow(
        template_id=77, nodes=[],
        content_library=[source] if library_source == "existing" else [],
    )
    db.workflow = existing
    final = {
        **_evaluation("final", "实线上级"), "include_final_result": True,
        "executor_types": ["DIRECT_MANAGER"],
        "content_bindings": {"fill": [source["content_id"]]},
    }
    other = {**_evaluation("other", "被评估人"), "content": [other_content]}
    view = {**default_workflow_nodes()[1], "content_bindings": {"view": [source["content_id"]]}}
    library = [source] if library_source == "request" else []

    if source_visible:
        record = await service.save_nodes(
            77, [final, other, view], content_library=library,
            actor_type="PORTAL_USER", actor_ref="9",
        )
        assert record.nodes[2]["content_bindings"] == {"view": [source["content_id"]]}
        assert db.commits == 1
        assert len(db.added) == 1
    else:
        with pytest.raises(TemplateWorkflowValidationError) as exc:
            await service.save_nodes(
                77, [final, other, view], content_library=library,
                actor_type="PORTAL_USER", actor_ref="9",
            )
        assert str(exc.value) == "仅可选择终评环节执行人「直属上级」填写的内容"
        assert exc.value.node_id == view["node_id"]
        assert existing.nodes == []
        assert existing.content_library == ([source] if library_source == "existing" else [])
        assert db.added == []
        assert db.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_source", [
    "other-node", "final-reference", "final-adjustment", "final-view", "unbound-library",
    "no-fill", "missing-library", "empty-items", "hidden-items", "hidden-inline-copy",
])
@pytest.mark.parametrize("view_form", ["inline", "bindings", "mixed-inline", "mixed-bindings"])
async def test_service_rejects_invalid_result_view_before_mutating_or_committing(
    workflow_save_setup, invalid_source, view_form,
):
    service, db = workflow_save_setup
    content = _view_source_content()
    old_nodes = [{
        **_evaluation("old-final", "实线上级"), "include_final_result": True,
        "content": [content],
    }]
    old_library = [content]
    existing = SimpleNamespace(
        nodes=old_nodes, content_library=old_library,
        updated_by_type="SYSTEM_ACCOUNT", updated_by_ref="old-actor",
    )
    db.workflow = existing
    final = {
        **_evaluation("new-final", "实线上级"), "include_final_result": True,
        "executor_types": ["LEVEL_1_MANAGER"],
    }
    other = _evaluation("other", "被评估人")
    library = [content]
    if invalid_source == "other-node":
        other["content"] = [content]
    elif invalid_source.startswith("final-"):
        final["content"] = [{**content, "content_slot": invalid_source.removeprefix("final-")}]
    elif invalid_source == "unbound-library":
        library = []
    elif invalid_source == "missing-library":
        existing.content_library = []
        old_library = existing.content_library
        library = []
        final["content_bindings"] = {"fill": [content["content_id"]]}
    elif invalid_source in {"empty-items", "hidden-items", "hidden-inline-copy"}:
        items = [] if invalid_source == "empty-items" else [
            {"id": "hidden", "settings": {"mode": "hidden"}},
        ]
        hidden = {**content, "items": items}
        if invalid_source == "hidden-inline-copy":
            final["content"] = [hidden]
        else:
            final["content_bindings"] = {"fill": [content["content_id"]]}
            library = [hidden]
    view = default_workflow_nodes()[1]
    valid = _view_source_content("valid-content")
    if view_form.startswith("mixed-"):
        final.setdefault("content", []).append(valid)
    if view_form in {"inline", "mixed-inline"}:
        view["content"] = [{**content, "content_slot": "view"}]
        if view_form == "mixed-inline":
            view["content_bindings"] = {"view": [valid["content_id"]]}
    else:
        view["content_bindings"] = {"view": [content["content_id"]]}
        if view_form == "mixed-bindings":
            view["content"] = [{**valid, "content_slot": "view"}]

    with pytest.raises(TemplateWorkflowValidationError) as exc:
        await service.save_nodes(
            77, [other, final, view], content_library=library,
            actor_type="PORTAL_USER", actor_ref="9",
        )

    assert exc.value.node_id == view["node_id"]
    assert str(exc.value) == "仅可选择终评环节执行人「隔 1 级上级」填写的内容"
    assert existing.nodes is old_nodes
    assert existing.content_library is old_library
    assert existing.updated_by_type == "SYSTEM_ACCOUNT"
    assert existing.updated_by_ref == "old-actor"
    assert db.added == []
    assert db.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(("executor_label", "executor_types", "expected_label"), [
    ("实线上级", ["DIRECT_MANAGER"], "直属上级"),
    ("实线上级", ["LEVEL_1_MANAGER"], "隔 1 级上级"),
    ("实线上级", ["LEVEL_2_MANAGER"], "隔 2 级上级"),
    ("实线上级", ["LEVEL_3_MANAGER_PLUS"], "隔 3 级上级及以上"),
    ("实线上级", ["DIRECT_MANAGER", "LEVEL_2_MANAGER", "DIRECT_MANAGER"], "直属上级、隔 2 级上级"),
    ("实线上级", [], "实线上级"),
    ("指标评价人", [], "指标评价人"),
])
async def test_service_result_view_error_uses_final_executor_label(
    workflow_save_setup, executor_label, executor_types, expected_label,
):
    service, db = workflow_save_setup
    final = {
        **_evaluation("final", executor_label), "include_final_result": True,
        "executor_types": executor_types,
    }
    view = {**default_workflow_nodes()[1], "content_bindings": {"view": ["missing"]}}

    with pytest.raises(TemplateWorkflowValidationError) as exc:
        await service.save_nodes(77, [final, view], actor_type="PORTAL_USER", actor_ref="9")

    assert str(exc.value) == f"仅可选择终评环节执行人「{expected_label}」填写的内容"
    assert exc.value.node_id == view["node_id"]
    assert db.added == []
    assert db.commits == 0


@pytest.mark.asyncio
async def test_service_keeps_other_node_slots_and_legacy_result_view_without_view(
    workflow_save_setup,
):
    service, db = workflow_save_setup
    content = _view_source_content("legacy-content")
    final = {**_evaluation("final", "实线上级"), "include_final_result": True}
    other = {
        **_evaluation("other", "被评估人"),
        "content": [{**content, "content_slot": "view"}],
        "content_bindings": {"view": ["unresolved-other-node"]},
    }
    view = {**default_workflow_nodes()[1], "content": [content]}

    record = await service.save_nodes(
        77, [final, other, view], actor_type="PORTAL_USER", actor_ref="9",
    )

    assert record.nodes[1]["content"] == other["content"]
    assert record.nodes[1]["content_bindings"] == other["content_bindings"]
    assert record.nodes[2]["content"] == [content]
    assert record.nodes[2]["content_bindings"] == {"fill": [content["content_id"]]}
    assert db.commits == 1


class _EmptyWorkflowResult:
    def scalar_one_or_none(self):
        return None


class _EmptyWorkflowDb:
    async def execute(self, _statement):
        return _EmptyWorkflowResult()


def _workflow_api_client(*, allowed: bool) -> TestClient:
    app = FastAPI()
    app.include_router(templates_router.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: _EmptyWorkflowDb()

    route = next(
        route
        for route in app.routes
        if isinstance(route, APIRoute)
        and route.path == "/api/v1/performance/templates/{template_id}/workflow"
        and "GET" in route.methods
    )
    permission_dependency = next(
        dependency.call
        for dependency in route.dependant.dependencies
        if dependency.call is not get_session
    )

    if allowed:
        app.dependency_overrides[permission_dependency] = lambda: PerformanceAccessContext(
            subject_type="SYSTEM_ACCOUNT",
            subject_id=7,
            display_name="workflow-admin",
            account_type="PERFORMANCE_ADMIN",
            portal_entry_permissions=(),
            role_grants=(),
            permission_codes=("performance.configuration.manage",),
        )
    else:
        async def deny():
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="missing permission")

        app.dependency_overrides[permission_dependency] = deny
    return TestClient(app)


def test_workflow_api_allows_configuration_manager():
    response = _workflow_api_client(allowed=True).get(
        "/api/v1/performance/templates/901/workflow"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["template_id"] == 901


def test_workflow_api_rejects_caller_without_configuration_permission():
    response = _workflow_api_client(allowed=False).get(
        "/api/v1/performance/templates/901/workflow"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


class _NoDuplicateResult:
    def scalar_one_or_none(self):
        return None


class _TemplateMetadataDb:
    def __init__(self, template, workflow=None):
        self.template = template
        self.workflow = workflow
        self.added = []
        self.deleted = []
        self.commits = 0

    async def get(self, model, template_id):
        if model is PerformanceTemplate:
            return self.template if self.template.id == template_id else None
        if model is PerformanceTemplateWorkflow:
            return self.workflow if self.workflow is not None and self.workflow.template_id == template_id else None
        return None

    async def execute(self, _statement):
        return _NoDuplicateResult()

    def add(self, value):
        if isinstance(value, PerformanceTemplate) and value.id is None:
            value.id = 43
        self.added.append(value)

    async def delete(self, value):
        self.deleted.append(value)

    async def commit(self):
        self.commits += 1

    async def flush(self):
        return None

    async def rollback(self):
        return None

    async def refresh(self, _value):
        return None


def _template_metadata():
    now = datetime(2026, 8, 31, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=42,
        name="已有模板",
        description="已有描述",
        language="zh-CN",
        english_enabled=False,
        calculation_enabled=False,
        selected_rules=[],
        created_at=now,
        updated_at=now,
    )


def _template_admin_context():
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT",
        subject_id=7,
        display_name="template-admin",
        account_type="PERFORMANCE_ADMIN",
        portal_entry_permissions=(),
        role_grants=(),
        permission_codes=("performance.configuration.manage",),
    )


@pytest.mark.asyncio
async def test_workflow_patch_maps_invalid_result_view_to_422(workflow_save_setup, monkeypatch):
    service, db = workflow_save_setup
    monkeypatch.setattr(templates_router, "PerformanceTemplateWorkflowService", lambda _db: service)
    final = {
        **_evaluation("final", "实线上级"), "include_final_result": True,
        "executor_types": ["DIRECT_MANAGER"],
    }
    view = {**default_workflow_nodes()[1], "content_bindings": {"view": ["unbound"]}}
    payload = WorkflowUpdate.model_validate({"nodes": [final, view]})

    with pytest.raises(HTTPException) as exc:
        await templates_router.update_template_workflow(77, payload, _template_admin_context(), db)

    assert exc.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert exc.value.detail == {
        "code": "TEMPLATE_WORKFLOW_INVALID",
        "message": "仅可选择终评环节执行人「直属上级」填写的内容",
        "node_id": view["node_id"],
    }
    assert db.added == []
    assert db.commits == 0


@pytest.mark.asyncio
async def test_metric_template_create_persists_kind_and_audience_setting_with_audit():
    db = _TemplateMetadataDb(None)
    created = await templates_router.create_template(
        templates_router.TemplateCreateRequest(
            name="指标模板",
            description="指标描述",
            language="zh-CN",
            audience_settings_enabled=True,
            template_kind="metric",
            score_method="dimension_weighted",
        ),
        _template_admin_context(),
        db,
    )

    template = next(value for value in db.added if isinstance(value, PerformanceTemplate))
    audit = next(value for value in db.added if isinstance(value, templates_router.PerformanceAuditEvent))
    assert created.template_id == 43
    assert template.template_kind == "metric"
    assert template.audience_settings_enabled is True
    assert template.score_method == "dimension_weighted"
    assert audit.event_type == "PERFORMANCE_TEMPLATE_CREATED"
    assert audit.after_state["template_kind"] == "metric"


@pytest.mark.asyncio
async def test_template_metadata_get_and_update_round_trip_without_creating_a_new_template():
    db = _TemplateMetadataDb(_template_metadata())
    before = await templates_router.get_template(42, _template_admin_context(), db)

    updated = await templates_router.update_template(
        42,
        templates_router.TemplateCreateRequest(
            name="修改后的模板",
            description="修改后的描述",
            language="zh-CN",
            english_enabled=True,
            audience_settings_enabled=True,
            calculation_enabled=True,
            selected_rules=["content"],
        ),
        _template_admin_context(),
        db,
    )

    assert before.name == "已有模板"
    assert updated.template_id == 42
    assert updated.name == "修改后的模板"
    assert updated.description == "修改后的描述"
    assert updated.english_enabled is True
    assert updated.audience_settings_enabled is True
    assert updated.calculation_enabled is True
    assert updated.selected_rules == ["content"]
    assert db.commits == 1
    assert len(db.added) == 1
    assert db.added[0].event_type == "PERFORMANCE_TEMPLATE_UPDATED"
    assert db.added[0].before_state["name"] == "已有模板"
    assert db.added[0].after_state["name"] == "修改后的模板"


@pytest.mark.asyncio
async def test_template_metadata_get_returns_not_found_for_unknown_template():
    db = _TemplateMetadataDb(_template_metadata())

    with pytest.raises(HTTPException) as exc:
        await templates_router.get_template(99, _template_admin_context(), db)

    assert exc.value.status_code == status.HTTP_404_NOT_FOUND
    assert exc.value.detail["code"] == "TEMPLATE_NOT_FOUND"


@pytest.mark.asyncio
async def test_template_delete_removes_metadata_and_workflow_and_writes_audit():
    template = _template_metadata()
    workflow = SimpleNamespace(template_id=42, cycle_count=2, project_count=3)
    db = _TemplateMetadataDb(template, workflow)

    await templates_router.delete_template(42, _template_admin_context(), db)

    assert db.deleted == [workflow, template]
    assert db.commits == 1
    assert len(db.added) == 1
    audit = db.added[0]
    assert audit.event_type == "PERFORMANCE_TEMPLATE_DELETED"
    assert audit.subject_ref == "42"
    assert audit.before_state["name"] == "已有模板"
    assert audit.before_state["usage_summary"] == {"cycle_count": 2, "project_count": 3}
    assert audit.after_state == {"deleted": True}


@pytest.mark.asyncio
async def test_template_delete_returns_not_found_without_side_effects():
    db = _TemplateMetadataDb(_template_metadata())

    with pytest.raises(HTTPException) as exc:
        await templates_router.delete_template(99, _template_admin_context(), db)

    assert exc.value.status_code == status.HTTP_404_NOT_FOUND
    assert exc.value.detail["code"] == "TEMPLATE_NOT_FOUND"
    assert db.deleted == []
    assert db.added == []
    assert db.commits == 0


def _template_metadata_api_client(*, allowed: bool) -> TestClient:
    app = FastAPI()
    app.include_router(templates_router.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: _TemplateMetadataDb(_template_metadata())
    routes = [
        route
        for route in app.routes
        if isinstance(route, APIRoute)
        and route.path == "/api/v1/performance/templates/{template_id}"
    ]
    for route in routes:
        permission_dependency = next(
            dependency.call
            for dependency in route.dependant.dependencies
            if dependency.call is not get_session
        )
        if allowed:
            app.dependency_overrides[permission_dependency] = _template_admin_context
        else:
            async def deny():
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="missing permission")

            app.dependency_overrides[permission_dependency] = deny
    return TestClient(app)


def test_template_metadata_api_requires_configuration_permission():
    allowed = _template_metadata_api_client(allowed=True).get(
        "/api/v1/performance/templates/42"
    )
    denied_get = _template_metadata_api_client(allowed=False).get(
        "/api/v1/performance/templates/42"
    )
    denied_patch = _template_metadata_api_client(allowed=False).patch(
        "/api/v1/performance/templates/42",
        json={
            "name": "修改后的模板",
            "description": "",
            "language": "zh-CN",
            "english_enabled": False,
            "calculation_enabled": False,
            "selected_rules": [],
        },
    )
    allowed_delete = _template_metadata_api_client(allowed=True).delete(
        "/api/v1/performance/templates/42"
    )
    denied_delete = _template_metadata_api_client(allowed=False).delete(
        "/api/v1/performance/templates/42"
    )

    assert allowed.status_code == status.HTTP_200_OK
    assert denied_get.status_code == status.HTTP_403_FORBIDDEN
    assert denied_patch.status_code == status.HTTP_403_FORBIDDEN
    assert allowed_delete.status_code == status.HTTP_204_NO_CONTENT
    assert denied_delete.status_code == status.HTTP_403_FORBIDDEN


def test_result_reconsideration_executor_config_defaults_to_hrbp_and_projects_legacy_fields():
    config = normalize_executor_config(None)

    assert config == {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}]}
    assert project_legacy_executor_fields(config) == (["HRBP"], "HRBP")


def test_result_reconsideration_workflow_round_trips_canonical_executor_config():
    nodes = normalize_workflow_nodes([
        _evaluation("evaluation-1", "实线上级"),
        {
            "node_id": "result-view-1", "node_type": "result_view", "name": "结果查看",
            "description": "", "order": 2, "executor_types": ["SUBJECT"], "executor_label": "被评估人",
            "evaluation_type": None, "include_final_result": False, "system": True,
            "allow_invite_other_executors": False, "invite_executor_scope": "ALL", "invite_executor_types": [],
            "require_previous_node_completion": False,
        },
        {
            "node_id": "reconsider-1", "node_type": "result_reconsideration", "name": "结果复议处理",
            "description": "", "order": 3, "executor_types": [], "executor_label": "",
            "evaluation_type": None, "include_final_result": False, "system": False,
            "allow_invite_other_executors": False, "invite_executor_scope": "ALL", "invite_executor_types": [],
            "require_previous_node_completion": False,
            "appeal_prompt_content": "请说明复议事实与依据",
            "appeal_reason_instruction": "请填写具体复议理由",
            "executor_config": {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}]},
        },
    ])

    reconsideration = nodes[-1]
    assert reconsideration["executor_config"] == {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}]}
    assert reconsideration["executor_types"] == ["HRBP"]
    assert reconsideration["executor_label"] == "HRBP"
    assert reconsideration["appeal_prompt_content"] == "请说明复议事实与依据"
    assert reconsideration["appeal_reason_instruction"] == "请填写具体复议理由"


def test_result_reconsideration_prompt_defaults_and_rejects_over_limit_content():
    base = {
        "node_id": "reconsider-1", "node_type": "result_reconsideration", "name": "结果复议处理",
        "description": "", "order": 3, "executor_types": ["HRBP"], "executor_label": "HRBP",
        "evaluation_type": None, "include_final_result": False, "system": False,
        "allow_invite_other_executors": False, "invite_executor_scope": "ALL", "invite_executor_types": [],
        "require_previous_node_completion": False,
        "executor_config": {"mode": "MULTI_ROLE", "roles": [{"type": "HRBP"}]},
    }
    result_view = {
        "node_id": "result-view-1", "node_type": "result_view", "name": "结果查看", "description": "",
        "order": 2, "executor_types": ["SUBJECT"], "executor_label": "被评估人", "evaluation_type": None,
        "include_final_result": False, "system": True, "allow_invite_other_executors": False,
        "invite_executor_scope": "ALL", "invite_executor_types": [], "require_previous_node_completion": False,
    }

    normalized = normalize_workflow_nodes([_evaluation("evaluation-1", "实线上级"), result_view, base])
    assert normalized[-1]["appeal_prompt_content"] == "如果你不认可本次绩效结果，请详细说明复议原因并提供事实依据"
    assert normalized[-1]["appeal_reason_instruction"] == "请输入复议理由"

    with pytest.raises(TemplateWorkflowValidationError, match="发起复议提示最多 1500 个字符"):
        normalize_workflow_nodes([
            _evaluation("evaluation-1", "实线上级"), result_view,
            {**base, "appeal_prompt_content": "字" * 1501},
        ])

    with pytest.raises(TemplateWorkflowValidationError, match="复议填写说明最多 1000 个字符"):
        normalize_workflow_nodes([
            _evaluation("evaluation-1", "实线上级"), result_view,
            {**base, "appeal_reason_instruction": "字" * 1001},
        ])


def test_result_reconsideration_executor_config_normalizes_people_and_levels():
    config = normalize_executor_config({
        "mode": "MULTI_ROLE",
        "roles": [
            {"type": "SPECIFIED_PERSON", "people": [
                {"employee_no": "E1", "display_name": "张三"},
                {"employee_no": "E1", "display_name": "张三（重复）"},
            ]},
            {"type": "DEPARTMENT_HEAD", "levels": ["LEVEL_1_DEPARTMENT", "CURRENT_DEPARTMENT"]},
            {"type": "REAL_LINE_MANAGER", "levels": ["LEVEL_1_MANAGER", "DIRECT_MANAGER"]},
        ],
    })

    assert config["roles"] == [
        {"type": "REAL_LINE_MANAGER", "levels": ["DIRECT_MANAGER", "LEVEL_1_MANAGER"]},
        {"type": "DEPARTMENT_HEAD", "levels": ["CURRENT_DEPARTMENT", "LEVEL_1_DEPARTMENT"]},
        {"type": "SPECIFIED_PERSON", "people": [{"employee_no": "E1", "display_name": "张三"}]},
    ]


@pytest.mark.parametrize("config", [
    {"mode": "MULTI_ROLE", "roles": []},
    {"mode": "MULTI_ROLE", "roles": [{"type": "REAL_LINE_MANAGER", "levels": []}]},
    {"mode": "MULTI_ROLE", "roles": [{"type": "DEPARTMENT_HEAD", "levels": ["UNKNOWN"]}]},
    {"mode": "MULTI_ROLE", "roles": [{"type": "SPECIFIED_PERSON", "people": []}]},
])
def test_result_reconsideration_executor_config_requires_valid_selection(config):
    with pytest.raises(ValueError):
        normalize_executor_config(config)


def test_workflow_accepts_more_than_nine_nodes():
    normalized = normalize_workflow_nodes([
        _evaluation(f"evaluation-{index}", "实线上级")
        for index in range(10)
    ])

    assert len(normalized) == 10
    assert [node["order"] for node in normalized] == list(range(1, 11))


@pytest.mark.parametrize("page_name", [None, "页面名称", "字" * 100])
def test_content_page_name_dto_accepts_nullable_name_with_max_length(page_name):
    node = WorkflowNode.model_validate({
        **_evaluation("evaluation-1", "实线上级"), "content_page_name": page_name,
    })

    assert node.content_page_name == page_name
    assert node.model_dump(exclude_unset=True)["content_page_name"] == page_name


def test_content_page_name_dto_distinguishes_omission_from_explicit_null():
    node = WorkflowNode.model_validate(_evaluation("evaluation-1", "实线上级"))

    assert node.content_page_name is None
    assert node.model_dump()["content_page_name"] is None
    assert "content_page_name" not in node.model_dump(exclude_unset=True)
    with pytest.raises(ValidationError):
        WorkflowNode.model_validate({**node.model_dump(), "content_page_name": "字" * 101})


@pytest.mark.parametrize("page_name", [None, "  页面名称 \t", "字" * 100])
def test_content_page_name_normalization_is_independent_of_node_and_content_names(page_name):
    raw = {
        **_evaluation("evaluation-1", "实线上级"),
        "name": "环节名称",
        "content_page_name": page_name,
        "content": [{"id": "content-1", "name": "内容名称", "items": []}],
    }

    node = normalize_workflow_nodes([raw])[0]

    assert node["content_page_name"] == (page_name.strip() if page_name is not None else None)
    assert node["name"] == "环节名称"
    assert node["content"][0]["name"] == "内容名称"
    assert raw["content_page_name"] == page_name
    assert normalize_workflow_nodes([_evaluation("legacy", "实线上级")])[0]["content_page_name"] is None


@pytest.mark.parametrize("page_name", ["", " \t\n ", "字" * 101])
def test_content_page_name_normalization_rejects_empty_or_overlong_name(page_name):
    with pytest.raises(TemplateWorkflowValidationError, match="页面名称长度必须为 1-100") as exc:
        normalize_workflow_nodes([{
            **_evaluation("evaluation-1", "实线上级"), "content_page_name": page_name,
        }])

    assert exc.value.node_id == "evaluation-1"


@pytest.mark.asyncio
async def test_content_page_name_service_save_reopen_and_audit(workflow_save_setup):
    service, db = workflow_save_setup
    raw = {
        **_evaluation("evaluation-1", "实线上级"), "include_final_result": True,
        "content_page_name": "  自定义页面  ",
        "content": [{"id": "content-1", "name": "内容名称", "items": []}],
    }

    record = await service.save_nodes(77, [raw], actor_type="PORTAL_USER", actor_ref="9")
    db.workflow = record
    record.cycle_count = 0
    record.project_count = 0
    reopened, _, _ = await service.get_nodes(77)

    assert record.nodes[0]["content_page_name"] == "自定义页面"
    assert reopened[0]["content_page_name"] == "自定义页面"
    assert reopened[0]["name"] == "evaluation-1"
    assert reopened[0]["content"][0]["name"] == "内容名称"
    assert db.commits == 1
    assert len(db.added) == 2
    audit = db.added[1]
    assert audit.event_type == "PERFORMANCE_TEMPLATE_WORKFLOW_UPDATED"
    assert audit.before_state == {"nodes": []}
    assert audit.after_state["nodes"][0]["content_page_name"] == "自定义页面"


@pytest.mark.asyncio
@pytest.mark.parametrize("explicit_null", [False, True])
async def test_content_page_name_service_omission_preserves_and_null_resets(workflow_save_setup, explicit_null):
    service, db = workflow_save_setup
    old = {
        **_evaluation("evaluation-1", "实线上级"), "include_final_result": True,
        "content_page_name": "已有页面名称",
    }
    db.workflow = PerformanceTemplateWorkflow(
        template_id=77, nodes=[old], content_library=[], cycle_count=0, project_count=0,
    )
    incoming = {**_evaluation("evaluation-1", "实线上级"), "include_final_result": True, "name": "新环节名称"}
    if explicit_null:
        incoming["content_page_name"] = None

    record = await service.save_nodes(77, [incoming], actor_type="PORTAL_USER", actor_ref="9")
    reopened, _, _ = await service.get_nodes(77)
    expected = None if explicit_null else "已有页面名称"

    assert record.nodes[0]["content_page_name"] == expected
    assert reopened[0]["content_page_name"] == expected
    assert reopened[0]["name"] == "新环节名称"
    assert db.added[0].before_state["nodes"][0]["content_page_name"] == "已有页面名称"
    assert db.added[0].after_state["nodes"][0]["content_page_name"] == expected
    assert db.commits == 1


@pytest.mark.asyncio
async def test_content_page_name_patch_get_preserves_omitted_and_resets_null(workflow_save_setup, monkeypatch):
    service, db = workflow_save_setup
    final = {**_evaluation("evaluation-1", "实线上级"), "include_final_result": True}
    legacy = _evaluation("legacy", "被评估人")
    db.workflow = PerformanceTemplateWorkflow(
        template_id=77, nodes=[final, legacy], content_library=[], cycle_count=0, project_count=0,
    )
    monkeypatch.setattr(templates_router, "PerformanceTemplateWorkflowService", lambda _db: service)
    for supplied, expected in (({"content_page_name": "  页面一  "}, "页面一"), ({}, "页面一"), ({"content_page_name": None}, None)):
        payload = WorkflowUpdate.model_validate({"nodes": [{**final, **supplied}, legacy]})
        patched = await templates_router.update_template_workflow(77, payload, _template_admin_context(), db)
        fetched = await templates_router.get_template_workflow(77, _template_admin_context(), db)

        assert patched.model_dump()["nodes"][0]["content_page_name"] == expected
        assert fetched.model_dump()["nodes"][0]["content_page_name"] == expected
        assert fetched.model_dump()["nodes"][1]["content_page_name"] is None
        assert fetched.nodes[0].name == final["name"]
    assert db.commits == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("page_name", ["", " \t\n ", "字" * 101])
async def test_content_page_name_service_rejects_without_write(workflow_save_setup, page_name):
    service, db = workflow_save_setup
    old = {**_evaluation("evaluation-1", "实线上级"), "include_final_result": True, "content_page_name": "原页面"}
    db.workflow = PerformanceTemplateWorkflow(template_id=77, nodes=[old], content_library=[])

    with pytest.raises(TemplateWorkflowValidationError):
        await service.save_nodes(77, [{**old, "content_page_name": page_name}], actor_type="PORTAL_USER", actor_ref="9")

    assert db.workflow.nodes == [old]
    assert db.added == []
    assert db.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("page_name", ["", " \t "])
async def test_content_page_name_patch_rejects_blank_with_canonical_422(workflow_save_setup, monkeypatch, page_name):
    service, db = workflow_save_setup
    monkeypatch.setattr(templates_router, "PerformanceTemplateWorkflowService", lambda _db: service)
    payload = WorkflowUpdate.model_validate({"nodes": [{
        **_evaluation("evaluation-1", "实线上级"), "include_final_result": True, "content_page_name": page_name,
    }]})

    with pytest.raises(HTTPException) as exc:
        await templates_router.update_template_workflow(77, payload, _template_admin_context(), db)

    assert exc.value.status_code == 422
    assert exc.value.detail == {
        "code": "TEMPLATE_WORKFLOW_INVALID", "message": "页面名称长度必须为 1-100", "node_id": "evaluation-1",
    }
    assert db.added == []
    assert db.commits == 0


@pytest.mark.asyncio
async def test_content_page_name_patch_keeps_cycle_used_workflow_locked(workflow_save_setup, monkeypatch):
    service, db = workflow_save_setup
    old = {**_evaluation("evaluation-1", "实线上级"), "include_final_result": True, "content_page_name": "原页面"}
    db.workflow = PerformanceTemplateWorkflow(template_id=77, nodes=[old], content_library=[], cycle_count=1, project_count=0)
    monkeypatch.setattr(templates_router, "PerformanceTemplateWorkflowService", lambda _db: service)
    payload = WorkflowUpdate.model_validate({"nodes": [{**old, "content_page_name": "新页面"}]})

    with pytest.raises(HTTPException) as exc:
        await templates_router.update_template_workflow(77, payload, _template_admin_context(), db)

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "TEMPLATE_WORKFLOW_LOCKED"
    assert db.workflow.nodes == [old]
    assert db.added == []
    assert db.commits == 0
