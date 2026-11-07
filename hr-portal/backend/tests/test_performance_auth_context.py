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
async def test_portal_admin_entry_grants_default_performance_admin_permissions(monkeypatch):
    async def has_entry(_user, _db, menu_code, _operation):
        return menu_code == "performance.admin"

    async def fake_authorization(_db, subject_type, subject_id):
        assert (subject_type, subject_id) == ("PORTAL_USER", 8)
        return (), ()

    monkeypatch.setattr(auth_context, "user_has_op", has_entry)
    monkeypatch.setattr(auth_context, "load_active_authorization", fake_authorization)
    portal_user = SimpleNamespace(id=8, display_name="Portal User", is_active=True)

    context = await get_performance_access_context(
        _request(),
        _creds(create_access_token(8)),
        _ContextDb(portal_user=portal_user),
    )

    assert context.portal_entry_permissions == ("performance.admin",)
    assert set(context.permission_codes) == {
        "performance.authorization.manage",
        "performance.configuration.manage",
        "performance.cycles.manage",
        "performance.projects.manage",
        "performance.audit.view",
    }
    assert "performance.admin_accounts.manage" not in context.permission_codes


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


@pytest.fixture
def identity_db(monkeypatch):
    from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine
    from sqlalchemy.orm import Session
    from app.performance.models import PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceIdentityLink
    from app.users.models import Role, User, UserRole

    from app.performance.models import PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceIdentityLink, PerformanceRole, PerformanceCycle, PerformanceProject, PerformanceProjectMember, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceNodeTask, PerformanceHrbpPermission

    engine = create_engine("sqlite://")
    tables = [User.__table__, Role.__table__, UserRole.__table__, PerformanceIdentityLink.__table__, PerformanceAuthorizationSnapshot.__table__, PerformanceAuthorizationSnapshotPerson.__table__, PerformanceRole.__table__, PerformanceCycle.__table__, PerformanceProject.__table__, PerformanceProjectMember.__table__, PerformanceProjectMemberSnapshot.__table__, PerformanceProjectNodeSnapshot.__table__, PerformanceNodeTask.__table__, PerformanceHrbpPermission.__table__]
    for table in tables:
        table.create(engine)
    roster = Table("identity_test_roster", MetaData(), Column("id", Integer, primary_key=True), Column("employee_no", String), Column("corporate_email", String), Column("full_name", String))
    roster.create(engine)
    monkeypatch.setattr(auth_context, "employee_roster_table", lambda: roster)
    session = Session(engine)
    session.add(User(id=8, login_name="actual-user", display_name="同名员工", email=" Person@Example.com ", password_hash="unused", is_active=True, feishu_user_id="ou_not_an_employee_no"))
    session.add(PerformanceAuthorizationSnapshot(id=1, cycle_ref="cycle:own", status="LOCKED"))
    session.add(PerformanceAuthorizationSnapshot(id=2, cycle_ref="cycle:other", status="LOCKED"))
    session.add(PerformanceAuthorizationSnapshotPerson(id=1, snapshot_id=1, employee_no="E001", display_name="同名员工"))
    session.add(PerformanceAuthorizationSnapshotPerson(id=2, snapshot_id=2, employee_no="E002", display_name="同名员工"))
    session.execute(roster.insert(), [{"employee_no": "E001", "corporate_email": " person@example.COM ", "full_name": "同名员工"}, {"employee_no": "E002", "corporate_email": "other@example.com", "full_name": "同名员工"}])
    session.flush()

    class Db:
        async def execute(self, statement):
            return session.execute(statement)

        async def get(self, model, identity):
            return session.get(model, identity)

    yield Db(), session, roster
    session.close()
    engine.dispose()


def _employee_context(**kwargs):
    return PerformanceAccessContext("PORTAL_USER", 8, "同名员工", None, ("performance.app",), (), ("performance.cycles.manage",), **kwargs)


@pytest.mark.asyncio
async def test_real_portal_email_resolves_own_cycle_and_object_actor(identity_db):
    db, _session, _roster = identity_db
    context = _employee_context()
    actor = await resolve_trusted_performance_actor(db, context, cycle_ref="cycle:own", require_employee_identity=True)
    assert (actor.actor_type, actor.actor_ref) == ("EMPLOYEE", "E001")
    assert (await resolve_trusted_performance_actor(db, context)).actor_ref == "E001"
    assert context.effective_employee_no is None
    assert context.permission_codes == ("performance.cycles.manage",)
    with pytest.raises(auth_context.PerformanceIdentityMappingNotFound):
        await resolve_trusted_performance_actor(db, context, cycle_ref="cycle:other", require_employee_identity=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("email", [None, "", "missing@example.com", "ou_not_an_employee_no"])
async def test_real_portal_missing_email_or_match_never_uses_name_or_openid(identity_db, email):
    from app.users.models import User
    db, session, _roster = identity_db
    session.get(User, 8).email = email
    actor = await resolve_trusted_performance_actor(db, _employee_context(), cycle_ref="cycle:own")
    assert actor.actor_type == "PORTAL_USER"


@pytest.mark.asyncio
@pytest.mark.parametrize("conflict", ["duplicate_roster", "duplicate_same_employee", "manual_link", "other_link", "portal_email", "snapshot_owner", "snapshot_other_employee"])
async def test_real_portal_identity_conflicts_fail_closed(identity_db, conflict):
    from app.performance.models import PerformanceAuthorizationSnapshotPerson, PerformanceIdentityLink
    from app.users.models import User
    db, session, roster = identity_db
    if conflict.startswith("duplicate"):
        session.execute(roster.insert(), {"employee_no": "E001" if conflict == "duplicate_same_employee" else "E003", "corporate_email": "PERSON@example.com"})
    elif conflict == "manual_link":
        session.add(PerformanceIdentityLink(id=2, portal_user_id=8, employee_no="E002", is_active=True))
    elif conflict in {"other_link", "portal_email", "snapshot_owner"}:
        session.add(User(id=9, login_name="other", display_name="其他人", email="PERSON@example.com" if conflict == "portal_email" else None, password_hash="unused", is_active=True))
        if conflict == "other_link":
            session.add(PerformanceIdentityLink(id=3, portal_user_id=9, employee_no="E001", is_active=True))
        elif conflict == "snapshot_owner":
            session.get(PerformanceAuthorizationSnapshotPerson, 1).portal_user_id = 9
    else:
        session.add(PerformanceAuthorizationSnapshotPerson(id=3, snapshot_id=1, employee_no="E003", display_name="同名员工", portal_user_id=8))
    session.flush()
    actor = await resolve_trusted_performance_actor(db, _employee_context(), cycle_ref="cycle:own")
    assert actor.actor_type == "PORTAL_USER"
    with pytest.raises(auth_context.PerformanceIdentityMappingNotFound):
        await resolve_trusted_performance_actor(db, _employee_context(), cycle_ref="cycle:own", require_employee_identity=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("binding", ["manual", "snapshot", "both"])
async def test_explicit_identity_bindings_remain_valid_without_email(identity_db, binding):
    from app.performance.models import PerformanceAuthorizationSnapshotPerson, PerformanceIdentityLink
    from app.users.models import User
    db, session, _roster = identity_db
    session.get(User, 8).email = None
    if binding in {"manual", "both"}:
        session.add(PerformanceIdentityLink(id=2, portal_user_id=8, employee_no="E001", is_active=True))
    if binding in {"snapshot", "both"}:
        session.get(PerformanceAuthorizationSnapshotPerson, 1).portal_user_id = 8
    session.flush()
    actor = await resolve_trusted_performance_actor(db, _employee_context(), cycle_ref="cycle:own", require_employee_identity=True)
    assert actor.actor_ref == "E001"


@pytest.mark.asyncio
async def test_switch_remains_prioritized_and_system_account_cannot_map_employee(identity_db):
    db, _session, _roster = identity_db
    switched = _employee_context(effective_employee_no="SWITCHED", operator_user_id=99, switch_session_id="verified")
    assert (await resolve_trusted_performance_actor(None, switched, cycle_ref="cycle:other")).actor_ref == "SWITCHED"
    system = PerformanceAccessContext("SYSTEM_ACCOUNT", 8, "同名员工", "SUPER_ADMIN", (), (), (), effective_employee_no="E001")
    actor = await resolve_trusted_performance_actor(db, system, cycle_ref="cycle:own")
    assert (actor.actor_type, actor.actor_ref) == ("SYSTEM_ACCOUNT", "8")


@pytest.mark.asyncio
async def test_navigation_reuses_real_identity_and_rejects_nonmember_cycles(identity_db):
    from app.performance import navigation_service
    from app.performance.models import PerformanceAuthorizationSnapshotPerson
    db, session, _roster = identity_db
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(navigation_service, "resolve_performance_employee_no", lambda _db, _context: "E001")
    monkeypatch.setattr(navigation_service, "employee_no_in_cycle", lambda _context, employee_no, people: employee_no if any(person.employee_no == employee_no for person in people) else None)
    class NavDb:
        async def execute(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            if entity is PerformanceAuthorizationSnapshotPerson:
                people = [SimpleNamespace(employee_no="E001", portal_user_id=None)]
                snapshots = [SimpleNamespace(cycle_ref="cycle:own")]
                return SimpleNamespace(all=lambda: list(zip(people, snapshots)))
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []), all=lambda: [])
    access = await navigation_service.resolve_frontend_access(NavDb(), _employee_context())
    assert access.actor_ref == "E001"
    assert access.actor_refs_by_cycle == {"cycle:own": "E001"}
    monkeypatch.undo()
