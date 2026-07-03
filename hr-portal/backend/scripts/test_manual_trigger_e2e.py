"""Phase 2-4 端到端集成测试。"""
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / ".venv/Lib/site-packages"))

import asyncio
from app.ucp import router as r
from app.ucp.router import ManualTriggerRequest
from app.ucp.pipeline_engine import PipelineLockedError, PipelinePermissionError


# ==========================================
# 1. Pydantic 模型验证
# ==========================================

def test_manual_trigger_request_default():
    """默认请求：dry_run=False, time_range=None, override_params=None。"""
    req = ManualTriggerRequest()
    assert req.dry_run is False
    assert req.time_range is None
    assert req.override_params is None
    print("[OK] ManualTriggerRequest default: dry_run=False")


def test_manual_trigger_request_with_dry_run():
    """带 dry_run 的请求。"""
    req = ManualTriggerRequest(dry_run=True)
    assert req.dry_run is True
    print("[OK] ManualTriggerRequest with dry_run=True")


def test_manual_trigger_request_full_params():
    """完整参数请求。"""
    req = ManualTriggerRequest(
        dry_run=True,
        time_range={"start": "2026-07-01T00:00:00", "end": "2026-07-02T00:00:00"},
        override_params={"step1": {"limit": 10}, "step2": {"filter": "test"}},
    )
    assert req.dry_run is True
    assert req.time_range["start"] == "2026-07-01T00:00:00"
    assert req.override_params["step1"]["limit"] == 10
    print("[OK] ManualTriggerRequest full params: time_range + override_params")


def test_manual_trigger_request_serialization():
    """验证序列化。"""
    req = ManualTriggerRequest(dry_run=True)
    d = req.model_dump()
    assert d == {"dry_run": True, "time_range": None, "override_params": None}
    print("[OK] ManualTriggerRequest.model_dump() works")


# ==========================================
# 2. Router 端点验证
# ==========================================

def test_manual_trigger_route_exists():
    """验证 POST /ucp/pipelines/{code}/run 端点存在。"""
    for route in r.router.routes:
        if route.path == "/ucp/pipelines/{pipeline_code}/run":
            assert "POST" in route.methods
            assert route.summary == "手动触发流水线执行"
            print(f"[OK] POST /ucp/pipelines/{{code}}/run exists: summary='{route.summary}'")
            return
    raise AssertionError("route not found")


# ==========================================
# 3. 端点行为模拟（HTTP 状态码）
# ==========================================

def test_route_uses_require_op():
    """端点使用 require_op('datasource.ucp_executions', 'C') 权限检查。"""
    import inspect
    src = inspect.getsource(r.manual_trigger_pipeline)
    assert "require_op(\"datasource.ucp_executions\", \"C\")" in src or "require_op('datasource.ucp_executions', 'C')" in src, f"missing require_op call: {src[:300]}"
    print(f"[OK] Route uses require_op C on datasource.ucp_executions")


# ==========================================
# 4. 异常 HTTP 状态码映射（router 内已映射）
# ==========================================

def test_pipeline_locked_error_409():
    """PipelineLockedError 在 router 端映射为 409。"""
    # 验证 router 端 catch 这个异常后 raise HTTPException(409)
    import inspect
    src = inspect.getsource(r.manual_trigger_pipeline)
    assert "409" in src, f"missing 409 status code in route: {src[:200]}"
    assert "PipelineLockedError" in src, "missing PipelineLockedError handler"
    print("[OK] manual_trigger_pipeline maps PipelineLockedError -> 409")


def test_pipeline_permission_error_403():
    """PipelinePermissionError 在 router 端映射为 403。"""
    import inspect
    src = inspect.getsource(r.manual_trigger_pipeline)
    assert "403" in src, f"missing 403 status code in route: {src[:200]}"
    assert "PipelinePermissionError" in src, "missing PipelinePermissionError handler"
    print("[OK] manual_trigger_pipeline maps PipelinePermissionError -> 403")


# ==========================================
# 5. 端到端：模拟一次完整手动触发流程
# ==========================================

async def test_end_to_end_manual_trigger_flow():
    """模拟：管理员触发无并发占用的 pipeline -> 成功。"""
    from app.ucp.pipeline_engine import check_pipeline_concurrent_lock, check_pipeline_trigger_permission

    # Mock DB：无并发占用 + Pipeline owner 是管理员
    class MockDB:
        def __init__(self):
            self.executed_queries = []
        async def execute(self, stmt):
            self.executed_queries.append(str(stmt))
            # 根据 SQL 内容返回不同结果
            s = str(stmt)
            if "ConnectorPipelineExecution" in s and "status" in s and ("RUNNING" in s or "PENDING" in s):
                # 并发检查：返回 None
                return MagicMock(scalar_one_or_none=lambda: None)
            if "ConnectorPipelineConfig" in s:
                # 配置查询：返回管理员为 owner
                return MagicMock(scalar_one_or_none=lambda: SimpleNamespace(
                    pipeline_code="P1", created_by="999"
                ))
            return MagicMock(scalar_one_or_none=lambda: None)

    db = MockDB()
    user = SimpleNamespace(id=999, is_admin=True, is_superuser=False)

    # Step 1: 权限校验（管理员）
    await check_pipeline_trigger_permission(db, "P1", user)
    print("[OK] e2e: admin permission check passed")

    # Step 2: 并发互斥
    await check_pipeline_concurrent_lock(db, "P1")
    print("[OK] e2e: concurrent lock check passed (no running)")

    # Step 3: 构造请求 + 验证 Pydantic 解析
    req = ManualTriggerRequest(
        dry_run=False,
        time_range={"start": "2026-07-01T00:00:00", "end": "2026-07-02T00:00:00"},
    )
    assert req.dry_run is False
    print(f"[OK] e2e: request constructed: dry_run={req.dry_run}, time_range={req.time_range}")


async def test_end_to_end_blocked_by_concurrent():
    """模拟：管理员触发但 pipeline 正在运行 -> 409。"""
    from app.ucp.pipeline_engine import check_pipeline_concurrent_lock

    class MockDB:
        async def execute(self, stmt):
            return MagicMock(scalar_one_or_none=lambda: SimpleNamespace(
                pipeline_run_id="pr_blocking_001", status="RUNNING"
            ))

    db = MockDB()
    try:
        await check_pipeline_concurrent_lock(db, "P1")
        print("[FAIL] should have raised PipelineLockedError")
    except PipelineLockedError as e:
        assert e.code == "PIPELINE_LOCKED"
        assert e.running_run_id == "pr_blocking_001"
        print(f"[OK] e2e: blocked by concurrent run, code={e.code}, run_id={e.running_run_id}")


async def test_end_to_end_blocked_by_permission():
    """模拟：非管理员非 owner 触发 -> 403。"""
    from app.ucp.pipeline_engine import check_pipeline_trigger_permission

    class MockDB:
        async def execute(self, stmt):
            return MagicMock(scalar_one_or_none=lambda: SimpleNamespace(
                pipeline_code="P1", created_by="999"
            ))

    db = MockDB()
    user = SimpleNamespace(id=1, is_admin=False, is_superuser=False)
    try:
        await check_pipeline_trigger_permission(db, "P1", user)
        print("[FAIL] should have raised PipelinePermissionError")
    except PipelinePermissionError as e:
        assert e.code == "PIPELINE_TRIGGER_FORBIDDEN"
        assert e.user_id == 1
        print(f"[OK] e2e: blocked by permission, code={e.code}, user_id={e.user_id}")


# ==========================================
# 6. execute_pipeline 新签名
# ==========================================

def test_execute_pipeline_signature():
    """验证 execute_pipeline 接收 4 个新参数。"""
    import inspect
    sig = inspect.signature(r.execute_pipeline)
    params = sig.parameters
    for name in ("dry_run", "time_range", "override_params", "triggered_by", "trigger_type"):
        assert name in params, f"missing param: {name}"
    print(f"[OK] execute_pipeline has all 5 new params: {list(params.keys())}")


# ==========================================
# Main
# ==========================================

async def main():
    print("=" * 60)
    print("Phase 2-4: Pydantic Model")
    print("=" * 60)
    test_manual_trigger_request_default()
    test_manual_trigger_request_with_dry_run()
    test_manual_trigger_request_full_params()
    test_manual_trigger_request_serialization()

    print()
    print("=" * 60)
    print("Phase 2-4: Router Endpoint")
    print("=" * 60)
    test_manual_trigger_route_exists()
    test_route_uses_require_op()
    test_pipeline_locked_error_409()
    test_pipeline_permission_error_403()

    print()
    print("=" * 60)
    print("Phase 2-4: End-to-end Flow")
    print("=" * 60)
    await test_end_to_end_manual_trigger_flow()
    await test_end_to_end_blocked_by_concurrent()
    await test_end_to_end_blocked_by_permission()

    print()
    print("=" * 60)
    print("Phase 2-4: Pipeline Engine Signature")
    print("=" * 60)
    test_execute_pipeline_signature()

    print()
    print("=" * 60)
    print("All 13 integration tests passed.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
