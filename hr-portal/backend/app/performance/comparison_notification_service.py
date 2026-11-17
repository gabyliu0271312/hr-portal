"""Transactional cross-stage notification intents and scheduler delivery."""
from datetime import UTC, datetime, timedelta
import hashlib
import json

from sqlalchemy import select

from app.performance.models import (
    PerformanceComparisonNotification, PerformanceCycle, PerformanceIdentityLink,
    PerformanceNodeTask, PerformanceNotificationSetting, PerformanceProject,
    PerformanceProjectNodeSnapshot, PROJECT_STATUS_STARTED,
)
from app.performance import comparison_service as comparisons


CLAIM_INFO_KEY = "performance_comparison_claim"


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def _scope(task, rule_id):
    return _digest([task.project_id, task.member_snapshot_id, task.target_employee_no, rule_id])


def _source_comparison(comparison, task, node):
    if comparison is None:
        return None
    field = "first_task_id" if node.node_id == comparison["first_node_id"] else "second_task_id"
    return {**comparison, "matches": [match for match in comparison["matches"] if match[field] == task.id]}


def _recipient_comparison(comparison, task, node):
    from app.performance import shared_result_service as shared_results

    if shared_results.participates(task, node):
        return comparison
    return _source_comparison(comparison, task, node)


async def _recipient_projection(db, comparison, task, node, project):
    from app.performance import projects_router as routes
    from app.performance.self_summary_service import build_self_summary_schema, project_reference_content

    viewer = await routes._reference_template(task, node, project, db)
    schemas = {node.node_id: build_self_summary_schema(viewer)}
    own = _recipient_comparison(comparison, task, node)
    comparison = {**comparison, "matches": own["matches"]}
    other_id = comparison["second_node_id"] if node.node_id == comparison["first_node_id"] else comparison["first_node_id"]
    other = await db.scalar(select(PerformanceProjectNodeSnapshot).where(
        PerformanceProjectNodeSnapshot.project_id == project.id,
        PerformanceProjectNodeSnapshot.node_id == other_id,
    ))
    if other is None:
        return None
    relation = next((item for item in viewer.get("content", []) if item.get("content_slot") == "reference"
                     and item.get("reference_kind") == "node" and str(item.get("reference_value")) == other_id), None)
    if relation is not None:
        template = await routes._reference_template(None, other, project, db)
        schemas[other_id] = project_reference_content(template, relation, {})[0]
    return comparisons.project_comparison(comparison, schemas, node.node_id)


async def _recipients(db, task, node, project, comparison, actor_ref):
    from app.performance import projects_router as routes

    other_id = comparison["second_node_id"] if node.node_id == comparison["first_node_id"] else comparison["first_node_id"]
    rows = (await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot).join(
        PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id,
    ).where(
        PerformanceNodeTask.project_id == task.project_id,
        PerformanceNodeTask.cycle_ref == task.cycle_ref,
        PerformanceNodeTask.member_snapshot_id == task.member_snapshot_id,
        PerformanceNodeTask.target_employee_no == task.target_employee_no,
        PerformanceNodeTask.revoked_at.is_(None),
        PerformanceProjectNodeSnapshot.node_id == other_id,
    ).order_by(PerformanceNodeTask.id))).all()
    recipients = {}
    for recipient_task, recipient_node in rows:
        if not comparisons.ordinary_evaluation(recipient_node):
            continue
        visible = await _recipient_projection(db, _recipient_comparison(comparison, recipient_task, recipient_node), recipient_task, recipient_node, project)
        if not visible or not visible["matches"]:
            continue
        for handler in sorted(await routes._task_handlers(db, recipient_task)):
            if handler != actor_ref and handler not in recipients and await routes._task_edit_allowed(db, recipient_task, handler):
                recipients[handler] = recipient_task.id
    return recipients


async def enqueue_notifications(db, task, node, project, actor, comparison):
    if comparison is None or not comparison.get("rating_signature"):
        return 0
    project = await db.scalar(select(PerformanceProject).where(
        PerformanceProject.id == project.id,
    ).with_for_update().execution_options(populate_existing=True))
    if project is None:
        return 0
    scope = _scope(task, comparison["rule_id"])
    baseline_key = f"comparison:baseline:{scope}"
    baseline = await db.scalar(select(PerformanceComparisonNotification).where(
        PerformanceComparisonNotification.event_key == baseline_key,
    ).with_for_update().execution_options(populate_existing=True))
    signature = comparison["rating_signature"]
    if baseline is not None and baseline.payload.get("rating_signature") == signature:
        return 0
    now = datetime.now(UTC)
    sequence = (baseline.event_sequence if baseline is not None else 0) + 1
    if baseline is None:
        baseline = PerformanceComparisonNotification(
            cycle_ref=task.cycle_ref, project_id=project.id, task_id=None,
            recipient_task_id=None, recipient_ref="", rule_id=comparison["rule_id"],
            event_key=baseline_key, status="skipped", attempts=0, next_retry_at=now,
        )
        db.add(baseline)
    baseline.event_sequence = sequence
    baseline.payload = {"kind": "baseline", "scope": scope, "rating_signature": signature}
    baseline.last_error = "COMPARISON_BASELINE"
    relevant = _source_comparison(comparison, task, node)
    if not comparison.get("send_notification") or not relevant["matches"]:
        await db.flush()
        return 0
    from app.identity_switch.service import current_switch
    switched = current_switch.get() is not None
    actor_ref = str(actor.actor_ref)
    recipients = await _recipients(db, task, node, project, relevant, actor_ref)
    for recipient_ref, recipient_task_id in recipients.items():
        db.add(PerformanceComparisonNotification(
            cycle_ref=task.cycle_ref, project_id=project.id, task_id=task.id,
            recipient_task_id=recipient_task_id, recipient_ref=recipient_ref,
            rule_id=comparison["rule_id"],
            event_key=f"comparison:{scope}:{sequence}:{_digest(recipient_ref)}",
            event_sequence=sequence,
            payload={"kind": "notification", "scope": scope, "rating_signature": signature, "actor_ref": actor_ref},
            status="skipped" if switched else "pending", attempts=0, next_retry_at=now,
            last_error="IDENTITY_SWITCH_NOTIFICATION_INTERCEPTED" if switched else None,
        ))
    await db.flush()
    return len(recipients)


async def _locked_context(db, candidate, statuses):
    cycle = await db.scalar(select(PerformanceCycle).where(
        PerformanceCycle.cycle_ref == candidate.cycle_ref,
    ).with_for_update(skip_locked=True).execution_options(populate_existing=True))
    if cycle is None and await db.scalar(select(PerformanceCycle.id).where(PerformanceCycle.cycle_ref == candidate.cycle_ref)) is not None:
        return None
    project = None
    if candidate.project_id is not None:
        project = await db.scalar(select(PerformanceProject).where(
            PerformanceProject.id == candidate.project_id,
        ).with_for_update(skip_locked=True).execution_options(populate_existing=True))
        if project is None and await db.scalar(select(PerformanceProject.id).where(PerformanceProject.id == candidate.project_id)) is not None:
            return None
    task_ids = sorted({value for value in (candidate.task_id, candidate.recipient_task_id) if value is not None})
    tasks = list((await db.execute(select(PerformanceNodeTask).where(
        PerformanceNodeTask.id.in_(task_ids),
    ).order_by(PerformanceNodeTask.id).with_for_update(skip_locked=True).execution_options(populate_existing=True))).scalars().all()) if task_ids else []
    if len(tasks) != len(task_ids):
        existing_ids = list((await db.execute(select(PerformanceNodeTask.id).where(PerformanceNodeTask.id.in_(task_ids)))).scalars().all())
        if len(existing_ids) != len(tasks):
            return None
    row = await db.scalar(select(PerformanceComparisonNotification).where(
        PerformanceComparisonNotification.id == candidate.id,
        PerformanceComparisonNotification.status.in_(statuses),
    ).with_for_update(skip_locked=True).execution_options(populate_existing=True))
    return (row, cycle, project, {task.id: task for task in tasks}) if row is not None else None


async def claim_notifications(db, run_id, batch_size=20):
    now = datetime.now(UTC)
    candidates = list((await db.execute(select(PerformanceComparisonNotification).where(
        PerformanceComparisonNotification.status.in_(["pending", "retrying", "dispatching"]),
        PerformanceComparisonNotification.next_retry_at <= now,
    ).order_by(PerformanceComparisonNotification.cycle_ref, PerformanceComparisonNotification.project_id,
               PerformanceComparisonNotification.id).limit(batch_size))).scalars().all())
    claimed = []
    for candidate in candidates:
        context = await _locked_context(db, candidate, ["pending", "retrying", "dispatching"])
        if context is None:
            continue
        row, _, _, _ = context
        if row.status == "dispatching":
            row.status, row.last_error = "unknown", "COMPARISON_DELIVERY_UNCONFIRMED"
            continue
        row.status = "dispatching"
        row.attempts += 1
        row.next_retry_at = now + timedelta(minutes=15)
        row.payload = {**row.payload, "claim_run_id": run_id}
        claimed.append(row.id)
    await db.flush()
    return claimed


async def _still_authorized(db, row, cycle, project, tasks):
    from app.performance import projects_router as routes

    source, recipient = tasks.get(row.task_id), tasks.get(row.recipient_task_id)
    if cycle is None or project is None or project.status != PROJECT_STATUS_STARTED or source is None or recipient is None:
        return False
    if (project.cycle_ref != row.cycle_ref or source.project_id != project.id or recipient.project_id != project.id
            or source.cycle_ref != row.cycle_ref or recipient.cycle_ref != row.cycle_ref
            or source.member_snapshot_id != recipient.member_snapshot_id
            or source.target_employee_no != recipient.target_employee_no
            or source.revoked_at is not None or recipient.revoked_at is not None
            or source.status != "completed" or source.submitted_at is None
            or row.recipient_ref == row.payload.get("actor_ref")):
        return False
    rules = [rule for rule in comparisons.active_rules(project, cycle) if rule["id"] == row.rule_id and rule.get("send_notification")]
    if not rules or row.payload.get("scope") != _scope(source, row.rule_id):
        return False
    baseline = await db.scalar(select(PerformanceComparisonNotification).where(
        PerformanceComparisonNotification.event_key == f"comparison:baseline:{row.payload['scope']}",
    ).execution_options(populate_existing=True))
    if baseline is None or baseline.event_sequence != row.event_sequence:
        return False
    if not await routes._task_edit_allowed(db, recipient, row.recipient_ref):
        return False
    nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(
        PerformanceProjectNodeSnapshot.project_id == project.id,
        PerformanceProjectNodeSnapshot.id.in_([source.node_snapshot_id, recipient.node_snapshot_id]),
    ))).scalars().all())
    by_id = {node.id: node for node in nodes}
    source_node, recipient_node = by_id.get(source.node_snapshot_id), by_id.get(recipient.node_snapshot_id)
    if source_node is None or recipient_node is None or source_node.node_id == recipient_node.node_id:
        return False
    if {source_node.node_id, recipient_node.node_id} != {rules[0]["first_node_id"], rules[0]["second_node_id"]}:
        return False
    envelope, _ = await comparisons.evaluate_task(db, source, source_node, project, all_formal=True)
    comparison = next((group for group in comparisons._grouped(envelope) if str(group.get("rule_id")) == str(row.rule_id)), None)
    if comparison is None and envelope is not None and "groups" not in envelope and not envelope.get("rule_id"):
        comparison = envelope
    if comparison is None or comparison["rating_signature"] != row.payload.get("rating_signature"):
        return False
    relevant = _source_comparison(comparison, source, source_node)
    visible = await _recipient_projection(db, _recipient_comparison(relevant, recipient, recipient_node), recipient, recipient_node, project)
    return bool(visible and visible["matches"])


def _retry(row, error, now):
    row.status, row.last_error = "retrying", error[:1000]
    row.next_retry_at = now + timedelta(minutes=min(2 ** min(row.attempts, 10), 1440))


def _delivery_outcome(result, log):
    if result.status == "skipped":
        return "skipped", "; ".join(result.errors) or "NOTIFICATION_SKIPPED"
    snapshots = (log.result_snapshot or []) if log is not None else []
    if result.status == "success" and result.success_count > 0:
        if not snapshots:
            return "unknown", "COMPARISON_DELIVERY_UNCONFIRMED"
        if not any(item.get("message_id") for item in snapshots):
            return "skipped", "NOTIFICATION_BLOCKED"
        return "sent", None
    # The shared transport swallows timeouts as generic failed rows. Only an
    # explicit Feishu API rejection is safe to retry; all other results are unknown.
    errors = [item.get("msg", "") for item in snapshots if item.get("status") != "success"]
    if errors and all("飞书接口错误:" in error and "code=" in error for error in errors):
        return "retrying", "; ".join(errors)
    return "unknown", "; ".join(result.errors) or "COMPARISON_DELIVERY_UNCONFIRMED"


async def dispatch_notifications(db, claimed_ids, run_id):
    from app.core.config import settings
    from app.integrations.feishu.models import FeishuNotificationLog
    from app.integrations.feishu.notification_service import send_notification
    from app.integrations.feishu.schemas import CardButtonConfig, FixedUsersRule, MessageConfig, NotificationConfig
    from app.users.models import User

    processed = 0
    for notification_id in claimed_ids:
        candidate = await db.get(PerformanceComparisonNotification, notification_id, populate_existing=True)
        if candidate is None or candidate.payload.get("claim_run_id") != run_id:
            continue
        context = await _locked_context(db, candidate, ["dispatching"])
        if context is None:
            continue
        row, cycle, project, tasks = context
        if row.payload.get("claim_run_id") != run_id:
            continue
        processed += 1
        notification_settings = await db.get(PerformanceNotificationSetting, 1, populate_existing=True)
        if (notification_settings is not None and not notification_settings.feishu_push_enabled
                or not await _still_authorized(db, row, cycle, project, tasks)):
            row.status, row.last_error = "skipped", "COMPARISON_NO_LONGER_AUTHORIZED"
            continue
        user = await db.scalar(select(User).join(PerformanceIdentityLink, PerformanceIdentityLink.portal_user_id == User.id).where(
            PerformanceIdentityLink.employee_no == row.recipient_ref,
            PerformanceIdentityLink.is_active.is_(True), User.is_active.is_(True),
        ))
        now = datetime.now(UTC)
        if user is None or not user.feishu_user_id:
            _retry(row, "TASK_HANDLER_IDENTITY_NOT_FOUND", now)
            continue
        url = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/performance/review/template-task?task_id={row.recipient_task_id}&project_id={row.project_id}"
        try:
            result = await send_notification(NotificationConfig(
                receivers=[FixedUsersRule(type="fixed_users", user_ids=[user.id])],
                message=MessageConfig(title_template="绩效评估差异提醒", content_template="相关环节的正式评估结果存在差异，请进入绩效任务查看授权内容。"),
                card_button=CardButtonConfig(enabled=bool(settings.PUBLIC_BASE_URL), text="查看评估", url=url),
            ), {}, db, biz_type="performance_comparison", biz_id=row.event_key)
            row.notification_log_id = result.log_id
            log = await db.get(FeishuNotificationLog, result.log_id) if result.log_id is not None else None
            outcome, error = _delivery_outcome(result, log)
            if outcome == "retrying":
                _retry(row, error, now)
            else:
                row.status, row.last_error = outcome, error
                row.sent_at = now if outcome == "sent" else None
        except Exception:
            row.status, row.last_error = "unknown", "COMPARISON_DELIVERY_UNCONFIRMED"
    await db.flush()
    return processed, f"performance comparison notifications processed: {processed}"
