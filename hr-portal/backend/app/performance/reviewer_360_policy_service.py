"""Cycle 360 configuration and request-scoped result disclosure policy."""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, model_validator
from sqlalchemy import func, select

from app.data.employee_roster_contract import organization_leaf
from app.performance.assessment_roles import ROLE_REVIEWER_360, node_role_code
from app.performance.models import (
    PerformanceAuditEvent, PerformanceAuthorizationSnapshotPerson, PerformanceCycle, PerformanceNodeTask,
    PerformanceProject, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot,
)


class Anonymous360Config(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enable: StrictBool = False
    anonymous_object: Literal["", "all", "reviewee"] = ""
    anonymous_low_limit: Annotated[StrictInt, Field(ge=0, le=99)] = 0
    reviewer_tag_visibility_mode: Literal["visibleOverLowLimit", "notVisible"] = "visibleOverLowLimit"

    @model_validator(mode="after")
    def require_object(self):
        if self.enable and not self.anonymous_object:
            raise ValueError("开启360°匿名评估后必须选择匿名范围")
        return self


class InvitationOutOfRangeTipsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enable: StrictBool = False
    range_count: Annotated[StrictInt, Field(ge=0, le=99)] = 0
    tips: dict[Literal["zh-CN", "en-US"], StrictStr] = Field(default_factory=lambda: {"zh-CN": "", "en-US": ""})

    @model_validator(mode="after")
    def trim_tips(self):
        self.tips = {language: text.strip() for language, text in self.tips.items()}
        if any(len(text) > 5000 for text in self.tips.values()):
            raise ValueError("提示内容最多5000字")
        return self


def anonymous_360_snapshot(cycle):
    config = Anonymous360Config.model_validate(getattr(cycle, "anonymous_360_config", None) or {}).model_dump()
    return {"version": 1, "config": config}


def validate_cycle_360_configs(payload, language="zh-CN"):
    if "anonymous_360_config" in payload:
        payload["anonymous_360_config"] = Anonymous360Config.model_validate(payload["anonymous_360_config"]).model_dump()
    if "invitation_out_of_range_tips_config" in payload:
        config = InvitationOutOfRangeTipsConfig.model_validate(payload["invitation_out_of_range_tips_config"])
        if config.enable and not config.tips.get(language or "zh-CN", "").strip():
            raise ValueError("开启邀请提示后必须填写周期语言的提示内容")
        payload["invitation_out_of_range_tips_config"] = config.model_dump()
    return payload


def _node_template(node):
    config = node if isinstance(node, dict) else (node.config or {})
    return config.get("template") or config


def _descriptions(task, people, employee_no, event=None):
    from app.performance.projects_router import _reviewer_360_relationship, _reviewer_360_source
    person = people.get(task.handler_ref)
    return {
        "relationship": _reviewer_360_relationship(employee_no, task.handler_ref, people),
        "department": organization_leaf(person) if person is not None else None,
        "source_label": _reviewer_360_source(task, event, employee_no, people),
    }


def reviewer_360_visibility(project, employee_no, node, tasks, viewer_ref, submitted_tasks, people, sources=None):
    result = {"visibility": "named", "tasks": list(tasks), "description_allowed": {}, "description_values": {}}
    snapshot = (project.settings or {}).get("anonymous_360_snapshot")
    if node_role_code(_node_template(node)) != ROLE_REVIEWER_360 or not isinstance(snapshot, dict):
        return result
    config = snapshot.get("config") or {}
    if not config.get("enable") or (config.get("anonymous_object") == "reviewee" and viewer_ref != employee_no):
        return result
    submitted = [task for task in submitted_tasks if task.status == "completed" and task.submitted_at is not None and getattr(task, "revoked_at", None) is None]
    low = config.get("anonymous_low_limit", 0)
    meets_limit = len({task.handler_ref for task in submitted}) >= low
    allowed_ids = {task.id for task in submitted if meets_limit or getattr(task, "source_type", None) == "VOLUNTARY"}
    visible_tasks = [task for task in tasks if task.id in allowed_ids]
    values = {task.id: _descriptions(task, people, employee_no, (sources or {}).get(task.id)) for task in submitted}
    groups = {key: {} for key in ("relationship", "department", "source_label")}
    for task in submitted:
        for key, value in values[task.id].items():
            if value:
                groups[key].setdefault(value, set()).add(task.handler_ref)
    descriptions = {
        task.id: {key: config.get("reviewer_tag_visibility_mode") != "notVisible" and bool(value) and len(groups[key].get(value, set())) >= low for key, value in values[task.id].items()}
        for task in visible_tasks
    }
    return {"visibility": "anonymous" if visible_tasks or meets_limit else "hidden", "detail_mode": "all" if meets_limit else "voluntary_only" if visible_tasks else "hidden", "tasks": visible_tasks, "description_allowed": descriptions, "description_values": {task.id: values[task.id] for task in visible_tasks}}


async def project_reviewer_360_visibility(project, snapshot_id, employee_no, node, tasks, viewer_ref, db):
    snapshot = (project.settings or {}).get("anonymous_360_snapshot")
    if node_role_code(_node_template(node)) != ROLE_REVIEWER_360 or not isinstance(snapshot, dict) or not (snapshot.get("config") or {}).get("enable"):
        return {"visibility": "named", "tasks": list(tasks), "description_allowed": {}, "description_values": {}}
    if (snapshot.get("config") or {}).get("anonymous_object") == "reviewee" and viewer_ref != employee_no:
        return {"visibility": "named", "tasks": list(tasks), "description_allowed": {}, "description_values": {}}
    submitted = list((await db.execute(select(PerformanceNodeTask).where(
        PerformanceNodeTask.project_id == project.id,
        PerformanceNodeTask.cycle_ref == project.cycle_ref,
        PerformanceNodeTask.member_snapshot_id == snapshot_id,
        PerformanceNodeTask.node_snapshot_id == node.id,
        PerformanceNodeTask.target_employee_no == employee_no,
        PerformanceNodeTask.task_kind == "evaluation",
        PerformanceNodeTask.status == "completed",
        PerformanceNodeTask.submitted_at.is_not(None),
        PerformanceNodeTask.revoked_at.is_(None),
    ))).scalars().all())
    source_snapshot = select(PerformanceProjectMemberSnapshot.source_snapshot_id).where(
        PerformanceProjectMemberSnapshot.id == snapshot_id,
        PerformanceProjectMemberSnapshot.project_id == project.id,
        PerformanceProjectMemberSnapshot.cycle_ref == project.cycle_ref,
    ).scalar_subquery()
    people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).where(PerformanceAuthorizationSnapshotPerson.snapshot_id == source_snapshot))).scalars().all())
    sources = {}
    if submitted:
        events = list((await db.execute(select(PerformanceAuditEvent).where(
            PerformanceAuditEvent.cycle_ref == project.cycle_ref,
            PerformanceAuditEvent.employee_no == employee_no,
            PerformanceAuditEvent.subject_ref.in_([task.handler_ref for task in submitted]),
            PerformanceAuditEvent.event_type.in_(["REVIEWER_360_INVITED", "REVIEWER_360_VOLUNTEERED", "REVIEWER_360_REVOKED", "REVIEWER_360_VOLUNTARY_GIVEUP"]),
        ).order_by(PerformanceAuditEvent.event_at, PerformanceAuditEvent.id))).scalars().all())
        by_reviewer = {task.handler_ref: task for task in submitted}
        for event in events:
            after = event.after_state or {}
            task = by_reviewer.get(str(event.subject_ref))
            if task is None or str(after.get("project_id")) != str(project.id) or after.get("node_id") != node.node_id:
                continue
            if after.get("task_id") is not None and str(after["task_id"]) != str(task.id):
                continue
            if after.get("member_snapshot_id") is not None and str(after["member_snapshot_id"]) != str(snapshot_id):
                continue
            sources[task.id] = event
    return reviewer_360_visibility(project, employee_no, node, tasks, viewer_ref, submitted, {person.employee_no: person for person in people}, sources)


async def reviewer_360_invitation_tip(db, project, viewer_ref):
    cycle = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == project.cycle_ref))
    if cycle is None:
        return None
    config = getattr(cycle, "invitation_out_of_range_tips_config", None) or {}
    if not config.get("enable"):
        return None
    latest = select(PerformanceProjectMemberSnapshot.project_id, func.max(PerformanceProjectMemberSnapshot.snapshot_version).label("version")).group_by(PerformanceProjectMemberSnapshot.project_id).subquery()
    rows = (await db.execute(select(PerformanceNodeTask.project_id, PerformanceNodeTask.node_snapshot_id, PerformanceNodeTask.target_employee_no, PerformanceProjectNodeSnapshot.config)
        .join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id)
        .join(PerformanceProjectNodeSnapshot, (PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id) & (PerformanceProjectNodeSnapshot.project_id == PerformanceNodeTask.project_id))
        .join(PerformanceProjectMemberSnapshot, (PerformanceProjectMemberSnapshot.id == PerformanceNodeTask.member_snapshot_id) & (PerformanceProjectMemberSnapshot.project_id == PerformanceNodeTask.project_id))
        .join(latest, (latest.c.project_id == PerformanceProjectMemberSnapshot.project_id) & (latest.c.version == PerformanceProjectMemberSnapshot.snapshot_version))
        .where(PerformanceProject.cycle_ref == project.cycle_ref, PerformanceNodeTask.handler_ref == viewer_ref,
               PerformanceNodeTask.task_kind == "evaluation", PerformanceNodeTask.revoked_at.is_(None),
               (PerformanceNodeTask.source_type.is_(None) | (PerformanceNodeTask.source_type != "VOLUNTARY")),
               PerformanceProjectNodeSnapshot.node_type == "evaluation"))).all()
    count = len({(row[0], row[1], row[2]) for row in rows if node_role_code(_node_template(row[3] or {})) == ROLE_REVIEWER_360})
    threshold = config.get("range_count", 0)
    tips = config.get("tips") or {}
    text = tips.get(getattr(cycle, "language", None) or "zh-CN") or tips.get("zh-CN") or ""
    return {"count": count, "threshold": threshold, "text": text} if count > threshold and text.strip() else None
