from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from sqlalchemy import Column, Date, MetaData, String, Table

from app.data.models import DATA_TABLES
from app.performance.cycle_service import CycleValidationError, PerformanceCycleService
from app.performance.cycles_router import CyclePatch, CyclePayload, _build_hrbp_organization_tree, _load_hrbp_options


def _payload(**overrides):
    value = {
        "name": "2026 年度考核",
        "period_year": 2026,
        "period_type": "ANNUAL",
        "start_at": datetime(2026, 1, 1, 9, 0),
        "end_at": datetime(2026, 3, 1, 18, 0),
        "lock_rule": "IMMEDIATE",
        "pre_lock_sync_mode": "MANUAL",
        "leaver_enabled": False,
        "leaver_participation_mode": "CREATE_TASK",
    }
    value.update(overrides)
    return value


def test_cycle_payload_normalizes_annual_period_type_for_compatibility():
    payload = CyclePayload(**_payload(period_type="ANNUAL"))

    assert payload.period_type == "YEAR"


def test_cycle_payload_rejects_unknown_period_type():
    with pytest.raises(ValidationError):
        CyclePayload(**_payload(period_type="WEEK"))


def test_cycle_patch_rejects_unknown_period_type():
    with pytest.raises(ValidationError):
        CyclePatch(period_type="WEEK")



    with pytest.raises(ValidationError, match="晚于开始时间"):
        CyclePayload(**_payload(end_at=datetime(2026, 1, 1, 9, 0)))


def test_cycle_payload_normalizes_mixed_timezone_inputs_before_comparison():
    payload = CyclePayload(
        **_payload(
            start_at=datetime(2026, 1, 1, 9, 0),
            end_at=datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc),
        )
    )
    normalized = PerformanceCycleService._normalize_payload(payload.model_dump())
    assert normalized["start_at"] < normalized["end_at"]


def test_cycle_payload_rejects_mixed_timezone_inputs_when_end_is_not_later():
    with pytest.raises(ValidationError, match="晚于开始时间"):
        CyclePayload(
            **_payload(
                start_at=datetime(2026, 1, 1, 9, 0),
                end_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
            )
        )


def test_cycle_payload_requires_scheduled_lock_time():
    with pytest.raises(ValidationError, match="定时锁定"):
        CyclePayload(**_payload(lock_rule="SCHEDULED"))


def test_cycle_service_accepts_historical_start_and_normalizes_local_time():
    normalized = PerformanceCycleService._normalize_payload(_payload())["start_at"]
    assert normalized.tzinfo == timezone.utc
    assert normalized.hour == 1


def test_cycle_service_requires_scheduled_lock_six_hours_ahead():
    too_soon = datetime.now(timezone.utc) + timedelta(hours=5, minutes=59)
    with pytest.raises(CycleValidationError, match="至少 6 小时"):
        PerformanceCycleService._validate_payload(_payload(lock_rule="SCHEDULED", lock_at=too_soon))


def test_cycle_payload_requires_leaver_date_range_when_enabled():
    with pytest.raises(ValidationError, match="日期范围"):
        CyclePayload(**_payload(leaver_enabled=True))

def test_cycle_patch_accepts_only_editable_base_fields():
    patch = CyclePatch(name="修订名称", period_type="MONTH")

    assert patch.model_dump(exclude_unset=True) == {"name": "修订名称", "period_type": "MONTH"}


def test_cycle_patch_rejects_immutable_lock_configuration():
    with pytest.raises(ValidationError):
        CyclePatch(lock_rule="SCHEDULED")


def test_people_input_rejects_project_scope_fields():
    from app.performance.cycles_router import ManualPeopleUpdateIn, PeopleRefreshIn

    with pytest.raises(ValidationError):
        PeopleRefreshIn(reason="名单刷新", project_ref="project:one")
    with pytest.raises(ValidationError):
        ManualPeopleUpdateIn(
            reason="人员维护",
            project_ref="project:one",
            people=[{"employee_no": "E001"}],
        )


def test_manual_person_update_rejects_null_or_empty_display_name():
    from app.performance.cycles_router import ManualPersonUpdate

    with pytest.raises(ValidationError):
        ManualPersonUpdate(employee_no="E001", display_name=None)
    with pytest.raises(ValidationError):
        ManualPersonUpdate(employee_no="E001", display_name="")
    with pytest.raises(ValidationError):
        ManualPersonUpdate(employee_no="E001", display_name="   ")


def test_cycle_list_does_not_run_lifecycle_side_effect():
    import inspect

    source = inspect.getsource(PerformanceCycleService.list_cycles)
    assert "process_due_locks" not in source


def test_cycle_snapshot_model_tracks_manual_and_departure_state():
    from app.performance.models import PerformanceAuthorizationSnapshotPerson

    columns = PerformanceAuthorizationSnapshotPerson.__table__.columns
    assert "is_manually_maintained" in columns
    assert "departure_date" in columns




class _RefsResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self.values


class _DueLockDb:
    def __init__(self, cycle):
        self.cycle = cycle
        self.calls = []
        self.committed = False

    async def execute(self, _statement):
        self.calls.append(_statement)
        if len(self.calls) == 1:
            return _RefsResult([self.cycle.cycle_ref])
        return _SnapshotResult(self.cycle)

    async def commit(self):
        self.committed = True


@pytest.mark.asyncio
async def test_due_scheduled_auto_daily_lock_syncs_before_lock(monkeypatch):
    from app.performance import cycle_service

    cycle = SimpleNamespace(
        cycle_ref="cycle:scheduled",
        status="DRAFT",
        lock_rule="SCHEDULED",
        lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        pre_lock_sync_mode="AUTO_DAILY",
    )
    db = _DueLockDb(cycle)
    service = PerformanceCycleService(db)
    calls = []

    async def sync_snapshot(*args, **kwargs):
        calls.append("sync")

    async def prune_excluded_leavers(*args, **kwargs):
        calls.append("prune")

    async def lock_snapshot(*args, **kwargs):
        calls.append("lock")

    monkeypatch.setattr(service, "_sync_snapshot", sync_snapshot)
    monkeypatch.setattr(service, "_prune_excluded_leavers", prune_excluded_leavers)
    monkeypatch.setattr(service.snapshots, "lock_snapshot", lock_snapshot)

    assert await service.process_due_locks() == 1
    assert calls == ["sync", "prune", "lock"]
    assert cycle.status == "LOCKED"
    assert db.committed


@pytest.mark.asyncio
async def test_due_scheduled_manual_lock_does_not_auto_sync(monkeypatch):
    cycle = SimpleNamespace(
        cycle_ref="cycle:scheduled",
        status="DRAFT",
        lock_rule="SCHEDULED",
        lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        pre_lock_sync_mode="MANUAL",
    )
    db = _DueLockDb(cycle)
    service = PerformanceCycleService(db)
    calls = []

    async def sync_snapshot(*args, **kwargs):
        calls.append("sync")

    async def lock_snapshot(*args, **kwargs):
        calls.append("lock")

    monkeypatch.setattr(service, "_sync_snapshot", sync_snapshot)
    monkeypatch.setattr(service.snapshots, "lock_snapshot", lock_snapshot)

    assert await service.process_due_locks() == 1
    assert calls == ["lock"]



    from app.scheduler.handlers import JOB_HANDLERS

    assert "performance_cycle_lifecycle" in JOB_HANDLERS


class _SnapshotResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _PeopleResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return self.values


class _PruneDb:
    def __init__(self, snapshot, people):
        self.responses = [_SnapshotResult(snapshot), _PeopleResult(people)]
        self.deleted = []

    async def execute(self, _statement):
        return self.responses.pop(0)

    async def delete(self, record):
        self.deleted.append(record)


@pytest.mark.asyncio
async def test_leaver_pruning_removes_all_excluded_snapshot_people():
    from datetime import date
    from types import SimpleNamespace

    snapshot = SimpleNamespace(id=1)
    manually_maintained = SimpleNamespace(
        employment_status="\u79bb\u804c",
        departure_date=date(2026, 1, 1),
        is_manually_maintained=True,
    )
    automatically_maintained = SimpleNamespace(
        employment_status="\u79bb\u804c",
        departure_date=date(2026, 1, 1),
        is_manually_maintained=False,
    )
    db = _PruneDb(snapshot, [manually_maintained, automatically_maintained])
    cycle = SimpleNamespace(
        cycle_ref="cycle:test",
        leaver_enabled=False,
        leaver_start_date=None,
        leaver_end_date=None,
    )

    await PerformanceCycleService(db)._prune_excluded_leavers(cycle)

    assert db.deleted == [manually_maintained, automatically_maintained]


def test_snapshot_allows_duplicate_display_names_with_distinct_employee_numbers():
    from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people

    people = build_snapshot_people([
        RosterAuthorizationInput(employee_no="E001", display_name="张三"),
        RosterAuthorizationInput(employee_no="E002", display_name="张三"),
    ])

    assert [person.employee_no for person in people] == ["E001", "E002"]



    from pathlib import Path

    migration = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0220_performance_projects.py"
    ).read_text(encoding="utf-8")

    assert "sa.dialects.postgresql.JSONB()" in migration
    assert "'[]'::jsonb" in migration


@pytest.mark.asyncio
async def test_cycle_people_route_allows_only_cycle_managers(monkeypatch):
    from types import SimpleNamespace

    from app.performance import cycles_router
    from app.performance.auth_context import PerformanceAccessContext

    class FakeService:
        async def get_cycle(self, _cycle_id):
            return SimpleNamespace(cycle_ref="cycle:test")

        async def people_for_cycle(self, _cycle):
            return []

    monkeypatch.setattr(cycles_router, "PerformanceCycleService", lambda _db: FakeService())
    cycle = PerformanceAccessContext(
        subject_type="PORTAL_USER", subject_id=1, display_name="管理员", account_type=None,
        portal_entry_permissions=("performance.admin",), role_grants=(),
        permission_codes=("performance.cycles.manage",),
    )
    project = PerformanceAccessContext(
        subject_type="PORTAL_USER", subject_id=2, display_name="项目管理员", account_type=None,
        portal_entry_permissions=("performance.admin",), role_grants=(),
        permission_codes=("performance.projects.manage",),
    )
    normal = PerformanceAccessContext(
        subject_type="PORTAL_USER", subject_id=3, display_name="普通用户", account_type=None,
        portal_entry_permissions=("performance.app",), role_grants=(), permission_codes=(),
    )

    assert await cycles_router.get_cycle_people(1, cycle, object()) == []
    with pytest.raises(HTTPException) as project_error:
        await cycles_router.get_cycle_people(1, project, object())
    assert project_error.value.status_code == 403
    with pytest.raises(HTTPException) as normal_error:
        await cycles_router.get_cycle_people(1, normal, object())
    assert normal_error.value.status_code == 403


def test_project_manager_cycle_summary_hides_global_counts():
    from app.performance import cycles_router
    from app.performance.auth_context import PerformanceAccessContext

    context = PerformanceAccessContext(
        subject_type="PORTAL_USER", subject_id=2, display_name="项目管理员", account_type=None,
        portal_entry_permissions=("performance.admin",), role_grants=(),
        permission_codes=("performance.projects.manage",),
    )
    cycle = SimpleNamespace(
        id=1, cycle_ref="cycle:test", name="测试周期", language="zh-CN", period_year=2026,
        period_type="YEAR", start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 12, 31, tzinfo=timezone.utc), lock_rule="IMMEDIATE",
        lock_at=None, pre_lock_sync_mode="MANUAL", leaver_enabled=False,
        leaver_start_date=None, leaver_end_date=None, leaver_participation_mode="CREATE_TASK",
        status="LOCKED",
    )
    summary = cycles_router._summary_for_context(cycle, 10, 4, [], context)
    assert summary.people_count == 0
    assert summary.department_count == 0


def test_build_hrbp_organization_tree_uses_six_roster_levels():
    tree = _build_hrbp_organization_tree([
        {
            "company_org": "集团",
            "department": "研发中心",
            "department_2": "平台部",
            "department_3": "数据组",
            "department_4": "分析小组",
            "department_5": "应用单元",
        },
        {
            "company_org": "集团",
            "department": "研发中心",
            "department_2": "产品部",
        },
    ])

    assert tree[0].value == "集团"
    assert tree[0].children[0].value == "集团/研发中心"
    assert [node.label for node in tree[0].children[0].children] == ["产品部", "平台部"]
    platform = tree[0].children[0].children[1]
    assert platform.children[0].children[0].children[0].label == "应用单元"


class _HrbpRosterMappings:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _HrbpRosterResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return _HrbpRosterMappings(self.rows)


class _HrbpRosterDb:
    def __init__(self, rows):
        self.rows = rows
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _HrbpRosterResult(self.rows)


@pytest.mark.asyncio
async def test_load_hrbp_options_filters_active_people_and_builds_tree():
    columns = [
        Column("employee_no", String),
        Column("full_name", String),
        Column("employment_status", String),
        Column("company_org", String),
        Column("department", String),
        Column("department_2", String),
        Column("department_3", String),
        Column("department_4", String),
        Column("department_5", String),
    ]
    model = SimpleNamespace(__table__=Table("emp_realtime_roster", MetaData(), *columns))
    previous = DATA_TABLES.get("emp_realtime_roster")
    DATA_TABLES["emp_realtime_roster"] = model
    db = _HrbpRosterDb([
        {
            "employee_no": "E001",
            "full_name": "张三",
            "employment_status": "在职",
            "company_org": "集团",
            "department": "研发中心",
            "department_2": "平台部",
            "department_3": None,
            "department_4": None,
            "department_5": None,
        }
    ])
    try:
        result = await _load_hrbp_options(db)
    finally:
        if previous is None:
            DATA_TABLES.pop("emp_realtime_roster", None)
        else:
            DATA_TABLES["emp_realtime_roster"] = previous

    assert result.people[0].model_dump() == {"value": "E001", "label": "张三"}
    assert result.organization_tree[0].children[0].children[0].label == "平台部"
    assert "在职" in db.statement.compile().params.values()


@pytest.mark.asyncio
async def test_load_hrbp_options_exposes_cycle_snapshot_people_for_invisible_selector():
    from app.performance.cycles_router import _load_hrbp_options

    columns = [
        Column("employee_no", String), Column("full_name", String), Column("employment_status", String),
        Column("company_org", String), Column("department", String), Column("department_2", String),
        Column("department_3", String), Column("department_4", String), Column("department_5", String),
    ]
    model = SimpleNamespace(__table__=Table("emp_realtime_roster", MetaData(), *columns))
    previous = DATA_TABLES.get("emp_realtime_roster")
    DATA_TABLES["emp_realtime_roster"] = model

    class SnapshotResult:
        def scalars(self):
            return self

        def all(self):
            return [SimpleNamespace(employee_no="E002", display_name="李四", employment_status="在职", company_org="集团", department="研发中心", department_2=None, department_3=None, department_4=None, department_5=None)]

    class Db(_HrbpRosterDb):
        def __init__(self):
            super().__init__([])
            self.calls = 0

        async def scalar(self, _statement):
            return SimpleNamespace(id=3)

        async def execute(self, statement):
            self.calls += 1
            return SnapshotResult()

    try:
        result = await _load_hrbp_options(Db(), SimpleNamespace(cycle_ref="cycle:1"))
    finally:
        if previous is None:
            DATA_TABLES.pop("emp_realtime_roster", None)
        else:
            DATA_TABLES["emp_realtime_roster"] = previous

    assert [item.value for item in result.invisible_people] == ["E002"]
    assert result.invisible_people[0].label == "李四（E002）"


@pytest.mark.asyncio
async def test_cycle_snapshot_reads_canonical_employee_roster_fields():
    from datetime import date

    columns = [
        Column("id", String),
        Column("employee_no", String),
        Column("full_name", String),
        Column("company_org", String),
        Column("department", String),
        Column("department_2", String),
        Column("department_3", String),
        Column("department_4", String),
        Column("department_5", String),
        Column("direct_supervisor", String),
        Column("hrbp", String),
        Column("employee_type", String),
        Column("employment_status", String),
        Column("job_family", String),
        Column("job_category", String),
        Column("position_level", String),
        Column("hire_date", Date),
        Column("expected_departure_date", Date),
    ]
    model = SimpleNamespace(__table__=Table("emp_realtime_roster", MetaData(), *columns))
    previous = DATA_TABLES.get("emp_realtime_roster")
    DATA_TABLES["emp_realtime_roster"] = model
    row = {
        "source_roster_id": "7",
        "employee_no": "E001",
        "display_name": "员工一",
        "company_org": "集团",
        "department": "研发中心",
        "department_2": "平台部",
        "department_3": None,
        "department_4": None,
        "department_5": None,
        "direct_supervisor_source_value": "M001",
        "hrbp_source_value": "H001",
        "employee_type": "正式员工",
        "employment_status": "在职",
        "job_family": "技术",
        "job_category": "研发",
        "position_level": "P6",
        "hire_date": date(2020, 1, 2),
        "departure_date": None,
    }
    try:
        people = await PerformanceCycleService(_HrbpRosterDb([row]))._load_roster_inputs(SimpleNamespace(
            leaver_enabled=False,
            leaver_start_date=None,
            leaver_end_date=None,
        ))
    finally:
        if previous is None:
            DATA_TABLES.pop("emp_realtime_roster", None)
        else:
            DATA_TABLES["emp_realtime_roster"] = previous

    assert len(people) == 1
    person = people[0]
    assert (person.company_org, person.department, person.department_2) == ("集团", "研发中心", "平台部")
    assert person.direct_supervisor_source_value == "M001"
    assert person.employee_type == "正式员工"
    assert (person.job_family, person.job_category) == ("技术", "研发")
    assert (person.position_level, person.hire_date) == ("P6", date(2020, 1, 2))


def test_manual_people_payload_rejects_derived_organization_ref():
    from app.performance.cycles_router import ManualPersonUpdate

    with pytest.raises(ValidationError, match="organization_ref"):
        ManualPersonUpdate(employee_no="E001", organization_ref="集团/研发")
    assert ManualPersonUpdate(employee_no="E001", department_2="平台").department_2 == "平台"


@pytest.mark.asyncio
async def test_cycle_manual_organization_edit_recomputes_path(monkeypatch):
    from datetime import UTC
    from app.performance.models import PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson

    cycle = SimpleNamespace(cycle_ref="cycle:org", start_at=datetime(2027, 1, 1, tzinfo=UTC))
    snapshot = SimpleNamespace(id=8)
    person = SimpleNamespace(
        employee_no="E001", display_name="员工一", company_org="集团", department="研发",
        department_2="平台", department_3=None, department_4=None, department_5=None,
        organization_ref="集团/研发/平台", direct_supervisor_employee_no=None,
        hrbp_employee_no=None, employee_type="正式", job_family=None, job_category=None,
        position_level=None, hire_date=None, is_manually_maintained=False,
    )

    class Db:
        async def execute(self, stmt):
            entity = stmt.column_descriptions[0]["entity"]
            if entity is PerformanceAuthorizationSnapshot:
                return SimpleNamespace(scalar_one_or_none=lambda: snapshot)
            if entity is PerformanceAuthorizationSnapshotPerson:
                return SimpleNamespace(scalars=lambda: [person])
            raise AssertionError(stmt)

        async def commit(self):
            pass

        async def refresh(self, _):
            pass

    service = PerformanceCycleService(Db())
    service.audit = SimpleNamespace(append_event=lambda _: None)
    await service.update_people_manually(
        cycle, [{"employee_no": "E001", "department_2": "新平台", "department_3": "小组"}],
        actor_type="PORTAL_USER", actor_id=1, reason="调整组织",
    )
    assert person.organization_ref == "集团/研发/新平台/小组"
    assert person.is_manually_maintained is True
