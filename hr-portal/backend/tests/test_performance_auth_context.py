from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import JWTError

from app.auth.password import hash_password
from app.core.jwt import (
    create_access_token,
    create_performance_system_access_token,
    decode_token,
    decode_token_payload,
)
from app.performance import auth_context
from app.performance.auth_context import (
    PerformanceAccessContext,
    PerformanceRoleGrant,
    get_performance_access_context,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import (
    CYCLE_STATUS_ACTIVE,
    NODE_STATUS_OPEN,
    OBJECT_ACTION_RESULT_READ,
    build_object_authorization_request,
)
from app.performance.router import PerformanceIdentityLinkIn, _require_performance_super_admin
from app.performance.models import (
    PerformanceSystemAccount,
    SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN,
)
from app.performance.router import PerformanceLoginIn, login_performance_system_account


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _LoginDb:
    def __init__(self, account):
        self.account = account
        self.commits = 0

    async def execute(self, _statement):
        return _ScalarResult(self.account)

    async def commit(self):
        self.commits += 1


class _ContextDb:
    def __init__(self, system_account=None, portal_user=None):
        self.system_account = system_account
        self.portal_user = portal_user

    async def get(self, model, _subject_id):
        if model is PerformanceSystemAccount:
            return self.system_account
        return self.portal_user


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _request():
    return SimpleNamespace(state=SimpleNamespace())


def _system_account(*, active=True):
    return PerformanceSystemAccount(
        id=31,
        username="performance-root",
        display_name="绩效超级管理员",
        password_hash=hash_password("Performance@2026"),
        account_type=SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN,
        is_active=active,
    )


def test_system_account_token_is_rejected_by_portal_decoder():
    token = create_performance_system_access_token(31)

    with pytest.raises(JWTError):
        decode_token(token)

    assert decode_token(create_access_token(9)) == 9
    assert decode_token_payload(token)["subject_type"] == "PERFORMANCE_SYSTEM_ACCOUNT"


@pytest.mark.asyncio
async def test_standalone_performance_login_updates_last_login_and_issues_system_token():
    account = _system_account()
    db = _LoginDb(account)

    result = await login_performance_system_account(
        PerformanceLoginIn(username=account.username, password="Performance@2026"),
        db,
    )

    assert db.commits == 1
    assert account.last_login_at is not None
    assert decode_token_payload(result.access_token)["subject_type"] == "PERFORMANCE_SYSTEM_ACCOUNT"


@pytest.mark.asyncio
async def test_standalone_login_rejects_invalid_password_and_disabled_account():
    with pytest.raises(HTTPException) as invalid_password:
        await login_performance_system_account(
            PerformanceLoginIn(username="performance-root", password="wrong-password"),
            _LoginDb(_system_account()),
        )
    assert invalid_password.value.status_code == 401

    with pytest.raises(HTTPException) as disabled_account:
        await login_performance_system_account(
            PerformanceLoginIn(username="performance-root", password="Performance@2026"),
            _LoginDb(_system_account(active=False)),
        )
    assert disabled_account.value.status_code == 401


@pytest.mark.asyncio
async def test_system_account_context_uses_live_authorization(monkeypatch):
    async def fake_authorization(_db, subject_type, subject_id):
        assert (subject_type, subject_id) == ("SYSTEM_ACCOUNT", 31)
        return (
            (PerformanceRoleGrant("performance.super_admin", "GLOBAL", "GLOBAL"),),
            ("performance.admin_accounts.manage",),
        )

    monkeypatch.setattr(auth_context, "load_active_authorization", fake_authorization)
    request = _request()
    context = await get_performance_access_context(
        request,
        _creds(create_performance_system_access_token(31)),
        _ContextDb(system_account=_system_account()),
    )

    assert context.subject_type == "SYSTEM_ACCOUNT"
    assert context.permission_codes == ("performance.admin_accounts.manage",)
    assert "performance.cycles.manage" not in context.permission_codes
    assert request.state.performance_access_context is context


@pytest.mark.asyncio
async def test_portal_context_requires_performance_entry_permission(monkeypatch):
    async def denied_entry(*_args):
        return False

    monkeypatch.setattr(auth_context, "user_has_op", denied_entry)
    portal_user = SimpleNamespace(id=8, display_name="Portal User", is_active=True)

    with pytest.raises(HTTPException) as denied:
        await get_performance_access_context(
            _request(),
            _creds(create_access_token(8)),
            _ContextDb(portal_user=portal_user),
        )

    assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_portal_context_combines_portal_entry_and_performance_roles(monkeypatch):
    async def has_entry(_user, _db, menu_code, _operation):
        return menu_code == "performance.app"

    async def fake_authorization(_db, subject_type, subject_id):
        assert (subject_type, subject_id) == ("PORTAL_USER", 8)
        return (
            (PerformanceRoleGrant("performance.admin", "GLOBAL", "GLOBAL"),),
            ("performance.cycles.manage",),
        )

    monkeypatch.setattr(auth_context, "user_has_op", has_entry)
    monkeypatch.setattr(auth_context, "load_active_authorization", fake_authorization)
    portal_user = SimpleNamespace(id=8, display_name="Portal User", is_active=True)

    context = await get_performance_access_context(
        _request(),
        _creds(create_access_token(8)),
        _ContextDb(portal_user=portal_user),
    )

    assert context.subject_type == "PORTAL_USER"
    assert context.portal_entry_permissions == ("performance.app",)
    assert context.role_grants[0].code == "performance.admin"
    assert context.permission_codes == ("performance.cycles.manage",)


@pytest.mark.asyncio
async def test_permission_dependency_rejects_system_account_overreach():
    dependency = require_performance_permission("performance.cycles.manage")
    context = PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT",
        subject_id=31,
        display_name="绩效超级管理员",
        account_type=SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN,
        portal_entry_permissions=(),
        role_grants=(PerformanceRoleGrant("performance.super_admin", "GLOBAL", "GLOBAL"),),
        permission_codes=("performance.admin_accounts.manage",),
    )

    with pytest.raises(HTTPException) as denied:
        await dependency(context)

    assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_trusted_system_account_actor_uses_authenticated_context():
    context = PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT",
        subject_id=31,
        display_name="绩效超级管理员",
        account_type=SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN,
        portal_entry_permissions=(),
        role_grants=(PerformanceRoleGrant("performance.super_admin", "GLOBAL", "GLOBAL"),),
        permission_codes=("performance.admin_accounts.manage",),
    )

    actor = await resolve_trusted_performance_actor(_ContextDb(), context)

    assert (actor.actor_type, actor.actor_ref) == ("SYSTEM_ACCOUNT", "31")


@pytest.mark.asyncio
async def test_performance_admin_account_routes_require_system_super_admin():
    portal_context = PerformanceAccessContext(
        subject_type="PORTAL_USER",
        subject_id=8,
        display_name="Portal User",
        account_type=None,
        portal_entry_permissions=("performance.admin",),
        role_grants=(),
        permission_codes=("performance.admin_accounts.manage",),
    )

    with pytest.raises(HTTPException) as denied:
        await _require_performance_super_admin(portal_context)

    assert denied.value.status_code == 403


def test_identity_link_rejects_blank_employee_number():
    with pytest.raises(ValidationError):
        PerformanceIdentityLinkIn(portal_user_id=8, employee_no="   ")
