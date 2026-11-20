from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.performance import shared_result_service as shared
from app.performance import calibration_completion_service as completion
from app.performance.result_service import resolve_effective_result


def test_actor_drafts_are_private_and_legacy_only_belongs_to_handler():
    task = SimpleNamespace(handler_ref="owner", draft_answers={"text": "legacy"}, actor_drafts=None)
    assert shared.private_draft(task, "delegate") is None
    assert shared.private_draft(task, "owner")["answers"] == {"text": "legacy"}
    shared.set_private_draft(task, "delegate", {"text": "private"}, 3)
    shared.set_private_draft(task, "owner", {"text": "mine"}, 2)
    assert task.draft_answers is None
    assert shared.private_draft(task, "delegate")["base_result_version"] == 3
    shared.set_private_draft(task, "delegate", None, 3)
    assert shared.private_draft(task, "delegate") is None
    assert shared.private_draft(task, "owner")["answers"] == {"text": "mine"}


@pytest.mark.parametrize("expected,code", [(None, "RESULT_VERSION_REQUIRED"), (1, "SHARED_RESULT_VERSION_CONFLICT")])
def test_shared_revision_rejects_missing_and_stale(expected, code):
    with pytest.raises(HTTPException) as error:
        shared.require_revision(expected, 2)
    assert error.value.detail == code


def test_formal_shared_result_preserves_readonly_hidden_unknown_and_repeated_values():
    schema = [{"id": "section", "fields": [{"id": "text", "type": "rich_text"}, {"id": "readonly", "type": "rich_text", "readonly": True}]}]
    state = {"revision": 2, "answers": {"text": "old", "readonly": "safe", "hidden": [None, "__unknown__"], "unknown": {"a": 1}}, "checkpoints": {"20:p": {"revision": 0, "answers": {"text": "historical"}}}}
    original = deepcopy(state)
    member = SimpleNamespace()
    task = SimpleNamespace(id=1, task_kind="evaluation")
    result = shared.submit_result(member, task, None, schema, {"text": "new", "readonly": "evil", "hidden": "evil"}, SimpleNamespace(actor_type="EMPLOYEE", actor_ref="real"), state)
    assert result["revision"] == 3 and result["answers"]["text"] == "new"
    assert result["answers"]["readonly"] == "safe" and result["answers"]["hidden"] == [None, "__unknown__"]
    assert result["answers"]["unknown"] == {"a": 1}
    assert result["source_actor_ref"] == "real" and state == original


def test_current_shared_result_does_not_reapply_old_calibration_but_historical_checkpoint_remains():
    nodes = [SimpleNamespace(id=10, node_order=1, node_type="evaluation", config={"template": {"include_final_result": True}})]
    state = {"revision": 5, "answers": {"rating": "new-final"}, "source_task_id": 1, "source_kind": "evaluation", "checkpoints": {"20:p": {"answers": {"rating": "before"}}}}
    task = SimpleNamespace(id=1, revoked_at=None, status="completed", submitted_at=datetime.now(UTC))
    assert resolve_effective_result(nodes, [task], shared_state=state)["answers"] == {"rating": "new-final"}
    assert resolve_effective_result(nodes, [task], shared_state=state, before_calibration=(20, "p"))["answers"] == {"rating": "before"}


@pytest.mark.asyncio
async def test_completion_allows_missing_results_without_fabricating_submission(monkeypatch):
    from app.performance import projects_router as routes
    task = SimpleNamespace(id=1, calibration_completed_at=None, calibration_completed_by=None, submitted_at=None, answers={})
    actor = SimpleNamespace(actor_type="EMPLOYEE", actor_ref="calibrator")
    project = SimpleNamespace(id=1, cycle_ref="c")
    node = SimpleNamespace(node_id="n")
    response = {"scope_version": "digest", "total_count": 1, "completed_count": 0, "missing_result_count": 1, "can_complete": True, "completed": False}
    async def scope(*args, **kwargs):
        return project, node, actor, [(task, None)], {**response, "completed": task.calibration_completed_at is not None}
    monkeypatch.setattr(completion, "completion_scope", scope)
    monkeypatch.setattr(routes, "_sync_automatic_openings", AsyncMock())
    monkeypatch.setattr(completion, "PerformanceAuditService", lambda db: SimpleNamespace(append_event=lambda event: None))
    db = SimpleNamespace(commit=AsyncMock())
    payload = SimpleNamespace(node_id="n", phase_id="p", scope_version="digest")
    result = await completion.confirm_completion(db, 1, payload, None)
    first = task.calibration_completed_at
    assert result["completed"] and result["missing_result_count"] == 1
    assert task.submitted_at is None and task.answers == {} and task.calibration_completed_by == "calibrator"
    await completion.confirm_completion(db, 1, payload, None)
    assert task.calibration_completed_at == first and db.commit.await_count == 1


@pytest.mark.asyncio
async def test_completion_rejects_changed_scope_before_mutation(monkeypatch):
    task = SimpleNamespace(calibration_completed_at=None)
    response = {"completed": False, "scope_version": "new", "can_complete": True}
    monkeypatch.setattr(completion, "completion_scope", AsyncMock(return_value=(None, None, None, [task], response)))
    with pytest.raises(HTTPException) as error:
        await completion.confirm_completion(SimpleNamespace(), 1, SimpleNamespace(node_id="n", phase_id="p", scope_version="stale"), None)
    assert error.value.detail == "CALIBRATION_SCOPE_CHANGED"
    assert task.calibration_completed_at is None


def test_automatic_opening_requires_explicit_calibration_completion():
    from app.performance.projects_router import _previous_finished
    node = SimpleNamespace(id=2, node_type="calibration")
    task = SimpleNamespace(target_employee_no="e", node_snapshot_id=2, revoked_at=None, status="completed", submitted_at=datetime.now(UTC), calibration_completed_at=None)
    assert not _previous_finished("e", node, [task])
    task.calibration_completed_at = datetime.now(UTC)
    assert _previous_finished("e", node, [task])


@pytest.mark.asyncio
async def test_none_authorization_completion_is_persisted_without_completing_parent(monkeypatch):
    from sqlalchemy import BigInteger, create_engine
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.ext.compiler import compiles, deregister
    from sqlalchemy.orm import Session
    from app.performance import models, projects_router as routes
    from tests.test_performance_user_authorization import AsyncDb

    compiles(JSONB, "sqlite")(lambda *_args, **_kwargs: "JSON")
    compiles(BigInteger, "sqlite")(lambda *_args, **_kwargs: "INTEGER")
    engine = create_engine("sqlite://")
    session = Session(engine, expire_on_commit=False)
    try:
        tables = [model.__table__ for model in (models.PerformanceProject, models.PerformanceProjectNodeSnapshot, models.PerformanceNodeTask, models.PerformanceNodeTaskAuthorization, models.PerformanceAuditEvent)]
        models.PerformanceProject.metadata.create_all(engine, tables=tables)
        rule = {"assessment_item_id": "grade", "min_people_operator": "GTE", "min_people_count": 1, "conditions": [{"control_mode": "HARD", "grade_codes": ["A"], "operator": "LTE", "value": 0, "unit": "PEOPLE"}]}
        project = models.PerformanceProject(id=1, project_ref="p", cycle_ref="c", name="项目", status="STARTED", administrators=[], settings={"flow_settings": {"node_settings": {"cal": {"calibration": {"force_distribution_enabled": True, "distribution": {"rules": [rule]}}}}}})
        node = models.PerformanceProjectNodeSnapshot(id=2, project_id=1, node_id="cal", node_type="calibration", name="校准", node_order=1, config={"calibration": {"role_code": "assessment.calibrator", "phases": [{"phase_id": "p", "assignments": [{"employee_no": "e", "handler_ref": "owner"}]}]}})
        task = models.PerformanceNodeTask(id=3, project_id=1, cycle_ref="c", member_snapshot_id=7, node_snapshot_id=2, target_employee_no="e", handler_ref="owner", phase_id="p", task_kind="calibration", status="pending", answers={})
        grant = models.PerformanceNodeTaskAuthorization(id=4, project_id=1, cycle_ref="c", task_id=3, authorization_type="AUTHORIZE", grantor_employee_no="owner", recipient_employee_no="delegate", status="ACTIVE", read_only=False, authorization_settings={"distribution_mode": "NONE", "allow_reauthorize": True})
        session.add_all([project, node, task, grant]); session.commit()
        db = AsyncDb(session)
        actor = SimpleNamespace(actor_type="EMPLOYEE", actor_ref="delegate")
        schema = [{"id": "s", "fields": [{"id": "grade", "type": "rating", "label": "评级", "options": [{"id": "A", "code": "A", "label": "A"}]}]}]
        monkeypatch.setattr(routes, "resolve_trusted_performance_actor", AsyncMock(side_effect=lambda *_args, **_kwargs: actor))
        monkeypatch.setattr(routes, "_self_summary_task", AsyncMock(return_value=(task, node)))
        monkeypatch.setattr(routes, "_self_summary_template", AsyncMock(return_value={}))
        monkeypatch.setattr(routes, "build_self_summary_schema", lambda _template: schema)
        monkeypatch.setattr(routes, "_task_window", lambda *_args: (None, None))
        monkeypatch.setattr(routes, "_effective_member_result", AsyncMock(return_value={"answers": {"grade": "A"}, "shared_state": {"revision": 1}}))
        monkeypatch.setattr(routes, "_sync_automatic_openings", AsyncMock())
        payload = SimpleNamespace(node_id="cal", phase_id="p")
        preview = await completion.preview_completion(db, 1, payload, None)
        assert preview["can_complete"] and not preview["has_original_tasks"]
        result = await completion.confirm_completion(db, 1, SimpleNamespace(**vars(payload), scope_version=preview["scope_version"]), None)
        assert result["completed"]
        session.expire_all()
        assert session.get(models.PerformanceNodeTaskAuthorization, 4).authorization_settings["calibration_completed_by"] == "delegate"
        assert session.get(models.PerformanceNodeTask, 3).calibration_completed_at is None
        routes._sync_automatic_openings.assert_not_awaited()
        assert not routes._previous_finished("e", node, [task])
        actor.actor_ref = "owner"
        parent = await completion.preview_completion(db, 1, payload, None)
        assert not parent["completed"] and not parent["can_complete"]
        assert parent["blocked_reason"] == "CALIBRATION_DISTRIBUTION_VIOLATED"
        with pytest.raises(HTTPException) as error:
            await completion.confirm_completion(db, 1, SimpleNamespace(**vars(payload), scope_version=parent["scope_version"]), None)
        assert error.value.detail == "CALIBRATION_DISTRIBUTION_VIOLATED"
        actor.actor_ref = "delegate"
        grant.authorization_settings = {"distribution_mode": "NONE", "allow_reauthorize": True}
        session.commit()
        old = await completion.preview_completion(db, 1, payload, None)
        grant.authorization_settings = {**grant.authorization_settings, "distribution_mode": "INHERIT"}
        session.commit()
        with pytest.raises(HTTPException) as changed:
            await completion.confirm_completion(db, 1, SimpleNamespace(**vars(payload), scope_version=old["scope_version"]), None)
        assert changed.value.detail == "CALIBRATION_SCOPE_CHANGED"
        assert "calibration_completed_at" not in grant.authorization_settings and task.calibration_completed_at is None
        inherited = await completion.preview_completion(db, 1, payload, None)
        assert not inherited["can_complete"]
        grant.authorization_settings = {"distribution_mode": "NONE", "allow_reauthorize": True}
        child = models.PerformanceNodeTaskAuthorization(id=5, project_id=1, cycle_ref="c", task_id=3, authorization_type="AUTHORIZE", grantor_employee_no="delegate", recipient_employee_no="child", status="ACTIVE", read_only=False, authorization_settings={"distribution_mode": "INHERIT", "parent_authorization_id": 4})
        session.add(child); session.commit()
        actor.actor_ref = "child"
        assert not (await completion.preview_completion(db, 1, payload, None))["can_complete"]
        child.recipient_employee_no = "delegate"
        session.commit()
        actor.actor_ref = "delegate"
        assert not (await completion.preview_completion(db, 1, payload, None))["can_complete"]
        child.status = "REVOKED"; grant.read_only = True
        session.commit()
        with pytest.raises(HTTPException) as readonly:
            await completion.preview_completion(db, 1, payload, None)
        assert readonly.value.status_code == 404
    finally:
        session.close(); engine.dispose(); deregister(JSONB); deregister(BigInteger)


def test_distribution_scopes_deduplicate_people_and_keep_assessment_counts_separate():
    tasks = [SimpleNamespace(id=i, member_snapshot_id=1, target_employee_no="e", phase_id="p") for i in (1, 2)]
    conditions = [{"control_mode": "HARD", "grade_codes": ["A"], "operator": "LTE", "value": 0, "unit": "PEOPLE"}]
    rule = {"assessment_item_id": "second", "min_people_count": 1, "conditions": conditions}
    project = SimpleNamespace(settings={"flow_settings": {"node_settings": {"cal": {"calibration": {"force_distribution_enabled": True, "distribution": {"rules": [rule]}}}}}})
    node = SimpleNamespace(node_id="cal")
    groups = [{"tasks": tasks, "authorizations": [], "source_rule_ids": None, "mode": "INHERIT"}]
    metadata = [{"answer_key": "first", "key": "rating:first", "label": "第一项"}, {"answer_key": "second", "key": "rating:second", "label": "第二项"}]
    ratings = {(1, "e"): {"rating:first": {"label": "A"}, "rating:second": {"label": "B"}}}
    result = completion.distribution_tips(project, node, groups, ratings, metadata)
    assert result["total_people"] == 1 and result["rules"][0]["conditions"][0]["current_people"] == 0
    assert not result["rules"][0]["conditions"][0]["violated"]
    rule["min_people_count"] = 2
    assert completion.distribution_tips(project, node, groups, ratings, metadata)["rules"] == []


@pytest.mark.asyncio
async def test_real_sql_alternating_formal_writes_private_drafts_and_reopen(monkeypatch):
    from sqlalchemy import BigInteger, create_engine, select
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.ext.compiler import compiles, deregister
    from sqlalchemy.orm import Session
    from app.performance import models, projects_router as routes
    from tests.test_performance_user_authorization import AsyncDb

    compiles(JSONB, "sqlite")(lambda *_args, **_kwargs: "JSON")
    compiles(BigInteger, "sqlite")(lambda *_args, **_kwargs: "INTEGER")
    engine = create_engine("sqlite://")
    tables = [model.__table__ for model in (models.PerformanceProjectMember, models.PerformanceProjectNodeSnapshot, models.PerformanceNodeTask, models.PerformanceAuditEvent)]
    try:
        models.PerformanceProjectMember.metadata.create_all(engine, tables=tables)
        session = Session(engine, expire_on_commit=False)
        db = AsyncDb(session)
        template = {"include_final_result": True, "content": [{"id": "result", "type": "custom", "items": [{"id": "text", "kind": "fill"}, {"id": "locked", "kind": "fill"}]}]}
        final_node = models.PerformanceProjectNodeSnapshot(id=10, project_id=1, node_id="final", node_type="evaluation", name="终评", node_order=1, config={"template": template})
        calibration_node = models.PerformanceProjectNodeSnapshot(id=20, project_id=1, node_id="calibration", node_type="calibration", name="校准", node_order=2, config={"template": {**template, "include_final_result": False}, "calibration": {"phases": [{"phase_id": "p"}]}})
        member = models.PerformanceProjectMember(id=1, snapshot_id=7, employee_no="e", display_name="员工")
        final = models.PerformanceNodeTask(id=1, project_id=1, cycle_ref="c", member_snapshot_id=7, node_snapshot_id=10, target_employee_no="e", handler_ref="manager", task_kind="evaluation", phase_id="", status="pending", answers={})
        calibration = models.PerformanceNodeTask(id=2, project_id=1, cycle_ref="c", member_snapshot_id=7, node_snapshot_id=20, target_employee_no="e", handler_ref="calibrator", task_kind="calibration", phase_id="p", status="pending", answers={})
        session.add_all([member, final_node, calibration_node, final, calibration])
        session.commit()
        monkeypatch.setattr(routes, "_shared_answer_submissions", AsyncMock(return_value=[]))
        schema = [{"id": "result", "fields": [{"id": "text", "type": "rich_text"}, {"id": "locked", "type": "rich_text", "readonly": True}]}]
        actor = lambda who: SimpleNamespace(actor_type="EMPLOYEE", actor_ref=who)
        async def write(task, node, text, revision, submit=True, who=None):
            return await routes._save_shared_task(task, node, routes.SelfSummaryAnswersPayload(answers={"text": text, "locked": "forged"}, result_version=revision), submit, actor(who or task.handler_ref), None, schema, db)
        first = await write(calibration, calibration_node, "C1", 0)
        assert first["result_version"] == 1
        assert final.status == "completed" and final.submitted_at is None and final.answers == {}
        assert not await routes._final_result_locked(final, final_node, db)
        await write(final, final_node, "private", 1, False)
        second = await write(calibration, calibration_node, "C2", 1)
        assert second["result_version"] == 2
        with pytest.raises(HTTPException) as stale:
            await write(final, final_node, "old draft", 1)
        assert stale.value.detail == "SHARED_RESULT_VERSION_CONFLICT"
        session.rollback()
        assert shared.private_draft(final, "calibrator") is None
        assert shared.private_draft(final, "manager")["base_result_version"] == 1
        shared.set_private_draft(final, "manager", None, 2)
        session.commit()
        third = await write(final, final_node, "F3", 2)
        session.expire_all()
        reopened = await routes._effective_member_result(1, "c", 7, "e", db)
        assert third["result_version"] == 3 and reopened["answers"] == {"text": "F3"}
        assert reopened["shared_state"]["source_actor_ref"] == "manager"
        assert reopened["shared_state"]["checkpoints"]
        calibration.calibration_completed_at = datetime.now(UTC)
        session.commit()
        assert await routes._final_result_locked(final, final_node, db)
        await write(calibration, calibration_node, "C4", 3)
        assert calibration.calibration_completed_at is not None
        session.expire_all()
        reopened = await routes._effective_member_result(1, "c", 7, "e", db)
        assert reopened["answers"] == {"text": "C4"} and reopened["shared_state"]["revision"] == 4
        assert session.scalar(select(models.PerformanceAuditEvent).where(models.PerformanceAuditEvent.event_type == "PERFORMANCE_TASK_SUBMITTED")).actor_ref == "manager"
        session.close()
    finally:
        engine.dispose()
        deregister(JSONB)
        deregister(BigInteger)
