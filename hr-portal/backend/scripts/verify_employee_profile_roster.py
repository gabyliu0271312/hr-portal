"""Read-only X1501 preflight; it never reads or prints employee rows."""
from __future__ import annotations

import argparse
import asyncio
import json

from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import false
from sqlalchemy.sql.elements import AsBoolean, False_

from app.ai.employee_profile_repository import (
    EMPLOYEE_PROFILE_FIELD_COLUMNS,
    EMPLOYEE_PROFILE_ROSTER_TABLE,
    EMPLOYEE_PROFILE_SCOPE_COLUMN,
    EMPLOYEE_PROFILE_SCOPE_STRATEGY,
    build_employee_profile_lookup_statement,
    validate_employee_profile_roster_model,
)
from app.core.db import AsyncSessionLocal
from app.data.dynamic_loader import register_source_table_model
from app.data.models import RegisteredTable, TableColumn
from app.permissions.masker import VERDICT_HIDE, VERDICT_MASK, resolve_field_access
from app.permissions.scope_filter import build_scope_filter, is_unrestricted
from app.users.models import User


def _is_false_scope(scope_filter) -> bool:
    if isinstance(scope_filter, False_) or scope_filter.compare(false()):
        return True
    return isinstance(scope_filter, AsBoolean) and _is_false_scope(scope_filter.element)


def _scope_status(scope_filter):
    if _is_false_scope(scope_filter):
        return "fail_closed"
    return "resolved_unrestricted" if is_unrestricted(scope_filter) else "resolved_restrictive"


async def verify(user_id: int) -> tuple[dict, bool]:
    errors: list[str] = []
    async with AsyncSessionLocal() as db:
        registered = (await db.execute(select(RegisteredTable).where(
            RegisteredTable.table_name == EMPLOYEE_PROFILE_ROSTER_TABLE
        ))).scalar_one_or_none()
        user = await db.get(User, user_id)
        metadata = (await db.execute(select(TableColumn).where(
            TableColumn.table_name == EMPLOYEE_PROFILE_ROSTER_TABLE
        ))).scalars().all()
        if registered is None:
            errors.append("emp_realtime_roster is not registered")
        if user is None:
            errors.append("Portal user does not exist")
        if errors:
            return {"passed": False, "errors": errors}, False

        model = await register_source_table_model(db, EMPLOYEE_PROFILE_ROSTER_TABLE, force=True)
        by_code = {column.column_code: column for column in metadata}
        model_valid = True
        try:
            validate_employee_profile_roster_model(model)
        except ValueError as exc:
            errors.append(str(exc))
            model_valid = False
        if not by_code.get("employee_no") or not by_code["employee_no"].is_pk_part:
            errors.append("employee_no must have is_pk_part=true")
        if not by_code.get(EMPLOYEE_PROFILE_SCOPE_COLUMN) or by_code[EMPLOYEE_PROFILE_SCOPE_COLUMN].scope_role != "org_node_code":
            errors.append("org_node_code must have scope_role=org_node_code")
        if registered.scope_strategy != EMPLOYEE_PROFILE_SCOPE_STRATEGY:
            errors.append("emp_realtime_roster must use scope_strategy=person_first")

        verdicts = await resolve_field_access(
            user, EMPLOYEE_PROFILE_ROSTER_TABLE, db, tool_key="employee.profile.query"
        )
        scope_filter = await build_scope_filter(
            user, EMPLOYEE_PROFILE_ROSTER_TABLE, db, strategy=EMPLOYEE_PROFILE_SCOPE_STRATEGY
        )
        scope_resolution_status = _scope_status(scope_filter)
        scope_filter_restrictive = not is_unrestricted(scope_filter)
        statement = None
        if model_valid:
            statement = build_employee_profile_lookup_statement(
                model, lookup_type="employee_no", scope_filter=scope_filter
            )
        fields = []
        for business, physical in EMPLOYEE_PROFILE_FIELD_COLUMNS.items():
            verdict = verdicts.get(physical, "visible")
            fields.append({
                "business_code": business,
                "physical_column": physical,
                "is_sensitive": by_code.get(physical).is_sensitive if by_code.get(physical) else None,
                "field_access_verdict": verdict,
                "final_behavior": "hide" if verdict == VERDICT_HIDE else "mask" if verdict == VERDICT_MASK else "original",
            })
        report = {
            "passed": not errors,
            "errors": errors,
            "fields": fields,
            "scope": {
                "scope_filter_applied": True,
                "scope_filter_restrictive": scope_filter_restrictive,
                "scope_resolution_status": scope_resolution_status,
            },
            "sql_shape": str(statement.compile(
                dialect=postgresql.dialect(), compile_kwargs={"literal_binds": False}
            )) if statement is not None else None,
        }
        return report, not errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", required=True, type=int)
    report, passed = asyncio.run(verify(parser.parse_args().user_id))
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
