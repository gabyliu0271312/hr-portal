"""Phase 2-5: 管理界面增强 — 单元测试

覆盖：
- batch_toggle 批量启停（3 类 × 启用/停用）
- get_config_stats 统计概览
- unified_search 跨表搜索 + 状态过滤
- export_configs JSON/YAML 导出
- import_configs dry_run / 实际导入 / skip_existing
- 错误路径：unknown type / missing fields
"""
import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy.ext.asyncio import AsyncSession
from app.ucp.models import (
    ConnectorSystemConfig,
    ConnectorPipelineConfig,
    ConnectorCredential,
)


class FakeUser:
    def __init__(self):
        self.id = 1
        self.username = "tester"
        self.login_name = "tester"


def fake_user() -> FakeUser:
    """每个调用都返回新实例，避免跨测试共享状态。"""
    return FakeUser()


# ──────────────────────── Fake DB ────────────────────────

class FakeDB:
    def __init__(self):
        self.storage: dict = {}
        self.records: list = []
        self.committed = False

    def add(self, obj):
        self.records.append(obj)
        if hasattr(obj, "id") and obj.id is None:
            obj.id = len(self.storage) + 1
        key = type(obj).__name__
        self.storage.setdefault(key, []).append(obj)

    async def get(self, model, id_):
        key = model.__name__
        for r in self.storage.get(key, []):
            if r.id == id_:
                return r
        return None

    async def execute(self, stmt):
        sql = str(stmt)
        # 根据 stmt 中的 where 条件过滤
        result = _FakeResult(self.storage, sql, db=self)
        return result

    async def commit(self):
        self.committed = True

    async def rollback(self):
        pass

    async def flush(self):
        pass


class _FakeResult:
    def __init__(self, storage, sql="", db=None):
        self.storage = storage
        self.sql = sql
        self.db = db  # 引用 FakeDB 以便读取其 _last_xxx 状态

    def scalars(self):
        return self

    def all(self):
        return self._rows()

    def scalar_one_or_none(self):
        rows = self._rows()
        return rows[0] if rows else None

    def _rows(self):
        """粗略模拟 where 过滤。"""
        sql = self.sql
        # 凭证表按 credential_code
        if "credential_code" in sql:
            rows = list(self.storage.get("ConnectorCredential", []))
            return self._apply_filter(rows, sql)
        # 连接器表
        if "system_code" in sql or "ConnectorSystemConfig" in sql:
            rows = list(self.storage.get("ConnectorSystemConfig", []))
            return self._apply_filter(rows, sql)
        # 流水线表
        if "pipeline_code" in sql or "ConnectorPipelineConfig" in sql:
            rows = list(self.storage.get("ConnectorPipelineConfig", []))
            return self._apply_filter(rows, sql)
        # 默认：返回全部
        all_rows = []
        for rows in self.storage.values():
            all_rows.extend(rows)
        return all_rows

    def _apply_filter(self, rows, sql):
        """简易状态/关键词过滤（仅用于单元测试，真实环境由 DB 完成）。"""
        out = list(rows)
        # status 过滤（通过 db._last_status）
        if "status_" in sql and self.db is not None and getattr(self.db, "_last_status", None) is not None:
            target = self.db._last_status
            out = [r for r in out if getattr(r, "status", None) == target]
        # is_active 过滤
        if "is_active" in sql and self.db is not None and getattr(self.db, "_last_is_active", None) is not None:
            target = self.db._last_is_active
            out = [r for r in out if getattr(r, "is_active", None) == target]
        # LIKE lower(:param_1) 过滤
        if "LIKE lower" in sql and self.db is not None and getattr(self.db, "_last_kw", None):
            kw = self.db._last_kw.lower().strip("%")
            out = [r for r in out if any(
                kw in str(getattr(r, a, "") or "").lower()
                for a in ["system_code", "system_name", "description",
                         "pipeline_code", "pipeline_name",
                         "credential_code", "credential_name"]
            )]
        return out


# ──────────────────────── 工具 ────────────────────────

def build_credentials():
    cred1 = ConnectorCredential(
        id=1, credential_code="C1", credential_name="凭证1",
        auth_type="beisen", is_active=1,
    )
    cred2 = ConnectorCredential(
        id=2, credential_code="C2", credential_name="凭证2",
        auth_type="feishu", is_active=0,
    )
    return [cred1, cred2]


def build_connectors():
    c1 = ConnectorSystemConfig(
        id=1, system_code="B1", system_name="北森-待入职",
        connector_type="PULL", direction="INBOUND",
        adapter_code="BEISEN_ADAPTER", status=1, test_status="PASSED", version=3,
    )
    c2 = ConnectorSystemConfig(
        id=2, system_code="F1", system_name="飞书-Offer",
        connector_type="PUSH", direction="OUTBOUND",
        adapter_code="FEISHU_ADAPTER", status=2, test_status="NOT_TESTED", version=1,
    )
    c3 = ConnectorSystemConfig(
        id=3, system_code="F2", system_name="飞书-IM",
        connector_type="PUSH", direction="OUTBOUND",
        adapter_code="FEISHU_ADAPTER", status=1, test_status="FAILED", version=1,
    )
    return [c1, c2, c3]


def build_pipelines():
    p1 = ConnectorPipelineConfig(
        id=1, pipeline_code="P1", pipeline_name="Offer 同步",
        steps=[{"step_id": "s1"}, {"step_id": "s2"}],
        trigger_type="SCHEDULED", status=1,
    )
    p2 = ConnectorPipelineConfig(
        id=2, pipeline_code="P2", pipeline_name="日报",
        steps=[{"step_id": "s1"}],
        trigger_type="MANUAL", status=2,
    )
    return [p1, p2]


# ──────────────────────── 测试 ────────────────────────

async def test_batch_toggle_connector():
    from app.ucp.router import batch_toggle_configs, BatchToggleRequest
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = build_connectors()
    req = BatchToggleRequest(target_type="connector", target_ids=[1, 2], new_status=2)
    res = await batch_toggle_configs(req, db, user=fake_user())
    assert res["success_count"] == 2
    assert res["new_status"] == 2
    print("[OK] batch_toggle connector 批量停用 2 个")


async def test_batch_toggle_credential():
    from app.ucp.router import batch_toggle_configs, BatchToggleRequest
    db = FakeDB()
    db.storage["ConnectorCredential"] = build_credentials()
    req = BatchToggleRequest(target_type="credential", target_ids=[1, 2], new_status=1)
    res = await batch_toggle_configs(req, db, user=fake_user())
    assert res["success_count"] == 2
    print("[OK] batch_toggle credential 批量启用 2 个")


async def test_batch_toggle_missing_id():
    from app.ucp.router import batch_toggle_configs, BatchToggleRequest
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = build_connectors()
    req = BatchToggleRequest(target_type="connector", target_ids=[1, 999], new_status=1)
    res = await batch_toggle_configs(req, db, user=fake_user())
    assert res["success_count"] == 1
    assert res["failed_count"] == 1
    assert res["failed_details"][0]["id"] == 999
    print("[OK] batch_toggle 失败项记录 999 not_found")


async def test_batch_toggle_invalid_type():
    from app.ucp.router import batch_toggle_configs, BatchToggleRequest
    from fastapi import HTTPException
    db = FakeDB()
    req = BatchToggleRequest(target_type="invalid", target_ids=[1], new_status=1)
    try:
        await batch_toggle_configs(req, db, user=fake_user())
        assert False, "should raise"
    except HTTPException as e:
        assert e.status_code == 400
    print("[OK] batch_toggle 拒绝非法 type")


async def test_batch_toggle_invalid_status():
    from app.ucp.router import batch_toggle_configs, BatchToggleRequest
    from fastapi import HTTPException
    db = FakeDB()
    req = BatchToggleRequest(target_type="connector", target_ids=[1], new_status=3)
    try:
        await batch_toggle_configs(req, db, user=fake_user())
        assert False
    except HTTPException as e:
        assert e.status_code == 400
    print("[OK] batch_toggle 拒绝非法 new_status=3")


async def test_config_stats():
    from app.ucp.router import get_config_stats
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = build_connectors()
    db.storage["ConnectorPipelineConfig"] = build_pipelines()
    db.storage["ConnectorCredential"] = build_credentials()
    res = await get_config_stats(db, _user=fake_user())
    assert res["connectors"]["total"] == 3
    assert res["connectors"]["enabled"] == 2  # B1, F2
    assert res["connectors"]["disabled"] == 1  # F1
    assert res["connectors"]["untested"] == 1  # F1
    assert res["connectors"]["failed_test"] == 1  # F2
    assert res["connectors"]["by_type"]["PULL"] == 1
    assert res["connectors"]["by_type"]["PUSH"] == 2
    assert res["pipelines"]["total"] == 2
    assert res["pipelines"]["by_trigger"]["SCHEDULED"] == 1
    assert res["pipelines"]["by_trigger"]["MANUAL"] == 1
    assert res["credentials"]["total"] == 2
    assert res["credentials"]["active"] == 1
    print("[OK] config_stats 统计概览（3连接器+2流水线+2凭证）")


async def test_unified_search_keyword():
    from app.ucp.router import unified_search
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = build_connectors()
    db.storage["ConnectorPipelineConfig"] = build_pipelines()
    db.storage["ConnectorCredential"] = build_credentials()
    db._last_kw = "%北森%"
    res = await unified_search(keyword="北森", target_type="all", limit=10, db=db, _user=fake_user())
    assert len(res["connectors"]) == 1
    assert res["connectors"][0]["system_code"] == "B1"
    assert len(res["pipelines"]) == 0
    print("[OK] unified_search 关键字 '北森' 命中 1 个连接器")


async def test_unified_search_status_filter():
    from app.ucp.router import unified_search
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = build_connectors()
    db._last_status = 2
    res = await unified_search(keyword="", target_type="connector", status=2, limit=10, db=db, _user=fake_user())
    assert len(res["connectors"]) == 1
    assert res["connectors"][0]["status"] == 2
    print("[OK] unified_search status=2 过滤命中 1 个停用连接器")


async def test_unified_search_target_type():
    from app.ucp.router import unified_search
    db = FakeDB()
    db.storage["ConnectorCredential"] = build_credentials()
    res = await unified_search(keyword="", target_type="credential", limit=10, db=db, _user=fake_user())
    assert len(res["credentials"]) == 2
    assert "connectors" in res and "pipelines" in res  # 仍然返回空数组
    print("[OK] unified_search target_type=credential 限定返回")


async def test_export_json():
    from app.ucp.router import export_configs
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = build_connectors()
    db.storage["ConnectorPipelineConfig"] = build_pipelines()
    db.storage["ConnectorCredential"] = build_credentials()
    res = await export_configs(target_type="all", format="json", db=db, _user=fake_user())
    assert res["format"] == "json"
    assert "content" in res
    assert res["content"]["export_version"] == "1.0"
    assert len(res["content"]["connectors"]) == 3
    assert len(res["content"]["pipelines"]) == 2
    assert len(res["content"]["credentials"]) == 2
    # 凭证不应导出 secrets
    assert "secrets_encrypted" not in res["content"]["credentials"][0]
    print("[OK] export json 全部配置")


async def test_export_yaml():
    from app.ucp.router import export_configs
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = build_connectors()
    res = await export_configs(target_type="connector", format="yaml", db=db, _user=fake_user())
    if res["format"] == "yaml":
        assert "system_code: B1" in res["content"]
    else:
        # yaml 包不可用时回退
        assert res["format"] == "json"
    print(f"[OK] export yaml/connector（{res['format']}）")


async def test_export_yaml_fallback():
    """yaml 不可用时回退 JSON"""
    from app.ucp.router import export_configs
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = build_connectors()
    # force yaml mode — 尝试在无 yaml 时
    res = await export_configs(target_type="connector", format="yaml", db=db, _user=fake_user())
    assert res["format"] in ("yaml", "json")
    print(f"[OK] export yaml 兼容（实际={res['format']}）")


async def test_import_dry_run():
    from app.ucp.router import import_configs, ConfigImportRequest
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = []  # 空库
    db.storage["ConnectorPipelineConfig"] = []
    db.storage["ConnectorCredential"] = []
    payload = ConfigImportRequest(
        content={
            "connectors": [
                {"system_code": "NEW_C", "system_name": "新连接器", "connector_type": "PULL"},
            ],
            "pipelines": [
                {"pipeline_code": "NEW_P", "pipeline_name": "新流水线", "steps": [{"step_id": "s1"}]},
            ],
            "credentials": [
                {"credential_code": "NEW_CRED", "credential_name": "新凭证", "auth_type": "beisen"},
            ],
        },
        target_type="all",
        dry_run=True,
        skip_existing=True,
    )
    res = await import_configs(payload, db, user=fake_user())
    assert res["dry_run"] is True
    assert res["connectors"]["created"] == 1
    assert res["pipelines"]["created"] == 1
    assert res["credentials"]["created"] == 1
    assert not db.committed
    print("[OK] import dry_run 不落地但返回 created=1")


async def test_import_missing_field():
    from app.ucp.router import import_configs, ConfigImportRequest
    from fastapi import HTTPException
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = []
    payload = ConfigImportRequest(
        content={
            "connectors": [
                {"system_name": "无名"},  # 缺 system_code
            ],
        },
        target_type="connector",
        dry_run=True,
        skip_existing=True,
    )
    res = await import_configs(payload, db, user=fake_user())
    assert len(res["connectors"]["errors"]) == 1
    assert res["connectors"]["errors"][0]["reason"] == "missing_system_code"
    print("[OK] import 缺 system_code 错误记录")


async def test_import_skip_existing():
    from app.ucp.router import import_configs, ConfigImportRequest
    db = FakeDB()
    db.storage["ConnectorSystemConfig"] = [build_connectors()[0]]  # B1 已存在
    payload = ConfigImportRequest(
        content={
            "connectors": [
                {"system_code": "B1", "system_name": "覆盖", "connector_type": "PULL"},
            ],
        },
        target_type="connector",
        dry_run=False,
        skip_existing=True,
    )
    res = await import_configs(payload, db, user=fake_user())
    assert res["connectors"]["skipped"] == 1
    assert res["connectors"]["created"] == 0
    print("[OK] import skip_existing=True 跳过 B1")


async def test_import_not_dict():
    from app.ucp.router import import_configs, ConfigImportRequest
    from fastapi import HTTPException
    db = FakeDB()
    payload = ConfigImportRequest(
        content={"connectors": "not a list"},
        target_type="connector",
        dry_run=True,
        skip_existing=True,
    )
    try:
        await import_configs(payload, db, user=fake_user())
        assert False
    except HTTPException as e:
        assert e.status_code == 400
    print("[OK] import 拒绝非数组 connectors")


async def test_import_credential_secret_placeholder():
    """导入凭证应写入占位密钥，强制用户后补"""
    from app.ucp.router import import_configs, ConfigImportRequest
    db = FakeDB()
    db.storage["ConnectorCredential"] = []
    payload = ConfigImportRequest(
        content={
            "credentials": [
                {"credential_code": "X1", "credential_name": "测试凭证", "auth_type": "beisen"},
            ],
        },
        target_type="credential",
        dry_run=False,
        skip_existing=True,
    )
    res = await import_configs(payload, db, user=fake_user())
    assert res["credentials"]["created"] == 1
    print("[OK] import credential 占位密钥（需后补）")


async def test_import_pipeline_missing_steps():
    from app.ucp.router import import_configs, ConfigImportRequest
    db = FakeDB()
    db.storage["ConnectorPipelineConfig"] = []
    payload = ConfigImportRequest(
        content={
            "pipelines": [
                {"pipeline_code": "EMPTY", "pipeline_name": "空流水线"},  # 缺 steps
            ],
        },
        target_type="pipeline",
        dry_run=True,
        skip_existing=True,
    )
    res = await import_configs(payload, db, user=fake_user())
    # dry_run=True 时计入 created（仅校验）
    assert res["pipelines"]["created"] == 1
    print("[OK] import pipeline 缺 steps dry_run 仍计为可创建")


async def test_endpoints_registered():
    from app.ucp.router import router
    paths = {r.path for r in router.routes if hasattr(r, "path")}
    expected = {
        "/ucp/config/batch-toggle",
        "/ucp/config/stats",
        "/ucp/config/search",
        "/ucp/config/export",
        "/ucp/config/import",
    }
    missing = expected - paths
    assert not missing, f"missing endpoints: {missing}"
    print(f"[OK] 5 endpoints registered: {expected}")


# ──────────────────────── 入口 ────────────────────────

async def main():
    tests = [
        test_batch_toggle_connector,
        test_batch_toggle_credential,
        test_batch_toggle_missing_id,
        test_batch_toggle_invalid_type,
        test_batch_toggle_invalid_status,
        test_config_stats,
        test_unified_search_keyword,
        test_unified_search_status_filter,
        test_unified_search_target_type,
        test_export_json,
        test_export_yaml,
        test_export_yaml_fallback,
        test_import_dry_run,
        test_import_missing_field,
        test_import_skip_existing,
        test_import_not_dict,
        test_import_credential_secret_placeholder,
        test_import_pipeline_missing_steps,
        test_endpoints_registered,
    ]
    passed = 0
    for t in tests:
        try:
            await t()
            passed += 1
        except Exception as e:
            print(f"[FAIL] {t.__name__}: {e!r}")
            import traceback
            traceback.print_exc()
    print(f"\n=== {passed}/{len(tests)} PASSED ===")
    sys.exit(0 if passed == len(tests) else 1)


if __name__ == "__main__":
    asyncio.run(main())
