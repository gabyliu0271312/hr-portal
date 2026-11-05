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
        {"employee_no": "E001", "display_name": "张娜"},
        {"employee_no": "E999", "display_name": "E999"},
    ]


# ===== 全局 HRBP 不可见（运行时接入） =====

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
