"""Performance workbench settings API."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    get_performance_access_context,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import (
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceWorkbenchAnnouncement,
    PerformanceWorkbenchEntry,
    PerformanceWorkbenchSetting,
    SUBJECT_TYPE_SYSTEM_ACCOUNT,
)

router = APIRouter(prefix="/performance/workbench-settings", tags=["performance-workbench-settings"])
consumer_router = APIRouter(prefix="/performance/workbench", tags=["performance-workbench"])

STATUS_VALUES = ("active", "inactive")
WorkbenchItem = TypeVar("WorkbenchItem", PerformanceWorkbenchEntry, PerformanceWorkbenchAnnouncement)


class WorkbenchSettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    announcement_enabled: bool


class WorkbenchSettingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    announcement_enabled: bool


class WorkbenchEntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=128)
    link: str = Field(..., min_length=1, max_length=2048)
    icon: str | None = Field(default=None, max_length=128)
    visibility: str = Field(default="所有人", min_length=1, max_length=128)
    status: Literal["active", "inactive"] = "active"
    display_order: int = Field(default=0, ge=0)

    @field_validator("title", "link", "visibility")
    @classmethod
    def trim_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("字段不能为空")
        return value

    @field_validator("icon")
    @classmethod
    def trim_optional(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class WorkbenchEntryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=128)
    link: str | None = Field(default=None, min_length=1, max_length=2048)
    icon: str | None = Field(default=None, max_length=128)
    visibility: str | None = Field(default=None, min_length=1, max_length=128)
    status: Literal["active", "inactive"] | None = None
    display_order: int | None = Field(default=None, ge=0)

    @field_validator("title", "link", "visibility")
    @classmethod
    def trim_patch_required(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("字段不能为空")
        return value

    @field_validator("icon")
    @classmethod
    def trim_patch_optional(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class WorkbenchAnnouncementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=128)
    link: str = Field(..., min_length=1, max_length=2048)
    cycle_label: str = Field(default="所有周期", min_length=1, max_length=128)
    cycle_ref: str | None = Field(default=None, max_length=64)
    visibility: str = Field(default="所有人", min_length=1, max_length=128)
    visibility_role: Literal["HRBP", "REAL_LINE_MANAGER"] | None = None
    require_ack: bool = False
    status: Literal["active", "inactive"] = "active"
    display_order: int = Field(default=0, ge=0)

    @field_validator("title", "link", "cycle_label", "visibility")
    @classmethod
    def trim_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("字段不能为空")
        return value


class WorkbenchAnnouncementPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=128)
    link: str | None = Field(default=None, min_length=1, max_length=2048)
    cycle_label: str | None = Field(default=None, min_length=1, max_length=128)
    cycle_ref: str | None = Field(default=None, max_length=64)
    visibility: str | None = Field(default=None, min_length=1, max_length=128)
    visibility_role: Literal["HRBP", "REAL_LINE_MANAGER"] | None = None
    require_ack: bool | None = None
    status: Literal["active", "inactive"] | None = None
    display_order: int | None = Field(default=None, ge=0)

    @field_validator("title", "link", "cycle_label", "visibility")
    @classmethod
    def trim_patch_required(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("字段不能为空")
        return value


class WorkbenchStatusPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["active", "inactive"]


class WorkbenchEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    link: str
    icon: str | None
    visibility: str
    display_order: int
    created_at: datetime
    updated_at: datetime


class WorkbenchAnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    link: str
    cycle_label: str
    cycle_ref: str | None
    visibility: str
    visibility_role: str | None
    require_ack: bool
    display_order: int
    created_at: datetime
    updated_at: datetime


class WorkbenchEntryPage(BaseModel):
    items: list[WorkbenchEntryOut]
    total: int
    page: int
    page_size: int


class WorkbenchAnnouncementPage(BaseModel):
    items: list[WorkbenchAnnouncementOut]
    total: int
    page: int
    page_size: int


class WorkbenchAnnouncementFeedItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    link: str
    cycle_label: str
    require_ack: bool
    display_order: int
    updated_at: datetime


class WorkbenchAnnouncementFeedOut(BaseModel):
    announcement_enabled: bool
    items: list[WorkbenchAnnouncementFeedItem]


class WorkbenchSettingsOut(BaseModel):
    announcement_enabled: bool


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
) -> PerformanceAccessContext:
    return context


async def _audit(
    db: AsyncSession,
    context: PerformanceAccessContext,
    event_type: str,
    subject_type: str,
    subject_ref: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    actor = await resolve_trusted_performance_actor(db, context)
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type=event_type,
            actor_type=actor.actor_type,
            actor_ref=actor.actor_ref,
            subject_type=subject_type,
            subject_ref=subject_ref,
            before_state=before or {},
            after_state=after or {},
        )
    )


async def _get_or_create_setting(db: AsyncSession, context: PerformanceAccessContext) -> PerformanceWorkbenchSetting:
    setting = await db.get(PerformanceWorkbenchSetting, 1)
    if setting is None:
        actor = await resolve_trusted_performance_actor(db, context)
        setting = PerformanceWorkbenchSetting(id=1, announcement_enabled=True, updated_by_type=actor.actor_type, updated_by_ref=actor.actor_ref)
        db.add(setting)
        await db.flush()
    return setting


@consumer_router.get("/announcements", response_model=WorkbenchAnnouncementFeedOut)
async def get_workbench_announcement_feed(
    cycle_ref: str | None = Query(default=None, max_length=64),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchAnnouncementFeedOut:
    setting = await db.get(PerformanceWorkbenchSetting, 1)
    if setting is not None and not setting.announcement_enabled:
        return WorkbenchAnnouncementFeedOut(announcement_enabled=False, items=[])

    conditions = [PerformanceWorkbenchAnnouncement.status == "active"]
    if cycle_ref:
        conditions.append(
            or_(
                PerformanceWorkbenchAnnouncement.cycle_ref.is_(None),
                PerformanceWorkbenchAnnouncement.cycle_ref == cycle_ref,
            )
        )
    else:
        conditions.append(PerformanceWorkbenchAnnouncement.cycle_ref.is_(None))

    visibility_conditions = [PerformanceWorkbenchAnnouncement.visibility == "所有人"]
    if cycle_ref:
        actor = await resolve_trusted_performance_actor(db, context, cycle_ref=cycle_ref)
        if actor.actor_type == SUBJECT_TYPE_SYSTEM_ACCOUNT:
            visibility_conditions.extend([
                and_(
                    PerformanceWorkbenchAnnouncement.visibility == "指定人员",
                    PerformanceWorkbenchAnnouncement.visibility_role == "HRBP",
                ),
                and_(
                    PerformanceWorkbenchAnnouncement.visibility == "指定人员",
                    PerformanceWorkbenchAnnouncement.visibility_role == "REAL_LINE_MANAGER",
                ),
            ])
        else:
            snapshot_id = select(PerformanceAuthorizationSnapshot.id).where(
                PerformanceAuthorizationSnapshot.cycle_ref == cycle_ref,
            )
            hrbp_exists = select(PerformanceAuthorizationSnapshotPerson.id).where(
                PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot_id.scalar_subquery(),
                PerformanceAuthorizationSnapshotPerson.hrbp_employee_no == actor.actor_ref,
            ).exists()
            manager_exists = select(PerformanceAuthorizationSnapshotPerson.id).where(
                PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot_id.scalar_subquery(),
                PerformanceAuthorizationSnapshotPerson.direct_supervisor_employee_no == actor.actor_ref,
            ).exists()
            visibility_conditions.extend([
                and_(
                    PerformanceWorkbenchAnnouncement.visibility == "指定人员",
                    PerformanceWorkbenchAnnouncement.visibility_role == "HRBP",
                    hrbp_exists,
                ),
                and_(
                    PerformanceWorkbenchAnnouncement.visibility == "指定人员",
                    PerformanceWorkbenchAnnouncement.visibility_role == "REAL_LINE_MANAGER",
                    manager_exists,
                ),
            ])
    conditions.append(or_(*visibility_conditions))
    items = (
        await db.execute(
            select(PerformanceWorkbenchAnnouncement)
            .where(*conditions)
            .order_by(PerformanceWorkbenchAnnouncement.display_order, PerformanceWorkbenchAnnouncement.id)
        )
    ).scalars().all()
    return WorkbenchAnnouncementFeedOut(
        announcement_enabled=True,
        items=[WorkbenchAnnouncementFeedItem.model_validate(item) for item in items],
    )


@router.get("", response_model=WorkbenchSettingsOut)
async def get_workbench_settings(
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchSettingsOut:
    setting = await db.get(PerformanceWorkbenchSetting, 1)
    return WorkbenchSettingsOut(announcement_enabled=setting.announcement_enabled if setting else True)


@router.patch("", response_model=WorkbenchSettingsOut)
async def update_workbench_settings(
    payload: WorkbenchSettingPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchSettingsOut:
    setting = await _get_or_create_setting(db, context)
    before = {"announcement_enabled": setting.announcement_enabled}
    setting.announcement_enabled = payload.announcement_enabled
    actor = await resolve_trusted_performance_actor(db, context)
    setting.updated_by_type = actor.actor_type
    setting.updated_by_ref = actor.actor_ref
    await _audit(db, context, "PERFORMANCE_WORKBENCH_SETTING_UPDATED", "WORKBENCH_SETTINGS", "1", before, {"announcement_enabled": setting.announcement_enabled})
    await db.commit()
    return WorkbenchSettingsOut(announcement_enabled=setting.announcement_enabled)


@router.get("/entries", response_model=WorkbenchEntryPage)
async def list_workbench_entries(
    keyword: str | None = Query(default=None, max_length=128),
    status_filter: Literal["active", "inactive"] | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchEntryPage:
    conditions = []
    if keyword and keyword.strip():
        conditions.append(PerformanceWorkbenchEntry.title.ilike(f"%{keyword.strip()}%"))
    if status_filter:
        conditions.append(PerformanceWorkbenchEntry.status == status_filter)
    total = await db.scalar(select(func.count(PerformanceWorkbenchEntry.id)).where(*conditions)) or 0
    items = (await db.execute(select(PerformanceWorkbenchEntry).where(*conditions).order_by(PerformanceWorkbenchEntry.display_order, PerformanceWorkbenchEntry.id).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return WorkbenchEntryPage(items=[WorkbenchEntryOut.model_validate(item) for item in items], total=total, page=page, page_size=page_size)


@router.post("/entries", response_model=WorkbenchEntryOut, status_code=status.HTTP_201_CREATED)
async def create_workbench_entry(
    payload: WorkbenchEntryCreate,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchEntryOut:
    actor = await resolve_trusted_performance_actor(db, context)
    item = PerformanceWorkbenchEntry(**payload.model_dump(), created_by_type=actor.actor_type, created_by_ref=actor.actor_ref)
    db.add(item)
    await db.flush()
    await _audit(db, context, "PERFORMANCE_WORKBENCH_ENTRY_CREATED", "WORKBENCH_ENTRY", str(item.id), after=payload.model_dump())
    await db.commit()
    await db.refresh(item)
    return WorkbenchEntryOut.model_validate(item)


async def _entry_or_404(db: AsyncSession, item_id: int) -> PerformanceWorkbenchEntry:
    item = await db.get(PerformanceWorkbenchEntry, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="WORKBENCH_SETTING_NOT_FOUND")
    return item


@router.patch("/entries/{item_id}", response_model=WorkbenchEntryOut)
async def update_workbench_entry(
    item_id: int,
    payload: WorkbenchEntryPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchEntryOut:
    item = await _entry_or_404(db, item_id)
    before = {key: getattr(item, key) for key in payload.model_dump(exclude_unset=True)}
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await _audit(db, context, "PERFORMANCE_WORKBENCH_ENTRY_UPDATED", "WORKBENCH_ENTRY", str(item.id), before, payload.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(item)
    return WorkbenchEntryOut.model_validate(item)


@router.post("/entries/{item_id}/status", response_model=WorkbenchEntryOut)
async def update_workbench_entry_status(
    item_id: int,
    payload: WorkbenchStatusPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchEntryOut:
    item = await _entry_or_404(db, item_id)
    before = {"status": item.status}
    item.status = payload.status
    await _audit(db, context, "PERFORMANCE_WORKBENCH_ENTRY_STATUS_UPDATED", "WORKBENCH_ENTRY", str(item.id), before, {"status": item.status})
    await db.commit()
    await db.refresh(item)
    return WorkbenchEntryOut.model_validate(item)


@router.delete("/entries/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workbench_entry(
    item_id: int,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> Response:
    item = await _entry_or_404(db, item_id)
    before = {"title": item.title, "link": item.link, "status": item.status}
    await db.delete(item)
    await _audit(db, context, "PERFORMANCE_WORKBENCH_ENTRY_DELETED", "WORKBENCH_ENTRY", str(item.id), before, {})
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/announcements", response_model=WorkbenchAnnouncementPage)
async def list_workbench_announcements(
    keyword: str | None = Query(default=None, max_length=128),
    status_filter: Literal["active", "inactive"] | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchAnnouncementPage:
    conditions = []
    if keyword and keyword.strip():
        conditions.append(PerformanceWorkbenchAnnouncement.title.ilike(f"%{keyword.strip()}%"))
    if status_filter:
        conditions.append(PerformanceWorkbenchAnnouncement.status == status_filter)
    total = await db.scalar(select(func.count(PerformanceWorkbenchAnnouncement.id)).where(*conditions)) or 0
    items = (await db.execute(select(PerformanceWorkbenchAnnouncement).where(*conditions).order_by(PerformanceWorkbenchAnnouncement.display_order, PerformanceWorkbenchAnnouncement.id).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return WorkbenchAnnouncementPage(items=[WorkbenchAnnouncementOut.model_validate(item) for item in items], total=total, page=page, page_size=page_size)


@router.post("/announcements", response_model=WorkbenchAnnouncementOut, status_code=status.HTTP_201_CREATED)
async def create_workbench_announcement(
    payload: WorkbenchAnnouncementCreate,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchAnnouncementOut:
    actor = await resolve_trusted_performance_actor(db, context)
    item = PerformanceWorkbenchAnnouncement(**payload.model_dump(), created_by_type=actor.actor_type, created_by_ref=actor.actor_ref)
    db.add(item)
    await db.flush()
    await _audit(db, context, "PERFORMANCE_WORKBENCH_ANNOUNCEMENT_CREATED", "WORKBENCH_ANNOUNCEMENT", str(item.id), after=payload.model_dump())
    await db.commit()
    await db.refresh(item)
    return WorkbenchAnnouncementOut.model_validate(item)


async def _announcement_or_404(db: AsyncSession, item_id: int) -> PerformanceWorkbenchAnnouncement:
    item = await db.get(PerformanceWorkbenchAnnouncement, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="WORKBENCH_SETTING_NOT_FOUND")
    return item


@router.patch("/announcements/{item_id}", response_model=WorkbenchAnnouncementOut)
async def update_workbench_announcement(
    item_id: int,
    payload: WorkbenchAnnouncementPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchAnnouncementOut:
    item = await _announcement_or_404(db, item_id)
    before = {key: getattr(item, key) for key in payload.model_dump(exclude_unset=True)}
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await _audit(db, context, "PERFORMANCE_WORKBENCH_ANNOUNCEMENT_UPDATED", "WORKBENCH_ANNOUNCEMENT", str(item.id), before, payload.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(item)
    return WorkbenchAnnouncementOut.model_validate(item)


@router.post("/announcements/{item_id}/status", response_model=WorkbenchAnnouncementOut)
async def update_workbench_announcement_status(
    item_id: int,
    payload: WorkbenchStatusPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> WorkbenchAnnouncementOut:
    item = await _announcement_or_404(db, item_id)
    before = {"status": item.status}
    item.status = payload.status
    await _audit(db, context, "PERFORMANCE_WORKBENCH_ANNOUNCEMENT_STATUS_UPDATED", "WORKBENCH_ANNOUNCEMENT", str(item.id), before, {"status": item.status})
    await db.commit()
    await db.refresh(item)
    return WorkbenchAnnouncementOut.model_validate(item)


@router.delete("/announcements/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workbench_announcement(
    item_id: int,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> Response:
    item = await _announcement_or_404(db, item_id)
    before = {"title": item.title, "link": item.link, "status": item.status}
    await db.delete(item)
    await _audit(db, context, "PERFORMANCE_WORKBENCH_ANNOUNCEMENT_DELETED", "WORKBENCH_ANNOUNCEMENT", str(item.id), before, {})
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
