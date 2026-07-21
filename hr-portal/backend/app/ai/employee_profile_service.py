"""Deterministic, scope-first employee-profile lookup service."""
from __future__ import annotations

from dataclasses import dataclass
from collections.abc import Callable
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.employee_profile_repository import (
    EMPLOYEE_PROFILE_FIELD_COLUMNS,
    EMPLOYEE_PROFILE_ROSTER_TABLE,
    EMPLOYEE_PROFILE_SCOPE_STRATEGY,
    EmployeeProfileRosterContractError,
    build_employee_profile_lookup_statement,
    build_employee_profile_selected_lookup_statement,
    validate_employee_profile_roster_model,
)
from app.ai.employee_profile_schemas import (
    CandidateDisplayFieldCode,
    EmployeeProfileFieldCode,
    EmployeeProfileQuerySpec,
    effective_requested_fields,
)
from app.data.models import DATA_TABLES
from app.permissions.masker import VERDICT_HIDE, resolve_field_access
from app.permissions.scope_filter import build_scope_filter, is_unrestricted
from app.users.models import User

EmployeeProfileMatchKind = Literal["no_match", "unique", "candidates", "too_many"]

_CANDIDATE_DISPLAY_FIELD_CODES: tuple[EmployeeProfileFieldCode, ...] = tuple(
    EmployeeProfileFieldCode(code.value) for code in CandidateDisplayFieldCode
)
_CANDIDATE_PLACEHOLDER_VALUES = {"-", "--", "n/a", "\u6682\u65e0", "\u2014"}


class EmployeeProfileServiceContractError(RuntimeError):
    """Raised before SQL execution when the fixed employee lookup contract is unavailable."""


@dataclass(frozen=True)
class EmployeeProfileLookupResult:
    match_kind: EmployeeProfileMatchKind
    rows: tuple[dict[str, Any], ...]
    effective_requested_field_codes: tuple[EmployeeProfileFieldCode, ...]
    scope_filter_applied: bool
    scope_filter_restrictive: bool
    masking_applied: bool = False

    @property
    def permission_filtered(self) -> bool:
        return self.scope_filter_restrictive


def _roster_model():
    model = DATA_TABLES.get(EMPLOYEE_PROFILE_ROSTER_TABLE)
    if model is None:
        raise EmployeeProfileServiceContractError("employee profile roster is not registered")
    if "raw" in model.__table__.columns:
        raise EmployeeProfileServiceContractError("employee profile roster must expose entity columns")
    try:
        validate_employee_profile_roster_model(model)
    except EmployeeProfileRosterContractError as exc:
        raise EmployeeProfileServiceContractError(str(exc)) from exc
    return model


def _lookup_type(query_spec: EmployeeProfileQuerySpec) -> Literal["employee_no", "employee_name"]:
    if query_spec.lookup_type == "employee_no":
        return "employee_no"
    return "employee_name"


def _match_kind(lookup_type: str, row_count: int) -> EmployeeProfileMatchKind:
    if row_count == 0:
        return "no_match"
    if row_count == 1:
        return "unique"
    if lookup_type == "employee_name" and row_count <= 5:
        return "candidates"
    return "too_many"


def _mapping_rows(result) -> tuple[dict[str, Any], ...]:
    mappings = result.mappings().all()
    return tuple(dict(row) for row in mappings)


def _field_is_visible(
    field_code: EmployeeProfileFieldCode,
    verdicts: dict[str, str],
) -> bool:
    physical_column = EMPLOYEE_PROFILE_FIELD_COLUMNS[field_code.value]
    return verdicts.get(physical_column) != VERDICT_HIDE


def _detail_field_codes(
    query_spec: EmployeeProfileQuerySpec,
    verdicts: dict[str, str],
) -> tuple[EmployeeProfileFieldCode, ...]:
    return tuple(
        field_code
        for field_code in effective_requested_fields(query_spec)
        if _field_is_visible(field_code, verdicts)
    )


def _candidate_displayable_fields(
    row: dict[str, Any],
    verdicts: dict[str, str],
) -> tuple[EmployeeProfileFieldCode, ...]:
    displayable: list[EmployeeProfileFieldCode] = []
    for field_code in _CANDIDATE_DISPLAY_FIELD_CODES:
        value = row.get(field_code.value)
        if not _field_is_visible(field_code, verdicts):
            continue
        if not isinstance(value, str) or not value.strip():
            continue
        if value.strip().casefold() in _CANDIDATE_PLACEHOLDER_VALUES:
            continue
        displayable.append(field_code)
    return tuple(displayable)


def _project_row(
    row: dict[str, Any],
    field_codes: tuple[EmployeeProfileFieldCode, ...],
) -> dict[str, Any]:
    return {
        "employee_id": row["employee_id"],
        **{field_code.value: row[field_code.value] for field_code in field_codes},
    }


class EmployeeProfileQueryService:
    async def query(
        self,
        query_spec: EmployeeProfileQuerySpec,
        *,
        user: User,
        db: AsyncSession,
        candidate_displayable: Callable[[dict[str, Any]], bool] | None = None,
    ) -> EmployeeProfileLookupResult:
        model = _roster_model()
        scope_filter = await build_scope_filter(
            user,
            EMPLOYEE_PROFILE_ROSTER_TABLE,
            db,
            strategy=EMPLOYEE_PROFILE_SCOPE_STRATEGY,
        )
        field_verdicts = await resolve_field_access(
            user,
            EMPLOYEE_PROFILE_ROSTER_TABLE,
            db,
            tool_key=None,
        )
        detail_field_codes = _detail_field_codes(query_spec, field_verdicts)
        lookup_type = _lookup_type(query_spec)
        statement = build_employee_profile_lookup_statement(
            model,
            lookup_type=lookup_type,
            scope_filter=scope_filter,
        )
        result = await db.execute(statement, {"employee_lookup_value": query_spec.lookup_value})
        rows = _mapping_rows(result)
        match_kind = _match_kind(lookup_type, len(rows))
        if match_kind == "unique":
            if not detail_field_codes:
                match_kind = "no_match"
                rows = ()
            else:
                rows = (_project_row(rows[0], detail_field_codes),)
        elif match_kind == "candidates":
            candidate_field_codes = tuple(
                _candidate_displayable_fields(row, field_verdicts) for row in rows
            )
            if (
                not all(candidate_field_codes)
                or (candidate_displayable is not None and not all(candidate_displayable(row) for row in rows))
            ):
                match_kind = "too_many"
                rows = ()
            else:
                rows = tuple(
                    _project_row(row, fields)
                    for row, fields in zip(rows, candidate_field_codes, strict=True)
                )
        return EmployeeProfileLookupResult(
            match_kind=match_kind,
            rows=rows,
            effective_requested_field_codes=detail_field_codes,
            scope_filter_applied=True,
            scope_filter_restrictive=not is_unrestricted(scope_filter),
        )

    async def query_selected_employee(
        self,
        *,
        employee_id: int,
        effective_requested_field_codes: tuple[EmployeeProfileFieldCode, ...],
        user: User,
        db: AsyncSession,
    ) -> EmployeeProfileLookupResult:
        """Resolve a consumed candidate handle against the user's current scope and field access."""
        model = _roster_model()
        scope_filter = await build_scope_filter(
            user,
            EMPLOYEE_PROFILE_ROSTER_TABLE,
            db,
            strategy=EMPLOYEE_PROFILE_SCOPE_STRATEGY,
        )
        field_verdicts = await resolve_field_access(
            user,
            EMPLOYEE_PROFILE_ROSTER_TABLE,
            db,
            tool_key=None,
        )
        detail_field_codes = tuple(
            field_code
            for field_code in effective_requested_field_codes
            if _field_is_visible(field_code, field_verdicts)
        )
        statement = build_employee_profile_selected_lookup_statement(
            model,
            scope_filter=scope_filter,
        )
        result = await db.execute(statement, {"employee_profile_employee_id": employee_id})
        rows = _mapping_rows(result)
        if len(rows) != 1 or not detail_field_codes:
            return EmployeeProfileLookupResult(
                match_kind="no_match",
                rows=(),
                effective_requested_field_codes=detail_field_codes,
                scope_filter_applied=True,
                scope_filter_restrictive=not is_unrestricted(scope_filter),
            )
        return EmployeeProfileLookupResult(
            match_kind="unique",
            rows=(_project_row(rows[0], detail_field_codes),),
            effective_requested_field_codes=detail_field_codes,
            scope_filter_applied=True,
            scope_filter_restrictive=not is_unrestricted(scope_filter),
        )
