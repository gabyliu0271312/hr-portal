from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException, status
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext
from app.performance.template_workflow_service import (
    TemplateWorkflowValidationError,
    default_workflow_nodes,
    normalize_workflow_nodes,
)
from app.performance.executor_config import normalize_executor_config, project_legacy_executor_fields
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
        [_evaluation("evaluation-1", "实线上级")],
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
