import asyncio
from types import SimpleNamespace

import pytest
import pytest_asyncio
from pydantic import ValidationError
from sqlalchemy import select, text

from app.core.deps import current_user
from app.data.models import StandardField
from app.users.models import Menu, RoleMenu
from app.master_data.schemas import EntityCreateIn, EntityUpdateIn
from tests.test_standard_field_direct_identity import direct_catalog, definition
from tests.test_standard_field_catalog import postgres_standard_catalog
from tests.test_scope_classification import postgres_classification_schema

BASE = '/api/v1/master-data/entities'
FIELDS = '/api/v1/warehouse/standard-fields'


def test_entity_schema_rejects_identity_forgery():
    for extra in ({'owner_user_id': 8}, {'writer': 'local'}, {'id': 3}, {'is_active': False}):
        with pytest.raises(ValidationError):
            EntityCreateIn(entity_code='person', name='Person', description='Definition', **extra)
    for extra in ({'entity_code': 'other'}, {'owner_user_id': 8}, {'expected_revision': -1}):
        with pytest.raises(ValidationError):
            EntityUpdateIn(**{'name': 'Name', 'description': 'Definition', 'expected_revision': 0, **extra})


@pytest_asyncio.fixture
async def entity_api(direct_catalog):
    from app.master_data.router import router
    client, engine, factory = direct_catalog
    app = client._transport.app
    app.include_router(router, prefix='/api/v1')
    actor = {'id': 7}
    async def user():
        return SimpleNamespace(id=actor['id'])
    app.dependency_overrides[current_user] = user
    async with engine.begin() as conn:
        await conn.execute(Menu.__table__.insert().values(id=3, code="system.master_entities", label="Master entities"))
        await conn.execute(RoleMenu.__table__.insert().values(id=3, role_id=1, menu_id=3, can_view=True, can_create=True, can_update=True, can_delete=True))
        await conn.execute(text('INSERT INTO users(id) VALUES(8)'))
        await conn.execute(text('INSERT INTO user_roles(user_id,role_id) VALUES(8,1)'))
    yield client, engine, factory, actor


async def person(client, code='person'):
    response = await client.post(BASE, json={'entity_code': code, 'name': 'Person', 'description': 'Configuration only'})
    assert response.status_code == 201, response.text
    return response.json()


async def workplace(client, entity_id, **changes):
    payload = definition(field_code='work_location', field_name='Work location', data_type='enum', entity_id=entity_id,
        value_domain={'items': [{'code': 'test-site', 'name': 'Isolated test site', 'enabled': True, 'sort_order': 0}]}, **changes)
    return await client.post(FIELDS, json=payload)


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_person_and_catalog_share_stable_field_identity(entity_api):
    client, engine, _, _ = entity_api
    entity = await person(client)
    created = await workplace(client, entity['id'])
    assert created.status_code == 201, created.text
    field = created.json()
    assert field['entity_id'] == entity['id'] and field['entity_name'] == 'Person'
    updated = await client.put(BASE + f"/{entity['id']}", json={'name': 'Renamed Person', 'description': 'Updated', 'expected_revision': 0})
    assert updated.status_code == 200 and updated.json()['id'] == entity['id']
    read = (await client.get(FIELDS + f"/{field['id']}")).json()
    assert read['entity_name'] == 'Renamed Person' and read['value_domain'] == field['value_domain']
    assert (await client.get(FIELDS, params={'entity_id': entity['id']})).json()['total'] == 1
    async with engine.connect() as conn:
        assert await conn.scalar(text('SELECT count(*) FROM standard_field_versions')) == 1
        assert await conn.scalar(text('SELECT owner_user_id FROM master_entity_definitions')) == 7
        assert await conn.scalar(text("SELECT count(*) FROM system_logs WHERE action='entity_definition_updated'")) == 1


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_other_owner_cannot_enumerate_mutate_or_bind(entity_api):
    client, _, _, actor = entity_api
    entity = await person(client)
    field = (await workplace(client, entity['id'])).json()
    actor['id'] = 8
    assert (await client.get(BASE)).json() == {'total': 0, 'items': []}
    result = (await client.get(FIELDS)).json()
    assert result['total'] == 1 and result['items'][0]['entity_id'] is None
    for method, path, payload in [
        ('GET', BASE + f"/{entity['id']}", None),
        ('PUT', BASE + f"/{entity['id']}", {'name': 'Hijack', 'description': 'No', 'expected_revision': 0}),
        ('GET', FIELDS + f"/{field['id']}", None),
        ('PUT', FIELDS + f"/{field['id']}", definition(expected_revision=0)),
        ('DELETE', FIELDS + f"/{field['id']}?expected_revision=0", None),
        ('GET', FIELDS + f"/{field['id']}/binding-candidates?table_name=source_probe", None),
        ('POST', FIELDS + f"/{field['id']}/bindings", {'target_kind': 'table_column', 'target_id': 17}),
        ('POST', FIELDS + f"/{field['id']}/bindings/99/confirm", {'expected_revision': 0, 'reason': 'Denied'}),
        ('POST', FIELDS + f"/{field['id']}/bindings/99/invalidate", {'expected_revision': 0, 'reason': 'Denied'}),
    ]:
        response = await client.request(method, path, json=payload)
        assert response.status_code == 404, (method, path, response.text)
    assert (await client.get(FIELDS, params={'entity_id': entity['id']})).status_code == 404
    assert (await workplace(client, entity['id'])).status_code == 404


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_unknown_inactive_and_conflicting_entity_are_rejected(entity_api):
    client, engine, _, _ = entity_api
    entity = await person(client)
    other = await person(client, 'other')
    assert (await workplace(client, 999999)).status_code == 404
    assert (await workplace(client, other['id'])).status_code == 422
    created = await workplace(client, entity['id'])
    assert created.status_code == 201
    field = created.json()
    for target in (None, other['id']):
        response = await client.put(FIELDS + f"/{field['id']}", json=definition(data_type='enum', entity_id=target, expected_revision=0))
        assert response.status_code == 409, response.text
    async with engine.begin() as conn:
        await conn.execute(text('UPDATE master_entity_definitions SET is_active=false WHERE id=:id'), {'id': entity['id']})
    response = await client.put(FIELDS + f"/{field['id']}", json=definition(data_type='enum', expected_revision=0))
    assert response.status_code == 409
    assert (await workplace(client, entity['id'])).status_code == 409


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_identifier_types_and_invalid_enums_are_atomic(entity_api):
    client, engine, _, _ = entity_api
    entity = await person(client)
    for code in ('employee_no', 'mobile_phone', 'bank_card_number'):
        response = await client.post(FIELDS, json=definition(field_code=code, data_type='number', entity_id=entity['id']))
        assert response.status_code == 422, response.text
    assert (await client.post(FIELDS, json=definition(field_code='work_location', data_type='string', entity_id=entity['id']))).status_code == 422
    duplicate = {'items': [{'code': 'same', 'name': 'First'}, {'code': 'same', 'name': 'Second'}]}
    response = await client.post(FIELDS, json=definition(field_code='work_location', data_type='enum', entity_id=entity['id'], value_domain=duplicate))
    assert response.status_code == 422
    async with engine.connect() as conn:
        assert await conn.scalar(text('SELECT count(*) FROM standard_fields')) == 1
        assert await conn.scalar(text("SELECT count(*) FROM system_logs WHERE action='standard_field_created'")) == 0
    for code in ('mobile_phone', 'bank_card_number'):
        response = await client.post(FIELDS, json=definition(field_code=code, data_type='string', entity_id=entity['id']))
        assert response.status_code == 201


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_menu_revocation_does_not_leave_count_or_binding_bypass(entity_api):
    client, engine, _, _ = entity_api
    entity = await person(client)
    field = (await workplace(client, entity['id'])).json()
    async with engine.begin() as conn:
        await conn.execute(text('UPDATE role_menus SET can_view=false WHERE menu_id=3'))
    assert (await client.get(BASE)).status_code == 403
    assert (await client.get(FIELDS + f"/{field['id']}")).status_code == 403
    assert (await client.get(FIELDS)).json()['total'] == 1
    assert (await client.get(FIELDS + f"/{field['id']}/binding-candidates?table_name=source_probe")).status_code == 403
    assert (await client.post(BASE, json={'entity_code': 'denied', 'name': 'No', 'description': 'No'})).status_code == 403


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_entity_revision_concurrency_keeps_one_update(entity_api):
    client, _, factory, _ = entity_api
    from app.master_data.service import update_entity
    from fastapi import HTTPException
    entity = await person(client)
    async def edit(name):
        async with factory() as db:
            return await update_entity(db, entity['id'], EntityUpdateIn(name=name, description='No data', expected_revision=0), SimpleNamespace(id=7))
    results = await asyncio.gather(edit('One'), edit('Two'), return_exceptions=True)
    assert sum(isinstance(row, HTTPException) and row.status_code == 409 for row in results) == 1
    assert (await client.get(BASE + f"/{entity['id']}")).json()['revision'] == 1


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_database_guards_and_audit_rollback(entity_api, monkeypatch):
    client, engine, _, _ = entity_api
    from app.master_data import service
    from sqlalchemy.exc import DBAPIError
    entity = await person(client)
    with pytest.raises(DBAPIError):
        async with engine.begin() as conn:
            await conn.execute(text('UPDATE master_entity_definitions SET owner_user_id=8 WHERE id=:id'), {'id': entity['id']})
    def fail(*args):
        raise RuntimeError('audit failure')
    monkeypatch.setattr(service, 'audit', fail)
    with pytest.raises(RuntimeError, match='audit failure'):
        await person(client, 'rolled_back')
    async with engine.connect() as conn:
        assert await conn.scalar(text('SELECT count(*) FROM master_entity_definitions')) == 1
        assert await conn.scalar(text("SELECT count(*) FROM system_logs WHERE action='entity_definition_created'")) == 1


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_legacy_unassigned_work_location_keeps_existing_contract(entity_api):
    client, engine, _, _ = entity_api
    async with engine.begin() as conn:
        row = await conn.execute(StandardField.__table__.insert().values(field_code='work_location', display_name='Legacy location', business_definition='Existing unassigned definition', data_type='string', created_by=7).returning(StandardField.id))
        field_id = row.scalar_one()
    response = await client.put(FIELDS + f'/{field_id}', json=definition(expected_revision=0, field_name='Legacy rename'))
    assert response.status_code == 200, response.text
    assert response.json()['entity_id'] is None and response.json()['data_type'] == 'string'
