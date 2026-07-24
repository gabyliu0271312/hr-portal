"""UCP API 路由 — 模块化拆分版

routers/ 目录下每个子模块包含独立路由定义。
主 router.py 仅负责通过 include_router 组装各子模块路由。
dev-only 模块（如 seed）仅在 ENABLE_DEV_SEED=true 时挂载。
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter

logger = logging.getLogger("ucp.router")

router = APIRouter(prefix="/ucp", tags=["UCP — 数据连接平台"])

# ===== Module includes =====

from app.ucp.routers.systems import router as systems_router
from app.ucp.routers.executions import router as executions_router
from app.ucp.routers.events import router as events_router
from app.ucp.routers.external import router as external_router
from app.ucp.routers.lifecycle import router as lifecycle_router
from app.ucp.routers.admin import router as admin_router
from app.ucp.routers.monitor import router as monitor_router
from app.ucp.routers.assets import router as assets_router
from app.ucp.routers.governance import router as governance_router
from app.ucp.routers.capabilities import router as capabilities_router
from app.ucp.routers.api_templates import router as api_templates_router
from app.ucp.routers.migration import router as migration_router
from app.ucp.routers.write_operations import router as write_operations_router
from app.ucp.routers.pipeline_templates import router as pipeline_templates_router

router.include_router(systems_router)
router.include_router(executions_router)
router.include_router(events_router)
router.include_router(external_router)
router.include_router(lifecycle_router)
router.include_router(admin_router)
router.include_router(monitor_router)
router.include_router(assets_router)
router.include_router(governance_router)
router.include_router(capabilities_router)
router.include_router(api_templates_router)
router.include_router(migration_router)
router.include_router(write_operations_router)
router.include_router(pipeline_templates_router)

# ===== Dev-only modules =====

if os.getenv("ENABLE_DEV_SEED", "").lower() in ("true", "1"):
    from app.ucp.routers.seed import router as seed_router
    router.include_router(seed_router)
    logger.info("[ucp] DEV_SEED enabled — seed routes mounted")
