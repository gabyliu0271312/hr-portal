"""Deterministic, catalog-backed employee profile lookup service."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.employee_profile_catalog import EmployeeProfileCatalogError, EmployeeProfileCatalogItem, load_employee_profile_catalog, resolve_employee_profile_codes
from app.ai.employee_profile_repository import EMPLOYEE_PROFILE_ROSTER_TABLE, EMPLOYEE_PROFILE_SCOPE_STRATEGY, build_employee_profile_lookup_statement, build_employee_profile_selected_lookup_statement, validate_employee_profile_roster_model
from app.ai.employee_profile_schemas import EmployeeProfileQuerySpec
from app.data.models import DATA_TABLES
from app.permissions.masker import VERDICT_HIDE, resolve_field_access
from app.permissions.scope_filter import build_scope_filter, is_unrestricted
from app.users.models import User

EmployeeProfileMatchKind = Literal["no_match", "unique", "candidates", "too_many"]
_HEADER_COLUMNS = {"employee_no": "employee_no", "full_name": "full_name"}
_CANDIDATE_COLUMNS = {**_HEADER_COLUMNS, "organization_name": "department", "employment_status": "employment_status"}


class EmployeeProfileServiceContractError(RuntimeError):
    pass


@dataclass(frozen=True)
class EmployeeProfileLookupResult:
    match_kind: EmployeeProfileMatchKind
    rows: tuple[dict[str, Any], ...]
    effective_requested_field_codes: tuple[str, ...]
    field_labels: dict[str, str]
    scope_filter_applied: bool
    scope_filter_restrictive: bool
    masking_applied: bool = False
    employee_no: str | None = None
    full_name: str | None = None

    @property
    def permission_filtered(self) -> bool:
        return self.scope_filter_restrictive


def _roster_model():
    model = DATA_TABLES.get(EMPLOYEE_PROFILE_ROSTER_TABLE)
    if model is None or "raw" in model.__table__.columns:
        raise EmployeeProfileServiceContractError("employee profile roster is not registered")
    validate_employee_profile_roster_model(model)
    return model


def _match_kind(lookup_type: str, count: int) -> EmployeeProfileMatchKind:
    if count == 0:
        return "no_match"
    if count == 1:
        return "unique"
    return "candidates" if lookup_type == "employee_name" and count <= 5 else "too_many"


async def _requested_catalog(db: AsyncSession, codes: list[str]) -> tuple[EmployeeProfileCatalogItem, ...]:
    catalog = await load_employee_profile_catalog(db)
    defaults = tuple(item for item in catalog if item.is_default_card and item.is_queryable)
    if not codes:
        return defaults
    by_code = {item.field_code: item for item in catalog}
    try:
        requested = tuple(by_code[code] for code in codes)
    except KeyError as exc:
        raise EmployeeProfileServiceContractError("unsupported employee profile field") from exc
    if any(not item.is_queryable for item in requested):
        raise EmployeeProfileServiceContractError("unsupported employee profile field")
    return tuple(dict.fromkeys(requested))


def _visible(items: tuple[EmployeeProfileCatalogItem, ...], verdicts: dict[str, str]) -> tuple[EmployeeProfileCatalogItem, ...]:
    return tuple(item for item in items if verdicts.get(item.column_name) != VERDICT_HIDE)


def _field_columns(items: tuple[EmployeeProfileCatalogItem, ...]) -> dict[str, str]:
    return {item.field_code: item.column_name for item in items}


def _candidate_columns(model) -> dict[str, str]:
    available_columns = set(model.__table__.columns.keys())
    return {
        field_code: column_name
        for field_code, column_name in _CANDIDATE_COLUMNS.items()
        if column_name in available_columns
    }


class EmployeeProfileQueryService:
    async def query(self, query_spec: EmployeeProfileQuerySpec, *, user: User, db: AsyncSession, candidate_displayable=None) -> EmployeeProfileLookupResult:
        model = _roster_model()
        requested = await _requested_catalog(db, query_spec.requested_field_codes)
        scope_filter = await build_scope_filter(user, EMPLOYEE_PROFILE_ROSTER_TABLE, db, strategy=EMPLOYEE_PROFILE_SCOPE_STRATEGY)
        verdicts = await resolve_field_access(user, EMPLOYEE_PROFILE_ROSTER_TABLE, db, tool_key="employee.profile.query")
        visible = _visible(requested, verdicts)
        lookup_type: Literal["employee_no", "employee_name"] = "employee_no" if query_spec.lookup_type == "employee_no" else "employee_name"
        projection = {**_candidate_columns(model), **_field_columns(visible)}
        rows = tuple(dict(row) for row in (await db.execute(build_employee_profile_lookup_statement(model, lookup_type=lookup_type, scope_filter=scope_filter, field_columns=projection), {"employee_lookup_value": query_spec.lookup_value})).mappings().all())
        kind = _match_kind(lookup_type, len(rows))
        codes = tuple(item.field_code for item in visible)
        labels = {item.field_code: item.display_name for item in visible}
        employee_no = None
        full_name = None
        if kind == "unique":
            employee_no = str(rows[0].get("employee_no") or "") or None
            full_name = str(rows[0].get("full_name") or "") or None
            rows = ({"employee_id": rows[0]["employee_id"], **{code: rows[0][code] for code in codes}},) if codes else ()
            kind = "unique" if rows else "no_match"
        elif kind == "candidates":
            if candidate_displayable is not None and not all(candidate_displayable(row) for row in rows):
                kind, rows = "too_many", ()
        else:
            rows = ()
        return EmployeeProfileLookupResult(
            kind,
            rows,
            codes,
            labels,
            True,
            not is_unrestricted(scope_filter),
            employee_no=employee_no,
            full_name=full_name,
        )

    async def query_selected_employee(self, *, employee_id: int, effective_requested_field_codes: tuple[str, ...], user: User, db: AsyncSession) -> EmployeeProfileLookupResult:
        model = _roster_model()
        requested = await _requested_catalog(db, list(effective_requested_field_codes))
        scope_filter = await build_scope_filter(user, EMPLOYEE_PROFILE_ROSTER_TABLE, db, strategy=EMPLOYEE_PROFILE_SCOPE_STRATEGY)
        verdicts = await resolve_field_access(user, EMPLOYEE_PROFILE_ROSTER_TABLE, db, tool_key="employee.profile.query")
        visible = _visible(requested, verdicts)
        codes = tuple(item.field_code for item in visible)
        labels = {item.field_code: item.display_name for item in visible}
        projection = {**_HEADER_COLUMNS, **_field_columns(visible)}
        rows = tuple(dict(row) for row in (await db.execute(build_employee_profile_selected_lookup_statement(model, scope_filter=scope_filter, field_columns=projection), {"employee_profile_employee_id": employee_id})).mappings().all())
        if len(rows) != 1:
            return EmployeeProfileLookupResult("no_match", (), codes, labels, True, not is_unrestricted(scope_filter))
        return EmployeeProfileLookupResult(
            "unique",
            ({"employee_id": rows[0]["employee_id"], **{code: rows[0][code] for code in codes}},),
            codes,
            labels,
            True,
            not is_unrestricted(scope_filter),
            employee_no=str(rows[0].get("employee_no") or "") or None,
            full_name=str(rows[0].get("full_name") or "") or None,
        )
