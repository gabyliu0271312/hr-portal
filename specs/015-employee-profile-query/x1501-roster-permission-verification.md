# X1501 roster and permission verification

Status: **complete**. The runtime preflight passed against the test database with both unrestricted and enabled restricted-user evidence.

## Static contract

| Concern | Contract | Evidence |
|---|---|---|
| Roster source | `emp_realtime_roster`, registered through runtime reflection | `backend/app/data/dynamic_loader.py` |
| Source data | Beisen real-time roster, maintained as the latest snapshot | `backend/app/seed.py`, `backend/app/datasources/sync_service.py` |
| Stable employee key | `employee_no`, only after its `is_pk_part=true` runtime assertion passes | `backend/scripts/code_migration.json` |
| Exact lookup | `employee_no` or `chinese_name`; parameterized equality only, never `LIKE` | `backend/app/ai/employee_profile_repository.py` |
| Candidate probe | deterministic `employee_no ASC`, fixed `LIMIT 6` | `backend/app/ai/employee_profile_repository.py` |
| Object scope | `person_first`, `org_node_code` must have `scope_role=org_node_code`; scope enters SQL before execution | `backend/app/permissions/scope_filter.py` |
| Field access | `resolve_field_access(user, table, db, "employee.profile.query")`; missing verdict means visible, `hide` omits, explicit `mask` masks | `backend/app/permissions/masker.py` |

## Fixed business mapping

| Business code | Physical column |
|---|---|
| `employee_name` | `chinese_name` |
| `employee_no` | `employee_no` |
| `organization_name` | `department` |
| `position_name` | `position` |
| `employee_type` | `employee_type` |
| `employment_status` | `employee_status` |
| `hire_date` | `hire_date` |

The current implementation adds no status-based inclusion rule: the source's latest roster snapshot and `employee_status` remain the source-of-truth for departed, pre-join, part-time, and multi-organization records.

## Runtime evidence command

```powershell
cd hr-portal/backend
.\.venv\Scripts\python.exe scripts/verify_employee_profile_roster.py --user-id <portal-user-id>
```

The preflight is read-only and prints no employee rows, names, employee numbers, request values, credentials, or field values. Run it for both a restricted user and a super administrator. It verifies the reflected columns, `employee_no` PK participation, scope metadata, field-access verdicts, structured scope status, and compiled parameterized SQL shape.

## Current result

On July 21, 2026, Docker Compose and PostgreSQL became reachable. The read-only preflight passed the fixed roster contract for the following test-environment samples:

| Sample | Result | Scope result |
|---|---|---|
| enabled super administrator (`user_id=1`) | passed | `applied=true`, `restrictive=false`, `resolved_unrestricted` |
| enabled HRBP sample (`jenna.zhang`, `user_id=2`) | passed | `applied=true`, `restrictive=true`, `resolved_restrictive`; compiled query contains the `org_node_code IN (...)` scope predicate |
| enabled payroll sample (`user_id=3`) | passed | `applied=true`, `restrictive=true`, `fail_closed`; compiled query contains `WHERE false` |

All seven fixed columns exist; `employee_no` has `is_pk_part=true`; `org_node_code` has `scope_role=org_node_code`; `emp_realtime_roster` uses `person_first`; and the fixed fields are currently non-sensitive and visible for the tested users. The compiled SQL keeps the scope predicate before the parameterized exact employee-number predicate, deterministic `employee_no ASC`, and `LIMIT 6`.

The HRBP sample was subsequently enabled and its technical-middle-platform organization scope was corrected. It now supplies the required enabled, non-empty restricted-user evidence, so `X1501` is complete.

## Salary-field configuration observation

An earlier July 21, 2026 check used the wrong table (`emp_monthly_salary`) and therefore could not validate the configured fields. The corrected read-only check used `emp_realtime_roster`, the table on which the payroll field category was configured. For enabled HRBP user `jenna.zhang`, both `base_salary` and `target_year_end_bonus` resolve to `hide` with `tool_key=employee.profile.query`.

The two `TableColumn.is_sensitive` flags remain `false`; the denial is supplied by the field-category assignment, which is also part of `resolve_field_access()`'s sensitivity model. This proves that HRBP cannot receive those two configured fields through the employee-profile capability. They are outside this capability's fixed output whitelist in any case.

The query Handler, Portal UI, and Feishu integration have not started. No private action, conversation, audit, or Feishu implementation was added.
