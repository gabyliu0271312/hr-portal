from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from pydantic import TypeAdapter, ValidationError

import app.ai.actions as actions
from app.ai.actions import ControlledActionRequest, issue_controlled_action
from app.ai.employee_profile_actions import (
    EMPLOYEE_PROFILE_SELECT_CANDIDATE_ACTION,
    register_employee_profile_controlled_actions,
)
from app.ai.employee_profile_schemas import (
    CANDIDATE_DISPLAY_FIELD_LABELS,
    DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES,
    EMPLOYEE_PROFILE_FIELD_LABELS,
    CandidateDisplayField,
    EmployeeProfileCandidateItem,
    EmployeeProfileCandidatesData,
    EmployeeProfileField,
    EmployeeProfileInputData,
    EmployeeProfileQuerySpec,
    EmployeeProfileResultData,
    effective_requested_fields,
)
from app.ai.router import CapabilityResult


class FakeDb:
    def __init__(self):
        self.action = None

    def add(self, action):
        self.action = action

    async def flush(self):
        return None


def test_query_schema_uses_explicit_or_fixed_default_requested_fields():
    default_spec = EmployeeProfileQuerySpec(lookup_type="name", lookup_value="Alice")
    explicit_spec = EmployeeProfileQuerySpec(
        lookup_type="employee_no",
        lookup_value="E-1001",
        requested_field_codes=["organization_name", "hire_date"],
    )

    assert effective_requested_fields(default_spec) == DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES
    assert tuple(code.value for code in effective_requested_fields(explicit_spec)) == (
        "organization_name",
        "hire_date",
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"lookup_type": "employee_name", "lookup_value": "Alice"},
        {"lookup_type": "name", "lookup_value": "Alice", "requested_field_codes": ["SELECT"]},
        {"lookup_type": "name", "lookup_value": "Alice", "scope": {"org": "platform"}},
        {"lookup_type": "name", "lookup_value": "Alice", "requested_field_codes": ["full_name"] * 8},
        {"lookup_type": "name", "lookup_value": "select Alice"},
        {"lookup_type": "name", "lookup_value": "Alice", "employee_id": 1},
    ],
)
def test_query_schema_rejects_non_contract_input(payload: dict[str, Any]):
    with pytest.raises(ValidationError):
        EmployeeProfileQuerySpec.model_validate(payload)


def test_result_data_and_candidate_data_are_strict_and_typed():
    name_label = EMPLOYEE_PROFILE_FIELD_LABELS["full_name"]
    organization_label = CANDIDATE_DISPLAY_FIELD_LABELS["organization_name"]
    result = EmployeeProfileResultData(
        fields=[{"code": "full_name", "label": name_label, "value": "Alice"}]
    )
    candidates = EmployeeProfileCandidatesData(
        candidates=[
            EmployeeProfileCandidateItem(
                selection_handle="a" * 32,
                display_fields=[{"code": "full_name", "label": name_label, "value": "Alice"}],
            ),
            EmployeeProfileCandidateItem(
                selection_handle="b" * 32,
                display_fields=[
                    {"code": "organization_name", "label": organization_label, "value": "Platform"}
                ],
            ),
        ]
    )

    adapter = TypeAdapter(CapabilityResult)
    assert adapter.validate_python({"type": "employee_profile_result", "data": result}).data == result
    assert adapter.validate_python({"type": "employee_profile_candidates", "data": candidates}).data == candidates
    assert adapter.validate_python(
        {"type": "employee_profile_input", "data": EmployeeProfileInputData(missing_fields=["lookup_value"])}
    ).data.missing_fields == ["lookup_value"]

    with pytest.raises(ValidationError):
        CandidateDisplayField(code="employee_name", label=name_label, value="")
    with pytest.raises(ValidationError):
        CandidateDisplayField(code="employee_no", label="employee_no", value="E-1001")
    assert EmployeeProfileField(code="department", label="Department", value="Platform").code == "department"
    with pytest.raises(ValidationError):
        EmployeeProfileField(code="Legacy-Code", label="legacy", value="Alice")
    with pytest.raises(ValidationError):
        EmployeeProfileCandidateItem(
            selection_handle="employee-1",
            display_fields=[{"code": "full_name", "label": name_label, "value": "Alice"}],
        )
    with pytest.raises(ValidationError):
        adapter.validate_python(
            {"type": "employee_profile_result", "data": {"fields": [], "employee_id": 1}}
        )


def test_openapi_exposes_employee_results_only_inside_the_existing_chat_envelope():
    from app.main import app

    openapi = app.openapi()
    chat_response = openapi["paths"]["/api/v1/ai/chat"]["post"]["responses"]["200"]
    assert chat_response["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/AiChatOut"}

    chat_properties = openapi["components"]["schemas"]["AiChatOut"]["properties"]
    assert set(chat_properties) == {
        "intent",
        "answer",
        "status",
        "capability_id",
        "result",
        "permission",
        "masking",
        "trace_id",
        "conversation_id",
    }
    mapping = chat_properties["result"]["discriminator"]["mapping"]
    assert {"employee_profile_input", "employee_profile_result", "employee_profile_candidates"} <= set(mapping)

    candidate_schema = openapi["components"]["schemas"]["EmployeeProfileCandidateItem"]
    assert set(candidate_schema["properties"]) == {"selection_handle", "display_fields"}
    assert "employee_id" not in candidate_schema["properties"]


@pytest.mark.asyncio
async def test_candidate_action_context_expands_default_or_explicit_fields_and_rejects_client_override(
    monkeypatch,
):
    monkeypatch.setattr(actions, "_CONTROLLED_ACTIONS", {})
    register_employee_profile_controlled_actions()
    db = FakeDb()
    default_spec = EmployeeProfileQuerySpec(lookup_type="name", lookup_value="Alice")
    explicit_spec = EmployeeProfileQuerySpec(
        lookup_type="name", lookup_value="Alice", requested_field_codes=["hire_date"]
    )

    default_action = await issue_controlled_action(
        db,
        action_type=EMPLOYEE_PROFILE_SELECT_CANDIDATE_ACTION,
        conversation_id=1,
        user_id=2,
        channel="web",
        action_context={
            "employee_id": 3,
            "effective_requested_field_codes": effective_requested_fields(default_spec),
        },
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    assert default_action.selection_handle
    assert db.action.action_context == {
        "employee_id": 3,
        "effective_requested_field_codes": [code.value for code in DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES],
    }

    explicit_action = await issue_controlled_action(
        db,
        action_type=EMPLOYEE_PROFILE_SELECT_CANDIDATE_ACTION,
        conversation_id=1,
        user_id=2,
        channel="web",
        action_context={
            "employee_id": 3,
            "effective_requested_field_codes": effective_requested_fields(explicit_spec),
        },
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    assert explicit_action.selection_handle
    assert db.action.action_context["effective_requested_field_codes"] == ["hire_date"]

    with pytest.raises(ValidationError):
        ControlledActionRequest.model_validate(
            {
                "action_type": EMPLOYEE_PROFILE_SELECT_CANDIDATE_ACTION,
                "selection_handle": "x" * 32,
                "effective_requested_field_codes": ["base_salary"],
            }
        )
