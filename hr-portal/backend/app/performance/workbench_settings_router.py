"""Performance workbench settings API."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, TypeVar

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    get_performance_access_context,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance import announcement_service
from app.performance.models import (
    PerformanceAnnouncementAcknowledgement,
    PerformanceAnnouncementImage,
    PerformanceWorkbenchAnnouncement,
    PerformanceWorkbenchEntry,
    PerformanceWorkbenchSetting,
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
    cycle_ref: str | None = Field(default=None, min_length=1, max_length=64)
    visibility: Literal["所有人", "指定角色"] = "所有人"
    visibility_roles: list[Literal["HRBP", "REAL_LINE_MANAGER"]] = Field(default_factory=list)
    title_en: str = Field(default="", max_length=128)
    link_en: str = Field(default="", max_length=2048)
    description: str = Field(default="", max_length=1000)
    description_en: str = Field(default="", max_length=1000)
    image_id: int | None = Field(default=None, gt=0)
    image_en_id: int | None = Field(default=None, gt=0)
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

    @field_validator("title_en", "description", "description_en")
    @classmethod
    def trim_text(cls, value):
        return value.strip()

    @field_validator("link", "link_en")
    @classmethod
    def valid_link(cls, value):
        return announcement_service.validate_announcement_link(value)

    @field_validator("visibility_roles")
    @classmethod
    def unique_roles(cls, value):
        return list(dict.fromkeys(value))

    @model_validator(mode="after")
    def required_roles(self):
        if self.visibility == "指定角色" and not self.visibility_roles:
            raise ValueError("ANNOUNCEMENT_ROLES_REQUIRED")
        return self


class WorkbenchAnnouncementPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=128)
    link: str | None = Field(default=None, min_length=1, max_length=2048)
    cycle_label: str | None = Field(default=None, min_length=1, max_length=128)
    cycle_ref: str | None = Field(default=None, min_length=1, max_length=64)
    visibility: Literal["所有人", "指定角色"] | None = None
    visibility_roles: list[Literal["HRBP", "REAL_LINE_MANAGER"]] | None = None
    title_en: str | None = Field(default=None, max_length=128)
    link_en: str | None = Field(default=None, max_length=2048)
    description: str | None = Field(default=None, max_length=1000)
    description_en: str | None = Field(default=None, max_length=1000)
    image_id: int | None = Field(default=None, gt=0)
    image_en_id: int | None = Field(default=None, gt=0)
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

    @model_validator(mode="before")
    @classmethod
    def reject_nulls(cls, values):
        if isinstance(values, dict) and any(value is None for key, value in values.items() if key not in {"cycle_ref", "image_id", "image_en_id"}):
            raise ValueError("字段不能为null")
        return values

    @field_validator("title_en", "description", "description_en")
    @classmethod
    def trim_text(cls, value):
        return value.strip()

    @field_validator("link", "link_en")
    @classmethod
    def valid_link(cls, value):
        return announcement_service.validate_announcement_link(value)

    @field_validator("visibility_roles")
    @classmethod
    def unique_roles(cls, value):
        return list(dict.fromkeys(value))


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
    visibility_roles: list[str]
    title_en: str
    link_en: str
    description: str
    description_en: str
    image_id: int | None
    image_en_id: int | None
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
    title_en: str
    link_en: str
    description: str
    description_en: str
    image_id: int | None
    image_en_id: int | None
    cycle_label: str
    require_ack: bool
    acknowledged: bool = False
    display_order: int
    updated_at: datetime


class WorkbenchAnnouncementFeedOut(BaseModel):
    announcement_enabled: bool
    cycle_ref: str | None
    items: list[WorkbenchAnnouncementFeedItem]


class AnnouncementAcknowledgeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cycle_ref: str = Field(min_length=1, max_length=64)


class AnnouncementAcknowledgeOut(BaseModel):
    acknowledged: bool


class AnnouncementImageOut(BaseModel):
    id: int


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
    cycle_id: Annotated[int | None, Query(ge=1)] = None,
) -> WorkbenchAnnouncementFeedOut:
    cycle_ref = await announcement_service.resolve_cycle_ref(db, cycle_ref, cycle_id)
    setting = await db.get(PerformanceWorkbenchSetting, 1)
    if setting is not None and not setting.announcement_enabled:
        return WorkbenchAnnouncementFeedOut(announcement_enabled=False, cycle_ref=cycle_ref, items=[])
    items, employee_no = await announcement_service.visible_announcements(db, context, cycle_ref)
    acknowledged = set()
    if cycle_ref is not None and employee_no and items:
        acknowledged = set((await db.execute(select(PerformanceAnnouncementAcknowledgement.announcement_id).where(
            PerformanceAnnouncementAcknowledgement.employee_no == employee_no,
            PerformanceAnnouncementAcknowledgement.cycle_ref == cycle_ref,
            PerformanceAnnouncementAcknowledgement.announcement_id.in_([item.id for item in items]),
        ))).scalars().all())
    return WorkbenchAnnouncementFeedOut(
        announcement_enabled=True, cycle_ref=cycle_ref,
        items=[WorkbenchAnnouncementFeedItem.model_validate(item).model_copy(update={
            "acknowledged": item.id in acknowledged,
            "require_ack": bool(item.require_ack and employee_no and cycle_ref is not None),
        }) for item in items],
    )


@consumer_router.post("/announcements/{item_id}/acknowledge", response_model=AnnouncementAcknowledgeOut)
async def acknowledge_workbench_announcement(
    item_id: int,
    payload: AnnouncementAcknowledgeIn,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    return await announcement_service.acknowledge_announcement(db, context, item_id, payload.cycle_ref)


@router.post("/announcement-images", response_model=AnnouncementImageOut, status_code=201)
async def upload_announcement_image(
    file: UploadFile = File(...),
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
):
    content = await file.read(announcement_service.MAX_IMAGE_BYTES + 1)
    content_type = announcement_service.validate_announcement_image(content)
    image = PerformanceAnnouncementImage(content=content, content_type=content_type)
    db.add(image)
    await db.commit()
    await db.refresh(image)
    return AnnouncementImageOut(id=image.id)


@consumer_router.get("/announcement-images/{image_id}")
async def get_announcement_image(
    image_id: int,
    cycle_ref: str | None = Query(default=None, max_length=64),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    if "performance.configuration.manage" not in context.permission_codes:
        cycle_ref = await announcement_service.resolve_cycle_ref(db, cycle_ref)
        setting = await db.get(PerformanceWorkbenchSetting, 1)
        if setting is not None and not setting.announcement_enabled:
            raise HTTPException(404, "ANNOUNCEMENT_IMAGE_NOT_FOUND")
        items, _ = await announcement_service.visible_announcements(db, context, cycle_ref, image_id=image_id)
        if not items:
            raise HTTPException(404, "ANNOUNCEMENT_IMAGE_NOT_FOUND")
    image = await db.get(PerformanceAnnouncementImage, image_id)
    if image is None:
        raise HTTPException(404, "ANNOUNCEMENT_IMAGE_NOT_FOUND")
    return Response(content=image.content, media_type=image.content_type, headers={
        "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
    })


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
    await announcement_service.validate_announcement_references(db, payload.model_dump())
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
    changes = payload.model_dump(exclude_unset=True)
    values = {key: getattr(item, key) for key in WorkbenchAnnouncementCreate.model_fields}
    values.update(changes)
    try:
        WorkbenchAnnouncementCreate.model_validate(values)
    except ValueError:
        raise HTTPException(422, "INVALID_ANNOUNCEMENT_SETTINGS") from None
    await announcement_service.validate_announcement_references(db, changes)
    before = {key: getattr(item, key) for key in changes}
    for key, value in changes.items():
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
