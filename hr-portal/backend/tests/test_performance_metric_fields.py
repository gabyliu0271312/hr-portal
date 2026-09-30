import asyncio
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context
from app.performance import metric_fields_router
from app.performance.models import PerformanceAuditEvent, PerformanceMetricField, PerformanceMetricType

pytestmark = pytest.mark.postgres_acceptance


def context(permissions=("performance.configuration.manage",)):
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT", subject_id=900017004, display_name="指标字段测试管理员",
        account_type="PERFORMANCE_ADMIN", portal_entry_permissions=(), role_grants=(), permission_codes=permissions,
    )


@pytest.fixture
def environment():
    schema = "test_field_crud_" + uuid4().hex
    admin_engine = create_async_engine(settings.db_url_async, poolclass=NullPool)

    async def bootstrap():
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            def create(sync_connection):
                PerformanceAuditEvent.__table__.create(sync_connection)
                for filename in ["0248_performance_metric_fields.py", "0249_performance_metric_types.py", "0251_performance_metric_field_ids.py", "0252_performance_metric_field_display_ids.py"]:
                    migration = _load_field_migration(filename)
                    migration.op = Operations(MigrationContext.configure(sync_connection))
                    migration.upgrade()
            await connection.run_sync(create)
    asyncio.run(bootstrap())
    engine = create_async_engine(settings.db_url_async, poolclass=NullPool, connect_args={"server_settings": {"search_path": schema}})
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    prefix = f"字段测试-{uuid4().hex}-"
    app = FastAPI()
    app.include_router(metric_fields_router.router, prefix="/api/v1")
    from app.performance.metric_types_router import router as types_router
    app.include_router(types_router, prefix="/api/v1")

    async def session():
        async with sessions() as db:
            yield db

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[get_performance_access_context] = lambda: context()
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, app, sessions, prefix
    finally:
        async def cleanup():
            await engine.dispose()
            async with admin_engine.begin() as connection:
                await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            await admin_engine.dispose()
        asyncio.run(cleanup())


URL = "/api/v1/performance/metric-fields"


@pytest.mark.parametrize("field_type", ["text", "number", "percentage"])
def test_create_persists_and_reopens_with_audit(environment, field_type):
    client, _, sessions, prefix = environment
    name = prefix + field_type
    response = client.post(URL, json={"name": f"  {name}  ", "field_type": field_type})
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["name"] == name
    assert created["field_type"] == field_type
    assert created["id"] >= 9
    assert created["is_system"] is False
    assert created["updated_by"] == "指标字段测试管理员"
    assert created["updated_at"]
    rows = client.get(URL, params={"keyword": name}).json()
    assert rows["total"] == 1
    assert rows["items"] == [created]

    async def verify():
        async with sessions() as db:
            field = await db.get(PerformanceMetricField, created["id"])
            assert field.created_by_ref == "900017004"
            event = (await db.execute(select(PerformanceAuditEvent).where(
                PerformanceAuditEvent.subject_type == "PERFORMANCE_METRIC_FIELD",
                PerformanceAuditEvent.subject_ref == str(created["id"]),
            ))).scalar_one()
            assert event.event_type == "PERFORMANCE_METRIC_FIELD_CREATED"
            assert event.after_state["name"] == name
            assert event.after_state["field_type"] == field_type
            assert event.actor_ref == field.created_by_ref
    asyncio.run(verify())


@pytest.mark.parametrize("payload", [
    {"name": ""}, {"name": " \t\n "}, {"name": "a" * 129},
    {"name": "test", "field_type": "person"}, {"name": "test", "field_type": "unknown"},
    {"name": "test", "is_system": True}, {"name": "test", "updated_by": "伪造人"},
])
def test_rejects_invalid_or_spoofed_fields(environment, payload):
    client, _, _, _ = environment
    assert client.post(URL, json=payload).status_code == 422


@pytest.mark.parametrize("params", [{"offset": -1}, {"limit": 0}, {"limit": 101}, {"keyword": "x" * 129}])
def test_rejects_invalid_pagination(environment, params):
    assert environment[0].get(URL, params=params).status_code == 422


def test_duplicate_and_concurrent_creation(environment):
    client, _, _, prefix = environment
    payload = {"name": prefix + "并发", "field_type": "text"}
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: client.post(URL, json=payload), range(2)))
    assert sorted(response.status_code for response in responses) == [201, 409]
    duplicate = client.post(URL, json={**payload, "name": " " + payload["name"] + " "})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "PERFORMANCE_METRIC_FIELD_NAME_DUPLICATE"
    assert client.get(URL, params={"keyword": payload["name"]}).json()["total"] == 1
    assert client.post(URL, json={"name": "指标"}).status_code == 409


def test_real_pagination_literal_search_and_empty(environment):
    client, _, _, prefix = environment
    ids = []
    for name in ["A%_", "AB", "AC"]:
        result = client.post(URL, json={"name": prefix + name, "field_type": "number"})
        assert result.status_code == 201
        ids.append(result.json()["id"])
    first = client.get(URL, params={"keyword": prefix, "limit": 2}).json()
    second = client.get(URL, params={"keyword": prefix, "limit": 2, "offset": 2}).json()
    assert first["total"] == second["total"] == 3
    assert [row["id"] for row in first["items"] + second["items"]] == ids
    literal = client.get(URL, params={"keyword": prefix + "A%_"}).json()
    assert literal["total"] == 1
    assert client.get(URL, params={"keyword": prefix + "missing"}).json()["items"] == []


def test_builtin_field_ids_and_global_ascending_order(environment):
    result = environment[0].get(URL, params={"limit": 100})
    assert result.status_code == 200
    rows = result.json()["items"]
    assert [row["id"] for row in rows] == sorted(row["id"] for row in rows)
    builtins = [row for row in rows if row["is_system"]]
    assert [row["id"] for row in builtins] == list(range(1, 8))
    assert builtins[5]["name"] == "完成说明"
    assert builtins[6]["name"] == "指标评价人"


def test_permission_denied_and_unauthenticated(environment):
    client, app, _, prefix = environment
    app.dependency_overrides[get_performance_access_context] = lambda: context(())
    assert client.get(URL).status_code == 403
    assert client.post(URL, json={"name": prefix + "拒绝"}).status_code == 403
    del app.dependency_overrides[get_performance_access_context]
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={"name": prefix + "未登录"}).status_code == 401


def test_failed_audit_rolls_back_field(environment, monkeypatch):
    client, _, _, prefix = environment
    def fail_audit(**kwargs):
        raise RuntimeError("injected audit failure")
    monkeypatch.setattr(metric_fields_router, "PerformanceAuditEvent", fail_audit)
    assert client.post(URL, json={"name": prefix + "回滚"}).status_code == 500
    assert client.get(URL, params={"keyword": prefix}).json()["total"] == 0


def test_business_numbers_crud_and_no_reuse(environment):
    client, _, sessions, prefix = environment
    first = client.post(URL, json={"name": prefix + "一", "field_type": "text"}).json()
    assert first["display_id"] == 8 and first["in_use"] is False
    assert client.post(URL, json={"name": prefix + "一"}).status_code == 409
    second = client.post(URL, json={"name": prefix + "二", "field_type": "number"}).json()
    assert second["display_id"] == 9
    changed = client.patch(f"{URL}/{first['id']}", json={"name": prefix + "已编辑", "field_type": "percentage"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["display_id"] == 8
    assert changed.json()["field_type"] == "percentage"
    assert changed.json()["updated_at"]
    assert client.get(f"{URL}/{first['id']}").json() == changed.json()
    assert client.patch(f"{URL}/{first['id']}", json={"name": second['name']}).status_code == 409
    assert client.get(f"{URL}/{first['id']}").json()["name"] == prefix + "已编辑"
    assert client.delete(f"{URL}/{first['id']}").status_code == 204
    assert client.get(f"{URL}/{first['id']}").status_code == 404
    assert client.delete(f"{URL}/{first['id']}").status_code == 404
    third = client.post(URL, json={"name": prefix + "三"}).json()
    assert third["display_id"] == 10
    listed = client.get(URL, params={"keyword": prefix}).json()["items"]
    assert [row["display_id"] for row in listed] == [9, 10]

    async def check_audit():
        async with sessions() as db:
            events = list((await db.execute(select(PerformanceAuditEvent).where(PerformanceAuditEvent.subject_type == "PERFORMANCE_METRIC_FIELD", PerformanceAuditEvent.subject_ref == str(first["id"])).order_by(PerformanceAuditEvent.id))).scalars())
            assert [event.event_type for event in events] == ["PERFORMANCE_METRIC_FIELD_CREATED", "PERFORMANCE_METRIC_FIELD_UPDATED", "PERFORMANCE_METRIC_FIELD_DELETED"]
            assert events[1].before_state["name"] == first["name"]
            assert events[1].after_state["display_id"] == 8
            assert events[2].after_state == {"deleted": True, "display_id": 8}
    asyncio.run(check_audit())


def test_crud_system_reference_and_permission_guards(environment):
    client, app, _, prefix = environment
    for field_id in range(1, 8):
        assert client.patch(f"{URL}/{field_id}", json={"name": "禁止"}).status_code == 403
        assert client.delete(f"{URL}/{field_id}").status_code == 403
    field = client.post(URL, json={"name": prefix + "引用"}).json()
    linked = client.post("/api/v1/performance/metric-types", json={"name": prefix + "类型", "field_ids": [field["id"]]})
    assert linked.status_code == 201, linked.text
    assert client.get(f"{URL}/{field['id']}").json()["in_use"] is True
    assert client.get(URL, params={"keyword": prefix}).json()["items"][0]["in_use"] is True
    rejected = client.delete(f"{URL}/{field['id']}")
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "PERFORMANCE_METRIC_FIELD_IN_USE"
    assert client.patch(f"{URL}/{field['id']}", json={"name": field["name"], "field_type": "number"}).status_code == 409
    renamed = client.patch(f"{URL}/{field['id']}", json={"name": prefix + "引用后改名", "field_type": "text"})
    assert renamed.status_code == 200 and renamed.json()["display_id"] == field["display_id"]
    assert client.get("/api/v1/performance/metric-types").json()["items"][0]["fields"] == prefix + "引用后改名"
    for extra in [{"id": 3}, {"display_id": 1}, {"is_system": True}, {"updated_by": "伪造"}]:
        assert client.patch(f"{URL}/{field['id']}", json={"name": "非法", **extra}).status_code == 422
    assert client.patch(f"{URL}/99999", json={"name": "缺失"}).status_code == 404
    app.dependency_overrides[get_performance_access_context] = lambda: context(())
    assert client.get(f"{URL}/{field['id']}").status_code == 403
    assert client.patch(f"{URL}/{field['id']}", json={"name": "越权"}).status_code == 403
    assert client.delete(f"{URL}/{field['id']}").status_code == 403


def test_business_numbers_are_transactional_and_concurrent(environment, monkeypatch):
    client, _, _, prefix = environment
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda index: client.post(URL, json={"name": prefix + str(index)}), range(4)))
    assert all(result.status_code == 201 for result in results)
    assert sorted(result.json()["display_id"] for result in results) == [8, 9, 10, 11]
    def fail_audit(*args, **kwargs):
        raise RuntimeError("injected audit failure")
    with monkeypatch.context() as patch:
        patch.setattr(metric_fields_router, "_audit", fail_audit)
        assert client.post(URL, json={"name": prefix + "失败"}).status_code == 500
    created = client.post(URL, json={"name": prefix + "成功"})
    assert created.status_code == 201 and created.json()["display_id"] == 12
    original = results[0].json()
    with monkeypatch.context() as patch:
        patch.setattr(metric_fields_router, "_audit", fail_audit)
        assert client.patch(f"{URL}/{original['id']}", json={"name": prefix + "应回滚"}).status_code == 500
        assert client.delete(f"{URL}/{original['id']}").status_code == 500
    assert client.get(f"{URL}/{original['id']}").json()["name"] == original["name"]


def test_reference_creation_serializes_with_delete_and_type_change(environment):
    from app.performance.metric_types_router import _validate_fields
    client, _, sessions, prefix = environment
    field = client.post(URL, json={"name": prefix + "竞争"}).json()
    async def race():
        async with sessions() as db:
            await _validate_fields(db, [field["id"]])
            with ThreadPoolExecutor(max_workers=2) as executor:
                deletion = executor.submit(client.delete, f"{URL}/{field['id']}")
                change = executor.submit(client.patch, f"{URL}/{field['id']}", json={"name": field["name"], "field_type": "number"})
                db.add(PerformanceMetricType(name=prefix + "引用", field_ids=[field["id"]], created_by_type="SYSTEM_ACCOUNT", created_by_ref="1", updated_by="test"))
                await db.commit()
                assert deletion.result(timeout=15).status_code == 409
                assert change.result(timeout=15).status_code == 409
        async with sessions() as db:
            second = client.post(URL, json={"name": prefix + "先删除"}).json()
            row = (await db.execute(select(PerformanceMetricField).where(PerformanceMetricField.id == second["id"]).with_for_update())).scalar_one()
            await db.delete(row)
            await db.flush()
            with ThreadPoolExecutor(max_workers=1) as executor:
                reference = executor.submit(client.post, "/api/v1/performance/metric-types", json={"name": prefix + "迟到引用", "field_ids": [second["id"]]})
                await db.commit()
                assert reference.result(timeout=15).status_code == 422
    asyncio.run(race())


def test_display_id_migration_preserves_internal_ids_and_history():
    async def run():
        engine = create_async_engine(settings.db_url_async, poolclass=NullPool)
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                schema = "test_display_ids_" + uuid4().hex
                await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                def apply(sync_connection, filename, action="upgrade"):
                    migration = _load_field_migration(filename)
                    migration.op = Operations(MigrationContext.configure(sync_connection))
                    getattr(migration, action)()
                await connection.run_sync(lambda sync: PerformanceAuditEvent.__table__.create(sync))
                for filename in ["0248_performance_metric_fields.py", "0249_performance_metric_types.py", "0251_performance_metric_field_ids.py"]:
                    await connection.run_sync(apply, filename)
                await connection.execute(text("INSERT INTO performance_metric_fields (id,name,field_type,is_system,created_by_type,created_by_ref,updated_by) VALUES (61,'用户字段','text',false,'SYSTEM_ACCOUNT','1','test')"))
                await connection.execute(text("SELECT setval('performance_metric_fields_id_seq',61,true)"))
                await connection.execute(text("INSERT INTO performance_metric_types (name,field_ids,created_by_type,created_by_ref,updated_by) VALUES ('引用','[1,61]','SYSTEM_ACCOUNT','1','test')"))
                fields = (await connection.execute(text("SELECT id,name,updated_at FROM performance_metric_fields ORDER BY id"))).all()
                history = (await connection.execute(text("SELECT * FROM performance_audit_events ORDER BY id"))).all()
                await connection.run_sync(apply, "0252_performance_metric_field_display_ids.py")
                numbers = (await connection.execute(text("SELECT id,display_id FROM performance_metric_fields ORDER BY display_id"))).all()
                assert numbers == [(1,1),(2,2),(3,3),(4,4),(5,5),(6,6),(7,7),(61,8)]
                assert (await connection.execute(text("SELECT next_value FROM performance_metric_field_counter WHERE id=1"))).scalar_one() == 9
                assert tuple((await connection.execute(text("SELECT last_value,is_called FROM performance_metric_fields_id_seq"))).one()) == (61,True)
                assert (await connection.execute(text("SELECT field_ids FROM performance_metric_types"))).scalar_one() == [1,61]
                assert (await connection.execute(text("SELECT * FROM performance_audit_events ORDER BY id"))).all() == history
                assert (await connection.execute(text("SELECT id,name,updated_at FROM performance_metric_fields ORDER BY id"))).all() == fields
                await connection.run_sync(apply, "0252_performance_metric_field_display_ids.py", "downgrade")
                assert (await connection.execute(text("SELECT id,name,updated_at FROM performance_metric_fields ORDER BY id"))).all() == fields
                assert (await connection.execute(text("SELECT field_ids FROM performance_metric_types"))).scalar_one() == [1,61]
                assert (await connection.execute(text("SELECT * FROM performance_audit_events ORDER BY id"))).all() == history
                await connection.run_sync(apply, "0252_performance_metric_field_display_ids.py")
                assert (await connection.execute(text("SELECT display_id FROM performance_metric_fields WHERE id=61"))).scalar_one() == 8
            finally:
                await transaction.rollback()
        await engine.dispose()
    asyncio.run(run())


def _load_field_migration(filename):
    path = Path(__file__).parents[1] / "alembic/versions" / filename
    spec = importlib.util.spec_from_file_location(path.stem, path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


@pytest.mark.parametrize("scenario", ["roundtrip", "occupied_target", "unexpected_builtin", "non_system", "missing_builtin", "occupied_downgrade", "audit_failure"])
def test_field_id_migration(scenario):
    seed = _load_field_migration("0248_performance_metric_fields.py")
    migration = _load_field_migration("0251_performance_metric_field_ids.py")

    async def run():
        engine = create_async_engine(settings.db_url_async, poolclass=NullPool)
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                schema = "test_metric_ids_" + uuid4().hex
                await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))

                def bootstrap(sync_connection):
                    seed.op = Operations(MigrationContext.configure(sync_connection))
                    seed.upgrade()
                    PerformanceMetricType.__table__.create(sync_connection)
                    PerformanceAuditEvent.__table__.create(sync_connection)

                def apply(sync_connection, action):
                    migration.op = Operations(MigrationContext.configure(sync_connection))
                    action()

                await connection.run_sync(bootstrap)
                await connection.execute(text("""
                    INSERT INTO performance_metric_fields (id,name,field_type,is_system,created_by_type,created_by_ref,updated_by)
                    VALUES (50,'既有自定义字段','text',false,'SYSTEM_ACCOUNT','1','原更新人')
                """))
                await connection.execute(text("SELECT setval('performance_metric_fields_id_seq',100,true)"))
                await connection.execute(text("""
                    INSERT INTO performance_metric_types (id,name,field_ids,created_by_type,created_by_ref,updated_by) VALUES
                    (7,'顺序与重复引用','[7,8,7,50]','SYSTEM_ACCOUNT','1','原更新人'),
                    (8,'无关引用','[1,2]','SYSTEM_ACCOUNT','1','原更新人'),
                    (10,'测试','[8,7,5,4,3,2,1]','SYSTEM_ACCOUNT','1','原更新人'),
                    (11,'空配置','[]','SYSTEM_ACCOUNT','1','原更新人')
                """))
                await connection.execute(text("CREATE TABLE performance_templates (id bigint PRIMARY KEY, dimensions jsonb)"))
                await connection.execute(text("INSERT INTO performance_templates VALUES (1,CAST(:dimensions AS jsonb))"), {"dimensions": '[{"metric_type_ids":[7,8],"review_rule_id":7}]'})
                await connection.execute(text("""
                    INSERT INTO performance_audit_events (event_type,actor_type,actor_ref,subject_type,subject_ref,before_state,after_state)
                    VALUES ('PERFORMANCE_METRIC_TYPE_UPDATED','SYSTEM_ACCOUNT','1','PERFORMANCE_METRIC_TYPE','10','{}','{"field_ids":[8,7,50]}')
                """))

                async def catalog():
                    fields = [dict(row) for row in (await connection.execute(text("SELECT * FROM performance_metric_fields ORDER BY id"))).mappings()]
                    types = [dict(row) for row in (await connection.execute(text("SELECT * FROM performance_metric_types ORDER BY id"))).mappings()]
                    return fields, types

                baseline_fields, baseline_types = await catalog()
                baseline_audit = dict((await connection.execute(text("SELECT * FROM performance_audit_events WHERE id=1"))).mappings().one())
                baseline_template = (await connection.execute(text("SELECT dimensions FROM performance_templates WHERE id=1"))).scalar_one()

                if scenario in {"occupied_target", "unexpected_builtin", "non_system", "missing_builtin"}:
                    statements = {
                        "occupied_target": "INSERT INTO performance_metric_fields (id,name,field_type,is_system,created_by_type,created_by_ref,updated_by) VALUES (6,'已有占位','text',false,'SYSTEM_ACCOUNT','1','原更新人')",
                        "unexpected_builtin": "UPDATE performance_metric_fields SET name='身份不符' WHERE id=7",
                        "non_system": "UPDATE performance_metric_fields SET is_system=false WHERE id=7",
                        "missing_builtin": "DELETE FROM performance_metric_fields WHERE id=8",
                    }
                    await connection.execute(text(statements[scenario]))
                    before = await catalog()
                    with pytest.raises(RuntimeError, match="migration stopped"):
                        await connection.run_sync(apply, migration.upgrade)
                    assert await catalog() == before
                    assert (await connection.execute(text("SELECT count(*) FROM performance_audit_events"))).scalar_one() == 1
                elif scenario == "audit_failure":
                    await connection.execute(text("""CREATE FUNCTION reject_migration_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected migration audit failure'; END; $$"""))
                    await connection.execute(text("CREATE TRIGGER reject_migration_audit BEFORE INSERT ON performance_audit_events FOR EACH ROW EXECUTE FUNCTION reject_migration_audit()"))
                    savepoint = await connection.begin_nested()
                    with pytest.raises(Exception, match="injected migration audit failure"):
                        await connection.run_sync(apply, migration.upgrade)
                    await savepoint.rollback()
                    assert await catalog() == (baseline_fields, baseline_types)
                else:
                    await connection.run_sync(apply, migration.upgrade)
                    fields, types = await catalog()
                    assert [row["id"] for row in fields] == [1, 2, 3, 4, 5, 6, 7, 50]
                    assert {row["name"]: {key: value for key, value in row.items() if key != "id"} for row in fields} == {row["name"]: {key: value for key, value in row.items() if key != "id"} for row in baseline_fields}
                    assert fields[5]["name"] == "完成说明"
                    assert fields[6]["name"] == "指标评价人"
                    assert {row["id"]: row["field_ids"] for row in types} == {7: [6,7,6,50], 8: [1,2], 10: [7,6,5,4,3,2,1], 11: []}
                    assert [{key: value for key, value in row.items() if key != "field_ids"} for row in types] == [{key: value for key, value in row.items() if key != "field_ids"} for row in baseline_types]
                    event = (await connection.execute(text("SELECT after_state FROM performance_audit_events WHERE event_type='PERFORMANCE_METRIC_FIELD_IDS_RENUMBERED'"))).scalar_one()
                    assert event["id_mapping"] == {"7": 6, "8": 7}
                    assert event["updated_metric_types"] == 2
                    if scenario == "occupied_downgrade":
                        await connection.execute(text("INSERT INTO performance_metric_fields (id,name,field_type,is_system,created_by_type,created_by_ref,updated_by) VALUES (8,'不得覆盖','text',false,'SYSTEM_ACCOUNT','1','原更新人')"))
                        before = await catalog()
                        with pytest.raises(RuntimeError, match="target ID 8 is occupied"):
                            await connection.run_sync(apply, migration.downgrade)
                        assert await catalog() == before
                    else:
                        await connection.run_sync(apply, migration.downgrade)
                        assert await catalog() == (baseline_fields, baseline_types)
                        assert (await connection.execute(text("SELECT count(*) FROM performance_audit_events"))).scalar_one() == 3

                assert dict((await connection.execute(text("SELECT * FROM performance_audit_events WHERE id=1"))).mappings().one()) == baseline_audit
                assert (await connection.execute(text("SELECT dimensions FROM performance_templates WHERE id=1"))).scalar_one() == baseline_template
                assert tuple((await connection.execute(text("SELECT last_value,is_called FROM performance_metric_fields_id_seq"))).one()) == (100, True)
            finally:
                await transaction.rollback()
        await engine.dispose()
    asyncio.run(run())


def test_migration_upgrade_downgrade_in_isolated_schema():
    path = Path(__file__).parents[1] / "alembic/versions/0248_performance_metric_fields.py"
    spec = importlib.util.spec_from_file_location("metric_fields_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    async def run():
        engine = create_async_engine(settings.db_url_async, poolclass=NullPool)
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                schema = "test_metric_fields_" + uuid4().hex
                await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                await connection.execute(text("CREATE TABLE existing_data (value text)"))
                await connection.execute(text("INSERT INTO existing_data VALUES ('preserved')"))
                def apply(sync_connection, action):
                    migration.op = Operations(MigrationContext.configure(sync_connection))
                    action()
                await connection.run_sync(apply, migration.upgrade)
                rows = (await connection.execute(text("SELECT id, name, field_type FROM performance_metric_fields ORDER BY id"))).all()
                assert [row.id for row in rows] == [1, 2, 3, 4, 5, 7, 8]
                assert rows[-1].field_type == "person"
                inserted = await connection.execute(text("INSERT INTO performance_metric_fields (name, field_type, created_by_type, created_by_ref, updated_by) VALUES ('新字段','text','SYSTEM_ACCOUNT','1','测试') RETURNING id"))
                assert inserted.scalar_one() == 9
                await connection.run_sync(apply, migration.downgrade)
                assert (await connection.execute(text("SELECT to_regclass('performance_metric_fields')"))).scalar_one() is None
                assert (await connection.execute(text("SELECT value FROM existing_data"))).scalar_one() == "preserved"
                await connection.run_sync(apply, migration.upgrade)
                assert (await connection.execute(text("SELECT count(*) FROM performance_metric_fields"))).scalar_one() == 7
            finally:
                await transaction.rollback()
        await engine.dispose()
    asyncio.run(run())
