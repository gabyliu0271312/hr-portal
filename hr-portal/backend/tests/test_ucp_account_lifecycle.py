from app.ucp.account_lifecycle_service import LifecycleError, _map_fields, _matches_filter


def test_map_fields_supports_json_paths_and_defaults():
    payload = {"employee": {"id": "EMP-001", "name": "Ada"}}
    mapped = _map_fields(payload, {
        "employee_id": "$.employee.id",
        "employee_name": {"path": "employee.name"},
        "department": {"default": "HQ"},
    })
    assert mapped == {"employee_id": "EMP-001", "employee_name": "Ada", "department": "HQ"}


def test_filter_rule_matches_supported_operators():
    payload = {"employee": {"status": "OFFBOARD", "tags": ["finance"]}}
    assert _matches_filter(payload, {"path": "$.employee.status", "op": "eq", "value": "OFFBOARD"})
    assert _matches_filter(payload, {"path": "employee.tags", "op": "contains", "value": "finance"})
    assert not _matches_filter(payload, {"path": "employee.status", "op": "eq", "value": "ACTIVE"})


def test_lifecycle_error_exposes_machine_readable_code():
    error = LifecycleError("DELETE_GUARD_REQUIRED", "delete requires a guard")
    assert error.code == "DELETE_GUARD_REQUIRED"
    assert str(error) == "delete requires a guard"
