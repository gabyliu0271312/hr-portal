"""Strict schemas for the employee-profile AI capability."""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.ai.actions import ControlledActionContext


class EmployeeProfileFieldCode(str, Enum):
    FULL_NAME = "full_name"
    EMPLOYEE_NO = "employee_no"
    BUSINESS_UNIT = "business_unit"
    ORGANIZATION_NAME = "organization_name"
    POSITION_NAME = "position_name"
    STANDARD_POSITION = "standard_position"
    POSITION_LEVEL = "position_level"
    EMPLOYEE_TYPE = "employee_type"
    EMPLOYMENT_STATUS = "employment_status"
    HIRE_DATE = "hire_date"


EMPLOYEE_PROFILE_FIELD_LABELS: dict[EmployeeProfileFieldCode, str] = {
    EmployeeProfileFieldCode.FULL_NAME: "\u59d3\u540d",
    EmployeeProfileFieldCode.EMPLOYEE_NO: "\u5de5\u53f7",
    EmployeeProfileFieldCode.BUSINESS_UNIT: "BU",
    EmployeeProfileFieldCode.ORGANIZATION_NAME: "\u6240\u5c5e\u7ec4\u7ec7",
    EmployeeProfileFieldCode.POSITION_NAME: "\u5c97\u4f4d",
    EmployeeProfileFieldCode.STANDARD_POSITION: "\u6807\u51c6\u804c\u4f4d",
    EmployeeProfileFieldCode.POSITION_LEVEL: "\u5c97\u4f4d\u5c42\u7ea7",
    EmployeeProfileFieldCode.EMPLOYEE_TYPE: "\u5458\u5de5\u7c7b\u578b",
    EmployeeProfileFieldCode.EMPLOYMENT_STATUS: "\u5728\u804c\u72b6\u6001",
    EmployeeProfileFieldCode.HIRE_DATE: "\u5165\u804c\u65e5\u671f",
}

DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES: tuple[EmployeeProfileFieldCode, ...] = (
    EmployeeProfileFieldCode.FULL_NAME,
    EmployeeProfileFieldCode.EMPLOYEE_NO,
    EmployeeProfileFieldCode.ORGANIZATION_NAME,
    EmployeeProfileFieldCode.HIRE_DATE,
    EmployeeProfileFieldCode.EMPLOYEE_TYPE,
    EmployeeProfileFieldCode.STANDARD_POSITION,
    EmployeeProfileFieldCode.POSITION_LEVEL,
)


class EmployeeProfileQuerySpec(BaseModel):
    """Extractor-only query contract; it deliberately has no scope or SQL inputs."""

    model_config = ConfigDict(extra="forbid")

    lookup_type: Literal["name", "employee_no"]
    lookup_value: str = Field(min_length=1, max_length=64)
    requested_field_codes: list[EmployeeProfileFieldCode] = Field(default_factory=list, max_length=10)

    @field_validator("lookup_value")
    @classmethod
    def _validate_lookup_value(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("lookup_value must not be blank")
        lowered = normalized.casefold()
        if any(keyword in lowered for keyword in ("select", "insert", "update", "delete", "union", "drop")):
            raise ValueError("lookup_value contains unsupported query syntax")
        if any(character in normalized for character in (";", "'", '"', "\\", "\n", "\r")):
            raise ValueError("lookup_value contains unsupported characters")
        return normalized

    @field_validator("requested_field_codes")
    @classmethod
    def _validate_requested_field_codes(
        cls, value: list[EmployeeProfileFieldCode]
    ) -> list[EmployeeProfileFieldCode]:
        if len(set(value)) != len(value):
            raise ValueError("requested_field_codes must not contain duplicates")
        return value


def effective_requested_fields(
    query_spec: EmployeeProfileQuerySpec,
) -> tuple[EmployeeProfileFieldCode, ...]:
    if query_spec.requested_field_codes:
        return tuple(query_spec.requested_field_codes)
    return DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES


class EmployeeProfileField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: EmployeeProfileFieldCode
    label: str = Field(min_length=1, max_length=32)
    value: str

    @model_validator(mode="after")
    def _ensure_fixed_label(self) -> "EmployeeProfileField":
        if self.label != EMPLOYEE_PROFILE_FIELD_LABELS[self.code]:
            raise ValueError("label must match the server-defined field label")
        return self


class EmployeeProfileResultData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fields: list[EmployeeProfileField] = Field(min_length=1, max_length=10)

    @field_validator("fields")
    @classmethod
    def _ensure_unique_fields(cls, value: list[EmployeeProfileField]) -> list[EmployeeProfileField]:
        codes = [field.code for field in value]
        if len(set(codes)) != len(codes):
            raise ValueError("fields must not contain duplicate codes")
        return value


class CandidateDisplayFieldCode(str, Enum):
    FULL_NAME = "full_name"
    ORGANIZATION_NAME = "organization_name"
    EMPLOYMENT_STATUS = "employment_status"


CANDIDATE_DISPLAY_FIELD_LABELS: dict[CandidateDisplayFieldCode, str] = {
    CandidateDisplayFieldCode.FULL_NAME: "\u59d3\u540d",
    CandidateDisplayFieldCode.ORGANIZATION_NAME: "\u6240\u5c5e\u7ec4\u7ec7",
    CandidateDisplayFieldCode.EMPLOYMENT_STATUS: "\u5728\u804c\u72b6\u6001",
}


class CandidateDisplayField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: CandidateDisplayFieldCode
    label: str = Field(min_length=1, max_length=32)
    value: str = Field(min_length=1, max_length=256)

    @field_validator("value")
    @classmethod
    def _validate_value(cls, value: str) -> str:
        if not value.strip() or value.strip() in {"-", "--", "N/A", "\u6682\u65e0"}:
            raise ValueError("candidate display value must be meaningful")
        return value

    @model_validator(mode="after")
    def _ensure_fixed_label(self) -> "CandidateDisplayField":
        if self.label != CANDIDATE_DISPLAY_FIELD_LABELS[self.code]:
            raise ValueError("label must match the server-defined candidate label")
        return self


class EmployeeProfileCandidateItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selection_handle: str = Field(pattern=r"^[A-Za-z0-9_-]{32,512}$")
    display_fields: list[CandidateDisplayField] = Field(min_length=1, max_length=3)

    @field_validator("display_fields")
    @classmethod
    def _ensure_unique_codes(
        cls, value: list[CandidateDisplayField]
    ) -> list[CandidateDisplayField]:
        codes = [field.code for field in value]
        if len(set(codes)) != len(codes):
            raise ValueError("display_fields must not contain duplicate codes")
        return value


class EmployeeProfileCandidatesData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidates: list[EmployeeProfileCandidateItem] = Field(min_length=2, max_length=5)


class EmployeeProfileInputData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    missing_fields: list[Literal["lookup_value"]] = Field(min_length=1, max_length=1)


class EmployeeProfileSelectCandidateActionContext(ControlledActionContext):
    """Only server-issued action control state; never sourced from the action request."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    employee_id: int = Field(ge=1)
    effective_requested_field_codes: tuple[EmployeeProfileFieldCode, ...] = Field(
        min_length=1,
        max_length=10,
    )

    @field_validator("effective_requested_field_codes")
    @classmethod
    def _ensure_unique_codes(
        cls, value: tuple[EmployeeProfileFieldCode, ...]
    ) -> tuple[EmployeeProfileFieldCode, ...]:
        if len(set(value)) != len(value):
            raise ValueError("effective_requested_field_codes must not contain duplicates")
        return value
