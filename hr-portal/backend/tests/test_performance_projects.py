from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.performance.projects_router import ProjectPayload, _can_manage_project, _review_node_category, _review_node_status
from app.performance.auth_context import PerformanceAccessContext, PerformanceRoleGrant, performance_admin_preview_enabled
from app.performance.project_service import PerformanceProjectService, ProjectValidationError


def context(*permissions: str, refs: tuple[str, ...] = ()) -> PerformanceAccessContext:
    return PerformanceAccessContext(
        subject_type="PORTAL_USER",
        subject_id=1,
        display_name="管理员",
        account_type=None,
        portal_entry_permissions=("performance.admin",),
        role_grants=tuple(PerformanceRoleGrant("project-admin", "PROJECT", ref) for ref in refs),
        permission_codes=permissions,
    )


def project(status="DRAFT", project_ref="project:one"):
    return SimpleNamespace(
        id=1,
        project_ref=project_ref,
        cycle_ref="cycle:one",
        name="项目一",
        description="说明",
        administrators=["张三"],
        status=status,
        evaluated_count=0,
        settings={"flow_settings": {"node_settings": {}}},
        template_id=None,
    )


def test_admin_preview_requires_dev_debug_and_admin_permission(monkeypatch):
    admin = context("performance.cycles.manage")
    ordinary = context()
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", False)
    assert not performance_admin_preview_enabled(admin)
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)
    assert performance_admin_preview_enabled(admin)
    assert not performance_admin_preview_enabled(ordinary)
    monkeypatch.setattr(settings, "APP_ENV", "prod")
    assert not performance_admin_preview_enabled(admin)


    with pytest.raises(ValidationError):
        ProjectPayload(name="")
    with pytest.raises(ValidationError):
        ProjectPayload(name="项目一", unknown="value")


def test_project_payload_normalizes_duplicate_administrators():
    name, description, administrators, settings = PerformanceProjectService._validate_payload({
        "name": " 项目一 ",
        "description": " 说明 ",
        "administrators": ["张三", " 张三 ", ""],
    })
    assert (name, description, administrators) == ("项目一", "说明", ["张三"])


def test_project_delete_allows_started_with_audit():
    import asyncio

    class _RecordingDB:
        def __init__(self):
            self.deleted = []
            self.committed = 0

        def add(self, *_args):
            pass

        async def delete(self, obj):
            self.deleted.append(obj)

        async def commit(self):
            self.committed += 1

    class _RecordingAudit:
        def __init__(self):
            self.events = []

        def append_event(self, event):
            self.events.append(event)

    async def run(status):
        db = _RecordingDB()
        service = PerformanceProjectService(db)  # type: ignore[arg-type]
        service.audit = _RecordingAudit()
        target = project(status)
        await service.delete_project(target, actor_type="PORTAL_USER", actor_id=7)
        return db, service, target

    for status in ("DRAFT", "STARTED"):
        db, service, target = asyncio.run(run(status))
        assert db.deleted == [target]
        assert db.committed == 1
        assert service.audit.events[0].event_type == "PERFORMANCE_PROJECT_DELETED"
        assert service.audit.events[0].subject_ref == "project:one"


def test_project_delete_removes_draft_and_writes_audit():
    import asyncio

    class _RecordingDB:
        def __init__(self):
            self.deleted = []
            self.committed = 0

        def add(self, *_args):
            pass

        async def delete(self, obj):
            self.deleted.append(obj)

        async def commit(self):
            self.committed += 1

    class _RecordingAudit:
        def __init__(self):
            self.events = []

        def append_event(self, event):
            self.events.append(event)

    async def run():
        db = _RecordingDB()
        service = PerformanceProjectService(db)  # type: ignore[arg-type]
        service.audit = _RecordingAudit()
        draft = project("DRAFT")
        await service.delete_project(draft, actor_type="PORTAL_USER", actor_id=7)
        return db, service, draft

    db, service, draft = asyncio.run(run())
    assert db.deleted == [draft]
    assert db.committed == 1
    assert service.audit.events[0].event_type == "PERFORMANCE_PROJECT_DELETED"
    assert service.audit.events[0].subject_ref == "project:one"




def test_review_nodes_follow_template_executor_mapping():
    assert _review_node_category("work_summary", [], has_task=False) == "mine"
    assert _review_node_category("evaluation", ["SUBJECT"], has_task=False) == "mine"
    assert _review_node_category("evaluation", ["REAL_LINE_MANAGER"], has_task=False) == "team"
    assert _review_node_category("reviewer_360_confirm", [], has_task=False) == "team"
    assert _review_node_category("result_reconsideration", [], has_task=False) == "other"
    assert _review_node_category("evaluation", ["REVIEWER_360"], has_task=False) is None
    assert _review_node_category("evaluation", ["REVIEWER_360"], has_task=True) == "others"


def test_review_node_status_has_three_time_based_states():
    from datetime import UTC, datetime

    now = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
    assert _review_node_status("2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z", now) == "not_started"
    assert _review_node_status("2026-09-10T00:00:00Z", "2026-09-10T11:00:00Z", now) == "overdue"
    assert _review_node_status("2026-09-10T00:00:00Z", "2026-09-12T00:00:00Z", now) == "pending"


def test_review_overview_keeps_preferred_task_and_completed_state():
    from datetime import UTC, datetime

    from app.performance.projects_router import _review_task_status, _select_review_task, _task_entry_mode

    pending = SimpleNamespace(id=145, submitted_at=None, task_kind="evaluation")
    completed = SimpleNamespace(id=146, submitted_at=datetime(2026, 9, 17, tzinfo=UTC), task_kind="work_summary")

    assert _select_review_task([pending, completed], 146) is completed
    assert _select_review_task([completed, pending]) is pending
    assert _review_task_status(completed, None, None) == "completed"
    assert _review_task_status(pending, None, None) == "pending"
    assert _task_entry_mode(completed) == "template_task"
    assert _task_entry_mode(pending) == "template_task"
    assert _task_entry_mode(None) == "route"


def test_evaluation_self_task_uses_completed_template_overview_contract():
    from datetime import UTC, datetime

    from app.performance.projects_router import _TASK_ENTRY_MODES, _review_task_status, _task_entry_mode

    completed = SimpleNamespace(id=147, submitted_at=datetime(2026, 9, 17, tzinfo=UTC), task_kind="evaluation")

    assert "evaluation" in _TASK_ENTRY_MODES
    assert _task_entry_mode(completed) == "template_task"
    assert _review_task_status(completed, "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z") == "completed"


def _pm_project(project_id, name, cycle_id, *, administrators=("张三",), status="STARTED", project_ref="project:x"):
    return SimpleNamespace(
        id=project_id,
        project_ref=f"{project_ref}:{project_id}",
        cycle_ref=f"cycle:{cycle_id}",
        name=name,
        administrators=list(administrators),
        status=status,
    )


def _pm_cycle(cycle_id, name="周期"):
    from datetime import UTC, datetime
    return SimpleNamespace(id=cycle_id, cycle_ref=f"cycle:{cycle_id}", name=name, start_at=datetime(2026, 1, 1, tzinfo=UTC), end_at=datetime(2026, 12, 31, tzinfo=UTC))


@pytest.mark.asyncio
async def test_project_management_overview_filters_cycles_and_projects_by_involvement(monkeypatch):
    from app.performance import projects_router
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    async def hrbp_scope(_db, _ref):
        return set()
    monkeypatch.setattr(projects_router, "_person_hrbp_project_refs", hrbp_scope)

    rows = [
        (_pm_project(1, "乙项目", 1, administrators=["张三"]), _pm_cycle(1, "周期一")),
        (_pm_project(2, "甲项目", 1, administrators=["李四"]), _pm_cycle(1, "周期一")),
        (_pm_project(3, "丙项目", 2, administrators=["张三"]), _pm_cycle(2, "周期二")),
    ]

    class Db:
        async def execute(self, _query):
            # SQL 层已按 status=STARTED 过滤，这里忠实返回启动项目
            return SimpleNamespace(all=lambda: rows)

    zhang_san = PerformanceAccessContext(
        subject_type="PORTAL_USER",
        subject_id=2,
        display_name="张三",
        account_type=None,
        portal_entry_permissions=("performance.app",),
        role_grants=(),
        permission_codes=(),
    )

    result = await projects_router.project_management_overview(None, zhang_san, Db())
    assert [cycle["cycle_id"] for cycle in result["cycles"]] == [1, 2]
    assert result["active_cycle"]["cycle_id"] == 1
    assert [item["project_name"] for item in result["projects"]] == ["乙项目"]
    assert result["hrbp_scope"] == []
    assert result["category"] == {"key": "admin", "label": "项目管理员"}

    explicit = await projects_router.project_management_overview(2, zhang_san, Db())
    assert explicit["active_cycle"]["cycle_id"] == 2
    assert [item["project_name"] for item in explicit["projects"]] == ["丙项目"]

    admin = await projects_router.project_management_overview(None, context("performance.cycles.manage"), Db())
    assert len(admin["cycles"]) == 2
    assert sorted(item["project_name"] for item in admin["projects"]) == ["乙项目", "甲项目"]


@pytest.mark.asyncio
async def test_project_management_overview_empty_and_missing_cycle(monkeypatch):
    import pytest as _pytest
    from fastapi import HTTPException
    from app.performance import projects_router

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    class EmptyDb:
        async def execute(self, _query):
            return SimpleNamespace(all=lambda: [])

    empty = await projects_router.project_management_overview(None, context(), EmptyDb())
    assert empty == {"cycles": [], "active_cycle": None, "projects": [], "hrbp_scope": [], "category": {"key": "admin", "label": "项目管理员"}}

    with _pytest.raises(HTTPException) as exc_info:
        await projects_router.project_management_overview(99, context(), EmptyDb())
    assert exc_info.value.status_code == 404


def test_person_in_project_administrators_matches_by_display_name():
    from app.performance.projects_router import _person_in_project_administrators

    target = _pm_project(1, "项目", 1)
    assert _person_in_project_administrators(target, "张三")
    assert not _person_in_project_administrators(target, "李四")
    assert not _person_in_project_administrators(target, None)



def test_project_scope_permissions_are_limited_to_granted_project():
    target = project(project_ref="project:one")
    assert _can_manage_project(context("performance.projects.manage", refs=("project:one",)), target)
    assert not _can_manage_project(context("performance.projects.manage", refs=("project:two",)), target)
    assert _can_manage_project(context("performance.cycles.manage"), target)
    assert not _can_manage_project(context(), target)


def test_project_flow_settings_validate_supported_editable_variants():
    settings = {
        "node_settings": {
            "invite-1": {
                "invite": {
                    "default_invite": "DIRECT_SUBORDINATES",
                    "minimum_invited_count": 5,
                    "exclude_default_invite_from_limit": True,
                    "recommended_invite": ["HRBP"],
                    "allow_voluntary_evaluation": False,
                }
            },
            "calibration-1": {
                "calibration": {
                    "force_distribution_enabled": True,
                    "phases": [{"rules": [{"subject_type": "PERSON", "operator": "INCLUDE", "scope": "PROJECT_ALL", "allow_authorize": False}]}],
                }
            },
            "result-view-1": {"result_view": {"opening_mode": "MANUAL"}},
            "reconsideration-1": {"result_reconsideration": {"handler": "HRBP"}},
        }
    }
    normalized = PerformanceProjectService._validate_flow_settings(settings)
    assert normalized["node_settings"] == settings["node_settings"]
    assert normalized["node_times"] == {}


def test_project_flow_settings_accepts_template_node_limit():
    node_settings = {str(index): {} for index in range(100)}
    node_times = {
        str(index): {"start_at": "2026-09-18T09:00", "end_at": "2026-09-18T18:00"}
        for index in range(100)
    }

    normalized = PerformanceProjectService._validate_flow_settings({
        "node_settings": node_settings,
        "node_times": node_times,
    })

    assert normalized["node_settings"] == node_settings
    assert normalized["node_times"] == node_times


@pytest.mark.parametrize(("field", "message"), [
    ("node_settings", "流程环节配置不能超过 100 个"),
    ("node_times", "节点时间设置不能超过 100 个"),
])
def test_project_flow_settings_rejects_more_than_template_node_limit(field, message):
    settings = {"node_settings": {}}
    settings[field] = {str(index): {} for index in range(101)}

    with pytest.raises(ProjectValidationError, match=message):
        PerformanceProjectService._validate_flow_settings(settings)


def test_self_summary_schema_preserves_content_sections_and_item_rules():
    from app.performance.self_summary_service import build_self_summary_schema, resolve_self_summary_content, sanitize_self_summary_answers, self_summary_field_requires_value, self_summary_value_empty

    resolved = resolve_self_summary_content(
        {"content_bindings": {"fill": ["summary"], "reference": ["reference"]}},
        [
            {"content_id": "summary", "type": "work_summary", "name": "工作总结", "items": [{"id": "work", "label": "填写题名称"}]},
            {"content_id": "reference", "type": "custom", "name": "参考内容", "items": [{"id": "ref", "label": "参考"}]},
        ],
    )
    assert [content["content_slot"] for content in resolved["content"]] == ["fill", "reference"]
    assert [section["name"] for section in build_self_summary_schema(resolved)] == ["工作总结"]

    schema = build_self_summary_schema({
        "content": [
            {
                "content_id": "summary",
                "type": "work_summary",
                "name": "工作总结",
                "description": "描述",
                "items": [
                    {"id": "work", "label": "填写题名称", "hint": "提示", "settings": {"mode": "fill", "required": True}},
                    {"id": "hidden", "label": "隐藏题", "settings": {"mode": "hidden", "required": True}},
                ],
            },
            {
                "content_id": "value",
                "type": "custom",
                "questionType": "tag",
                "name": "标签型填写题",
                "description": "标签说明",
                "items": [{
                    "id": "contribution",
                    "label": "价值贡献",
                    "settings": {"mode": "fill", "required": True},
                    "options": [
                        {"id": "good", "label": "做得好的", "placeholder": "填写亮点", "required": True},
                        {"id": "improve", "label": "待改进的", "placeholder": "填写改进项"},
                    ],
                }],
            },
        ]
    })

    assert [section["name"] for section in schema] == ["工作总结", "标签型填写题"]
    assert schema[0]["fields"] == [{
        "id": "work", "type": "rich_text", "label": "填写题名称", "required": True,
        "placeholder": "提示", "options": [],
    }]
    assert [option["label"] for option in schema[1]["fields"][0]["options"]] == ["做得好的", "待改进的"]
    assert self_summary_value_empty(schema[0]["fields"][0], "<p><br></p>")
    assert self_summary_value_empty(schema[1]["fields"][0], {"tags": ["good"], "note": "<p>​</p>"})
    assert self_summary_field_requires_value(schema[1]["fields"][0], {"tags": ["good"], "notes": {}})
    assert self_summary_value_empty(schema[1]["fields"][0], {"tags": ["good"], "notes": {}})
    assert not self_summary_value_empty(schema[1]["fields"][0], {"tags": ["good"], "note": "完成重点项目"})
    assert not self_summary_value_empty(schema[1]["fields"][0], {"tags": ["good"], "notes": {"good": "完成重点项目"}})
    sanitized = sanitize_self_summary_answers(schema, {
        "work": '<script>alert(1)</script><b onclick="bad()">安全内容</b><a href="javascript:bad()">链接</a>',
        "contribution": {"tags": ["good"], "note": '<img src=x onerror="bad()"><p>说明</p>'},
    })
    assert sanitized["work"] == "<b>安全内容</b><a>链接</a>"
    assert sanitized["contribution"]["note"] == "<p>说明</p>"
    sanitized = sanitize_self_summary_answers(schema, {
        "contribution": {"tags": ["good", "improve"], "notes": {"good": "<p>亮点</p>", "improve": '<script>x</script><p>改进</p>'}},
    })
    assert sanitized["contribution"]["notes"] == {"good": "<p>亮点</p>", "improve": "<p>改进</p>"}


@pytest.mark.asyncio
async def test_self_summary_template_expands_rating_rule_options():
    from app.performance.self_summary_service import hydrate_self_summary_template

    class Result:
        def all(self):
            question = SimpleNamespace(id=101, description="评级说明", display_mode="下拉样式")
            rule = SimpleNamespace(config={"levels": [
                {"id": "one", "name": "1星", "color": "#f54a45"},
                {"id": "five", "name": "5星", "color": "#3370ff"},
            ]})
            return [(question, rule)]

    class Db:
        async def execute(self, _statement):
            return Result()

    hydrated = await hydrate_self_summary_template({
        "content": [{
            "type": "rating", "name": "评分评级", "description": "",
            "items": [{"id": "101", "label": "绩效评级"}],
        }]
    }, Db())

    content = hydrated["content"][0]
    assert content["description"] == "评级说明"
    assert content["ratingDisplayMode"] == "下拉样式"
    assert content["options"] == [
        {"id": "one", "label": "1星", "color": "#f54a45", "placeholder": "", "required": False},
        {"id": "five", "label": "5星", "color": "#3370ff", "placeholder": "", "required": False},
    ]


def test_self_summary_legacy_duplicate_rating_keeps_only_selected_question():
    from app.performance.self_summary_service import build_self_summary_schema

    schema = build_self_summary_schema({"content": [{
        "content_id": "rating",
        "type": "rating",
        "name": "评分评级",
        "ratingOptionId": "new",
        "options": [{"id": "a", "label": "优秀", "color": "#3370ff"}],
        "items": [
            {"id": "old", "label": "旧评估项"},
            {"id": "new", "label": "新评估项"},
        ],
    }]})

    assert len(schema[0]["fields"]) == 1
    assert schema[0]["fields"][0]["id"] == "new"
    assert schema[0]["fields"][0]["label"] == "新评估项"
    assert schema[0]["fields"][0]["options"] == [{"id": "a", "label": "优秀", "color": "#3370ff", "placeholder": "", "required": False}]
    assert schema[0]["fields"][0]["display_mode"] == "标签样式"


@pytest.mark.asyncio
async def test_self_summary_detail_keeps_template_title_and_returns_snapshot_person(monkeypatch):
    from app.performance import projects_router

    task = SimpleNamespace(
        id=9,
        project_id=3,
        task_kind="work_summary",
        member_snapshot_id=21,
        target_employee_no="E001",
        available_at=None,
        due_at=None,
        submitted_at=None,
        answer_version=3,
        answers={"work": "已完成"},
    )
    node = SimpleNamespace(node_id="summary", name="模板手动维护名称", config={"template": {
        "content": [{
            "content_id": "summary", "type": "work_summary", "name": "工作总结", "description": "描述",
            "items": [{"id": "work", "label": "填写题名称", "settings": {"required": True}}],
        }]
    }})
    member = SimpleNamespace(display_name="刘琦", organization_ref="产品中心", direct_manager_employee_no="M001")

    async def fake_task(*_args):
        return task, node

    class Db:
        def __init__(self):
            self.values = [member, "刘芝萍"]

        async def scalar(self, _statement):
            return self.values.pop(0)

        async def get(self, _model, _id):
            return SimpleNamespace(settings={"flow_settings": {"node_times": {"summary": {"start_at": "2026-09-16T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}})

    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    result = await projects_router.get_self_summary(9, context(), Db())

    assert result["task_id"] == 9
    assert result["task_kind"] == "work_summary"
    assert result["entry_mode"] == "template_task"
    assert result["node_name"] == "模板手动维护名称"
    assert result["deadline_at"].isoformat() == "2026-09-30T00:00:00+00:00"
    assert result["person"] == {
        "employee_no": "E001",
        "display_name": "刘琦",
        "organization_ref": "产品中心",
        "manager_name": "刘芝萍",
    }
    assert result["form_schema"][0]["name"] == "工作总结"
    assert result["answers"] == {"work": "已完成"}

    task.task_kind = "evaluation"
    evaluation = await projects_router.get_template_task(9, context(), Db())
    assert evaluation["task_kind"] == "evaluation"
    assert evaluation["entry_mode"] == "template_task"
    assert evaluation["answers"] == {"work": "已完成"}


@pytest.mark.asyncio
async def test_self_summary_partial_draft_merges_existing_answers(monkeypatch):
    from app.performance import projects_router

    task = SimpleNamespace(
        id=9,
        project_id=3,
        available_at=None,
        due_at=None,
        submitted_at=None,
        answer_version=1,
        answers={"work": "原内容", "other": "保留内容"},
        status="pending",
        completed_at=None,
    )
    node = SimpleNamespace(node_id="summary", config={"template": {"content": [{
        "content_id": "summary", "type": "work_summary", "name": "工作总结",
        "items": [{"id": "work", "label": "填写题名称", "settings": {"required": False}}],
    }]}})

    async def fake_task(*_args):
        return task, node

    class Db:
        async def get(self, _model, _id):
            return None

        async def commit(self):
            return None

    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    result = await projects_router._save_self_summary(
        9,
        projects_router.SelfSummaryAnswersPayload(answers={"work": "新内容"}, version=1),
        False,
        context(),
        Db(),
    )

    assert task.answers == {"work": "新内容", "other": "保留内容"}
    assert result["version"] == 2


@pytest.mark.asyncio
async def test_self_summary_legacy_empty_snapshot_falls_back_to_matching_template_node():
    from app.performance import projects_router
    from app.performance.models import PerformanceProject, PerformanceTemplateWorkflow

    task = SimpleNamespace(project_id=3)
    node = SimpleNamespace(node_id="summary", config={"template": {"node_id": "summary", "content_bindings": {"fill": []}}})
    project = SimpleNamespace(settings={"template_id": 77})
    workflow = SimpleNamespace(
        nodes=[{"node_id": "summary", "content_bindings": {"fill": ["content-1"]}}],
        content_library=[{"content_id": "content-1", "type": "work_summary", "name": "工作总结", "items": [{"id": "work", "label": "填写题名称"}]}],
    )

    class Db:
        async def get(self, model, identity):
            if model is PerformanceProject and identity == 3:
                return project
            if model is PerformanceTemplateWorkflow and identity == 77:
                return workflow
            return None

    template = await projects_router._self_summary_template(task, node, Db())
    assert template["content"][0]["content_id"] == "content-1"
    assert template["content"][0]["content_slot"] == "fill"


def test_self_summary_repeatable_section_uses_aligned_answer_arrays():
    from app.performance.self_summary_service import (
        build_self_summary_schema,
        iter_self_summary_field_instances,
        sanitize_self_summary_answers,
        self_summary_instance_count,
    )

    schema = build_self_summary_schema({"content": [{
        "content_id": "summary",
        "type": "work_summary",
        "name": "工作总结",
        "settings": {"allowMultiple": True},
        "items": [
            {"id": "work", "label": "总结", "settings": {"required": True}},
            {"id": "result", "label": "结果", "settings": {"required": False}},
        ],
    }]})
    section = schema[0]
    assert section["allow_multiple"] is True
    answers = {"work": ["<b>第一条</b>", "<script>x</script><p>第二条</p>"], "result": ["完成"]}
    sanitized = sanitize_self_summary_answers(schema, answers)

    assert sanitized["work"] == ["<b>第一条</b>", "<p>第二条</p>"]
    assert sanitized["result"] == ["完成"]
    assert self_summary_instance_count(section, sanitized) == 2
    instances = list(iter_self_summary_field_instances(schema, sanitized))
    assert [(field["id"], index, value) for _section, field, index, value in instances] == [
        ("work", 0, "<b>第一条</b>"),
        ("result", 0, "完成"),
        ("work", 1, "<p>第二条</p>"),
        ("result", 1, None),
    ]


@pytest.mark.asyncio
async def test_self_summary_repeatable_required_field_validates_every_instance(monkeypatch):
    from fastapi import HTTPException
    from app.performance import projects_router

    task = SimpleNamespace(
        id=9,
        project_id=3,
        available_at=None,
        due_at=None,
        submitted_at=None,
        answer_version=1,
        answers={},
        status="pending",
        completed_at=None,
    )
    node = SimpleNamespace(node_id="summary", config={"template": {"content": [{
        "content_id": "summary",
        "type": "work_summary",
        "name": "工作总结",
        "settings": {"allowMultiple": True},
        "items": [{"id": "work", "label": "总结", "settings": {"required": True}}],
    }]}})

    async def fake_task(*_args):
        return task, node

    class Db:
        async def get(self, _model, _id):
            return None

    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    with pytest.raises(HTTPException) as exc:
        await projects_router._save_self_summary(
            9,
            projects_router.SelfSummaryAnswersPayload(answers={"work": ["第一条", ""]}, version=1),
            True,
            context(),
            Db(),
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == {"code": "VALIDATION_FAILED", "field_id": "work"}


@pytest.mark.asyncio
async def test_live_project_time_replaces_stale_snapshot_and_task_deadline():
    from datetime import UTC, datetime
    from app.performance.projects_router import _node_timing, _task_window

    old = {"start_at": "2026-09-20T00:00:00+08:00", "end_at": "2026-09-30T23:59:00+08:00"}
    updated = {"start_at": "2026-09-16T00:00:00+08:00", "end_at": old["end_at"]}
    node = SimpleNamespace(node_id="manager-review", config={"template": {"name": "上级评估"}, "time": old})
    task = SimpleNamespace(available_at=datetime(2026, 9, 19, 16, tzinfo=UTC), due_at=datetime(2026, 9, 30, 15, 59, tzinfo=UTC))
    target = SimpleNamespace(settings={"flow_settings": {"node_times": {"manager-review": updated}}})
    now = datetime(2026, 9, 17, 12, tzinfo=UTC)
    assert _review_node_status(**old, now=now) == "not_started"
    assert _review_node_status(**_node_timing(target, node), now=now) == "pending"
    assert _task_window(task, node, target) == (datetime(2026, 9, 15, 16, tzinfo=UTC), datetime(2026, 9, 30, 15, 59, tzinfo=UTC))
    assert node.config["time"] == old
    assert task.available_at == datetime(2026, 9, 19, 16, tzinfo=UTC)


def test_live_project_time_controls_task_opening_and_late_submission(monkeypatch):
    from datetime import UTC, datetime, timedelta
    from app.performance.projects_router import _self_summary_state, _task_window

    current = datetime(2026, 9, 17, 12, tzinfo=UTC)
    monkeypatch.setattr('app.performance.projects_router.datetime', SimpleNamespace(now=lambda _tz: current))
    task = SimpleNamespace(available_at=None, due_at=None, submitted_at=None)
    node = SimpleNamespace(node_id="summary", config={"time": {"start_at": "2026-09-16T00:00:00Z"}})
    project = SimpleNamespace(settings={"flow_settings": {"node_times": {"summary": {"start_at": "2026-09-18T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}})
    assert _self_summary_state(task, *_task_window(task, node, project)) == (False, False)
    project.settings["flow_settings"]["node_times"]["summary"]["start_at"] = "2026-09-16T00:00:00Z"
    assert _self_summary_state(task, *_task_window(task, node, project)) == (True, True)
    project.settings["flow_settings"]["node_times"]["summary"]["end_at"] = "2026-09-16T23:59:00Z"
    assert _self_summary_state(task, *_task_window(task, node, project)) == (True, True)
    task.submitted_at = current - timedelta(days=1)
    assert _self_summary_state(task, *_task_window(task, node, project)) == (False, False)


def test_missing_live_project_time_falls_back_to_historical_node_or_task():
    from datetime import UTC, datetime
    from app.performance.projects_router import _node_timing, _task_window

    task = SimpleNamespace(available_at=datetime(2026, 9, 16, tzinfo=UTC), due_at=datetime(2026, 9, 30, tzinfo=UTC))
    node = SimpleNamespace(node_id="summary", config={"time": {"start_at": "2026-09-18T00:00:00Z"}})
    project = SimpleNamespace(settings={"flow_settings": {"node_times": {}}})
    assert _node_timing(project, node) == node.config["time"]
    assert _task_window(task, node, project)[0] == datetime(2026, 9, 18, tzinfo=UTC)
    node.config = {}
    assert _task_window(task, node, project) == (task.available_at, task.due_at)
    project.settings["flow_settings"]["node_times"]["summary"] = {}
    assert _task_window(task, node, project) == (None, None)

@pytest.mark.asyncio
async def test_rescheduled_project_overview_and_timeline_read_current_settings(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 9, 17, 12, tzinfo=tz)

    monkeypatch.setattr(projects_router, "datetime", Clock)
    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    target = project("STARTED")
    target.name = "绩效项目"
    target.settings = {"flow_settings": {"node_settings": {}, "node_times": {"manager-review": {"start_at": "2026-09-20T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}}
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", node_order=1, name="上级评估", config={"time": {"start_at": "2026-09-20T00:00:00Z"}, "template": {"executor_types": ["DIRECT_MANAGER"]}})
    cycle = SimpleNamespace(name="周期", start_at=Clock(2026, 9, 1, tzinfo=UTC), end_at=Clock(2026, 10, 1, tzinfo=UTC))
    task = SimpleNamespace(id=20, project_id=1, node_snapshot_id=10, handler_ref="E001", available_at=Clock(2026, 9, 20, tzinfo=UTC), due_at=Clock(2026, 9, 30, tzinfo=UTC))

    class Db:
        def __init__(self):
            self.calls = 0

        async def scalar(self, _query):
            return 20

        async def get(self, model, identity):
            return target if model is PerformanceProject and identity == 1 else None

        async def execute(self, _query):
            self.calls += 1
            values = [[(target, cycle)], [node], [], [task]]
            rows = values[self.calls - 1]
            return SimpleNamespace(all=lambda: rows, scalars=lambda: SimpleNamespace(all=lambda: rows))

        def add(self, _record):
            pass

        async def commit(self):
            pass

        async def refresh(self, _project):
            pass

    db = Db()
    old = await projects_router.review_overview(1, context("performance.cycles.manage"), db)
    assert old["categories"][2]["nodes"][0]["status"] == "not_started"
    await PerformanceProjectService(db).update_project(target, {"flow_settings": {"node_settings": {}, "node_times": {"manager-review": {"start_at": "2026-09-16T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}}, actor_type="PORTAL_USER", actor_id=1)
    db.calls = 0
    current = await projects_router.review_overview(1, context("performance.cycles.manage"), db)
    review_node = current["categories"][2]["nodes"][0]
    assert (review_node["status"], review_node["start_at"]) == ("pending", "2026-09-16T00:00:00Z")
    db.calls = 1
    timeline = await projects_router.workbench_timeline(1, context("performance.cycles.manage"), db)
    assert (timeline[0]["status"], timeline[0]["start_at"]) == ("pending", "2026-09-16T00:00:00Z")
    assert node.config["time"]["start_at"] == "2026-09-20T00:00:00Z"
    assert task.available_at == Clock(2026, 9, 20, tzinfo=UTC)

@pytest.mark.asyncio
async def test_self_summary_save_uses_live_project_window_not_frozen_task(monkeypatch):
    from datetime import UTC, datetime
    from fastapi import HTTPException
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 9, 17, 12, tzinfo=tz)

    monkeypatch.setattr(projects_router, "datetime", Clock)
    target = SimpleNamespace(settings={"flow_settings": {"node_times": {"summary": {"start_at": "2026-09-20T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"}}}})
    task = SimpleNamespace(project_id=1, available_at=Clock(2026, 9, 20, tzinfo=UTC), due_at=Clock(2026, 9, 30, tzinfo=UTC), submitted_at=None, status="pending", completed_at=None, answers={}, answer_version=1)
    node = SimpleNamespace(node_id="summary", config={"time": {"start_at": "2026-09-20T00:00:00Z"}, "template": {"content": [{"content_id": "summary", "type": "work_summary", "name": "工作总结", "items": [{"id": "work", "label": "总结", "settings": {"required": False}}]}]}})

    async def fake_task(*_args):
        return task, node

    class Db:
        def __init__(self):
            self.commits = 0

        async def get(self, model, identity):
            return target if model is PerformanceProject and identity == 1 else None

        async def commit(self):
            self.commits += 1

    monkeypatch.setattr(projects_router, "_self_summary_task", fake_task)
    db = Db()
    payload = projects_router.SelfSummaryAnswersPayload(answers={"work": "完成"}, version=1)
    with pytest.raises(HTTPException) as exc:
        await projects_router._save_self_summary(1, payload, False, context(), db)
    assert exc.value.status_code == 409
    assert db.commits == 0
    target.settings["flow_settings"]["node_times"]["summary"]["start_at"] = "2026-09-16T00:00:00Z"
    result = await projects_router._save_self_summary(1, payload, False, context(), db)
    assert result["answers"]["work"] == "完成"
    assert result["editable"] and result["submit_allowed"]
    assert db.commits == 1
    assert task.available_at == Clock(2026, 9, 20, tzinfo=UTC)
    assert node.config["time"]["start_at"] == "2026-09-20T00:00:00Z"

@pytest.mark.asyncio
async def test_workbench_tasks_and_people_return_live_due_date(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject
    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    target = SimpleNamespace(id=1, settings={"flow_settings": {"node_times": {"manager-review": {"start_at": "2026-09-16T00:00:00Z", "end_at": "2026-09-25T00:00:00Z"}}}})
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", node_order=1, name="上级评估", config={"time": {"end_at": "2026-10-01T00:00:00Z"}})
    task = SimpleNamespace(id=20, project_id=1, target_employee_no="E001", status="pending", available_at=None, due_at=datetime(2026, 10, 1, tzinfo=UTC))
    member = SimpleNamespace(employee_no="E001", display_name="员工甲")

    class Db:
        async def execute(self, query):
            if "count(" in str(query):
                return SimpleNamespace(all=lambda: [(node, 1)])
            return SimpleNamespace(all=lambda: [(task, node, member)])

        async def scalar(self, _query):
            return task

        async def get(self, model, identity):
            return target if model is PerformanceProject and identity == 1 else None

    db = Db()
    summary = await projects_router.workbench_tasks(1, 'pending', context('performance.cycles.manage'), db)
    people = await projects_router.workbench_task_people('manager-review', 1, 'pending', context(), db)
    assert summary[0]['available_at'] == datetime(2026, 9, 16, tzinfo=UTC)
    assert summary[0]['due_at'] == datetime(2026, 9, 25, tzinfo=UTC)
    assert people[0]['due_at'] == datetime(2026, 9, 25, tzinfo=UTC)
    assert task.due_at == datetime(2026, 10, 1, tzinfo=UTC)

@pytest.mark.asyncio
@pytest.mark.parametrize("admin_preview", [True, False])
async def test_task_people_preserves_project_node_and_target_scope(monkeypatch, admin_preview):
    from app.performance import projects_router

    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="MANAGER-1")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    class Db:
        def __init__(self):
            self.queries = []

        async def scalar(self, query):
            self.queries.append(query)
            return None

        async def execute(self, query):
            self.queries.append(query)
            return SimpleNamespace(all=lambda: [])

        async def get(self, _model, _id):
            return None

    db = Db()
    account = context("performance.cycles.manage") if admin_preview else context()
    result = await projects_router.workbench_task_people("manager-review", 7, "pending", account, db, None)
    assert result == []
    for query in db.queries:
        sql = str(query.compile(compile_kwargs={"literal_binds": True}))
        where = sql.split("WHERE", 1)[1]
        assert "performance_node_tasks.project_id = 7" in where
        assert "performance_project_node_snapshots.project_id = 7" in where
        assert "performance_project_node_snapshots.node_id = 'manager-review'" in where
        assert "performance_node_tasks.status = 'pending'" in where
        assert ("performance_node_tasks.handler_ref = 'MANAGER-1'" in where) is not admin_preview
    member_sql = str(db.queries[1])
    assert "performance_project_members.snapshot_id = performance_node_tasks.member_snapshot_id" in member_sql
    assert "performance_project_members.employee_no = performance_node_tasks.target_employee_no" in member_sql


@pytest.mark.asyncio
async def test_workbench_pending_group_uses_current_handler_task():
    from app.performance import projects_router

    node = SimpleNamespace(id=10, project_id=1, node_id="summary", node_type="work_summary", name="工作总结", config={})
    task = SimpleNamespace(id=20, available_at=None, due_at=None)

    class Db:
        async def execute(self, query):
            assert "performance_node_tasks.handler_ref" in str(query)
            return SimpleNamespace(all=lambda: [(node, 1)])

        async def scalar(self, query):
            assert "performance_node_tasks.handler_ref" in str(query)
            return task

        async def get(self, _model, _id):
            return None

    result = await projects_router.workbench_tasks(1, 'pending', context(), Db())
    assert result[0]['task_id'] == 20

@pytest.mark.parametrize("start,end", [("not-a-date", "2026-09-30T00:00:00Z"), ("2026-09-20T00:00:00Z", "2026-09-16T00:00:00Z")])
def test_project_time_rejects_invalid_live_schedule(start, end):
    with pytest.raises(ProjectValidationError):
        PerformanceProjectService._validate_flow_settings({"node_settings": {}, "node_times": {"manager-review": {"start_at": start, "end_at": end}}})

@pytest.mark.asyncio
async def test_review_project_visibility_uses_semi_joins_for_admin_and_participant(monkeypatch):
    from app.performance import projects_router
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)

    class Db:
        statement = None

        async def execute(self, statement):
            self.statement = statement
            return SimpleNamespace(all=lambda: [])

    db = Db()
    await projects_router.review_overview(None, context("performance.cycles.manage"), db, None)
    admin_sql = str(db.statement)
    assert "EXISTS" in admin_sql
    assert "LEFT OUTER JOIN performance_node_tasks" not in admin_sql
    assert "DISTINCT" not in admin_sql
    assert "portal_user_id" not in admin_sql

    await projects_router.review_overview(None, context(), db, None)
    participant_sql = str(db.statement)
    assert "performance_project_members.portal_user_id" in participant_sql
    assert "performance_node_tasks.handler_ref" in participant_sql
    assert " OR " in participant_sql
    assert "LEFT OUTER JOIN performance_node_tasks" not in participant_sql


@pytest.mark.asyncio
async def test_project_matrix_uses_submitted_rating_from_final_result_node(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router

    project = SimpleNamespace(id=7, settings={"template_id": 11}, project_ref="project:matrix")
    members = [
        SimpleNamespace(id=1, employee_no="E001", display_name="员工一", employment_status="在职"),
        SimpleNamespace(id=2, employee_no="E002", display_name="员工二", employment_status="在职"),
        SimpleNamespace(id=3, employee_no="E003", display_name="员工三", employment_status="离职"),
    ]
    node = SimpleNamespace(
        id=31,
        node_id="manager-review",
        node_order=1,
        node_type="evaluation",
        config={"template": {
            "include_final_result": True,
            "content": [{
                "type": "rating",
                "name": "绩效评级",
                "items": [{"id": "rating-field", "label": "绩效评级"}],
                "options": [
                    {"id": "one", "label": "1星", "color": "#f54a45"},
                    {"id": "five", "label": "5星", "color": "#3370ff"},
                ],
            }],
        }},
    )
    submitted_rating = datetime(2026, 9, 20, tzinfo=UTC)
    tasks = [
        SimpleNamespace(node_snapshot_id=31, target_employee_no="E001", submitted_at=submitted_rating, id=101, answers={"rating-field": "five"}, status="completed"),
        SimpleNamespace(node_snapshot_id=31, target_employee_no="E002", submitted_at=submitted_rating, id=102, answers={}, status="completed"),
        SimpleNamespace(node_snapshot_id=31, target_employee_no="E003", submitted_at=None, id=103, answers={"rating-field": "one"}, status="completed"),
    ]

    class Result:
        def __init__(self, values):
            self.values = values

        def scalars(self):
            return SimpleNamespace(all=lambda: self.values)

    class Db:
        def __init__(self):
            self.calls = 0

        async def execute(self, _statement):
            self.calls += 1
            return Result([members, [node], tasks][self.calls - 1])

    async def value(result):
        return result

    monkeypatch.setattr(projects_router, "_get_project", lambda *_args: value(project))
    monkeypatch.setattr(projects_router, "_can_manage_project", lambda *_args: True)
    monkeypatch.setattr(projects_router, "_roster_member_fields", lambda *_args: value({
        "E001": {"position_level": "J6"},
        "E002": {"position_level": "J3"},
        "E003": {"position_level": None},
    }))

    result = await projects_router.project_matrix(7, context("performance.cycles.manage"), Db())

    assert (result.total, result.completed_count, result.pending_count) == (3, 1, 2)
    assert [rating.label for rating in result.ratings] == ["1星", "5星"]
    assert result.completed_rows[0].level == "J6"
    assert result.completed_rows[0].cells["five"].people[0].display_name == "员工一"
    assert [row.level for row in result.completed_rows] == ["J6", "J3", "--"]
    assert result.completed_rows[1].cells["five"].count == 0
    assert result.completed_rows[2].cells["five"].count == 0
    assert [row.level for row in result.pending_rows] == ["J3", "--"]
    assert result.pending_rows[1].cells["pending"].people[0].employment_status == "离职"
