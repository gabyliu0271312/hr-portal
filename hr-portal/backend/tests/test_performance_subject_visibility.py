from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.db import get_session
from app.performance import subject_visibility_router
from app.performance.auth_context import PerformanceAccessContext
from app.performance.subject_visibility_router import SubjectVisibilityPatch
from app.performance.subject_visibility_service import (
    DEFAULT_SUBJECT_VISIBILITY_RULES,
    mask_profile_values,
    normalize_subject_visibility_rules,
    resolve_subject_visibility_role,
)


class EmptyDb:
    async def get(self, *_args):
        return None


def context(**overrides) -> PerformanceAccessContext:
    values = {
        "subject_type": "SYSTEM_ACCOUNT",
        "subject_id": 1,
        "display_name": "绩效管理员",
        "account_type": "PERFORMANCE_SUPER_ADMIN",
        "portal_entry_permissions": ("performance.admin",),
        "role_grants": (),
        "permission_codes": ("performance.configuration.manage",),
    }
    values.update(overrides)
    return PerformanceAccessContext(**values)


def client(*, allowed: bool) -> TestClient:
    app = FastAPI()
    app.include_router(subject_visibility_router.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: EmptyDb()
    if allowed:
        app.dependency_overrides[subject_visibility_router._context] = lambda: context()
    else:
        async def deny():
            raise HTTPException(status_code=403, detail="forbidden")
        app.dependency_overrides[subject_visibility_router._context] = deny
    return TestClient(app)


def test_subject_visibility_get_returns_captured_defaults_and_pagination():
    response = client(allowed=True).get("/api/v1/performance/permission-settings/subject-visibility?page=1&page_size=10")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 10
    assert [item["role_key"] for item in payload["items"]] == list(DEFAULT_SUBJECT_VISIBILITY_RULES)
    assert payload["items"][0]["visible_fields"] == ["department", "position_level", "job_sequence"]
    assert payload["items"][8]["visible_fields"][-1] == "employee_type"
    assert [field["label"] for field in payload["field_options"]] == ["部门", "职级", "序列", "直属上级", "入职日期", "人员类型"]


def test_subject_visibility_endpoints_require_configuration_permission():
    api = client(allowed=False)

    assert api.get("/api/v1/performance/permission-settings/subject-visibility").status_code == 403
    assert api.patch(
        "/api/v1/performance/permission-settings/subject-visibility/reviewee",
        json={"visible_fields": ["department"]},
    ).status_code == 403


def test_subject_visibility_patch_rejects_unknown_fields_and_deduplicates():
    payload = SubjectVisibilityPatch(visible_fields=["department", "department", "position_level"])
    assert payload.visible_fields == ["department", "position_level"]

    with pytest.raises(ValueError):
        SubjectVisibilityPatch(visible_fields=["salary"])
    with pytest.raises(ValueError):
        SubjectVisibilityPatch(visible_fields=[], unknown=True)


def test_subject_visibility_rule_normalization_preserves_explicit_empty_role():
    rules = normalize_subject_visibility_rules({"reviewee": [], "leader": ["department", "salary", "department"]})

    assert rules["reviewee"] == []
    assert rules["leader"] == ["department"]
    assert rules["other"] == DEFAULT_SUBJECT_VISIBILITY_RULES["other"]


def test_mask_profile_values_removes_hidden_data_before_serialization():
    values = {
        "department": "研发中心",
        "position_level": "P6",
        "job_sequence": "技术-研发",
        "direct_supervisor": "E001",
        "hire_date": "2020-01-01",
        "employee_type": "正式员工",
    }

    masked = mask_profile_values(values, ["department", "employee_type"])

    assert masked["department"] == "研发中心"
    assert masked["employee_type"] == "正式员工"
    assert all(masked[key] is None for key in ("position_level", "job_sequence", "direct_supervisor", "hire_date"))


@pytest.mark.asyncio
async def test_role_resolution_prefers_subject_and_direct_manager_without_database_lookup():
    class Db:
        async def scalar(self, *_args):
            raise AssertionError("relationship roles should not query HRBP")

    member = SimpleNamespace(employee_no="E001", direct_supervisor_employee_no="M001", dotted_manager_employee_no=None)
    node = SimpleNamespace(node_type="evaluation", config={"template": {"executor_label": "实线上级"}})
    project = SimpleNamespace(cycle_ref="C1", administrators=[])

    assert await resolve_subject_visibility_role(Db(), context(), "E001", member, node, project) == "reviewee"
    assert await resolve_subject_visibility_role(Db(), context(), "M001", member, node, project) == "leader"


@pytest.mark.asyncio
async def test_subject_visibility_patch_persists_and_writes_audit(monkeypatch):
    from app.performance import subject_visibility_router as router_module
    from app.performance.models import PerformanceAuditEvent, PerformanceSubjectVisibilitySetting

    class Db:
        def __init__(self):
            self.setting = None
            self.added = []
            self.commits = 0

        async def get(self, model, _identity):
            return self.setting if model is PerformanceSubjectVisibilitySetting else None

        def add(self, value):
            self.added.append(value)
            if isinstance(value, PerformanceSubjectVisibilitySetting):
                self.setting = value

        async def flush(self):
            pass

        async def commit(self):
            self.commits += 1

        async def refresh(self, _value):
            pass

    async def actor(_db, _context):
        return SimpleNamespace(actor_type="SYSTEM_ACCOUNT", actor_ref="1")

    monkeypatch.setattr(router_module, "resolve_trusted_performance_actor", actor)
    db = Db()
    result = await router_module.update_subject_visibility_setting(
        "reviewee",
        SubjectVisibilityPatch(visible_fields=["department"]),
        context(),
        db,
    )

    assert result.visible_fields == ["department"]
    assert db.setting.rules["reviewee"] == ["department"]
    assert db.commits == 1
    assert any(isinstance(value, PerformanceAuditEvent) for value in db.added)


def test_profile_displays_deepest_department_without_changing_organization_path():
    from app.performance.subject_visibility_service import subject_profile_items

    member = SimpleNamespace(company_org="集团", department="研发", department_2="平台", department_3="", department_4=None, department_5=None, organization_ref="集团/研发/平台")
    assert subject_profile_items(member, ["department"]) == [{"key": "department", "label": "部门", "value": "平台"}]
    assert member.organization_ref == "集团/研发/平台"
