from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from starlette.requests import Request

from app.auth import feishu_client, feishu_user_grant as grants
from app.core.config import settings
from app.performance import rich_text_router as rich
from app.performance.auth_context import PerformanceAccessContext


def context(**values):
    return replace(PerformanceAccessContext(
        subject_type="PORTAL_USER", subject_id=7, display_name="User", account_type=None,
        portal_entry_permissions=("performance.app",), role_grants=(), permission_codes=(),
    ), **values)


@pytest.mark.parametrize("path,kind", [("docs", "doc"), ("docx", "docx"), ("wiki", "wiki"), ("sheets", "sheet"), ("base", "bitable"), ("file", "file")])
def test_document_reference(path, kind):
    assert rich.document_reference(f"https://example.feishu.cn/{path}/Token123?from=copy#anchor") == {"doc_type": kind, "doc_token": "Token123"}


@pytest.mark.parametrize("url", [
    "https://feishu.cn.evil.test/docx/abc", "https://example.com/docx/abc",
    "http://example.feishu.cn/docx/abc", "https://example.feishu.cn:8443/docx/abc",
    "https://user:pass@example.feishu.cn/docx/abc", "https://127.0.0.1/docx/abc",
    "https://example.feishu.cn/docx/a/b", "https://example.larksuite.com/docx/abc",
    "https://example.feishu.cn/docx/%2fabc", "javascript:alert(1)",
])
def test_untrusted_urls_never_resolve(url):
    assert rich.document_reference(url) is None


@pytest.mark.asyncio
async def test_metadata_uses_only_fixed_host_current_user_and_exact_document(monkeypatch):
    reference = {"doc_type": "docx", "doc_token": "Token123"}
    real_client = httpx.AsyncClient
    calls = []

    def handler(request):
        import json
        calls.append(request)
        assert str(request.url) == rich._METADATA_URL
        assert request.headers["Authorization"] == "Bearer user-token"
        assert json.loads(request.content) == {"request_docs": [reference], "with_url": False}
        return httpx.Response(200, json={"code": 0, "data": {"metas": [dict(reference, title="工作复盘")], "failed_list": []}})

    monkeypatch.setattr(rich.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    assert await rich.fetch_title(reference, "user-token") == "工作复盘"
    assert len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("response", [
    (403, {"code": 970003}), (302, {}), (200, {"code": 970003}), (200, []),
    (200, {"code": 0, "data": {"failed_list": [{"code": 970005}]}}),
    (200, {"code": 0, "data": {"metas": [{"doc_type": "docx", "doc_token": "other", "title": "secret"}]}}),
])
async def test_upstream_errors_and_mismatches_fall_back(monkeypatch, response):
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(response[0], json=response[1]))
    monkeypatch.setattr(rich.httpx, "AsyncClient", lambda **kwargs: real_client(transport=transport, **kwargs))
    assert await rich.fetch_title({"doc_type": "docx", "doc_token": "Token123"}, "user-token") is None


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["timeout", "not_json"])
async def test_network_and_non_json_fall_back(monkeypatch, mode):
    real_client = httpx.AsyncClient
    def handler(request):
        if mode == "timeout":
            raise httpx.ReadTimeout("timeout", request=request)
        return httpx.Response(200, text="not JSON")
    monkeypatch.setattr(rich.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    assert await rich.fetch_title({"doc_type": "docx", "doc_token": "Token123"}, "user-token") is None


@pytest.mark.asyncio
@pytest.mark.parametrize("ctx", [context(subject_type="SYSTEM_ACCOUNT"), context(portal_entry_permissions=("performance.admin",)),
    context(switch_session_id="switch"), context(operator_user_id=9), context(effective_employee_no="E")])
async def test_denied_context_has_no_token_lookup_or_external_call(monkeypatch, ctx):
    monkeypatch.setattr(settings, "FEISHU_DOCUMENT_TITLE_ENABLED", True)
    lookup, fetch = AsyncMock(), AsyncMock()
    monkeypatch.setattr(rich, "get_user_access_token", lookup)
    monkeypatch.setattr(rich, "fetch_title", fetch)
    result = await rich.link_title(rich.LinkTitleIn(url="https://example.feishu.cn/docx/Token123"), Request({"type": "http", "headers": []}), ctx, object())
    assert result.title is None
    lookup.assert_not_called()
    fetch.assert_not_called()


@pytest.mark.asyncio
async def test_route_session_token_and_no_tenant_fallback(monkeypatch):
    monkeypatch.setattr(settings, "FEISHU_DOCUMENT_TITLE_ENABLED", True)
    lookup, fetch = AsyncMock(return_value=None), AsyncMock(return_value="Title")
    monkeypatch.setattr(rich, "get_user_access_token", lookup)
    monkeypatch.setattr(rich, "fetch_title", fetch)
    request = Request({"type": "http", "headers": [(b"authorization", b"Bearer portal-jwt")]})
    result = await rich.link_title(rich.LinkTitleIn(url="https://example.feishu.cn/docx/Token123"), request, context(), "db")
    assert result.title is None
    lookup.assert_awaited_once_with("db", 7, "portal-jwt")
    fetch.assert_not_called()
    lookup.return_value = "user-token"
    assert (await rich.link_title(rich.LinkTitleIn(url="https://example.feishu.cn/docx/Token123"), request, context(), "db")).title == "Title"


@pytest.mark.asyncio
async def test_grants_encrypted_session_bound_expiring_and_identity_checked(monkeypatch):
    monkeypatch.setattr(settings, "FEISHU_DOCUMENT_TITLE_ENABLED", True)
    monkeypatch.setattr(settings, "FEISHU_APP_ID", "app")
    user = SimpleNamespace(id=7, feishu_user_id="open-id", is_active=True)
    db = SimpleNamespace(execute=AsyncMock(), merge=AsyncMock())
    identity = feishu_client.FeishuUser("open-id", "User", None, None, "private-user-token", 3600, grants.DOCUMENT_METADATA_SCOPE)
    assert "private-user-token" not in repr(identity)
    await grants.retain_user_grant(db, user, "portal-jwt", identity)
    grant = db.merge.call_args.args[0]
    assert grant.access_token_encrypted != "private-user-token"
    assert grant.session_digest == grants.session_digest("portal-jwt")
    assert "portal-jwt" not in grant.session_digest
    async def get(model, key):
        if model is grants.FeishuUserGrant:
            return grant if key == grant.session_digest else None
        return user
    db.get = get
    assert await grants.get_user_access_token(db, 7, "portal-jwt") == "private-user-token"
    assert await grants.get_user_access_token(db, 8, "portal-jwt") is None
    assert await grants.get_user_access_token(db, 7, "other-jwt") is None
    user.feishu_user_id = "other-open-id"
    assert await grants.get_user_access_token(db, 7, "portal-jwt") is None
    user.feishu_user_id = "open-id"
    grant.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    assert await grants.get_user_access_token(db, 7, "portal-jwt") is None
    await grants.revoke_user_grants(db, 7)
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_missing_scope_retains_no_token(monkeypatch):
    monkeypatch.setattr(settings, "FEISHU_DOCUMENT_TITLE_ENABLED", True)
    db = SimpleNamespace(execute=AsyncMock(), merge=AsyncMock())
    user = SimpleNamespace(id=7, feishu_user_id="open-id")
    await grants.retain_user_grant(db, user, "portal", feishu_client.FeishuUser("open-id", "User", None, None, "token", 3600, ""))
    db.merge.assert_not_called()
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_enabled_oauth_uses_v2_and_request_scope(monkeypatch):
    monkeypatch.setattr(settings, "FEISHU_DOCUMENT_TITLE_ENABLED", True)
    monkeypatch.setattr(settings, "FEISHU_APP_ID", "app")
    parsed = urlsplit(feishu_client.get_authorize_url("csrf-state"))
    assert parsed.hostname == "accounts.feishu.cn"
    params = parse_qs(parsed.query)
    assert params["client_id"] == ["app"]
    assert set(params["scope"][0].split()) == {grants.DOCUMENT_METADATA_SCOPE, "contact:user.email:readonly", "contact:user.employee:readonly"}
    assert params["state"] == ["csrf-state"]
    real_client = httpx.AsyncClient
    def handler(request):
        if request.method == "POST":
            assert str(request.url) == "https://open.feishu.cn/open-apis/authen/v2/oauth/token"
            return httpx.Response(200, json={"code": 0, "access_token": "user-token", "expires_in": 3600, "scope": grants.DOCUMENT_METADATA_SCOPE})
        assert request.headers["Authorization"] == "Bearer user-token"
        return httpx.Response(200, json={"code": 0, "data": {"open_id": "open-id", "name": "User"}})
    monkeypatch.setattr(feishu_client.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    identity = await feishu_client.exchange_user_info("code")
    assert identity.open_id == "open-id"
    assert identity.access_token == "user-token"
    assert identity.expires_in == 3600


@pytest.mark.asyncio
async def test_disabled_oauth_keeps_legacy_login_and_does_not_retain_token(monkeypatch):
    monkeypatch.setattr(settings, "FEISHU_DOCUMENT_TITLE_ENABLED", False)
    assert "scope=" not in feishu_client.get_authorize_url("state")
    monkeypatch.setattr(feishu_client, "_get_app_access_token", AsyncMock(return_value="app-token"))
    real_client = httpx.AsyncClient
    def handler(request):
        if request.method == "POST":
            assert str(request.url).endswith("/authen/v1/oidc/access_token")
            assert request.headers["Authorization"] == "Bearer app-token"
            return httpx.Response(200, json={"code": 0, "data": {"access_token": "user-token"}})
        return httpx.Response(200, json={"code": 0, "data": {"open_id": "open-id", "name": "User"}})
    monkeypatch.setattr(feishu_client.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    identity = await feishu_client.exchange_user_info("code")
    assert identity.access_token == ""
    assert identity.open_id == "open-id"


def test_portal_tokens_are_unique_for_session_binding():
    from app.core.jwt import create_access_token, decode_token_payload
    first, second = create_access_token(7), create_access_token(7)
    assert first != second
    assert decode_token_payload(first)["sub"] == "7"
    assert decode_token_payload(first)["jti"] != decode_token_payload(second)["jti"]


@pytest.mark.asyncio
async def test_callback_retains_grant_without_leaking_token_and_logout_revokes(monkeypatch):
    from app.auth import router as auth
    monkeypatch.setattr(settings, "FEISHU_DOCUMENT_TITLE_ENABLED", True)
    monkeypatch.setattr(settings, "FEISHU_SSO_ENABLED", True)
    identity = feishu_client.FeishuUser("open-id", "User", "test@example.com", None, "private-user-token", 3600, grants.DOCUMENT_METADATA_SCOPE)
    monkeypatch.setattr(feishu_client, "exchange_user_info", AsyncMock(return_value=identity))
    user = SimpleNamespace(id=7, feishu_user_id="open-id", is_active=True)
    class Nested:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return False
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: user)),
                         commit=AsyncMock(), begin_nested=lambda: Nested())
    retain, revoke = AsyncMock(), AsyncMock()
    monkeypatch.setattr(grants, "retain_user_grant", retain)
    monkeypatch.setattr(grants, "revoke_user_grants", revoke)
    result = await auth.feishu_callback("code", db)
    retain.assert_awaited_once_with(db, user, result.access_token, identity)
    assert "private-user-token" not in result.model_dump_json()
    retain.side_effect = ValueError("bad encryption key")
    assert (await auth.feishu_callback("code", db)).access_token
    await auth.logout(user, db)
    revoke.assert_awaited_once_with(db, 7)


@pytest.mark.asyncio
async def test_callback_rejects_email_match_already_bound_to_different_identity(monkeypatch):
    from app.auth import router as auth
    from fastapi import HTTPException
    monkeypatch.setattr(settings, "FEISHU_SSO_ENABLED", True)
    identity = feishu_client.FeishuUser("new-open-id", "User", "test@example.com", None)
    monkeypatch.setattr(feishu_client, "exchange_user_info", AsyncMock(return_value=identity))
    user = SimpleNamespace(id=7, feishu_user_id="old-open-id", is_active=True)
    db = SimpleNamespace(execute=AsyncMock(side_effect=[SimpleNamespace(scalar_one_or_none=lambda: None), SimpleNamespace(scalar_one_or_none=lambda: user)]), commit=AsyncMock())
    with pytest.raises(HTTPException) as caught:
        await auth.feishu_callback("code", db)
    assert caught.value.status_code == 403
    assert user.feishu_user_id == "old-open-id"
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_http_endpoint_auth_and_payload_validation(monkeypatch):
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    app = FastAPI()
    app.include_router(rich.router, prefix="/api/v1")
    app.dependency_overrides[rich.get_session] = lambda: object()
    def denied(): raise HTTPException(401, "not logged in")
    app.dependency_overrides[rich.get_performance_access_context] = denied
    with TestClient(app) as client:
        assert client.post("/api/v1/performance/rich-text/link-title", json={"url": "https://example.feishu.cn/docx/abc"}).status_code == 401
        app.dependency_overrides[rich.get_performance_access_context] = lambda: context()
        monkeypatch.setattr(settings, "FEISHU_DOCUMENT_TITLE_ENABLED", False)
        response = client.post("/api/v1/performance/rich-text/link-title", json={"url": "https://example.feishu.cn/docx/abc"})
        assert response.status_code == 200
        assert response.json() == {"title": None}
        assert client.post("/api/v1/performance/rich-text/link-title", json={"url": "x" * 2049}).status_code == 422


def test_migration_upgrade_downgrade_roundtrip():
    import importlib.util
    import pathlib
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = pathlib.Path(__file__).parents[1] / "alembic/versions/0324_feishu_user_document_grants.py"
    spec = importlib.util.spec_from_file_location("grant_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE users (id BIGINT PRIMARY KEY)")
        migration.op = Operations(MigrationContext.configure(conn))
        migration.upgrade()
        conn.execute(sa.text("INSERT INTO users VALUES (7)"))
        conn.execute(sa.text("INSERT INTO feishu_user_grants VALUES (:digest,7,'open','app','encrypted',:expiry)"), {"digest": "d" * 64, "expiry": datetime.now(UTC)})
        assert conn.execute(sa.text("SELECT count(*) FROM feishu_user_grants")).scalar() == 1
        migration.downgrade()
        assert "feishu_user_grants" not in sa.inspect(conn).get_table_names()
        migration.upgrade()
        assert conn.execute(sa.text("SELECT count(*) FROM feishu_user_grants")).scalar() == 0
    engine.dispose()
