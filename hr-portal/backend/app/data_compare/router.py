"""Data comparison skill REST API endpoints.

Permission model:
  - system.data_compare "V" — required to list/view/execute skills and query metadata
  - system.data_compare "C" — required to create skills
  - system.data_compare "U" — required to update skills
  - system.data_compare "D" — required to delete skills
  - Users can only view/modify/delete their own skills (ownership check)
  - Super admins bypass ownership checks
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data_compare.chat_handler import run_data_compare
from app.data_compare.executor import ScopeDeniedError, _build_scope_sql
from app.data_compare.metadata import MetadataLoader
from app.data_compare.schemas import (
    CompareSpec,
    CompareResult,
    SkillCreate,
    SkillInvokeResponse,
    SkillListParams,
    SkillOut,
    SkillUpdate,
)
from app.data_compare.validator import SchemaValidationError
from app.data_compare import service
from app.permissions.scope_filter import _is_super_admin
from app.users.models import User

router = APIRouter(prefix="/data-compare", tags=["data-compare"])

# Permission dependencies
_require_v = require_op("system.data_compare", "V")
_require_c = require_op("system.data_compare", "C")
_require_u = require_op("system.data_compare", "U")
_require_d = require_op("system.data_compare", "D")


# ── ai_skills CRUD ──────────────────────────────────────────────────────


@router.post("/skills", response_model=SkillOut)
async def create_skill(
    data: SkillCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_c),
):
    skill = await service.create_skill(db, data, user.id)
    return SkillOut.model_validate(skill)


@router.get("/skills", response_model=dict)
async def list_skills(
    skill_type: str | None = Query("data_compare"),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    params = SkillListParams(skill_type=skill_type, status=status, limit=limit, offset=offset)
    # Super admins see all skills; regular users see only their own
    is_admin = await _is_super_admin(user, db)
    rows, total = await service.list_skills(db, params, user_id=None if is_admin else user.id)
    return {
        "items": [SkillOut.model_validate(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/skills/{skill_id}", response_model=SkillOut)
async def get_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    skill = await service.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    if not await service.user_can_access(skill, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    return SkillOut.model_validate(skill)


@router.patch("/skills/{skill_id}", response_model=SkillOut)
async def update_skill(
    skill_id: int,
    data: SkillUpdate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_u),
):
    skill = await service.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    if not await service.user_can_access(skill, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    skill = await service.update_skill(db, skill_id, data)
    return SkillOut.model_validate(skill)


@router.delete("/skills/{skill_id}")
async def delete_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_d),
):
    skill = await service.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    if not await service.user_can_access(skill, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    deleted = await service.delete_skill(db, skill_id)
    return {"ok": deleted}


@router.post("/skills/{skill_id}/invoke", response_model=SkillInvokeResponse)
async def invoke_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """Execute a stored compare configuration directly (no LLM)."""
    skill = await service.get_skill(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    if not await service.user_can_access(skill, user.id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        spec = CompareSpec.model_validate(skill.params)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid skill params: {e}")

    try:
        result_dict = await run_data_compare(spec, user, db)
    except SchemaValidationError as e:
        raise HTTPException(status_code=400, detail=f"Parameter validation failed: {'; '.join(e.errors)}")
    except ScopeDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = CompareResult.model_validate(result_dict)

    # Record execution
    await service.record_skill_run(db, skill_id, result.model_dump())

    return SkillInvokeResponse(skill_id=skill_id, result=result)


@router.post("/invoke", response_model=CompareResult)
async def invoke_adhoc(
    spec: CompareSpec,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """Execute a one-off comparison (no config saved)."""
    try:
        result_dict = await run_data_compare(spec, user, db)
    except SchemaValidationError as e:
        raise HTTPException(status_code=400, detail=f"Parameter validation failed: {'; '.join(e.errors)}")
    except ScopeDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return CompareResult.model_validate(result_dict)


# ── Metadata Query APIs ─────────────────────────────────────────────────


@router.get("/tables", response_model=dict)
async def list_comparable_tables(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """List registered tables available for data comparison.

    Tables are filtered by row-level scope: tables the user has no
    access to (scope = "false") are excluded from the list.
    """
    loader = MetadataLoader(db)
    tables = await loader.list_tables()

    # Filter by scope access per table
    filtered = []
    for t in tables:
        if t.scope_strategy:
            scope = await _build_scope_sql(user, t.table_name, db, t.scope_strategy)
            if scope.strip() == "false":
                continue  # no access → skip
        filtered.append(t)

    return {
        "tables": [
            {
                "table_name": t.table_name,
                "table_label": t.table_label,
                "is_period": t.is_period,
                "join_keys": t.get_join_keys(),
            }
            for t in filtered
        ]
    }


@router.get("/tables/{table_name}/columns", response_model=dict)
async def get_table_columns(
    table_name: str,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _perm: User = Depends(_require_v),
):
    """Get column metadata for a specific registered table.

    Returns 404 if the table is not registered or the user has no
    row-level access to it.
    """
    loader = MetadataLoader(db)
    meta = await loader.get_table(table_name)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not registered")

    # Check scope access for this specific table
    if meta.scope_strategy:
        scope = await _build_scope_sql(user, table_name, db, meta.scope_strategy)
        if scope.strip() == "false":
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not registered")

    return {
        "table_name": meta.table_name,
        "table_label": meta.table_label,
        "is_period": meta.is_period,
        "columns": [
            {
                "column_code": c.column_code,
                "column_label": c.column_label,
                "data_type": c.data_type,
                "is_pk_part": c.is_pk_part,
            }
            for c in meta.columns.values()
        ],
    }
