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


@pytest.mark.parametrize("mode,rule,offset,valid", [
    ("AUTO_DAILY", "SCHEDULED", 1, True),
    ("AUTO_DAILY", "SCHEDULED", 8, False),
    ("AUTO_DAILY", "SCHEDULED", -1, False),
    ("AUTO_DAILY", "SCHEDULED", None, False),
    ("MANUAL", "SCHEDULED", 1, False),
    ("AUTO_DAILY", "IMMEDIATE", 1, False),
    ("MANUAL", "SCHEDULED", None, True),
])
def test_pre_lock_adjust_until_contract(mode, rule, offset, valid):
    now = datetime.now(timezone.utc)
    values = _payload(lock_rule=rule, pre_lock_sync_mode=mode, lock_at=now + timedelta(hours=7),
                      pre_lock_adjust_until=now + timedelta(hours=offset) if offset is not None else None)
    if valid:
        parsed = CyclePayload(**values)
        PerformanceCycleService._validate_payload(PerformanceCycleService._normalize_payload(parsed.model_dump()))
    else:
        with pytest.raises(ValidationError):
            CyclePayload(**values)
        with pytest.raises(CycleValidationError):
            PerformanceCycleService._validate_payload(PerformanceCycleService._normalize_payload(values))
    with pytest.raises(ValidationError):
        CyclePayload(**{**_payload(), "lock_policy_version": 2})
    with pytest.raises(ValidationError):
        CyclePatch(pre_lock_adjust_until=None)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,version,expired,due", [
    ("MANUAL", 2, False, False), ("AUTO_DAILY", 1, False, False),
    ("AUTO_DAILY", 2, False, False), ("AUTO_DAILY", 2, True, False),
    ("AUTO_DAILY", 2, True, True),
])
async def test_lifecycle_adjustment_window_and_daily_idempotence(monkeypatch, mode, version, expired, due):
    from unittest.mock import AsyncMock
    from app.performance import cycle_service, member_service
    from zoneinfo import ZoneInfo
    now = datetime(2026, 11, 20, 16, 1, tzinfo=timezone.utc)
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None): return now.astimezone(tz)
    monkeypatch.setattr(cycle_service, "datetime", Clock)
    cycle = SimpleNamespace(cycle_ref="window", status="DRAFT", lock_rule="SCHEDULED", pre_lock_sync_mode=mode,
                            lock_policy_version=version, lock_at=now + timedelta(hours=-1 if due else 10),
                            pre_lock_adjust_until=now + timedelta(hours=-2 if expired else 2),
                            pre_lock_adjusted_on=None, member_info_frozen_at=None)
    snapshot = SimpleNamespace(last_synced_at=now - timedelta(minutes=2))
    class Db(_DueLockDb):
        async def execute(self, statement):
            if "performance_authorization_snapshots" in str(statement): return _SnapshotResult(snapshot)
            if len(statement.column_descriptions) and statement.column_descriptions[0]["name"] == "cycle_ref": return _RefsResult([cycle.cycle_ref])
            return _SnapshotResult(cycle)
    db = Db(cycle)
    service = PerformanceCycleService(db)
    sync = AsyncMock()
    adjust = AsyncMock()
    freeze = AsyncMock()
    monkeypatch.setattr(service, "_sync_snapshot", sync)
    monkeypatch.setattr(service, "_prune_excluded_leavers", AsyncMock())
    monkeypatch.setattr(service.snapshots, "lock_snapshot", AsyncMock())
    monkeypatch.setattr(member_service, "adjust_cycle_members", adjust)
    monkeypatch.setattr(member_service, "freeze_cycle_members", freeze)
    await service.process_due_locks()
    assert sync.await_count == 1  # 北京时间已跨自然日，UTC仍同日
    assert adjust.await_count == int(mode == "AUTO_DAILY" and version == 2 and not expired and not due)
    assert freeze.await_count == int(version == 2 and (due or mode == "AUTO_DAILY" and expired))
    snapshot.last_synced_at = now
    if not due:
        await service.process_due_locks()
        assert sync.await_count == 1
        assert adjust.await_count <= 1
        assert freeze.await_count <= 1


def test_project_manager_import_payload_rejects_missing_identifiers_and_unknown_fields():
    from app.performance.cycles_router import ProjectManagerImportIn

    with pytest.raises(ValidationError):
        ProjectManagerImportIn(reason="导入", people=[{"target_employee_no": "E1"}])
    with pytest.raises(ValidationError):
        ProjectManagerImportIn(reason="导入", people=[{"target_employee_no": "E1", "manager_employee_no": "M1", "unknown": True}])
    with pytest.raises(ValidationError):
        ProjectManagerImportIn(reason="", people=[{"target_employee_no": "E1", "manager_employee_no": "M1"}])


def test_cycle_payload_normalizes_annual_period_type_for_compatibility():
    payload = CyclePayload(**_payload(period_type="ANNUAL"))

    assert payload.period_type == "YEAR"


def test_cycle_payload_rejects_unknown_period_type():
    with pytest.raises(ValidationError):
        CyclePayload(**_payload(period_type="WEEK"))


def test_cycle_patch_rejects_unknown_period_type():
    with pytest.raises(ValidationError):
        CyclePatch(period_type="WEEK")


@pytest.mark.asyncio
async def test_cycle_overdue_patch_is_audited_and_applies_to_locked_cycle_with_started_project(monkeypatch):
    from app.performance import cycle_service
    from app.performance.models import PerformanceOtherSetting

    cycle = SimpleNamespace(
        id=1, cycle_ref="cycle:1", name="本周期", language="zh-CN", period_year=2026,
        period_type="YEAR", period_subtype=None, template_id=None,
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc), end_at=datetime(2026, 12, 31, tzinfo=timezone.utc),
        lock_rule="IMMEDIATE", lock_at=None, pre_lock_sync_mode="MANUAL", leaver_enabled=False,
        leaver_start_date=None, leaver_end_date=None, leaver_participation_mode="CREATE_TASK",
        overdue_submission_enabled=True, overdue_submission_scope="EVALUATION", status="LOCKED",
        projects=[SimpleNamespace(status="STARTED")],
    )

    class Db:
        def __init__(self):
            self.committed = False

        async def execute(self, _statement):
            return SimpleNamespace(scalar_one=lambda: cycle)

        async def get(self, model, _key):
            if model is PerformanceOtherSetting:
                return SimpleNamespace(overdue_single_submission_enabled=True, cycle_overdue_submission_override_enabled=True)

        async def commit(self):
            self.committed = True

        async def refresh(self, _value):
            pass

    events = []
    monkeypatch.setattr(cycle_service.PerformanceAuditService, "append_event", lambda _self, event: events.append(event))
    db = Db()
    result = await PerformanceCycleService(db).update_cycle(cycle, {"overdue_submission_enabled": False, "overdue_submission_scope": "ALL"}, actor_type="SYSTEM_ACCOUNT", actor_id=1)
    assert result.overdue_submission_enabled is False
    assert result.overdue_submission_scope == "ALL"
    assert db.committed
    assert events[-1].before_state["overdue_submission_enabled"] is True
    assert events[-1].after_state["overdue_submission_scope"] == "ALL"


@pytest.mark.asyncio
async def test_cycle_overdue_patch_requires_global_switches():
    from app.performance.models import PerformanceOtherSetting

    cycle = SimpleNamespace(id=1, overdue_submission_enabled=True, overdue_submission_scope="EVALUATION")

    class Db:
        async def execute(self, _statement):
            return SimpleNamespace(scalar_one=lambda: cycle)

        async def get(self, model, _key):
            if model is PerformanceOtherSetting:
                return SimpleNamespace(overdue_single_submission_enabled=True, cycle_overdue_submission_override_enabled=False)

    with pytest.raises(CycleValidationError, match="未开启按周期"):
        await PerformanceCycleService(Db()).update_cycle(cycle, {"overdue_submission_enabled": False}, actor_type="SYSTEM_ACCOUNT", actor_id=1)


def test_cycle_payload_validates_overdue_configuration():
    payload = CyclePayload(**_payload())
    assert payload.allow_delete_360 is False
    assert CyclePayload(**_payload(allow_delete_360=True)).allow_delete_360 is True
    assert CyclePatch(allow_delete_360=True).model_dump(exclude_unset=True) == {"allow_delete_360": True}
    assert payload.overdue_submission_enabled is True
    assert payload.overdue_submission_scope == "EVALUATION"
    assert CyclePatch(overdue_submission_enabled=False, overdue_submission_scope="ALL").model_dump(exclude_unset=True) == {
        "overdue_submission_enabled": False, "overdue_submission_scope": "ALL",
    }
    with pytest.raises(ValidationError):
        CyclePatch(overdue_submission_scope="INVALID")
    with pytest.raises(ValidationError):
        CyclePayload(**_payload(overdue_submission_enabled="not-a-boolean"))


@pytest.mark.asyncio
async def test_cycle_360_delete_policy_roundtrip_audit_and_omitted_patch(monkeypatch):
    from app.performance import cycle_service

    cycle = SimpleNamespace(
        id=1, cycle_ref="cycle:1", name="本周期", language="zh-CN", period_year=2026,
        period_type="YEAR", period_subtype=None, template_id=None,
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc), end_at=datetime(2026, 12, 31, tzinfo=timezone.utc),
        lock_rule="IMMEDIATE", lock_at=None, pre_lock_sync_mode="MANUAL", leaver_enabled=False,
        leaver_start_date=None, leaver_end_date=None, leaver_participation_mode="CREATE_TASK",
        allow_delete_360=False, overdue_submission_enabled=True, overdue_submission_scope="EVALUATION", status="LOCKED",
    )
    class Db:
        async def execute(self, statement):
            return SimpleNamespace(scalar_one=lambda: cycle)
        async def commit(self): pass
        async def refresh(self, value): pass

    events = []
    monkeypatch.setattr(cycle_service.PerformanceAuditService, "append_event", lambda self, event: events.append(event))
    service = PerformanceCycleService(Db())
    await service.update_cycle(cycle, CyclePatch(allow_delete_360=True).model_dump(exclude_unset=True), actor_type="SYSTEM_ACCOUNT", actor_id=1)
    assert service.serialize(cycle)["allow_delete_360"] is True
    assert events[-1].before_state["allow_delete_360"] is False
    assert events[-1].after_state["allow_delete_360"] is True
    await service.update_cycle(cycle, {"name": "更新名称"}, actor_type="SYSTEM_ACCOUNT", actor_id=1)
    assert cycle.allow_delete_360 is True
    await service.update_cycle(cycle, {"allow_delete_360": False}, actor_type="SYSTEM_ACCOUNT", actor_id=1)
    assert service.serialize(cycle)["allow_delete_360"] is False


def test_cycle_360_configs_strict_validation_and_defaults():
    from app.performance.reviewer_360_policy_service import Anonymous360Config, InvitationOutOfRangeTipsConfig
    assert CyclePayload(**_payload()).anonymous_360_config.model_dump() == Anonymous360Config().model_dump()
    assert CyclePatch(name="新名称").model_dump(exclude_unset=True) == {"name": "新名称"}
    for config in ({"enable": "true"}, {"enable": 1}, {"enable": True}, {"anonymous_low_limit": True}, {"anonymous_low_limit": "3"}, {"anonymous_low_limit": -1}, {"anonymous_low_limit": 100}, {"anonymous_object": "admin"}, {"extra": 1}, {"reviewer_tag_visibility_mode": "visible"}):
        with pytest.raises(ValidationError):
            CyclePatch(anonymous_360_config=config)
    for config in ({"range_count": True}, {"range_count": "3"}, {"range_count": 100}, {"range_count": -1}, {"enable": 1}, {"tips": {"zh-CN": 1}}, {"tips": {"xx": "x"}}, {"unknown": 1}, {"enable": True, "tips": {"zh-CN": "  "}}, {"tips": {"zh-CN": "x" * 5001}}):
        with pytest.raises(ValidationError):
            CyclePatch(invitation_out_of_range_tips_config=config)
    for field in ("anonymous_360_config", "invitation_out_of_range_tips_config"):
        with pytest.raises(ValidationError):
            CyclePatch(**{field: None})
    config = InvitationOutOfRangeTipsConfig(tips={"zh-CN": " " + "字" * 5000 + " "})
    assert len(config.tips["zh-CN"]) == 5000
    assert CyclePatch(invitation_out_of_range_tips_config={"enable": True, "tips": {"zh-CN": " 提示 ", "en-US": " draft "}}).invitation_out_of_range_tips_config.tips == {"zh-CN": "提示", "en-US": "draft"}
    assert Anonymous360Config(enable=True, anonymous_object="all", anonymous_low_limit=0).enable


@pytest.mark.asyncio
async def test_cycle_360_config_roundtrip_omission_and_snapshot_freeze(monkeypatch):
    from app.performance import cycle_service
    from app.performance.reviewer_360_policy_service import Anonymous360Config, InvitationOutOfRangeTipsConfig, anonymous_360_snapshot
    cycle = SimpleNamespace(**PerformanceCycleService._normalize_payload(_payload()), id=1, cycle_ref="cycle:test", language="zh-CN", status="LOCKED", lock_at=None, leaver_start_date=None, leaver_end_date=None,
        anonymous_360_config=Anonymous360Config().model_dump(), invitation_out_of_range_tips_config=InvitationOutOfRangeTipsConfig().model_dump())
    class Db:
        async def execute(self, statement): return SimpleNamespace(scalar_one=lambda: cycle)
        async def commit(self): pass
        async def refresh(self, value): pass
    events = []
    monkeypatch.setattr(cycle_service.PerformanceAuditService, "append_event", lambda self, event: events.append(event))
    service = PerformanceCycleService(Db())
    config = {"enable": True, "anonymous_object": "all", "anonymous_low_limit": 3, "reviewer_tag_visibility_mode": "notVisible"}
    tips = {"enable": True, "range_count": 2, "tips": {"zh-CN": "  提示  "}}
    await service.update_cycle(cycle, {"anonymous_360_config": config, "invitation_out_of_range_tips_config": tips}, actor_type="PORTAL_USER", actor_id=1)
    assert service.serialize(cycle)["anonymous_360_config"] == config
    assert service.serialize(cycle)["invitation_out_of_range_tips_config"]["tips"]["zh-CN"] == "提示"
    assert events[-1].before_state["anonymous_360_config"]["enable"] is False
    frozen = anonymous_360_snapshot(cycle)
    await service.update_cycle(cycle, {"name": "重命名"}, actor_type="PORTAL_USER", actor_id=1)
    assert cycle.anonymous_360_config == config
    await service.update_cycle(cycle, {"anonymous_360_config": {"enable": False}}, actor_type="PORTAL_USER", actor_id=1)
    assert frozen == {"version": 1, "config": config}
    assert frozen["config"] is not cycle.anonymous_360_config


def _privacy_task(task_id, handler, source="SELF", **overrides):
    values = dict(id=task_id, handler_ref=handler, status="completed", submitted_at=datetime.now(timezone.utc), revoked_at=None, source_type=source)
    values.update(overrides)
    return SimpleNamespace(**values)


def test_360_anonymous_low_limit_voluntary_scope_and_description_groups():
    from app.performance.reviewer_360_policy_service import reviewer_360_visibility
    node = {"executor_role_code": "assessment.reviewer_360"}
    config = {"enable": True, "anonymous_object": "all", "anonymous_low_limit": 3, "reviewer_tag_visibility_mode": "visibleOverLowLimit"}
    project = SimpleNamespace(settings={"anonymous_360_snapshot": {"version": 1, "config": config}})
    people = {no: SimpleNamespace(employee_no=no, department=dept, direct_supervisor_employee_no="M1") for no, dept in (("E1", "A"), ("R1", "A"), ("R2", "A"), ("R3", "B"))}
    tasks = [_privacy_task(1, "R1"), _privacy_task(2, "R2", "VOLUNTARY")]
    result = reviewer_360_visibility(project, "E1", node, tasks, "admin", tasks, people)
    assert result["visibility"] == "anonymous"
    assert result["tasks"] == tasks[1:]
    assert result["description_allowed"][2] == {"relationship": False, "department": False, "source_label": False}
    tasks.append(_privacy_task(3, "R3"))
    result = reviewer_360_visibility(project, "E1", node, tasks, "R1", tasks, people)
    assert len(result["tasks"]) == 3
    assert result["description_allowed"][1] == {"relationship": True, "department": False, "source_label": False}
    config["reviewer_tag_visibility_mode"] = "notVisible"
    assert not any(reviewer_360_visibility(project, "E1", node, tasks, "admin", tasks, people)["description_allowed"][1].values())
    config["anonymous_object"] = "reviewee"
    assert reviewer_360_visibility(project, "E1", node, tasks, "manager", tasks, people)["visibility"] == "named"
    assert reviewer_360_visibility(project, "E1", node, tasks, "E1", tasks, people)["visibility"] == "anonymous"
    assert reviewer_360_visibility(SimpleNamespace(settings={}), "E1", node, tasks, "E1", tasks, people)["visibility"] == "named"


def test_360_anonymous_count_deduplicates_and_excludes_draft_revoked_and_converted_voluntary():
    from app.performance.reviewer_360_policy_service import reviewer_360_visibility
    config = {"enable": True, "anonymous_object": "all", "anonymous_low_limit": 3, "reviewer_tag_visibility_mode": "visibleOverLowLimit"}
    project = SimpleNamespace(settings={"anonymous_360_snapshot": {"version": 1, "config": config}})
    node = {"executor_role_code": "assessment.reviewer_360"}
    tasks = [_privacy_task(1, "R1"), _privacy_task(2, "R1"), _privacy_task(3, "R2", status="pending"), _privacy_task(4, "R3", revoked_at=datetime.now(timezone.utc)), _privacy_task(5, "R4", submitted_at=None)]
    assert reviewer_360_visibility(project, "E1", node, tasks, "admin", tasks, {})["visibility"] == "hidden"
    tasks[0].source_type = "VOLUNTARY"
    assert reviewer_360_visibility(project, "E1", node, tasks, "admin", tasks, {})["tasks"] == tasks[:1]
    tasks[0].source_type = "SELF"
    assert reviewer_360_visibility(project, "E1", node, tasks, "admin", tasks, {})["visibility"] == "hidden"
    config["anonymous_low_limit"] = 0
    assert reviewer_360_visibility(project, "E1", node, tasks, "admin", tasks, {})["tasks"] == tasks[:2]


@pytest.mark.asyncio
async def test_360_invitation_tip_real_sql_latest_snapshot_cycle_role_and_distinct_scope():
    from sqlalchemy import JSON, create_engine, text
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.orm import Session
    from sqlalchemy.schema import CreateTable
    from app.performance.models import PerformanceCycle, PerformanceProject, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceNodeTask
    from app.performance.reviewer_360_policy_service import reviewer_360_invitation_tip
    metadata = MetaData()
    for model in (PerformanceProject, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceNodeTask):
        table = model.__table__.to_metadata(metadata)
        table.constraints = {constraint for constraint in table.constraints if constraint.__class__.__name__ != "CheckConstraint"}
        for column in table.columns:
            if isinstance(column.type, JSONB): column.type = JSON()
            if not column.primary_key: column.nullable = True
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            for table in metadata.tables.values():
                connection.execute(CreateTable(table, include_foreign_key_constraints=[]))
            projects = metadata.tables["performance_projects"]
            connection.execute(projects.insert(), [{"id": pid, "cycle_ref": cycle} for pid, cycle in ((1, "C1"), (2, "C1"), (3, "C2"))])
            snapshots = metadata.tables["performance_project_member_snapshots"]
            connection.execute(snapshots.insert(), [{"id": sid, "project_id": pid, "snapshot_version": version} for sid, pid, version in ((10, 1, 1), (11, 1, 2), (20, 2, 1), (30, 3, 1))])
            nodes = metadata.tables["performance_project_node_snapshots"]
            connection.execute(nodes.insert(), [{"id": nid, "project_id": pid, "node_type": "evaluation", "config": {"template": {"executor_role_code": role}}} for nid, pid, role in ((100, 1, "assessment.reviewer_360"), (101, 1, "assessment.line_manager"), (200, 2, "assessment.reviewer_360"), (300, 3, "assessment.reviewer_360"))])
            tasks = metadata.tables["performance_node_tasks"]
            def task(key, project=1, snapshot=11, node=100, target="E1", source="SELF", revoked=False, handler="R1", kind="evaluation"):
                return dict(id=key, project_id=project, member_snapshot_id=snapshot, node_snapshot_id=node, target_employee_no=target, handler_ref=handler, task_kind=kind, source_type=source, status="completed", revoked_at=datetime.now(timezone.utc) if revoked else None)
            connection.execute(tasks.insert(), [task(1), task(2), task(3, target="E2", source="DEFAULT"), task(4, target="OLD", snapshot=10), task(5, source="VOLUNTARY", target="VOL"), task(6, revoked=True, target="REV"), task(7, node=101, target="LINE"), task(8, project=2, snapshot=20, node=200), task(9, project=3, snapshot=30, node=300), task(10, handler="R2", target="OTHER"), task(11, kind="work_summary", target="WORK")])
            cycle = SimpleNamespace(language="zh-CN", invitation_out_of_range_tips_config={"enable": True, "range_count": 3, "tips": {"zh-CN": "提示", "en-US": "tip"}})
            with Session(bind=connection) as session:
                class Db:
                    async def scalar(self, statement):
                        assert statement.column_descriptions[0]["entity"] is PerformanceCycle
                        assert statement.compile().params["cycle_ref_1"] == "C1"
                        return cycle
                    async def execute(self, statement): return session.execute(statement)
                project = SimpleNamespace(id=1, cycle_ref="C1")
                assert await reviewer_360_invitation_tip(Db(), project, "R1") is None
                cycle.invitation_out_of_range_tips_config["range_count"] = 2
                assert await reviewer_360_invitation_tip(Db(), project, "R1") == {"count": 3, "threshold": 2, "text": "提示"}
                connection.execute(text("UPDATE performance_node_tasks SET source_type='SELF' WHERE id=5"))
                assert (await reviewer_360_invitation_tip(Db(), project, "R1"))["count"] == 4
                connection.execute(text("UPDATE performance_node_tasks SET source_type='VOLUNTARY' WHERE id=5"))
                assert (await reviewer_360_invitation_tip(Db(), project, "R1"))["count"] == 3
                cycle.invitation_out_of_range_tips_config["enable"] = False
                assert await reviewer_360_invitation_tip(Db(), project, "R1") is None
    finally:
        engine.dispose()


def test_360_description_reuses_real_relationship_and_requires_source_audit():
    from app.performance.reviewer_360_policy_service import _descriptions
    people = {no: SimpleNamespace(employee_no=no, direct_supervisor_employee_no=manager, department="研发") for no, manager in (("E1", "M1"), ("M1", "M2"), ("M2", None), ("R1", "M1"), ("R2", "M3"))}
    task = _privacy_task(1, "M2")
    assert _descriptions(task, people, "E1")["relationship"] == "隔级上级"
    assert _descriptions(task, people, "E1")["source_label"] is None
    task.handler_ref = "R1"
    assert _descriptions(task, people, "E1")["relationship"] == "相同上级同事"
    task.handler_ref = "R2"
    assert _descriptions(task, people, "E1")["relationship"] == "不同上级同事"
    event = SimpleNamespace(event_type="REVIEWER_360_INVITED", after_state={"source_type": "SELF", "assigned_by_type": "EMPLOYEE", "assigned_by_ref": "M2"})
    assert _descriptions(task, people, "E1", event)["source_label"] == "上级邀请"
    task.source_type = "VOLUNTARY"
    assert _descriptions(task, people, "E1")["source_label"] == "自愿评估"


@pytest.mark.asyncio
async def test_360_policy_queries_scope_and_rejects_foreign_source_metadata():
    from app.performance.models import PerformanceNodeTask, PerformanceProjectNodeSnapshot
    from app.performance.reviewer_360_policy_service import project_reviewer_360_visibility
    project = SimpleNamespace(id=7, cycle_ref="C1", settings={"anonymous_360_snapshot": {"version": 1, "config": {"enable": True, "anonymous_object": "all", "anonymous_low_limit": 0}}})
    node = PerformanceProjectNodeSnapshot(id=11, project_id=7, node_id="360", node_type="evaluation", config={"template": {"executor_role_code": "assessment.reviewer_360"}})
    task = _privacy_task(8, "R1")
    people = [SimpleNamespace(employee_no=no, direct_supervisor_employee_no="M1", department="研发") for no in ("E1", "R1")]
    def event(**overrides):
        after = {"project_id": 7, "node_id": "360", "task_id": 8, "member_snapshot_id": 5, "assigned_by_type": "EMPLOYEE", "assigned_by_ref": "E1"}
        after.update(overrides)
        return SimpleNamespace(subject_ref="R1", event_type="REVIEWER_360_INVITED", after_state=after)
    statements = []
    class Db:
        async def execute(self, statement):
            statements.append(statement)
            values = [task] if len(statements) == 1 else people if len(statements) == 2 else [event(project_id=99), event(task_id=99), event(member_snapshot_id=99)]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))
    result = await project_reviewer_360_visibility(project, 5, "E1", node, [task], "admin", Db())
    assert result["visibility"] == "anonymous"
    assert result["description_values"][8]["source_label"] is None
    assert result["description_allowed"][8]["source_label"] is False
    params = statements[0].compile().params
    assert {"project_id_1": 7, "cycle_ref_1": "C1", "member_snapshot_id_1": 5, "node_snapshot_id_1": 11, "target_employee_no_1": "E1"}.items() <= params.items()
    sql = str(statements[0])
    assert "submitted_at IS NOT NULL" in sql and "revoked_at IS NULL" in sql
    source_sql = str(statements[1])
    assert "performance_project_member_snapshots.project_id" in source_sql and "performance_project_member_snapshots.cycle_ref" in source_sql
    project.settings = {}
    assert (await project_reviewer_360_visibility(project, 5, "E1", node, [task], "admin", object()))["visibility"] == "named"


@pytest.mark.asyncio
async def test_360_giveup_locks_cycle_project_task_and_rechecks_submitted(monkeypatch):
    from unittest.mock import AsyncMock
    from app.performance import review_360_feedback_router as feedback
    from app.performance.models import PerformanceCycle, PerformanceNodeTask, PerformanceProject
    project = PerformanceProject(id=7, cycle_ref="C1", settings={})
    node = SimpleNamespace(id=11)
    task = PerformanceNodeTask(id=8, project_id=7, node_snapshot_id=11, task_kind="evaluation", handler_ref="R1", status="completed", submitted_at=datetime.now(timezone.utc), source_type="VOLUNTARY")
    monkeypatch.setattr(feedback, "_get_project", AsyncMock(return_value=project))
    monkeypatch.setattr(feedback, "_locked_snapshot", AsyncMock())
    monkeypatch.setattr(feedback, "_resolve_cycle_member_employee", AsyncMock(return_value="R1"))
    monkeypatch.setattr(feedback, "_project_nodes", AsyncMock(return_value=[node]))
    monkeypatch.setattr(feedback, "_evaluation_node", AsyncMock(return_value=node))
    calls = []
    class Db:
        async def scalar(self, statement):
            calls.append(statement)
            return SimpleNamespace() if statement.column_descriptions[0]["entity"] is PerformanceCycle else task
        async def refresh(self, record, **kwargs):
            calls.append((record, kwargs))
    with pytest.raises(HTTPException) as error:
        await feedback.giveup_voluntary_evaluation(7, feedback.GiveUpPayload(task_id=8), context=object(), db=Db())
    assert error.value.status_code == 409 and error.value.detail == "TASK_ALREADY_SUBMITTED"
    assert calls[0].column_descriptions[0]["entity"] is PerformanceCycle
    assert calls[0]._for_update_arg is not None
    assert calls[1] == (project, {"with_for_update": True})
    assert calls[2]._for_update_arg is not None
    assert calls[2].get_execution_options()["populate_existing"] is True


def test_cycle_payload_rejects_end_before_start():
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


@pytest.mark.parametrize("minutes, allowed", [(359, False), (360, True), (361, True)])
def test_scheduled_lock_creation_six_hour_boundary(minutes, allowed, monkeypatch):
    from app.performance import cycle_service

    now = datetime(2026, 11, 3, 3, 0, tzinfo=timezone.utc)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz)

    monkeypatch.setattr(cycle_service, "datetime", Clock)
    payload = _payload(lock_rule="SCHEDULED", lock_at=now + timedelta(minutes=minutes))
    if allowed:
        PerformanceCycleService._validate_payload(payload)
    else:
        with pytest.raises(CycleValidationError, match="至少 6 小时"):
            PerformanceCycleService._validate_payload(payload)


def test_cycle_service_does_not_revalidate_historical_scheduled_lock_on_edit():
    now = datetime.now(timezone.utc)
    cycle = SimpleNamespace(
        name="历史定时周期",
        start_at=now - timedelta(days=1),
        end_at=now + timedelta(days=30),
        lock_rule="SCHEDULED",
        lock_at=now - timedelta(hours=12),
        leaver_enabled=False,
        leaver_start_date=None,
        leaver_end_date=None,
    )

    PerformanceCycleService._validate_cycle(cycle)


@pytest.mark.asyncio
@pytest.mark.parametrize("cycle_status", ["DRAFT", "LOCKED"])
async def test_update_historical_scheduled_cycle_preserves_lock_and_audits(cycle_status, monkeypatch):
    from unittest.mock import AsyncMock, Mock

    now = datetime.now(timezone.utc)
    cycle = SimpleNamespace(
        **PerformanceCycleService._normalize_payload(_payload(
            start_at=now - timedelta(days=1), end_at=now + timedelta(days=30),
            lock_rule="SCHEDULED", lock_at=now - timedelta(hours=12),
        )),
        id=1, cycle_ref="cycle:historical", language="zh-CN", status=cycle_status,
        leaver_start_date=None, leaver_end_date=None,
    )
    original_lock_at = cycle.lock_at
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one=lambda: cycle)), commit=AsyncMock(), refresh=AsyncMock())
    service = PerformanceCycleService(db)
    audit = Mock()
    monkeypatch.setattr(service.audit, "append_event", audit)
    monkeypatch.setattr(service, "_sync_snapshot", AsyncMock())

    await service.update_cycle(cycle, {"name": "修订历史周期", "leaver_enabled": False, "leaver_start_date": None, "leaver_end_date": None}, actor_type="PORTAL_USER", actor_id=1)

    assert cycle.name == "修订历史周期"
    assert cycle.lock_rule == "SCHEDULED"
    assert cycle.lock_at == original_lock_at
    assert cycle.status == cycle_status
    db.commit.assert_awaited_once()
    service._sync_snapshot.assert_not_awaited()
    assert audit.call_args.args[0].after_state["name"] == "修订历史周期"
    with pytest.raises(CycleValidationError, match="不支持修改锁定规则"):
        await service.update_cycle(cycle, {"lock_at": now}, actor_type="PORTAL_USER", actor_id=1)
    with pytest.raises(CycleValidationError, match="需晚于开始时间"):
        await service.update_cycle(cycle, {"end_at": cycle.start_at}, actor_type="PORTAL_USER", actor_id=1)
    assert db.commit.await_count == 1
    cycle.end_at = now + timedelta(days=30)
    with pytest.raises(CycleValidationError, match="不能修改离职人员参评范围"):
        await service.update_cycle(cycle, {"leaver_enabled": True, "leaver_start_date": now.date(), "leaver_end_date": now.date()}, actor_type="PORTAL_USER", actor_id=1)
    assert db.commit.await_count == 1


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


def _summary_project(project_id=1, cycle_ref="cycle:1", settings=None, status="DRAFT"):
    return SimpleNamespace(
        id=project_id, project_ref=f"project:{project_id}", cycle_ref=cycle_ref,
        name=f"项目{project_id}", description="项目描述", administrators=None,
        status=status, evaluated_count=3, settings=settings,
    )


class _CycleSummaryDb:
    def __init__(self, projects, workflows=()):
        self.projects = projects
        self.workflows = workflows
        self.statements = []

    async def execute(self, statement):
        from app.performance.models import PerformanceProject, PerformanceTemplateWorkflow

        self.statements.append(statement)
        params = statement.compile().params
        query = statement.selects[0] if hasattr(statement, "selects") else statement
        entity = query.column_descriptions[0]["entity"]
        if entity is PerformanceProject:
            if query.column_descriptions[0]["name"] == "cycle_ref":
                refs = {project.cycle_ref for project in self.projects if project.cycle_ref in params["cycle_ref_1"] and (project.status in {"STARTED", "ARCHIVED"} or "comparison_rules_snapshot" in (project.settings or {}))}
                return _PeopleResult(list(refs))
            cycle_refs = params["cycle_ref_1"]
            if isinstance(cycle_refs, str):
                cycle_refs = [cycle_refs]
            projects = [project for project in self.projects if project.cycle_ref in cycle_refs]
            if "project_ref_1" in params:
                projects = [project for project in projects if project.project_ref in params["project_ref_1"]]
            return _PeopleResult(projects)
        if entity is PerformanceTemplateWorkflow:
            return _PeopleResult([workflow for workflow in self.workflows if workflow.template_id in params["template_id_1"]])
        return SimpleNamespace(all=lambda: [(ref, 5, 2) for ref in params["cycle_ref_1"]])


@pytest.mark.asyncio
@pytest.mark.parametrize("completed", [True, False, "missing", "no-settings"])
async def test_cycle_list_and_detail_share_configuration_completed_and_project_fields(completed):
    settings = {"configuration_completed": completed} if isinstance(completed, bool) else {}
    if completed == "no-settings":
        settings = None
    project = _summary_project(settings=settings)
    db = _CycleSummaryDb([project])
    service = PerformanceCycleService(db)
    cycle = SimpleNamespace(cycle_ref="cycle:1")

    summaries = await service.list_summaries([cycle])
    detail = await service.projects_for_cycle(cycle)

    assert summaries[cycle.cycle_ref] == (5, 2, detail)
    assert detail[0] == {
        "id": 1, "project_ref": "project:1", "name": "项目1", "description": "项目描述",
        "administrators": [], "status": "DRAFT", "evaluated_count": 3,
        "configuration_completed": completed is True, "template_id": None,
        "start_at": None, "end_at": None, "evaluator_rules": {"groups": []},
        "flow_settings": {}, "node_meta": {},
        **({} if completed is True else {"start_blocked_reason": "项目未配置完成，无法启动"}),
    }
    assert len(db.statements) == 4


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node_type, node_time, blocked",
    [
        ("evaluation", {"end_at": "2026-11-08T00:00:00+00:00"}, True),
        ("evaluation", {"end_at": "2026-11-10T00:00:00+00:00"}, False),
        ("result_view", {"end_at": "2026-11-10T00:00:00+00:00", "appeal_deadline": "2026-11-08T00:00:00+00:00"}, True),
        ("result_view", {"end_at": "2026-11-08T00:00:00+00:00", "appeal_deadline": "2026-11-10T00:00:00+00:00"}, False),
        ("calibration", {"end_at": "2026-11-10T00:00:00+00:00", "phase_times": {"1": {"end_at": "2026-11-07T00:00:00+00:00"}, "2": {"end_at": "2026-11-08T00:00:00+00:00"}}}, True),
        ("calibration", {"end_at": "2026-11-08T00:00:00+00:00", "phase_times": {"1": {"end_at": "2026-11-07T00:00:00+00:00"}, "2": {"end_at": "2026-11-10T00:00:00+00:00"}}}, False),
    ],
)
async def test_cycle_list_and_detail_share_node_deadline_blocking(monkeypatch, node_type, node_time, blocked):
    from app.performance import cycle_service

    now = datetime(2026, 11, 9, tzinfo=timezone.utc)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz)

    monkeypatch.setattr(cycle_service, "datetime", Clock)
    settings = {
        "configuration_completed": True, "template_id": 7,
        "start_at": "2026-11-01", "end_at": "2026-12-31",
        "evaluator_rules": {"groups": [{"id": "group:1"}]},
        "flow_settings": {"node_times": {"node:1": node_time}},
    }
    workflows = [SimpleNamespace(template_id=7, nodes=[{"node_id": "node:1", "name": "测试环节", "node_type": node_type}])]
    projects = [_summary_project(settings=settings), _summary_project(2, settings=settings, status="STARTED")]
    service = PerformanceCycleService(_CycleSummaryDb(projects, workflows))
    cycle = SimpleNamespace(cycle_ref="cycle:1")

    summaries = await service.list_summaries([cycle])
    detail = await service.projects_for_cycle(cycle)

    assert summaries[cycle.cycle_ref][2] == detail
    assert detail[0].get("start_blocked_reason") == ("测试环节环节截止时间早于当前时间，无法启动" if blocked else None)
    assert "start_blocked_reason" not in detail[1]
    for key in ("start_at", "end_at", "evaluator_rules", "flow_settings"):
        assert detail[0][key] == settings[key]
    assert detail[0]["node_meta"] == {"node:1": {"name": "测试环节", "node_type": node_type}}


@pytest.mark.asyncio
@pytest.mark.parametrize("project_refs", [None, {"project:1", "project:3"}, set()])
async def test_cycle_summaries_batch_queries_and_project_permissions(project_refs):
    projects = [_summary_project(i, f"cycle:{(i + 1) // 2}", {"template_id": i, "configuration_completed": True}) for i in range(1, 7)]
    workflows = [SimpleNamespace(template_id=i, nodes=[]) for i in range(1, 7)]
    cycles = [SimpleNamespace(cycle_ref=f"cycle:{i}") for i in range(1, 4)]
    db = _CycleSummaryDb(projects, workflows)
    service = PerformanceCycleService(db)

    summaries = await service.list_summaries(cycles, project_refs=project_refs)

    assert len(db.statements) == (2 if project_refs == set() else 4)
    if project_refs != set():
        assert db.statements[2].compile().params["cycle_ref_1"] == [cycle.cycle_ref for cycle in cycles]
        if project_refs is not None:
            assert set(db.statements[2].compile().params["project_ref_1"]) == project_refs
        visible_template_ids = {project.id for project in projects if project_refs is None or project.project_ref in project_refs}
        assert set(db.statements[3].compile().params["template_id_1"]) == visible_template_ids
    for cycle in cycles:
        visible = [project.project_ref for project in projects if project.cycle_ref == cycle.cycle_ref and (project_refs is None or project.project_ref in project_refs)]
        assert [project["project_ref"] for project in summaries[cycle.cycle_ref][2]] == visible
        assert summaries[cycle.cycle_ref][:2] == (5, 2)
        before = len(db.statements)
        assert await service.projects_for_cycle(cycle, project_refs=project_refs) == summaries[cycle.cycle_ref][2]
        assert len(db.statements) - before == (0 if project_refs == set() else 2 if visible else 1)
        if project_refs:
            assert set(db.statements[before].compile().params["project_ref_1"]) == project_refs
    before = len(db.statements)
    assert await service.list_summaries([], project_refs=project_refs) == {}
    assert len(db.statements) == before


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

    async def rollback(self):
        pass

    def begin_nested(self):
        from contextlib import asynccontextmanager
        @asynccontextmanager
        async def transaction():
            yield
        return transaction()

    async def flush(self):
        pass

    async def execute(self, _statement):
        self.calls.append(_statement)
        if len(self.calls) == 1:
            return _RefsResult([self.cycle.cycle_ref])
        if "performance_authorization_snapshots" in str(_statement):
            return _SnapshotResult(None)
        return _SnapshotResult(self.cycle)

    async def commit(self):
        self.committed = True


@pytest.mark.asyncio
@pytest.mark.parametrize("failure_stage", ["sync", "adjust", "flush", "commit"])
async def test_lifecycle_failure_rolls_back_and_continues_next_cycle(monkeypatch, caplog, failure_stage):
    from contextlib import asynccontextmanager
    from copy import deepcopy
    from unittest.mock import AsyncMock
    from app.performance import member_service
    from app.scheduler.handlers import _handler_performance_cycle_lifecycle
    from zoneinfo import ZoneInfo

    now = datetime.now(timezone.utc)
    cycles = {ref: SimpleNamespace(cycle_ref=ref, status="DRAFT", lock_rule="SCHEDULED",
              lock_at=now + timedelta(days=3), lock_policy_version=2, pre_lock_sync_mode="AUTO_DAILY",
              pre_lock_adjust_until=now + timedelta(days=2), pre_lock_adjusted_on=None,
              member_info_frozen_at=None) for ref in ("failed-cycle", "next-cycle")}
    class Db:
        def __init__(self):
            self.pending = []
            self.saved = []
            self.rollbacks = 0
            self.current = None
        @asynccontextmanager
        async def begin_nested(self):
            self.previous = {ref: deepcopy(vars(cycle)) for ref, cycle in cycles.items()}
            try:
                yield
            except Exception:
                self.restore()
                raise
        def restore(self):
            self.pending.clear()
            for ref, values in self.previous.items():
                vars(cycles[ref]).clear()
                vars(cycles[ref]).update(deepcopy(values))
        async def execute(self, statement):
            if statement.column_descriptions[0]["name"] == "cycle_ref":
                return _RefsResult(list(cycles))
            if "performance_authorization_snapshots" in str(statement):
                return _SnapshotResult(None)
            self.current = statement.compile().params["cycle_ref_1"]
            return _SnapshotResult(cycles[self.current])
        async def flush(self):
            if failure_stage == "flush" and self.current == "failed-cycle":
                raise RuntimeError("injected flush failure")
        async def commit(self):
            if failure_stage == "commit" and self.current == "failed-cycle":
                raise RuntimeError("injected commit failure")
            self.saved.extend(self.pending)
            self.pending.clear()
        async def rollback(self):
            self.rollbacks += 1
            self.restore()
    db = Db()
    calls = []
    async def sync(_self, cycle, **_kwargs):
        calls.append(("sync", cycle.cycle_ref))
        db.pending.append(("snapshot", cycle.cycle_ref))
        if failure_stage == "sync" and cycle.cycle_ref == "failed-cycle":
            raise RuntimeError("injected sync failure")
    async def adjust(_db, cycle):
        calls.append(("adjust", cycle.cycle_ref))
        db.pending.extend([("member", cycle.cycle_ref), ("audit", cycle.cycle_ref)])
        if failure_stage == "adjust" and cycle.cycle_ref == "failed-cycle":
            raise RuntimeError("injected adjustment failure")
    monkeypatch.setattr(PerformanceCycleService, "_sync_snapshot", sync)
    monkeypatch.setattr(PerformanceCycleService, "_prune_excluded_leavers", AsyncMock())
    monkeypatch.setattr(member_service, "adjust_cycle_members", adjust)
    with pytest.raises(RuntimeError, match="failed-cycle"):
        await _handler_performance_cycle_lifecycle(None, db, "scheduler")
    assert ("sync", "next-cycle") in calls and ("adjust", "next-cycle") in calls
    assert db.rollbacks == 1
    assert db.saved == [("snapshot", "next-cycle"), ("member", "next-cycle"), ("audit", "next-cycle")]
    assert db.pending == []
    assert cycles["failed-cycle"].pre_lock_adjusted_on is None
    assert cycles["next-cycle"].pre_lock_adjusted_on == now.astimezone(ZoneInfo("Asia/Shanghai")).date()
    assert "Performance cycle lifecycle failed: failed-cycle" in caplog.text


@pytest.mark.asyncio
async def test_overdue_scheduled_cycle_locks_snapshot_and_audits_once(monkeypatch):
    from unittest.mock import AsyncMock, Mock
    from app.performance import cycle_service, snapshot_service

    now = datetime(2026, 11, 4, 7, 44, tzinfo=timezone.utc)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz)

    monkeypatch.setattr(cycle_service, "datetime", Clock)
    monkeypatch.setattr(snapshot_service, "datetime", Clock)
    cycle = SimpleNamespace(
        cycle_ref="cycle:overdue", status="DRAFT", lock_rule="SCHEDULED",
        lock_at=datetime(2026, 11, 3, 10, 0, tzinfo=timezone.utc), pre_lock_sync_mode="MANUAL",
    )
    snapshot = SimpleNamespace(status="DRAFT", locked_at=None)
    db = _DueLockDb(cycle)
    db.commit = AsyncMock()
    db.execute = AsyncMock(side_effect=[_RefsResult([cycle.cycle_ref]), _SnapshotResult(cycle), _SnapshotResult(None), _RefsResult([])])
    service = PerformanceCycleService(db)
    monkeypatch.setattr(service, "_sync_snapshot", AsyncMock())
    monkeypatch.setattr(service, "_prune_excluded_leavers", AsyncMock())
    monkeypatch.setattr(service.snapshots, "_get_snapshot", AsyncMock(return_value=snapshot))
    audit = Mock()
    monkeypatch.setattr(service.snapshots, "_append_audit_event", audit)

    assert await service.process_due_locks() == 1
    assert cycle.status == "LOCKED"
    assert snapshot.status == "LOCKED"
    assert snapshot.locked_at == now
    assert audit.call_args.kwargs["event_type"] == "AUTHORIZATION_SNAPSHOT_LOCKED"
    assert await service.process_due_locks() == 0
    assert db.commit.await_count == 1
    audit.assert_called_once()


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
async def test_due_scheduled_manual_lock_finally_syncs_people(monkeypatch):
    cycle = SimpleNamespace(
        cycle_ref="cycle:scheduled",
        status="DRAFT",
        lock_rule="SCHEDULED",
        lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        pre_lock_sync_mode="MANUAL",
        lock_policy_version=2,
    )
    db = _DueLockDb(cycle)
    service = PerformanceCycleService(db)
    calls = []

    async def sync_snapshot(*args, **kwargs):
        calls.append("sync")

    async def lock_snapshot(*args, **kwargs):
        calls.append("lock")

    monkeypatch.setattr(service, "_sync_snapshot", sync_snapshot)
    from unittest.mock import AsyncMock
    monkeypatch.setattr(service, "_prune_excluded_leavers", AsyncMock())
    monkeypatch.setattr(service.snapshots, "lock_snapshot", lock_snapshot)
    import app.performance.member_service as member_service
    monkeypatch.setattr(member_service, "freeze_cycle_members", AsyncMock())
    assert await service.process_due_locks() == 1
    assert calls == ["sync", "lock"]
    member_service.freeze_cycle_members.assert_awaited_once_with(db, cycle)

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

        async def changed_employee_nos(self, _cycle):
            return set()

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
        overdue_submission_enabled=True, overdue_submission_scope="EVALUATION",
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

    assert result.people[0].model_dump() == {"value": "E001", "label": "张三", "department": "研发中心"}
    assert result.organization_tree[0].children[0].children[0].label == "平台部"
    assert "在职" in db.statement.compile().params.values()
    assert result.snapshot_lock_at is None
    assert result.invisible_people == []


@pytest.mark.asyncio
async def test_load_hrbp_options_exposes_cycle_snapshot_people_for_invisible_selector(monkeypatch):
    from app.performance import cycles_router

    def reject_live_roster():
        raise AssertionError("周期 HRBP 选项不得读取实时花名册")

    monkeypatch.setattr(cycles_router, "employee_roster_table", reject_live_roster)
    lock_at = datetime(2026, 11, 5, 16, 30, tzinfo=timezone.utc)

    class SnapshotResult:
        def scalars(self):
            return self

        def all(self):
            return [SimpleNamespace(employee_no="E002", display_name="李四", employment_status="在职", company_org="集团", department="研发中心", department_2=None, department_3=None, department_4=None, department_5=None)]

    class Db:
        async def scalar(self, _statement):
            return SimpleNamespace(id=3, status="LOCKED", locked_at=lock_at)

        async def execute(self, statement):
            assert statement.column_descriptions[0]["entity"] is cycles_router.PerformanceAuthorizationSnapshotPerson
            return SnapshotResult()

    result = await _load_hrbp_options(Db(), SimpleNamespace(cycle_ref="cycle:1", lock_at=None))

    assert [item.value for item in result.invisible_people] == ["E002"]
    assert result.invisible_people[0].label == "李四（E002）"
    assert result.people[0].model_dump() == {"value": "E002", "label": "李四", "department": "研发中心"}
    assert result.organization_tree[0].value == "集团"
    assert result.organization_tree[0].children[0].value == "集团/研发中心"
    assert result.snapshot_lock_at == lock_at


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "lock_rule, configured_at, snapshot_status, locked_at, expected_at",
    [
        ("SCHEDULED", "2026-11-05T16:30:00+00:00", "LOCKED", "2026-11-06T01:00:00+00:00", "2026-11-05T16:30:00+00:00"),
        ("SCHEDULED", "2027-01-01T16:30:00+00:00", "DRAFT", None, "2027-01-01T16:30:00+00:00"),
        ("IMMEDIATE", None, "LOCKED", "2026-11-06T01:00:00+00:00", "2026-11-06T01:00:00+00:00"),
        ("SCHEDULED", "2027-01-01T16:30:00+00:00", None, None, "2027-01-01T16:30:00+00:00"),
        ("IMMEDIATE", None, None, None, None),
        ("SCHEDULED", None, "DRAFT", None, None),
    ],
    ids=["scheduled-config-first", "draft-future-config", "immediate-fallback", "missing-snapshot-config", "missing-snapshot-no-date", "draft-no-date"],
)
async def test_load_hrbp_options_returns_lock_date_even_without_people(
    monkeypatch, lock_rule, configured_at, snapshot_status, locked_at, expected_at
):
    from app.performance import cycles_router

    def reject_live_roster():
        raise AssertionError("周期 HRBP 选项不得读取实时花名册")

    monkeypatch.setattr(cycles_router, "employee_roster_table", reject_live_roster)
    snapshot = SimpleNamespace(
        id=3, status=snapshot_status,
        locked_at=datetime.fromisoformat(locked_at) if locked_at else None,
    ) if snapshot_status else None

    class Db:
        async def scalar(self, _statement):
            return snapshot

        async def execute(self, statement):
            assert snapshot is not None
            assert statement.column_descriptions[0]["entity"] is cycles_router.PerformanceAuthorizationSnapshotPerson
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

    cycle = SimpleNamespace(
        cycle_ref="cycle:1", lock_rule=lock_rule,
        lock_at=datetime.fromisoformat(configured_at) if configured_at else None,
    )
    result = await _load_hrbp_options(Db(), cycle)

    assert result.snapshot_lock_at == (datetime.fromisoformat(expected_at) if expected_at else None)
    assert result.people == result.invisible_people == result.organization_tree == []
    assert "snapshot_status" not in result.model_dump()


@pytest.mark.asyncio
async def test_cycle_snapshot_reads_canonical_employee_roster_fields():
    from datetime import date

    columns = [
        Column("id", String),
        Column("bu", String),
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
        Column("standard_position", String),
        Column("position_level", String),
        Column("hire_date", Date),
        Column("expected_departure_date", Date),
    ]
    model = SimpleNamespace(__table__=Table("emp_realtime_roster", MetaData(), *columns))
    previous = DATA_TABLES.get("emp_realtime_roster")
    DATA_TABLES["emp_realtime_roster"] = model
    row = {
        "source_roster_id": "7",
        "bu": " 事业BU ",
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
    assert person.bu == "事业BU"
    assert (person.company_org, person.department, person.department_2) == ("集团", "研发中心", "平台部")
    assert person.direct_supervisor_source_value == "M001"
    assert person.employee_type == "正式员工"
    assert (person.job_family, person.job_category) == ("技术", "研发")
    assert (person.position_level, person.hire_date) == ("P6", date(2020, 1, 2))


@pytest.mark.parametrize(
    ("status_column", "departure_column"),
    (("employment_status", "expected_departure_date"), ("active_status", "terminated_date")),
)
def test_employee_roster_contract_resolves_development_and_production_columns(status_column, departure_column):
    from app.data.employee_roster_contract import require_employee_roster_columns

    table = Table(
        "emp_realtime_roster",
        MetaData(),
        Column("employee_no", String),
        Column(status_column, String),
        Column(departure_column, Date),
    )

    columns = require_employee_roster_columns(table, ("employee_no", "employment_status", "departure_date"))

    assert columns["employment_status"].name == status_column
    assert columns["departure_date"].name == departure_column


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
        organization_ref="集团/研发/平台", bu="旧BU", direct_supervisor_employee_no=None,
        hrbp_employee_no=None, employee_type="正式", job_family=None, job_category=None,
        standard_position=None, position_level=None, hire_date=None, is_manually_maintained=False,
    )

    class Db:
        async def flush(self): pass
        async def execute(self, stmt, params=None):
            if params is not None:
                return None
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
        cycle, [{"employee_no": "E001", "bu": "新BU", "department_2": "新平台", "department_3": "小组"}],
        actor_type="PORTAL_USER", actor_id=1, reason="调整组织",
    )
    assert person.organization_ref == "集团/研发/新平台/小组"
    assert person.bu == "新BU"
    assert person.company_org == "集团"
    assert person.is_manually_maintained is True


def test_cycle_template_array_normalizes_legacy_deduplicates_and_rejects_conflicts():
    normalize = PerformanceCycleService._normalize_payload
    assert normalize({"template_ids": [2, 1, 2]}) == {"template_ids": [2, 1], "template_id": 2}
    assert normalize({"template_id": 3})["template_ids"] == [3]
    assert normalize({"name": "unchanged"}) == {"name": "unchanged"}
    assert normalize({"template_ids": []})["template_id"] is None
    with pytest.raises(CycleValidationError):
        normalize({"template_id": 1, "template_ids": [2]})
    with pytest.raises(ValidationError):
        CyclePatch(template_ids=[0])
    with pytest.raises(ValidationError):
        CyclePatch(template_ids=[-1])


@pytest.mark.asyncio
async def test_cycle_template_validation_preserves_inactive_existing_but_rejects_new_or_used_removal():
    class Db:
        async def execute(self, statement):
            from app.performance.models import PerformanceCycle, PerformanceTemplate
            entity = statement.column_descriptions[0]["entity"]
            if entity is PerformanceCycle:
                return SimpleNamespace(scalar_one=lambda: cycle)
            if entity is PerformanceTemplate:
                key = statement.compile().params["id_1"]
                return SimpleNamespace(scalar_one_or_none=lambda: SimpleNamespace(id=key, template_kind="performance", status="active" if key == 2 else "inactive"))
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [SimpleNamespace(settings={"template_id": 1})]))

    service = PerformanceCycleService(Db())
    cycle = SimpleNamespace(id=1, cycle_ref="cycle:test", template_ids=[1], template_id=1)
    await service.validate_templates({"template_ids": [1, 2]}, cycle)
    with pytest.raises(CycleValidationError, match="已启用"):
        await service.validate_templates({"template_ids": [3]}, cycle)
    with pytest.raises(CycleValidationError, match="已被项目使用"):
        await service.validate_templates({"template_ids": [2]}, cycle)


# ---------- 人员信息更新 / 变更记录 ----------


class _ScalarsResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._items))


class _SeqDb:
    """按顺序返回 execute 结果的假异步会话。"""

    def __init__(self, results):
        self.results = list(results)
        self.committed = False

    async def execute(self, _statement, params=None):
        return self.results.pop(0)

    async def commit(self):
        self.committed = True


def _audit_event(event_id, event_at, event_type, after_state):
    return SimpleNamespace(id=event_id, event_at=event_at, event_type=event_type, actor_type="PORTAL_USER", actor_ref="7", after_state=after_state)


def _change_service(events):
    service = PerformanceCycleService.__new__(PerformanceCycleService)
    service.db = _SeqDb([_ScalarsResult(events)])
    service.audit = SimpleNamespace(append_event=lambda event: None)
    return service


def test_person_info_update_payload_rejects_unknown_and_empty_fields():
    from app.performance.cycles_router import PersonInfoUpdateIn

    payload = PersonInfoUpdateIn(update_fields=["job_family", "position_level", "direct_supervisor", "department"])
    assert payload.update_fields == ["job_family", "position_level", "direct_supervisor", "department"]
    with pytest.raises(ValidationError):
        PersonInfoUpdateIn(update_fields=[])
    with pytest.raises(ValidationError):
        PersonInfoUpdateIn(update_fields=["salary"])
    with pytest.raises(ValidationError):
        PersonInfoUpdateIn(update_fields=["job_family"], extra="x")


async def test_changed_employee_nos_and_change_records_flatten_both_audit_shapes():
    events = [
        _audit_event(1, datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc), "PERFORMANCE_CYCLE_PEOPLE_INFO_UPDATED", {
            "changes": [{"employee_no": "E001", "field": "job_family", "label": "职类（序列）", "before": "技术", "after": "产品"}],
        }),
        _audit_event(2, datetime(2026, 2, 2, 10, 0, tzinfo=timezone.utc), "PERFORMANCE_CYCLE_PEOPLE_MANUALLY_UPDATED", {
            "changes": [
                {"employee_no": "E001", "before": {"job_family": "产品", "position_level": None, "is_manually_maintained": False}, "after": {"job_family": "产品", "position_level": "P6", "is_manually_maintained": True}},
                {"employee_no": "E002", "field": "job_family", "before": "A", "after": "B"},
            ],
        }),
    ]
    cycle = SimpleNamespace(cycle_ref="cycle:test")
    service = _change_service(events)
    assert await service.changed_employee_nos(cycle) == {"E001", "E002"}

    service = _change_service(events)
    records = await service.person_change_records(cycle, "E001")
    assert [record["event_id"] for record in records] == [1, 2]
    assert records[0]["changes"] == [
        {"employee_no": "E001", "field": "job_family", "label": "职类（序列）", "before": "技术", "after": "产品"},
    ]
    # 手工维护形态：全量快照差分出变更字段，跳过未变化与无标签字段
    assert [entry["field"] for entry in records[1]["changes"]] == ["position_level"]
    assert records[1]["changes"][0]["after"] == "P6"


@pytest.mark.parametrize("started", [False, True])
async def test_update_person_info_from_roster_applies_selected_dimensions_and_audits(monkeypatch, started):
    from app.performance.cycle_service import organization_path  # noqa: F401  确认可导入

    person = SimpleNamespace(
        id=21, employee_no="E001", display_name="张三", company_org=None, department="旧一级部门", department_2=None,
        department_3=None, department_4=None, department_5=None, organization_ref="旧一级部门",
        direct_supervisor_employee_no="E009", direct_supervisor_source_value=None, hrbp_employee_no=None,
        employee_type=None, employment_status=None, job_family="技术", job_category=None,
        standard_position=None, position_level="P5", hire_date=None, departure_date=None,
        is_manually_maintained=False,
    )
    snapshot = SimpleNamespace(id=11, cycle_ref="cycle:test")
    others = [
        person,
        SimpleNamespace(employee_no="E002", display_name="李四"),
        SimpleNamespace(employee_no="E009", display_name="王九"),
    ]

    class RosterRow:
        employee_no = "E001"
        display_name = "张三"
        job_family = "产品"
        job_category = None
        standard_position = None
        position_level = "P6"
        company_org = None
        department = "新一级部门"
        department_2 = None
        department_3 = None
        department_4 = None
        department_5 = None
        direct_supervisor_source_value = "李四"
        hrbp_source_value = None
        employee_type = None
        employment_status = None
        hire_date = None
        departure_date = None

    cycle = SimpleNamespace(cycle_ref="cycle:test", start_at=datetime.now(timezone.utc) + timedelta(days=-1 if started else 1))

    class _SnapshotResult:
        def scalar_one_or_none(self):
            return snapshot

    class _PeopleResult:
        def scalars(self):
            return others

    from unittest.mock import AsyncMock
    db = _SeqDb([_SnapshotResult(), _PeopleResult(), None, None])
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()
    service = PerformanceCycleService.__new__(PerformanceCycleService)
    service.db = db
    recorded: list = []
    service.audit = SimpleNamespace(append_event=lambda event: recorded.append(event))

    async def _fake_roster_inputs(_cycle, **_kwargs):
        return [RosterRow(), SimpleNamespace(employee_no="E002"), SimpleNamespace(employee_no="E009")]

    monkeypatch.setattr(service, "_load_roster_inputs", _fake_roster_inputs)

    changed = await service.update_person_info_from_roster(
        cycle, "E001", ["job_family", "position_level", "direct_supervisor", "department"],
        actor_type="PORTAL_USER", actor_id=7,
    )

    fields = {entry["field"] for entry in changed}
    assert fields == {"job_family", "position_level", "direct_supervisor_employee_no", "department", "organization_ref"}
    assert person.job_family == "产品"
    assert person.position_level == "P6"
    assert person.direct_supervisor_employee_no == "E002"
    assert person.department == "新一级部门"
    assert person.is_manually_maintained is True
    assert db.committed is True
    assert recorded and recorded[0].event_type == "PERFORMANCE_CYCLE_PEOPLE_INFO_UPDATED"
    db.refresh.assert_awaited_once_with(person, with_for_update=True)
    db.flush.assert_awaited_once()
    db.rollback.assert_not_awaited()


async def test_update_person_info_rejects_unknown_dimensions_and_bulk_paths_remain_closed():
    cycle = SimpleNamespace(cycle_ref="cycle:test", start_at=datetime.now(timezone.utc) - timedelta(days=1))
    service = PerformanceCycleService.__new__(PerformanceCycleService)
    with pytest.raises(CycleValidationError, match="不支持更新的信息维度"):
        await service.update_person_info_from_roster(cycle, "E001", ["salary"], actor_type="PORTAL_USER", actor_id=7)
    with pytest.raises(CycleValidationError, match="已开始"):
        await service.refresh_people(cycle, actor_type="PORTAL_USER", actor_id=7, reason="refresh")
    with pytest.raises(CycleValidationError, match="已开始"):
        await service.update_people_manually(cycle, [], actor_type="PORTAL_USER", actor_id=7, reason="manual")


@pytest.mark.parametrize("offset", [-1, 0])
async def test_leaver_edit_uses_locked_original_start_and_rejects_same_request_delay(offset, monkeypatch):
    from unittest.mock import AsyncMock, Mock
    from app.performance import cycle_service

    now = datetime(2026, 11, 6, tzinfo=timezone.utc)
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz)
    monkeypatch.setattr(cycle_service, "datetime", Clock)
    cycle = SimpleNamespace(
        **PerformanceCycleService._normalize_payload(_payload(start_at=now + timedelta(seconds=offset), end_at=now + timedelta(days=30))),
        id=1, cycle_ref="cycle:locked", language="zh-CN", status="LOCKED", lock_at=None, leaver_start_date=None, leaver_end_date=None,
    )
    stale = SimpleNamespace(id=1, start_at=now + timedelta(days=5))
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one=lambda: cycle)), commit=AsyncMock())
    service = PerformanceCycleService(db)
    service.audit.append_event = Mock()
    with pytest.raises(CycleValidationError, match="不能修改离职人员参评范围"):
        await service.update_cycle(stale, {"start_at": now + timedelta(days=1), "leaver_enabled": True, "leaver_start_date": now.date(), "leaver_end_date": now.date()}, actor_type="PORTAL_USER", actor_id=7)
    assert cycle.start_at == now + timedelta(seconds=offset)
    assert cycle.leaver_enabled is False
    statement = db.execute.call_args.args[0]
    assert statement._for_update_arg is not None
    assert statement.get_execution_options()["populate_existing"] is True
    db.commit.assert_not_awaited()
    service.audit.append_event.assert_not_called()


@pytest.mark.parametrize("deadline_fields,expected", [
    ({"pre_lock_adjust_until": datetime(2026, 12, 1, 4, 30, tzinfo=timezone.utc)}, "2026-12-01T04:30:00Z"),
    ({"pre_lock_adjust_until": datetime(2026, 12, 1, 12, 30, tzinfo=timezone(timedelta(hours=8)))}, "2026-12-01T04:30:00Z"),
    ({"pre_lock_adjust_until": None}, None),
    ({}, None),
])
def test_cycle_summary_preserves_adjustment_deadline_in_responses(deadline_fields, expected):
    from app.performance.cycles_router import CyclePage, _summary

    cycle = SimpleNamespace(
        **PerformanceCycleService._normalize_payload(_payload(
            lock_rule="SCHEDULED", pre_lock_sync_mode="AUTO_DAILY", **deadline_fields,
        )),
        id=1, cycle_ref="cycle:test", language="zh-CN", status="DRAFT",
        lock_at=datetime(2026, 12, 2, tzinfo=timezone.utc),
        leaver_start_date=None, leaver_end_date=None,
    )
    summary = _summary(cycle, 1, 1, [])
    assert summary.model_dump(mode="json")["pre_lock_adjust_until"] == expected
    page = CyclePage(items=[summary], total=1, page=1, page_size=20)
    assert page.model_dump(mode="json")["items"][0]["pre_lock_adjust_until"] == expected


def test_cycle_summary_reports_real_template_references_and_start_boundary():
    from app.performance.cycles_router import _summary
    cycle = SimpleNamespace(**PerformanceCycleService._normalize_payload(_payload()), id=1, cycle_ref="cycle:test", language="zh-CN", status="LOCKED", lock_at=None, leaver_start_date=None, leaver_end_date=None, created_at=datetime(2026, 11, 18, 9, 56, 9, tzinfo=timezone.utc))
    summary = _summary(cycle, 1, 1, [{"template_id": 9, "status": "DRAFT"}, {"template_id": 7, "status": "STARTED"}, {"template_id": 9, "status": "ENDED"}])
    assert summary.created_at == cycle.created_at
    assert summary.model_dump(mode="json")["created_at"] == "2026-11-18T09:56:09Z"
    assert summary.used_template_ids == [7, 9]
    assert summary.leaver_range_editable is False
    assert "已开始" in summary.leaver_range_editable_reason


@pytest.mark.parametrize("fail_flush", [False, True])
async def test_person_info_guard_is_scoped_cleared_and_rolled_back_on_failure(monkeypatch, fail_flush):
    import json
    from unittest.mock import AsyncMock

    person = SimpleNamespace(id=21, employee_no="E001", job_family="旧", is_manually_maintained=False)
    snapshot = SimpleNamespace(id=11)
    calls = []
    class Db:
        committed = False
        async def execute(self, statement, params=None):
            if params is not None:
                calls.append(params["guard"])
                return None
            entity = statement.column_descriptions[0]["entity"]
            from app.performance.models import PerformanceAuthorizationSnapshot
            return SimpleNamespace(scalar_one_or_none=lambda: snapshot) if entity is PerformanceAuthorizationSnapshot else SimpleNamespace(scalars=lambda: [person])
        refresh = AsyncMock()
        flush = AsyncMock(side_effect=RuntimeError("flush failed") if fail_flush else None)
        rollback = AsyncMock()
        async def commit(self):
            self.committed = True
    db = Db()
    service = PerformanceCycleService(db)
    events = []
    service.audit = SimpleNamespace(append_event=events.append)
    monkeypatch.setattr(service, "_load_roster_inputs", AsyncMock(return_value=[SimpleNamespace(employee_no="E001", job_family="新")]))
    call = service.update_person_info_from_roster(SimpleNamespace(cycle_ref="cycle:test"), "E001", ["job_family"], actor_type="PORTAL_USER", actor_id=7)
    if fail_flush:
        with pytest.raises(RuntimeError, match="flush failed"):
            await call
        db.rollback.assert_awaited_once()
        assert not db.committed
    else:
        await call
        assert db.committed
        assert calls[-1] == ""
    assert json.loads(calls[0]) == {"snapshot_id": 11, "person_id": 21, "fields": ["job_family", "is_manually_maintained"]}
    assert service._load_roster_inputs.call_args.kwargs["include_excluded_leavers"] is True


def test_person_info_migration_restores_strict_guard_on_downgrade():
    import importlib.util
    from pathlib import Path
    path = Path(__file__).parents[1] / "alembic/versions/0294_performance_person_info_update_guard.py"
    spec = importlib.util.spec_from_file_location("person_info_guard", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    statements = []
    migration.op = SimpleNamespace(execute=statements.append)
    migration.upgrade()
    assert migration.revision == "0294_pm_person_info_guard"
    assert migration.down_revision == "0293_performance_calibration_revocation"
    assert "guard->>'snapshot_id' = OLD.snapshot_id::text" in statements[0]
    assert "guard->>'person_id' = OLD.id::text" in statements[0]
    assert "allowed_fields <@ dimension_fields" in statements[0]
    assert "TG_OP IN ('INSERT', 'DELETE')" in statements[0]
    migration.downgrade()
    assert "person_info_update" not in statements[1]
    assert "live_employment_status', 'updated_at'" in statements[1]


@pytest.mark.postgres_acceptance
async def test_person_info_guard_postgres_roundtrip_and_transaction_isolation():
    import importlib.util
    import json
    from pathlib import Path
    from uuid import uuid4
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool
    from app.core.config import get_settings

    async def rejected_local(connection, sql):
        with pytest.raises(Exception):
            async with connection.begin_nested():
                await connection.execute(text(sql))
    schema = "test_person_guard_" + uuid4().hex
    engine = create_async_engine(get_settings().db_url_async, poolclass=NullPool)
    spec = importlib.util.spec_from_file_location("person_guard_pg", Path(__file__).parents[1] / "alembic/versions/0294_performance_person_info_update_guard.py")
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    async with engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    scoped = create_async_engine(get_settings().db_url_async, poolclass=NullPool, connect_args={"server_settings": {"search_path": schema}})
    try:
        async with scoped.begin() as conn:
            await conn.execute(text("CREATE TABLE performance_authorization_snapshots(id bigint PRIMARY KEY,status text)"))
            await conn.execute(text("CREATE TABLE performance_authorization_snapshot_people(id bigint PRIMARY KEY,snapshot_id bigint,employee_no text,job_family text,department text,live_employment_status text,is_manually_maintained boolean,updated_at timestamptz)"))
            await conn.execute(text("INSERT INTO performance_authorization_snapshots VALUES (1,'LOCKED'),(2,'DRAFT')"))
            await conn.execute(text("INSERT INTO performance_authorization_snapshot_people VALUES (21,1,'E001','old','old','active',false,now()),(22,1,'E002','old','old','active',false,now())"))
            def apply(connection, action):
                migration.op = Operations(MigrationContext.configure(connection))
                getattr(migration, action)()
            await conn.run_sync(apply, "upgrade")
            await conn.execute(text("CREATE TRIGGER guard BEFORE INSERT OR UPDATE OR DELETE ON performance_authorization_snapshot_people FOR EACH ROW EXECUTE FUNCTION performance_guard_snapshot_person_mutation()"))
            async def rejected(sql, params=None):
                with pytest.raises(Exception):
                    async with conn.begin_nested():
                        await conn.execute(text(sql), params or {})
            await rejected("UPDATE performance_authorization_snapshot_people SET job_family='blocked' WHERE id=21")
            await conn.execute(text("SELECT set_config('performance.person_info_update',:guard,true)"), {"guard": json.dumps({"snapshot_id": 1, "person_id": 21, "fields": ["job_family", "is_manually_maintained"]})})
            await conn.execute(text("UPDATE performance_authorization_snapshot_people SET job_family='new',is_manually_maintained=true WHERE id=21"))
            await rejected("UPDATE performance_authorization_snapshot_people SET job_family='blocked' WHERE id=22")
            await rejected("UPDATE performance_authorization_snapshot_people SET department='blocked' WHERE id=21")
            await rejected("UPDATE performance_authorization_snapshot_people SET employee_no='blocked' WHERE id=21")
            await rejected("UPDATE performance_authorization_snapshot_people SET snapshot_id=2 WHERE id=21")
            await rejected("DELETE FROM performance_authorization_snapshot_people WHERE id=21")
            await rejected("INSERT INTO performance_authorization_snapshot_people(id,snapshot_id) VALUES(23,1)")
        async with scoped.begin() as conn:
            assert not (await conn.execute(text("SELECT current_setting('performance.person_info_update',true)"))).scalar()
            await rejected_local(conn, "UPDATE performance_authorization_snapshot_people SET job_family='blocked' WHERE id=21")
            assert (await conn.execute(text("SELECT job_family FROM performance_authorization_snapshot_people WHERE id=21"))).scalar() == "new"
            await conn.run_sync(apply, "downgrade")
            await conn.execute(text("SELECT set_config('performance.person_info_update',:guard,true)"), {"guard": json.dumps({"snapshot_id": 1, "person_id": 21, "fields": ["job_family"]})})
            await rejected_local(conn, "UPDATE performance_authorization_snapshot_people SET job_family='blocked' WHERE id=21")
            await conn.run_sync(apply, "upgrade")
            await conn.execute(text("SELECT set_config('performance.person_info_update','',true)"))
            with pytest.raises(RuntimeError, match="rollback guard"):
                async with conn.begin_nested():
                    await conn.execute(text("SELECT set_config('performance.person_info_update',:guard,true)"), {"guard": json.dumps({"snapshot_id": 1, "person_id": 21, "fields": ["job_family"]})})
                    await conn.execute(text("UPDATE performance_authorization_snapshot_people SET job_family='rolled_back' WHERE id=21"))
                    raise RuntimeError("rollback guard")
            assert not (await conn.execute(text("SELECT current_setting('performance.person_info_update',true)"))).scalar()
            assert (await conn.execute(text("SELECT job_family FROM performance_authorization_snapshot_people WHERE id=21"))).scalar() == "new"
            await rejected_local(conn, "UPDATE performance_authorization_snapshot_people SET job_family='blocked' WHERE id=21")
            await conn.execute(text("UPDATE performance_authorization_snapshot_people SET live_employment_status='left' WHERE id=21"))
    finally:
        await scoped.dispose()
        async with engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await engine.dispose()
