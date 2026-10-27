from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
import pytest_asyncio
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.core.db import get_session
from app.core.deps import current_user
from app.data.models import StandardField, StandardFieldBinding
from app.warehouse.schemas import StandardFieldCreateIn, StandardFieldUpdateIn
from tests.test_scope_classification import postgres_classification_schema
from tests.test_standard_field_catalog import postgres_standard_catalog


def migration():
    path = Path(__file__).parents[1] / 'alembic/versions/0276_standard_field_direct_identity.py'
    spec = spec_from_file_location('direct_field_migration', path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def install(connection):
    module = migration()
    module.op = Operations(MigrationContext.configure(connection))
    module.upgrade()


def definition(**changes):
    return {'field_name': 'Business label', 'business_definition': 'A standard field definition',
            'data_type': 'string', 'category_ids': [], **changes}


@pytest_asyncio.fixture
async def direct_catalog(postgres_standard_catalog):
    from app.warehouse.router import router
    engine, factory, _ = postgres_standard_catalog
    async with engine.begin() as connection:
        await connection.run_sync(install)
    app = FastAPI()
    app.include_router(router, prefix='/api/v1')

    async def session():
        async with factory() as db:
            yield db

    async def user():
        return SimpleNamespace(id=7)

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[current_user] = user
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        yield client, engine, factory


def test_direct_schema_does_not_accept_version_or_governance_controls():
    from pydantic import ValidationError
    for key, value in {'version': 2, 'approved_by': 7, 'owner_user_id': 7, 'permission_domain': 'public'}.items():
        with pytest.raises(ValidationError):
            StandardFieldCreateIn(**definition(field_code='direct_field', **{key: value}))
    with pytest.raises(ValidationError):
        StandardFieldUpdateIn(**definition(expected_revision=-1))
    with pytest.raises(ValidationError):
        StandardFieldCreateIn(**definition(field_code='direct_field', category_ids=[9, 9]))


def test_direct_migration_refuses_downgrade():
    with pytest.raises(RuntimeError, match='forward migration'):
        migration().downgrade()


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_migration_preserves_ids_mapping_categories_and_history(postgres_standard_catalog):
    engine, _, _ = postgres_standard_catalog
    async with engine.begin() as conn:
        await conn.execute(text("INSERT INTO standard_field_version_categories VALUES(11,9)"))
        await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='existing evidence' WHERE id=11"))
        await conn.execute(text("INSERT INTO standard_field_bindings(id,table_column_id,standard_field_version_id,status,binding_version,observed_source_field_id,observed_data_type,created_by,confirmed_by,confirmed_at) VALUES(51,17,11,'confirmed',3,'source-employee','string',7,7,now())"))
        await conn.run_sync(install)
        field = (await conn.execute(text('SELECT id,field_code,data_type,is_active,has_history FROM standard_fields WHERE id=1'))).one()
        assert tuple(field) == (1, 'employee_no', 'string', True, True)
        assert (await conn.execute(text('SELECT id,standard_field_id,binding_version,status FROM standard_field_bindings WHERE id=51'))).one() == (51, 1, 3, 'confirmed')
        assert (await conn.execute(text('SELECT * FROM standard_field_categories'))).one() == (1, 9)
        assert await conn.scalar(text('SELECT approval_reason FROM standard_field_versions WHERE id=11')) == 'existing evidence'
    with pytest.raises(DBAPIError):
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE standard_field_versions SET business_definition='changed' WHERE id=11"))


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_migration_conflict_is_atomic_and_does_not_choose_a_version(postgres_standard_catalog):
    engine, _, _ = postgres_standard_catalog
    async with engine.begin() as conn:
        await conn.execute(text("INSERT INTO standard_field_versions(id,standard_field_id,version,field_name,business_definition,data_type,permission_domain,owner_user_id,created_by) VALUES(12,1,2,'Other','Different identity','number','public',7,7)"))
    with pytest.raises(DBAPIError, match='STANDARD_FIELD_IDENTITY_CONFLICT'):
        async with engine.begin() as conn:
            await conn.run_sync(install)
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='standard_fields' AND column_name='data_type'")) == 0
        assert await conn.scalar(text('SELECT count(*) FROM standard_field_versions')) == 2


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_create_edit_reuses_identity_without_approval_or_version(direct_catalog):
    client, engine, _ = direct_catalog
    base = '/api/v1/warehouse/standard-fields'
    created = await client.post(base, json=definition(field_code='direct_text', category_ids=[9]))
    assert created.status_code == 201, created.text
    field = created.json()
    assert field['is_active'] and field['revision'] == 0 and field['category_ids'] == [9]
    assert not {'latest_version', 'versions', 'current_active_version_id', 'approved_by'} & field.keys()
    updated = await client.put(f"{base}/{field['id']}", json=definition(field_name='Renamed', expected_revision=0, category_ids=[9]))
    assert updated.status_code == 200, updated.text
    assert updated.json()['id'] == field['id'] and updated.json()['revision'] == 1
    stale = await client.put(f"{base}/{field['id']}", json=definition(expected_revision=0))
    assert stale.status_code == 409
    listed = await client.get(base, params={'keyword': 'Renamed'})
    assert [row['id'] for row in listed.json()['items']] == [field['id']]
    async with engine.connect() as conn:
        assert await conn.scalar(text('SELECT count(*) FROM standard_field_versions')) == 1
        assert await conn.scalar(text("SELECT count(*) FROM system_logs WHERE action='standard_field_updated'")) == 1


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize('suffix,method', [('versions','POST'),('versions/11','PUT'),('versions/11/approve','POST'),('display-name','PATCH')])
async def test_old_writes_are_not_routable(direct_catalog, suffix, method):
    client, _, _ = direct_catalog
    response = await client.request(method, f'/api/v1/warehouse/standard-fields/1/{suffix}', json={})
    assert response.status_code in {404, 405}, response.text


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_confirm_mapping_uses_field_identity_and_keeps_protection(direct_catalog):
    client, _, factory = direct_catalog
    base = '/api/v1/warehouse/standard-fields/1'
    created = await client.post(base + '/bindings', json={'target_kind': 'table_column', 'target_id': 17})
    assert created.status_code == 201, created.text
    binding = created.json()
    assert binding['standard_field_id'] == 1 and 'standard_field_version_id' not in binding
    confirmed = await client.post(f"{base}/bindings/{binding['id']}/confirm", json={'expected_revision': 0, 'reason': 'Confirmed source identity'})
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()['status'] == 'confirmed'
    duplicate = await client.post(base + '/bindings', json={'target_kind': 'table_column', 'target_id': 17})
    assert duplicate.status_code == 409
    changed = await client.put(base, json=definition(data_type='number', expected_revision=0))
    assert changed.status_code == 409
    deleted = await client.delete(base, params={'expected_revision': 0})
    assert deleted.status_code == 409
    async with factory() as db:
        row = await db.scalar(select(StandardFieldBinding).where(StandardFieldBinding.id == binding['id']))
        assert row.standard_field_id == 1 and row.binding_version == 1


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_mapping_rechecks_source_type_and_extra_version_control(direct_catalog):
    client, engine, _ = direct_catalog
    base = '/api/v1/warehouse/standard-fields/1/bindings'
    old = await client.post(base, json={'target_kind': 'table_column', 'target_id': 17, 'standard_field_version_id': 11})
    assert old.status_code == 422
    created = await client.post(base, json={'target_kind': 'table_column', 'target_id': 17})
    assert created.status_code == 201, created.text
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE source_probe ALTER COLUMN employee_no TYPE numeric USING null::numeric"))
    confirmed = await client.post(base + f"/{created.json()['id']}/confirm", json={'expected_revision': 0, 'reason': 'Recheck'})
    assert confirmed.status_code == 409


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_direct_categories_affect_current_field_permissions(direct_catalog):
    client, engine, factory = direct_catalog
    from app.permissions.masker import get_hidden_columns
    created = await client.post('/api/v1/warehouse/standard-fields/1/bindings', json={'target_kind': 'table_column', 'target_id': 17})
    assert created.status_code == 201, created.text
    confirmed = await client.post(f"/api/v1/warehouse/standard-fields/1/bindings/{created.json()['id']}/confirm", json={'expected_revision': 0, 'reason': 'Map'})
    assert confirmed.status_code == 200, confirmed.text
    async with engine.begin() as conn:
        await conn.execute(text('DELETE FROM role_visible_categories WHERE category_id=9'))
    async with factory() as db:
        assert 'employee_no' not in await get_hidden_columns(SimpleNamespace(id=7), 'source_probe', db)
    response = await client.put('/api/v1/warehouse/standard-fields/1', json=definition(expected_revision=0, category_ids=[9]))
    assert response.status_code == 200, response.text
    async with factory() as db:
        assert 'employee_no' in await get_hidden_columns(SimpleNamespace(id=7), 'source_probe', db)


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_direct_catalog_real_permissions_and_atomic_audit_failure(direct_catalog, monkeypatch):
    client, engine, _ = direct_catalog
    async with engine.begin() as conn:
        await conn.execute(text('UPDATE role_menus SET can_update=false WHERE menu_id=2'))
    denied = await client.put('/api/v1/warehouse/standard-fields/1', json=definition(expected_revision=0))
    assert denied.status_code == 403
    async with engine.begin() as conn:
        await conn.execute(text('UPDATE role_menus SET can_update=true WHERE menu_id=2'))
    monkeypatch.setattr('app.warehouse.service.standard_fields._audit', lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError('forced audit failure')))
    with pytest.raises(RuntimeError, match='forced audit failure'):
        await client.put('/api/v1/warehouse/standard-fields/1', json=definition(expected_revision=0, field_name='Not committed'))
    async with engine.connect() as conn:
        row = (await conn.execute(text('SELECT revision,display_name FROM standard_fields WHERE id=1'))).one()
        assert row.revision == 0 and row.display_name != 'Not committed'


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_release_and_report_resolution_use_direct_confirmed_identity(direct_catalog, monkeypatch):
    from app.datasets.authorization_contract import _confirmed_output_bindings
    from app.reports.report_service import _resolve_report_columns
    from app.reports.config import ReportConfig
    from app.warehouse.service.release_gate import check_dataset_release
    from app.datasets.models import DatasetOutputField
    client, engine, factory = direct_catalog
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE table_columns SET is_sensitive=false WHERE id=18"))
        await conn.execute(text("UPDATE dataset_output_fields SET is_sensitive=false WHERE id=41"))
        await conn.execute(text("INSERT INTO standard_field_bindings(dataset_output_field_id,standard_field_id,status,binding_version,observed_source_field_id,observed_data_type,created_by,confirmed_by,confirmed_at) VALUES(41,1,'confirmed',1,'dwd-employee','string',7,7,now())"))
    async with factory() as db:
        bindings = await _confirmed_output_bindings(db, 4)
        assert bindings['employee_no'][0][2].id == 1
        outputs = (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == 4))).scalars().all()
        result = await _resolve_report_columns(ReportConfig(columns=['employee_no']), 4, outputs, db)
        assert result[0][1].id == 41
        gate = await check_dataset_release(db, 4, verify_conversion=False)
        assert gate.fields_eligible
        assert 'output_semantic_version_invalid' not in {issue.code for issue in gate.issues}
        assert 'authorization_contract_unverified' in {issue.code for issue in gate.issues}
    async with engine.begin() as conn:
        await conn.execute(text('UPDATE standard_fields SET is_active=false WHERE id=1'))
    async with factory() as db:
        gate = await check_dataset_release(db, 4, verify_conversion=False)
        assert not gate.fields_eligible
        assert 'output_standard_field_invalid' in {issue.code for issue in gate.issues}


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_concurrent_field_edits_have_one_winner_and_no_extra_versions(direct_catalog):
    import asyncio
    client, engine, _ = direct_catalog
    response = await client.post('/api/v1/warehouse/standard-fields', json=definition(field_code='race_field'))
    assert response.status_code == 201
    field_id = response.json()['id']
    first, second = await asyncio.gather(*[
        client.put(f'/api/v1/warehouse/standard-fields/{field_id}', json=definition(expected_revision=0, field_name=name))
        for name in ['First', 'Second']
    ])
    assert sorted([first.status_code, second.status_code]) == [200, 409]
    async with engine.connect() as conn:
        assert await conn.scalar(text('SELECT revision FROM standard_fields WHERE id=:id'), {'id': field_id}) == 1
        assert await conn.scalar(text('SELECT count(*) FROM standard_field_versions WHERE standard_field_id=:id'), {'id': field_id}) == 0


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_dwd_output_mapping_reuses_same_direct_field_and_rejects_wrong_scope(direct_catalog):
    client, engine, _ = direct_catalog
    async with engine.begin() as conn:
        from app.data.models import RegisteredTable
        await conn.execute(RegisteredTable.__table__.insert().values(id=32, table_name='dwd_probe', table_label='Target', warehouse_layer='DWD', scope_strategy='person_first'))
        await conn.execute(text('UPDATE table_columns SET is_sensitive=false WHERE id=18'))
        await conn.execute(text('UPDATE dataset_output_fields SET is_sensitive=false WHERE id=41'))
    response = await client.post('/api/v1/warehouse/standard-fields/1/bindings', json={
        'target_kind': 'dataset_output_field', 'target_id': 41, 'dataset_id': 4,
    })
    assert response.status_code == 201, response.text
    data = response.json()
    assert data['standard_field_id'] == 1 and 'standard_field_version_id' not in data
    confirmed = await client.post(f"/api/v1/warehouse/standard-fields/1/bindings/{data['id']}/confirm",
        json={'expected_revision': 0, 'reason': 'Source and output same standard identity'})
    assert confirmed.status_code == 200, confirmed.text
    wrong = await client.post(f"/api/v1/warehouse/standard-fields/999/bindings/{data['id']}/confirm",
        json={'expected_revision': 0, 'reason': 'Forged identity'})
    assert wrong.status_code == 404


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_omitted_categories_preserve_existing_protection(direct_catalog):
    client, _, _ = direct_catalog
    response = await client.post('/api/v1/warehouse/standard-fields', json=definition(field_code='classified', category_ids=[9]))
    field_id = response.json()['id']
    payload = definition(field_name='Only rename', expected_revision=0)
    payload.pop('category_ids')
    updated = await client.put(f'/api/v1/warehouse/standard-fields/{field_id}', json=payload)
    assert updated.status_code == 200, updated.text
    assert updated.json()['category_ids'] == [9]


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_contract_resolution_snapshot_and_refresh_use_direct_identity(direct_catalog):
    from app.datasets.authorization_contract import ProductAuthorizationDefinition, _resolve_standard_definition, _validate_resolution
    from app.warehouse.service.standardization import StandardizationRuleService
    from app.data.models import TableColumn
    client, engine, factory = direct_catalog
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE standard_fields SET grain_level='coarse',permission_domain='org',is_permission_anchor=true WHERE id=1"))
        await conn.execute(text("INSERT INTO standard_field_bindings(table_column_id,standard_field_id,status,binding_version,observed_source_field_id,observed_data_type,created_by,confirmed_by,confirmed_at) VALUES(18,1,'confirmed',1,'dwd-employee','string',7,7,now())"))
        await conn.execute(text("INSERT INTO standard_field_bindings(dataset_output_field_id,standard_field_id,status,binding_version,observed_source_field_id,observed_data_type,created_by,confirmed_by,confirmed_at) VALUES(41,1,'confirmed',1,'dwd-employee','string',7,7,now())"))
    async with factory() as db:
        payload = ProductAuthorizationDefinition.model_validate({
            'schema_version': 2, 'standard_fields': ['employee_no'], 'facts': [{'alias': 'current', 'table_name': 'dwd_probe',
                'fact_key': 'employee_no', 'employee_key': 'employee_no', 'role': 'person_fact'}],
            'output_fields': ['employee_no'], 'dimensions': [], 'measures': [],
            'internal_fields': [],
        })
        resolved = await _resolve_standard_definition(db, 4, payload)
        identity = resolved.resolved_standard_fields['outputs']['employee_no']
        assert identity['standard_field_id'] == 1 and 'version_id' not in identity
        await _validate_resolution(db, 4, resolved)
        column = await db.get(TableColumn, 18)
        await StandardizationRuleService(db)._validate_refresh_binding(column=column, output_id=41)
        identity['standard_field_id'] = 999
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as error:
            await _validate_resolution(db, 4, resolved)
        assert error.value.status_code == 409
