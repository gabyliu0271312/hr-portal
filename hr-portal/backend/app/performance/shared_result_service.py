"""Shared formal result state. Call mutations only under the project lock."""
from copy import deepcopy
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.performance.models import PerformanceProjectMember
from app.performance.self_summary_service import project_self_summary_answers


def participates(task, node):
    kind = getattr(task, "task_kind", None)
    return kind == "calibration" or (kind == "evaluation" and bool(((node.config or {}).get("template") or {}).get("include_final_result")))


async def member_for_task(db, task):
    statement = select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == task.member_snapshot_id,
        PerformanceProjectMember.employee_no == task.target_employee_no,
    ).with_for_update().execution_options(populate_existing=True)
    return await db.scalar(statement)


def private_draft(task, actor_ref):
    drafts = getattr(task, "actor_drafts", None) or {}
    entry = drafts.get(str(actor_ref))
    if entry is not None:
        return deepcopy(entry)
    legacy = getattr(task, "draft_answers", None)
    if legacy is not None and str(actor_ref) == str(task.handler_ref):
        return {"answers": deepcopy(legacy), "base_result_version": 0}
    return None


def set_private_draft(task, actor_ref, answers, base_version):
    drafts = deepcopy(getattr(task, "actor_drafts", None) or {})
    key = str(actor_ref)
    if answers is None:
        drafts.pop(key, None)
    else:
        drafts[key] = {"answers": deepcopy(answers), "base_result_version": base_version}
    task.actor_drafts = drafts or None
    if str(actor_ref) == str(task.handler_ref):
        task.draft_answers = None


def require_revision(expected, revision):
    if expected is None:
        raise HTTPException(409, "RESULT_VERSION_REQUIRED")
    if expected != revision:
        raise HTTPException(409, "SHARED_RESULT_VERSION_CONFLICT")


def bootstrap(result, checkpoints=None):
    source = result.get("source_task")
    return {"revision": 0, "answers": deepcopy(result["answers"]),
            "source_task_id": source.id if source else None,
            "source_kind": result.get("source_kind"),
            "calibrated": bool(result.get("calibrated")),
            "checkpoints": deepcopy(checkpoints or {})}


def merge_writable(schema, baseline, incoming):
    projected = project_self_summary_answers(schema, incoming)
    for section in schema:
        for field in section.get("fields") or []:
            if not field.get("readonly") and field["id"] in incoming and incoming[field["id"]] in (None, ""):
                projected[field["id"]] = incoming[field["id"]]
    return {**deepcopy(baseline), **deepcopy(projected)}


def submit_result(member, task, node, schema, incoming, actor, state):
    state = deepcopy(state)
    state["answers"] = merge_writable(schema, state["answers"], incoming)
    state["revision"] += 1
    state.update(source_task_id=task.id, source_kind=task.task_kind,
                 source_actor_type=actor.actor_type, source_actor_ref=str(actor.actor_ref),
                 submitted_at=datetime.now(UTC).isoformat(),
                 calibrated=state.get("calibrated", False) or task.task_kind == "calibration")
    member.shared_result_state = state
    return state
