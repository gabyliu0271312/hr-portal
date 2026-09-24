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
