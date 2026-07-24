from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.ucp.migration_assistant import MigrationError, create_migration_change, preview_adapter_migration, publish_migration

router = APIRouter()


class MigrationPreviewIn(BaseModel):
    legacy_adapter_codes: list[str] = Field(min_length=1)
    target_adapter_code: str = Field(min_length=1, max_length=64)


class MigrationConfirmIn(BaseModel):
    resource_id: int
    target_adapter_code: str = Field(min_length=1, max_length=64)


class MigrationPublishIn(BaseModel):
    change_id: int


@router.post("/migrations/adapter/preview")
async def preview(payload: MigrationPreviewIn, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.assets", "V"))):
    try: return await preview_adapter_migration(db, payload.legacy_adapter_codes, payload.target_adapter_code)
    except MigrationError as error: raise HTTPException(400, str(error)) from error


@router.post("/migrations/adapter/confirm")
async def confirm(payload: MigrationConfirmIn, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.assets", "U"))):
    try:
        result = await create_migration_change(db, payload.resource_id, payload.target_adapter_code, getattr(user, "login_name", None))
        await db.commit()
        return result
    except MigrationError as error: raise HTTPException(404 if str(error) == "resource not found" else 400, str(error)) from error


@router.post("/migrations/adapter/publish")
async def publish(payload: MigrationPublishIn, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.assets", "U"))):
    try:
        result = await publish_migration(db, payload.change_id)
        await db.commit()
        return result
    except MigrationError as error: raise HTTPException(400, str(error)) from error
