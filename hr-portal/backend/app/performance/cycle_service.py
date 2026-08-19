"""Cycle lifecycle services backed by performance authorization snapshots."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import DATA_TABLES
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
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceCycle,
    PerformanceProject,
    PROJECT_STATUS_STARTED,
)
from app.performance.snapshot_service import PerformanceAuthorizationSnapshotService, RosterAuthorizationInput


class CycleValidationError(ValueError):
    pass


def _actor_ref(subject_id: int) -> str:
    return str(subject_id)


def _column(table, *candidates: str):
    for candidate in candidates:
        if candidate in table.c:
            return table.c[candidate]
    return None


def _as_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def normalize_cycle_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
    return value.astimezone(timezone.utc)


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
        return [{"id": project.id, "project_ref": project.project_ref, "name": project.name, "description": project.description, "administrators": project.administrators or [], "status": project.status, "evaluated_count": project.evaluated_count} for project in projects]

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
        return [
            {
                "employee_no": person.employee_no,
                "display_name": person.display_name,
                "organization_ref": person.organization_ref,
                "direct_manager_employee_no": person.direct_manager_employee_no,
                "hrbp_employee_no": person.hrbp_employee_no,
                "employment_status": person.employment_status,
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
                }
            )
        for cycle_ref, (people, departments, _projects) in summaries.items():
            summaries[cycle_ref] = (
                people,
                departments,
                projects_by_cycle[cycle_ref],
            )
        return summaries

    async def create_cycle(self, payload: dict[str, Any], *, actor_type: str, actor_id: int) -> PerformanceCycle:
        payload = self._normalize_payload(payload)
        self._validate_payload(payload)
        cycle = PerformanceCycle(
            cycle_ref=f"cycle:{uuid4().hex}",
            name=payload["name"].strip(),
            language=payload.get("language", "zh-CN"),
            period_year=payload["period_year"],
            period_type=payload["period_type"],
            period_subtype=payload.get("period_subtype"),
            start_at=payload["start_at"],
            end_at=payload["end_at"],
            lock_rule=payload["lock_rule"],
            lock_at=payload.get("lock_at"),
            pre_lock_sync_mode=payload["pre_lock_sync_mode"],
            leaver_enabled=payload["leaver_enabled"],
            leaver_start_date=payload.get("leaver_start_date"),
            leaver_end_date=payload.get("leaver_end_date"),
            leaver_participation_mode=payload["leaver_participation_mode"],
            status=CYCLE_STATUS_DRAFT,
            created_by_type=actor_type,
            created_by_ref=_actor_ref(actor_id),
        )
        self.db.add(cycle)
        await self.db.flush()
        await self._sync_snapshot(cycle, actor_type=actor_type, actor_id=actor_id)
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
        before = self.serialize(cycle)
        for field in ("name", "language", "period_year", "period_type", "period_subtype", "start_at", "end_at", "leaver_enabled", "leaver_start_date", "leaver_end_date", "leaver_participation_mode"):
            if field in payload:
                setattr(cycle, field, payload[field].strip() if field == "name" else payload[field])
        self._validate_cycle(cycle)
        leaver_fields_changed = any(field in payload for field in ("leaver_enabled", "leaver_start_date", "leaver_end_date"))
        if leaver_fields_changed and datetime.now(UTC) >= cycle.start_at.astimezone(UTC):
            raise CycleValidationError("绩效环节已开始，不能修改离职人员参评范围")
        if leaver_fields_changed:
            await self._sync_snapshot(cycle, actor_type=actor_type, actor_id=actor_id, allow_locked_update=True)
        if leaver_fields_changed:
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
        fields = ("display_name", "organization_ref", "direct_manager_employee_no", "hrbp_employee_no", "employment_status", "departure_date", "is_manually_maintained")
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
            before = {field: getattr(person, field) for field in ("display_name", "organization_ref", "direct_manager_employee_no", "hrbp_employee_no")}
            for field in before:
                if field in update:
                    setattr(person, field, update[field])
            person.is_manually_maintained = True
            changed.append({"employee_no": employee_no, "before": before, "after": {field: getattr(person, field) for field in before}})
        self.audit.append_event(AuditEventInput(event_type="PERFORMANCE_CYCLE_PEOPLE_MANUALLY_UPDATED", cycle_ref=cycle.cycle_ref, actor_type=actor_type, actor_ref=_actor_ref(actor_id), after_state={"reason": reason.strip(), "changes": changed}))
        await self.db.commit()
        await self.db.refresh(cycle)
        return cycle

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

    async def _load_roster_inputs(self, cycle: PerformanceCycle) -> list[RosterAuthorizationInput]:
        model = DATA_TABLES.get("emp_realtime_roster")
        if model is None:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="员工实时花名册未准备好")
        table = model.__table__
        employee = _column(table, "employee_no")
        name = _column(table, "full_name", "employee_name", "name")
        if employee is None or name is None:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="员工实时花名册缺少 employee_no 或人员名称字段")
        selections = {
            "source_roster_id": _column(table, "id"), "employee_no": employee, "display_name": name,
            "organization_ref": _column(table, "org_node_code", "company_org", "department_name"),
            "direct_manager_source_value": _column(table, "direct_manager_employee_no", "direct_manager", "manager_employee_no"),
            "hrbp_source_value": _column(table, "hrbp_employee_no", "hrbp"),
            "employment_status": _column(table, "employment_status", "employee_status", "active_status"),
            "departure_date": _column(table, "departure_date", "leave_date", "termination_date", "resignation_date"),
        }
        rows = (await self.db.execute(select(*[column.label(key) for key, column in selections.items() if column is not None]))).mappings().all()
        people: list[RosterAuthorizationInput] = []
        for row in rows:
            employee_no = str(row.get("employee_no") or "").strip()
            display_name = str(row.get("display_name") or "").strip()
            if not employee_no or not display_name:
                continue
            is_leaver = str(row.get("employment_status") or "").strip() == "离职"
            if is_leaver:
                departure = _as_date(row.get("departure_date"))
                if not cycle.leaver_enabled or departure is None or cycle.leaver_start_date is None or cycle.leaver_end_date is None or not (cycle.leaver_start_date <= departure <= cycle.leaver_end_date):
                    continue
            people.append(RosterAuthorizationInput(employee_no=employee_no, display_name=display_name, source_roster_id=row.get("source_roster_id"), organization_ref=row.get("organization_ref"), direct_manager_source_value=row.get("direct_manager_source_value"), hrbp_source_value=row.get("hrbp_source_value"), employment_status=row.get("employment_status"), departure_date=_as_date(row.get("departure_date"))))
        return people

    @staticmethod
    def serialize(cycle: PerformanceCycle) -> dict[str, Any]:
        return {"id": cycle.id, "cycle_ref": cycle.cycle_ref, "name": cycle.name, "language": cycle.language, "period_year": cycle.period_year, "period_type": cycle.period_type, "period_subtype": getattr(cycle, "period_subtype", None), "start_at": cycle.start_at.isoformat(), "end_at": cycle.end_at.isoformat(), "lock_rule": cycle.lock_rule, "lock_at": cycle.lock_at.isoformat() if cycle.lock_at else None, "pre_lock_sync_mode": cycle.pre_lock_sync_mode, "leaver_enabled": cycle.leaver_enabled, "leaver_start_date": cycle.leaver_start_date.isoformat() if cycle.leaver_start_date else None, "leaver_end_date": cycle.leaver_end_date.isoformat() if cycle.leaver_end_date else None, "leaver_participation_mode": cycle.leaver_participation_mode, "status": cycle.status}

    @staticmethod
    def _validate_payload(payload: dict[str, Any]) -> None:
        if not payload["name"].strip():
            raise CycleValidationError("周期名称不能为空")
        if payload["end_at"] <= payload["start_at"]:
            raise CycleValidationError("需晚于开始时间")
        if payload["lock_rule"] == CYCLE_LOCK_RULE_SCHEDULED:
            if payload.get("lock_at") is None or payload["lock_at"] < datetime.now(UTC) + timedelta(hours=6):
                raise CycleValidationError("锁定时间必须比当前时间晚至少 6 小时")
        if payload["leaver_enabled"] and (payload.get("leaver_start_date") is None or payload.get("leaver_end_date") is None or payload["leaver_end_date"] < payload["leaver_start_date"]):
            raise CycleValidationError("离职人员参评日期范围不合法")

    @classmethod
    def _validate_cycle(cls, cycle: PerformanceCycle) -> None:
        cls._validate_payload({"name": cycle.name, "start_at": cycle.start_at, "end_at": cycle.end_at, "lock_rule": cycle.lock_rule, "lock_at": cycle.lock_at, "leaver_enabled": cycle.leaver_enabled, "leaver_start_date": cycle.leaver_start_date, "leaver_end_date": cycle.leaver_end_date})
    @staticmethod
    def _normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        for field in ("start_at", "end_at", "lock_at"):
            value = normalized.get(field)
            if value is not None:
                normalized[field] = normalize_cycle_datetime(value)
        return normalized




