"""Project lifecycle services for cycle-scoped project configuration."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import DATA_TABLES
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.self_summary_service import hydrate_self_summary_template, resolve_self_summary_content
from app.performance.models import (
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceCycle,
    PerformanceNodeTask,
    PerformanceProject,
    PerformanceProjectMember,
    PerformanceProjectMemberSnapshot,
    PerformanceProjectNodeSnapshot,
    PerformanceTemplateWorkflow,
    PROJECT_STATUS_DRAFT,
    PROJECT_STATUS_STARTED,
    AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
)


class ProjectValidationError(ValueError):
    pass


DEFAULT_FLOW_SETTINGS = {"node_settings": {}}
MAX_PROJECT_FLOW_NODES = 100


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


def _column(table, *candidates: str):
    for candidate in candidates:
        if candidate in table.c:
            return table.c[candidate]
    return None


class PerformanceProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit = PerformanceAuditService(db)

    async def evaluator_options(self, cycle: PerformanceCycle) -> dict[str, list[dict[str, str]]]:
        locked_snapshot = await self.db.scalar(
            select(PerformanceAuthorizationSnapshot).where(
                PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref,
                PerformanceAuthorizationSnapshot.status == AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
            )
        )
        if locked_snapshot is not None:
            people = list((await self.db.execute(
                select(PerformanceAuthorizationSnapshotPerson).where(
                    PerformanceAuthorizationSnapshotPerson.snapshot_id == locked_snapshot.id
                )
            )).scalars().all())
            departments = sorted({person.organization_ref.strip() for person in people if person.organization_ref and person.organization_ref.strip()})
            employee_types = sorted({person.employment_status.strip() for person in people if person.employment_status and person.employment_status.strip()})
            employees = sorted(
                [
                    {"value": person.employee_no, "label": f"{person.display_name}（{person.employee_no}）"}
                    for person in people
                    if person.employee_no and person.display_name
                ],
                key=lambda item: item["value"],
            )
            return {
                "departments": [{"value": value, "label": value} for value in departments],
                "employee_types": [{"value": value, "label": value} for value in employee_types],
                "employees": employees,
            }
        model = DATA_TABLES.get("emp_realtime_roster")
        if model is None:
            return {"departments": [], "employee_types": [], "employees": []}
        table = model.__table__
        employee_no = _column(table, "employee_no")
        name = _column(table, "full_name", "chinese_name", "employee_name", "name")
        department = _column(table, "department", "company_org", "org_node_code")
        employee_type = _column(table, "employee_type", "employment_status")
        status_column = _column(table, "employment_status", "employee_status", "active_status")
        if employee_no is None or name is None:
            return {"departments": [], "employee_types": [], "employees": []}
        columns = {"employee_no": employee_no, "name": name}
        if department is not None:
            columns["department"] = department
        if employee_type is not None:
            columns["employee_type"] = employee_type
        if status_column is not None:
            columns["employment_status"] = status_column
        rows = (await self.db.execute(select(*[column.label(key) for key, column in columns.items()]))).mappings().all()
        departments = set(); employee_types = set(); employees = []
        for row in rows:
            employee_no_value = str(row.get("employee_no") or "").strip()
            name_value = str(row.get("name") or "").strip()
            if not employee_no_value or not name_value:
                continue
            if row.get("department"):
                departments.add(str(row["department"]).strip())
            if row.get("employee_type"):
                employee_types.add(str(row["employee_type"]).strip())
            employees.append({"value": employee_no_value, "label": f"{name_value}（{employee_no_value}）"})
        return {
            "departments": [{"value": value, "label": value} for value in sorted(departments)],
            "employee_types": [{"value": value, "label": value} for value in sorted(employee_types)],
            "employees": sorted(employees, key=lambda item: item["value"]),
        }

    async def evaluator_count(self, cycle: PerformanceCycle, rules: dict[str, Any]) -> int:
        model = DATA_TABLES.get("emp_realtime_roster")
        if model is None:
            return 0
        table = model.__table__
        employee_no = _column(table, "employee_no")
        name = _column(table, "full_name", "chinese_name", "employee_name", "name")
        department = _column(table, "department", "company_org", "org_node_code")
        employee_type = _column(table, "employee_type", "employment_status")
        status_column = _column(table, "employment_status", "employee_status", "active_status")
        departure_column = _column(table, "terminated_date", "departure_date", "leave_date", "termination_date")
        if employee_no is None or name is None:
            return 0
        columns = {"employee_no": employee_no, "name": name}
        for key, column in (("department", department), ("employee_type", employee_type), ("employment_status", status_column), ("departure_date", departure_column)):
            if column is not None:
                columns[key] = column
        rows = (await self.db.execute(select(*[column.label(key) for key, column in columns.items()]))).mappings().all()
        groups = (rules or {}).get("groups", [])
        if not groups:
            return 0
        count = 0
        for row in rows:
            if str(row.get("employment_status") or "").strip() == "离职":
                departure = row.get("departure_date")
                if not cycle.leaver_enabled or departure is None or cycle.leaver_start_date is None or cycle.leaver_end_date is None or not (cycle.leaver_start_date <= departure <= cycle.leaver_end_date):
                    continue
            values = {"department": str(row.get("department") or "").strip(), "employee_type": str(row.get("employee_type") or "").strip(), "employee": str(row.get("employee_no") or "").strip()}
            groups_match = any(all((values.get(condition.get("field"), "") in condition.get("values", [])) == (condition.get("operator") == "include") for condition in group.get("conditions", [])) for group in groups)
            if groups_match:
                count += 1
        return count

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
            "status": project.status,
            "evaluated_count": project.evaluated_count,
            "template_id": settings.get("template_id"),
            "start_at": settings.get("start_at"),
            "end_at": settings.get("end_at"),
            "evaluator_rules": settings.get("evaluator_rules", {"groups": []}),
            "flow_settings": settings.get("flow_settings", DEFAULT_FLOW_SETTINGS),
        }

    @classmethod
    def _validate_rules(cls, rules: Any) -> dict[str, list[dict[str, Any]]]:
        if rules is None:
            return {"groups": []}
        if not isinstance(rules, dict) or not isinstance(rules.get("groups"), list):
            raise ProjectValidationError("被评估人筛选规则格式不正确")
        allowed_fields = {"department", "employee_type", "employee"}
        allowed_operators = {"include", "exclude"}
        groups = []
        for group in rules["groups"]:
            conditions = group.get("conditions") if isinstance(group, dict) else None
            if not isinstance(conditions, list) or not conditions:
                raise ProjectValidationError("每个被评估人范围至少需要一个筛选条件")
            normalized_conditions = []
            for condition in conditions:
                if not isinstance(condition, dict) or condition.get("field") not in allowed_fields or condition.get("operator") not in allowed_operators:
                    raise ProjectValidationError("被评估人筛选条件不合法")
                values = [str(value).strip() for value in condition.get("values", []) if str(value).strip()]
                if not values:
                    raise ProjectValidationError("被评估人筛选条件不能为空")
                normalized_conditions.append({"field": condition["field"], "operator": condition["operator"], "values": values})
            groups.append({"conditions": normalized_conditions})
        return {"groups": groups}

    @classmethod
    def _validate_flow_settings(cls, flow_settings: Any) -> dict[str, Any]:
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
                recommended = invite.get("recommended_invite", [])
                if not isinstance(recommended, list) or not all(isinstance(item, str) and item.strip() for item in recommended):
                    raise ProjectValidationError("推荐邀请设置格式不正确")
                normalized["invite"] = {
                    "default_invite": default_invite,
                    "minimum_invited_count": minimum,
                    "exclude_default_invite_from_limit": bool(invite.get("exclude_default_invite_from_limit", False)),
                    "recommended_invite": list(dict.fromkeys(recommended)),
                    "allow_voluntary_evaluation": bool(invite.get("allow_voluntary_evaluation", False)),
                }
            calibration = raw.get("calibration")
            if calibration is not None:
                if not isinstance(calibration, dict) or not isinstance(calibration.get("phases", []), list):
                    raise ProjectValidationError("校准设置格式不正确")
                phases = []
                for phase in calibration.get("phases", []):
                    if not isinstance(phase, dict) or not isinstance(phase.get("rules", []), list):
                        raise ProjectValidationError("校准阶段设置格式不正确")
                    rules = []
                    for rule in phase.get("rules", []):
                        if not isinstance(rule, dict):
                            raise ProjectValidationError("校准规则设置格式不正确")
                        subject_type = str(rule.get("subject_type") or "PERSON")
                        operator = str(rule.get("operator") or "INCLUDE")
                        scope = str(rule.get("scope") or "PROJECT_ALL")
                        if subject_type != "PERSON" or operator not in {"INCLUDE", "EXCLUDE"} or scope != "PROJECT_ALL":
                            raise ProjectValidationError("校准规则设置不合法")
                        rules.append({
                            "subject_type": subject_type,
                            "operator": operator,
                            "scope": scope,
                            "allow_authorize": bool(rule.get("allow_authorize", False)),
                        })
                    phases.append({"rules": rules})
                normalized["calibration"] = {
                    "force_distribution_enabled": bool(calibration.get("force_distribution_enabled", False)),
                    "phases": phases,
                }
            result_view = raw.get("result_view")
            if result_view is not None:
                if not isinstance(result_view, dict) or result_view.get("opening_mode", "MANUAL") not in {"AUTOMATIC", "MANUAL"}:
                    raise ProjectValidationError("结果开通方式不合法")
                normalized["result_view"] = {"opening_mode": result_view.get("opening_mode", "MANUAL")}
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
        normalized_times: dict[str, dict[str, str]] = {}
        for node_id, raw in node_times.items():
            if not isinstance(node_id, str) or not node_id.strip() or len(node_id) > 96 or not isinstance(raw, dict):
                raise ProjectValidationError("节点时间设置格式不正确")
            values: dict[str, str] = {}
            for field in ("start_at", "end_at", "appeal_deadline"):
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
            settings["flow_settings"] = cls._validate_flow_settings(payload.get("flow_settings"))
        settings.setdefault("flow_settings", {"node_settings": {}})
        start_at = settings.get("start_at")
        end_at = settings.get("end_at")
        if start_at and end_at and end_at <= start_at:
            raise ProjectValidationError("项目截止时间必须晚于开始时间")
        return name, description, normalized, settings

    async def create_project(self, cycle_ref: str, payload: dict[str, Any], *, actor_type: str, actor_id: int) -> PerformanceProject:
        name, description, administrators, settings = self._validate_payload(payload)
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

    async def start_project(self, project: PerformanceProject, *, actor_type: str, actor_id: int) -> PerformanceProject:
        if project.status == PROJECT_STATUS_STARTED:
            return project
        if project.status != PROJECT_STATUS_DRAFT:
            raise ProjectValidationError("当前项目状态不允许启动")
        cycle = await self.db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == project.cycle_ref))
        if cycle is None:
            raise ProjectValidationError("绩效周期不存在")
        authorization_snapshot = await self.db.scalar(
            select(PerformanceAuthorizationSnapshot).where(
                PerformanceAuthorizationSnapshot.cycle_ref == project.cycle_ref,
                PerformanceAuthorizationSnapshot.status == AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
            )
        )
        if authorization_snapshot is None:
            raise ProjectValidationError("周期人员快照尚未锁定")
        rules = (project.settings or {}).get("evaluator_rules") or {}
        groups = rules.get("groups") or []
        if not groups:
            raise ProjectValidationError("项目未配置被评估人")
        if any(
            condition.get("field") == "employee_type"
            for group in groups
            for condition in group.get("conditions", [])
        ):
            raise ProjectValidationError("周期人员快照不包含员工类型，无法按员工类型筛选")
        people = list((await self.db.execute(
            select(PerformanceAuthorizationSnapshotPerson).where(
                PerformanceAuthorizationSnapshotPerson.snapshot_id == authorization_snapshot.id
            )
        )).scalars().all())
        selected = []
        for person in people:
            values = {"department": person.organization_ref or "", "employee": person.employee_no}
            matched = any(
                all((values.get(condition.get("field"), "") in condition.get("values", [])) == (condition.get("operator") == "include") for condition in group.get("conditions", []))
                for group in groups
            )
            if matched:
                selected.append(person)
        if not selected:
            raise ProjectValidationError("项目没有可用的被评估人")
        workflow = None
        template_id = (project.settings or {}).get("template_id")
        if template_id:
            workflow = await self.db.get(PerformanceTemplateWorkflow, int(template_id))
        nodes = list((workflow.nodes if workflow else []) or [])
        content_library = list((workflow.content_library if workflow else []) or [])
        if not nodes:
            raise ProjectValidationError("项目未配置流程节点")
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
                organization_ref=person.organization_ref,
                direct_manager_employee_no=person.direct_manager_employee_no,
                hrbp_employee_no=person.hrbp_employee_no,
                employment_status=person.employment_status,
            ))
        flow_settings = (project.settings or {}).get("flow_settings") or {}
        node_times = flow_settings.get("node_times") or {}
        for index, source_node in enumerate(nodes):
            node_type = source_node.get("node_type")
            raw_node = resolve_self_summary_content(source_node, content_library) if node_type == "work_summary" else source_node
            raw_node = await hydrate_self_summary_template(raw_node, self.db) if node_type == "work_summary" else raw_node
            node_id = str(raw_node.get("node_id") or f"node-{index + 1}")
            node_snapshot = PerformanceProjectNodeSnapshot(
                project_id=project.id,
                node_id=node_id,
                node_type=node_type,
                name=str(raw_node.get("name") or node_id),
                node_order=int(raw_node.get("order") or index + 1),
                config={"template": raw_node, "time": node_times.get(node_id) or {}},
            )
            self.db.add(node_snapshot)
            await self.db.flush()
            if node_type in {"result_view", "reviewer_360_confirm"}:
                continue
            for person in selected:
                executor_types = raw_node.get("executor_types") or []
                if "DIRECT_MANAGER" in executor_types:
                    handlers = [person.direct_manager_employee_no] if person.direct_manager_employee_no else []
                elif "HRBP" in executor_types:
                    handlers = [person.hrbp_employee_no] if person.hrbp_employee_no else []
                else:
                    handlers = [person.employee_no] if "SUBJECT" in executor_types or node_type in {"work_summary", "reviewer_360_invite"} else []
                for handler in {value for value in handlers if value}:
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
        settings = dict(project.settings or {})
        flow_settings = dict(settings.get("flow_settings") or {})
        saved_times = dict(flow_settings.get("node_times") or {})
        created_ids: list[str] = []
        for index, source_node in enumerate(pending):
            node_id = str(source_node["node_id"])
            node_type = source_node.get("node_type")
            raw_node = resolve_self_summary_content(source_node, list(workflow.content_library or [])) if node_type == "work_summary" else source_node
            raw_node = await hydrate_self_summary_template(raw_node, self.db) if node_type == "work_summary" else raw_node
            snapshot = PerformanceProjectNodeSnapshot(project_id=project.id, node_id=node_id, node_type=node_type, name=str(raw_node.get("name") or node_id), node_order=int(raw_node.get("order") or index + 1), config={"template": raw_node, "time": normalized_times[node_id]})
            self.db.add(snapshot)
            await self.db.flush()
            if node_type not in {"result_view", "reviewer_360_confirm"}:
                for person in members:
                    types = raw_node.get("executor_types") or []
                    handlers = [person.direct_manager_employee_no] if "DIRECT_MANAGER" in types else [person.hrbp_employee_no] if "HRBP" in types else [person.employee_no] if "SUBJECT" in types or node_type in {"work_summary", "reviewer_360_invite"} else []
                    for handler in {value for value in handlers if value}:
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
