from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.dialects import postgresql

from app.performance import comparison_notification_service as service
from app.performance.models import PerformanceComparisonNotification, PerformanceProject


def rows_result(rows):
    return SimpleNamespace(all=lambda: rows, scalars=lambda: SimpleNamespace(all=lambda: rows))


@pytest.fixture
def submission(monkeypatch):
    task = SimpleNamespace(id=10, project_id=1, cycle_ref="c", member_snapshot_id=2, target_employee_no="subject")
    node = SimpleNamespace(id=3, node_id="first")
    project = SimpleNamespace(id=1, cycle_ref="c")
    comparison = {"rule_id": "rule", "first_node_id": "first", "second_node_id": "second",
                  "rating_signature": "a", "send_notification": True,
                  "matches": [{"first_task_id": 10, "second_task_id": 20}]}

    class Db:
        def __init__(self):
            self.rows, self.statements = [], []
            self.flushes = 0
            self.commit = AsyncMock(side_effect=AssertionError("enqueue must not commit"))

        def add(self, row):
            row.id = len(self.rows) + 1
            self.rows.append(row)

        async def flush(self):
            self.flushes += 1

        async def scalar(self, statement):
            self.statements.append(str(statement.compile(dialect=postgresql.dialect())))
            if statement.column_descriptions[0]["entity"] is PerformanceProject:
                return project
            return next((row for row in self.rows if row.payload.get("kind") == "baseline"), None)

    from app.identity_switch.service import current_switch
    token = current_switch.set(None)
    monkeypatch.setattr(service, "_recipients", AsyncMock(return_value={"reviewer": 20}))
    yield SimpleNamespace(db=Db(), task=task, node=node, project=project,
                          actor=SimpleNamespace(actor_ref="submitter"), comparison=comparison)
    current_switch.reset(token)


async def enqueue(data, **changes):
    comparison = {**data.comparison, **changes}
    return await service.enqueue_notifications(data.db, data.task, data.node, data.project, data.actor, comparison)


def notifications(data):
    return [row for row in data.db.rows if row.payload.get("kind") == "notification"]


@pytest.mark.asyncio
async def test_enqueue_same_ratings_comment_versions_do_not_repeat_and_shared_scope_is_not_submission_side(submission):
    data = submission
    assert await enqueue(data) == 1
    first = notifications(data)[0]
    assert first.status == "pending" and first.event_sequence == 1
    assert first.event_key.startswith("comparison:")
    assert await enqueue(data, context="changed-comment-context", event_sequence=8) == 0
    data.task.id, data.node.node_id = 20, "second"
    data.comparison["matches"] = [{"first_task_id": 10, "second_task_id": 20}]
    assert await enqueue(data) == 0
    assert len(notifications(data)) == 1
    assert "FOR UPDATE" in data.db.statements[0]
    data.db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_rating_changes_clear_difference_and_return_to_old_ratings_use_new_sequence(submission):
    data = submission
    assert await enqueue(data) == 1
    assert await enqueue(data, rating_signature="no-difference", matches=[]) == 0
    assert await enqueue(data, rating_signature="a") == 1
    queued = notifications(data)
    assert [row.event_sequence for row in queued] == [1, 3]
    assert len({row.event_key for row in queued}) == 2
    baseline = data.db.rows[0]
    assert baseline.status == "skipped" and baseline.recipient_ref == ""
    assert baseline.event_sequence == 3 and baseline.payload["rating_signature"] == "a"


@pytest.mark.asyncio
async def test_other_formal_evaluator_match_does_not_notify_on_unrelated_submit(submission):
    data = submission
    assert await enqueue(data, matches=[{"first_task_id": 99, "second_task_id": 20}]) == 0
    service._recipients.assert_not_called()
    assert data.db.rows[0].payload["kind"] == "baseline"


@pytest.mark.asyncio
async def test_identity_switch_intent_is_terminal_skipped_without_background_send(submission):
    from app.identity_switch.service import current_switch
    token = current_switch.set(SimpleNamespace(session_id="switch"))
    try:
        assert await enqueue(submission) == 1
    finally:
        current_switch.reset(token)
    assert notifications(submission)[0].status == "skipped"
    assert notifications(submission)[0].last_error == "IDENTITY_SWITCH_NOTIFICATION_INTERCEPTED"


@pytest.mark.asyncio
async def test_notification_disabled_still_records_ratings_baseline(submission):
    assert await enqueue(submission, send_notification=False) == 0
    assert len(submission.db.rows) == 1
    assert submission.db.rows[0].payload["rating_signature"] == "a"


@pytest.mark.asyncio
async def test_receiver_projection_not_submitter_projection_drives_effective_evaluators(monkeypatch):
    from app.performance import projects_router as routes
    source = SimpleNamespace(id=10, project_id=1, cycle_ref="c", member_snapshot_id=2, target_employee_no="subject")
    first = SimpleNamespace(node_id="first")
    second = SimpleNamespace(node_id="second")
    task_a, task_b = SimpleNamespace(id=20), SimpleNamespace(id=21)
    db = SimpleNamespace(execute=AsyncMock(return_value=rows_result([(task_a, second), (task_b, second)])))
    comparison = {"first_node_id": "first", "second_node_id": "second", "matches": [{"first_task_id": 10, "second_task_id": 21}]}
    monkeypatch.setattr(service.comparisons, "ordinary_evaluation", lambda node: True)
    monkeypatch.setattr(service, "_recipient_comparison", lambda comparison, task, node: comparison)
    monkeypatch.setattr(service, "_recipient_projection", AsyncMock(side_effect=[None, {"matches": [1]}]))
    monkeypatch.setattr(routes, "_task_handlers", AsyncMock(return_value={"submitter", "readonly", "transferred", "duplicate"}))
    monkeypatch.setattr(routes, "_task_edit_allowed", AsyncMock(side_effect=lambda db, task, handler: handler != "readonly"))
    result = await service._recipients(db, source, first, SimpleNamespace(id=1), comparison, "submitter")
    assert result == {"duplicate": 21, "transferred": 21}
    assert routes._task_handlers.await_count == 1


@pytest.mark.asyncio
async def test_actual_effective_handlers_respect_transfer_and_readonly_authorization(monkeypatch):
    from app.performance import projects_router as routes
    source = SimpleNamespace(id=10, project_id=1, cycle_ref="c", member_snapshot_id=2, target_employee_no="subject")
    recipient = SimpleNamespace(id=20, handler_ref="original", revoked_at=None)
    first, second = SimpleNamespace(node_id="first"), SimpleNamespace(node_id="second")
    delegations = [SimpleNamespace(status="ACTIVE", authorization_type=kind, recipient_employee_no=handler, read_only=readonly)
                   for kind, handler, readonly in [("TRANSFER", "new-handler", False), ("AUTHORIZE", "readonly", True), ("AUTHORIZE", "editor", False)]]
    monkeypatch.setattr(routes, "_task_delegations", AsyncMock(return_value=delegations))
    monkeypatch.setattr(service.comparisons, "ordinary_evaluation", lambda node: True)
    monkeypatch.setattr(service, "_recipient_comparison", lambda comparison, task, node: comparison)
    monkeypatch.setattr(service, "_recipient_projection", AsyncMock(return_value={"matches": [1]}))
    db = SimpleNamespace(execute=AsyncMock(return_value=rows_result([(recipient, second)])))
    result = await service._recipients(db, source, first, SimpleNamespace(id=1),
        {"first_node_id": "first", "second_node_id": "second"}, "submitter")
    assert result == {"editor": 20, "new-handler": 20}


@pytest.mark.asyncio
async def test_multiple_recipient_tasks_are_per_person_deduplicated(monkeypatch):
    from app.performance import projects_router as routes
    source = SimpleNamespace(id=10, project_id=1, cycle_ref="c", member_snapshot_id=2, target_employee_no="subject")
    node, other = SimpleNamespace(node_id="first"), SimpleNamespace(node_id="second")
    db = SimpleNamespace(execute=AsyncMock(return_value=rows_result([(SimpleNamespace(id=20), other), (SimpleNamespace(id=21), other)])))
    monkeypatch.setattr(service.comparisons, "ordinary_evaluation", lambda node: True)
    monkeypatch.setattr(service, "_recipient_comparison", lambda comparison, task, node: comparison)
    monkeypatch.setattr(service, "_recipient_projection", AsyncMock(return_value={"matches": [1]}))
    monkeypatch.setattr(routes, "_task_handlers", AsyncMock(return_value={"same-person"}))
    monkeypatch.setattr(routes, "_task_edit_allowed", AsyncMock(return_value=True))
    recipients = await service._recipients(db, source, node, SimpleNamespace(id=1),
        {"first_node_id": "first", "second_node_id": "second"}, "submitter")
    assert recipients == {"same-person": 20}


@pytest.mark.asyncio
async def test_claim_durable_dispatching_has_owner_and_unknown_is_never_requeued(monkeypatch):
    now = datetime.now(UTC)
    pending = SimpleNamespace(id=1, status="pending", attempts=0, payload={}, next_retry_at=now)
    stale = SimpleNamespace(id=2, status="dispatching", attempts=1, payload={}, next_retry_at=now)
    db = SimpleNamespace(execute=AsyncMock(return_value=rows_result([pending, stale])), flush=AsyncMock())
    monkeypatch.setattr(service, "_locked_context", AsyncMock(side_effect=lambda db, row, statuses: (row, None, None, {})))
    assert await service.claim_notifications(db, 123) == [1]
    assert pending.status == "dispatching" and pending.attempts == 1
    assert pending.payload["claim_run_id"] == 123 and pending.next_retry_at > now
    assert stale.status == "unknown" and stale.attempts == 1
    sql = str(db.execute.call_args.args[0].compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" not in sql


@pytest.mark.asyncio
@pytest.mark.parametrize("can_view", [False, True])
async def test_recipient_projection_uses_own_reference_direction_with_real_schema_projector(monkeypatch, can_view):
    from app.performance import projects_router as routes
    content = {"content_id": "shared", "type": "custom", "name": "rating", "items": [
        {"id": "rating", "kind": "rating", "options": [{"id": "a"}, {"id": "b"}, {"id": "c"}]}]}
    viewer = {"content": [content, {"content_slot": "reference", "reference_kind": "node", "reference_value": "first", "settings": {"allowView": can_view}}]}
    source_template = {"content": [content]}
    source_node = SimpleNamespace(id=3, node_id="first")
    recipient_node = SimpleNamespace(id=4, node_id="second", config={})
    recipient = SimpleNamespace(id=20, task_kind="evaluation")
    monkeypatch.setattr(routes, "_reference_template", AsyncMock(side_effect=[viewer, source_template]))
    db = SimpleNamespace(scalar=AsyncMock(return_value=source_node))
    comparison = {"rule_id": "r", "first_node_id": "first", "second_node_id": "second", "reason_required": False,
                  "matches": [{"content_id": "shared", "item_id": "rating", "first_task_id": 10, "second_task_id": 20,
                               "first_version": 1, "second_version": 1}]}
    result = await service._recipient_projection(db, comparison, recipient, recipient_node, SimpleNamespace(id=1))
    assert bool(result and result["matches"]) is can_view


@pytest.mark.asyncio
async def test_lock_order_cycle_project_tasks_outbox_uses_skip_locked():
    candidate = SimpleNamespace(id=5, cycle_ref="c", project_id=1, task_id=10, recipient_task_id=20)
    statements = []

    async def scalar(statement):
        statements.append(str(statement.compile(dialect=postgresql.dialect())))
        return candidate

    async def execute(statement):
        statements.append(str(statement.compile(dialect=postgresql.dialect())))
        return rows_result([SimpleNamespace(id=10), SimpleNamespace(id=20)])

    context = await service._locked_context(SimpleNamespace(scalar=scalar, execute=execute), candidate, ["pending"])
    assert context[0] is candidate
    assert [sql.split("FROM ")[1].split()[0] for sql in statements] == [
        "performance_cycles", "performance_projects", "performance_node_tasks", "performance_comparison_notifications"]
    assert all("FOR UPDATE SKIP LOCKED" in sql for sql in statements)


def response(status="success", success_count=1, errors=None):
    return SimpleNamespace(status=status, success_count=success_count, errors=errors or [], log_id=9)


@pytest.mark.parametrize("result,log,expected", [
    (response(), SimpleNamespace(result_snapshot=[{"status": "success", "message_id": "real-id"}]), "sent"),
    (response(), SimpleNamespace(result_snapshot=[{"status": "success", "message_id": None}]), "skipped"),
    (response("skipped", 0, ["NOTIFICATION_PREVIEW_ONLY"]), None, "skipped"),
    (response("failed", 0, ["内部错误"]), SimpleNamespace(result_snapshot=[{"status": "failed", "msg": "内部错误"}]), "unknown"),
    (response("failed", 0), SimpleNamespace(result_snapshot=[{"status": "failed", "msg": "飞书接口错误: rate limited (code=999)"}]), "retrying"),
])
def test_delivery_outcome_distinguishes_blocked_preview_rejection_and_unknown(result, log, expected):
    assert service._delivery_outcome(result, log)[0] == expected


@pytest.fixture
def delivery(monkeypatch):
    from app.integrations.feishu import notification_service as transport
    from app.integrations.feishu.models import FeishuNotificationLog
    from app.performance.models import PerformanceNotificationSetting
    from app.users.models import User
    row = SimpleNamespace(id=1, project_id=1, task_id=10, recipient_task_id=20, recipient_ref="recipient", event_key="event", attempts=2,
                          status="dispatching", payload={"claim_run_id": 7}, sent_at=None)
    project = SimpleNamespace(id=1)
    log = SimpleNamespace(result_snapshot=[{"status": "success", "message_id": "message"}])
    user = SimpleNamespace(id=55, feishu_user_id="open-id")

    async def get(model, identity, **kwargs):
        if model is PerformanceComparisonNotification:
            return row
        if model is PerformanceNotificationSetting:
            return SimpleNamespace(feishu_push_enabled=True)
        if model is FeishuNotificationLog:
            return log
        if model is User:
            return user

    db = SimpleNamespace(get=AsyncMock(side_effect=get), scalar=AsyncMock(return_value=user), flush=AsyncMock())
    monkeypatch.setattr(service, "_locked_context", AsyncMock(return_value=(row, None, project, {})))
    monkeypatch.setattr(service, "_still_authorized", AsyncMock(return_value=True))
    monkeypatch.setattr(transport, "send_notification", AsyncMock(return_value=response()))
    return SimpleNamespace(db=db, row=row, log=log, transport=transport.send_notification)


@pytest.mark.asyncio
async def test_dispatch_uses_shared_transport_without_sensitive_grade_reason_content(delivery):
    data = delivery
    assert (await service.dispatch_notifications(data.db, [1], 7))[0] == 1
    assert data.row.status == "sent" and data.row.notification_log_id == 9
    config, context, db = data.transport.call_args.args
    assert config.receivers[0].user_ids == [55]
    assert context == {} and db is data.db
    assert "difference" not in config.model_dump_json() and "reason" not in config.model_dump_json()
    assert data.transport.call_args.kwargs == {"biz_type": "performance_comparison", "biz_id": "event"}


@pytest.mark.asyncio
async def test_dispatch_empty_claim_does_not_fall_back_to_scanning(delivery):
    assert (await service.dispatch_notifications(delivery.db, [], 7))[0] == 0
    delivery.db.get.assert_not_called()
    delivery.transport.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_cannot_send_other_run_claim(delivery):
    assert (await service.dispatch_notifications(delivery.db, [1], 8))[0] == 0
    delivery.transport.assert_not_called()


@pytest.mark.asyncio
async def test_permission_or_active_rule_retraction_skips_before_transport(delivery, monkeypatch):
    monkeypatch.setattr(service, "_still_authorized", AsyncMock(return_value=False))
    await service.dispatch_notifications(delivery.db, [1], 7)
    assert delivery.row.status == "skipped"
    delivery.transport.assert_not_called()


@pytest.mark.asyncio
async def test_clear_failure_retries_and_uncertain_transport_never_retries(delivery):
    data = delivery
    data.transport.side_effect = TimeoutError("timeout after external acceptance")
    await service.dispatch_notifications(data.db, [1], 7)
    assert data.row.status == "unknown"
    data.transport.side_effect = None
    data.transport.return_value = response("failed", 0, ["rejected"])
    data.log.result_snapshot = [{"status": "failed", "msg": "飞书接口错误: too many (code=123)"}]
    data.row.status = "dispatching"
    await service.dispatch_notifications(data.db, [1], 7)
    assert data.row.status == "retrying"
    assert data.row.next_retry_at > datetime.now(UTC) + timedelta(minutes=3)


@pytest.mark.asyncio
async def test_handler_requires_engine_owned_claim_and_keeps_empty_ids(monkeypatch):
    from app.scheduler.handlers import get_handler
    handler = get_handler("performance_comparison")
    dispatch = AsyncMock(return_value=(0, "empty"))
    monkeypatch.setattr(service, "dispatch_notifications", dispatch)
    with pytest.raises(RuntimeError, match="engine-owned claim"):
        await handler(SimpleNamespace(id=1), SimpleNamespace(info={}), "cron")
    db = SimpleNamespace(info={service.CLAIM_INFO_KEY: {"job_id": 1, "run_id": 7, "ids": []}})
    assert await handler(SimpleNamespace(id=1), db, "cron") == (0, "empty")
    dispatch.assert_awaited_once_with(db, [], 7)


class SessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, *args):
        return False


@pytest.mark.asyncio
@pytest.mark.parametrize("fail_final_commit", [False, True])
async def test_engine_owns_durable_claim_before_transport_and_preserves_unknown_window(monkeypatch, fail_final_commit):
    from app.scheduler import engine as scheduler_module
    from app.scheduler.models import JobRun, ScheduledJob
    job = SimpleNamespace(id=1, kind="performance_comparison", business_id=0, payload={})

    class Db:
        def __init__(self):
            self.info, self.runs, self.events = {}, [], []
            self.commits, self.durable_status = 0, "pending"

        async def get(self, model, identity):
            if model is ScheduledJob:
                return job
            return next((run for run in self.runs if run.id == identity), None)

        def add(self, run):
            run.id = len(self.runs) + 1
            self.runs.append(run)

        async def flush(self):
            pass

        async def refresh(self, row):
            pass

        async def commit(self):
            self.commits += 1
            self.events.append("commit")
            if self.commits == 1:
                self.durable_status = "dispatching"
            elif self.commits == 2 and fail_final_commit:
                raise RuntimeError("db disconnected after external acceptance")
            elif self.commits == 2:
                self.durable_status = "sent"

        async def rollback(self):
            self.events.append("rollback")

    db = Db()

    async def claim(session, run_id, batch_size):
        assert session is db and len(db.runs) == 1
        db.events.append("claim")
        return [99]

    async def dispatch(job, session, triggered_by):
        assert session.info[service.CLAIM_INFO_KEY] == {"job_id": 1, "run_id": 1, "ids": [99]}
        assert session.durable_status == "dispatching" and session.commits == 1
        session.events.append("transport")
        return 1, "sent"

    monkeypatch.setattr(service, "claim_notifications", claim)
    monkeypatch.setattr(scheduler_module, "get_handler", lambda kind: dispatch)
    engine = scheduler_module.SchedulerEngine(lambda: SessionContext(db))
    monkeypatch.setattr(engine, "_publish_job_events", AsyncMock())
    run = await engine.run_job_now(1, "cron")
    assert db.events[:3] == ["claim", "commit", "transport"]
    assert len(db.runs) == 1
    if fail_final_commit:
        assert run.status == "failed" and db.durable_status == "dispatching"
        assert "rollback" in db.events
    else:
        assert run.status == "success" and db.durable_status == "sent"


@pytest.mark.asyncio
async def test_internal_comparison_job_uses_short_kind_and_existing_scheduler():
    from app.scheduler.engine import SchedulerEngine
    statements = []
    db = SimpleNamespace(execute=AsyncMock(side_effect=lambda statement: statements.append(statement)), commit=AsyncMock())
    await SchedulerEngine(lambda: SessionContext(db))._ensure_internal_jobs()
    payload = next(statement.compile().params for statement in statements if statement.compile().params["kind"] == "performance_comparison")
    assert len(payload["kind"]) <= 32 and payload["business_id"] == 0 and payload["cron"] == "* * * * *"
    assert payload["payload"] == {"batch_size": 20}
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", [None, "rule_deleted", "transferred", "revoked", "rating_changed", "old_sequence", "hidden"])
async def test_send_time_revalidates_active_rule_transfer_sequence_ratings_and_visibility(monkeypatch, invalid):
    from app.performance import projects_router as routes
    source = SimpleNamespace(id=10, node_snapshot_id=3, project_id=1, cycle_ref="c", member_snapshot_id=2,
                             target_employee_no="subject", revoked_at=None, status="completed", submitted_at=datetime.now(UTC))
    recipient = SimpleNamespace(id=20, node_snapshot_id=4, project_id=1, cycle_ref="c", member_snapshot_id=2,
                                target_employee_no="subject", revoked_at=datetime.now(UTC) if invalid == "revoked" else None)
    first, second = SimpleNamespace(id=3, node_id="first"), SimpleNamespace(id=4, node_id="second")
    project = SimpleNamespace(id=1, status="STARTED", cycle_ref="c")
    row = SimpleNamespace(task_id=10, recipient_task_id=20, cycle_ref="c", rule_id="rule", recipient_ref="reviewer", event_sequence=3,
                          payload={"scope": service._scope(source, "rule"), "rating_signature": "rating", "actor_ref": "submitter"})
    db = SimpleNamespace(scalar=AsyncMock(return_value=SimpleNamespace(event_sequence=2 if invalid == "old_sequence" else 3)),
                         execute=AsyncMock(return_value=rows_result([first, second])))
    rule = {"id": "rule", "first_node_id": "first", "second_node_id": "second", "send_notification": True}
    monkeypatch.setattr(service.comparisons, "active_rules", lambda project, cycle: [] if invalid == "rule_deleted" else [rule])
    monkeypatch.setattr(routes, "_task_edit_allowed", AsyncMock(return_value=invalid != "transferred"))
    comparison = {"first_node_id": "first", "second_node_id": "second", "rating_signature": "changed" if invalid == "rating_changed" else "rating",
                  "matches": [{"first_task_id": 10, "second_task_id": 20}]}
    evaluate = AsyncMock(return_value=(comparison, None))
    monkeypatch.setattr(service.comparisons, "evaluate_task", evaluate)
    monkeypatch.setattr(service, "_recipient_comparison", lambda comparison, task, node: comparison)
    monkeypatch.setattr(service, "_recipient_projection", AsyncMock(return_value=None if invalid == "hidden" else {"matches": [1]}))
    assert await service._still_authorized(db, row, SimpleNamespace(), project, {10: source, 20: recipient}) is (invalid is None)
    if invalid is None:
        evaluate.assert_awaited_once_with(db, source, first, project, all_formal=True)
