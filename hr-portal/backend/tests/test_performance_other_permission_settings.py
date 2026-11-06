from app.performance.other_permission_settings_router import (
    OtherPermissionPersonOut,
    OtherPermissionSettingsPatch,
    _selected_people,
)


def test_other_permission_patch_normalizes_and_deduplicates_people():
    payload = OtherPermissionSettingsPatch(
        hrbp_invisible_scope_enabled=True,
        hrbp_invisible_people=[" E001 ", "E001", "", "E002"],
    )

    assert payload.hrbp_invisible_people == ["E001", "E002"]


def test_other_permission_patch_normalizes_manager_reminder_node_types():
    payload = OtherPermissionSettingsPatch(
        manager_reminder_enabled=True,
        manager_reminder_node_types=["evaluation", "evaluation", "result_view"],
    )

    assert payload.manager_reminder_node_types == ["evaluation", "result_view"]

    try:
        OtherPermissionSettingsPatch(manager_reminder_node_types=["unknown"])
    except Exception as error:
        assert "可催办环节类型" in str(error)
    else:
        raise AssertionError("unknown node types must be rejected")


def test_other_permission_patch_rejects_unknown_fields():
    try:
        OtherPermissionSettingsPatch(
            hrbp_invisible_scope_enabled=False,
            unknown="value",
        )
    except Exception as error:
        assert "extra_forbidden" in str(error)
    else:
        raise AssertionError("unknown fields must be rejected")


def test_selected_people_uses_roster_names_and_keeps_missing_refs():
    selected = _selected_people(
        ["E001", "E999"],
        [OtherPermissionPersonOut(employee_no="E001", display_name="张娜")],
    )

    assert [person.model_dump() for person in selected] == [
        {"employee_no": "E001", "display_name": "张娜", "department": None},
        {"employee_no": "E999", "display_name": "E999", "department": None},
    ]


def test_hrbp_invisible_rules_validate_strict_contract_and_and_or_semantics():
    from app.performance.hrbp_scope_service import HrbpInvisibleRule, evaluate_hrbp_invisible_rules
    from types import SimpleNamespace

    people = [
        SimpleNamespace(employee_no="E1", organization_ref="公司/研发", direct_supervisor_employee_no="M1"),
        SimpleNamespace(employee_no="E2", organization_ref="公司/研发/平台", direct_supervisor_employee_no="M2"),
        SimpleNamespace(employee_no="E3", organization_ref="公司/销售", direct_supervisor_employee_no="M1"),
    ]
    rules = [
        {"conditions": [
            {"field": "department", "operator": "include", "values": ["公司/研发"]},
            {"field": "directLeader", "operator": "include", "values": ["M1"]},
        ]},
        {"conditions": [{"field": "employee", "operator": "include", "values": ["E3"]}]},
    ]
    assert evaluate_hrbp_invisible_rules(rules, people) == {"E1", "E3"}
    try:
        HrbpInvisibleRule.model_validate({"conditions": [{"field": "bad", "operator": "include", "values": ["E1"]}]})
    except Exception as error:
        assert "literal_error" in str(error)
    else:
        raise AssertionError("unknown rule field must be rejected")


def test_hrbp_legacy_rules_are_single_employee_group_and_not_permission_zero():
    from app.performance.hrbp_scope_service import legacy_invisible_rules, setting_invisible_rules
    from types import SimpleNamespace

    setting = SimpleNamespace(hrbp_invisible_rules=None, hrbp_invisible_people=["E1", "E2"], hrbp_permissions=[{"invisible_people": ["WRONG"]}])
    assert setting_invisible_rules(setting) == legacy_invisible_rules(["E1", "E2"])
    assert setting_invisible_rules(setting)[0]["conditions"][0]["values"] == ["E1", "E2"]


def test_scope_department_managers_matches_full_path_and_unique_name_only():
    from app.performance.hrbp_scope_service import scope_department_managers
    from types import SimpleNamespace

    people = [SimpleNamespace(employee_no="M1", display_name="张三"), SimpleNamespace(employee_no="M2", display_name="张三")]
    nodes = [
        SimpleNamespace(path="公司/研发", manager="M1", is_active=True),
        SimpleNamespace(path="公司/研发/平台", manager="张三", is_active=True),
        SimpleNamespace(path="研发", manager="M2", is_active=True),
    ]
    assert scope_department_managers(["公司/研发"], nodes, people) == {"M1"}

import pytest

from app.performance.models import PerformanceOtherPermissionSetting
from app.performance.projects_router import _global_hrbp_invisible_people


class _FakeSetting:
    def __init__(self, invisible_people):
        self.hrbp_invisible_people = invisible_people


class _FakeDb:
    def __init__(self, setting):
        self._setting = setting

    async def get(self, model, _id):
        assert model is PerformanceOtherPermissionSetting
        return self._setting


@pytest.mark.asyncio
async def test_global_hrbp_invisible_people_reads_singleton_setting():
    db = _FakeDb(_FakeSetting(["E001", " E002 ", "", "E001"]))
    assert await _global_hrbp_invisible_people(db) == {"E001", "E002"}


@pytest.mark.asyncio
async def test_global_hrbp_invisible_people_missing_setting_returns_empty():
    db = _FakeDb(None)
    assert await _global_hrbp_invisible_people(db) == set()


@pytest.mark.asyncio
async def test_person_hrbp_invisible_people_merges_global_and_per_hrbp():
    from app.performance.projects_router import _person_hrbp_invisible_people

    class _FakePermission:
        def __init__(self, invisible_people):
            self.invisible_people = invisible_people

    class _FakeDb2:
        def __init__(self, setting):
            self._setting = setting

        async def get(self, model, _id):
            assert model is PerformanceOtherPermissionSetting
            return self._setting

    async def _fake_permissions(db, actor_ref, cycle_ref):
        return [_FakePermission(["E003", "E004"])]

    import app.performance.projects_router as module
    original = module._person_hrbp_permissions
    module._person_hrbp_permissions = _fake_permissions
    try:
        db = _FakeDb2(_FakeSetting(["E001", "E002"]))
        result = await _person_hrbp_invisible_people(db, "HRBP1", "C1")
        assert result == {"E001", "E002", "E003", "E004"}
    finally:
        module._person_hrbp_permissions = original


from types import SimpleNamespace
from pydantic import ValidationError
from app.performance import hrbp_scope_service as scope_service
from app.performance import other_permission_settings_router as settings_router
from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people


def _condition(field="employee", operator="include", values=None):
    return {"field": field, "operator": operator, "values": values if values is not None else ["E1"]}


def _rules(*conditions):
    return [{"conditions": list(conditions)}]


@pytest.mark.parametrize("rules", [
    None,
    [{"conditions": []}],
    _rules(_condition(values=[])),
    _rules(_condition(values=[" "])),
    _rules(_condition(field="unknown")),
    _rules(_condition(operator="contains")),
    _rules({**_condition(), "extra": True}),
    [{"conditions": [_condition()], "extra": True}],
])
def test_invisible_rules_reject_invalid_contract(rules):
    with pytest.raises(ValidationError):
        OtherPermissionSettingsPatch(hrbp_invisible_rules=rules)


def _live_people():
    return build_snapshot_people([
        RosterAuthorizationInput("E1", "员工一", company_org="公司", department="研发", direct_supervisor_source_value="经理"),
        RosterAuthorizationInput("E2", "员工二", company_org="公司", department="研发", department_2="平台", direct_supervisor_source_value="M1"),
        RosterAuthorizationInput("E3", "员工三", company_org="其他公司", department="研发", direct_supervisor_source_value="同名"),
        RosterAuthorizationInput("M1", "经理", company_org="公司", department="研发"),
        RosterAuthorizationInput("M2", "同名", company_org="公司", department="研发", department_2="平台"),
        RosterAuthorizationInput("M3", "同名", company_org="其他公司", department="研发"),
    ])


def test_global_rules_exclude_and_department_hierarchy_without_leaf_guessing():
    rules = _rules(_condition("department", "include", ["公司/研发"]), _condition("employee", "exclude", ["M1", "M2"]))
    assert scope_service.evaluate_hrbp_invisible_rules(rules, _live_people()) == {"E1", "E2"}
    assert scope_service.evaluate_hrbp_invisible_rules(_rules(_condition("department", "include", ["研发"])), _live_people()) == set()
    assert scope_service.evaluate_hrbp_invisible_rules([], _live_people()) == set()
    assert scope_service.evaluate_hrbp_invisible_rules(_rules(_condition("department", "exclude", ["公司/研发"])), _live_people()) == {"E3", "M3"}


def test_global_rules_direct_leader_uses_stable_number_and_rejects_ambiguous_names():
    assert scope_service.evaluate_hrbp_invisible_rules(_rules(_condition("directLeader", "include", ["M1"])), _live_people()) == {"E1", "E2"}
    assert scope_service.evaluate_hrbp_invisible_rules(_rules(_condition("directLeader", "include", ["M2", "M3"])), _live_people()) == set()


@pytest.mark.asyncio
async def test_shared_runtime_reads_live_roster_on_each_call_and_explicit_clear(monkeypatch):
    setting = SimpleNamespace(hrbp_invisible_rules=_rules(_condition("directLeader", "include", ["M1"])), hrbp_invisible_people=["OLD"], hrbp_invisible_scope_enabled=False)
    db = _FakeDb(setting)
    people = list(_live_people())

    async def roster(_db):
        return people

    monkeypatch.setattr(scope_service, "load_hrbp_roster_people", roster)
    assert await scope_service.global_hrbp_invisible_people(db) == {"E1", "E2"}
    people[:] = build_snapshot_people([RosterAuthorizationInput("E1", "员工一", direct_supervisor_source_value="M2"), RosterAuthorizationInput("M2", "经理")])
    assert await scope_service.global_hrbp_invisible_people(db) == set()
    setting.hrbp_invisible_rules = []
    assert await scope_service.global_hrbp_invisible_people(db) == set()


@pytest.mark.asyncio
async def test_general_switch_hides_only_scope_level_manager_with_full_path(monkeypatch):
    setting = SimpleNamespace(hrbp_invisible_rules=[], hrbp_invisible_people=[], hrbp_invisible_scope_enabled=True)
    nodes = [
        SimpleNamespace(path="/公司/研发/", manager="经理", is_active=True),
        SimpleNamespace(path="/公司/研发/平台/", manager="M2", is_active=True),
        SimpleNamespace(path="/其他公司/研发/", manager="M3", is_active=True),
    ]

    class Db(_FakeDb):
        async def execute(self, statement):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: nodes))

    async def roster(_db):
        return _live_people()

    monkeypatch.setattr(scope_service, "load_hrbp_roster_people", roster)
    db = Db(setting)
    assert await scope_service.global_hrbp_invisible_people(db, scopes=["公司/研发"]) == {"M1"}
    assert await scope_service.global_hrbp_invisible_people(db, scopes=["研发"]) == set()
    setting.hrbp_invisible_scope_enabled = False
    assert await scope_service.global_hrbp_invisible_people(db, scopes=["公司/研发"]) == set()


@pytest.mark.asyncio
async def test_runtime_database_errors_are_not_treated_as_empty_configuration():
    class Db:
        async def get(self, *args):
            raise AttributeError("broken database session")

    with pytest.raises(AttributeError, match="broken database session"):
        await scope_service.global_hrbp_invisible_people(Db())


def _settings_context(allowed=True):
    from app.performance.auth_context import PerformanceAccessContext
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT", subject_id=1, display_name="管理员", account_type="PERFORMANCE_ADMIN",
        portal_entry_permissions=("performance.admin",), role_grants=(),
        permission_codes=("performance.configuration.manage",) if allowed else (),
    )


class _MemorySettingsDb:
    def __init__(self):
        self.setting = PerformanceOtherPermissionSetting(
            id=1, hrbp_invisible_scope_enabled=False, hrbp_invisible_people=["E1"], hrbp_invisible_rules=None,
            hrbp_permissions=[{"hrbp": "M1", "scope": ["公司/研发"], "invisible_people": ["E2"]}],
            manager_reminder_enabled=True, manager_reminder_node_types=["evaluation"],
        )
        self.audit = []
        self.commits = 0

    async def get(self, model, _id):
        return self.setting

    def add(self, row):
        self.audit.append(row)

    async def commit(self):
        self.commits += 1

    async def refresh(self, row):
        pass


def _settings_client(db, allowed=True):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.performance.auth_context import get_performance_access_context
    from app.core.db import get_session
    app = FastAPI()
    app.include_router(settings_router.router)
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_performance_access_context] = lambda: _settings_context(allowed)
    return TestClient(app)


@pytest.fixture
def settings_options(monkeypatch):
    async def options(_db):
        return [OtherPermissionPersonOut(employee_no=ref, display_name=name, department="研发") for ref, name in [("E1", "员工一"), ("E2", "员工二"), ("M1", "经理")]], []
    monkeypatch.setattr(settings_router, "_load_options", options)


def test_settings_api_reopen_clear_legacy_patch_and_permission_zero_independence(settings_options):
    db = _MemorySettingsDb()
    client = _settings_client(db)
    path = "/performance/permission-settings/other"
    initial = client.get(path)
    assert initial.status_code == 200
    assert initial.json()["hrbp_invisible_rules"] == _rules(_condition(values=["E1"]))
    assert initial.json()["hrbp_invisible_people"][0]["employee_no"] == "E1"
    assert initial.json()["hrbp_invisible_people"][0]["department"] == "研发"
    rules = _rules(_condition("department", "exclude", ["公司/研发"]))
    updated = client.patch(path, json={"hrbp_invisible_rules": rules})
    assert updated.status_code == 200
    assert updated.json()["hrbp_invisible_people"] == []
    assert client.get(path).json()["hrbp_invisible_rules"] == rules
    assert db.audit[-1].before_state["hrbp_invisible_rules"] == _rules(_condition(values=["E1"]))
    assert db.audit[-1].after_state["hrbp_invisible_rules"] == rules
    assert client.patch(path, json={"hrbp_permissions": []}).json()["hrbp_invisible_rules"] == rules
    assert client.patch(path, json={"hrbp_invisible_people": ["E2"]}).json()["hrbp_invisible_rules"] == _rules(_condition(values=["E2"]))
    assert client.patch(path, json={"hrbp_invisible_rules": []}).json()["hrbp_invisible_rules"] == []
    assert client.get(path).json()["hrbp_invisible_rules"] == []
    assert client.patch(path, json={"manager_reminder_enabled": False}).json()["hrbp_invisible_rules"] == []


def test_settings_api_permission_gate_rejects_get_and_patch():
    db = _MemorySettingsDb()
    client = _settings_client(db, allowed=False)
    assert client.get("/performance/permission-settings/other").status_code == 403
    assert client.patch("/performance/permission-settings/other", json={"hrbp_invisible_rules": []}).status_code == 403
    assert db.commits == 0


@pytest.mark.asyncio
async def test_selected_people_options_keep_inactive_people_and_departments(monkeypatch, settings_options):
    db = _MemorySettingsDb()
    db.setting.hrbp_invisible_rules = _rules(_condition(values=["LEFT"]))

    async def roster(_db):
        return build_snapshot_people([RosterAuthorizationInput("LEFT", "离职人员", department="原部门")])

    monkeypatch.setattr(settings_router, "load_hrbp_roster_people", roster)
    response = await settings_router._response(db.setting, db)
    assert next(person for person in response.people_options if person.employee_no == "LEFT").model_dump() == {
        "employee_no": "LEFT", "display_name": "离职人员", "department": "原部门",
    }


@pytest.mark.asyncio
async def test_options_failure_is_not_empty_success(monkeypatch):
    async def fail(_db):
        raise RuntimeError("roster unavailable")
    monkeypatch.setattr(settings_router, "_load_hrbp_options", fail)
    with pytest.raises(RuntimeError, match="roster unavailable"):
        await settings_router._load_options(object())


@pytest.mark.asyncio
async def test_navigation_global_rules_remove_hrbp_management_but_keep_own_task_and_admin(monkeypatch):
    from dataclasses import replace
    from datetime import date
    from app.performance import navigation_service as navigation
    from app.performance.models import (
        PerformanceAuthorizationSnapshotPerson, PerformanceCycle, PerformanceHrbpPermission,
        PerformanceNodeTask, PerformanceProject, PerformanceProjectMember,
        PerformanceProjectNodeSnapshot, PerformanceRole,
    )
    setting = SimpleNamespace(hrbp_invisible_rules=_rules(_condition(values=["E1"])), hrbp_invisible_people=[], hrbp_invisible_scope_enabled=False)
    project = SimpleNamespace(id=1, project_ref="P1", cycle_ref="C1", name="项目", status="STARTED", settings={}, administrators=[])
    person = SimpleNamespace(employee_no="HR1", display_name="HR", portal_user_id=1)
    cycle = SimpleNamespace(id=1, cycle_ref="C1", name="周期", start_at=date(2026, 1, 1), end_at=date(2026, 12, 31))
    node = SimpleNamespace(id=10, project_id=1, node_id="summary", node_type="work_summary", config={})
    task = SimpleNamespace(id=20, project_id=1, cycle_ref="C1", node_snapshot_id=10, handler_ref="HR1", status="pending", revoked_at=None)
    roles = [SimpleNamespace(code=code, is_active=True, is_system=True, role_type=kind, function_permission_keys=["performance.frontend.data-view"]) for code, kind in [
        ("performance.hrbp", "MANAGEMENT"), ("performance.project_admin", "MANAGEMENT"), ("assessment.reviewee", "ASSESSMENT"),
    ]]
    permissions = [SimpleNamespace(cycle_ref="C1", hrbp_employee_no="HR1", scope=["公司/研发"], invisible_people=[])]
    member_rows = [(SimpleNamespace(employee_no="E1", organization_ref="公司/研发"), SimpleNamespace(id=1, project_id=1))]
    values = {
        PerformanceAuthorizationSnapshotPerson: [(person, SimpleNamespace(cycle_ref="C1"))],
        PerformanceCycle: [cycle], PerformanceProject: [project], PerformanceProjectMember: member_rows,
        PerformanceProjectNodeSnapshot: [node], PerformanceNodeTask: [task], PerformanceRole: roles,
        PerformanceHrbpPermission: permissions,
    }

    class Db:
        async def get(self, model, identity):
            assert model is PerformanceOtherPermissionSetting
            return setting

        async def execute(self, query):
            items = values[query.column_descriptions[0]["entity"]]
            return SimpleNamespace(all=lambda: items, scalars=lambda: SimpleNamespace(all=lambda: items))

    async def roster(_db):
        return build_snapshot_people([RosterAuthorizationInput("E1", "员工一")])

    monkeypatch.setattr(scope_service, "load_hrbp_roster_people", roster)
    context = replace(_settings_context(), subject_type="PORTAL_USER", effective_employee_no="HR1")
    access = await navigation.resolve_frontend_access(Db(), context)
    assert access.manage_projects == []
    assert access.own_task_project_ids == {1}
    assert access.task_ids_by_project == {1: {20}}
    assert [item.id for item, _cycle in access.review_projects] == [1]
    setting.hrbp_invisible_rules = []
    assert (await navigation.resolve_frontend_access(Db(), context)).management_scopes == {1: {"E1"}}
    setting.hrbp_invisible_rules = _rules(_condition(values=["E1"]))
    project.administrators = ["HR"]
    assert (await navigation.resolve_frontend_access(Db(), context)).management_scopes == {1: None}


@pytest.mark.asyncio
async def test_load_live_roster_uses_authoritative_columns_and_resolves_manager(monkeypatch):
    from sqlalchemy import Column, MetaData, Table, Text
    from app.data.employee_roster_contract import ORGANIZATION_FIELDS
    table = Table("emp_realtime_roster", MetaData(), *[Column(name, Text) for name in ("employee_no", "full_name", "direct_supervisor", *ORGANIZATION_FIELDS)])
    monkeypatch.setattr(scope_service, "employee_roster_table", lambda: table)
    rows = [
        {"employee_no": "E1", "display_name": "员工", "direct_supervisor": "经理", **{field: None for field in ORGANIZATION_FIELDS}, "company_org": "公司", "department": "研发"},
        {"employee_no": "M1", "display_name": "经理", "direct_supervisor": None, **{field: None for field in ORGANIZATION_FIELDS}},
    ]

    class Db:
        async def execute(self, query):
            assert "emp_realtime_roster.full_name AS display_name" in str(query)
            assert "emp_realtime_roster.direct_supervisor" in str(query)
            return SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: rows))

    people = await scope_service.load_hrbp_roster_people(Db())
    employee = next(person for person in people if person.employee_no == "E1")
    assert employee.organization_ref == "公司/研发"
    assert employee.direct_supervisor_employee_no == "M1"


def test_hrbp_rules_migration_preserves_nullable_legacy_state_and_single_head():
    from pathlib import Path
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    column = PerformanceOtherPermissionSetting.__table__.c.hrbp_invisible_rules
    assert column.nullable is True
    assert column.type.none_as_null is True
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    script = ScriptDirectory.from_config(config)
    assert script.get_heads() == ["0295_pm_hrbp_invisible_rules"]
    assert script.get_revision("0295_pm_hrbp_invisible_rules").down_revision == "0294_pm_person_info_guard"


def test_department_manager_missing_or_ambiguous_reference_is_not_guessed():
    nodes = [SimpleNamespace(path="/公司/研发/", manager="同名", is_active=True)]
    assert scope_service.scope_department_managers(["公司/研发"], nodes, _live_people()) == set()
    nodes[0].manager = None
    assert scope_service.scope_department_managers(["公司/研发"], nodes, _live_people()) == set()
    nodes[0].manager = "M2"
    assert scope_service.scope_department_managers(["公司/研发"], nodes, _live_people()) == {"M2"}
