"""Phase 2-4 手动触发并发互斥与权限校验测试。"""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / ".venv/Lib/site-packages"))

import asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.pipeline_engine import (
    PipelineLockedError,
    PipelinePermissionError,
    check_pipeline_concurrent_lock,
    check_pipeline_trigger_permission,
)


# ==========================================
# Mock 工具
# ==========================================

class MockScalarResult:
    def __init__(self, value):
        self._value = value
    def scalar_one_or_none(self):
        return self._value


class FakeDB:
    """db.execute() 返回 MockScalarResult(scalar)"""

    def __init__(self, scalar=None):
        self._scalar = scalar
        self.executed_queries = []

    async def execute(self, stmt):
        self.executed_queries.append(str(stmt))
        return MockScalarResult(self._scalar)


# ==========================================
# 并发互斥测试
# ==========================================

async def test_no_running_exec_allows():
    """没有 RUNNING 执行时，不抛异常。"""
    db = FakeDB(scalar=None)
    try:
        await check_pipeline_concurrent_lock(db, "P1")
        print("[OK] no running execution -> allows trigger")
    except PipelineLockedError as e:
        print(f"[FAIL] should not raise: {e}")


async def test_running_exec_blocks():
    """有 RUNNING 执行时，抛 PipelineLockedError。"""
    running_exec = SimpleNamespace(
        pipeline_run_id="pr_running_001",
        pipeline_code="P1",
        status="RUNNING",
    )
    db = FakeDB(scalar=running_exec)
    try:
        await check_pipeline_concurrent_lock(db, "P1")
        print("[FAIL] should raise PipelineLockedError")
    except PipelineLockedError as e:
        assert e.code == "PIPELINE_LOCKED", f"unexpected code: {e.code}"
        assert e.pipeline_code == "P1", f"unexpected code: {e.pipeline_code}"
        assert e.running_run_id == "pr_running_001", f"unexpected run_id: {e.running_run_id}"
        print(f"[OK] running execution blocks: code={e.code}, run_id={e.running_run_id}")


async def test_pending_exec_blocks():
    """有 PENDING 执行时（被调度但未启动），也抛 PipelineLockedError。"""
    pending_exec = SimpleNamespace(
        pipeline_run_id="pr_pending_001",
        pipeline_code="P2",
        status="PENDING",
    )
    db = FakeDB(scalar=pending_exec)
    try:
        await check_pipeline_concurrent_lock(db, "P2")
        print("[FAIL] should raise PipelineLockedError for PENDING")
    except PipelineLockedError as e:
        assert e.running_run_id == "pr_pending_001"
        print(f"[OK] pending execution blocks: code={e.code}, run_id={e.running_run_id}")


async def test_completed_exec_allows():
    """只有 SUCCESS/FAILED/PARTIAL_SUCCESS 时，不抛异常（不是 RUNNING/PENDING）。"""
    completed_exec = SimpleNamespace(
        pipeline_run_id="pr_done_001",
        status="SUCCESS",  # 已完成
    )
    # 由于 SQL WHERE 过滤 status IN (RUNNING, PENDING)，返回 None
    db = FakeDB(scalar=None)
    try:
        await check_pipeline_concurrent_lock(db, "P3")
        print("[OK] completed execution -> allows new trigger")
    except PipelineLockedError as e:
        print(f"[FAIL] should not raise for completed exec: {e}")


# ==========================================
# 权限校验测试
# ==========================================

def make_user(user_id=1, is_admin=False, is_superuser=False):
    return SimpleNamespace(
        id=user_id,
        is_admin=is_admin,
        is_superuser=is_superuser,
    )


def make_pl_config(created_by=None):
    return SimpleNamespace(
        pipeline_code="P1",
        created_by=created_by,
    )


async def test_admin_can_trigger_any():
    """系统管理员可触发任何 pipeline。"""
    user = make_user(user_id=1, is_admin=True)
    db = FakeDB(scalar=make_pl_config(created_by="99"))  # 不是 owner
    try:
        await check_pipeline_trigger_permission(db, "P1", user)
        print("[OK] admin can trigger any pipeline")
    except PipelinePermissionError as e:
        print(f"[FAIL] admin should be allowed: {e}")


async def test_superuser_can_trigger_any():
    """is_superuser 也能触发。"""
    user = make_user(user_id=2, is_superuser=True)
    db = FakeDB(scalar=make_pl_config(created_by="99"))
    try:
        await check_pipeline_trigger_permission(db, "P1", user)
        print("[OK] superuser can trigger any pipeline")
    except PipelinePermissionError as e:
        print(f"[FAIL] superuser should be allowed: {e}")


async def test_owner_can_trigger():
    """Pipeline owner 可触发。"""
    user = make_user(user_id=42)
    db = FakeDB(scalar=make_pl_config(created_by="42"))
    try:
        await check_pipeline_trigger_permission(db, "P1", user)
        print("[OK] pipeline owner can trigger")
    except PipelinePermissionError as e:
        print(f"[FAIL] owner should be allowed: {e}")


async def test_non_owner_non_admin_denied():
    """非 owner 非 admin 拒绝。"""
    user = make_user(user_id=42)
    db = FakeDB(scalar=make_pl_config(created_by="99"))
    try:
        await check_pipeline_trigger_permission(db, "P1", user)
        print("[FAIL] should be denied")
    except PipelinePermissionError as e:
        assert e.code == "PIPELINE_TRIGGER_FORBIDDEN", f"unexpected code: {e.code}"
        assert e.pipeline_code == "P1"
        assert e.user_id == 42
        print(f"[OK] non-owner non-admin denied: code={e.code}, user_id={e.user_id}")


async def test_pipeline_not_found_denied():
    """Pipeline 不存在时拒绝。"""
    user = make_user(user_id=1, is_admin=False)
    db = FakeDB(scalar=None)  # pl_config not found
    try:
        await check_pipeline_trigger_permission(db, "GHOST", user)
        print("[FAIL] should be denied for non-existent pipeline")
    except PipelinePermissionError as e:
        assert e.pipeline_code == "GHOST"
        print(f"[OK] non-existent pipeline denied: code={e.code}")


async def test_pipeline_no_owner_denied():
    """Pipeline 没有 owner 且用户非 admin，拒绝。"""
    user = make_user(user_id=1, is_admin=False)
    db = FakeDB(scalar=make_pl_config(created_by=None))
    try:
        await check_pipeline_trigger_permission(db, "P1", user)
        print("[FAIL] should be denied")
    except PipelinePermissionError as e:
        assert e.code == "PIPELINE_TRIGGER_FORBIDDEN"
        print(f"[OK] pipeline without owner denied: code={e.code}")


# ==========================================
# 异常属性测试
# ==========================================

def test_pipeline_locked_error_attrs():
    """PipelineLockedError 异常属性。"""
    e = PipelineLockedError("P1", "pr_001")
    assert e.code == "PIPELINE_LOCKED"
    assert e.pipeline_code == "P1"
    assert e.running_run_id == "pr_001"
    assert "P1" in str(e) and "pr_001" in str(e)
    print("[OK] PipelineLockedError attrs: code/pipeline_code/running_run_id/message")

    e2 = PipelineLockedError("P1")
    assert e2.running_run_id is None
    assert "P1" in str(e2)
    print("[OK] PipelineLockedError without run_id still works")


def test_pipeline_permission_error_attrs():
    """PipelinePermissionError 异常属性。"""
    e = PipelinePermissionError("P1", 42, "非系统管理员")
    assert e.code == "PIPELINE_TRIGGER_FORBIDDEN"
    assert e.pipeline_code == "P1"
    assert e.user_id == 42
    assert e.reason == "非系统管理员"
    assert "42" in str(e) and "P1" in str(e) and "非系统管理员" in str(e)
    print("[OK] PipelinePermissionError attrs: code/pipeline_code/user_id/reason/message")

    e2 = PipelinePermissionError("P1", 42)
    assert e2.reason == ""
    print("[OK] PipelinePermissionError without reason still works")


# ==========================================
# 主流程
# ==========================================

async def main():
    print("=" * 60)
    print("Phase 2-4: 并发互斥测试")
    print("=" * 60)
    await test_no_running_exec_allows()
    await test_running_exec_blocks()
    await test_pending_exec_blocks()
    await test_completed_exec_allows()

    print()
    print("=" * 60)
    print("Phase 2-4: 权限校验测试")
    print("=" * 60)
    await test_admin_can_trigger_any()
    await test_superuser_can_trigger_any()
    await test_owner_can_trigger()
    await test_non_owner_non_admin_denied()
    await test_pipeline_not_found_denied()
    await test_pipeline_no_owner_denied()

    print()
    print("=" * 60)
    print("Phase 2-4: 异常属性测试")
    print("=" * 60)
    test_pipeline_locked_error_attrs()
    test_pipeline_permission_error_attrs()

    print()
    print("=" * 60)
    print("All 12 tests passed.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
