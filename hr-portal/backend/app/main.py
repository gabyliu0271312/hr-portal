"""FastAPI 应用入口

- /api/v1/health：健康检查（含 DB 探活）
- /api/v1/auth/*：登录、me、改密、SSO 占位
- 启动事件：跑 seed 注入 admin + 菜单 + 超级管理员
"""
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.auth.router import router as auth_router
from app.codegen.router import router as codegen_router
from app.core.config import settings
from app.core.db import AsyncSessionLocal, engine
from app.data.columns_router import router as columns_router
from app.data.router import router as data_router
from app.datasets.calculated_fields import router as dataset_calculated_fields_router
from app.datasets.router import router as datasets_router
from app.datasources.router import router as datasources_router
from app.field_category.router import router as field_cat_router
from app.menus.router import router as menus_router
from app.reports.router import router as reports_router
from app.roles.router import router as roles_router
from app.scheduler.engine import init_engine
from app.scheduler.router import router as scheduler_router
from app.scopes.router import router as scopes_router
from app.seed import run_seed
from app.trees.router import router as trees_router
from app.push.router import router as push_router
from app.admin.tables_router import router as admin_tables_router
from app.ai.router import router as ai_router
from app.integrations.feishu.router import router as feishu_router
from app.automation.router import router as automation_router
from app.data_compare.router import router as data_compare_router
from app.allocation.router import router as allocation_router
from app.ai_formula.router import router as ai_formula_router
from app.cost_allocation.router import router as cost_allocation_router
from app.system.router import router as system_logs_router
from app.tools.router import router as tools_router
from app.table_tools.router import router as table_tools_router
from app.users.router import router as users_router
from app.ucp.router import router as ucp_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("hr-portal")


async def _wait_for_db_ready(max_wait_seconds: int = 60) -> None:
    """等数据库可真正执行查询再继续。

    pg_isready / healthcheck 在容器重启时会过早报健康，此刻 Postgres 仍在
    崩溃恢复（the database system is starting up），SELECT 会抛错。动态表注册
    依赖查库，必须等到能真正查询，否则会静默退化成「缺表」的半残进程。
    """
    import asyncio

    delay = 0.5
    waited = 0.0
    while True:
        try:
            async with AsyncSessionLocal() as _s:
                await _s.execute(text("SELECT 1"))
            return
        except Exception as e:
            if waited >= max_wait_seconds:
                raise RuntimeError(
                    f"数据库在 {max_wait_seconds}s 内未就绪，启动中止"
                ) from e
            logger.warning("[startup] DB 未就绪，%.1fs 后重试：%s", delay, e)
            await asyncio.sleep(delay)
            waited += delay
            delay = min(delay * 2, 5.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动：等 DB 真正可查询（避免重启时撞上 Postgres 崩溃恢复）
    await _wait_for_db_ready()

    # 启动：跑 seed
    try:
        await run_seed(AsyncSessionLocal)
    except Exception as e:
        logger.exception("[startup] seed failed: %s", e)

    # 启动：加载用户新建的动态表到 DATA_TABLES / PERIOD_TABLES
    # 失败时直接抛出，阻断启动 —— 配合 restart: unless-stopped 自动重试，
    # 绝不带病对外服务（缺表会导致整个数据集字段不显示）
    from app.data.dynamic_loader import load_dynamic_tables
    async with AsyncSessionLocal() as _s:
        await load_dynamic_tables(_s)

    # 启动：给所有数据集的关联键补建索引（加速报表 JOIN）
    try:
        from app.datasets.indexing import ensure_indexes_for_all_datasets
        async with AsyncSessionLocal() as _s:
            n = await ensure_indexes_for_all_datasets(_s)
            logger.info("[startup] ensured join indexes for %s relations", n)
    except Exception as e:
        logger.exception("[startup] ensure join indexes failed: %s", e)

    # 启动调度器：加载所有 enabled jobs
    scheduler_engine = init_engine(AsyncSessionLocal)
    try:
        await scheduler_engine.start()
    except Exception as e:
        logger.exception("[startup] scheduler start failed: %s", e)

    yield

    try:
        await scheduler_engine.shutdown()
    except Exception:
        pass
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(f"{settings.API_PREFIX}/health")
async def health() -> dict:
    db_ok = False
    db_error: str | None = None
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception as e:
        db_error = str(e)

    return {
        "status": "ok" if db_ok else "degraded",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "db": {"ok": db_ok, "error": db_error},
    }


@app.get(f"{settings.API_PREFIX}/")
async def root() -> dict:
    return {"message": f"{settings.APP_NAME} API", "docs": "/docs"}


# ===== 路由挂载 =====
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(ai_router, prefix=settings.API_PREFIX)
app.include_router(codegen_router, prefix=settings.API_PREFIX)
app.include_router(users_router, prefix=settings.API_PREFIX)
app.include_router(roles_router, prefix=settings.API_PREFIX)
app.include_router(menus_router, prefix=settings.API_PREFIX)
app.include_router(field_cat_router, prefix=settings.API_PREFIX)
app.include_router(datasources_router, prefix=settings.API_PREFIX)
app.include_router(data_router, prefix=settings.API_PREFIX)
app.include_router(columns_router, prefix=settings.API_PREFIX)
app.include_router(trees_router, prefix=settings.API_PREFIX)
app.include_router(reports_router, prefix=settings.API_PREFIX)
app.include_router(scheduler_router, prefix=settings.API_PREFIX)
app.include_router(scopes_router, prefix=settings.API_PREFIX)
app.include_router(datasets_router, prefix=settings.API_PREFIX)
app.include_router(dataset_calculated_fields_router, prefix=settings.API_PREFIX)
app.include_router(ai_formula_router, prefix=settings.API_PREFIX)
app.include_router(system_logs_router, prefix=settings.API_PREFIX)
app.include_router(tools_router, prefix=settings.API_PREFIX)
app.include_router(table_tools_router, prefix=settings.API_PREFIX)
app.include_router(cost_allocation_router, prefix=settings.API_PREFIX)
app.include_router(allocation_router, prefix=settings.API_PREFIX)
app.include_router(admin_tables_router, prefix=settings.API_PREFIX)
app.include_router(push_router, prefix=settings.API_PREFIX)
app.include_router(feishu_router, prefix=settings.API_PREFIX)
app.include_router(automation_router, prefix=settings.API_PREFIX)
app.include_router(data_compare_router, prefix=settings.API_PREFIX)
app.include_router(ucp_router, prefix=settings.API_PREFIX)
