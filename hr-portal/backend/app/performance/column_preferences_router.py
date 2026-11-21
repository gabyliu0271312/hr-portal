"""API for server-owned performance member column preferences."""
from __future__ import annotations

from dataclasses import replace
from typing import Literal

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import func

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    get_performance_access_context,
    resolve_trusted_performance_actor,
)
from app.performance.column_preferences_model import PerformanceColumnPreference
from app.performance.member_columns_service import column_schema, normalize_column_keys
from app.performance.models import PerformanceCycle, PerformanceProject, PerformanceProjectNodeSnapshot

router = APIRouter(prefix="/performance/column-preferences", tags=["performance-column-preferences"])


class ColumnPreferencePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    column_keys: list[StrictStr] = Field(..., min_length=0, max_length=128)

    @field_validator("column_keys")
    @classmethod
    def validate_keys(cls, value: list[str]) -> list[str]:
        if any(not key.strip() or len(key) > 256 for key in value):
            raise ValueError("column_keys 含有无效列键")
        return list(dict.fromkeys(value))


class MemberColumn(BaseModel):
    key: str
    label: str
    width: int | None = None
    locked: bool
    visible_by_default: bool
    sortable: bool


class ColumnPreferenceOut(BaseModel):
    column_keys: list[str] | None
    columns: list[MemberColumn]
    allowed_column_keys: list[str]
    default_column_keys: list[str]
    locked_column_keys: list[str]
    sort_keys: list[str]


async def _schema_for(
    db: AsyncSession,
    context: PerformanceAccessContext,
    cycle_ref: str,
    scene: str,
    project_id: int | None,
    node_id: str | None,
    role_key: str | None,
):
    from app.performance import projects_router as routes
    from app.performance.member_columns_service import SCHEMA_KEYS
    cycle = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == cycle_ref))
    if cycle is None and cycle_ref.isdigit():
        cycle = await db.get(PerformanceCycle, int(cycle_ref))
    if cycle is None:
        raise HTTPException(404, "CYCLE_NOT_FOUND")
    if scene == "evaluation":
        if project_id is None or not node_id:
            raise HTTPException(422, "EVALUATION_SCOPE_REQUIRED")
        project = await routes._get_project(db, project_id)
        if project.cycle_ref != cycle.cycle_ref:
            raise HTTPException(404, "PROJECT_NOT_FOUND")
        node = await db.scalar(select(PerformanceProjectNodeSnapshot).where(
            PerformanceProjectNodeSnapshot.project_id == project_id,
            PerformanceProjectNodeSnapshot.node_id == node_id,
        ))
        if node is None:
            raise HTTPException(404, "NODE_NOT_FOUND")
        from app.performance.assessment_roles import node_role_code
        expected = node_role_code({**((node.config or {}).get("template") or {}), "node_type": node.node_type})
        if role_key and role_key != expected:
            raise HTTPException(422, "ROLE_SCOPE_MISMATCH")
        result = await routes.workbench_task_people(node_id, project_id, "all", context, db, keyword=None, phase_id=None, page=1, page_size=1, sort_by="task_id", sort_order="asc")
    else:
        if role_key:
            if role_key not in {"hrbp", "project_admin"}:
                raise HTTPException(422, "INVALID_MANAGEMENT_ROLE")
            context = replace(context, management_role=role_key, management_cycle_id=cycle.id, management_project_id=project_id)
        if project_id is not None:
            project = await routes._get_project(db, project_id)
            if project.cycle_ref != cycle.cycle_ref:
                raise HTTPException(404, "PROJECT_NOT_FOUND")
            result = await routes.list_project_members(project_id, keyword=None, page=1, page_size=1, sort_by=None, sort_order=None, context=context, db=db)
        else:
            result = await routes.cycle_project_members(cycle.id, keyword=None, page=1, page_size=1, sort_by=None, sort_order=None, context=context, db=db)
    data = result if isinstance(result, dict) else result.model_dump()
    return {key: data[key] for key in SCHEMA_KEYS}


async def _canonical_cycle_ref(db, cycle_ref):
    cycle = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == str(cycle_ref)))
    if cycle is None and str(cycle_ref).isdigit():
        cycle = await db.get(PerformanceCycle, int(cycle_ref))
    if cycle is None:
        raise HTTPException(404, "CYCLE_NOT_FOUND")
    return cycle.cycle_ref


def _owner(context: PerformanceAccessContext, actor):
    return {
        "owner_type": "PORTAL_USER" if context.operator_user_id else context.subject_type,
        "owner_id": int(context.operator_user_id or context.subject_id),
        "employee_ref": actor.actor_ref if actor.actor_type == "EMPLOYEE" else "",
    }


def _response(schema, column_keys):
    return ColumnPreferenceOut(column_keys=column_keys, **schema)


async def _load_preference(db, owner, *, cycle_ref, scene, project_id, node_id, role_key):
    return await db.scalar(select(PerformanceColumnPreference).where(
        PerformanceColumnPreference.owner_type == owner["owner_type"],
        PerformanceColumnPreference.owner_id == owner["owner_id"],
        PerformanceColumnPreference.employee_ref == owner["employee_ref"],
        PerformanceColumnPreference.cycle_ref == cycle_ref,
        PerformanceColumnPreference.scene == scene,
        PerformanceColumnPreference.project_id == (project_id or 0),
        PerformanceColumnPreference.node_id == (node_id or ""),
        PerformanceColumnPreference.role_key == (role_key or ""),
    ))


@router.get("", response_model=ColumnPreferenceOut)
async def get_column_preferences(
    cycle_ref: str = Query(..., min_length=1, max_length=64),
    scene: Literal["management", "evaluation"] = Query(...),
    project_id: int | None = Query(default=None, ge=1),
    node_id: str | None = Query(default=None, max_length=96),
    role_key: str | None = Query(default=None, max_length=96),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle_ref = await _canonical_cycle_ref(db, cycle_ref)
    actor = await resolve_trusted_performance_actor(db, context, cycle_ref=cycle_ref)
    schema = await _schema_for(db, context, cycle_ref, scene, project_id, node_id, role_key)
    row = await _load_preference(db, _owner(context, actor), cycle_ref=cycle_ref, scene=scene, project_id=project_id, node_id=node_id, role_key=role_key)
    keys = None if row is None else normalize_column_keys(row.column_keys or [], schema)
    return _response(schema, keys)


@router.put("", response_model=ColumnPreferenceOut)
async def put_column_preferences(
    payload: ColumnPreferencePatch,
    cycle_ref: str = Query(..., min_length=1, max_length=64),
    scene: Literal["management", "evaluation"] = Query(...),
    project_id: int | None = Query(default=None, ge=1),
    node_id: str | None = Query(default=None, max_length=96),
    role_key: str | None = Query(default=None, max_length=96),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle_ref = await _canonical_cycle_ref(db, cycle_ref)
    actor = await resolve_trusted_performance_actor(db, context, cycle_ref=cycle_ref)
    schema = await _schema_for(db, context, cycle_ref, scene, project_id, node_id, role_key)
    keys = normalize_column_keys(payload.column_keys, schema)
    owner = _owner(context, actor)
    statement = insert(PerformanceColumnPreference).values(
        **owner, cycle_ref=cycle_ref, scene=scene, project_id=project_id or 0,
        node_id=node_id or "", role_key=role_key or "", column_keys=keys,
    ).on_conflict_do_update(constraint="uq_pm_column_preference_scope", set_={"column_keys": keys, "updated_at": func.now()})
    try:
        await db.execute(statement)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return _response(schema, keys)
