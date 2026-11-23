"""Visibility, images and durable acknowledgements for workbench announcements."""
from __future__ import annotations

from io import BytesIO
from urllib.parse import urlsplit
import warnings

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert

from app.performance.auth_context import resolve_trusted_performance_actor
from app.performance.models import (
    PerformanceAnnouncementAcknowledgement,
    PerformanceAnnouncementImage,
    PerformanceCycle,
    PerformanceNodeTask,
    PerformanceProject,
    PerformanceProjectMember,
    PerformanceProjectMemberSnapshot,
    PerformanceWorkbenchAnnouncement,
    PerformanceWorkbenchSetting,
)

MAX_IMAGE_BYTES = 10 * 1024 * 1024


def validate_announcement_link(value):
    value = value.strip()
    if not value:
        return value
    if "\\" in value or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("INVALID_ANNOUNCEMENT_LINK")
    parsed = urlsplit(value)
    if parsed.scheme:
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc or not parsed.hostname:
            raise ValueError("INVALID_ANNOUNCEMENT_LINK")
    elif parsed.netloc or value.startswith("//"):
        raise ValueError("INVALID_ANNOUNCEMENT_LINK")
    return value


def validate_announcement_image(content):
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "ANNOUNCEMENT_IMAGE_TOO_LARGE")
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:
        raise HTTPException(503, "ANNOUNCEMENT_IMAGE_VALIDATOR_UNAVAILABLE") from None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                image_format = image.format
                if image_format not in {"PNG", "JPEG"}:
                    raise ValueError("unsupported image")
                image.verify()
            with Image.open(BytesIO(content)) as image:
                image.load()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, "INVALID_ANNOUNCEMENT_IMAGE") from None
    return {"PNG": "image/png", "JPEG": "image/jpeg"}[image_format]


async def resolve_cycle_ref(db, cycle_ref=None, cycle_id=None):
    if cycle_ref is None and cycle_id is None:
        return None
    conditions = []
    if cycle_ref is not None:
        conditions.append(PerformanceCycle.cycle_ref == cycle_ref)
    if cycle_id is not None:
        conditions.append(PerformanceCycle.id == cycle_id)
    cycle = await db.scalar(select(PerformanceCycle).where(*conditions))
    if cycle is None:
        raise HTTPException(404, "CYCLE_NOT_FOUND")
    return cycle.cycle_ref


async def employee_identity(db, context, cycle_ref=None):
    actor = await resolve_trusted_performance_actor(db, context, cycle_ref=cycle_ref)
    return actor.actor_ref if actor.actor_type == "EMPLOYEE" else None


def actual_member_numbers(snapshot, members, task_numbers, evaluated_count):
    source = snapshot.source_filter or {}
    declared = source.get("task_generation_employee_nos")
    if "task_generation_employee_nos" in source and (not isinstance(declared, list) or any(not isinstance(item, str) for item in declared)):
        raise HTTPException(409, "ANNOUNCEMENT_MEMBER_SCOPE_UNRESOLVED")
    numbers = set(declared or []) | set(task_numbers)
    if numbers - {member.employee_no for member in members} or (
        "task_generation_employee_nos" not in source and len(numbers) != evaluated_count
    ):
        raise HTTPException(409, "ANNOUNCEMENT_MEMBER_SCOPE_UNRESOLVED")
    return numbers


async def audience_roles(db, employee_no, cycle_ref=None):
    if employee_no is None:
        return set()
    latest = select(
        PerformanceProjectMemberSnapshot.project_id,
        func.max(PerformanceProjectMemberSnapshot.id).label("snapshot_id"),
    ).group_by(PerformanceProjectMemberSnapshot.project_id).subquery()
    statement = select(PerformanceProjectMemberSnapshot, PerformanceProject.evaluated_count).join(
        latest, latest.c.snapshot_id == PerformanceProjectMemberSnapshot.id,
    ).join(PerformanceProject, PerformanceProject.id == PerformanceProjectMemberSnapshot.project_id).where(
        PerformanceProjectMemberSnapshot.cycle_ref == PerformanceProject.cycle_ref,
    )
    if cycle_ref is not None:
        statement = statement.where(PerformanceProject.cycle_ref == cycle_ref)
    snapshots = (await db.execute(statement)).all()
    if not snapshots:
        return set()
    snapshot_ids = [snapshot.id for snapshot, _ in snapshots]
    members = (await db.execute(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id.in_(snapshot_ids),
    ))).scalars().all()
    tasks = (await db.execute(select(
        PerformanceNodeTask.member_snapshot_id, PerformanceNodeTask.target_employee_no,
    ).join(PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.id == PerformanceNodeTask.member_snapshot_id).where(
        PerformanceNodeTask.member_snapshot_id.in_(snapshot_ids),
        PerformanceNodeTask.project_id == PerformanceProjectMemberSnapshot.project_id,
        PerformanceNodeTask.cycle_ref == PerformanceProjectMemberSnapshot.cycle_ref,
        PerformanceNodeTask.revoked_at.is_(None),
    ).distinct())).all()
    roles = set()
    for snapshot, count in snapshots:
        current = [member for member in members if member.snapshot_id == snapshot.id]
        actual = actual_member_numbers(snapshot, current, [number for sid, number in tasks if sid == snapshot.id], count)
        for member in current:
            if member.employee_no not in actual:
                continue
            if member.hrbp_employee_no == employee_no:
                roles.add("HRBP")
            if member.direct_supervisor_employee_no == employee_no:
                roles.add("REAL_LINE_MANAGER")
    return roles


def announcement_visible(item, cycle_ref, roles):
    return (
        item.status == "active"
        and (item.cycle_ref is None or item.cycle_ref == cycle_ref)
        and (item.visibility == "所有人" or (
            item.visibility == "指定角色" and bool(set(item.visibility_roles) & roles)
        ))
    )


async def visible_announcements(db, context, cycle_ref, *, image_id=None):
    conditions = [PerformanceWorkbenchAnnouncement.status == "active"]
    conditions.append(or_(PerformanceWorkbenchAnnouncement.cycle_ref.is_(None), PerformanceWorkbenchAnnouncement.cycle_ref == cycle_ref))
    if image_id is not None:
        conditions.append(or_(PerformanceWorkbenchAnnouncement.image_id == image_id, PerformanceWorkbenchAnnouncement.image_en_id == image_id))
    items = (await db.execute(select(PerformanceWorkbenchAnnouncement).where(*conditions).order_by(
        PerformanceWorkbenchAnnouncement.display_order, PerformanceWorkbenchAnnouncement.id,
    ))).scalars().all()
    employee_no = await employee_identity(db, context, cycle_ref) if items and (cycle_ref is not None or any(item.visibility == "指定角色" for item in items)) else None
    roles = await audience_roles(db, employee_no, cycle_ref) if any(item.visibility == "指定角色" for item in items) else set()
    return [item for item in items if announcement_visible(item, cycle_ref, roles)], employee_no


async def validate_announcement_references(db, values):
    if values.get("cycle_ref") is not None:
        await resolve_cycle_ref(db, values["cycle_ref"])
    for key in ("image_id", "image_en_id"):
        image_id = values.get(key)
        if image_id is not None and await db.get(PerformanceAnnouncementImage, image_id) is None:
            raise HTTPException(422, "ANNOUNCEMENT_IMAGE_NOT_FOUND")


async def acknowledge_announcement(db, context, announcement_id, cycle_ref):
    cycle_ref = await resolve_cycle_ref(db, cycle_ref)
    if cycle_ref is None:
        raise HTTPException(422, "ANNOUNCEMENT_CYCLE_REQUIRED")
    setting = await db.scalar(select(PerformanceWorkbenchSetting).where(PerformanceWorkbenchSetting.id == 1).with_for_update())
    item = await db.scalar(select(PerformanceWorkbenchAnnouncement).where(
        PerformanceWorkbenchAnnouncement.id == announcement_id,
    ).with_for_update().execution_options(populate_existing=True))
    if item is None:
        raise HTTPException(404, "ANNOUNCEMENT_NOT_FOUND")
    employee_no = await employee_identity(db, context, cycle_ref)
    if employee_no is None:
        raise HTTPException(403, "ANNOUNCEMENT_EMPLOYEE_REQUIRED")
    roles = await audience_roles(db, employee_no, cycle_ref) if item.visibility == "指定角色" else set()
    visible_scope = item.visibility == "所有人" or (item.visibility == "指定角色" and bool(set(item.visibility_roles) & roles))
    if item.cycle_ref not in (None, cycle_ref) or not visible_scope:
        raise HTTPException(404, "ANNOUNCEMENT_NOT_FOUND")
    if (setting is not None and not setting.announcement_enabled) or item.status != "active" or not item.require_ack:
        raise HTTPException(409, "ANNOUNCEMENT_ACK_NOT_REQUIRED")
    await db.execute(insert(PerformanceAnnouncementAcknowledgement).values(
        announcement_id=item.id, employee_no=employee_no, cycle_ref=cycle_ref,
    ).on_conflict_do_nothing(constraint="uq_performance_announcement_ack"))
    await db.commit()
    return {"acknowledged": True}
