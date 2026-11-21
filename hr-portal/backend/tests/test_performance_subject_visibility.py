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
from app.performance.member_columns_service import column_schema, normalize_column_keys


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


def test_column_schema_is_stable_and_filters_unknown_keys():
    schema = column_schema(
        [{"key": "rating:final", "label": "最终评级"}, {"key": "rating:360", "label": "360聚合", "is_360_aggregate": True}],
        ["department", "position_level"],
        [{"node_id": "evaluation-main", "name": "评价"}],
    )
    assert schema["locked_column_keys"] == ["name"]
    assert "rating:final" in schema["allowed_column_keys"]
    assert "rating:360" not in schema["allowed_column_keys"]
    assert "stage:evaluation-main" in schema["allowed_column_keys"]
    assert normalize_column_keys(["unknown", "department", "name", "department"], schema) == ["name", "department"]


def test_column_schema_accepts_pydantic_like_rating_objects():
    class Rating:
        key = "rating:score"
        label = "评分"

    schema = column_schema([Rating()], [], [])
    assert schema["columns"][1]["key"] == "rating:score"


def test_column_schema_rejects_review_scene_alias():
    with pytest.raises(ValueError, match="INVALID_MEMBER_COLUMN_SCENE"):
        column_schema([], [], [], "review")


@pytest.mark.asyncio
async def test_column_preferences_canonical_scope_owner_and_normalized_roundtrip(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import column_preferences_router as routes
    schema = column_schema([], ["department"])
    cycle = SimpleNamespace(id=7, cycle_ref="C7")
    class Db:
        def __init__(self):
            self.saved = None
            self.commits = 0
        async def scalar(self, query):
            if query.column_descriptions[0]["entity"] is routes.PerformanceCycle:
                return cycle if query.compile().params.get("cycle_ref_1") == "C7" else None
            return SimpleNamespace(column_keys=self.saved) if self.saved is not None else None
        async def get(self, model, key):
            assert model is routes.PerformanceCycle and key == 7
            return cycle
        async def execute(self, statement):
            params = statement.compile().params
            assert params["cycle_ref"] == "C7"
            assert params["owner_id"] == 42 and params["employee_ref"] == "E1"
            assert params["owner_type"] == "PORTAL_USER"
            self.saved = params["column_keys"]
        async def commit(self):
            self.commits += 1
        async def rollback(self):
            raise AssertionError("successful save must not rollback")
    actor = AsyncMock(return_value=SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E1"))
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", actor)
    monkeypatch.setattr(routes, "_schema_for", AsyncMock(return_value=schema))
    account = context(operator_user_id=42)
    db = Db()
    initial = await routes.get_column_preferences("7", "management", 3, None, "hrbp", account, db)
    assert initial.column_keys is None
    saved = await routes.put_column_preferences(routes.ColumnPreferencePatch(column_keys=["department", "unknown", "name", "department"]), "7", "management", 3, None, "hrbp", account, db)
    assert saved.column_keys == ["name", "department"] and db.commits == 1
    reopened = await routes.get_column_preferences("C7", "management", 3, None, "hrbp", account, db)
    assert reopened.column_keys == saved.column_keys
    assert actor.await_args.kwargs["cycle_ref"] == "C7"
    assert routes._owner(context(operator_user_id=43), SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E1")) != routes._owner(account, SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E1"))
    assert routes._owner(account, SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E2")) != routes._owner(account, SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E1"))


@pytest.mark.asyncio
async def test_column_preferences_deny_before_writing_and_validate_payload(monkeypatch):
    from pydantic import ValidationError
    from unittest.mock import AsyncMock
    from app.performance import column_preferences_router as routes
    monkeypatch.setattr(routes, "_canonical_cycle_ref", AsyncMock(return_value="C1"))
    monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(return_value=SimpleNamespace(actor_type="EMPLOYEE", actor_ref="E1")))
    monkeypatch.setattr(routes, "_schema_for", AsyncMock(side_effect=HTTPException(403, "PROJECT_DATA_FORBIDDEN")))
    with pytest.raises(HTTPException) as error:
        await routes.put_column_preferences(routes.ColumnPreferencePatch(column_keys=["name"]), "C1", "management", 3, None, None, context(), object())
    assert error.value.status_code == 403
    for payload in ({"column_keys": [1]}, {"column_keys": [""]}, {"column_keys": ["x"] * 129}, {"column_keys": [], "owner_id": 9}):
        with pytest.raises(ValidationError):
            routes.ColumnPreferencePatch.model_validate(payload)


def test_profile_displays_deepest_department_without_changing_organization_path():
    from app.performance.subject_visibility_service import subject_profile_items

    member = SimpleNamespace(company_org="集团", department="研发", department_2="平台", department_3="", department_4=None, department_5=None, organization_ref="集团/研发/平台")
    assert subject_profile_items(member, ["department"]) == [{"key": "department", "label": "部门", "value": "平台"}]
    assert member.organization_ref == "集团/研发/平台"


def test_profile_does_not_fallback_to_supervisor_employee_no_when_name_missing():
    from app.performance.subject_visibility_service import subject_profile_items

    member = SimpleNamespace(
        company_org="集团", department="研发", organization_ref="集团/研发",
        direct_supervisor_employee_no="M001",
    )
    assert subject_profile_items(member, ["direct_supervisor"], direct_supervisor_name=None) == []
