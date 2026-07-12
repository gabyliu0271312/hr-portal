"""UCP 资产目录 / 拓扑 路由"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
from app.ucp.models import (
    UcpSystem,
    UcpResource,
    UcpCredential,
    UcpPipelineConfig,
    UcpPipelineTemplate,
    UcpAssetTag,
)
from app.ucp.asset_catalog_service import (
    get_asset_catalog,
    list_assets,
    set_asset_tag,
    remove_asset_tag,
)
from app.ucp.topology_service import (
    build_topology,
    get_impact_analysis,
)

logger = logging.getLogger("ucp.routers.assets")
router = APIRouter()


# ── Asset Catalog ──

@router.get("/assets/catalog")
async def route_asset_catalog(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.assets", "V")),
):
    catalog = await get_asset_catalog(db)
    return catalog


@router.get("/assets")
async def route_list_assets(
    asset_type: str = Query(...),
    domain: str | None = Query(None),
    keyword: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.assets", "V")),
):
    items = await list_assets(db, asset_type=asset_type, domain=domain, keyword=keyword, limit=limit, offset=offset)
    return {"total": len(items), "items": items}


@router.post("/assets/tags")
async def route_set_asset_tag(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.assets", "U")),
):
    result = await set_asset_tag(
        db,
        asset_type=payload["asset_type"],
        asset_id=payload["asset_id"],
        tag_key=payload["tag_key"],
        tag_value=payload["tag_value"],
    )
    await db.commit()
    return result


@router.delete("/assets/tags")
async def route_remove_asset_tag(
    asset_type: str = Query(...),
    asset_id: int = Query(...),
    tag_key: str = Query(...),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.assets", "D")),
):
    ok = await remove_asset_tag(db, asset_type, asset_id, tag_key)
    await db.commit()
    return {"deleted": ok}


# ── Topology ──

@router.get("/topology")
async def route_topology(
    system_id: int | None = Query(None),
    resource_id: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.assets", "V")),
):
    result = await build_topology(db, system_id=system_id, resource_id=resource_id)
    return result


@router.get("/topology/impact")
async def route_topology_impact(
    target_type: str = Query(...),
    target_id: int = Query(...),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.assets", "V")),
):
    result = await get_impact_analysis(db, target_type, target_id)
    return result
