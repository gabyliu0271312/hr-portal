"""SQLAlchemy 2.0 async 数据库会话"""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """所有 ORM model 的统一基类"""


engine = create_async_engine(
    settings.db_url_async,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI 依赖注入入口"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            try:
                await session.rollback()
            except Exception:
                # rollback 本身也可能失败（连接已断），关闭会话让连接池丢弃该连接
                await session.close()
            raise


def get_session_factory():
    """返回一个新的 async session factory，用于需要独立事务的场景。

    例如：在 scheduler handler 或业务 router 中调用 publish_event() 时，
    应避免复用当前业务 session，而是创建独立 session 以明确事务边界。

    用法：
        async with get_session_factory()() as new_db:
            await publish_event(event, new_db)
    """
    return AsyncSessionLocal