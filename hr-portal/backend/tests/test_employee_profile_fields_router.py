from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.ai import employee_profile_fields_router as router
from app.ai.employee_profile_catalog import EmployeeProfileCatalogItem


def _field(column_name: str, *, default: bool, order: int | None, version: int | None = None):
    return router.FieldConfigInput(column_name=column_name, field_code=column_name, display_name=column_name, is_default_card=default, default_display_order=order, append_display_order=10, version=version)


def test_queryable_capability_defaults_to_disabled():
    payload = router.FieldConfigUpdate(fields=[_field("field_1", default=False, order=None)])
    assert payload.fields[0].is_queryable is False


@pytest.mark.asyncio
async def test_update_rejects_stale_version(monkeypatch):
    fields = [_field(f"field_{index}", default=True, order=index, version=1) for index in range(1, 6)]
    async def catalog(_db): return tuple(EmployeeProfileCatalogItem(field.column_name, field.column_name, field.display_name, "string", field.is_default_card, field.default_display_order, 10) for field in fields)
    async def settings(_db): return {"field_1": SimpleNamespace(version=2)}
    monkeypatch.setattr(router, "load_employee_profile_catalog", catalog)
    monkeypatch.setattr(router, "_settings", settings)
    async def category_names(*_): return {}
    monkeypatch.setattr(router, "_visible_sensitive_category_names", category_names)
    with pytest.raises(HTTPException) as error:
        await router.update_fields(router.FieldConfigUpdate(fields=fields), user=SimpleNamespace(id=7), db=SimpleNamespace())
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_update_persists_complete_catalog_with_versions(monkeypatch):
    fields = [_field(f"field_{index}", default=True, order=index, version=None) for index in range(1, 6)]
    catalog_items = tuple(EmployeeProfileCatalogItem(field.column_name, field.column_name, field.display_name, "string", field.is_default_card, field.default_display_order, 10) for field in fields)
    saved = []
    class Db:
        def add(self, row): saved.append(row)
        async def commit(self): pass
    async def catalog(_db): return catalog_items
    async def settings(_db): return {}
    async def response(_db, _categories): return fields
    monkeypatch.setattr(router, "load_employee_profile_catalog", catalog)
    monkeypatch.setattr(router, "_settings", settings)
    async def category_names(*_): return {}
    monkeypatch.setattr(router, "_visible_sensitive_category_names", category_names)
    monkeypatch.setattr(router, "_response", response)
    result = await router.update_fields(router.FieldConfigUpdate(fields=fields), user=SimpleNamespace(id=7), db=Db())
    assert result == fields
    assert len(saved) == 5 and all(row.version == 1 and row.created_by == 7 for row in saved)


@pytest.mark.asyncio
async def test_response_includes_visible_sensitive_category_summary(monkeypatch):
    item = EmployeeProfileCatalogItem("base_salary", "base_salary", "基本工资", "number", True, 1, 10)
    async def catalog(_db): return (item,)
    async def settings(_db): return {}
    monkeypatch.setattr(router, "load_employee_profile_catalog", catalog)
    monkeypatch.setattr(router, "_settings", settings)
    result = await router._response(SimpleNamespace(), {"base_salary": ["薪酬"]})
    assert result[0].sensitive_category_names == ["薪酬"]


@pytest.mark.asyncio
async def test_sensitive_category_summary_is_hidden_without_metadata_permission(monkeypatch):
    async def has_permission(*_): return False
    monkeypatch.setattr(router, "user_has_op", has_permission)
    assert await router._visible_sensitive_category_names(SimpleNamespace(), SimpleNamespace()) == {}


@pytest.mark.asyncio
async def test_governance_issues_cover_names_high_risk_fields_and_role_grants(monkeypatch):
    catalog_items = (
        EmployeeProfileCatalogItem("mobile_phone", "mobile_phone", "手机号", "string", False, None, 10),
        EmployeeProfileCatalogItem("base_salary", "base_salary", "基本工资", "number", False, None, 20),
    )
    async def catalog(_db): return catalog_items
    async def settings(_db): return {"base_salary": SimpleNamespace(display_name="基本工资")}
    async def categories(_db): return {1: ("薪酬", {"base_salary"})}
    async def grants(_db, _category_ids): return set()
    monkeypatch.setattr(router, "load_employee_profile_catalog", catalog)
    monkeypatch.setattr(router, "_settings", settings)
    monkeypatch.setattr(router, "_sensitive_category_assignments", categories)
    monkeypatch.setattr(router, "_categories_with_role_grants", grants)
    codes = {issue.code for issue in await router._governance_issues(SimpleNamespace())}
    assert codes == {"missing_display_name", "unclassified_high_risk_field", "sensitive_category_without_role"}


@pytest.mark.asyncio
async def test_governance_omits_role_warning_for_authorized_sensitive_category(monkeypatch):
    item = EmployeeProfileCatalogItem("base_salary", "base_salary", "基本工资", "number", False, None, 10)
    async def catalog(_db): return (item,)
    async def settings(_db): return {"base_salary": SimpleNamespace(display_name="基本工资")}
    async def categories(_db): return {1: ("薪酬", {"base_salary"})}
    async def grants(_db, _category_ids): return {1}
    monkeypatch.setattr(router, "load_employee_profile_catalog", catalog)
    monkeypatch.setattr(router, "_settings", settings)
    monkeypatch.setattr(router, "_sensitive_category_assignments", categories)
    monkeypatch.setattr(router, "_categories_with_role_grants", grants)
    assert await router._governance_issues(SimpleNamespace()) == []


@pytest.mark.asyncio
async def test_governance_check_crops_category_metadata_and_audits_counts(monkeypatch):
    recorded = []
    async def has_permission(*_): return False
    async def issues(_db):
        return [
            router.GovernanceIssue(code="missing_display_name", message="未命名", column_name="mobile_phone"),
            router.GovernanceIssue(code="sensitive_category_without_role", message="未授权", category_name="薪酬"),
        ]
    async def audit(**kwargs): recorded.append(kwargs)
    class Db:
        async def commit(self): pass
    monkeypatch.setattr(router, "user_has_op", has_permission)
    monkeypatch.setattr(router, "_governance_issues", issues)
    monkeypatch.setattr(router, "record_ai_log", audit)
    result = await router.governance_check(user=SimpleNamespace(id=7), db=Db())
    assert [issue.code for issue in result.issues] == ["missing_display_name"]
    assert recorded[0]["output_payload"] == {"warning_count": 1}
    assert recorded[0]["metadata"]["issue_counts"] == {"missing_display_name": 1}


@pytest.mark.asyncio
async def test_governance_check_requires_field_management_view_permission():
    route = next(item for item in router.router.routes if item.path == "/admin/employee-profile-fields/governance-check")
    permission_dependency = route.dependant.dependencies[0].call
    class Db:
        async def execute(self, _statement): return SimpleNamespace(first=lambda: None)
    with pytest.raises(HTTPException) as error:
        await permission_dependency(user=SimpleNamespace(id=7), db=Db())
    assert error.value.status_code == 403
