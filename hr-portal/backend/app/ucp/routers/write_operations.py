from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.ucp.write_operation_service import WriteOperationError, execute_controlled_write, submit_controlled_write

router = APIRouter()


class WriteSubmitIn(BaseModel):
    adapter_code: str = Field(min_length=1, max_length=64)
    credential_code: str = Field(min_length=1, max_length=64)
    action: str = Field(min_length=1, max_length=32)
    idempotency_key: str = Field(min_length=8, max_length=128)
    request_preview: dict[str, Any]
    approvers: list[dict[str, str]] = Field(min_length=1)


class WriteExecuteIn(BaseModel):
    confirmation_token: str | None = Field(default=None, max_length=16)


@router.post("/write-operations/submit")
async def submit(payload: WriteSubmitIn, db: AsyncSession = Depends(get_session), user=Depends(require_op("ucp.pipelines", "U"))):
    try:
        result = await submit_controlled_write(db, adapter_code=payload.adapter_code, credential_code=payload.credential_code, action=payload.action,
            idempotency_key=payload.idempotency_key, request_preview=payload.request_preview,
            approvers=payload.approvers, operator=getattr(user, "login_name", None))
        await db.commit()
        return result
    except WriteOperationError as error:
        raise HTTPException(400, str(error)) from error


@router.post("/write-operations/{request_id}/execute")
async def execute(request_id: int, payload: WriteExecuteIn, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.pipelines", "U"))):
    try:
        result = await execute_controlled_write(db, request_id=request_id, confirmation_token=payload.confirmation_token)
        await db.commit()
        return result
    except Exception as error: raise HTTPException(400, str(error)) from error
