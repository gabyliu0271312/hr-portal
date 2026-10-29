from datetime import UTC, datetime
from importlib.util import module_from_spec, spec_from_file_location
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
import pytest_asyncio
from sqlalchemy import select, text, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from pydantic import ValidationError

from app.master_data import records
from app.master_data.schemas import EntityPublishIn, EntityRecordAccessIn, EntityRecordUserAccessIn
from app.master_data.models import EntityRecordAcl, EntitySource, ScopePersonReference
from app.system.models import SystemLog
from app.scopes.models import ScopeTag, UserScopeTag
from tests.test_master_entity_definitions import entity_api
from tests.test_standard_field_direct_identity import direct_catalog
from tests.test_standard_field_catalog import postgres_standard_catalog
from tests.test_scope_classification import postgres_classification_schema


def field(**changes):
    return SimpleNamespace(id=12, data_type='enum', revision=0,
        value_domain={'items': [{'code': 'test-site', 'enabled': True}, {'code': 'disabled', 'enabled': False}]},
        **changes)


def entity(**changes):
    values = dict(id=3, revision=0, is_active=True, published_at=None, published_by=None, published_fields=None)
    return SimpleNamespace(**{**values, **changes})


def database(*, fields=(), scalars=()):
    return SimpleNamespace(scalar=AsyncMock(side_effect=list(scalars)),
        scalars=AsyncMock(return_value=SimpleNamespace(all=lambda: list(fields))),
        execute=AsyncMock(), flush=AsyncMock(), add=Mock())


def assert_error(exc, status, code):
    assert exc.value.status_code == status
    assert exc.value.detail['code'] == code


@pytest.mark.parametrize('revision', [-1, True, 1.0, '1', None])
def test_publish_revision_is_strict(revision):
    with pytest.raises(ValidationError):
        EntityPublishIn(expected_revision=revision)


@pytest.mark.parametrize('extra', [
    {'writer': 'internal'}, {'published_by': 7}, {'published_fields': []}, {'source_id': 1},
])
def test_publish_schema_cannot_forge_service_or_publication(extra):
    with pytest.raises(ValidationError):
        EntityPublishIn(expected_revision=0, **extra)


@pytest.mark.parametrize('subjects', [{'user_ids': [0]}, {'role_ids': [-1]}, {'user_ids': [7, 7]}, {'role_ids': [1, 1]}, {'writer': 'internal'}])
def test_record_acl_schema_rejects_invalid_subjects_and_writer(subjects):
    with pytest.raises(ValidationError):
        EntityRecordAccessIn(**subjects)


@pytest.mark.parametrize('value', ['disabled', 'unknown', 'Isolated test site', '', None, 1, True, [], {}])
def test_enum_rejects_disabled_unknown_label_and_non_string(value):
    with pytest.raises(HTTPException) as exc:
        records.validate_enum(field(), value)
    assert_error(exc, 422, 'record_enum_invalid')


def test_enum_accepts_enabled_code_only():
    assert records.validate_enum(field(), 'test-site') == 'test-site'


@pytest.mark.asyncio
@pytest.mark.parametrize('context', [None, {'source_id': 1, 'entity_id': 3, 'writer': 'internal'},
    SimpleNamespace(source_id=1, entity_id=3, _seal=None), records._SourceContext(1, 3, object())])
async def test_service_writer_forgery_is_rejected_before_database(context):
    db = database()
    with pytest.raises(HTTPException) as exc:
        await records.receive_record(db, context, 'synthetic-001', {'12': 'test-site'})
    assert_error(exc, 403, 'writer_denied')
    db.scalar.assert_not_awaited()
    db.execute.assert_not_awaited()
    db.add.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize('source', [None, SimpleNamespace(is_active=False, adapter_code='internal'),
    SimpleNamespace(is_active=True, adapter_code='ucp'), SimpleNamespace(is_active=True, adapter_code='local')])
async def test_internal_writer_binding_requires_approved_active_adapter(source):
    db = database(scalars=[source])
    with pytest.raises(HTTPException) as exc:
        await records.bind_internal_source(db, 1)
    assert_error(exc, 403, 'source_denied')
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize('target,code,status', [
    (None, 'entity_not_found', 404), (entity(), 'entity_not_published', 409),
    (entity(is_active=False, published_at=datetime.now(UTC)), 'entity_not_published', 409),
    (entity(published_at=datetime.now(UTC), published_fields=[]), 'entity_contract_changed', 409),
])
async def test_record_access_requires_current_active_publication(target, code, status):
    db = database(fields=[field()], scalars=[target])
    with pytest.raises(HTTPException) as exc:
        await records.published_entity(db, 3, lock=True)
    assert_error(exc, status, code)
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize('data_type', ['string', 'number', 'integer', 'boolean', 'date'])
async def test_publish_refuses_unsupported_types_before_ddl(data_type):
    f = field()
    f.data_type = data_type
    db = database(fields=[f])
    target = entity()
    with pytest.raises(HTTPException) as exc:
        await records.publish(db, target, SimpleNamespace(id=7))
    assert_error(exc, 422, 'entity_field_type_unsupported')
    db.execute.assert_not_awaited()
    assert target.published_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize('items', [None, [], [{'code': 'disabled', 'enabled': False}]])
async def test_publish_requires_enabled_enum_domain(items):
    f = field()
    f.value_domain = {'items': items} if items is not None else None
    db = database(fields=[f])
    with pytest.raises(HTTPException) as exc:
        await records.publish(db, entity(), SimpleNamespace(id=7))
    assert_error(exc, 422, 'entity_value_domain_missing')
    db.execute.assert_not_awaited()
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_publish_refuses_empty_definition():
    db = database()
    with pytest.raises(HTTPException) as exc:
        await records.publish(db, entity(), SimpleNamespace(id=7))
    assert_error(exc, 422, 'entity_field_type_unsupported')
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_publish_uses_physical_field_identity_and_republish_is_idempotent():
    db = database(fields=[field()])
    target = entity()
    await records.publish(db, target, SimpleNamespace(id=7))
    sql = str(db.execute.await_args.args[0])
    assert 'CREATE TABLE "master_records_3"' in sql
    assert '"field_12" TEXT NOT NULL CHECK ("field_12" IN (\'test-site\'))' in sql
    assert 'disabled' not in sql
    assert 'UNIQUE(source_id, source_record_id)' in sql
    assert target.published_by == 7 and target.published_at is not None
    assert target.published_fields == [{'id': 12, 'type': 'enum', 'revision': 0}]
    assert target.revision == 1
    audit = db.add.call_args.args[0]
    assert audit.action == 'entity_published'
    assert audit.metadata_json == {'entity_id': 3, 'revision': 1}
    await records.publish(db, target, SimpleNamespace(id=7))
    assert db.execute.await_count == db.flush.await_count == db.add.call_count == 1
    f = field()
    f.revision = 1
    db.scalars.return_value = SimpleNamespace(all=lambda: [f])
    with pytest.raises(HTTPException) as exc:
        await records.publish(db, target, SimpleNamespace(id=7))
    assert_error(exc, 409, 'entity_republish_unsupported')
    assert db.execute.await_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize('identity', [None, 1, True, '', '  ', 'x' * 257])
async def test_service_requires_stable_nonempty_string_source_identity(identity):
    f = field()
    target = entity(published_at=datetime.now(UTC), published_fields=records.field_contract([f]))
    source = SimpleNamespace(id=1, entity_id=3, is_active=True, adapter_code='internal', field_ids=['12'])
    db = database(fields=[f], scalars=[source, target, source])
    context = await records.bind_internal_source(db, 1)
    with pytest.raises(HTTPException) as exc:
        await records.receive_record(db, context, identity, {'12': 'test-site'})
    assert_error(exc, 422, 'source_identity_invalid')
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize('values,whitelist', [
    ({}, ['12']), ({'12': 'test-site', '99': 'test-site'}, ['12']),
    ({12: 'test-site'}, ['12']), ({'12': 'test-site'}, []), ([], ['12']),
])
async def test_service_requires_exact_published_fields_and_source_whitelist(values, whitelist):
    f = field()
    target = entity(published_at=datetime.now(UTC), published_fields=records.field_contract([f]))
    source = SimpleNamespace(id=1, entity_id=3, is_active=True, adapter_code='internal', field_ids=whitelist)
    db = database(fields=[f], scalars=[source, target, source])
    context = await records.bind_internal_source(db, 1)
    with pytest.raises(HTTPException) as exc:
        await records.receive_record(db, context, 'synthetic-001', values)
    assert_error(exc, 422, 'record_fields_denied')
    db.execute.assert_not_awaited()
    db.add.assert_not_called()


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_publish_record_receive_idempotency_conflict_and_audit_atomic(entity_api):
    client, engine, factory, _ = entity_api
    response = await client.post('/api/v1/master-data/entities', json={
        'entity_code': 'person', 'name': 'Person records', 'description': 'Synthetic isolated records',
    })
    assert response.status_code == 201, response.text
    entity_json = response.json()
    field_response = await client.post('/api/v1/warehouse/standard-fields', json={
        'field_code': 'work_location_records', 'field_name': 'Work location',
        'business_definition': 'Synthetic work location', 'data_type': 'enum',
        'entity_id': entity_json['id'],
        'value_domain': {'items': [{'code': 'site-a', 'name': 'Site A', 'enabled': True, 'sort_order': 0},
                                   {'code': 'site-b', 'name': 'Site B', 'enabled': True, 'sort_order': 1}]},
        'category_ids': [],
    })
    assert field_response.status_code == 201, field_response.text
    field_id = field_response.json()['id']
    published = await client.post(f"/api/v1/master-data/entities/{entity_json['id']}/publish", json={'expected_revision': 0})
    assert published.status_code == 200, published.text
    async with factory() as db:
        db.add(EntitySource(entity_id=entity_json['id'], source_system='person-service', adapter_code='internal',
            field_ids=[str(field_id)], is_active=True))
        await db.flush()
        source = (await db.scalars(select(EntitySource).where(EntitySource.entity_id == entity_json['id']))).one()
        db.add(EntityRecordAcl(entity_id=entity_json['id'], user_id=7))
        await db.commit()
        context = await records.bind_internal_source(db, source.id)
        first = await records.receive_record(db, context, 'person-001', {str(field_id): 'site-a'})
        duplicate = await records.receive_record(db, context, 'person-001', {str(field_id): 'site-a'})
        assert duplicate == first
        with pytest.raises(HTTPException) as exc:
            await records.receive_record(db, context, 'person-001', {str(field_id): 'site-b'})
        assert_error(exc, 409, 'source_record_conflict')
        await db.commit()
        assert await db.scalar(select(func.count()).select_from(SystemLog).where(SystemLog.action == 'entity_record_received')) == 1
        tag = ScopeTag(name='received-person-scope', dimension='org', org_scope_enabled=False,
            org_scope_unlimited=False, person_scope_enabled=True)
        db.add(tag)
        await db.flush()
        db.add(UserScopeTag(user_id=7, tag_id=tag.id))
        db.add(ScopePersonReference(tag_id=tag.id, entity_id=entity_json['id'], record_id=first))
        await db.commit()
    response = await client.get(f"/api/v1/master-data/entities/{entity_json['id']}/records")
    assert response.status_code == 200, response.text
    assert response.json()['total'] == 1
    assert response.json()['items'][0]['values'][str(field_id)] == 'site-a'
    async with engine.begin() as conn:
        await conn.execute(text('INSERT INTO standard_field_categories(standard_field_id, field_category_id) VALUES (:field, 9)'), {'field': field_id})
        await conn.execute(text('DELETE FROM role_visible_categories WHERE role_id = 1 AND category_id = 9'))
    hidden = await client.get(f"/api/v1/master-data/entities/{entity_json['id']}/records")
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()['fields'] == []
    assert hidden.json()['items'][0]['values'] == {}
    from sqlalchemy.exc import IntegrityError
    table = records.table_name(entity_json['id'])
    with pytest.raises(IntegrityError):
        async with engine.begin() as conn:
            await conn.execute(text(f'INSERT INTO "{table}" (source_id,source_record_id,payload_digest,"field_{field_id}") '
                "VALUES (:source,'invalid-enum','digest','not-in-domain')"), {'source': source.id})
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE system_logs ADD CONSTRAINT reject_record_audit CHECK (action <> 'entity_record_received') NOT VALID"))
    with pytest.raises(IntegrityError):
        async with factory() as db:
            async with db.begin():
                context = await records.bind_internal_source(db, source.id)
                await records.receive_record(db, context, 'audit-rollback', {str(field_id): 'site-a'})
    async with engine.begin() as conn:
        assert await conn.scalar(text(f'SELECT count(*) FROM "{table}"')) == 1
        await conn.execute(text('ALTER TABLE system_logs DROP CONSTRAINT reject_record_audit'))
    import asyncio
    async def receive_same_identity():
        async with factory() as db:
            async with db.begin():
                context = await records.bind_internal_source(db, source.id)
                return await records.receive_record(db, context, 'concurrent-001', {str(field_id): 'site-b'})
    ids = await asyncio.gather(receive_same_identity(), receive_same_identity())
    assert ids[0] == ids[1] != first
    async with engine.connect() as conn:
        assert await conn.scalar(text(f'SELECT count(*) FROM "{table}"')) == 2
        assert await conn.scalar(text("SELECT count(*) FROM system_logs WHERE action='entity_record_received'")) == 2
        assert await conn.scalar(text(f"SELECT count(*) FROM \"{table}\" WHERE source_record_id='audit-rollback'")) == 0


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_record_acl_scope_reference_and_record_entities_are_fail_closed(entity_api):
    client, engine, factory, actor = entity_api
    response = await client.post('/api/v1/master-data/entities', json={
        'entity_code': 'person', 'name': 'Scoped person records', 'description': 'Synthetic scope records',
    })
    assert response.status_code == 201
    eid = response.json()['id']
    field_response = await client.post('/api/v1/warehouse/standard-fields', json={
        'field_code': 'scope_location', 'field_name': 'Scope location', 'business_definition': 'Synthetic scope location',
        'data_type': 'enum', 'entity_id': eid,
        'value_domain': {'items': [{'code': 'site-a', 'name': 'Site A', 'enabled': True, 'sort_order': 0},
                                   {'code': 'site-b', 'name': 'Site B', 'enabled': True, 'sort_order': 1}]},
        'category_ids': [],
    })
    assert field_response.status_code == 201
    fid = field_response.json()['id']
    assert (await client.post(f'/api/v1/master-data/entities/{eid}/publish', json={'expected_revision': 0})).status_code == 200
    async with factory() as db:
        db.add(EntitySource(entity_id=eid, source_system='scope-person-service', adapter_code='internal', field_ids=[str(fid)], is_active=True))
        await db.flush()
        source = (await db.scalars(select(EntitySource).where(EntitySource.entity_id == eid))).one()
        db.add(EntityRecordAcl(entity_id=eid, user_id=7))
        await db.commit()
        context = await records.bind_internal_source(db, source.id)
        first = await records.receive_record(db, context, 'person-a', {str(fid): 'site-a'})
        second = await records.receive_record(db, context, 'person-b', {str(fid): 'site-b'})
        await db.commit()
        tag = ScopeTag(name='stable-person-reference', dimension='org', org_scope_enabled=False,
            org_scope_unlimited=False, person_scope_enabled=True)
        db.add(tag)
        await db.flush()
        db.add(UserScopeTag(user_id=7, tag_id=tag.id))
        from app.master_data.models import ScopePersonReference
        db.add(ScopePersonReference(tag_id=tag.id, entity_id=eid, record_id=first))
        await db.commit()
    listed = await client.get(f'/api/v1/master-data/entities/{eid}/records')
    assert listed.status_code == 200, listed.text
    assert listed.json()['total'] == 1
    assert listed.json()['items'][0]['values'][str(fid)] == 'site-a'
    entities = await client.get('/api/v1/master-data/record-entities')
    assert entities.status_code == 200, entities.text
    assert [row['id'] for row in entities.json()['items']] == [eid]
    actor['id'] = 8
    assert (await client.get(f'/api/v1/master-data/entities/{eid}/records')).status_code == 403
    assert (await client.get('/api/v1/master-data/record-entities')).status_code == 200
    assert (await client.get('/api/v1/master-data/record-entities')).json()['items'] == []
    async with factory() as db:
        db.add(EntityRecordAcl(entity_id=eid, user_id=8))
        await db.commit()
    no_d = await client.get(f'/api/v1/master-data/entities/{eid}/records')
    assert no_d.status_code == 200 and no_d.json()['total'] == 0 and no_d.json()['items'] == []
    assert (await client.get(f'/api/v1/master-data/entities/{eid}/records/{first}')).status_code == 404
    actor['id'] = 7
    assert (await client.get(f'/api/v1/master-data/entities/{eid}/records/{second}')).status_code == 404


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_record_query_requires_published_acl_and_hides_unreferenced_record(entity_api):
    client, engine, factory, _ = entity_api
    response = await client.post('/api/v1/master-data/entities', json={
        'entity_code': 'unpublished_record_entity', 'name': 'Unpublished records', 'description': 'Synthetic negative case',
    })
    assert response.status_code == 201
    eid = response.json()['id']
    denied = await client.get(f'/api/v1/master-data/entities/{eid}/records')
    assert denied.status_code == 403
    async with factory() as db:
        db.add(EntityRecordAcl(entity_id=eid, user_id=7))
        source = EntitySource(entity_id=eid, source_system='unpublished-service', adapter_code='internal', field_ids=[], is_active=True)
        db.add(source)
        await db.commit()
        context = await records.bind_internal_source(db, source.id)
        with pytest.raises(HTTPException) as exc:
            await records.receive_record(db, context, 'unpublished-001', {})
        assert_error(exc, 409, 'entity_not_published')
    denied = await client.get(f'/api/v1/master-data/entities/{eid}/records')
    assert denied.status_code == 409



def test_warehouse_table_guard_blocks_master_records_without_db_access():
    from app.data.ddl import DDLValidationError, require_warehouse_table
    for table in ('master_records_3', 'master_records_person', 'master_records_'):
        with pytest.raises(DDLValidationError, match='受控主数据服务'):
            require_warehouse_table(table)


@pytest.mark.asyncio
async def test_dynamic_loader_refuses_master_records_before_reflection(monkeypatch):
    from app.data import dynamic_loader
    from app.data.models import DATA_TABLES
    db = Mock(spec=AsyncSession)
    monkeypatch.setitem(DATA_TABLES, 'master_records_3', object())
    with pytest.raises(ValueError, match='受控主数据服务'):
        await dynamic_loader.register_source_table_model(db, 'master_records_3', force=True)
    db.run_sync.assert_not_called()
    DATA_TABLES.pop('master_records_3', None)


@pytest.mark.asyncio
async def test_dynamic_view_loader_refuses_master_records_before_reflection(monkeypatch):
    from app.data import dynamic_loader
    db = Mock(spec=AsyncSession)
    with pytest.raises(ValueError, match='受控主数据服务'):
        await dynamic_loader._register_view_model(db, 'master_records_3', force=True)
    db.run_sync.assert_not_called()


@pytest.mark.asyncio
async def test_ucp_upsert_refuses_master_records_before_any_db_call():
    from app.ucp.upsert_service import upsert_to_target_table
    db = Mock(spec=AsyncSession)
    db.scalar = AsyncMock()
    with pytest.raises(ValueError, match='受控主数据服务'):
        await upsert_to_target_table(db, 'master_records_3', [{'person': 'p1'}], 'person')
    db.scalar.assert_not_awaited()
    db.execute.assert_not_called()
    db.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_ucp_raw_upsert_refuses_master_records_before_any_db_call():
    from app.ucp.upsert_service import _raw_sql_upsert
    db = Mock(spec=AsyncSession)
    with pytest.raises(ValueError, match='受控主数据服务'):
        await _raw_sql_upsert(db, 'master_records_3', [{'person': 'p1'}], 'person')
    db.execute.assert_not_called()
    db.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_asset_sink_refuses_master_records_before_any_db_call():
    from app.warehouse.asset_sink import WarehouseAssetSink
    db = Mock(spec=AsyncSession)
    sink = WarehouseAssetSink(db)
    with pytest.raises(ValueError, match='受控主数据服务'):
        await sink.write(target_asset='master_records_3', rows=[{'person': 'p1'}],
            write_mode='upsert', primary_key='person', field_whitelist=['person'])
    db.scalar.assert_not_awaited()
    db.execute.assert_not_called()
    db.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_asset_sink_period_snapshot_refuses_master_records_before_any_db_call():
    from app.warehouse.asset_sink import WarehouseAssetSink
    db = Mock(spec=AsyncSession)
    sink = WarehouseAssetSink(db)
    with pytest.raises(ValueError, match='受控主数据服务'):
        await sink._write_period_full_snapshot(target_asset='master_records_3', rows=[{'person': 'p1'}],
            field_whitelist=['person'], batch_id='b1', period_field='period')
    db.scalar.assert_not_awaited()
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_scope_filter_old_person_clause_fails_closed_on_empty_filters():
    from app.permissions.scope_filter import _build_person_clause
    from sqlalchemy.sql.elements import False_
    clause = await _build_person_clause(SimpleNamespace(person_scope_enabled=True), [], None, {'person': 'employee_no'})
    assert isinstance(clause, False_)


def test_scope_payload_rejects_stable_reference_mixed_with_legacy_filters_and_org():
    from app.scopes.router import ScopeIn, PersonReferenceIn, FilterIn, _validate_payload
    ref = PersonReferenceIn(entity_id=1, record_id=2)
    with pytest.raises(HTTPException, match='稳定Person引用'):
        _validate_payload(ScopeIn(name='mixed-filter', dimension='org', org_scope_enabled=False,
            person_scope_enabled=True, person_references=[ref], filters=[FilterIn(
                field_code='person', operator='eq', values=['Alice'])]))
    with pytest.raises(HTTPException, match='稳定Person引用'):
        _validate_payload(ScopeIn(name='mixed-org', dimension='org', org_scope_enabled=True,
            org_scope_unlimited=True, person_scope_enabled=True, person_references=[ref]))


def test_record_user_access_schema_is_narrow_and_forbids_identity_fields():
    with pytest.raises(ValidationError):
        EntityRecordUserAccessIn(allowed=True, user_id=8)
    with pytest.raises(ValidationError):
        EntityRecordUserAccessIn(allowed=1)
    assert EntityRecordUserAccessIn(allowed=False).allowed is False


@pytest.mark.asyncio
async def test_scope_to_out_receives_user_for_stable_reference_visibility(monkeypatch):
    from datetime import datetime
    from app.scopes import router as scopes_router
    tag = SimpleNamespace(id=9, name='stable', description=None, dimension='org',
        org_scope_enabled=False, org_scope_unlimited=False, person_scope_enabled=True,
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
    class Result:
        def __init__(self, rows=()): self.rows = list(rows)
        def scalars(self): return self
        def all(self): return list(self.rows)
    db = Mock(spec=AsyncSession)
    db.execute = AsyncMock(side_effect=[Result(), Result(), Result()])
    db.scalars = AsyncMock(return_value=Result([SimpleNamespace(entity_id=1, record_id=2)]))
    monkeypatch.setattr(scopes_router, 'user_has_op', AsyncMock(return_value=True))
    monkeypatch.setattr(records, 'list_records', AsyncMock(return_value={'total': 1}))
    result = await scopes_router._to_out(tag, db, SimpleNamespace(id=7))
    assert [(ref.entity_id, ref.record_id) for ref in result.person_references] == [(1, 2)]
    scopes_router.user_has_op.assert_awaited_once()
    records.list_records.assert_awaited_once()



@pytest.mark.asyncio
@pytest.mark.parametrize('allowed', [False, True])
async def test_set_user_record_access_deletes_only_target_user_and_entity(monkeypatch, allowed):
    from app.master_data import router
    db = Mock(spec=AsyncSession)
    db.get.return_value = SimpleNamespace(id=8, is_active=True)
    target = entity()
    monkeypatch.setattr(router, 'require_entity', AsyncMock(return_value=target))
    monkeypatch.setattr(router.service, 'audit', Mock())
    actor = SimpleNamespace(id=7)
    result = await router.set_user_record_access(EntityRecordUserAccessIn(allowed=allowed),
        entity_id=3, user_id=8, user=actor, db=db)
    sql = str(db.execute.await_args.args[0].compile(compile_kwargs={'literal_binds': True}))
    assert 'master_entity_record_acl.entity_id = 3' in sql
    assert 'master_entity_record_acl.user_id = 8' in sql
    if allowed:
        row = db.add.call_args.args[0]
        assert (row.entity_id, row.user_id, row.role_id) == (3, 8, None)
    else:
        db.add.assert_not_called()
    assert result == {'ok': True}
    db.commit.assert_awaited_once()
    router.require_entity.assert_awaited_once_with(db, 3, actor, lock=True)


@pytest.mark.asyncio
@pytest.mark.parametrize('endpoint', ['list_scopes', 'get_scope', 'list_user_tags'])
async def test_scope_read_endpoints_forward_actor_to_out(monkeypatch, endpoint):
    from app.scopes import router
    db = Mock(spec=AsyncSession)
    tag = SimpleNamespace(id=1)
    result = Mock()
    result.scalars.return_value.all.return_value = [tag]
    db.execute.return_value = result
    db.get.return_value = tag
    monkeypatch.setattr(router, '_to_out', AsyncMock(return_value='out'))
    actor = SimpleNamespace(id=7)
    if endpoint == 'list_scopes':
        await router.list_scopes(dimension=None, user=actor, db=db)
    elif endpoint == 'get_scope':
        await router.get_scope(1, user=actor, db=db)
    else:
        await router.list_user_tags(8, user=actor, db=db)
    router._to_out.assert_awaited_once_with(tag, db, actor)


@pytest.mark.asyncio
async def test_scope_to_out_does_not_load_reference_ids_without_scope_permission(monkeypatch):
    from app.scopes import router
    tag = SimpleNamespace(id=9, name='stable', description=None, dimension='org',
        org_scope_enabled=False, org_scope_unlimited=False, person_scope_enabled=True,
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
    result = Mock()
    result.scalars.return_value.all.return_value = []
    result.all.return_value = []
    db = Mock(spec=AsyncSession)
    db.execute.return_value = result
    monkeypatch.setattr(router, 'user_has_op', AsyncMock(return_value=False))
    out = await router._to_out(tag, db, SimpleNamespace(id=8))
    assert out.person_references == []
    db.scalars.assert_not_awaited()


def test_record_migration_is_forward_only_and_enforces_publication_acl_and_references():
    path = Path(__file__).parents[1] / 'alembic/versions/0282_master_entity_records.py'
    spec = spec_from_file_location('master_record_migration_test', path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == '0281_master_entity_definitions'
    output = StringIO()
    migration.op = Operations(MigrationContext.configure(dialect_name='postgresql', opts={'as_sql': True, 'output_buffer': output}))
    migration.upgrade()
    sql = output.getvalue()
    for name in ('master_entity_sources', 'master_entity_record_acl', 'scope_person_references'):
        assert f'CREATE TABLE {name}' in sql
    assert 'ck_master_entity_publication' in sql and 'ck_master_record_acl_subject' in sql
    assert 'PRIMARY KEY (tag_id, entity_id, record_id)' in sql
    assert 'UPDATE ' not in sql and 'DROP TABLE' not in sql
    with pytest.raises(RuntimeError, match='forward migration'):
        migration.downgrade()
