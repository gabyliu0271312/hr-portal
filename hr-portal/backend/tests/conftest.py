"""Pytest 全局配置：本地测试启动前自动检查数据库迁移是否到最新 revision。

背景（见 specs/012 formula-ast-parser-upgrade-requirements.md 阻断问题二）：
测试库若未执行迁移，warehouse_metrics 等新字段不存在，凡是涉及该表的
插入测试会整片失败并抛出令人困惑的 "column ... does not exist"。

策略（best-effort，与公式 AST 编译器 DB-free 测试策略一致）：
- 始终执行「单一 head 检查」（无需数据库）：防止迁移分支未合并导致多 head。
- 若未显式配置数据库（DB_HOST 等取默认值、连不上）→ 跳过检查（warning），
  不阻断 DB-free 测试。
- 若数据库可达但 alembic_version 不存在（未初始化）→ 立即失败并给出修复命令。
- 若数据库可达但 schema 落后于 head → 立即失败并给出修复命令：alembic upgrade head。
- 若数据库配置但临时不可达 → 仅 warning 跳过（不硬失败，避免误杀临时停库场景）。

DB URL 构造与 app.core.config.Settings 保持一致，且只用 asyncpg
（psycopg2 未作为依赖安装，故 conftest 不可用同步驱动）。
"""
import asyncio
import os
import sys

import pytest


def _alembic_heads():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    here = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(here)  # tests/ -> backend/
    cfg = Config()
    cfg.set_main_option("script_location", os.path.join(backend_root, "alembic"))
    script = ScriptDirectory.from_config(cfg)
    return script.get_heads()


def _build_async_url():
    # 与 app.core.config.Settings.db_url_async 保持一致的默认值
    host = os.getenv("DB_HOST", "db")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "hr_portal")
    user = os.getenv("DB_USER", "hr_portal")
    pw = os.getenv("DB_PASSWORD", "change-me")
    return f"postgresql+asyncpg://{user}:{pw}@{host}:{port}/{name}"


def _check_db_current(head):
    """返回 (status, message, current)。

    status:
      True  = 已是最新
      False = 落后于 head（或未初始化，应失败）
      None  = 无法连接（仅告警）
    """
    from sqlalchemy import inspect, text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    url = _build_async_url()
    engine = create_async_engine(url, poolclass=NullPool, connect_args={"timeout": 3})

    async def _run():
        async with engine.connect() as conn:
            has = await conn.run_sync(
                lambda c: inspect(c).has_table("alembic_version")
            )
            if not has:
                return False, "数据库尚未初始化迁移表 alembic_version（未执行任何迁移）", None
            rows = await conn.execute(text("SELECT version_num FROM alembic_version"))
            cur = [r[0] for r in rows.fetchall()]
        return None, None, cur

    try:
        status, msg, current = asyncio.run(_run())
    except Exception as e:  # noqa: BLE001
        return None, f"无法连接数据库或读取迁移表：{e}", None

    if status is False:
        return False, msg, current  # 未初始化
    if head in current:
        return True, None, current
    return False, f"数据库 schema 落后于最新迁移（当前 {current}，最新 {head}）", current


def _run_schema_check():
    """纯函数：返回 (decision, message)。

    decision:
      "fail" = 应拒绝（多 head / schema 落后 / 未初始化）→ 调用方 pytest.exit
      "ok"   = 已是最新
      "warn" = 无法确认（DB 不可达）→ 仅告警跳过
    """
    try:
        heads = _alembic_heads()
    except Exception as e:  # noqa: BLE001
        return "warn", f"读取 alembic head 失败：{e}"

    if len(heads) != 1:
        return (
            "fail",
            f"检测到多个 alembic head（{heads}），迁移分支未合并，"
            "请先解决分支再运行测试。",
        )

    head = heads[0]
    status, msg, _ = _check_db_current(head)
    if status is True:
        return "ok", f"数据库 schema 已是最新 revision {head}"
    if status is False:
        return (
            "fail",
            msg + "\n  请先执行迁移： alembic upgrade head"
            "\n  （发布顺序：先迁移数据库，再部署/测试应用）",
        )
    return "warn", f"{msg}（跳过 schema 版本检查）"


@pytest.fixture(scope="session", autouse=True)
def _enforce_schema_is_current():
    decision, msg = _run_schema_check()
    if decision == "fail":
        pytest.exit("[schema-check] " + msg, returncode=2)
    tag = "OK：" if decision == "ok" else "警告："
    print(f"[schema-check] {tag}{msg}", file=sys.stderr)
