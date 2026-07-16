"""回归测试：本地 schema 自动检查逻辑（无需数据库）。

确保阻断问题二的整改真正生效：
- 单一 head 检查始终执行（多 head = 分支未合并 → 拒绝）；
- 数据库可达但落后于 head / 未初始化 → 返回 fail（调用方 pytest.exit）；
- 数据库不可达 → 返回 warn（仅告警，不误杀 DB-free 测试）。
"""
import importlib.util
import os

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "schema_check_conftest", os.path.join(_HERE, "conftest.py")
)
conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(conftest)


def _fail_decision(monkeypatch, heads, db_status, db_msg="boom", db_cur=None):
    monkeypatch.setattr(conftest, "_alembic_heads", lambda: heads)
    monkeypatch.setattr(
        conftest, "_check_db_current",
        lambda head: (db_status, db_msg, db_cur),
    )


def test_single_head_is_enforced(monkeypatch):
    # 模拟存在多个 alembic head（分支迁移未合并）
    _fail_decision(monkeypatch, ["0099", "0100"], True)
    decision, msg = conftest._run_schema_check()
    assert decision == "fail"
    assert "多个 alembic head" in msg


def test_stale_db_returns_fail(monkeypatch):
    _fail_decision(
        monkeypatch, ["0100"], False,
        db_msg="数据库 schema 落后于最新迁移（当前 ['0098']，最新 0100）",
        db_cur=["0098"],
    )
    decision, msg = conftest._run_schema_check()
    assert decision == "fail"
    assert "alembic upgrade head" in msg


def test_uninitialized_db_returns_fail(monkeypatch):
    _fail_decision(
        monkeypatch, ["0100"], False,
        db_msg="数据库尚未初始化迁移表 alembic_version（未执行任何迁移）",
        db_cur=None,
    )
    decision, msg = conftest._run_schema_check()
    assert decision == "fail"
    assert "alembic_version" in msg


def test_unreachable_db_returns_warn(monkeypatch):
    _fail_decision(
        monkeypatch, ["0100"], None,
        db_msg="无法连接数据库或读取迁移表：timeout", db_cur=None,
    )
    decision, msg = conftest._run_schema_check()
    assert decision == "warn"
    assert "跳过" in msg


def test_current_db_returns_ok(monkeypatch):
    _fail_decision(monkeypatch, ["0100"], True, db_cur=["0100"])
    decision, msg = conftest._run_schema_check()
    assert decision == "ok"
    assert "0100" in msg
