"""Project lifecycle services for cycle-scoped project configuration."""
from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.employee_roster_contract import (
    EmployeeRosterContractError,
    ORGANIZATION_FIELDS,
    organization_path,
    employee_roster_table,
    normalize_employee_no,
    normalize_roster_date,
    normalize_roster_text,
    require_employee_roster_columns,
)
from app.performance.assessment_roles import normalize_executor_identity, validate_executor_roles
from app.performance.calibration_service import calibration_template, resolve_calibration
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.self_summary_service import hydrate_self_summary_template, resolve_self_summary_content
from app.performance.scope_options import build_organization_tree
from app.performance.models import (
    CYCLE_LEAVER_MODE_REPORT_ONLY,
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceCycle,
    PerformanceCycleProjectManager,
    PerformanceNodeTask,
    PerformanceProject,
    PerformanceProjectMember,
    PerformanceProjectMemberSnapshot,
    PerformanceProjectNodeSnapshot,
    PerformanceTemplateWorkflow,
    PerformanceOtherSetting,
    PROJECT_STATUS_DRAFT,
    PROJECT_STATUS_STARTED,
    AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
)


class ProjectValidationError(ValueError):
    pass


def _parse_hire_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or len(value) != 10 or value[4] != "-" or value[7] != "-":
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _matches_hire_date_condition(actual: Any, condition: dict[str, Any]) -> bool:
    parsed_actual = normalize_roster_date(actual)
    if parsed_actual is None:
        return False
    values = condition.get("values") or []
    operator = condition.get("operator")
    if operator in {"before", "not_before", "after", "not_after"}:
        target = _parse_hire_date(values[0])
        if operator == "before":
            return parsed_actual < target
        if operator == "not_before":
            return parsed_actual >= target
        if operator == "after":
            return parsed_actual > target
        return parsed_actual <= target
    start, end = (_parse_hire_date(value) for value in values)
    matched = start <= parsed_actual <= end
    return matched if operator == "include" else not matched


def _matches_scope_condition(values: dict[str, Any], condition: dict[str, Any]) -> bool:
    field = condition.get("field")
    if field in {"hire_date", "departure_date"}:
        return _matches_hire_date_condition(values.get(field), condition)
    selected = {str(value).strip() for value in condition.get("values", []) if str(value).strip()}
    actual = values.get(field, "")
    if field == "department":
        leaf = actual.rsplit("/", 1)[-1] if actual else ""
        matched = bool(actual and any(actual == value or actual.startswith(f"{value}/") or leaf == value for value in selected))
    else:
        matched = actual in selected
    return matched if condition.get("operator") == "include" else not matched


def _matches_start_project_condition(values: dict[str, Any], condition: dict[str, Any]) -> bool:
    return _matches_scope_condition(values, condition)


DEFAULT_FLOW_SETTINGS = {"node_settings": {}}
MAX_PROJECT_FLOW_NODES = 100
DISTRIBUTION_MODES = {"UNIFIED", "BY_CALIBRATION_SCOPE"}
DISTRIBUTION_CONTROL_MODES = {"HARD", "SOFT"}
DISTRIBUTION_OPERATORS = {"EQ", "LT", "LTE", "GT", "GTE"}
DISTRIBUTION_UNITS = {"PERCENT", "PEOPLE"}
DISTRIBUTION_ROUNDING_METHODS = {"ROUND", "CEIL", "FLOOR", "NONE"}


def distribution_assessment_options(nodes: list[dict], content_library: list[dict]) -> list[dict[str, Any]]:
    final_node = next((node for node in nodes if node.get("include_final_result")), None)
    if final_node is None:
        return []
    resolved = resolve_self_summary_content(final_node, content_library)
    options: list[dict[str, Any]] = []
    seen: set[str] = set()
    for content in resolved.get("content") or []:
        if (content.get("content_slot") or "fill") != "fill" or content.get("type") in {"reference", "prompt"}:
            continue
        for item in content.get("items") or []:
            if item.get("kind") != "rating" and content.get("type") != "rating":
                continue
            item_id = str(item.get("id") or "").strip()
            grade_options = item.get("options") if isinstance(item.get("options"), list) else content.get("options")
            grades = [
                {
                    "value": str(option.get("code") or option.get("id")),
                    "label": str(option.get("code") or option.get("label") or option.get("id")),
                    "legacy_value": str(option.get("id")),
                }
                for option in (grade_options or [])
                if isinstance(option, dict) and (option.get("code") or option.get("id")) is not None
            ]
            if not item_id or not grades or item_id in seen:
                continue
            seen.add(item_id)
            options.append({
                "id": item_id,
                "label": str(item.get("label") or content.get("name") or item_id),
                "description": str(content.get("description") or ""),
                "grade_options": grades,
            })
    return options


def _actor_ref(actor_id: int) -> str:
    return str(actor_id)


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProjectValidationError("流程节点时间格式不合法") from exc
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed


def _resolve_node_handlers(node: dict, person: Any, people_by_employee: dict[str, Any]) -> set[str]:
    if node.get("executor_role_code") or node.get("executor_label") in {"被评估人", "实线上级", "虚线上级", "360°评估人", "指标评价人"}:
        node = normalize_executor_identity(node)
    types = set(node.get("executor_types") or [])
    if "VIRTUAL_LINE_MANAGER" in types:
        return set()
    handlers: set[str] = set()
    if "SUBJECT" in types or node.get("node_type") in {"work_summary", "reviewer_360_invite"}:
        handlers.add(person.employee_no)
    if "HRBP" in types and person.hrbp_employee_no:
        handlers.add(person.hrbp_employee_no)
    if "PROJECT_MANAGER" in types and getattr(person, "project_manager_employee_no", None):
        handlers.add(person.project_manager_employee_no)

    levels = {"DIRECT_MANAGER", "LEVEL_1_MANAGER", "LEVEL_2_MANAGER", "LEVEL_3_MANAGER_PLUS"}
    if types & levels:
        manager_ref = person.direct_supervisor_employee_no
        visited = {person.employee_no}
        depth = 1
        while manager_ref and manager_ref not in visited:
            visited.add(manager_ref)
            if manager_ref not in people_by_employee:
                break
            level = ("DIRECT_MANAGER", "LEVEL_1_MANAGER", "LEVEL_2_MANAGER")[depth - 1] if depth <= 3 else "LEVEL_3_MANAGER_PLUS"
            if level in types:
                handlers.add(manager_ref)
            manager_ref = people_by_employee[manager_ref].direct_supervisor_employee_no
            depth += 1
    return handlers


async def _canonical_roster_rows(db: AsyncSession) -> list[dict[str, Any]]:
    try:
        table = employee_roster_table()
        columns = require_employee_roster_columns(table)
    except EmployeeRosterContractError as exc:
        raise ProjectValidationError(str(exc)) from exc
    rows = (await db.execute(select(*[column.label(key) for key, column in columns.items()]))).mappings().all()
    return [{**dict(row), "organization_ref": organization_path(row)} for row in rows]


class PerformanceProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit = PerformanceAuditService(db)

    async def _cycle_snapshot_people(self, cycle: PerformanceCycle) -> tuple[Any, list[Any]]:
        snapshot = await self.db.scalar(
            select(PerformanceAuthorizationSnapshot).where(
                PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref,
            )
        )
        if snapshot is None:
            raise ProjectValidationError("周期人员快照不存在，请先同步周期人员")
        people = list((await self.db.execute(
            select(PerformanceAuthorizationSnapshotPerson).where(
                PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id
            )
        )).scalars().all())
        return snapshot, people

    async def evaluator_options(self, cycle: PerformanceCycle) -> dict[str, Any]:
        _, people = await self._cycle_snapshot_people(cycle)
        people = self._cycle_eligible_people(people, cycle)
        rows = [
            {"employee_no": person.employee_no, "full_name": person.display_name,
             **{field: getattr(person, field, None) for field in ORGANIZATION_FIELDS}}
            for person in people
        ]
        options = {
            "organization_tree": build_organization_tree(rows),
            "people": sorted([
                {"value": person.employee_no, "label": f"{person.display_name}（{person.employee_no}）"}
                for person in people
            ], key=lambda item: item["value"]),
        }
        for field, key in (
            ("employee_type", "employee_types"),
            ("employment_status", "employment_statuses"),
            ("job_family", "job_families"),
            ("job_category", "job_categories"),
            ("position_level", "position_levels"),
            ("standard_position", "standard_positions"),
        ):
            values = {value for person in people if (value := normalize_roster_text(getattr(person, field, None)))}
            options[key] = [{"value": value, "label": value} for value in sorted(values)]
        for field in ("hire_date", "departure_date"):
            dates = [value for person in people if (value := normalize_roster_date(getattr(person, field, None))) is not None]
            options[f"{field}_range"] = {
                "min": min(dates).isoformat() if dates else None,
                "max": max(dates).isoformat() if dates else None,
            }
        return options

    async def preview_people(self, cycle: PerformanceCycle, settings: dict[str, Any], *, group_index: int | None = None, project_id: int | None = None, exclude_occupied: bool = True) -> tuple[list[Any], list[Any], list[Any]]:
        _, people = await self._cycle_snapshot_people(cycle)
        task_people, report_only = self._classify_people(people, settings, cycle, group_index=group_index)
        candidate_numbers = [person.employee_no for person in [*task_people, *report_only]]
        if exclude_occupied and candidate_numbers:
            occupied_statement = (
                select(PerformanceProjectMember.employee_no)
                .join(PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.id == PerformanceProjectMember.snapshot_id)
                .join(PerformanceProject, PerformanceProject.id == PerformanceProjectMemberSnapshot.project_id)
                .where(
                    PerformanceProject.cycle_ref == cycle.cycle_ref,
                    PerformanceProject.status == PROJECT_STATUS_STARTED,
                    PerformanceProjectMember.employee_no.in_(candidate_numbers),
                )
            )
            if project_id is not None:
                occupied_statement = occupied_statement.where(PerformanceProject.id != project_id)
            occupied = set((await self.db.execute(occupied_statement)).scalars().all())
            task_people = [person for person in task_people if person.employee_no not in occupied]
            report_only = [person for person in report_only if person.employee_no not in occupied]
        matched = sorted([*task_people, *report_only], key=lambda person: (person.display_name, person.employee_no))
        return matched, task_people, report_only

    async def evaluator_count(self, cycle: PerformanceCycle, rules: dict[str, Any]) -> int:
        matched, _task_people, _report_only = await self.preview_people(
            cycle,
            {"evaluator_rules": rules, "scope_rules": {"groups": []}},
            exclude_occupied=False,
        )
        return len(matched)

    async def list_projects(
        self,
        cycle_ref: str,
        keyword: str | None = None,
        *,
        project_refs: set[str] | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[PerformanceProject], int]:
        statement = select(PerformanceProject).where(PerformanceProject.cycle_ref == cycle_ref)
        count_statement = select(func.count(PerformanceProject.id)).where(PerformanceProject.cycle_ref == cycle_ref)
        if project_refs is not None:
            if not project_refs:
                return [], 0
            statement = statement.where(PerformanceProject.project_ref.in_(project_refs))
            count_statement = count_statement.where(PerformanceProject.project_ref.in_(project_refs))
        if keyword and keyword.strip():
            pattern = f"%{keyword.strip()}%"
            statement = statement.where(PerformanceProject.name.ilike(pattern))
            count_statement = count_statement.where(PerformanceProject.name.ilike(pattern))
        total = int((await self.db.execute(count_statement)).scalar_one() or 0)
        projects = list((await self.db.execute(
            statement.order_by(PerformanceProject.created_at.asc()).offset((page - 1) * page_size).limit(page_size)
        )).scalars())
        return projects, total

    @staticmethod
    def serialize(project: PerformanceProject) -> dict[str, Any]:
        return {
            "id": project.id,
            "project_ref": project.project_ref,
            "cycle_ref": project.cycle_ref,
            "name": project.name,
            "description": project.description,
            "administrators": project.administrators or [],
            "data_managers": (project.settings or {}).get("data_managers", ["HRBP"]),
            "scope_limited": (project.settings or {}).get("scope_limited", False),
            "scope_employee_nos": (project.settings or {}).get("scope_employee_nos", []),
            "scope_rules": (project.settings or {}).get("scope_rules", {"groups": []}),
            "status": project.status,
            "evaluated_count": project.evaluated_count,
        }

    @staticmethod
    def serialize(project: PerformanceProject) -> dict[str, Any]:
        settings = project.settings or {}
        return {
            "id": project.id,
            "project_ref": project.project_ref,
            "cycle_ref": project.cycle_ref,
            "name": project.name,
            "description": project.description,
            "administrators": project.administrators or [],
            "data_managers": (project.settings or {}).get("data_managers", ["HRBP"]),
            "scope_limited": (project.settings or {}).get("scope_limited", False),
            "scope_employee_nos": (project.settings or {}).get("scope_employee_nos", []),
            "scope_rules": (project.settings or {}).get("scope_rules", {"groups": []}),
            "status": project.status,
            "evaluated_count": project.evaluated_count,
            "template_id": settings.get("template_id"),
            "start_at": settings.get("start_at"),
            "end_at": settings.get("end_at"),
            "evaluator_rules": settings.get("evaluator_rules", {"groups": []}),
            "flow_settings": settings.get("flow_settings", DEFAULT_FLOW_SETTINGS),
        }

    @classmethod
    def _validate_scope_rules(cls, rules: Any) -> dict[str, list[dict[str, Any]]]:
        if rules is None:
            return {"groups": []}
        if not isinstance(rules, dict) or not isinstance(rules.get("groups"), list):
            raise ProjectValidationError("限定考核范围格式不正确")
        groups = []
        for group in rules["groups"]:
            conditions = group.get("conditions") if isinstance(group, dict) else None
            if not isinstance(conditions, list) or len(conditions) != 1:
                raise ProjectValidationError("限定考核范围每个条件组只能包含一条条件")
            condition = conditions[0]
            if not isinstance(condition, dict) or condition.get("field") not in {"department", "employee"} or condition.get("operator") not in {"include", "exclude"}:
                raise ProjectValidationError("限定考核范围条件不合法")
            values = [str(value).strip() for value in condition.get("values", []) if str(value).strip()]
            if not values:
                raise ProjectValidationError("限定考核范围条件不能为空")
            groups.append({"conditions": [{"field": condition["field"], "operator": condition["operator"], "values": list(dict.fromkeys(values))}]})
        return {"groups": groups}

    @classmethod
    def _validate_rules(cls, rules: Any) -> dict[str, list[dict[str, Any]]]:
        if rules is None:
            return {"groups": []}
        if not isinstance(rules, dict) or not isinstance(rules.get("groups"), list):
            raise ProjectValidationError("被评估人筛选规则格式不正确")
        allowed_fields = {"department", "employee_type", "employee", "hire_date", "employment_status", "departure_date", "job_family", "job_category", "position_level", "standard_position"}
        allowed_operators = {"include", "exclude", "before", "not_before", "after", "not_after"}
        groups = []
        for group in rules["groups"]:
            conditions = group.get("conditions") if isinstance(group, dict) else None
            if not isinstance(conditions, list) or not conditions:
                raise ProjectValidationError("每个被评估人范围至少需要一个筛选条件")
            normalized_conditions = []
            for condition in conditions:
                if (not isinstance(condition, dict) or not isinstance(condition.get("field"), str)
                        or not isinstance(condition.get("operator"), str)
                        or condition["field"] not in allowed_fields or condition["operator"] not in allowed_operators):
                    raise ProjectValidationError("被评估人筛选条件不合法")
                if condition.get("field") in {"hire_date", "departure_date"}:
                    values = condition.get("values")
                    comparison = condition["operator"] in {"before", "not_before", "after", "not_after"}
                    if (not isinstance(values, list) or len(values) != (1 if comparison else 2)
                            or (condition["field"] == "departure_date" and not comparison)
                            or any(not isinstance(value, str) or _parse_hire_date(value) is None for value in values)
                            or (not comparison and values[0] > values[1])):
                        raise ProjectValidationError("入职日期条件不合法" if condition["field"] == "hire_date" else "离职日期条件不合法")
                else:
                    if condition["operator"] not in {"include", "exclude"}:
                        raise ProjectValidationError("被评估人筛选条件不合法")
                    raw_values = condition.get("values")
                    if not isinstance(raw_values, list) or any(not isinstance(value, str) for value in raw_values):
                        raise ProjectValidationError("被评估人筛选条件不合法")
                    values = list(dict.fromkeys(value.strip() for value in raw_values if value.strip()))
                    if not values:
                        raise ProjectValidationError("被评估人筛选条件不能为空")
                normalized_conditions.append({"field": condition["field"], "operator": condition["operator"], "values": values})
            groups.append({"conditions": normalized_conditions})
        return {"groups": groups}

    @staticmethod
    def _validate_distribution(distribution: Any) -> dict[str, Any]:
        if distribution is None:
            return {"mode": "UNIFIED", "rules": [], "scope_configured": False}
        if not isinstance(distribution, dict) or set(distribution) - {"mode", "rules", "scope_configured"}:
            raise ProjectValidationError("绩效结果分布设置格式不正确")
        mode = distribution.get("mode", "UNIFIED")
        rules = distribution.get("rules", [])
        scope_configured = distribution.get("scope_configured", False)
        if mode not in DISTRIBUTION_MODES or not isinstance(rules, list) or not isinstance(scope_configured, bool):
            raise ProjectValidationError("绩效结果分布设置不合法")
        if len(rules) > MAX_PROJECT_FLOW_NODES:
            raise ProjectValidationError("分布规则不能超过 100 个")
        normalized_rules = []
        assessment_ids = set()
        for rule in rules:
            if not isinstance(rule, dict) or set(rule) != {"assessment_item_id", "min_people_count", "conditions", "rounding_method"}:
                raise ProjectValidationError("分布规则格式不正确")
            assessment_item_id = rule.get("assessment_item_id")
            minimum = rule.get("min_people_count")
            conditions = rule.get("conditions")
            rounding = rule.get("rounding_method")
            if (not isinstance(assessment_item_id, str) or not assessment_item_id.strip() or len(assessment_item_id.strip()) > 128
                    or assessment_item_id.strip() in assessment_ids):
                raise ProjectValidationError("同一评估项只能配置一套分布规则")
            if not isinstance(minimum, int) or isinstance(minimum, bool) or minimum < 0 or minimum > 100000:
                raise ProjectValidationError("分布规则适用人数不合法")
            if not isinstance(conditions, list) or not conditions or len(conditions) > MAX_PROJECT_FLOW_NODES:
                raise ProjectValidationError("请至少配置一条分布条件")
            if rounding not in DISTRIBUTION_ROUNDING_METHODS:
                raise ProjectValidationError("分布规则取整方式不合法")
            normalized_conditions = []
            for condition in conditions:
                if not isinstance(condition, dict) or set(condition) != {"control_mode", "grade_codes", "operator", "value", "unit"}:
                    raise ProjectValidationError("分布条件格式不正确")
                control_mode = condition.get("control_mode")
                grade_codes = condition.get("grade_codes")
                operator = condition.get("operator")
                value = condition.get("value")
                unit = condition.get("unit")
                if control_mode not in DISTRIBUTION_CONTROL_MODES or operator not in DISTRIBUTION_OPERATORS or unit not in DISTRIBUTION_UNITS:
                    raise ProjectValidationError("分布条件不合法")
                if not isinstance(grade_codes, list) or not grade_codes or any(not isinstance(code, str) or not code.strip() or len(code.strip()) > 128 for code in grade_codes):
                    raise ProjectValidationError("分布条件等级不能为空")
                if not isinstance(value, int) or isinstance(value, bool) or value <= 0 or (unit == "PERCENT" and value > 100) or (unit == "PEOPLE" and value > 100000):
                    raise ProjectValidationError("分布条件数值不合法")
                normalized_conditions.append({
                    "control_mode": control_mode,
                    "grade_codes": list(dict.fromkeys(code.strip() for code in grade_codes)),
                    "operator": operator,
                    "value": value,
                    "unit": unit,
                })
            assessment_ids.add(assessment_item_id.strip())
            normalized_rules.append({
                "assessment_item_id": assessment_item_id.strip(),
                "min_people_count": minimum,
                "conditions": normalized_conditions,
                "rounding_method": rounding,
            })
        return {"mode": mode, "rules": normalized_rules, "scope_configured": scope_configured}

    @staticmethod
    def _validate_calibration_groups(groups: Any, *, allowed_fields: set[str]) -> list[dict[str, Any]]:
        if not isinstance(groups, list) or not groups:
            raise ProjectValidationError("校准规则条件组不能为空")
        normalized = []
        for group in groups:
            if (not isinstance(group, dict) or set(group) != {"conditions"}
                    or not isinstance(group["conditions"], list) or not group["conditions"]):
                raise ProjectValidationError("校准规则条件组不合法")
            conditions = []
            for condition in group["conditions"]:
                if not isinstance(condition, dict) or set(condition) != {"field", "operator", "values"}:
                    raise ProjectValidationError("校准规则条件不合法")
                field = condition.get("field")
                operator = condition.get("operator")
                values = condition.get("values")
                if field not in allowed_fields or not isinstance(values, list) or not values:
                    raise ProjectValidationError("校准规则条件不合法")
                if field == "hire_date":
                    if operator not in {"before", "not_before", "after", "not_after"} or len(values) != 1 or not isinstance(values[0], str) or _parse_hire_date(values[0]) is None:
                        raise ProjectValidationError("入职日期条件不合法")
                    normalized_values = values
                else:
                    if operator not in {"INCLUDE", "EXCLUDE"} or any(not isinstance(value, str) or not value.strip() or len(value.strip()) > 128 for value in values):
                        raise ProjectValidationError("校准规则条件值不合法")
                    normalized_values = [value.strip() for value in values]
                if field == "calibrator_relation" and any(value not in {"ALL_SUBORDINATES", "DIRECT_SUBORDINATES", "INDIRECT_SUBORDINATES"} for value in normalized_values):
                    raise ProjectValidationError("与校准人关系选项不合法")
                conditions.append({"field": field, "operator": operator, "values": normalized_values})
            normalized.append({"conditions": conditions})
        return normalized

    @classmethod
    def _validate_flow_settings(cls, flow_settings: Any, existing_flow_settings: dict[str, Any] | None = None) -> dict[str, Any]:
        if flow_settings is None:
            return {"node_settings": {}}
        if not isinstance(flow_settings, dict) or not isinstance(flow_settings.get("node_settings"), dict):
            raise ProjectValidationError("流程设置格式不正确")
        node_settings = flow_settings["node_settings"]
        if len(node_settings) > MAX_PROJECT_FLOW_NODES:
            raise ProjectValidationError(f"流程环节配置不能超过 {MAX_PROJECT_FLOW_NODES} 个")
        normalized_nodes: dict[str, dict[str, Any]] = {}
        for node_id, raw in node_settings.items():
            if not isinstance(node_id, str) or not node_id.strip() or len(node_id) > 96 or not isinstance(raw, dict):
                raise ProjectValidationError("流程环节配置格式不正确")
            normalized: dict[str, Any] = {}
            invite = raw.get("invite")
            if invite is not None:
                if not isinstance(invite, dict):
                    raise ProjectValidationError("360°邀请设置格式不正确")
                default_invite = str(invite.get("default_invite") or "DIRECT_SUBORDINATES")
                if default_invite not in {"DIRECT_SUBORDINATES", "NONE"}:
                    raise ProjectValidationError("默认邀请方式不合法")
                minimum = invite.get("minimum_invited_count", 0)
                if not isinstance(minimum, int) or isinstance(minimum, bool) or minimum < 0 or minimum > 100:
                    raise ProjectValidationError("最少邀请人数不合法")
                maximum = invite.get("maximum_invited_count")
                if maximum is not None and (not isinstance(maximum, int) or isinstance(maximum, bool) or maximum > 100 or maximum <= minimum):
                    raise ProjectValidationError("需大于最少邀请人数")
                maximum_mode = invite.get("maximum_invite_mode", "SUGGESTED")
                if maximum_mode not in {"SUGGESTED", "LIMIT"}:
                    raise ProjectValidationError("最多邀请人数提示方式不合法")
                second_enabled = invite.get("second_prompt_enabled", False)
                if not isinstance(second_enabled, bool):
                    raise ProjectValidationError("二次触发提示设置不合法")
                second_count = invite.get("second_prompt_count")
                if second_enabled and (maximum is None or not isinstance(second_count, int) or isinstance(second_count, bool) or second_count > 100 or second_count <= maximum):
                    raise ProjectValidationError("需大于最多邀请人数")
                if not second_enabled and second_count is not None:
                    raise ProjectValidationError("二次触发提示人数不合法")
                second_mode = invite.get("second_prompt_mode", "SUGGESTED")
                if second_mode not in {"SUGGESTED", "LIMIT"}:
                    raise ProjectValidationError("二次触发提示方式不合法")
                recommended = invite.get("recommended_invite", [])
                if not isinstance(recommended, list) or not all(isinstance(item, str) and item.strip() for item in recommended):
                    raise ProjectValidationError("推荐邀请设置格式不正确")
                normalized["invite"] = {
                    "default_invite": default_invite,
                    "minimum_invited_count": minimum,
                    **({
                        "maximum_invited_count": maximum,
                        "maximum_invite_mode": maximum_mode,
                        "second_prompt_enabled": second_enabled,
                        "second_prompt_count": second_count,
                        "second_prompt_mode": second_mode,
                    } if any(key in invite for key in ("maximum_invited_count", "maximum_invite_mode", "second_prompt_enabled", "second_prompt_count", "second_prompt_mode")) else {}),
                    "exclude_default_invite_from_limit": bool(invite.get("exclude_default_invite_from_limit", False)),
                    "recommended_invite": list(dict.fromkeys(recommended)),
                    "allow_voluntary_evaluation": bool(invite.get("allow_voluntary_evaluation", False)),
                }
            calibration = raw.get("calibration")
            if calibration is not None:
                if not isinstance(calibration, dict) or not isinstance(calibration.get("phases", []), list):
                    raise ProjectValidationError("校准设置格式不正确")
                if len(calibration.get("phases", [])) > MAX_PROJECT_FLOW_NODES:
                    raise ProjectValidationError("校准阶段不能超过 100 个")
                phases = []
                phase_ids = set()
                for index, phase in enumerate(calibration.get("phases", [])):
                    if not isinstance(phase, dict) or not isinstance(phase.get("rules", []), list):
                        raise ProjectValidationError("校准阶段设置格式不正确")
                    phase_id = phase.get("phase_id", f"phase-{index + 1}")
                    if not isinstance(phase_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,95}", phase_id) or phase_id in {"constructor", "prototype"} or phase_id in phase_ids:
                        raise ProjectValidationError("校准阶段标识不合法或重复")
                    phase_ids.add(phase_id)
                    rules = []
                    for rule in phase.get("rules", []):
                        if (not isinstance(rule, dict) or not rule
                                or set(rule) - {"subject_type", "operator", "scope", "allow_authorize", "subject_source", "subject_groups", "scope_groups", "description"}):
                            raise ProjectValidationError("校准规则设置格式不正确")
                        subject_type = rule.get("subject_type", "PERSON")
                        operator = rule.get("operator", "INCLUDE")
                        scope = rule.get("scope", "PROJECT_ALL")
                        if subject_type != "PERSON" or operator not in {"INCLUDE", "EXCLUDE"} or scope not in {"PROJECT_ALL", "RULE"}:
                            raise ProjectValidationError("校准规则设置不合法")
                        normalized_rule = {
                            "subject_type": subject_type,
                            "operator": operator,
                            "scope": scope,
                            "allow_authorize": bool(rule.get("allow_authorize", False)),
                        }
                        if "subject_source" in rule:
                            if rule["subject_source"] != "RULE":
                                raise ProjectValidationError("校准人来源不合法")
                            normalized_rule["subject_source"] = "RULE"
                        if "subject_groups" in rule:
                            normalized_rule["subject_groups"] = cls._validate_calibration_groups(rule["subject_groups"], allowed_fields={"employee"})
                        if "scope_groups" in rule:
                            normalized_rule["scope_groups"] = cls._validate_calibration_groups(rule["scope_groups"], allowed_fields={"department", "employee", "hire_date", "calibrator_relation"})
                        if scope == "RULE" and "scope_groups" not in normalized_rule:
                            raise ProjectValidationError("规则校准范围不能为空")
                        if "description" in rule:
                            description = rule["description"]
                            if not isinstance(description, str) or len(description.strip()) > 500:
                                raise ProjectValidationError("校准规则说明不合法")
                            normalized_rule["description"] = description.strip()
                        rules.append(normalized_rule)
                    phases.append({"rules": rules, **({"phase_id": phase_id} if "phase_id" in phase else {})})
                normalized["calibration"] = {
                    "force_distribution_enabled": bool(calibration.get("force_distribution_enabled", False)),
                    **({"distribution": cls._validate_distribution(calibration.get("distribution"))} if "distribution" in calibration else {}),
                    "phases": phases,
                }
            result_view = raw.get("result_view")
            if result_view is not None:
                if not isinstance(result_view, dict):
                    raise ProjectValidationError("结果开通方式不合法")
                automatic = result_view.get("automatic_enabled", False)
                manual = result_view.get("manual_enabled", False)
                rule = result_view.get("automatic_rule", "PREVIOUS_AND_START")
                if not isinstance(automatic, bool) or not isinstance(manual, bool) or rule not in {"PREVIOUS_AND_START", "PREVIOUS_IMMEDIATE"}:
                    raise ProjectValidationError("结果开通方式不合法")
                normalized["result_view"] = {"automatic_enabled": automatic, "manual_enabled": manual, "automatic_rule": rule}
            reconsideration = raw.get("result_reconsideration")
            if reconsideration is not None:
                if not isinstance(reconsideration, dict):
                    raise ProjectValidationError("结果复议设置格式不正确")
                handler = reconsideration.get("handler")
                if handler is not None and (not isinstance(handler, str) or len(handler) > 128):
                    raise ProjectValidationError("结果复议处理人不合法")
                normalized["result_reconsideration"] = {"handler": handler}
            normalized_nodes[node_id] = normalized
        node_times = flow_settings.get("node_times", {})
        if not isinstance(node_times, dict):
            raise ProjectValidationError("节点时间设置格式不正确")
        if len(node_times) > MAX_PROJECT_FLOW_NODES:
            raise ProjectValidationError(f"节点时间设置不能超过 {MAX_PROJECT_FLOW_NODES} 个")
        normalized_times: dict[str, dict[str, Any]] = {}
        for node_id, raw in node_times.items():
            if not isinstance(node_id, str) or not node_id.strip() or len(node_id) > 96 or not isinstance(raw, dict):
                raise ProjectValidationError("节点时间设置格式不正确")
            values: dict[str, str] = {}
            for field in ("start_at", "end_at", "appeal_deadline"):
                if field != "appeal_deadline" and "phase_times" in raw:
                    continue
                value = raw.get(field)
                if value is not None:
                    if not isinstance(value, str) or len(value) > 64:
                        raise ProjectValidationError("节点时间格式不正确")
                    _parse_time(value)
                    values[field] = value
            start_at = _parse_time(values.get("start_at"))
            end_at = _parse_time(values.get("end_at") or values.get("appeal_deadline"))
            if start_at and end_at and end_at <= start_at:
                raise ProjectValidationError("流程节点截止时间必须晚于开始时间")
            normalized_times[node_id] = values
            if "phase_times" in raw and not normalized_nodes.get(node_id, {}).get("calibration"):
                raise ProjectValidationError("阶段时间必须对应校准环节")
        previous_times = (existing_flow_settings or {}).get("node_times") or {}
        previous_nodes = (existing_flow_settings or {}).get("node_settings") or {}
        for node_id, setting in normalized_nodes.items():
            phases = (setting.get("calibration") or {}).get("phases") or []
            raw = node_times.get(node_id) or {}
            previous = previous_times.get(node_id) or {}
            if "phase_times" not in raw and "phase_times" not in previous:
                continue
            previous_phases = ((previous_nodes.get(node_id) or {}).get("calibration") or {}).get("phases") or []
            if any("phase_id" in phase for phase in previous_phases) and any("phase_id" not in phase for phase in phases):
                raise ProjectValidationError("请刷新项目后再修改校准阶段，避免阶段时间错配")
            ids = [phase.get("phase_id", f"phase-{index + 1}") for index, phase in enumerate(phases)]
            phase_times = raw.get("phase_times", previous.get("phase_times", {}))
            if not phases or not isinstance(phase_times, dict) or len(phase_times) > MAX_PROJECT_FLOW_NODES:
                raise ProjectValidationError("校准阶段时间设置格式不正确")
            if "phase_times" in raw and set(phase_times) - set(ids):
                raise ProjectValidationError("校准阶段时间与阶段配置不一致")
            ranges = {}
            for index, phase_id in enumerate(ids):
                value = phase_times.get(phase_id, {})
                if not isinstance(value, dict) or set(value) - {"start_at", "end_at"}:
                    raise ProjectValidationError("校准阶段时间设置格式不正确")
                timing = {}
                for field in ("start_at", "end_at"):
                    timestamp = value.get(field, "")
                    if not isinstance(timestamp, str) or len(timestamp) > 64:
                        raise ProjectValidationError("校准阶段时间格式不正确")
                    _parse_time(timestamp)
                    timing[field] = timestamp
                start, end = _parse_time(timing["start_at"]), _parse_time(timing["end_at"])
                if start and end and end <= start:
                    raise ProjectValidationError(f"校准第 {index + 1} 阶段截止时间必须晚于开始时间")
                ranges[phase_id] = timing
            values = normalized_times.setdefault(node_id, {})
            values["phase_times"] = ranges
            complete = all(timing["start_at"] and timing["end_at"] for timing in ranges.values())
            values["start_at"] = min((timing["start_at"] for timing in ranges.values()), key=_parse_time) if complete else ""
            values["end_at"] = max((timing["end_at"] for timing in ranges.values()), key=_parse_time) if complete else ""
        return {"node_settings": normalized_nodes, "node_times": normalized_times}

    @classmethod
    def _validate_payload(cls, payload: dict[str, Any], existing_settings: dict[str, Any] | None = None) -> tuple[str, str | None, list[str], dict[str, Any]]:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise ProjectValidationError("项目名称不能为空")
        if len(name) > 128:
            raise ProjectValidationError("项目名称不能超过 128 个字符")
        description = payload.get("description")
        if description is not None:
            description = str(description).strip() or None
            if description and len(description) > 500:
                raise ProjectValidationError("项目描述不能超过 500 个字符")
        administrators = payload.get("administrators") or []
        if not isinstance(administrators, list) or len(administrators) > 50:
            raise ProjectValidationError("项目管理员数量不能超过 50 人")
        normalized = []
        for administrator in administrators:
            value = str(administrator).strip()
            if not value:
                continue
            if len(value) > 128:
                raise ProjectValidationError("项目管理员名称不能超过 128 个字符")
            if value not in normalized:
                normalized.append(value)
        settings = dict(existing_settings or {})
        if payload.get("data_managers") is not None:
            managers = payload["data_managers"]
            if not managers or any(manager not in {"PROJECT_ADMIN", "HRBP"} for manager in managers):
                raise ProjectValidationError("请选择谁可管理人员绩效数据")
            settings["data_managers"] = list(dict.fromkeys(managers))
        settings.setdefault("data_managers", ["HRBP"])
        if payload.get("scope_limited") is not None:
            settings["scope_limited"] = bool(payload["scope_limited"])
        settings.setdefault("scope_limited", False)
        if payload.get("scope_employee_nos") is not None:
            settings["scope_employee_nos"] = list(dict.fromkeys(str(value).strip() for value in payload["scope_employee_nos"] if str(value).strip()))
        settings.setdefault("scope_employee_nos", [])
        if "scope_rules" in payload and payload.get("scope_rules") is not None:
            settings["scope_rules"] = cls._validate_scope_rules(payload.get("scope_rules"))
        elif settings.get("scope_employee_nos") and not settings.get("scope_rules", {}).get("groups"):
            settings["scope_rules"] = {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": list(settings["scope_employee_nos"])}]}]}
        settings.setdefault("scope_rules", {"groups": []})
        if settings.get("scope_limited") and not settings["scope_rules"].get("groups"):
            raise ProjectValidationError("开启限定考核范围后至少需要配置一条条件")
        if "template_id" in payload:
            template_id = payload.get("template_id")
            if template_id is not None and int(template_id) <= 0:
                raise ProjectValidationError("绩效模板不合法")
            settings["template_id"] = int(template_id) if template_id is not None else None
        if "start_at" in payload:
            settings["start_at"] = payload.get("start_at")
        if "end_at" in payload:
            settings["end_at"] = payload.get("end_at")
        if "evaluator_rules" in payload and payload.get("evaluator_rules") is not None:
            settings["evaluator_rules"] = cls._validate_rules(payload.get("evaluator_rules"))
        if "flow_settings" in payload and payload.get("flow_settings") is not None:
            settings["flow_settings"] = cls._validate_flow_settings(payload.get("flow_settings"), settings.get("flow_settings"))
        settings.setdefault("flow_settings", {"node_settings": {}})
        start_at = settings.get("start_at")
        end_at = settings.get("end_at")
        if start_at and end_at and end_at <= start_at:
            raise ProjectValidationError("项目截止时间必须晚于开始时间")
        return name, description, normalized, settings

    @classmethod
    async def _manual_opening_allowed_for_new_project(cls, db: AsyncSession) -> bool:
        setting = await db.get(PerformanceOtherSetting, 1)
        return setting is None or bool(setting.manual_result_opening_enabled)

    async def _validate_manual_opening_policy(self, flow_settings: dict[str, Any], existing_settings: dict[str, Any] | None = None) -> None:
        if await self._manual_opening_allowed_for_new_project(self.db):
            return
        previous_nodes = (existing_settings or {}).get("flow_settings", {}).get("node_settings", {})
        for node_id, node_settings in flow_settings.get("node_settings", {}).items():
            if not (node_settings.get("result_view") or {}).get("manual_enabled"):
                continue
            if ((previous_nodes.get(node_id) or {}).get("result_view") or {}).get("manual_enabled"):
                continue
            raise ProjectValidationError("组织内暂不允许手动开通绩效结果")

    async def _validate_distribution_template_options(self, template_id: int | None, flow_settings: dict[str, Any]) -> None:
        configured = []
        for node_settings in (flow_settings.get("node_settings") or {}).values():
            calibration = node_settings.get("calibration") or {}
            if calibration.get("force_distribution_enabled"):
                configured.extend((calibration.get("distribution") or {}).get("rules") or [])
        if not configured:
            return
        workflow = await self.db.get(PerformanceTemplateWorkflow, int(template_id)) if template_id else None
        if workflow is None:
            raise ProjectValidationError("绩效结果分布规则缺少可用的绩效模板")
        options = distribution_assessment_options(list(workflow.nodes or []), list(workflow.content_library or []))
        allowed = {
            option["id"]: {
                value
                for grade in option["grade_options"]
                for value in (grade["value"], grade.get("legacy_value"))
                if value
            }
            for option in options
        }
        for rule in configured:
            item_id = rule["assessment_item_id"]
            if item_id not in allowed:
                raise ProjectValidationError("绩效结果分布规则的评估项不属于当前模板")
            if any(set(condition["grade_codes"]) - allowed[item_id] for condition in rule["conditions"]):
                raise ProjectValidationError("绩效结果分布规则的等级不属于所选评估项")

    async def validate_template(self, cycle_ref: str, template_id: int | None) -> None:
        if template_id is None:
            return
        from app.performance.cycle_service import PerformanceCycleService
        from app.performance.models import PerformanceTemplate

        cycle = await self.db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == cycle_ref).with_for_update().execution_options(populate_existing=True))
        if cycle is None or template_id not in PerformanceCycleService.template_ids(cycle):
            raise ProjectValidationError("只能选择当前绩效周期已配置的模板")
        template = await self.db.get(PerformanceTemplate, template_id)
        if template is None or template.template_kind != "performance" or template.status != "active":
            raise ProjectValidationError("只能选择已启用的绩效模板")

    async def create_project(self, cycle_ref: str, payload: dict[str, Any], *, actor_type: str, actor_id: int) -> PerformanceProject:
        name, description, administrators, settings = self._validate_payload(payload)
        await self.validate_template(cycle_ref, settings.get("template_id"))
        await self._validate_distribution_template_options(settings.get("template_id"), settings["flow_settings"])
        await self._validate_manual_opening_policy(settings["flow_settings"])
        project = PerformanceProject(
            project_ref=f"project:{uuid4().hex}",
            cycle_ref=cycle_ref,
            name=name,
            description=description,
            administrators=administrators,
            settings=settings,
            status=PROJECT_STATUS_DRAFT,
            evaluated_count=int(payload.get("evaluated_count") or 0),
        )
        self.db.add(project)
        await self.db.flush()
        self.audit.append_event(AuditEventInput(
            event_type="PERFORMANCE_PROJECT_CREATED",
            cycle_ref=cycle_ref,
            actor_type=actor_type,
            actor_ref=_actor_ref(actor_id),
            subject_type="PERFORMANCE_PROJECT",
            subject_ref=project.project_ref,
            after_state=self.serialize(project),
        ))
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def update_project(self, project: PerformanceProject, payload: dict[str, Any], *, actor_type: str, actor_id: int) -> PerformanceProject:
        before = self.serialize(project)
        values = {**before, **payload}
        name, description, administrators, settings = self._validate_payload(values, project.settings or {})
        if settings.get("template_id") != (project.settings or {}).get("template_id"):
            if project.status == PROJECT_STATUS_STARTED:
                raise ProjectValidationError("已启动项目不能更换绩效模板")
            await self.validate_template(project.cycle_ref, settings.get("template_id"))
        await self._validate_distribution_template_options(settings.get("template_id"), settings["flow_settings"])
        await self._validate_manual_opening_policy(settings["flow_settings"], project.settings or {})
        if project.status == PROJECT_STATUS_STARTED and "flow_settings" in payload:
            previous_flow = (project.settings or {}).get("flow_settings") or {}
            previous_opening = previous_flow.get("node_settings") or {}
            new_opening = (settings.get("flow_settings") or {}).get("node_settings") or {}
            for node_id in previous_opening.keys() | new_opening.keys():
                if (previous_opening.get(node_id) or {}).get("calibration") != (new_opening.get(node_id) or {}).get("calibration"):
                    raise ProjectValidationError("已启动项目不能修改校准规则或阶段，请保留历史任务范围")
            for node_id, node_settings in previous_opening.items():
                if "result_view" in node_settings and node_settings.get("result_view") != new_opening.get(node_id, {}).get("result_view"):
                    raise ProjectValidationError("已启动项目不能修改结果开通方式")
        project.name = name
        project.description = description
        project.administrators = administrators
        project.settings = settings
        if "evaluated_count" in payload:
            project.evaluated_count = int(payload.get("evaluated_count") or 0)
        self.audit.append_event(AuditEventInput(
            event_type="PERFORMANCE_PROJECT_UPDATED",
            cycle_ref=project.cycle_ref,
            actor_type=actor_type,
            actor_ref=_actor_ref(actor_id),
            subject_type="PERFORMANCE_PROJECT",
            subject_ref=project.project_ref,
            before_state=before,
            after_state=self.serialize(project),
        ))
        await self.db.commit()
        await self.db.refresh(project)
        if project.status == PROJECT_STATUS_STARTED and "flow_settings" in payload:
            await self.backfill_workflow_nodes(
                project,
                ((project.settings or {}).get("flow_settings") or {}).get("node_times") or {},
                actor_type=actor_type,
                actor_id=actor_id,
            )
        return project

    @staticmethod
    def _validate_distribution_start_readiness(flow: dict[str, Any], nodes: list[dict]) -> None:
        for node in nodes:
            if node.get("node_type") != "calibration":
                continue
            calibration = (((flow.get("node_settings") or {}).get(node.get("node_id")) or {}).get("calibration") or {})
            if not calibration.get("force_distribution_enabled", False):
                continue
            distribution = calibration.get("distribution") or {}
            if distribution.get("mode") == "BY_CALIBRATION_SCOPE" and not distribution.get("scope_configured"):
                raise ProjectValidationError("请完善绩效结果强制 / 建议分布的按校准范围配置规则")
            if distribution.get("mode", "UNIFIED") == "UNIFIED" and not distribution.get("rules"):
                raise ProjectValidationError("请至少添加一条绩效结果强制 / 建议分布规则")

    @staticmethod
    def _person_value(person: Any, key: str) -> Any:
        return person.get(key) if isinstance(person, dict) else getattr(person, key, None)

    @classmethod
    def _person_values(cls, person: Any) -> dict[str, Any]:
        return {
            "department": organization_path(person) or "",
            "employee_type": cls._person_value(person, "employee_type") or "",
            "employee": cls._person_value(person, "employee_no") or "",
            "hire_date": cls._person_value(person, "hire_date"),
            **{field: cls._person_value(person, field) for field in (
                "employment_status", "departure_date", "job_family", "job_category", "position_level", "standard_position"
            )},
        }

    @classmethod
    def _matching_people(cls, people, settings, *, group_index: int | None = None):
        groups = (settings.get("evaluator_rules") or {}).get("groups") or []
        scope_groups = (settings.get("scope_rules") or {}).get("groups") or []
        if group_index is not None:
            groups = [groups[group_index]] if 0 <= group_index < len(groups) else []
        selected = []
        for person in people:
            values = cls._person_values(person)
            if scope_groups and not any(all(_matches_scope_condition(values, condition) for condition in group.get("conditions", [])) for group in scope_groups):
                continue
            if any(all(_matches_start_project_condition(values, condition) for condition in group.get("conditions", [])) for group in groups):
                selected.append(person)
        return selected

    @classmethod
    def _is_report_only_leaver(cls, person: Any, cycle: PerformanceCycle) -> bool:
        return (
            cls._person_value(person, "employment_status") == "离职"
            and cycle.leaver_participation_mode == CYCLE_LEAVER_MODE_REPORT_ONLY
            and bool(cycle.leaver_enabled)
        )

    @classmethod
    def _cycle_eligible_people(cls, people, cycle: PerformanceCycle) -> list[Any]:
        eligible = []
        for person in people:
            if cls._person_value(person, "employment_status") == "离职":
                departure = cls._person_value(person, "departure_date")
                if (not cycle.leaver_enabled or departure is None
                        or cycle.leaver_start_date is None or cycle.leaver_end_date is None
                        or not (cycle.leaver_start_date <= departure <= cycle.leaver_end_date)):
                    continue
            eligible.append(person)
        return eligible

    @classmethod
    def _classify_people(cls, people, settings, cycle: PerformanceCycle, *, group_index: int | None = None) -> tuple[list[Any], list[Any]]:
        matched = cls._matching_people(cls._cycle_eligible_people(people, cycle), settings, group_index=group_index)
        report_only = [person for person in matched if cls._is_report_only_leaver(person, cycle)]
        report_only_numbers = {person.employee_no for person in report_only}
        task_people = [person for person in matched if person.employee_no not in report_only_numbers]
        return task_people, report_only

    @classmethod
    def _select_people(cls, people, settings):
        return cls._matching_people(people, settings)

    async def calibration_preview(self, project, payload):
        _, _, _, settings = self._validate_payload({**self.serialize(project), **payload}, project.settings or {})
        if project.status == PROJECT_STATUS_STARTED:
            snapshots = (await self.db.execute(select(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.project_id == project.id, PerformanceProjectNodeSnapshot.node_type == "calibration"))).scalars().all()
            return {node.node_id: (node.config or {}).get("calibration") for node in snapshots}
        cycle = await self.db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == project.cycle_ref))
        _, people = await self._cycle_snapshot_people(cycle)
        task_people, _report_only = self._classify_people(people, settings, cycle)
        workflow = await self.db.get(PerformanceTemplateWorkflow, settings.get("template_id"))
        nodes = [node for node in (workflow.nodes if workflow else []) if node.get("node_type") == "calibration"]
        try:
            await validate_executor_roles(self.db, [normalize_executor_identity(node) for node in nodes])
            return {node["node_id"]: resolve_calibration(node, settings.get("flow_settings") or {}, {person.employee_no: person for person in people}, [person.employee_no for person in task_people]) for node in nodes}
        except ValueError as exc:
            raise ProjectValidationError(str(exc)) from exc

    def _add_calibration_tasks(self, project, member_snapshot, node_snapshot, calibration, timing):
        for phase in calibration["phases"]:
            window = (timing.get("phase_times") or {}).get(phase["phase_id"]) or {}
            if not window.get("start_at") or not window.get("end_at"):
                raise ProjectValidationError("请配置每个校准阶段的开始与截止时间")
            for assignment in phase["assignments"]:
                self.db.add(PerformanceNodeTask(project_id=project.id, cycle_ref=project.cycle_ref, member_snapshot_id=member_snapshot.id, node_snapshot_id=node_snapshot.id, target_employee_no=assignment["employee_no"], handler_ref=assignment["handler_ref"], task_kind="calibration", phase_id=phase["phase_id"], available_at=_parse_time(window["start_at"]), due_at=_parse_time(window["end_at"]), status="pending"))

    async def start_project(self, project: PerformanceProject, *, actor_type: str, actor_id: int) -> PerformanceProject:
        if project.status == PROJECT_STATUS_STARTED:
            return project
        if project.status != PROJECT_STATUS_DRAFT:
            raise ProjectValidationError("当前项目状态不允许启动")
        cycle = await self.db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == project.cycle_ref).with_for_update())
        if cycle is None:
            raise ProjectValidationError("绩效周期不存在")
        authorization_snapshot, people = await self._cycle_snapshot_people(cycle)
        if authorization_snapshot.status != AUTHORIZATION_SNAPSHOT_STATUS_LOCKED:
            raise ProjectValidationError("周期人员快照尚未锁定")
        rules = (project.settings or {}).get("evaluator_rules") or {}
        groups = rules.get("groups") or []
        if not groups:
            raise ProjectValidationError("项目未配置被评估人")
        people_by_employee = {person.employee_no: person for person in people}
        project_manager_rows = (await self.db.execute(select(PerformanceCycleProjectManager).where(PerformanceCycleProjectManager.cycle_ref == project.cycle_ref))).scalars().all()
        project_managers = {row.target_employee_no: row.manager_employee_no for row in project_manager_rows}
        task_people, report_only = self._classify_people(people, project.settings or {}, cycle)
        selected = sorted([*task_people, *report_only], key=lambda person: (getattr(person, "display_name", ""), person.employee_no))
        if not selected:
            raise ProjectValidationError("项目没有可用的被评估人")
        owned_elsewhere = await self.db.scalar(
            select(PerformanceProjectMember.employee_no)
            .join(PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.id == PerformanceProjectMember.snapshot_id)
            .join(PerformanceProject, PerformanceProject.id == PerformanceProjectMemberSnapshot.project_id)
            .where(
                PerformanceProject.cycle_ref == project.cycle_ref,
                PerformanceProject.id != project.id,
                PerformanceProject.status == PROJECT_STATUS_STARTED,
                PerformanceProjectMember.employee_no.in_([person.employee_no for person in selected]),
            ).limit(1)
        )
        if owned_elsewhere:
            raise ProjectValidationError(f"被评估人 {owned_elsewhere} 已参加本周期其他项目")
        workflow = None
        template_id = (project.settings or {}).get("template_id")
        if template_id:
            workflow = await self.db.get(PerformanceTemplateWorkflow, int(template_id))
        nodes = list((workflow.nodes if workflow else []) or [])
        if not nodes:
            raise ProjectValidationError("项目未配置流程节点")
        try:
            nodes = [normalize_executor_identity(node) for node in nodes]
        except ValueError as exc:
            raise ProjectValidationError(str(exc)) from exc
        if any("PROJECT_MANAGER" in (node.get("executor_types") or []) for node in nodes):
            missing = [person.employee_no for person in task_people if person.employee_no not in project_managers]
            if missing:
                raise ProjectValidationError(f"被评估人 {missing[0]} 未导入直属项目上级")
        result_view_nodes = [node for node in nodes if node.get("node_type") == "result_view"]
        if len(result_view_nodes) != 1:
            raise ProjectValidationError("项目必须配置一个绩效结果查看环节")
        result_view_key = str(result_view_nodes[0].get("node_id") or "")
        opening = (((project.settings or {}).get("flow_settings") or {}).get("node_settings") or {}).get(result_view_key, {}).get("result_view") or {}
        if not opening.get("automatic_enabled") and not opening.get("manual_enabled"):
            raise ProjectValidationError("请至少选择一种方式")
        if sum(bool(node.get("include_final_result")) for node in nodes) != 1:
            raise ProjectValidationError("请且仅请选择一个环节作为最终结果")
        flow = (project.settings or {}).get("flow_settings") or {}
        self._validate_distribution_start_readiness(flow, nodes)
        try:
            await validate_executor_roles(self.db, nodes)
            calibration = {node["node_id"]: resolve_calibration(node, flow, people_by_employee, [person.employee_no for person in task_people], require_complete=True) for node in nodes if node.get("node_type") == "calibration"}
        except ValueError as exc:
            raise ProjectValidationError(str(exc)) from exc
        content_library = list((workflow.content_library if workflow else []) or [])
        before = self.serialize(project)
        member_snapshot = PerformanceProjectMemberSnapshot(
            project_id=project.id,
            cycle_ref=project.cycle_ref,
            snapshot_version=1,
            source_snapshot_id=authorization_snapshot.id,
            source_filter=rules,
        )
        self.db.add(member_snapshot)
        await self.db.flush()
        for person in selected:
            self.db.add(PerformanceProjectMember(
                snapshot_id=member_snapshot.id,
                employee_no=person.employee_no,
                portal_user_id=person.portal_user_id,
                display_name=person.display_name,
                **{field: getattr(person, field) for field in ORGANIZATION_FIELDS},
                organization_ref=organization_path(person),
                direct_supervisor_employee_no=person.direct_supervisor_employee_no,
                project_manager_employee_no=project_managers.get(person.employee_no),
                hrbp_employee_no=person.hrbp_employee_no,
                employee_type=person.employee_type,
                employment_status=person.employment_status,
                job_family=person.job_family,
                job_category=person.job_category,
                standard_position=person.standard_position,
                position_level=person.position_level,
                hire_date=person.hire_date,
            ))
        flow_settings = (project.settings or {}).get("flow_settings") or {}
        node_times = flow_settings.get("node_times") or {}
        for index, source_node in enumerate(nodes):
            node_type = source_node.get("node_type")
            if node_type == "calibration":
                final_node = next(node for node in nodes if node.get("include_final_result"))
                raw_node = calibration_template(source_node, final_node, content_library)
            else:
                raw_node = resolve_self_summary_content(source_node, content_library) if node_type in {"work_summary", "evaluation"} else source_node
            raw_node = await hydrate_self_summary_template(raw_node, self.db) if node_type in {"work_summary", "evaluation", "calibration"} else raw_node
            node_id = str(raw_node.get("node_id") or f"node-{index + 1}")
            node_snapshot = PerformanceProjectNodeSnapshot(
                project_id=project.id,
                node_id=node_id,
                node_type=node_type,
                name=str(raw_node.get("name") or node_id),
                node_order=int(raw_node.get("order") or index + 1),
                config={"template": raw_node, "time": node_times.get(node_id) or {}},
            )
            if node_type == "calibration":
                node_snapshot.config = {**node_snapshot.config, "calibration": calibration[node_id]}
            self.db.add(node_snapshot)
            await self.db.flush()
            if node_type == "calibration":
                self._add_calibration_tasks(project, member_snapshot, node_snapshot, calibration[node_id], node_times.get(node_id) or {})
                continue
            if node_type == "result_view":
                continue
            for person in task_people:
                handlers = _resolve_node_handlers(raw_node, person, people_by_employee)
                if "PROJECT_MANAGER" in (raw_node.get("executor_types") or []):
                    handlers.add(project_managers[person.employee_no])
                for handler in sorted(handlers):
                    timing = node_times.get(node_id) or {}
                    self.db.add(PerformanceNodeTask(
                        project_id=project.id,
                        cycle_ref=project.cycle_ref,
                        member_snapshot_id=member_snapshot.id,
                        node_snapshot_id=node_snapshot.id,
                        target_employee_no=person.employee_no,
                        handler_ref=str(handler),
                        task_kind=node_type,
                        available_at=_parse_time(timing.get("start_at")),
                        due_at=_parse_time(timing.get("end_at") or timing.get("appeal_deadline")),
                        status="pending",
                    ))
        project.status = PROJECT_STATUS_STARTED
        self.audit.append_event(AuditEventInput(
            event_type="PERFORMANCE_PROJECT_STARTED",
            cycle_ref=project.cycle_ref,
            actor_type=actor_type,
            actor_ref=_actor_ref(actor_id),
            subject_type="PERFORMANCE_PROJECT",
            subject_ref=project.project_ref,
            before_state=before,
            after_state={**self.serialize(project), "member_snapshot_id": member_snapshot.id},
        ))
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def backfill_workflow_nodes(
        self,
        project: PerformanceProject,
        node_times: dict[str, dict],
        *,
        actor_type: str,
        actor_id: int,
    ) -> list[str]:
        if project.status != PROJECT_STATUS_STARTED:
            raise ProjectValidationError("仅已启动项目可补建流程节点")
        template_id = (project.settings or {}).get("template_id")
        workflow = await self.db.get(PerformanceTemplateWorkflow, int(template_id)) if template_id else None
        if workflow is None:
            return []
        existing = list((await self.db.execute(select(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.project_id == project.id))).scalars())
        existing_ids = {node.node_id for node in existing}
        pending = [node for node in (workflow.nodes or []) if str(node.get("node_id")) not in existing_ids]
        if any(node.get("node_type") == "calibration" for node in pending):
            raise ProjectValidationError("已启动项目不能补建校准范围，请为新项目配置校准阶段")
        pending_ids = {str(node.get("node_id")) for node in pending}
        normalized_times = self._validate_flow_settings({"node_settings": {}, "node_times": node_times})["node_times"]
        if not pending:
            return []
        if not pending_ids.issubset(normalized_times):
            raise ProjectValidationError("请配置全部待补建节点的起止时间")
        normalized_times = {node_id: normalized_times[node_id] for node_id in pending_ids}
        member_snapshot = await self.db.scalar(select(PerformanceProjectMemberSnapshot).where(PerformanceProjectMemberSnapshot.project_id == project.id).order_by(PerformanceProjectMemberSnapshot.id))
        if member_snapshot is None:
            raise ProjectValidationError("项目成员快照不存在")
        members = list((await self.db.execute(select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == member_snapshot.id))).scalars())
        if any("PROJECT_MANAGER" in (node.get("executor_types") or []) for node in pending):
            missing = [member.employee_no for member in members if not member.project_manager_employee_no]
            if missing:
                raise ProjectValidationError(f"被评估人 {missing[0]} 缺少已冻结的直属项目上级")
        people = list((await self.db.execute(select(PerformanceAuthorizationSnapshotPerson).where(PerformanceAuthorizationSnapshotPerson.snapshot_id == member_snapshot.source_snapshot_id))).scalars())
        people_by_employee = {person.employee_no: person for person in people}
        settings = dict(project.settings or {})
        flow_settings = dict(settings.get("flow_settings") or {})
        saved_times = dict(flow_settings.get("node_times") or {})
        created_ids: list[str] = []
        for index, source_node in enumerate(pending):
            node_id = str(source_node["node_id"])
            node_type = source_node.get("node_type")
            raw_node = resolve_self_summary_content(source_node, list(workflow.content_library or [])) if node_type in {"work_summary", "evaluation"} else source_node
            raw_node = await hydrate_self_summary_template(raw_node, self.db) if node_type in {"work_summary", "evaluation"} else raw_node
            snapshot = PerformanceProjectNodeSnapshot(project_id=project.id, node_id=node_id, node_type=node_type, name=str(raw_node.get("name") or node_id), node_order=int(raw_node.get("order") or index + 1), config={"template": raw_node, "time": normalized_times[node_id]})
            self.db.add(snapshot)
            await self.db.flush()
            if node_type != "result_view":
                for person in members:
                    handlers = _resolve_node_handlers(raw_node, person, people_by_employee)
                    for handler in sorted(handlers):
                        timing = normalized_times[node_id]
                        self.db.add(PerformanceNodeTask(project_id=project.id, cycle_ref=project.cycle_ref, member_snapshot_id=member_snapshot.id, node_snapshot_id=snapshot.id, target_employee_no=person.employee_no, handler_ref=str(handler), task_kind=node_type, available_at=_parse_time(timing.get("start_at")), due_at=_parse_time(timing.get("end_at") or timing.get("appeal_deadline")), status="pending"))
            saved_times[node_id] = normalized_times[node_id]
            created_ids.append(node_id)
        flow_settings["node_times"] = saved_times
        settings["flow_settings"] = flow_settings
        project.settings = settings
        self.audit.append_event(AuditEventInput(event_type="PERFORMANCE_PROJECT_WORKFLOW_NODES_BACKFILLED", cycle_ref=project.cycle_ref, actor_type=actor_type, actor_ref=_actor_ref(actor_id), subject_type="PERFORMANCE_PROJECT", subject_ref=project.project_ref, after_state={"node_ids": created_ids}))
        await self.db.commit()
        await self.db.refresh(project)
        return created_ids

    async def copy_project(self, project: PerformanceProject, *, actor_type: str, actor_id: int) -> PerformanceProject:
        copy_name = f"{project.name}（副本）"[:128]
        copied = PerformanceProject(
            project_ref=f"project:{uuid4().hex}",
            cycle_ref=project.cycle_ref,
            name=copy_name,
            description=project.description,
            administrators=list(project.administrators or []),
            settings=dict(project.settings or {}),
            status=PROJECT_STATUS_DRAFT,
            evaluated_count=0,
        )
        self.db.add(copied)
        await self.db.flush()
        self.audit.append_event(AuditEventInput(
            event_type="PERFORMANCE_PROJECT_COPIED",
            cycle_ref=project.cycle_ref,
            actor_type=actor_type,
            actor_ref=_actor_ref(actor_id),
            subject_type="PERFORMANCE_PROJECT",
            subject_ref=copied.project_ref,
            before_state=self.serialize(project),
            after_state=self.serialize(copied),
        ))
        await self.db.commit()
        await self.db.refresh(copied)
        return copied

    async def delete_project(self, project: PerformanceProject, *, actor_type: str, actor_id: int) -> None:
        # 已启动项目同样允许删除（前端强确认「确认删除」后触发）；成员/节点快照与任务经 FK CASCADE 一并清理
        before = self.serialize(project)
        self.audit.append_event(AuditEventInput(
            event_type="PERFORMANCE_PROJECT_DELETED",
            cycle_ref=project.cycle_ref,
            actor_type=actor_type,
            actor_ref=_actor_ref(actor_id),
            subject_type="PERFORMANCE_PROJECT",
            subject_ref=project.project_ref,
            before_state=before,
        ))
        await self.db.delete(project)
        await self.db.commit()
