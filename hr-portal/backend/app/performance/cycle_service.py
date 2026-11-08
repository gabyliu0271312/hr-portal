"""Cycle lifecycle services backed by performance authorization snapshots."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone
import json
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
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
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import (
    AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
    CYCLE_LEAVER_MODE_CREATE_TASK,
    CYCLE_LOCK_RULE_IMMEDIATE,
    CYCLE_LOCK_RULE_SCHEDULED,
    CYCLE_PRE_LOCK_SYNC_AUTO_DAILY,
    CYCLE_PRE_LOCK_SYNC_MANUAL,
    CYCLE_STATUS_DRAFT,
    CYCLE_STATUS_LOCKED,
    PerformanceAuditEvent,
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceCycle,
    PerformanceCycleProjectManager,
    PerformanceOtherSetting,
    PerformanceProject,
    PerformanceTemplate,
    PerformanceTemplateWorkflow,
    PROJECT_STATUS_STARTED,
)
from app.performance.snapshot_service import PerformanceAuthorizationSnapshotService, RosterAuthorizationInput


class CycleValidationError(ValueError):
    pass


# 「更新人员信息」支持的维度（对齐 REA 提炼报告：序列/职级/直属上级/部门）
PERSON_INFO_UPDATE_DIMENSIONS = ("job_family", "position_level", "direct_supervisor", "department")

# 变更记录展示用字段标签
PERSON_INFO_FIELD_LABELS = {
    "display_name": "姓名",
    "company_org": "一级组织",
    "department": "一级部门",
    "department_2": "二级部门",
    "department_3": "三级部门",
    "department_4": "四级部门",
    "department_5": "五级部门",
    "organization_ref": "部门路径",
    "direct_supervisor_employee_no": "直属上级",
    "hrbp_employee_no": "HRBP",
    "employee_type": "员工类型",
    "job_family": "职类（序列）",
    "job_category": "子职类",
    "standard_position": "岗位",
    "position_level": "职位层级（职级）",
    "hire_date": "入职日期",
}

# 会产生周期人员字段变更的审计事件类型（用于 hasChange 与变更记录）
PEOPLE_CHANGE_EVENT_TYPES = (
    "PERFORMANCE_CYCLE_PEOPLE_INFO_UPDATED",
    "PERFORMANCE_CYCLE_PEOPLE_MANUALLY_UPDATED",
    "PERFORMANCE_CYCLE_PEOPLE_UPDATED",
)


def _actor_ref(subject_id: int) -> str:
    return str(subject_id)


def normalize_cycle_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
    return value.astimezone(timezone.utc)


def _node_deadline(time: dict, node_type: str | None) -> datetime | None:
    """节点用于启动禁用的截止时间：result_view 用复议截止，校准取最后阶段截止，其余用 end_at。"""
    if node_type == "result_view":
        raw = time.get("appeal_deadline")
    elif node_type == "calibration" and time.get("phase_times"):
        raw = max((phase.get("end_at") for phase in time["phase_times"].values() if phase.get("end_at")), default=None)
    else:
        raw = time.get("end_at")
    if not raw:
        return None
    value = raw if isinstance(raw, datetime) else _parse_node_datetime(str(raw))
    return value


def _parse_node_datetime(raw: str) -> datetime | None:
    try:
        value = datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
    return value.astimezone(timezone.utc)


def _expired_flow_nodes(node_times: dict, node_names: dict[str, dict[str, str]], now: datetime) -> list[str]:
    """已完成配置的项目中，截止时间早于当前时间的环节名列表（保持节点顺序）。"""
    expired: list[str] = []
    for node_id, raw_time in node_times.items():
        if not isinstance(raw_time, dict):
            continue
        meta = node_names.get(node_id) or {}
        node_type = meta.get("node_type")
        deadline = _node_deadline(raw_time, node_type)
        if deadline is not None and deadline <= now:
            expired.append(meta.get("name") or node_id)
    return expired


class PerformanceCycleService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.snapshots = PerformanceAuthorizationSnapshotService(db)
        self.audit = PerformanceAuditService(db)

    async def list_cycles(self, keyword: str | None = None, *, project_refs: set[str] | None = None, page: int = 1, page_size: int = 20) -> tuple[list[PerformanceCycle], int]:
        stmt = select(PerformanceCycle).order_by(PerformanceCycle.created_at.desc())
        count_stmt = select(func.count(func.distinct(PerformanceCycle.id)))
        if project_refs is not None:
            if not project_refs:
                return [], 0
            project_filter = PerformanceProject.project_ref.in_(project_refs)
            stmt = stmt.join(PerformanceProject, PerformanceProject.cycle_ref == PerformanceCycle.cycle_ref).where(project_filter).distinct()
            count_stmt = count_stmt.join(PerformanceProject, PerformanceProject.cycle_ref == PerformanceCycle.cycle_ref).where(project_filter)
        if keyword and keyword.strip():
            pattern = f"%{keyword.strip()}%"
            stmt = stmt.where(PerformanceCycle.name.ilike(pattern))
            count_stmt = count_stmt.where(PerformanceCycle.name.ilike(pattern))
        total = int((await self.db.execute(count_stmt)).scalar_one() or 0)
        cycles = list((await self.db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).scalars())
        return cycles, total

    async def get_cycle(self, cycle_id: int) -> PerformanceCycle:
        cycle = await self.db.get(PerformanceCycle, cycle_id)
        if cycle is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="绩效周期不存在")
        return cycle

    async def projects_for_cycle(self, cycle: PerformanceCycle, *, project_refs: set[str] | None = None) -> list[dict[str, Any]]:
        statement = select(PerformanceProject).where(PerformanceProject.cycle_ref == cycle.cycle_ref)
        if project_refs is not None:
            if not project_refs:
                return []
            statement = statement.where(PerformanceProject.project_ref.in_(project_refs))
        projects = (await self.db.execute(statement.order_by(PerformanceProject.created_at.asc()))).scalars().all()
        node_names_by_template = await self._workflow_node_names({(project.settings or {}).get("template_id") for project in projects})
        now = datetime.now(UTC)
        result: list[dict[str, Any]] = []
        for project in projects:
            settings = project.settings or {}
            flow_settings = settings.get("flow_settings") or {}
            template_id = settings.get("template_id")
            node_names = node_names_by_template.get(str(template_id)) if template_id is not None else {}
            node_times = (flow_settings.get("node_times") or {}) if isinstance(flow_settings, dict) else {}
            expired_nodes = _expired_flow_nodes(node_times, node_names, now)
            base = {
                "id": project.id, "project_ref": project.project_ref, "name": project.name, "description": project.description, "administrators": project.administrators or [], "status": project.status, "evaluated_count": project.evaluated_count, "configuration_completed": bool(settings.get("configuration_completed", False)), "template_id": template_id, "start_at": settings.get("start_at"), "end_at": settings.get("end_at"), "evaluator_rules": settings.get("evaluator_rules", {"groups": []}), "flow_settings": flow_settings, "node_meta": node_names,
            }
            if project.status == "DRAFT" and not bool(settings.get("configuration_completed", False)):
                base["start_blocked_reason"] = "项目未配置完成，无法启动"
            elif project.status == "DRAFT" and expired_nodes:
                base["start_blocked_reason"] = "\n".join(f"{name}环节截止时间早于当前时间，无法启动" for name in expired_nodes)
            result.append(base)
        return result

    async def _workflow_node_names(self, template_ids: set[Any]) -> dict[str, dict[str, dict[str, str]]]:
        """template_id -> {node_id: {name, node_type}}，供列表页启动禁用弹窗展示环节名。"""
        ids = {int(template_id) for template_id in template_ids if str(template_id or "").isdigit()}
        if not ids:
            return {}
        records = (await self.db.execute(select(PerformanceTemplateWorkflow).where(PerformanceTemplateWorkflow.template_id.in_(ids)))).scalars().all()
        result: dict[str, dict[str, dict[str, str]]] = {}
        for record in records:
            nodes: dict[str, dict[str, str]] = {}
            for node in record.nodes or []:
                node_id = str(node.get("node_id") or "")
                if node_id:
                    nodes[node_id] = {"name": str(node.get("name") or node.get("node_type") or ""), "node_type": str(node.get("node_type") or "")}
            result[str(record.template_id)] = nodes
        return result

    async def has_started_projects(self, cycle: PerformanceCycle) -> bool:
        return bool((await self.db.execute(select(PerformanceProject.id).where(PerformanceProject.cycle_ref == cycle.cycle_ref, PerformanceProject.status == PROJECT_STATUS_STARTED).limit(1))).scalar_one_or_none())

    async def project_belongs_to_cycle(self, cycle: PerformanceCycle, project_ref: str) -> bool:
        return bool((await self.db.execute(select(PerformanceProject.id).where(PerformanceProject.project_ref == project_ref, PerformanceProject.cycle_ref == cycle.cycle_ref).limit(1))).scalar_one_or_none())

    async def people_for_cycle(self, cycle: PerformanceCycle) -> list[dict[str, Any]]:
        snapshot = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshot).where(
                    PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref
                )
            )
        ).scalar_one_or_none()
        if snapshot is None:
            return []
        people = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshotPerson)
                .where(PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id)
                .order_by(PerformanceAuthorizationSnapshotPerson.employee_no.asc())
            )
        ).scalars().all()
        manager_rows = (await self.db.execute(select(PerformanceCycleProjectManager).where(PerformanceCycleProjectManager.cycle_ref == cycle.cycle_ref))).scalars().all()
        project_managers = {row.target_employee_no: row.manager_employee_no for row in manager_rows}
        return [
            {
                "employee_no": person.employee_no,
                "display_name": person.display_name,
                **{field: getattr(person, field) for field in ORGANIZATION_FIELDS},
                "organization_ref": person.organization_ref,
                "direct_supervisor_employee_no": person.direct_supervisor_employee_no,
                "project_manager_employee_no": project_managers.get(person.employee_no),
                "hrbp_employee_no": person.hrbp_employee_no,
                "employee_type": person.employee_type,
                "employment_status": person.employment_status,
                "job_family": person.job_family,
                "job_category": person.job_category,
                "standard_position": person.standard_position,
                "position_level": person.position_level,
                "hire_date": person.hire_date.isoformat() if person.hire_date else None,
                "departure_date": person.departure_date.isoformat() if person.departure_date else None,
                "is_manually_maintained": person.is_manually_maintained,
            }
            for person in people
        ]

    async def snapshot_counts(self, cycle: PerformanceCycle) -> tuple[int, int]:
        summaries = await self.list_summaries([cycle], project_refs=None)
        people, departments, _projects = summaries.get(cycle.cycle_ref, (0, 0, []))
        return people, departments

    async def list_summaries(
        self,
        cycles: list[PerformanceCycle],
        *,
        project_refs: set[str] | None = None,
    ) -> dict[str, tuple[int, int, list[dict[str, Any]]]]:
        cycle_refs = [cycle.cycle_ref for cycle in cycles]
        summaries = {cycle_ref: (0, 0, []) for cycle_ref in cycle_refs}
        if not cycle_refs:
            return summaries

        counts = (
            await self.db.execute(
                select(
                    PerformanceAuthorizationSnapshot.cycle_ref,
                    func.count(PerformanceAuthorizationSnapshotPerson.id),
                    func.count(
                        func.distinct(
                            PerformanceAuthorizationSnapshotPerson.organization_ref
                        )
                    ),
                )
                .select_from(PerformanceAuthorizationSnapshot)
                .outerjoin(
                    PerformanceAuthorizationSnapshotPerson,
                    PerformanceAuthorizationSnapshotPerson.snapshot_id
                    == PerformanceAuthorizationSnapshot.id,
                )
                .where(PerformanceAuthorizationSnapshot.cycle_ref.in_(cycle_refs))
                .group_by(PerformanceAuthorizationSnapshot.cycle_ref)
            )
        ).all()
        for cycle_ref, people, departments in counts:
            summaries[cycle_ref] = (int(people or 0), int(departments or 0), [])

        if project_refs is not None and not project_refs:
            return summaries
        projects_stmt = select(PerformanceProject).where(
            PerformanceProject.cycle_ref.in_(cycle_refs)
        )
        if project_refs is not None:
            projects_stmt = projects_stmt.where(
                PerformanceProject.project_ref.in_(project_refs)
            )
        projects_by_cycle: dict[str, list[dict[str, Any]]] = {
            cycle_ref: [] for cycle_ref in cycle_refs
        }
        for project in (
            await self.db.execute(
                projects_stmt.order_by(
                    PerformanceProject.cycle_ref,
                    PerformanceProject.created_at.asc(),
                )
            )
        ).scalars():
            projects_by_cycle[project.cycle_ref].append(
                {
                    "id": project.id,
                    "project_ref": project.project_ref,
                    "name": project.name,
                    "description": project.description,
                    "administrators": project.administrators or [],
                    "status": project.status,
                    "evaluated_count": project.evaluated_count,
                    "template_id": (project.settings or {}).get("template_id"),
                    "start_at": (project.settings or {}).get("start_at"),
                    "end_at": (project.settings or {}).get("end_at"),
                    "evaluator_rules": (project.settings or {}).get("evaluator_rules", {"groups": []}),
                }
            )
        for cycle_ref, (people, departments, _projects) in summaries.items():
            summaries[cycle_ref] = (
                people,
                departments,
                projects_by_cycle[cycle_ref],
            )
        return summaries

    @staticmethod
    def template_ids(cycle) -> list[int]:
        values = getattr(cycle, "template_ids", None)
        if values is not None:
            return list(values)
        return [cycle.template_id] if getattr(cycle, "template_id", None) else []

    async def validate_templates(self, payload: dict, cycle=None) -> None:
        ids = payload.get("template_ids")
        if ids is None:
            return
        if cycle is not None:
            cycle = (await self.db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle.id).with_for_update().execution_options(populate_existing=True))).scalar_one()
        previous = self.template_ids(cycle) if cycle is not None else []
        for template_id in sorted(set(ids)):
            template = (await self.db.execute(select(PerformanceTemplate).where(PerformanceTemplate.id == template_id).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
            if template is None or template.template_kind != "performance" or (template.status != "active" and template_id not in previous):
                raise CycleValidationError("只能选择已启用的绩效模板")
        removed = set(previous) - set(ids)
        if removed:
            projects = (await self.db.execute(select(PerformanceProject).where(PerformanceProject.cycle_ref == cycle.cycle_ref))).scalars().all()
            if any((project.settings or {}).get("template_id") in removed for project in projects):
                raise CycleValidationError("模板已被项目使用，不能从周期中移除")

    async def create_cycle(self, payload: dict[str, Any], *, actor_type: str, actor_id: int) -> PerformanceCycle:
        payload = self._normalize_payload(payload)
        self._validate_payload(payload)
        await self.validate_templates(payload)
        cycle = PerformanceCycle(
            cycle_ref=f"cycle:{uuid4().hex}",
            name=payload["name"].strip(),
            language=payload.get("language", "zh-CN"),
            period_year=payload["period_year"],
            period_type=payload["period_type"],
            period_subtype=payload.get("period_subtype"),
            template_id=payload.get("template_id"),
            template_ids=payload.get("template_ids") or [],
            start_at=payload["start_at"],
            end_at=payload["end_at"],
            lock_rule=payload["lock_rule"],
            lock_at=payload.get("lock_at"),
            pre_lock_sync_mode=payload["pre_lock_sync_mode"],
            leaver_enabled=payload["leaver_enabled"],
            leaver_start_date=payload.get("leaver_start_date"),
            leaver_end_date=payload.get("leaver_end_date"),
            leaver_participation_mode=payload["leaver_participation_mode"],
            overdue_submission_enabled=payload.get("overdue_submission_enabled", True),
            overdue_submission_scope=payload.get("overdue_submission_scope", "EVALUATION"),
            status=CYCLE_STATUS_DRAFT,
            created_by_type=actor_type,
            created_by_ref=_actor_ref(actor_id),
        )
        self.db.add(cycle)
        await self.db.flush()
        await self._sync_snapshot(cycle, actor_type=actor_type, actor_id=actor_id)
        await self.db.flush()
        if cycle.lock_rule == CYCLE_LOCK_RULE_IMMEDIATE:
            await self.snapshots.lock_snapshot(cycle.cycle_ref, actor_type=actor_type, actor_ref=_actor_ref(actor_id), commit=False)
            cycle.status = CYCLE_STATUS_LOCKED
        self.audit.append_event(AuditEventInput(event_type="PERFORMANCE_CYCLE_CREATED", cycle_ref=cycle.cycle_ref, actor_type=actor_type, actor_ref=_actor_ref(actor_id), after_state=self.serialize(cycle)))
        await self.db.commit()
        await self.db.refresh(cycle)
        return cycle

    async def update_cycle(self, cycle: PerformanceCycle, payload: dict[str, Any], *, actor_type: str, actor_id: int) -> PerformanceCycle:
        payload = self._normalize_payload(payload)
        forbidden = {"lock_rule", "lock_at", "pre_lock_sync_mode"}.intersection(payload)
        if forbidden:
            raise CycleValidationError("周期创建后不支持修改锁定规则")
        cycle = (await self.db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle.id).with_for_update().execution_options(populate_existing=True))).scalar_one()
        overdue_changed = any(field in payload and payload[field] != getattr(cycle, field) for field in ("overdue_submission_enabled", "overdue_submission_scope"))
        if overdue_changed:
            setting = await self.db.get(PerformanceOtherSetting, 1)
            if setting is None or not setting.overdue_single_submission_enabled or not setting.cycle_overdue_submission_override_enabled:
                raise CycleValidationError("未开启按周期关闭逾期任务提交机会")
        await self.validate_templates(payload, cycle)
        before = self.serialize(cycle)
        changed_leaver_fields = any(field in payload and payload[field] != getattr(cycle, field) for field in ("leaver_enabled", "leaver_start_date", "leaver_end_date"))
        if changed_leaver_fields and datetime.now(UTC) >= normalize_cycle_datetime(cycle.start_at):
            raise CycleValidationError("绩效环节已开始，不能修改离职人员参评范围")
        for field in ("name", "language", "period_year", "period_type", "period_subtype", "template_id", "template_ids", "start_at", "end_at", "leaver_enabled", "leaver_start_date", "leaver_end_date", "leaver_participation_mode", "overdue_submission_enabled", "overdue_submission_scope"):
            if field in payload:
                setattr(cycle, field, payload[field].strip() if field == "name" else payload[field])
        self._validate_cycle(cycle)
        if changed_leaver_fields:
            await self._sync_snapshot(cycle, actor_type=actor_type, actor_id=actor_id, allow_locked_update=True)
            await self._prune_excluded_leavers(cycle)
        self.audit.append_event(AuditEventInput(event_type="PERFORMANCE_CYCLE_UPDATED", cycle_ref=cycle.cycle_ref, actor_type=actor_type, actor_ref=_actor_ref(actor_id), before_state=before, after_state=self.serialize(cycle)))
        await self.db.commit()
        await self.db.refresh(cycle)
        return cycle

    async def refresh_people(self, cycle: PerformanceCycle, *, actor_type: str, actor_id: int, reason: str) -> PerformanceCycle:
        if datetime.now(UTC) >= cycle.start_at.astimezone(UTC):
            raise CycleValidationError("绩效环节已开始，不能更新锁定人员和部门信息")
        if not reason.strip():
            raise CycleValidationError("更新锁定人员和部门信息必须填写原因")
        before = await self._snapshot_people_state(cycle)
        await self._sync_snapshot(cycle, actor_type=actor_type, actor_id=actor_id, allow_locked_update=True)
        await self._prune_excluded_leavers(cycle)
        after = await self._snapshot_people_state(cycle)
        self.audit.append_event(AuditEventInput(event_type="PERFORMANCE_CYCLE_PEOPLE_UPDATED", cycle_ref=cycle.cycle_ref, actor_type=actor_type, actor_ref=_actor_ref(actor_id), before_state={"people": before}, after_state={"reason": reason.strip(), "people": after, "changes": self._diff_people_state(before, after)}))
        await self.db.commit()
        return cycle

    async def _snapshot_people_state(self, cycle: PerformanceCycle) -> dict[str, dict[str, Any]]:
        snapshot = (await self.db.execute(select(PerformanceAuthorizationSnapshot).where(PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref))).scalar_one_or_none()
        if snapshot is None:
            return {}
        people = (await self.db.execute(select(PerformanceAuthorizationSnapshotPerson).where(PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id))).scalars().all()
        fields = ("display_name", *ORGANIZATION_FIELDS, "organization_ref", "direct_supervisor_employee_no", "hrbp_employee_no", "employee_type", "employment_status", "job_family", "job_category", "standard_position", "position_level", "hire_date", "departure_date", "is_manually_maintained")
        return {person.employee_no: {field: getattr(person, field).isoformat() if isinstance(getattr(person, field), date) else getattr(person, field) for field in fields} for person in people}

    @staticmethod
    def _diff_people_state(before: dict[str, dict[str, Any]], after: dict[str, dict[str, Any]]) -> dict[str, Any]:
        added = sorted(set(after) - set(before))
        removed = sorted(set(before) - set(after))
        changed = [{"employee_no": employee_no, "before": before[employee_no], "after": after[employee_no]} for employee_no in sorted(set(before) & set(after)) if before[employee_no] != after[employee_no]]
        return {"added": added, "removed": removed, "changed": changed}

    async def _prune_excluded_leavers(self, cycle: PerformanceCycle) -> None:
        snapshot = (await self.db.execute(select(PerformanceAuthorizationSnapshot).where(PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref))).scalar_one_or_none()
        if snapshot is None:
            return
        people = (await self.db.execute(select(PerformanceAuthorizationSnapshotPerson).where(PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id))).scalars().all()
        for person in people:
            if person.employment_status != "离职":
                continue
            departure = person.departure_date
            included = (
                cycle.leaver_enabled
                and cycle.leaver_start_date
                and cycle.leaver_end_date
                and departure
                and cycle.leaver_start_date <= departure <= cycle.leaver_end_date
            )
            if not included:
                await self.db.delete(person)

    async def update_people_manually(
        self,
        cycle: PerformanceCycle,
        updates: list[dict[str, Any]],
        *,
        actor_type: str,
        actor_id: int,
        reason: str,
    ) -> PerformanceCycle:
        if datetime.now(UTC) >= cycle.start_at.astimezone(UTC):
            raise CycleValidationError("绩效环节已开始，不能更新锁定人员和部门信息")
        if not reason.strip():
            raise CycleValidationError("手工维护人员和部门信息必须填写原因")
        snapshot = (await self.db.execute(select(PerformanceAuthorizationSnapshot).where(PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref))).scalar_one_or_none()
        if snapshot is None:
            raise CycleValidationError("周期人员快照不存在")
        people = {person.employee_no: person for person in (await self.db.execute(select(PerformanceAuthorizationSnapshotPerson).where(PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id))).scalars()}
        changed = []
        for update in updates:
            employee_no = str(update.get("employee_no") or "").strip()
            person = people.get(employee_no)
            if person is None:
                raise CycleValidationError(f"周期快照中不存在员工：{employee_no}")
            before = {field: getattr(person, field) for field in ("display_name", *ORGANIZATION_FIELDS, "direct_supervisor_employee_no", "hrbp_employee_no", "employee_type", "job_family", "job_category", "standard_position", "position_level", "hire_date")}
            for field in before:
                if field in update:
                    setattr(person, field, update[field])
            person.organization_ref = organization_path(person)
            person.is_manually_maintained = True
            changed.append({"employee_no": employee_no, "before": before, "after": {field: getattr(person, field) for field in before}})
        self.audit.append_event(AuditEventInput(event_type="PERFORMANCE_CYCLE_PEOPLE_MANUALLY_UPDATED", cycle_ref=cycle.cycle_ref, actor_type=actor_type, actor_ref=_actor_ref(actor_id), after_state={"reason": reason.strip(), "changes": changed}))
        await self.db.commit()
        await self.db.refresh(cycle)
        return cycle

    async def update_project_managers(
        self,
        cycle: PerformanceCycle,
        mappings: list[dict[str, str]],
        *,
        actor_type: str,
        actor_id: int,
        reason: str,
    ) -> list[dict[str, Any]]:
        locked = (await self.db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle.id).with_for_update())).scalar_one()
        if not reason.strip():
            raise CycleValidationError("直属项目上级导入必须填写原因")
        if await self.has_started_projects(locked):
            raise CycleValidationError("周期内有已启动项目，不能变更直属项目上级")
        snapshot = (await self.db.execute(select(PerformanceAuthorizationSnapshot).where(PerformanceAuthorizationSnapshot.cycle_ref == locked.cycle_ref))).scalar_one_or_none()
        if snapshot is None:
            raise CycleValidationError("周期人员快照不存在")
        employee_nos = set((await self.db.execute(select(PerformanceAuthorizationSnapshotPerson.employee_no).where(PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id))).scalars().all())
        targets = [row["target_employee_no"].strip() for row in mappings]
        if len(set(targets)) != len(targets) or any(not target or target not in employee_nos or row["manager_employee_no"].strip() not in employee_nos or target == row["manager_employee_no"].strip() for target, row in zip(targets, mappings)):
            raise CycleValidationError("直属项目上级导入的员工编号不在本周期、与本人相同或目标重复")
        existing = {row.target_employee_no: row for row in (await self.db.execute(select(PerformanceCycleProjectManager).where(PerformanceCycleProjectManager.cycle_ref == locked.cycle_ref))).scalars().all()}
        changes = []
        for target, mapping in zip(targets, mappings):
            manager = mapping["manager_employee_no"].strip()
            before = existing[target].manager_employee_no if target in existing else None
            if before == manager:
                continue
            if target in existing:
                existing[target].manager_employee_no = manager
            else:
                self.db.add(PerformanceCycleProjectManager(cycle_ref=locked.cycle_ref, target_employee_no=target, manager_employee_no=manager))
            changes.append({"target_employee_no": target, "before": before, "after": manager})
        if changes:
            self.audit.append_event(AuditEventInput(event_type="PERFORMANCE_CYCLE_PROJECT_MANAGERS_UPDATED", cycle_ref=locked.cycle_ref, actor_type=actor_type, actor_ref=_actor_ref(actor_id), after_state={"reason": reason.strip(), "changes": changes}))
            await self.db.commit()
        return await self.people_for_cycle(locked)

    @staticmethod
    def _serialize_change_value(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, date):
            return value.isoformat()
        return str(value)

    async def _people_change_events(self, cycle: PerformanceCycle) -> list[PerformanceAuditEvent]:
        statement = (
            select(PerformanceAuditEvent)
            .where(PerformanceAuditEvent.cycle_ref == cycle.cycle_ref)
            .where(PerformanceAuditEvent.event_type.in_(PEOPLE_CHANGE_EVENT_TYPES))
            .order_by(PerformanceAuditEvent.event_at.asc(), PerformanceAuditEvent.id.asc())
        )
        return list((await self.db.execute(statement)).scalars().all())

    async def changed_employee_nos(self, cycle: PerformanceCycle) -> set[str]:
        """本周期内发生过人员信息变更的员工编号集合（用于 hasChange）。"""
        changed: set[str] = set()
        for event in await self._people_change_events(cycle):
            for change in (event.after_state or {}).get("changes") or []:
                if isinstance(change, dict) and change.get("employee_no"):
                    changed.add(str(change["employee_no"]))
        return changed

    @classmethod
    def _flatten_change(cls, change: dict[str, Any]) -> list[dict[str, Any]]:
        # 两种审计形态：
        # - 扁平单字段：{employee_no, field, label, before, after}
        # - 全量快照：{employee_no, before: {字段: 值}, after: {字段: 值}}（手工维护批量更新）
        if isinstance(change.get("field"), str):
            field = str(change["field"])
            return [{
                "employee_no": change.get("employee_no"),
                "field": field,
                "label": PERSON_INFO_FIELD_LABELS.get(field, field),
                "before": cls._serialize_change_value(change.get("before")),
                "after": cls._serialize_change_value(change.get("after")),
            }]
        before = change.get("before") if isinstance(change.get("before"), dict) else {}
        after = change.get("after") if isinstance(change.get("after"), dict) else {}
        entries: list[dict[str, Any]] = []
        for field in dict.fromkeys([*before.keys(), *after.keys()]):
            if field not in PERSON_INFO_FIELD_LABELS or before.get(field) == after.get(field):
                continue
            entries.append({
                "employee_no": change.get("employee_no"),
                "field": str(field),
                "label": PERSON_INFO_FIELD_LABELS.get(str(field), str(field)),
                "before": cls._serialize_change_value(before.get(field)),
                "after": cls._serialize_change_value(after.get(field)),
            })
        return entries

    async def person_change_records(self, cycle: PerformanceCycle, employee_no: str) -> list[dict[str, Any]]:
        """按时间升序返回该员工在本周期内的信息变更记录。"""
        records: list[dict[str, Any]] = []
        for event in await self._people_change_events(cycle):
            entries: list[dict[str, Any]] = []
            for change in (event.after_state or {}).get("changes") or []:
                if not isinstance(change, dict) or str(change.get("employee_no") or "") != employee_no:
                    continue
                entries.extend(self._flatten_change(change))
            if entries:
                records.append({
                    "event_id": event.id,
                    "event_at": event.event_at.isoformat(),
                    "event_type": event.event_type,
                    "actor_type": event.actor_type,
                    "actor_ref": event.actor_ref,
                    "changes": entries,
                })
        return records

    async def update_person_info_from_roster(
        self,
        cycle: PerformanceCycle,
        employee_no: str,
        update_fields: list[str],
        *,
        actor_type: str,
        actor_id: int,
    ) -> list[dict[str, Any]]:
        """从最新花名册把选中维度同步进本周期人员快照，返回变更明细。"""
        unknown = sorted({field for field in update_fields if field not in PERSON_INFO_UPDATE_DIMENSIONS})
        if unknown:
            raise CycleValidationError(f"不支持更新的信息维度：{'、'.join(unknown)}")
        if not update_fields:
            raise CycleValidationError("请至少选择一个要更新的信息维度")
        snapshot = (
            await self.db.execute(
                select(PerformanceAuthorizationSnapshot).where(
                    PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref
                )
            )
        ).scalar_one_or_none()
        if snapshot is None:
            raise CycleValidationError("周期人员快照不存在")
        people = list(
            (
                await self.db.execute(
                    select(PerformanceAuthorizationSnapshotPerson).where(
                        PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id
                    )
                )
            ).scalars()
        )
        person = next((row for row in people if row.employee_no == employee_no), None)
        if person is None:
            raise CycleValidationError(f"周期快照中不存在员工：{employee_no}")
        await self.db.refresh(person, with_for_update=True)
        roster_inputs = await self._load_roster_inputs(cycle, include_excluded_leavers=True)
        roster = next((row for row in roster_inputs if row.employee_no == employee_no), None)
        if roster is None:
            raise CycleValidationError("最新花名册中未找到该员工，无法同步")

        changes: list[dict[str, Any]] = []
        updates: dict[str, Any] = {}

        def record_change(field: str, before: Any, after: Any) -> None:
            changes.append({
                "employee_no": employee_no,
                "field": field,
                "label": PERSON_INFO_FIELD_LABELS.get(field, field),
                "before": self._serialize_change_value(before),
                "after": self._serialize_change_value(after),
            })

        if "job_family" in update_fields and roster.job_family != person.job_family:
            record_change("job_family", person.job_family, roster.job_family)
            updates["job_family"] = roster.job_family
        if "position_level" in update_fields and roster.position_level != person.position_level:
            record_change("position_level", person.position_level, roster.position_level)
            updates["position_level"] = roster.position_level
        if "direct_supervisor" in update_fields:
            source = roster.direct_supervisor_source_value
            resolved: str | None = None
            if source:
                if any(row.employee_no == source for row in people):
                    resolved = source
                else:
                    name_key = source.strip().casefold()
                    matches = [row.employee_no for row in people if row.display_name and row.display_name.strip().casefold() == name_key]
                    resolved = matches[0] if len(matches) == 1 else None
                if resolved is None:
                    raise CycleValidationError(f"直属上级「{source}」无法解析为周期内唯一员工")
            if resolved != person.direct_supervisor_employee_no:
                record_change("direct_supervisor_employee_no", person.direct_supervisor_employee_no, resolved)
                updates["direct_supervisor_employee_no"] = resolved
                updates["direct_supervisor_source_value"] = source
        if "department" in update_fields:
            org_changed = False
            for field in ORGANIZATION_FIELDS:
                value = getattr(roster, field)
                if value != getattr(person, field):
                    record_change(field, getattr(person, field), value)
                    updates[field] = value
                    org_changed = True
            if org_changed:
                new_ref = organization_path({field: getattr(roster, field) for field in ORGANIZATION_FIELDS})
                if new_ref != person.organization_ref:
                    record_change("organization_ref", person.organization_ref, new_ref)
                updates["organization_ref"] = new_ref
        if not changes:
            return []
        updates["is_manually_maintained"] = True
        guard_sql = text("SELECT set_config('performance.person_info_update', :guard, true)")
        try:
            await self.db.execute(guard_sql, {"guard": json.dumps({"snapshot_id": snapshot.id, "person_id": person.id, "fields": list(updates)})})
            for field, value in updates.items():
                setattr(person, field, value)
            self.audit.append_event(AuditEventInput(
                event_type="PERFORMANCE_CYCLE_PEOPLE_INFO_UPDATED",
                cycle_ref=cycle.cycle_ref,
                actor_type=actor_type,
                actor_ref=_actor_ref(actor_id),
                after_state={"reason": "更新人员信息（同步自最新花名册）", "changes": changes},
            ))
            await self.db.flush()
            await self.db.execute(guard_sql, {"guard": ""})
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return changes

    async def delete_cycle(self, cycle: PerformanceCycle, *, actor_type: str, actor_id: int) -> None:
        locked_cycle = (await self.db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle.id).with_for_update())).scalar_one()
        projects = (await self.db.execute(select(PerformanceProject).where(PerformanceProject.cycle_ref == locked_cycle.cycle_ref).with_for_update())).scalars().all()
        if any(project.status == PROJECT_STATUS_STARTED for project in projects):
            raise CycleValidationError("周期内存在已启动项目，不能删除周期")
        snapshot = (await self.db.execute(select(PerformanceAuthorizationSnapshot).where(PerformanceAuthorizationSnapshot.cycle_ref == locked_cycle.cycle_ref))).scalar_one_or_none()
        self.audit.append_event(AuditEventInput(event_type="PERFORMANCE_CYCLE_DELETED", cycle_ref=locked_cycle.cycle_ref, actor_type=actor_type, actor_ref=_actor_ref(actor_id), before_state=self.serialize(locked_cycle)))
        if snapshot is not None:
            await self.db.delete(snapshot)
        await self.db.delete(locked_cycle)
        await self.db.commit()

    async def process_due_locks(self) -> int:
        now = datetime.now(UTC)
        cycle_refs = list((await self.db.execute(select(PerformanceCycle.cycle_ref).where(PerformanceCycle.status == CYCLE_STATUS_DRAFT))).scalars())
        locked = 0
        changed = False
        for cycle_ref in cycle_refs:
            cycle = (await self.db.execute(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == cycle_ref, PerformanceCycle.status == CYCLE_STATUS_DRAFT).with_for_update())).scalar_one_or_none()
            if cycle is None:
                continue
            if cycle.pre_lock_sync_mode == CYCLE_PRE_LOCK_SYNC_AUTO_DAILY and cycle.lock_at and cycle.lock_at > now:
                snapshot = (await self.db.execute(select(PerformanceAuthorizationSnapshot).where(PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref))).scalar_one_or_none()
                if snapshot is None or snapshot.last_synced_at is None or snapshot.last_synced_at.date() < now.date():
                    await self._sync_snapshot(cycle, actor_type="SYSTEM", actor_id=0)
                    await self._prune_excluded_leavers(cycle)
                    changed = True
            if cycle.lock_rule == CYCLE_LOCK_RULE_SCHEDULED and cycle.lock_at and cycle.lock_at <= now:
                if cycle.pre_lock_sync_mode == CYCLE_PRE_LOCK_SYNC_AUTO_DAILY:
                    await self._sync_snapshot(cycle, actor_type="SYSTEM", actor_id=0)
                    await self._prune_excluded_leavers(cycle)
                    changed = True
                await self.snapshots.lock_snapshot(cycle.cycle_ref, actor_type="SYSTEM", actor_ref="0", commit=False)
                cycle.status = CYCLE_STATUS_LOCKED
                locked += 1
        if changed or locked:
            await self.db.commit()
        return locked

    async def _sync_snapshot(self, cycle: PerformanceCycle, *, actor_type: str, actor_id: int, allow_locked_update: bool = False) -> None:
        people = await self._load_roster_inputs(cycle)
        await self.snapshots.sync_roster(cycle.cycle_ref, people, actor_type=actor_type, actor_ref=_actor_ref(actor_id), allow_locked_update=allow_locked_update, commit=False)

    async def _load_roster_inputs(self, cycle: PerformanceCycle, *, include_excluded_leavers: bool = False) -> list[RosterAuthorizationInput]:
        try:
            table = employee_roster_table()
            columns = require_employee_roster_columns(table)
        except EmployeeRosterContractError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        selections = {
            "employee_no": columns["employee_no"],
            "display_name": columns["display_name"],
            **{field: columns[field] for field in ORGANIZATION_FIELDS},
            "direct_supervisor_source_value": columns["direct_supervisor"],
            "hrbp_source_value": columns["hrbp"],
            "employee_type": columns["employee_type"],
            "employment_status": columns["employment_status"],
            "job_family": columns["job_family"],
            "job_category": columns["job_category"],
            "standard_position": columns["standard_position"],
            "position_level": columns["position_level"],
            "hire_date": columns["hire_date"],
            "departure_date": columns["departure_date"],
        }
        if "id" in table.c:
            selections["source_roster_id"] = table.c.id
        rows = (await self.db.execute(select(*[column.label(key) for key, column in selections.items()]))).mappings().all()
        people: list[RosterAuthorizationInput] = []
        for row in rows:
            employee_no = normalize_employee_no(row.get("employee_no"))
            display_name = normalize_roster_text(row.get("display_name"))
            if not employee_no or not display_name:
                continue
            departure_date = normalize_roster_date(row.get("departure_date"))
            if not include_excluded_leavers and normalize_roster_text(row.get("employment_status")) == "离职":
                if not cycle.leaver_enabled or departure_date is None or cycle.leaver_start_date is None or cycle.leaver_end_date is None or not (cycle.leaver_start_date <= departure_date <= cycle.leaver_end_date):
                    continue
            people.append(RosterAuthorizationInput(
                employee_no=employee_no,
                display_name=display_name,
                source_roster_id=row.get("source_roster_id"),
                **{field: normalize_roster_text(row.get(field)) for field in ORGANIZATION_FIELDS},
                direct_supervisor_source_value=normalize_roster_text(row.get("direct_supervisor_source_value")),
                hrbp_source_value=normalize_roster_text(row.get("hrbp_source_value")),
                employee_type=normalize_roster_text(row.get("employee_type")),
                employment_status=normalize_roster_text(row.get("employment_status")),
                job_family=normalize_roster_text(row.get("job_family")),
                job_category=normalize_roster_text(row.get("job_category")),
                standard_position=normalize_roster_text(row.get("standard_position")),
                position_level=normalize_roster_text(row.get("position_level")),
                hire_date=normalize_roster_date(row.get("hire_date")),
                departure_date=departure_date,
            ))
        return people

    @staticmethod
    def serialize(cycle: PerformanceCycle) -> dict[str, Any]:
        return {"id": cycle.id, "cycle_ref": cycle.cycle_ref, "name": cycle.name, "language": cycle.language, "period_year": cycle.period_year, "period_type": cycle.period_type, "period_subtype": getattr(cycle, "period_subtype", None), "template_id": getattr(cycle, "template_id", None), "template_ids": PerformanceCycleService.template_ids(cycle), "start_at": cycle.start_at.isoformat(), "end_at": cycle.end_at.isoformat(), "lock_rule": cycle.lock_rule, "lock_at": cycle.lock_at.isoformat() if cycle.lock_at else None, "pre_lock_sync_mode": cycle.pre_lock_sync_mode, "leaver_enabled": cycle.leaver_enabled, "leaver_start_date": cycle.leaver_start_date.isoformat() if cycle.leaver_start_date else None, "leaver_end_date": cycle.leaver_end_date.isoformat() if cycle.leaver_end_date else None, "leaver_participation_mode": cycle.leaver_participation_mode, "overdue_submission_enabled": getattr(cycle, "overdue_submission_enabled", True), "overdue_submission_scope": getattr(cycle, "overdue_submission_scope", "EVALUATION"), "status": cycle.status}

    @staticmethod
    def _validate_payload(payload: dict[str, Any], *, validate_lock_lead_time=True) -> None:
        if not payload["name"].strip():
            raise CycleValidationError("周期名称不能为空")
        if payload["end_at"] <= payload["start_at"]:
            raise CycleValidationError("需晚于开始时间")
        if validate_lock_lead_time and payload["lock_rule"] == CYCLE_LOCK_RULE_SCHEDULED:
            if payload.get("lock_at") is None or payload["lock_at"] < datetime.now(UTC) + timedelta(hours=6):
                raise CycleValidationError("锁定时间必须比当前时间晚至少 6 小时")
        if payload["leaver_enabled"] and (payload.get("leaver_start_date") is None or payload.get("leaver_end_date") is None or payload["leaver_end_date"] < payload["leaver_start_date"]):
            raise CycleValidationError("离职人员参评日期范围不合法")

    @classmethod
    def _validate_cycle(cls, cycle: PerformanceCycle) -> None:
        cls._validate_payload({"name": cycle.name, "start_at": cycle.start_at, "end_at": cycle.end_at, "lock_rule": cycle.lock_rule, "lock_at": cycle.lock_at, "leaver_enabled": cycle.leaver_enabled, "leaver_start_date": cycle.leaver_start_date, "leaver_end_date": cycle.leaver_end_date}, validate_lock_lead_time=False)
    @staticmethod
    def _normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        if normalized.get("template_ids") is not None:
            ids = list(dict.fromkeys(normalized["template_ids"]))
            if normalized.get("template_id") is not None and normalized["template_id"] != (ids[0] if ids else None):
                raise CycleValidationError("模板单值与多选配置不一致")
            normalized["template_ids"] = ids
            normalized["template_id"] = ids[0] if ids else None
        elif "template_id" in normalized:
            normalized["template_ids"] = [normalized["template_id"]] if normalized["template_id"] else []
        else:
            normalized.pop("template_ids", None)
        for field in ("start_at", "end_at", "lock_at"):
            value = normalized.get(field)
            if value is not None:
                normalized[field] = normalize_cycle_datetime(value)
        return normalized




