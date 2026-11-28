"""Tests for rule-based performance authorization API (按规则授权)."""
from datetime import UTC, datetime
from importlib import util
from io import StringIO
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles, deregister
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_session
from app.performance import auth_rules_router as rules, auth_rule_service as rule_service
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context
from app.performance.models import (
    PerformanceAuditEvent, PerformanceAuthRule, PerformanceIdentityLink,
    PerformanceRole, PerformanceSystemAccount, PerformanceRoleAssignment,
    PerformancePermission, PerformanceRolePermission,
)
from app.users.models import User, Role, UserRole, Menu, RoleMenu


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
    tables = [model.__table__ for model in (
        User, Role, UserRole, Menu, RoleMenu, PerformanceRole, PerformanceIdentityLink, PerformanceSystemAccount,
        PerformanceAuditEvent, PerformanceAuthRule, PerformanceRoleAssignment,
        PerformancePermission, PerformanceRolePermission,
    )]
    Base.metadata.create_all(engine, tables=tables)
    session = Session(engine, expire_on_commit=False)
    session.add_all([
        User(id=8, login_name='test8', display_name='员工', password_hash='unused', is_active=True),
        PerformanceRole(id=11, code='custom.manager', name='测试管理角色', is_system=False, is_active=True, role_type='MANAGEMENT', function_permission_keys=[]),
        PerformanceRole(id=13, code='performance.admin', name='系统管理员', is_system=True, is_active=True, role_type='MANAGEMENT', function_permission_keys=[]),
        PerformanceRole(id=15, code='assessment.example', name='评估角色', is_system=True, is_active=True, role_type='ASSESSMENT', function_permission_keys=[]),
        PerformanceIdentityLink(id=1, portal_user_id=8, employee_no='E8', is_active=True),
    ])
    session.commit()
    db = AsyncDb(session)
    admin = PerformanceAccessContext('SYSTEM_ACCOUNT', 1, '权限管理员', 'PERFORMANCE_ADMIN', (), (), ('performance.authorization.manage',))

    async def actor(*_args, **_kwargs):
        return SimpleNamespace(actor_type='SYSTEM_ACCOUNT', actor_ref='1')

    monkeypatch.setattr(rules, 'resolve_trusted_performance_actor', actor)
    app = FastAPI()
    app.include_router(rules.router, prefix='/api/v1')

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


PATH = '/api/v1/performance/permission-settings/auth-rules'


@pytest.mark.asyncio
async def test_rule_options_expose_fields_roles_and_resolve(api, monkeypatch):
    client, db, session, app = api
    from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people

    async def roster(_db):
        return build_snapshot_people([
            RosterAuthorizationInput('E1', '员工一', department='研发', job_family='技术', job_category='后端', position_level='P5', employee_type='正式员工', hire_date=__import__('datetime').date(2020, 1, 1)),
            RosterAuthorizationInput('E2', '员工二', department='研发', job_family='技术', job_category='前端', position_level='P4', employee_type='正式员工', hire_date=__import__('datetime').date(2021, 6, 1)),
        ])

    monkeypatch.setattr(rules, 'load_rule_roster_people', roster)
    options = client.get(PATH + '/options')
    assert options.status_code == 200, options.text
    data = options.json()
    assert {field['key'] for field in data['fields']} == {'department', 'employee', 'superior', 'directLeader', 'job_family', 'position_level', 'hire_date', 'employee_type'}
    assert {role['id'] for role in data['roles']} == {11}
    assert {person['value'] for person in data['people']} == {'E1', 'E2'}
    assert data['hire_date_range'] == {'min': '2020-01-01', 'max': '2021-06-01'}

    resolved = client.post(PATH + '/resolve-scope', json={
        'or_scope': [{'conditions': [{'field': 'department', 'operator': 'include', 'values': ['研发']}]}],
    })
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()['count'] == 2


@pytest.mark.asyncio
async def test_rule_create_list_update_delete_and_audit(api):
    client, db, session, app = api
    assert client.get(PATH).json()['total'] == 0
    payload = {
        'role_id': 11,
        'or_scope': [{'conditions': [{'field': 'department', 'operator': 'include', 'values': ['研发']}]}],
    }
    created = client.post(PATH, json=payload)
    assert created.status_code == 201, created.text
    assert created.json()['role_name'] == '测试管理角色'
    rule_id = created.json()['id']

    listed = client.get(PATH).json()
    assert listed['total'] == 1 and listed['items'][0]['id'] == rule_id
    assert client.get(PATH, params={'keyword': '测试管理'}).json()['total'] == 1
    assert client.get(PATH, params={'keyword': '不存在'}).json()['total'] == 0

    # 系统角色与评估角色不可授权
    assert client.post(PATH, json={'role_id': 13, 'or_scope': [{'conditions': [{'field': 'employee', 'operator': 'include', 'values': ['E1']}]}]}).status_code == 409
    assert client.post(PATH, json={'role_id': 15, 'or_scope': [{'conditions': [{'field': 'employee', 'operator': 'include', 'values': ['E1']}]}]}).status_code == 409

    updated = client.put(f'{PATH}/{rule_id}', json={
        'role_id': 11,
        'or_scope': [{'conditions': [{'field': 'employee', 'operator': 'include', 'values': ['E1']}]}],
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()['or_scope'][0]['conditions'][0]['values'] == ['E1']

    assert client.delete(f'{PATH}/{rule_id}').status_code == 204
    assert client.get(PATH).json()['total'] == 0
    events = session.scalars(select(PerformanceAuditEvent).where(
        PerformanceAuditEvent.subject_type == 'PERFORMANCE_AUTH_RULE',
        PerformanceAuditEvent.subject_ref == str(rule_id),
    ).order_by(PerformanceAuditEvent.id)).all()
    assert [event.event_type for event in events] == ['PERFORMANCE_AUTH_RULE_CREATED', 'PERFORMANCE_AUTH_RULE_UPDATED', 'PERFORMANCE_AUTH_RULE_DELETED']


@pytest.mark.asyncio
async def test_rule_api_permission_gate(api):
    client, db, session, app = api
    denied = PerformanceAccessContext('PORTAL_USER', 8, '无权限用户', None, (), (), ())
    app.dependency_overrides[get_performance_access_context] = lambda: denied
    payload = {'role_id': 11, 'or_scope': [{'conditions': [{'field': 'employee', 'operator': 'include', 'values': ['E8']}]}]}
    for path in [PATH, PATH + '/options', PATH + '/export']:
        assert client.get(path).status_code == 403
    assert client.post(PATH, json=payload).status_code == 403
    assert client.put(PATH + '/1', json=payload).status_code == 403
    assert client.delete(PATH + '/1').status_code == 403
    assert client.post(PATH + '/resolve-scope', json={'or_scope': payload['or_scope']}).status_code == 403
    assert session.scalar(select(func.count()).select_from(PerformanceAuthRule)) == 0


@pytest.mark.parametrize('field,operator,values', [
    ('unknown', 'exclude', ['E1']),
    ('department', 'unknown', ['研发']),
    ('sequenceLevel', 'include', ['P5']),
    ('hire_date', 'include', ['2020-01-01']),
    ('hire_date', 'before', ['2020-02-30']),
    ('hire_date', 'before', ['20200101']),
    ('hire_date', 'before', ['2020-01-01', '2021-01-01']),
])
def test_invalid_conditions_rejected_before_write_or_preview(api, field, operator, values):
    client, db, session, app = api
    scope = [{'conditions': [{'field': field, 'operator': operator, 'values': values}]}]
    assert client.post(PATH, json={'role_id': 11, 'or_scope': scope}).status_code == 422
    assert client.post(PATH + '/resolve-scope', json={'or_scope': scope}).status_code == 422
    assert session.scalar(select(func.count()).select_from(PerformanceAuthRule)) == 0


def test_export_is_not_limited_to_list_page_size(api):
    client, db, session, app = api
    session.add_all([
        PerformanceAuthRule(id=100 + i, role_id=11, or_scope=[{'conditions': [{'field': 'employee', 'operator': 'include', 'values': ['E8']}]}])
        for i in range(151)
    ])
    session.commit()
    assert len(client.get(PATH).json()['items']) == 10
    exported = client.get(PATH + '/export')
    assert exported.status_code == 200, exported.text
    assert len(exported.json()['items']) == 151
    assert client.get(PATH + '/export', params={'keyword': '不存在'}).json()['total'] == 0


@pytest.mark.asyncio
async def test_rule_roster_options_use_physical_columns(api, monkeypatch):
    from sqlalchemy import Column, MetaData, String, Table
    client, db, session, app = api
    columns = ['employee_no', 'full_name', 'direct_supervisor', 'employee_type', 'employment_status', 'job_family', 'job_category', 'position_level', 'hire_date', *rules.ORGANIZATION_FIELDS]
    table = Table('rule_test_roster', MetaData(), *(Column(name, String) for name in columns))
    table.create(session.get_bind())
    session.execute(table.insert(), [{
        'employee_no': 'E20', 'full_name': '员工二十', 'job_family': '技术', 'job_category': '后端',
        'position_level': 'P5', 'employee_type': '正式员工', 'hire_date': '2020-01-02',
        'employment_status': '在职', 'company_org': '公司', 'department': '研发',
    }])
    session.commit()
    monkeypatch.setattr(rule_service, 'employee_roster_table', lambda: table)
    response = client.get(PATH + '/options')
    assert response.status_code == 200, response.text
    options = response.json()
    assert options['position_levels'] == [{'value': 'P5', 'label': 'P5'}]
    assert options['employee_types'] == [{'value': '正式员工', 'label': '正式员工'}]
    assert options['hire_date_range'] == {'min': '2020-01-02', 'max': '2020-01-02'}
    assert options['job_families']
    scope = [{'conditions': [{'field': 'position_level', 'operator': 'include', 'values': ['P5']}]}]
    assert client.post(PATH + '/resolve-scope', json={'or_scope': scope}).json()['user_ids'] == ['E20']
    broken = Table('broken_rule_roster', MetaData(), Column('employee_no', String))
    monkeypatch.setattr(rule_service, 'employee_roster_table', lambda: broken)
    assert client.get(PATH + '/options').status_code == 503


@pytest.mark.asyncio
async def test_rule_changes_apply_to_next_authorization_read_without_overwriting_direct_grants(api, monkeypatch):
    from app.performance.auth_context import load_active_authorization
    from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people
    client, db, session, app = api
    roster = [RosterAuthorizationInput('E8', '员工', employment_status='在职', department='研发')]

    async def people(_db):
        return build_snapshot_people(roster)

    monkeypatch.setattr(rule_service, 'load_rule_roster_people', people)
    session.add(PerformancePermission(id=1, code='performance.projects.manage', name='项目', category='project'))
    session.add(PerformanceRolePermission(role_id=11, permission_id=1))
    session.commit()
    scope = [{'conditions': [{'field': 'department', 'operator': 'include', 'values': ['研发']}]}]
    created = client.post(PATH, json={'role_id': 11, 'or_scope': scope})
    assert created.status_code == 201, created.text
    rule_id = created.json()['id']
    grants, permissions = await load_active_authorization(db, 'PORTAL_USER', 8)
    assert [(grant.code, grant.scope_type, grant.scope_ref) for grant in grants] == [('custom.manager', 'GLOBAL', 'GLOBAL')]
    assert permissions == ('performance.projects.manage',)
    from app.performance import projects_router as projects
    role = session.get(PerformanceRole, 11)
    role.function_permission_keys = [projects.TASK_EVALUATION_AUTHORIZATION_KEY]
    session.commit()
    context = PerformanceAccessContext('PORTAL_USER', 8, '员工', None, ('performance.app',), grants, permissions)
    project = SimpleNamespace(id=1, project_ref='P1', cycle_ref='C1', settings={'data_managers': []})
    assert await projects._task_management_scope(context, project, db, projects.TASK_EVALUATION_AUTHORIZATION_KEY) is None
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as denied:
        await projects._task_management_scope(context, project, db, projects.TASK_CALIBRATION_AUTHORIZATION_KEY)
    assert denied.value.status_code == 403
    assert session.scalar(select(func.count()).select_from(PerformanceRoleAssignment)) == 0
    roster[:] = [RosterAuthorizationInput('E8', '员工', employment_status='在职', department='运营')]
    assert await load_active_authorization(db, 'PORTAL_USER', 8) == ((), ())
    roster[:] = [RosterAuthorizationInput('E8', '员工', employment_status='在职', department='研发')]
    assert (await load_active_authorization(db, 'PORTAL_USER', 8))[1] == permissions
    payload = {'role_id': 11, 'or_scope': [{'conditions': [{'field': 'employee', 'operator': 'include', 'values': ['OTHER']}]}]}
    assert client.put(f'{PATH}/{rule_id}', json=payload).status_code == 200
    assert await load_active_authorization(db, 'PORTAL_USER', 8) == ((), ())
    assert client.put(f'{PATH}/{rule_id}', json={'role_id': 11, 'or_scope': scope}).status_code == 200
    role = session.get(PerformanceRole, 11)
    role.is_active = False
    session.commit()
    assert await load_active_authorization(db, 'PORTAL_USER', 8) == ((), ())
    role.is_active = True
    session.commit()
    assert client.delete(f'{PATH}/{rule_id}').status_code == 204
    assert await load_active_authorization(db, 'PORTAL_USER', 8) == ((), ())
    with pytest.raises(HTTPException):
        await projects._task_management_scope(context, project, db, projects.TASK_EVALUATION_AUTHORIZATION_KEY)
    recreated = client.post(PATH, json={'role_id': 11, 'or_scope': scope})
    rule_id = recreated.json()['id']
    session.add(PerformanceRoleAssignment(subject_type='PORTAL_USER', subject_id=8, role_id=11, scope_type='GLOBAL', scope_ref='GLOBAL', is_active=True))
    session.commit()
    assert len((await load_active_authorization(db, 'PORTAL_USER', 8))[0]) == 1
    assert client.delete(f'{PATH}/{rule_id}').status_code == 204
    assert (await load_active_authorization(db, 'PORTAL_USER', 8))[1] == permissions
    assert session.scalar(select(func.count()).select_from(PerformanceRoleAssignment)) == 1


def test_superior_uses_ancestor_chain_and_is_cycle_safe():
    from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people
    people = build_snapshot_people([
        RosterAuthorizationInput('TOP', '顶层'),
        RosterAuthorizationInput('MID', '中层', direct_supervisor_source_value='TOP'),
        RosterAuthorizationInput('E8', '员工', direct_supervisor_source_value='MID'),
    ])
    def group(field):
        return [rule_service.AuthRuleGroup.model_validate({'conditions': [{'field': field, 'operator': 'include', 'values': ['TOP']}]})]
    assert rule_service.resolve_people(group('superior'), people) == ['E8', 'MID']
    assert rule_service.resolve_people(group('directLeader'), people) == ['MID']
    cyclic = build_snapshot_people([
        RosterAuthorizationInput('TOP', '顶层', direct_supervisor_source_value='MID'),
        RosterAuthorizationInput('MID', '中层', direct_supervisor_source_value='TOP'),
    ])
    assert rule_service.resolve_people(group('superior'), cyclic) == ['MID']


@pytest.mark.asyncio
@pytest.mark.parametrize('case', ['left', 'missing', 'invalid_rule', 'identity_conflict', 'roster_unavailable'])
async def test_rule_grants_fail_closed_without_removing_explicit_assignments(api, monkeypatch, case):
    from fastapi import HTTPException
    from app.performance import auth_context
    from app.performance.snapshot_service import RosterAuthorizationInput, build_snapshot_people
    client, db, session, app = api
    session.add(PerformanceAuthRule(role_id=11, or_scope=[{'conditions': [{'field': 'employee', 'operator': 'include', 'values': ['E8']}]}]))
    session.commit()
    async def people(_db):
        if case == 'roster_unavailable':
            raise HTTPException(status_code=503, detail='花名册字段未准备好')
        if case == 'missing':
            return []
        return build_snapshot_people([RosterAuthorizationInput('E8', '员工', employment_status='离职' if case == 'left' else '在职')])
    monkeypatch.setattr(rule_service, 'load_rule_roster_people', people)
    if case == 'invalid_rule':
        rule = session.scalar(select(PerformanceAuthRule))
        rule.or_scope = [{'conditions': [{'field': 'unknown', 'operator': 'exclude', 'values': ['X']}]}]
        session.commit()
    if case == 'identity_conflict':
        async def conflict(*_args):
            raise auth_context.PerformanceIdentityMappingConflict('身份来源冲突')
        monkeypatch.setattr(auth_context, 'resolve_performance_employee_no', conflict)
    assert await auth_context.load_active_authorization(db, 'PORTAL_USER', 8) == ((), ())
    session.add(PerformanceRoleAssignment(subject_type='PORTAL_USER', subject_id=8, role_id=11, scope_type='ORG', scope_ref='公司/研发', is_active=True))
    session.commit()
    grants, _ = await auth_context.load_active_authorization(db, 'PORTAL_USER', 8)
    assert [(grant.code, grant.scope_type, grant.scope_ref) for grant in grants] == [('custom.manager', 'ORG', '公司/研发')]
    assert (await auth_context.load_active_authorization(db, 'SYSTEM_ACCOUNT', 8)) == ((), ())


def test_auth_rules_migration_offline_ddl_and_model_agree():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0330_performance_auth_rules.py"
    spec = util.spec_from_file_location("auth_rules_migration", path)
    migration = util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.revision == "0330_performance_auth_rules"
    assert migration.down_revision == "0329_performance_detail_fields"
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "CREATE TABLE performance_auth_rules" in sql
    assert "DROP TABLE performance_auth_rules" in sql
    assert "or_scope" in sql
    assert "role_id" in sql
    assert PerformanceAuthRule.__tablename__ == "performance_auth_rules"
