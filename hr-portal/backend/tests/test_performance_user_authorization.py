from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles, deregister
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_session
from app.performance import role_configuration_router as roles, projects_router as projects
from app.performance.auth_context import PerformanceAccessContext, PerformanceRoleGrant, get_performance_access_context, load_active_authorization
from app.performance.models import PerformanceAuditEvent, PerformanceIdentityLink, PerformancePermission, PerformanceRole, PerformanceRoleAssignment, PerformanceRolePermission, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceProject, PerformanceProjectNodeSnapshot, PerformanceProjectMemberSnapshot, PerformanceProjectMember, PerformanceNodeTask, PerformanceNodeTaskAuthorization, PerformanceOtherSetting
from app.users.models import Menu, Role, RoleMenu, User, UserRole


class AsyncDb:
    def __init__(self, session):
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    async def scalar(self, statement):
        return self.session.scalar(statement)

    async def get(self, model, key):
        return self.session.get(model, key)

    def add(self, row):
        self.session.add(row)

    async def commit(self):
        self.session.commit()

    async def flush(self):
        self.session.flush()

    async def refresh(self, row, **kwargs):
        self.session.refresh(row, **kwargs)


@pytest.fixture
def api(monkeypatch):
    compiles(JSONB, 'sqlite')(lambda *_args, **_kwargs: 'JSON')
    compiles(BigInteger, 'sqlite')(lambda *_args, **_kwargs: 'INTEGER')
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    tables = [model.__table__ for model in (User, Role, Menu, RoleMenu, UserRole, PerformanceRole, PerformancePermission, PerformanceRolePermission, PerformanceRoleAssignment, PerformanceIdentityLink, PerformanceAuditEvent, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceProject, PerformanceProjectNodeSnapshot, PerformanceProjectMemberSnapshot, PerformanceProjectMember, PerformanceNodeTask, PerformanceNodeTaskAuthorization, PerformanceOtherSetting)]
    Base.metadata.create_all(engine, tables=tables)
    session = Session(engine, expire_on_commit=False)
    now = datetime.now(UTC)
    session.add_all([
        User(id=8, login_name='test8', display_name='员工', password_hash='unused', is_active=True),
        PerformanceRole(id=11, code='custom.evaluation', name='评估授权角色', is_system=False, is_active=True, role_type='MANAGEMENT', function_permission_keys=[projects.TASK_EVALUATION_AUTHORIZATION_KEY]),
        PerformanceRole(id=12, code='custom.calibration', name='校准授权角色', is_system=False, is_active=True, role_type='MANAGEMENT', function_permission_keys=[projects.TASK_CALIBRATION_AUTHORIZATION_KEY]),
        PerformanceRole(id=13, code='performance.admin', name='系统管理员', is_system=True, is_active=True, role_type='MANAGEMENT', function_permission_keys=[]),
        PerformanceRole(id=14, code='custom.disabled', name='停用角色', is_system=False, is_active=False, role_type='MANAGEMENT', function_permission_keys=[]),
        PerformanceRole(id=15, code='assessment.example', name='评估角色', is_system=True, is_active=True, role_type='ASSESSMENT', function_permission_keys=[]),
        PerformanceIdentityLink(id=1, portal_user_id=8, employee_no='E8', is_active=True),
    ])
    session.commit()
    db = AsyncDb(session)
    admin = PerformanceAccessContext('SYSTEM_ACCOUNT', 1, '权限管理员', 'PERFORMANCE_ADMIN', (), (), ('performance.authorization.manage',))
    async def actor(*_args, **_kwargs):
        return SimpleNamespace(actor_type='SYSTEM_ACCOUNT', actor_ref='1')
    monkeypatch.setattr(roles, 'resolve_trusted_performance_actor', actor)
    app = FastAPI()
    app.include_router(roles.router, prefix='/api/v1')
    app.include_router(projects.router, prefix='/api/v1')
    async def session_override():
        try:
            yield db
        except Exception:
            session.rollback()
            raise
    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_performance_access_context] = lambda: admin
    client = TestClient(app)
    yield client, db, session, app
    session.close()
    engine.dispose()
    deregister(JSONB)
    deregister(BigInteger)


PATH = '/api/v1/performance/permission-settings/roles/user-authorizations'


@pytest.mark.asyncio
async def test_real_sql_api_assignment_reopen_replace_revoke_and_next_request_permission(api):
    client, db, session, app = api
    assert client.get(PATH).json()['total'] == 0
    options = client.get(PATH + '/options').json()
    assert options['users'][0]['employee_no'] == 'E8'
    assert {role['id'] for role in options['roles']} == {11, 12}
    response = client.post(PATH, json={'user_id': 8, 'role_ids': [11, 11]})
    assert response.status_code == 201, response.text
    assert response.json()['role_ids'] == [11]
    assert response.json()['updated_by'] == '权限管理员'
    reopened = client.get(PATH).json()
    assert reopened['total'] == 1 and reopened['items'][0]['role_ids'] == [11]
    assert client.get(PATH, params={'keyword': 'E8'}).json()['total'] == 1
    assert client.get(PATH, params={'keyword': '不存在'}).json()['total'] == 0
    grants, permissions = await load_active_authorization(db, 'PORTAL_USER', 8)
    context = PerformanceAccessContext('PORTAL_USER', 8, '员工', None, ('performance.app',), grants, permissions)
    project = SimpleNamespace(id=1, project_ref='P1', cycle_ref='C1', settings={'data_managers': []})
    assert await projects._task_management_scope(context, project, db, projects.TASK_EVALUATION_AUTHORIZATION_KEY) is None
    with pytest.raises(HTTPException) as denied:
        await projects._task_management_scope(context, project, db, projects.TASK_CALIBRATION_AUTHORIZATION_KEY)
    assert denied.value.status_code == 403
    assert client.post(PATH, json={'user_id': 8, 'role_ids': [11]}).status_code == 409
    result = client.put(PATH + '/8', json={'user_id': 8, 'role_ids': [12]})
    assert result.status_code == 200, result.text
    assert result.json()['role_ids'] == [12]
    assert client.delete(PATH + '/8').status_code == 204
    assert client.get(PATH).json()['total'] == 0
    assert await load_active_authorization(db, 'PORTAL_USER', 8) == ((), ())
    with pytest.raises(HTTPException):
        await projects._task_management_scope(context, project, db, projects.TASK_EVALUATION_AUTHORIZATION_KEY)
    stored = session.scalars(select(PerformanceRoleAssignment)).all()
    assert len(stored) == 2 and all(not row.is_active for row in stored)
    assert len(session.scalars(select(PerformanceAuditEvent)).all()) == 4
    assert client.post(PATH, json={'user_id': 8, 'role_ids': [11]}).status_code == 201
    assert len(session.scalars(select(PerformanceRoleAssignment)).all()) == 2


@pytest.mark.parametrize('role_id', [13, 14, 15, 999])
def test_reject_system_inactive_assessment_unknown_roles_without_partial_write(api, role_id):
    client, db, session, app = api
    response = client.post(PATH, json={'user_id': 8, 'role_ids': [11, role_id]})
    assert response.status_code == 409
    assert not session.scalars(select(PerformanceRoleAssignment)).all()
    assert not session.scalars(select(PerformanceAuditEvent)).all()


def test_api_denies_missing_permission_invalid_identity_and_forged_scope(api):
    client, db, session, app = api
    assert client.post(PATH, json={'user_id': 999, 'role_ids': [11]}).status_code == 409
    assert client.post(PATH, json={'user_id': 8, 'role_ids': [11], 'scope_type': 'GLOBAL'}).status_code == 422
    assert client.put(PATH + '/8', json={'user_id': 9, 'role_ids': [11]}).status_code == 422
    ordinary = PerformanceAccessContext('PORTAL_USER', 8, '员工', None, ('performance.app',), (), ())
    app.dependency_overrides[get_performance_access_context] = lambda: ordinary
    for method, suffix, payload in [('GET', '', None), ('GET', '/options', None), ('POST', '', {'user_id': 8, 'role_ids': [11]}), ('PUT', '/8', {'user_id': 8, 'role_ids': [11]}), ('DELETE', '/8', None)]:
        assert client.request(method, PATH + suffix, json=payload).status_code == 403


@pytest.mark.asyncio
async def test_feature_removal_role_disable_and_assignment_revoke_deny_stale_context(api):
    client, db, session, app = api
    client.post(PATH, json={'user_id': 8, 'role_ids': [11]})
    grants, permissions = await load_active_authorization(db, 'PORTAL_USER', 8)
    context = PerformanceAccessContext('PORTAL_USER', 8, '员工', None, ('performance.app',), grants, permissions)
    project = SimpleNamespace(id=1, project_ref='P1', cycle_ref='C1', settings={'data_managers': []})
    role = session.get(PerformanceRole, 11)
    for change in ('key', 'role', 'assignment'):
        role.function_permission_keys = [projects.TASK_EVALUATION_AUTHORIZATION_KEY]
        role.is_active = True
        assignment = session.scalar(select(PerformanceRoleAssignment))
        assignment.is_active = True
        if change == 'key': role.function_permission_keys = []
        if change == 'role': role.is_active = False
        if change == 'assignment': assignment.is_active = False
        session.commit()
        with pytest.raises(HTTPException) as denied:
            await projects._task_management_scope(context, project, db, projects.TASK_EVALUATION_AUTHORIZATION_KEY)
        assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_progress_scope_does_not_authorize_tasks_and_owner_rule_is_preserved(monkeypatch):
    async def scope(_context, _project, _db, key):
        if key == 'performance.frontend.progress': return None
        raise HTTPException(403, 'denied')
    monkeypatch.setattr(projects, '_project_data_scope', scope)
    context = PerformanceAccessContext('PORTAL_USER', 8, '员工', None, (), (), ())
    task = SimpleNamespace(id=1, handler_ref='OWNER', target_employee_no='E1')
    node = SimpleNamespace(node_type='evaluation')
    assert not await projects._authorize_task_delegation(task, node, SimpleNamespace(), context, 'OTHER', None, {1: []}, None)
    assert await projects._authorize_task_delegation(task, node, SimpleNamespace(), context, 'OWNER', None, {1: []}, None)


def test_actual_task_delegation_endpoints_consume_assigned_keys_and_revoke_immediately(api):
    client, db, session, app = api
    now = datetime.now(UTC)
    session.add_all([
        PerformanceAuthorizationSnapshot(id=1, cycle_ref='C1', status='LOCKED'),
        PerformanceAuthorizationSnapshotPerson(id=1, snapshot_id=1, portal_user_id=8, employee_no='E8', display_name='授权管理员'),
        PerformanceAuthorizationSnapshotPerson(id=2, snapshot_id=1, employee_no='RECIPIENT', display_name='接收人', employment_status='在职'),
        PerformanceProject(id=1, project_ref='P1', cycle_ref='C1', name='隔离项目', status='STARTED', administrators=[], settings={}),
        PerformanceProjectMemberSnapshot(id=1, project_id=1, cycle_ref='C1', snapshot_version=1, source_snapshot_id=1),
        PerformanceProjectMember(id=1, snapshot_id=1, employee_no='TARGET', display_name='目标人员', direct_supervisor_employee_no='OWNER', position_level='不可泄露职级'),
        PerformanceProjectNodeSnapshot(id=1, project_id=1, node_id='eval', name='上级评估', node_type='evaluation', node_order=1, config={'template': {'executor_role_code': 'assessment.line_manager'}}),
        PerformanceProjectNodeSnapshot(id=2, project_id=1, node_id='cal', name='校准', node_type='calibration', node_order=2, config={'calibration': {'role_code': 'assessment.calibrator', 'phases': [{'phase_id': 'first', 'assignments': [{'handler_ref': 'OWNER', 'employee_no': 'TARGET', 'allow_authorize': True}]}]}}),
        PerformanceNodeTask(id=1, project_id=1, cycle_ref='C1', member_snapshot_id=1, node_snapshot_id=1, target_employee_no='TARGET', handler_ref='OWNER', task_kind='evaluation', phase_id='', answers={'historical': 'unchanged'}, draft_answers={'draft': 'unchanged'}, answer_version=3),
        PerformanceNodeTask(id=2, project_id=1, cycle_ref='C1', member_snapshot_id=1, node_snapshot_id=2, target_employee_no='TARGET', handler_ref='OWNER', task_kind='calibration', phase_id='first', answers={}),
    ])
    session.commit()
    async def employee_context():
        grants, permissions = await load_active_authorization(db, 'PORTAL_USER', 8)
        return PerformanceAccessContext('PORTAL_USER', 8, '授权管理员', None, ('performance.app',), grants, permissions)
    admin_context = app.dependency_overrides[get_performance_access_context]
    assert client.post(PATH, json={'user_id': 8, 'role_ids': [11]}).status_code == 201
    app.dependency_overrides[get_performance_access_context] = employee_context
    payload = {'action': 'AUTHORIZE', 'recipient_employee_no': 'RECIPIENT', 'reason': '隔离授权验证'}
    evaluation = '/api/v1/performance/projects/1/tasks/1'
    calibration = '/api/v1/performance/projects/1/tasks/2'
    assert client.get(evaluation + '/delegation-candidates').status_code == 200
    created = client.post(evaluation + '/delegations', json=payload)
    assert created.status_code == 200, created.text
    assert client.get(calibration + '/delegation-candidates').status_code == 403
    assert client.post(calibration + '/delegations', json=payload).status_code == 403
    member_list = client.get('/api/v1/performance/projects/1/members')
    assert member_list.status_code == 200, member_list.text
    assert member_list.json()['items'][0]['can_authorize'] is True
    assert member_list.json()['items'][0]['position_level'] is None
    assert member_list.json()['items'][0]['rating'] is None
    assert client.get('/api/v1/performance/projects/1/matrix').status_code == 403
    app.dependency_overrides[get_performance_access_context] = admin_context
    assert client.put(PATH + '/8', json={'user_id': 8, 'role_ids': [12]}).status_code == 200
    app.dependency_overrides[get_performance_access_context] = employee_context
    assert client.post(evaluation + '/delegations', json=payload).status_code == 403
    created_calibration = client.post(calibration + '/delegations', json=payload)
    assert created_calibration.status_code == 200, created_calibration.text
    app.dependency_overrides[get_performance_access_context] = admin_context
    assert client.delete(PATH + '/8').status_code == 204
    app.dependency_overrides[get_performance_access_context] = employee_context
    assert client.get(calibration + '/delegation-candidates').status_code == 403
    assert client.post(calibration + '/delegations', json=payload).status_code == 403
    task = session.get(PerformanceNodeTask, 1)
    assert task.handler_ref == 'OWNER' and task.answer_version == 3
    assert task.answers == {'historical': 'unchanged'} and task.draft_answers == {'draft': 'unchanged'}
    assert len(session.scalars(select(PerformanceNodeTaskAuthorization)).all()) == 2
