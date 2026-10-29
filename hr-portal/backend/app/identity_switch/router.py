from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select

from app.core.db import get_session
from app.core.deps import current_user
from app.identity_switch.models import IdentitySwitchSession
from app.identity_switch.service import (
    add_favorite, audit, can_switch, change_control, control_out, create_session, fail,
    get_setting, is_admin, list_favorites, remove_favorite, require_admin, roster_statement, validate_session,
)

router = APIRouter(tags=["identity-switch"])


class ControlPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    request_id: str = Field(min_length=1, max_length=64)
    others_enabled: bool | None = None
    confirm_clear: bool = False
    test_delivery_enabled: bool | None = None
    test_receiver_user_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set.intersection({"others_enabled", "test_delivery_enabled", "test_receiver_user_id"}):
            raise ValueError("至少修改一项设置")
        for field in ("others_enabled", "test_delivery_enabled"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError("开关不能为 null")
        return self


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    employee_no: str = Field(min_length=1, max_length=64)
    expected_generation: int = Field(ge=0)
    request_id: str = Field(min_length=1, max_length=64)


class FavoriteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    employee_no: str = Field(min_length=1, max_length=64)


async def _require_switch_permission(db, user):
    if not await can_switch(db, user, await get_setting(db)):
        fail("SWITCH_PERMISSION_DENIED", "没有身份切换权限")


@router.get("/identity-switch/control")
async def control(db=Depends(get_session), user=Depends(current_user)):
    return control_out(await require_admin(db, user))


@router.patch("/identity-switch/control")
async def update_control(payload: ControlPatch, db=Depends(get_session), user=Depends(current_user)):
    return await change_control(db, user, payload)


@router.get("/performance/identity-switch/capability")
async def capability(db=Depends(get_session), user=Depends(current_user)):
    setting = await get_setting(db)
    return {
        "can_switch": await can_switch(db, user, setting),
        "can_manage_control": await is_admin(db, user.id),
        "others_enabled": setting.others_enabled, "generation": setting.generation,
        "mode": "TARGET_POLICY", "test_delivery_enabled": setting.test_delivery_enabled,
    }


@router.get("/performance/identity-switch/people")
async def people(q: str = "", page: int = 1, page_size: int = 20, db=Depends(get_session), user=Depends(current_user)):
    if not await can_switch(db, user, await get_setting(db)):
        fail("SWITCH_PERMISSION_DENIED", "没有身份切换权限")
    if page < 1 or not 1 <= page_size <= 100 or len(q) > 128:
        fail("SWITCH_VALIDATION_ERROR", "分页或搜索参数不合法", 422)
    table, number, name = roster_statement()
    statement = select(number.label("employee_no"), name.label("display_name"))
    if "department" in table.c:
        statement = statement.add_columns(table.c.department.label("organization_label"))
    statement = statement.where(number.is_not(None), number != "", name.is_not(None))
    if q.strip():
        query = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        statement = statement.where(number.ilike(f"%{query}%", escape="\\") | name.ilike(f"%{query}%", escape="\\"))
    total = await db.scalar(select(func.count()).select_from(statement.subquery()))
    rows = (await db.execute(statement.order_by(number).offset((page - 1) * page_size).limit(page_size))).mappings().all()
    return {"items": [dict(row) for row in rows], "total": total}


@router.post("/performance/identity-switch/sessions", status_code=201)
async def start_session(payload: SessionCreate, db=Depends(get_session), user=Depends(current_user)):
    return await create_session(db, user, payload)


@router.get("/performance/identity-switch/favorites")
async def favorites(db=Depends(get_session), user=Depends(current_user)):
    await _require_switch_permission(db, user)
    return {"items": await list_favorites(db, user)}


@router.post("/performance/identity-switch/favorites", status_code=201)
async def add_favorite_endpoint(payload: FavoriteCreate, db=Depends(get_session), user=Depends(current_user)):
    await _require_switch_permission(db, user)
    return await add_favorite(db, user, payload.employee_no)


@router.delete("/performance/identity-switch/favorites/{employee_no}", status_code=204)
async def delete_favorite(employee_no: str, db=Depends(get_session), user=Depends(current_user)):
    await _require_switch_permission(db, user)
    await remove_favorite(db, user, employee_no)


@router.get("/performance/identity-switch/session")
async def session_context(request: Request, db=Depends(get_session), user=Depends(current_user)):
    secret = request.headers.get("X-App-Switch-Session")
    if not secret:
        fail("SWITCH_SESSION_REQUIRED", "未提供切换会话", 422)
    session, employee = await validate_session(db, user, secret)
    return {"session_id": session.id, "effective_identity": employee, "expires_at": session.expires_at, "mode": "TARGET_POLICY"}


@router.delete("/performance/identity-switch/sessions/{session_id}", status_code=204)
async def end_session(session_id: str, db=Depends(get_session), user=Depends(current_user)):
    from datetime import UTC, datetime
    session = await db.get(IdentitySwitchSession, session_id)
    if session and session.operator_user_id != user.id:
        fail("SWITCH_SESSION_OWNER_MISMATCH", "不能结束他人的切换会话")
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        audit(db, user.id, "IDENTITY_SWITCH_ENDED", session_id=session.id, effective_employee_no=session.target_employee_no)
        await db.commit()


from app.identity_switch.notifications import notification_router
router.include_router(notification_router)
