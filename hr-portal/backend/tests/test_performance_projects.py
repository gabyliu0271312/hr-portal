from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.performance.projects_router import ProjectPayload, _can_manage_project, _review_node_category, _review_node_status
from app.performance.auth_context import PerformanceAccessContext, PerformanceRoleGrant, performance_admin_preview_enabled
from app.performance.project_service import PerformanceProjectService, ProjectValidationError


def context(*permissions: str, refs: tuple[str, ...] = (), portal_entry_permissions: tuple[str, ...] = ()) -> PerformanceAccessContext:
    return PerformanceAccessContext(
        subject_type="PORTAL_USER",
        subject_id=1,
        display_name="管理员",
        account_type=None,
        portal_entry_permissions=portal_entry_permissions,
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
    portal_admin = context(portal_entry_permissions=("performance.admin",))
    ordinary = context()
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", False)
    assert not performance_admin_preview_enabled(admin)
    assert not performance_admin_preview_enabled(portal_admin)
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", True)
    assert performance_admin_preview_enabled(admin)
    assert performance_admin_preview_enabled(portal_admin)
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
        settings={},
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
        async def scalar(self, _query):
            return None

        async def execute(self, query):
            # SQL 层已按 status=STARTED 过滤，这里忠实返回启动项目
            model = query.column_descriptions[0].get("entity")
            from app.performance.models import PerformanceNodeTask, PerformanceProjectMember, PerformanceProjectNodeSnapshot
            if model in {PerformanceNodeTask, PerformanceProjectMember, PerformanceProjectNodeSnapshot}:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
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
    assert len(result["completion_nodes"]) == 8
    assert all(item["status"] == "unavailable" for item in result["completion_nodes"])

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
    assert empty == {"cycles": [], "active_cycle": None, "projects": [], "completion_nodes": [], "hrbp_scope": [], "category": {"key": "admin", "label": "项目管理员"}}

    with _pytest.raises(HTTPException) as exc_info:
        await projects_router.project_management_overview(99, context(), EmptyDb())
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_project_completion_nodes_aggregate_real_deadlines_and_task_progress():
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceNodeTask, PerformanceProjectMember, PerformanceProjectNodeSnapshot

    project = _pm_project(1, "项目", 1)
    project.settings = {"flow_settings": {}}
    members = [SimpleNamespace(snapshot_id=10, employee_no="E001"), SimpleNamespace(snapshot_id=10, employee_no="E002")]
    nodes = [
        SimpleNamespace(id=11, project_id=1, node_id="summary", node_type="work_summary", node_order=1, name="工作总结", config={"template": {"executor_types": ["SUBJECT"]}, "time": {"start_at": "2026-09-01T00:00:00Z", "end_at": "2026-10-01T15:59:00Z"}}),
        SimpleNamespace(id=12, project_id=1, node_id="self", node_type="evaluation", node_order=2, name="自评", config={"template": {"executor_types": ["SUBJECT"]}, "time": {"start_at": "2026-10-01T00:00:00Z", "end_at": "2026-10-10T15:59:00Z"}}),
        SimpleNamespace(id=13, project_id=1, node_id="reconsider", node_type="result_reconsideration", node_order=3, name="结果复议处理", config={"template": {}, "time": {"start_at": "2026-09-01T00:00:00Z", "end_at": "2026-10-10T15:59:00Z"}}),
    ]
    tasks = [
        SimpleNamespace(project_id=1, node_snapshot_id=11, submitted_at=datetime(2026, 9, 20, tzinfo=UTC), status="completed"),
        SimpleNamespace(project_id=1, node_snapshot_id=11, submitted_at=None, status="pending"),
        SimpleNamespace(project_id=1, node_snapshot_id=12, submitted_at=None, status="pending"),
        SimpleNamespace(project_id=1, node_snapshot_id=13, submitted_at=None, status="pending"),
    ]

    class Db:
        async def scalar(self, _query):
            return 10

        async def execute(self, query):
            model = query.column_descriptions[0]["entity"]
            if model is PerformanceProjectMember:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: members))
            if model is PerformanceProjectNodeSnapshot:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: nodes))
            if model is PerformanceNodeTask:
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: tasks))
            raise AssertionError(model)

    result = await projects_router._project_completion_nodes([project], Db(), datetime(2026, 9, 23, tzinfo=UTC))
    by_key = {item["key"]: item for item in result}
    assert by_key["work-summary"]["status"] == "active"
    assert (by_key["work-summary"]["completed_count"], by_key["work-summary"]["total_count"], by_key["work-summary"]["completion_rate"]) == (1, 2, 50.0)
    assert by_key["work-summary"]["deadline_at"] == datetime(2026, 10, 1, 15, 59, tzinfo=UTC)
    assert by_key["self-review"]["status"] == "not_started"
    assert by_key["self-review"]["completion_rate"] == 0
    assert by_key["result-reconsideration"]["total_count"] == 1
    assert by_key["result-reconsideration"]["completed_count"] == 0
    assert by_key["result-reconsideration"]["completion_rate"] == 0


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
async def test_reference_tabs_include_unsubmitted_node_and_manager_reminder(monkeypatch):
    from app.performance import projects_router
    from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot

    task = SimpleNamespace(
        id=10,
        project_id=3,
        member_snapshot_id=21,
        target_employee_no="E001",
        handler_ref="M001",
        task_kind="evaluation",
        submitted_at=None,
        answers={},
    )
    node = SimpleNamespace(
        id=31,
        project_id=3,
        node_id="manager-review",
        node_type="evaluation",
        name="上级评估",
        config={"template": {"executor_types": ["DIRECT_MANAGER"]}},
    )
    reference_node = SimpleNamespace(
        id=32,
        project_id=3,
        node_id="work-summary",
        node_type="work_summary",
        name="工作总结环节",
        config={"template": {}},
    )
    reference_task = SimpleNamespace(
        id=11,
        project_id=3,
        member_snapshot_id=21,
        node_snapshot_id=32,
        target_employee_no="E001",
        handler_ref="E001",
        available_at=None,
        due_at=None,
        submitted_at=None,
        answers={"work": "草稿"},
    )
    project = SimpleNamespace(id=3, settings={"template_id": 77})

    async def current_template(*_args):
        return {"content": [{"content_slot": "reference", "reference_kind": "node", "reference_value": "work-summary"}]}

    async def reference_template(*_args):
        return {"content": [{"content_slot": "fill", "type": "work_summary", "name": "工作总结", "items": [{"id": "work", "label": "总结"}]}]}

    class Result:
        def __init__(self, values):
            self.values = values

        def scalars(self):
            return SimpleNamespace(all=lambda: self.values)

    class Db:
        async def get(self, model, _identity):
            return None

        async def execute(self, query):
            model = query.column_descriptions[0]["entity"]
            if model is PerformanceProjectNodeSnapshot:
                return Result([reference_node])
            if model is PerformanceNodeTask:
                return Result([reference_task])
            raise AssertionError(model)

    monkeypatch.setattr(projects_router, "_self_summary_template", current_template)
    monkeypatch.setattr(projects_router, "_reference_template", reference_template)
    tabs = await projects_router._reference_tabs(task, node, project, "M001", Db())

    assert len(tabs) == 1
    assert tabs[0]["node_name"] == "工作总结环节"
    assert tabs[0]["status"] == "pending"
    assert tabs[0]["form_schema"] == []
    assert tabs[0]["answers"] == {}
    assert tabs[0]["can_remind"] is True


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
    member = SimpleNamespace(display_name="刘琦", company_org="产品中心", organization_ref="产品中心", direct_supervisor_employee_no="M001")

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
    assert {key: result["person"][key] for key in ("employee_no", "display_name", "department", "direct_supervisor_name")} == {
        "employee_no": "E001",
        "display_name": "刘琦",
        "department": "产品中心",
        "direct_supervisor_name": "刘芝萍",
    }
    assert result["person"]["visibility_role"] == "other"
    assert result["person"]["profile_fields"] == [
        {"key": "department", "label": "部门", "value": "产品中心"},
        {"key": "direct_supervisor", "label": "直属上级", "value": "刘芝萍"},
    ]
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
            if "performance_project_members" in str(query):
                return SimpleNamespace(all=lambda: [(task, node, member)])
            return SimpleNamespace(all=lambda: [(node, task)])

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
    member_sql = str(db.queries[0])
    assert "performance_project_members.snapshot_id = performance_node_tasks.member_snapshot_id" in member_sql
    assert "performance_project_members.employee_no = performance_node_tasks.target_employee_no" in member_sql


@pytest.mark.asyncio
async def test_workbench_projects_uses_employee_identity_and_member_visibility(monkeypatch):
    from app.performance import projects_router

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    rows = [(_pm_project(1, "项目一", 1), _pm_cycle(1, "周期一"))]

    class Db:
        statement = None

        async def execute(self, statement):
            self.statement = statement
            return SimpleNamespace(all=lambda: rows)

    db = Db()
    result = await projects_router.workbench_projects(None, 1, 20, context(), db)
    assert result[0]["project_id"] == 1
    sql = str(db.statement.compile(compile_kwargs={"literal_binds": True}))
    assert "performance_projects.status = 'STARTED'" in sql
    assert "performance_node_tasks.handler_ref = 'E001'" in sql
    assert "performance_project_members.portal_user_id = 1" in sql
    assert "JOIN performance_node_tasks" not in sql


@pytest.mark.asyncio
async def test_workbench_pending_group_uses_current_handler_task(monkeypatch):
    from app.performance import projects_router

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    node = SimpleNamespace(id=10, project_id=1, node_id="summary", node_type="work_summary", node_order=1, name="工作总结", config={})
    task = SimpleNamespace(id=20, available_at=None, due_at=None)

    class Db:
        async def execute(self, query):
            assert "performance_node_tasks.handler_ref" in str(query)
            return SimpleNamespace(all=lambda: [(node, task)])

        async def get(self, _model, _id):
            return None

    result = await projects_router.workbench_tasks(1, 'pending', context(), Db())
    assert result[0]['task_id'] == 20


@pytest.mark.asyncio
async def test_workbench_pending_excludes_tasks_before_live_project_start(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 9, 21, 6, tzinfo=tz)

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="E001")

    monkeypatch.setattr(projects_router, "datetime", Clock)
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    target = SimpleNamespace(id=1, settings={"flow_settings": {"node_times": {
        "open": {"start_at": "2026-09-20T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"},
        "future": {"start_at": "2026-09-22T00:00:00Z", "end_at": "2026-09-30T00:00:00Z"},
    }}})
    open_node = SimpleNamespace(id=10, project_id=1, node_id="open", node_type="work_summary", node_order=1, name="已开始", config={})
    future_node = SimpleNamespace(id=11, project_id=1, node_id="future", node_type="evaluation", node_order=2, name="未开始", config={})
    open_task = SimpleNamespace(id=20, available_at=None, due_at=None)
    future_task = SimpleNamespace(id=21, available_at=None, due_at=None)

    class Db:
        async def execute(self, _query):
            return SimpleNamespace(all=lambda: [(open_node, open_task), (future_node, future_task)])

        async def get(self, model, identity):
            return target if model is PerformanceProject and identity == 1 else None

    result = await projects_router.workbench_tasks(1, "pending", context(), Db())

    assert [item["node_id"] for item in result] == ["open"]
    assert result[0]["pending_count"] == 1


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
        SimpleNamespace(id=1, employee_no="E001", display_name="员工一", employment_status="在职", position_level="J6"),
        SimpleNamespace(id=2, employee_no="E002", display_name="员工二", employment_status="在职", position_level="J3"),
        SimpleNamespace(id=3, employee_no="E003", display_name="员工三", employment_status="离职", position_level=None),
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


def _statistics_node(project_id=1, *, node_id=31, order=1, options=None, final=True):
    return SimpleNamespace(
        id=node_id, project_id=project_id, node_id=f"review-{node_id}", node_order=order,
        node_type="evaluation", config={"template": {
            "include_final_result": final,
            "content": [{
                "type": "rating", "name": "绩效评级",
                "items": [{"id": "rating-field", "label": "绩效评级"}],
                "options": options if options is not None else [
                    {"id": "one", "label": "1星", "color": "#f54a45"},
                    {"id": "five", "label": "5星", "color": "#3370ff"},
                ],
            }],
        }},
    )


def _statistics_member(employee_no, snapshot_id=21, *, position_level="J6", hire_date=None):
    return SimpleNamespace(
        employee_no=employee_no, snapshot_id=snapshot_id,
        display_name=f"员工{employee_no}", employment_status="在职",
        position_level=position_level, hire_date=hire_date,
    )


def _statistics_task(employee_no, value="five", *, task_id=101, node_id=31, snapshot_id=21, project_id=1, submitted=True):
    from datetime import UTC, datetime
    return SimpleNamespace(
        id=task_id, project_id=project_id, node_snapshot_id=node_id, member_snapshot_id=snapshot_id,
        target_employee_no=employee_no, answers={"rating-field": value}, status="completed",
        submitted_at=datetime(2026, 9, 20, tzinfo=UTC) if submitted else None,
    )


@pytest.fixture
def statistics_db(monkeypatch):
    from app.performance import projects_router
    from app.performance.models import PerformanceProject, PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceNodeTask

    monkeypatch.setattr(settings, "APP_ENV", "prod")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", False)

    class Db:
        def __init__(self):
            self.cycle = _pm_cycle(1)
            self.projects = [_pm_project(1, "项目一", 1, administrators=["管理员"])]
            self.snapshots = {1: 21}
            self.members = [_statistics_member("E001")]
            self.nodes = [_statistics_node()]
            self.tasks = [_statistics_task("E001")]
            self.queries = []

        async def scalar(self, statement):
            self.queries.append(statement)
            params = statement.compile().params
            if "max(performance_project_member_snapshots.id)" in str(statement):
                return self.snapshots.get(params["project_id_1"])
            assert "performance_cycles.id" in str(statement)
            return self.cycle if self.cycle and self.cycle.id == params["id_1"] else None

        async def execute(self, statement):
            self.queries.append(statement)
            params = statement.compile().params
            model = statement.column_descriptions[0]["entity"]
            if model is PerformanceProject:
                rows = [item for item in self.projects if item.cycle_ref == params["cycle_ref_1"] and item.status == params["status_1"]]
            elif model is PerformanceProjectMember:
                snapshot_id = params.get("snapshot_id_1", self.snapshots.get(params.get("project_id_1")))
                rows = [item for item in self.members if item.snapshot_id == snapshot_id]
            elif model is PerformanceProjectNodeSnapshot:
                rows = sorted([item for item in self.nodes if item.project_id == params["project_id_1"] and item.node_type == params["node_type_1"]], key=lambda item: item.node_order)
            elif model is PerformanceNodeTask:
                rows = [item for item in self.tasks if item.project_id == params.get("project_id_1") and item.node_snapshot_id in params.get("node_snapshot_id_1", [])]
                if "member_snapshot_id_1" in params:
                    rows = [item for item in rows if item.member_snapshot_id == params["member_snapshot_id_1"]]
                rows.sort(key=lambda item: item.id)
            else:
                raise AssertionError(str(statement))
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))

        async def get(self, model, identity):
            assert model is PerformanceProject
            return next((item for item in self.projects if item.id == identity), None)

    db = Db()

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="MANAGER")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    return db


@pytest.mark.asyncio
async def test_level_statistics_uses_real_final_answers_and_flat_zero_rows(statistics_db):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.members += [
        _statistics_member("E002", position_level="J3"),
        _statistics_member("E003", position_level="   "),
        _statistics_member("E004", position_level="专家"),
        _statistics_member("E005", position_level=None),
    ]
    db.tasks += [
        _statistics_task("E002", None, task_id=102),
        _statistics_task("E003", "one", task_id=103, submitted=False),
        _statistics_task("E004", "invalid", task_id=104),
        _statistics_task("E005", "one", task_id=105),
    ]
    result = await project_management_statistics(1, "level", context("performance.projects.manage", refs=("project:x:1",)), db)
    assert result.model_dump() == {
        "source": "api", "dimension": "level", "rowLabel": "岗位职级", "showSummary": True,
        "totalParticipants": 5,
        "ratings": [{"key": "one", "label": "1星", "color": "#f54a45"}, {"key": "five", "label": "5星", "color": "#3370ff"}],
        "distribution": {"one": 1, "five": 1},
        "departments": [
            {"id": "level:J6", "name": "J6", "counts": {"one": 0, "five": 1}},
            {"id": "level:J3", "name": "J3", "counts": {"one": 0, "five": 0}},
            {"id": "level:专家", "name": "专家", "counts": {"one": 0, "five": 0}},
            {"id": "level:--", "name": "--", "counts": {"one": 1, "five": 0}},
        ],
    }
    assert sum(result.distribution.values()) == 2 < result.totalParticipants


@pytest.mark.asyncio
@pytest.mark.parametrize("account", [context(), context("performance.projects.manage"), context("performance.projects.manage", refs=("project:other",))])
async def test_level_statistics_visible_cycle_without_scope_is_forbidden(statistics_db, account):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    with pytest.raises(HTTPException) as error:
        await project_management_statistics(1, "level", account, statistics_db)
    assert error.value.status_code == 403
    assert not any("performance_project_members" in str(query) for query in statistics_db.queries)


@pytest.mark.asyncio
@pytest.mark.parametrize("preview", [False, True])
async def test_level_statistics_cycle_manager_keeps_overview_visibility(statistics_db, monkeypatch, preview):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    statistics_db.projects[0].administrators = ["其他人"]
    monkeypatch.setattr(settings, "APP_ENV", "dev")
    monkeypatch.setattr(settings, "PERFORMANCE_DEV_ADMIN_DEBUG", preview)
    if preview:
        result = await project_management_statistics(1, "level", context("performance.cycles.manage"), statistics_db)
        assert result.totalParticipants == 1
    else:
        with pytest.raises(HTTPException) as error:
            await project_management_statistics(1, "level", context("performance.cycles.manage"), statistics_db)
        assert (error.value.status_code, error.value.detail) == (404, "CYCLE_NOT_FOUND")


@pytest.mark.asyncio
@pytest.mark.parametrize("cycle_id,visible", [(99, True), (1, False)])
async def test_level_statistics_missing_or_invisible_cycle_is_not_found(statistics_db, cycle_id, visible):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    if not visible:
        statistics_db.projects[0].administrators = ["其他人"]
    with pytest.raises(HTTPException) as error:
        await project_management_statistics(cycle_id, "level", context("performance.projects.manage", refs=("project:x:1",)), statistics_db)
    assert (error.value.status_code, error.value.detail) == (404, "CYCLE_NOT_FOUND")


@pytest.mark.asyncio
async def test_level_statistics_only_reads_visible_manageable_started_projects(statistics_db):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.projects += [
        _pm_project(2, "可见但未授权", 1, administrators=["管理员"]),
        _pm_project(3, "授权但不可见", 1, administrators=["其他人"]),
        _pm_project(4, "草稿", 1, administrators=["管理员"], status="DRAFT"),
        _pm_project(5, "其他周期", 2, administrators=["管理员"]),
    ]
    for project_id in [2, 3, 4, 5]:
        db.snapshots[project_id] = 20 + project_id
        db.members.append(_statistics_member("E001", 20 + project_id))
        db.nodes.append(_statistics_node(project_id, node_id=30 + project_id, options=[{"id": "conflict", "label": "冲突"}]))
    account = context("performance.projects.manage", refs=("project:x:1", "project:x:3", "project:x:4", "project:x:5"))
    result = await project_management_statistics(1, "level", account, db)
    assert result.totalParticipants == 1
    assert result.distribution == {"one": 0, "five": 1}
    snapshot_queries = [query for query in db.queries if "max(performance_project_member_snapshots.id)" in str(query)]
    assert [query.compile().params["project_id_1"] for query in snapshot_queries] == [1]


@pytest.mark.asyncio
async def test_level_statistics_empty_cycle_requires_cycle_management(statistics_db):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    statistics_db.projects = []
    result = await project_management_statistics(1, "level", context("performance.cycles.manage"), statistics_db)
    assert result.model_dump() == {
        "source": "api", "dimension": "level", "rowLabel": "岗位职级", "showSummary": True,
        "totalParticipants": 0, "ratings": [], "distribution": {}, "departments": [],
    }
    with pytest.raises(HTTPException) as error:
        await project_management_statistics(1, "level", context(), statistics_db)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_level_statistics_rejects_cross_project_employee_overlap(statistics_db):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.projects.append(_pm_project(2, "项目二", 1, administrators=["管理员"]))
    db.snapshots[2] = 22
    db.members.append(_statistics_member("E001", 22))
    with pytest.raises(HTTPException) as error:
        await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert (error.value.status_code, error.value.detail) == (409, "CYCLE_MEMBER_OVERLAP_UNRESOLVED")


@pytest.mark.asyncio
@pytest.mark.parametrize("conflict", ["id", "label", "color", "code", "order", "empty_label"])
@pytest.mark.parametrize("same_project", [False, True])
async def test_level_statistics_compares_ordered_unmerged_rating_scales(statistics_db, conflict, same_project):
    from fastapi import HTTPException
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    options = [dict(item) for item in db.nodes[0].config["template"]["content"][0]["options"]]
    if conflict == "order":
        options.reverse()
    elif conflict == "empty_label":
        db.nodes[0].config["template"]["content"][0]["options"][0]["label"] = ""
        options[0]["label"] = options[0]["id"]
    else:
        options[0][conflict] = "different"
    if same_project:
        db.nodes.append(_statistics_node(node_id=32, order=2, options=options))
    else:
        db.projects.append(_pm_project(2, "项目二", 1, administrators=["管理员"]))
        db.snapshots[2] = 22
        db.members.append(_statistics_member("E002", 22))
        db.nodes.append(_statistics_node(2, node_id=32, options=options))
    with pytest.raises(HTTPException) as error:
        await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert (error.value.status_code, error.value.detail) == (409, "RATING_SCALE_CONFLICT")


@pytest.mark.asyncio
async def test_rating_code_survives_hydration_and_schema_without_changing_form_label():
    from app.performance.self_summary_service import hydrate_self_summary_template, build_self_summary_schema

    levels = [{"id": "one", "code": "1星", "name": "不合格", "color": "rgb(251, 191, 188)"}]

    class Db:
        async def execute(self, _statement):
            return SimpleNamespace(all=lambda: [(SimpleNamespace(id=101, description="", display_mode="标签样式"), SimpleNamespace(config={"levels": levels}))])

    template = {"content": [{"type": "rating", "items": [{"id": "101", "label": "绩效评级"}]}]}
    hydrated = await hydrate_self_summary_template(template, Db())
    option = build_self_summary_schema(hydrated)[0]["fields"][0]["options"][0]
    assert option == {"id": "one", "code": "1星", "label": "不合格", "color": "rgb(251, 191, 188)", "placeholder": "", "required": False}
    assert "options" not in template["content"][0]
    assert levels[0]["name"] == "不合格"


@pytest.mark.asyncio
@pytest.mark.parametrize("answer", ["one", "不合格", {"label": "不合格"}, {"id": "one"}])
async def test_rating_headers_use_rule_code_color_without_changing_answer_counts(statistics_db, answer):
    from app.performance.projects_router import project_management_statistics, project_matrix

    options = [
        {"id": "one", "code": "1星", "name": "不合格", "color": "rgb(251, 191, 188)"},
        {"id": "five", "code": "5星", "name": "卓越", "color": "rgb(186, 206, 253)"},
    ]
    statistics_db.nodes[0] = _statistics_node(options=options)
    statistics_db.tasks[0].answers = {"rating-field": answer}
    account = context("performance.cycles.manage")
    report = await project_management_statistics(1, "level", account, statistics_db)
    matrix = await project_matrix(1, account, statistics_db)
    expected = [{"key": item["id"], "label": item["code"], "color": item["color"]} for item in options]
    assert [item.model_dump() for item in report.ratings] == expected
    assert [item.model_dump() for item in matrix.ratings] == expected
    assert report.distribution == {"one": 1, "five": 0}
    assert matrix.completed_rows[0].cells["one"].count == 1


@pytest.mark.asyncio
async def test_level_statistics_merges_equal_scales_and_ignores_empty_options(statistics_db):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.projects += [_pm_project(i, f"项目{i}", 1, administrators=["管理员"]) for i in [2, 3]]
    db.snapshots.update({2: 22, 3: 23})
    db.members += [_statistics_member("E002", 22), _statistics_member("E003", 23, position_level="P2")]
    db.nodes += [_statistics_node(2, node_id=32), _statistics_node(3, node_id=33, options=[])]
    db.tasks += [_statistics_task("E002", "one", project_id=2, node_id=32, snapshot_id=22)]
    result = await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert result.totalParticipants == 3
    assert result.distribution == {"one": 1, "five": 1}
    assert [row.counts for row in result.departments] == [{"one": 1, "five": 1}, {"one": 0, "five": 0}]


@pytest.mark.asyncio
async def test_level_statistics_pins_members_and_tasks_to_selected_latest_snapshot(statistics_db):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.members.append(_statistics_member("OLD_ONLY", 20))
    db.tasks.append(_statistics_task("E001", "one", task_id=999, snapshot_id=20))
    result = await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert result.totalParticipants == 1
    assert result.distribution == {"one": 0, "five": 1}
    sql = [str(query.compile(compile_kwargs={"literal_binds": True})) for query in db.queries]
    assert any("max(performance_project_member_snapshots.id)" in query and "performance_project_member_snapshots.project_id = 1" in query for query in sql)
    assert any("performance_project_members.snapshot_id = 21" in query for query in sql)
    task_sql = next(query for query in sql if "FROM performance_node_tasks" in query)
    assert "performance_node_tasks.project_id = 1" in task_sql
    assert "performance_node_tasks.member_snapshot_id = 21" in task_sql
    assert "performance_node_tasks.node_snapshot_id IN (31)" in task_sql


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", ["snapshot", "members", "nodes", "options"])
async def test_level_statistics_empty_data_keeps_zero_values(statistics_db, missing):
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    if missing == "snapshot":
        db.snapshots = {}
    elif missing == "members":
        db.members = []
    elif missing == "nodes":
        db.nodes = []
    else:
        db.nodes[0].config["template"]["content"][0]["options"] = []
    result = await project_management_statistics(1, "level", context("performance.cycles.manage"), db)
    assert sum(result.distribution.values()) == 0
    assert result.totalParticipants == (0 if missing in {"snapshot", "members"} else 1)
    if missing in {"nodes", "options"}:
        assert result.ratings == []
        assert result.departments[0].counts == {}


@pytest.mark.asyncio
async def test_matrix_and_statistics_share_final_node_and_task_priority(statistics_db):
    from app.performance.projects_router import project_management_statistics, project_matrix

    db = statistics_db
    db.nodes += [_statistics_node(node_id=32, order=2), _statistics_node(node_id=33, order=3, final=False)]
    db.tasks += [
        _statistics_task("E001", "one", node_id=32, task_id=10),
        _statistics_task("E001", {"option_id": "five"}, node_id=32, task_id=11),
        _statistics_task("E001", "one", node_id=33, task_id=999),
        _statistics_task("NOT_A_MEMBER", "one", task_id=1000),
    ]
    account = context("performance.cycles.manage")
    report = await project_management_statistics(1, "level", account, db)
    matrix = await project_matrix(1, account, db)
    assert report.distribution == {"one": 0, "five": 1}
    assert (matrix.total, matrix.completed_count, matrix.pending_count) == (1, 1, 0)
    assert matrix.completed_rows[0].cells["five"].count == 1
    assert matrix.source == "template_final_result"
    assert matrix.display_modes == ["name", "count"]
    db.tasks = [task for task in db.tasks if task.id != 11]
    report = await project_management_statistics(1, "level", account, db)
    matrix = await project_matrix(1, account, db)
    assert report.distribution == {"one": 1, "five": 0}
    assert matrix.completed_rows[0].cells["one"].count == 1


@pytest.mark.asyncio
async def test_matrix_preserves_legacy_snapshot_and_scale_behavior(statistics_db):
    from app.performance.projects_router import project_matrix

    db = statistics_db
    db.nodes.append(_statistics_node(node_id=32, order=2, options=[{"id": "one", "label": "其他标签", "color": "#000000"}]))
    db.tasks.append(_statistics_task("E001", "one", task_id=999, node_id=32, snapshot_id=20))
    result = await project_matrix(1, context("performance.cycles.manage"), db)
    assert result.ratings[0].label == "1星"
    assert result.completed_rows[0].cells["one"].count == 1
    task_query = next(query for query in db.queries if "FROM performance_node_tasks" in str(query))
    assert "member_snapshot_id_1" not in task_query.compile().params


@pytest.mark.asyncio
async def test_matrix_refuses_unscoped_access(statistics_db):
    from fastapi import HTTPException
    from app.performance.projects_router import project_matrix

    with pytest.raises(HTTPException) as error:
        await project_matrix(1, context(), statistics_db)
    assert error.value.status_code == 403
    assert statistics_db.queries == []


def test_tenure_bucket_uses_completed_calendar_month_boundaries():
    from datetime import date
    from app.performance.projects_router import _tenure_bucket, _tenure_sort_key

    today = date(2026, 9, 21)
    assert _tenure_bucket(date(2026, 6, 21), today) == "3-6个月（不含6个月）"
    assert _tenure_bucket(date(2026, 3, 21), today) == "6个月-1年（不含1年）"
    assert _tenure_bucket(date(2025, 9, 21), today) == "1-3年内（不含3年）"
    assert _tenure_bucket(date(2023, 9, 20), today) == "3年以上"
    assert _tenure_bucket(date(2026, 8, 1), today) == "入职未满3个月"
    assert _tenure_bucket(None, today) == "入职日期缺失"
    assert sorted(["入职日期缺失", "3年以上", "入职未满3个月"], key=_tenure_sort_key) == ["入职未满3个月", "3年以上", "入职日期缺失"]


@pytest.mark.asyncio
async def test_tenure_statistics_returns_six_flat_rows_and_shared_rating_headers(statistics_db):
    from datetime import date
    from app.performance.projects_router import project_management_statistics

    db = statistics_db
    db.members[0].hire_date = date(2026, 6, 21)
    result = await project_management_statistics(1, "tenure", context("performance.cycles.manage"), db)
    assert result.source == "api"
    assert result.dimension == "tenure"
    assert result.rowLabel == "司龄"
    assert result.showSummary is True
    assert [row.name for row in result.departments] == [
        "入职未满3个月", "3-6个月（不含6个月）", "6个月-1年（不含1年）", "1-3年内（不含3年）", "3年以上", "入职日期缺失",
    ]
    assert all(not hasattr(row, "children") for row in result.departments)
    assert result.departments[1].counts["five"] == 1


    from app.performance.projects_router import _matrix_level_sort_key

    assert sorted(["--", "专家", "J3", "M10", "A", "P3", "J12"], key=_matrix_level_sort_key) == ["J12", "M10", "J3", "P3", "A", "专家", "--"]


@pytest.mark.asyncio
async def test_level_statistics_http_contract_and_dimension_validation(statistics_db):
    import httpx
    from fastapi import FastAPI
    from app.performance import projects_router

    app = FastAPI()
    app.include_router(projects_router.router, prefix="/api/v1")
    app.dependency_overrides[projects_router.get_session] = lambda: statistics_db
    app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        url = "/api/v1/performance/project-management/statistics"
        response = await client.get(url, params={"cycle_id": 1})
        assert response.status_code == 200
        payload = response.json()
        assert payload["source"] == "api"
        assert payload["dimension"] == "level"
        assert payload["distribution"] == {"one": 0, "five": 1}
        assert "heatLevels" not in payload
        assert set(payload["departments"][0]) == {"id", "name", "counts"}
        for params in [{}, {"cycle_id": 0}, {"cycle_id": 1, "dimension": "department"}]:
            response = await client.get(url, params=params)
            assert response.status_code == 422
        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context()
        response = await client.get(url, params={"cycle_id": 1})
        assert response.status_code == 403
        app.dependency_overrides[projects_router.get_performance_access_context] = lambda: context("performance.cycles.manage")
        statistics_db.projects.append(_pm_project(2, "项目二", 1, administrators=["管理员"]))
        statistics_db.snapshots[2] = 22
        statistics_db.members.append(_statistics_member("E001", 22))
        response = await client.get(url, params={"cycle_id": 1})
        assert response.status_code == 409
        assert response.json()["detail"] == "CYCLE_MEMBER_OVERLAP_UNRESOLVED"


def test_review_evaluation_status_waits_for_every_direct_report():
    from datetime import UTC, datetime
    from app.performance.projects_router import _review_tasks_status

    now = datetime(2026, 9, 20, tzinfo=UTC)
    completed = SimpleNamespace(status="completed", submitted_at=now)
    pending = SimpleNamespace(status="pending", submitted_at=None)

    assert _review_tasks_status([completed, pending], "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z", now) == "pending"
    assert _review_tasks_status([completed, completed], "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z", now) == "completed"


@pytest.mark.asyncio
async def test_workbench_groups_mixed_direct_report_tasks_until_all_complete(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="MANAGER-1")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    project = SimpleNamespace(id=1, status="STARTED", settings={})
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", node_order=1, name="直接上级评估", config={})
    completed = SimpleNamespace(id=20, project_id=1, status="completed", submitted_at=datetime(2026, 9, 20, tzinfo=UTC), available_at=None, due_at=None)
    pending = SimpleNamespace(id=21, project_id=1, status="pending", submitted_at=None, available_at=None, due_at=None)

    class Db:
        def __init__(self):
            self.tasks = [completed, pending]

        async def execute(self, _query):
            return SimpleNamespace(all=lambda: [(node, task) for task in self.tasks])

        async def get(self, model, identity):
            return project if model is PerformanceProject and identity == 1 else None

    db = Db()
    pending_groups = await projects_router.workbench_tasks(1, "pending", context(), db)
    completed_groups = await projects_router.workbench_tasks(1, "completed", context(), db)

    assert [(item["node_id"], item["pending_count"], item["completed_count"]) for item in pending_groups] == [("manager-review", 1, 1)]
    assert completed_groups == []

    pending.status = "completed"
    pending.submitted_at = datetime(2026, 9, 21, tzinfo=UTC)
    completed_groups = await projects_router.workbench_tasks(1, "completed", context(), db)
    assert [(item["node_id"], item["pending_count"], item["completed_count"]) for item in completed_groups] == [("manager-review", 0, 2)]


@pytest.mark.asyncio
async def test_evaluation_member_list_can_return_completed_and_pending_tasks(monkeypatch):
    from datetime import UTC, datetime
    from app.performance import projects_router
    from app.performance.models import PerformanceProject

    async def actor(_db, _context):
        return SimpleNamespace(actor_ref="MANAGER-1")

    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", actor)
    project = SimpleNamespace(id=1, settings={})
    node = SimpleNamespace(id=10, project_id=1, node_id="manager-review", node_type="evaluation", config={})
    completed = SimpleNamespace(id=20, project_id=1, status="completed", submitted_at=datetime(2026, 9, 20, tzinfo=UTC), available_at=None, due_at=None, target_employee_no="E001", member_snapshot_id=7)
    pending = SimpleNamespace(id=21, project_id=1, status="pending", submitted_at=None, available_at=None, due_at=None, target_employee_no="E002", member_snapshot_id=7)
    member_a = SimpleNamespace(employee_no="E001", display_name="员工一", job_family="技术", job_category="研发", position_level="P6", hire_date=datetime(2020, 1, 2).date(), company_org="研发中心", organization_ref="研发中心", employee_type="正式员工", employment_status="在职")
    member_b = SimpleNamespace(employee_no="E002", display_name="员工二", job_family="技术", job_category="研发", position_level="P6", hire_date=datetime(2020, 1, 2).date(), company_org="研发中心", organization_ref="研发中心", employee_type="正式员工", employment_status="在职")

    class Db:
        async def execute(self, _query):
            return SimpleNamespace(all=lambda: [(completed, node, member_a), (pending, node, member_b)])

        async def get(self, model, identity):
            return project if model is PerformanceProject and identity == 1 else None

    result = await projects_router.workbench_task_people("manager-review", 1, "all", context(), Db())

    assert [(item["employee_no"], item["status"]) for item in result] == [("E001", "completed"), ("E002", "pending")]
    assert [(item["visibility_role"], item["visible_profile_fields"]) for item in result] == [
        ("metric_reviewer", ["department"]),
        ("metric_reviewer", ["department"]),
    ]
    assert [(item["job_sequence"], item["position_level"], item["hire_date"], item["department"]) for item in result] == [
        (None, None, None, "研发中心"),
        (None, None, None, "研发中心"),
    ]

def test_hrbp_scope_matches_snapshot_organization_and_nested_configured_scope():
    from app.performance.projects_router import _organization_in_scope

    assert not _organization_in_scope("集团", ["集团/研发中心"])
    assert _organization_in_scope("集团/研发中心/平台部", ["集团/研发中心"])
    assert not _organization_in_scope("集团/运营中心", ["集团/研发中心"])


@pytest.mark.asyncio
async def test_hrbp_invisible_people_are_loaded_from_cycle_permission():
    from app.performance import projects_router

    class Result:
        def scalars(self):
            return self

        def all(self):
            return [SimpleNamespace(invisible_people=["E002", "E003"])]

    class Db:
        async def execute(self, _statement):
            return Result()

    assert await projects_router._person_hrbp_invisible_people(Db(), "E001", "cycle:1") == {"E002", "E003"}


@pytest.mark.asyncio
async def test_remind_project_tasks_records_only_available_pending_tasks(monkeypatch):
    from app.performance import projects_router

    project = SimpleNamespace(id=3, status="STARTED", cycle_ref="cycle:1", settings={})
    pending = SimpleNamespace(id=11, project_id=3, status="pending", available_at=None, due_at=None, target_employee_no="E001")
    completed = SimpleNamespace(id=12, project_id=3, status="completed", available_at=None, due_at=None, target_employee_no="E002")
    node = SimpleNamespace(node_id="evaluation-1", config={})

    class Result:
        def all(self):
            return [(pending, node), (completed, node)]

    class Db:
        def __init__(self):
            self.events = []
            self.committed = False

        async def get(self, model, _value):
            return project

        async def execute(self, _statement):
            return Result()

        def add(self, value):
            self.events.append(value)

        async def commit(self):
            self.committed = True

    monkeypatch.setattr(projects_router, "_is_admin_preview", lambda _context: True)
    monkeypatch.setattr(projects_router, "resolve_trusted_performance_actor", lambda *_args, **_kwargs: _actor())

    async def run_actor():
        return SimpleNamespace(actor_type="PORTAL_USER", actor_ref="E001")

    def _actor():
        return run_actor()

    db = Db()
    result = await projects_router.remind_project_tasks(
        3,
        projects_router.ReminderTasksPayload(node_id="evaluation-1", task_ids=[11, 11, 12, 99]),
        context(),
        db,
    )

    assert result == {"accepted_task_ids": [11], "skipped_task_ids": [12, 99], "delivery_status": "recorded"}
    assert db.committed
    assert len(db.events) == 1
    assert db.events[0].event_type == "PERFORMANCE_TASK_REMINDER_REQUESTED"


def test_hrbp_scope_only_includes_selected_path_and_descendants():
    from app.performance.projects_router import _organization_in_scope

    assert _organization_in_scope("集团/研发/平台", ["集团/研发"])
    assert _organization_in_scope("集团/研发", ["集团/研发"])
    assert not _organization_in_scope("集团", ["集团/研发"])
    assert not _organization_in_scope("集团/运营/平台", ["集团/研发/平台"])
    assert not _organization_in_scope("平台", ["集团/研发/平台"])
