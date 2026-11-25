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
from app.performance import seed as performance_seed
from app.performance.models import PerformanceSystemAccount
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
    import json
    from app.performance.models import PerformanceCycle, PerformanceSubjectVisibilitySetting
    connection = engine.raw_connection()
    connection.create_function('jsonb_typeof', 1, lambda value: 'array' if isinstance(json.loads(value), list) else 'object')
    connection.close()
    tables = [model.__table__ for model in (User, Role, Menu, RoleMenu, UserRole, PerformanceCycle, PerformanceSubjectVisibilitySetting, PerformanceRole, PerformancePermission, PerformanceRolePermission, PerformanceRoleAssignment, PerformanceSystemAccount, PerformanceIdentityLink, PerformanceAuditEvent, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceProject, PerformanceProjectNodeSnapshot, PerformanceProjectMemberSnapshot, PerformanceProjectMember, PerformanceNodeTask, PerformanceNodeTaskAuthorization, PerformanceOtherSetting)]
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
@pytest.mark.parametrize('role_code', ['performance.admin', 'performance.project_admin', 'performance.hrbp', 'custom.admin'])
async def test_role_api_permissions_survive_seed_and_fresh_sql_reads(api, monkeypatch, role_code):
    client, db, session, app = api
    monkeypatch.setattr(performance_seed, 'verify_password', lambda *_args: False)
    session.add(PerformanceSystemAccount(
        username='seed-regression', display_name='初始化测试账号', password_hash='unused',
        account_type='PERFORMANCE_SUPER_ADMIN', is_active=True,
    ))
    session.commit()
    await performance_seed.seed_performance_authorization_defaults(db)
    if role_code.startswith('custom.'):
        session.add(PerformanceRole(
            code=role_code, name='自定义管理员', role_type='MANAGEMENT', is_system=False,
            is_active=True, function_permission_keys=[],
        ))
        session.commit()
    role_id = session.scalar(select(PerformanceRole.id).where(PerformanceRole.code == role_code))
    role_path = f'/api/v1/performance/permission-settings/roles/{role_id}'
    keys = list(performance_seed.TASK_AUTHORIZATION_FUNCTION_KEYS)

    for saved_keys in (keys, [keys[1]], []):
        response = client.patch(role_path, json={
            'description': '已保存的配置', 'function_permission_keys': saved_keys,
        })
        assert response.status_code == 200, response.text
        assert response.json()['function_permission_keys'] == saved_keys
        audit_count = len(session.scalars(select(PerformanceAuditEvent)).all())

        for _ in range(2):
            await performance_seed.seed_performance_authorization_defaults(db)
            session.expunge_all()
            stored = session.get(PerformanceRole, role_id)
            assert stored.function_permission_keys == saved_keys
            assert stored.description == '已保存的配置'
            reopened = client.get(role_path)
            assert reopened.status_code == 200, reopened.text
            assert reopened.json()['function_permission_keys'] == saved_keys
            assert len(session.scalars(select(PerformanceAuditEvent)).all()) == audit_count

    events = session.scalars(select(PerformanceAuditEvent).where(
        PerformanceAuditEvent.event_type == 'PERFORMANCE_ROLE_UPDATED',
        PerformanceAuditEvent.subject_ref == str(role_id),
    ).order_by(PerformanceAuditEvent.id)).all()
    assert [event.after_state['function_permission_keys'] for event in events] == [keys, [keys[1]], []]
    app.dependency_overrides[get_performance_access_context] = lambda: PerformanceAccessContext(
        'PORTAL_USER', 8, '无权限用户', None, (), (), (),
    )
    denied = client.patch(role_path, json={'function_permission_keys': keys})
    assert denied.status_code == 403
    session.expunge_all()
    assert session.get(PerformanceRole, role_id).function_permission_keys == []


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

    from dataclasses import replace
    from datetime import timedelta
    from app.performance.models import PerformanceCycle
    PerformanceCycle.__table__.create(session.get_bind(), checkfirst=True)
    session.add(PerformanceCycle(id=1, cycle_ref='C1', name='周期', period_year=2026, period_type='YEAR', start_at=now, end_at=now + timedelta(days=365), lock_rule='IMMEDIATE', created_by_type='PORTAL_USER', created_by_ref='8'))
    target_project = session.get(PerformanceProject, 1)
    target_project.administrators = ['授权管理员']
    target_project.settings = {'data_managers': ['PROJECT_ADMIN']}
    session.add(PerformanceRole(id=16, code='performance.project_admin', name='项目管理员', role_type='MANAGEMENT', is_active=True, function_permission_keys=['performance.frontend.progress', 'performance.frontend.data-view']))
    session.commit()
    session.delete(session.get(PerformanceIdentityLink, 1))
    session.commit()
    async def switched_employee_context():
        return replace(await employee_context(), subject_type='EMPLOYEE', subject_id=0, effective_employee_no='E8', operator_user_id=99)
    app.dependency_overrides[get_performance_access_context] = switched_employee_context
    records = client.get('/api/v1/performance/project-management/authorization-records?cycle_id=1')
    assert records.status_code == 200, records.text
    assert [row['task_id'] for row in records.json()['authorization_records']] == [1]
    assert all(not row['can_revoke'] for row in records.json()['authorization_records'])
    calibration_rows = client.get('/api/v1/performance/project-management/calibration-authorization?cycle_id=1')
    assert calibration_rows.status_code == 200, calibration_rows.text
    rows = calibration_rows.json()['items']
    assert len(rows) == 2
    delegated_row = next(row for row in rows if row['source'] == 'DELEGATION')
    assert delegated_row['task_ids'] == [2]
    assert delegated_row['authorizations'][0]['id'] == created_calibration.json()['id']
    row = next(row for row in rows if row['source'] == 'BACKEND')
    assert row['allow_authorize'] is True
    assert all(row['can_authorize'] is False and row['can_revoke'] is False for row in rows)
    assert client.post(evaluation + '/delegations', json=payload).status_code == 403
    assert client.post(calibration + '/delegations', json=payload).status_code == 403
    authorization = session.scalar(select(PerformanceNodeTaskAuthorization).where(PerformanceNodeTaskAuthorization.task_id == 2))
    authorization.grantor_employee_no = 'OWNER'
    session.commit()
    assert client.delete(calibration + f'/delegations/{authorization.id}').status_code == 403
    assert session.get(PerformanceNodeTaskAuthorization, authorization.id).status == 'ACTIVE'
    target_project.administrators = []
    session.commit()
    assert client.get('/api/v1/performance/project-management/authorization-records?cycle_id=1').status_code == 403
    assert client.get('/api/v1/performance/project-management/calibration-authorization?cycle_id=1').status_code == 403


@pytest.mark.parametrize('scope', [None, {'E1', 'NO_NAME'}])
def test_authorization_records_display_task_snapshot_names_for_both_tabs(api, monkeypatch, scope):
    client, db, session, app = api
    session.add_all([
        PerformanceProject(id=1, project_ref='P1', cycle_ref='C1', name='项目一', status='STARTED', settings={}),
        PerformanceProject(id=2, project_ref='P2', cycle_ref='C1', name='项目二', status='STARTED', settings={}),
        PerformanceProjectMemberSnapshot(id=1, project_id=1, cycle_ref='C1', snapshot_version=1, source_snapshot_id=1),
        PerformanceProjectMemberSnapshot(id=2, project_id=1, cycle_ref='C1', snapshot_version=2, source_snapshot_id=2),
        PerformanceProjectMemberSnapshot(id=3, project_id=2, cycle_ref='C1', snapshot_version=1, source_snapshot_id=3),
        PerformanceProjectMember(id=1, snapshot_id=1, employee_no='E1', display_name='历史显示名'),
        PerformanceProjectMember(id=2, snapshot_id=2, employee_no='E1', display_name='新快照显示名'),
        PerformanceProjectMember(id=3, snapshot_id=3, employee_no='E1', display_name='其他项目显示名'),
        PerformanceProjectMember(id=4, snapshot_id=1, employee_no='NO_NAME', display_name=''),
        PerformanceProjectMember(id=5, snapshot_id=1, employee_no='HIDDEN', display_name='范围外人员'),
        PerformanceProjectNodeSnapshot(id=1, project_id=1, node_id='eval', name='上级评估', node_type='evaluation', node_order=1, config={}),
        PerformanceProjectNodeSnapshot(id=2, project_id=1, node_id='cal', name='校准', node_type='calibration', node_order=2, config={}),
        PerformanceProjectNodeSnapshot(id=3, project_id=1, node_id='comm', name='结果沟通', node_type='result_communication', node_order=3, config={}),
        PerformanceProjectNodeSnapshot(id=4, project_id=1, node_id='reconsideration', name='结果复议', node_type='result_reconsideration', node_order=4, config={}),
    ])
    for task_id, snapshot_id, employee_no, node_id, task_kind, event_type in [
        (1, 1, 'E1', 1, 'evaluation', 'PERFORMANCE_TASK_AUTHORIZED'),
        (2, 1, 'E1', 1, 'evaluation', 'PERFORMANCE_TASK_TRANSFERRED'),
        (3, 2, 'E1', 1, 'evaluation', 'PERFORMANCE_TASK_TRANSFERRED'),
        (4, 1, 'NO_NAME', 1, 'evaluation', 'PERFORMANCE_TASK_AUTHORIZED'),
        (5, 1, 'HIDDEN', 1, 'evaluation', 'PERFORMANCE_TASK_AUTHORIZED'),
        (6, 1, 'E1', 2, 'calibration', 'PERFORMANCE_TASK_AUTHORIZED'),
        (7, 1, 'E1', 2, 'calibration', 'PERFORMANCE_TASK_TRANSFERRED'),
        (8, 1, 'E1', 3, 'result_communication', 'PERFORMANCE_TASK_AUTHORIZED'),
        (9, 1, 'E1', 4, 'result_reconsideration', 'PERFORMANCE_TASK_TRANSFERRED'),
    ]:
        session.add(PerformanceNodeTask(id=task_id, project_id=1, cycle_ref='C1', member_snapshot_id=snapshot_id, node_snapshot_id=node_id, target_employee_no=employee_no, handler_ref=f'OWNER{task_id}', task_kind=task_kind, phase_id='', answers={}))
        session.add(PerformanceAuditEvent(id=task_id, cycle_ref='C1', employee_no=employee_no, event_type=event_type, actor_type='EMPLOYEE', actor_ref='OWNER', subject_type='PERFORMANCE_NODE_TASK', subject_ref=str(task_id), after_state={'project_id': 1, 'authorization_id': task_id, 'initiator_name': '发起显示名', 'recipient_name': '接收显示名', 'reviewee_names': [employee_no] if employee_no != 'NO_NAME' else ['旧记录姓名']}))
    for event_id, task_id in [(10, 6), (11, 9), (12, 1)]:
        session.add(PerformanceAuditEvent(id=event_id, cycle_ref='C1', employee_no='E1', event_type='PERFORMANCE_TASK_AUTHORIZATION_REVOKED', actor_type='EMPLOYEE', actor_ref='OWNER', subject_type='PERFORMANCE_NODE_TASK', subject_ref=str(task_id), after_state={'project_id': 1, 'authorization_id': task_id}))
    session.commit()
    project = session.get(PerformanceProject, 1)
    async def permitted(*_args): return [(project, scope)]
    async def view_scope(*_args): return scope
    monkeypatch.setattr(projects, '_task_authorization_projects', permitted)
    monkeypatch.setattr(projects, '_task_authorization_view_scope', view_scope)
    url = '/api/v1/performance/project-management/authorization-records?cycle_id=1'
    for _ in range(2):
        response = client.get(url)
        assert response.status_code == 200, response.text
        result = response.json()
        records = {row['task_id']: row for row in result['authorization_records'] + result['transfer_records']}
        assert records[1]['reviewees'] == records[2]['reviewees'] == ['历史显示名']
        assert records[3]['reviewees'] == ['新快照显示名']
        assert records[4]['reviewees'] == (['NO_NAME'] if scope is not None else ['旧记录姓名'])
        assert all(row['initiator'] == '发起显示名' and row['authorized_person'] == '接收显示名' for row in records.values())
        assert {row['task_id'] for row in result['transfer_records']} == {2, 3, 9}
        assert {row['task_id'] for row in result['authorization_records']} == ({1, 4, 5, 8} if scope is None else {1, 4, 8})
        assert records[8]['reviewees'] == records[9]['reviewees'] == ['历史显示名']
        assert records[1]['status'] == records[9]['status'] == '已撤销'
        assert records[8]['status'] == '已授权'
        assert (5 in records) == (scope is None)
        assert all('其他项目显示名' not in row['reviewees'] for row in records.values())
    assert session.get(PerformanceAuditEvent, 1).after_state['reviewee_names'] == ['E1']
    assert session.get(PerformanceProjectMember, 1).display_name == '历史显示名'


@pytest.fixture
def member_actions_api(api):
    from datetime import timedelta
    from app.performance.models import PerformanceCycle, PerformanceHrbpPermission, PerformanceOtherPermissionSetting, PerformanceSubjectVisibilitySetting
    client, db, session, app = api
    for model in (PerformanceCycle, PerformanceHrbpPermission, PerformanceOtherPermissionSetting, PerformanceSubjectVisibilitySetting):
        model.__table__.create(session.get_bind(), checkfirst=True)
    now = datetime.now(UTC)
    session.add_all([
        PerformanceCycle(id=1, cycle_ref='C1', name='周期', period_year=2026, period_type='YEAR', start_at=now, end_at=now + timedelta(days=365), lock_rule='IMMEDIATE', created_by_type='PORTAL_USER', created_by_ref='8'),
        PerformanceAuthorizationSnapshot(id=1, cycle_ref='C1', status='LOCKED'),
        PerformanceAuthorizationSnapshotPerson(id=1, snapshot_id=1, employee_no='E8', display_name='管理员'),
        PerformanceAuthorizationSnapshotPerson(id=2, snapshot_id=1, employee_no='OWNER', display_name='原处理人'),
        PerformanceProject(id=1, project_ref='P1', cycle_ref='C1', name='项目', status='STARTED', administrators=['管理员'], settings={'data_managers': ['PROJECT_ADMIN', 'HRBP']}),
        PerformanceProjectMemberSnapshot(id=1, project_id=1, cycle_ref='C1', snapshot_version=1, source_snapshot_id=1),
        PerformanceProjectMemberSnapshot(id=2, project_id=1, cycle_ref='C1', snapshot_version=2, source_snapshot_id=1),
        PerformanceProjectMember(id=1, snapshot_id=1, employee_no='TARGET', display_name='历史人员', organization_ref='集团/旧部门'),
        PerformanceProjectMember(id=2, snapshot_id=2, employee_no='TARGET', display_name='当前人员', organization_ref='集团/研发', direct_supervisor_employee_no='OWNER'),
        PerformanceProjectMember(id=3, snapshot_id=2, employee_no='OUTSIDE', display_name='范围外人员', organization_ref='集团/销售'),
        PerformanceRole(id=16, code='performance.project_admin', name='项目管理员', role_type='MANAGEMENT', is_active=True, function_permission_keys=['performance.frontend.data-view', 'performance.frontend.progress', 'performance.frontend.manage-evaluatees', projects.TASK_EVALUATION_AUTHORIZATION_KEY]),
        PerformanceRole(id=17, code='performance.hrbp', name='HRBP', role_type='MANAGEMENT', is_active=True, function_permission_keys=['performance.frontend.data-view', 'performance.frontend.manage-evaluatees']),
        PerformanceHrbpPermission(id=1, cycle_ref='C1', hrbp_employee_no='E8', scope=['集团/研发'], invisible_people=[]),
    ])
    session.commit()
    context = PerformanceAccessContext('EMPLOYEE', 0, '管理员', None, ('performance.app',), (), (), effective_employee_no='E8', management_role='project_admin', management_cycle_id=1)
    app.dependency_overrides[get_performance_access_context] = lambda: context
    return client, db, session, app, context


@pytest.mark.parametrize('role_key', ['project_admin', None])
@pytest.mark.parametrize('function_keys, expected_status', [
    ([projects.TASK_CALIBRATION_AUTHORIZATION_KEY], 403),
    ([projects.TASK_EVALUATION_AUTHORIZATION_KEY], 200),
    (['performance.frontend.progress'], 200),
    (['performance.frontend.data-view'], 200),
    ([projects.TASK_CALIBRATION_AUTHORIZATION_KEY, 'performance.frontend.progress'], 200),
    ([projects.TASK_CALIBRATION_AUTHORIZATION_KEY, 'performance.frontend.data-view'], 200),
])
def test_authorization_records_exclude_calibration_only_permission(member_actions_api, role_key, function_keys, expected_status):
    from dataclasses import replace
    client, db, session, app, context = member_actions_api
    context = replace(context, management_role=role_key)
    app.dependency_overrides[get_performance_access_context] = lambda: context
    session.get(PerformanceRole, 16).function_permission_keys = function_keys
    session.get(PerformanceProject, 1).settings = {'data_managers': ['PROJECT_ADMIN']}
    session.commit()
    response = client.get('/api/v1/performance/project-management/authorization-records?cycle_id=1')
    assert response.status_code == expected_status, response.text
    if expected_status == 200:
        assert response.json() == {'cycle_id': 1, 'authorization_records': [], 'transfer_records': []}


@pytest.mark.parametrize('role_key', ['project_admin', None])
def test_member_detail_empty_tabs_remove_capability_and_live_role_revocation(member_actions_api, role_key):
    from dataclasses import replace
    client, db, session, app, context = member_actions_api
    context = replace(context, management_role=role_key)
    app.dependency_overrides[get_performance_access_context] = lambda: context
    detail_path = '/api/v1/performance/projects/1/members/TARGET/detail'
    delete_path = '/api/v1/performance/projects/1/members/TARGET'
    result = client.get(detail_path)
    assert result.status_code == 200, result.text
    assert result.json()['management_tabs'] == []
    assert result.json()['member_actions'] == {'can_remove': True, 'task_map': []}
    assert client.delete(delete_path, params={'root_review_id': 1}).status_code == 409
    assert session.get(PerformanceProjectMember, 1) is not None and session.get(PerformanceProjectMember, 2) is not None
    assert client.get(detail_path, params={'root_review_id': 1}).json()['member_actions'] == {'can_remove': False, 'task_map': []}
    role = session.get(PerformanceRole, 16)
    for change in ('function', 'role', 'selection', 'administrator'):
        role.function_permission_keys = ['performance.frontend.data-view', 'performance.frontend.progress', 'performance.frontend.manage-evaluatees']
        role.is_active = True
        project = session.get(PerformanceProject, 1)
        project.settings = {'data_managers': ['PROJECT_ADMIN']}
        project.administrators = ['管理员']
        if change == 'function':
            role.function_permission_keys = ['performance.frontend.data-view', 'performance.frontend.progress']
        if change == 'role': role.is_active = False
        if change == 'selection': project.settings = {'data_managers': []}
        if change == 'administrator': project.administrators = []
        session.commit()
        result = client.get(detail_path)
        if change == 'function':
            assert result.status_code == 200, result.text
            assert result.json()['member_actions'] == {'can_remove': False, 'task_map': []}
        else:
            assert result.status_code == 403, result.text
        assert client.delete(delete_path).status_code == 403
        assert session.get(PerformanceProjectMember, 2) is not None


@pytest.mark.parametrize('role_key', ['hrbp', None])
def test_member_delete_scope_rejects_outside_and_invisible_without_management_role_bypass(member_actions_api, role_key):
    from dataclasses import replace
    from app.performance.models import PerformanceHrbpPermission, PerformanceOtherPermissionSetting
    client, db, session, app, context = member_actions_api
    context = replace(context, management_role=role_key)
    app.dependency_overrides[get_performance_access_context] = lambda: context
    project = session.get(PerformanceProject, 1)
    project.settings = {'data_managers': ['HRBP']}
    session.commit()
    assert client.get('/api/v1/performance/projects/1/members/TARGET/detail').json()['member_actions']['can_remove'] is True
    assert client.delete('/api/v1/performance/projects/1/members/OUTSIDE').status_code == 403
    assert client.get('/api/v1/performance/projects/1/members/OUTSIDE/detail').status_code == 404
    permission = session.get(PerformanceHrbpPermission, 1)
    permission.invisible_people = ['TARGET']
    session.commit()
    assert client.delete('/api/v1/performance/projects/1/members/TARGET').status_code == 403
    permission.invisible_people = []
    session.add(PerformanceOtherPermissionSetting(id=1, hrbp_invisible_people=['TARGET']))
    session.commit()
    assert client.delete('/api/v1/performance/projects/1/members/TARGET').status_code == 403
    assert session.get(PerformanceProjectMember, 2) is not None
    assert session.get(PerformanceProjectMember, 3) is not None


def test_member_detail_task_map_uses_latest_tasks_and_independent_authorization_permission(member_actions_api, monkeypatch):
    from unittest.mock import AsyncMock
    client, db, session, app, context = member_actions_api
    session.add_all([
        PerformanceProjectNodeSnapshot(id=1, project_id=1, node_id='eval', name='上级评价', node_type='evaluation', node_order=1, config={'template': {'executor_role_code': 'assessment.line_manager'}}),
        PerformanceNodeTask(id=1, project_id=1, cycle_ref='C1', member_snapshot_id=1, node_snapshot_id=1, target_employee_no='TARGET', handler_ref='OWNER', task_kind='evaluation', phase_id=''),
        PerformanceNodeTask(id=2, project_id=1, cycle_ref='C1', member_snapshot_id=2, node_snapshot_id=1, target_employee_no='TARGET', handler_ref='OWNER', task_kind='evaluation', phase_id=''),
    ])
    session.commit()
    monkeypatch.setattr(projects, '_project_member_detail', AsyncMock(return_value={'root_review_id': 2}))
    path = '/api/v1/performance/projects/1/members/TARGET/detail'
    actions = client.get(path).json()['member_actions']
    assert actions['can_remove'] is True
    assert [option['task_id'] for option in actions['task_map']] == [2]
    assert actions['task_map'][0]['handler_ref'] == 'OWNER' and actions['task_map'][0]['can_authorize'] is True
    role = session.get(PerformanceRole, 16)
    role.function_permission_keys = ['performance.frontend.data-view', 'performance.frontend.manage-evaluatees']
    session.commit()
    assert client.get(path).json()['member_actions'] == {'can_remove': True, 'task_map': []}
    role.function_permission_keys = ['performance.frontend.data-view', projects.TASK_EVALUATION_AUTHORIZATION_KEY]
    session.commit()
    assert client.get(path).json()['member_actions']['can_remove'] is False
    assert len(client.get(path).json()['member_actions']['task_map']) == 1
    session.get(PerformanceNodeTask, 2).revoked_at = datetime.now(UTC)
    session.commit()
    assert client.get(path).json()['member_actions']['task_map'] == []
