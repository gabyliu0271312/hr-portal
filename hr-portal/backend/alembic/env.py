"""Alembic 迁移环境（async）

设计要点：
- 用 app.core.db.Base 的 metadata 作为 autogenerate 源
- DB URL 由 app.core.config.settings 提供（始终从 .env 读取）
- async engine 用 run_sync 桥接到 alembic 的同步上下文
"""
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

from app.core.config import settings
from app.core.db import Base

# 后续阶段的 model 模块在此导入，使其注册到 Base.metadata：
from app.users import models as _users_models  # noqa: F401
from app.field_category import models as _field_cat_models  # noqa: F401
from app.datasources import models as _datasources_models  # noqa: F401
from app.data import models as _data_models  # noqa: F401
from app.reports import models as _reports_models  # noqa: F401
from app.scheduler import models as _scheduler_models  # noqa: F401
from app.scopes import models as _scopes_models  # noqa: F401
from app.datasets import models as _datasets_models  # noqa: F401
from app.tools import models as _tools_models  # noqa: F401
from app.ai import models as _ai_models  # noqa: F401
from app.ai_formula import models as _ai_formula_models  # noqa: F401
from app.system import models as _system_models  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.db_url_async)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
