"""组织层级口径统一验收：org_tree.level 存储列与 org_level_N 投影一致。

口径（spec §4.4.2）：RootOrg 是技术根不计业务层级，Root 下第一个业务组织 = 第 1 级。
同步写入 org_tree.level 后，同一节点的存储 level 必须等于 resolve_org_hierarchy 派生的 depth，
否则树接口（按 level 排序/缩进）与层级投影口径分叉。
"""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, MetaData, String, Table, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.data.models import OrgNode
from app.datasources.sync_service import _sync_org_tree
from app.warehouse.service.org_hierarchy import resolve_org_hierarchy


@pytest_asyncio.fixture
async def org_tree_schema():
    """隔离 schema 内建 org_tree 表，返回 async_sessionmaker。

    仿照 tests/test_scope_classification.py::postgres_classification_schema 的隔离模式。
    """
    assert settings.DB_HOST == "127.0.0.1" and settings.DB_PORT in {55432, 15432}
    assert settings.DB_NAME.startswith("hr021_") and settings.DB_USER == "hr021_test"
    url = make_url(settings.db_url_async).set(database="hr021_migration")
    schema = "hr021_org_" + uuid.uuid4().hex
    admin = create_async_engine(url, poolclass=NullPool)
    engine = create_async_engine(url, poolclass=NullPool, connect_args={
        "server_settings": {"search_path": schema, "statement_timeout": "15000"},
    })
    metadata = MetaData()
    Table(
        "org_tree", metadata,
        Column("id", BigInteger, primary_key=True),
        Column("code", String(64), nullable=False),
        Column("name", String(255), nullable=False),
        Column("parent_id", BigInteger, nullable=True),
        Column("level", Integer, nullable=False, server_default="1"),
        Column("is_leaf", Boolean, nullable=False, server_default="false"),
        Column("is_active", Boolean, nullable=False, server_default="true"),
        Column("manager", String(64), nullable=True),
        Column("path", String(1024), nullable=True),
        Column("synced_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )
    try:
        async with admin.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        async with engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
        yield async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin.dispose()


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_synced_org_level_matches_projection(org_tree_schema):
    rows = [
        {"org_code": "RootOrg", "org_name": "根", "parent_org_code": "", "org_status": "启用"},
        {"org_code": "A", "org_name": "一级A", "parent_org_code": "RootOrg", "org_status": "启用"},
        {"org_code": "A1", "org_name": "二级A1", "parent_org_code": "A", "org_status": "启用"},
        {"org_code": "A1x", "org_name": "三级A1x", "parent_org_code": "A1", "org_status": "停用"},
        {"org_code": "B", "org_name": "一级B", "parent_org_code": "", "org_status": "启用"},
    ]
    factory = org_tree_schema
    async with factory() as db:
        await _sync_org_tree(rows, db)
        await db.commit()

    async with factory() as db:
        from sqlalchemy import select
        stored = (await db.execute(select(OrgNode))).scalars().all()
        projections, issues = resolve_org_hierarchy(stored)
    assert issues == []

    by_code = {p["node_code"]: p for p in projections}
    for node in stored:
        if node.code == "RootOrg":
            assert node.level == 0, "技术根不计业务层级"
            continue
        proj = by_code[node.code]
        assert node.level == proj["depth"], f"{node.code} 存储 level={node.level} 投影 depth={proj['depth']}"
        assert proj[f"org_level_{node.level}_code"] == node.code

    a = next(n for n in stored if n.code == "A")
    assert a.level == 1
    a1 = next(n for n in stored if n.code == "A1")
    assert a1.level == 2
