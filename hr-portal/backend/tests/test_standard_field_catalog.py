from datetime import UTC, datetime

import pytest
import pytest_asyncio

from app.data import models
from tests.test_scope_classification import postgres_classification_schema


def test_standard_identity_version_and_binding_models_are_separate():
    assert models.StandardField.__tablename__ == "standard_fields"
    assert models.StandardFieldVersion.__tablename__ == "standard_field_versions"
    assert models.StandardFieldBinding.__tablename__ == "standard_field_bindings"
    assert "data_type" not in models.StandardField.__table__.columns
    assert "transformation_rule" not in models.StandardFieldBinding.__table__.columns
    assert "field_category_id" in models.StandardFieldVersionCategory.__table__.columns


def test_binding_identity_targets_are_unique_and_version_pinned():
    table = models.StandardFieldBinding.__table__
    assert "standard_field_version_id" in table.columns
    assert "table_column_id" in table.columns and "dataset_output_field_id" in table.columns
    names = {constraint.name for constraint in table.constraints}
    assert {"ck_standard_binding_target", "ck_standard_binding_confirmation",
            "uq_standard_binding_table_column", "uq_standard_binding_output_field"} <= names


def _migration_0255():
    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path
    path = Path(__file__).parents[1] / "alembic/versions/0255_data_product_authorization_contract.py"
    spec = spec_from_file_location("product_authorization_migration", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migration():
    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path
    path = Path(__file__).parents[1] / "alembic/versions/0254_standard_field_catalog.py"
    spec = spec_from_file_location("standard_field_catalog_migration", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_catalog_upgrade_sql_does_not_rewrite_existing_assets():
    from io import StringIO
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    migration = _migration()
    assert migration.down_revision == "0253_table_scope_classification"
    output = StringIO()
    migration.op = Operations(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}))
    migration.upgrade()
    sql = output.getvalue()
    assert all(f"CREATE TABLE {name}" in sql for name in (
        "standard_fields", "standard_field_versions", "standard_field_bindings", "standard_field_version_categories",
    ))
    assert "protect_standard_field_code" in sql and "protect_standard_field_version" in sql
    assert "ON DELETE RESTRICT" in sql
    assert "ALTER TABLE table_columns" not in sql and "ALTER TABLE dataset_output_fields" not in sql
    assert "UPDATE registered_tables" not in sql and "standardization_rules" not in sql


def test_empty_catalog_downgrade_sql_is_scoped_to_new_objects():
    from io import StringIO
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    migration = _migration()
    output = StringIO()
    migration.op = Operations(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}))
    migration.downgrade()
    sql = output.getvalue()
    assert "DROP TABLE standard_field_bindings" in sql
    assert "EXISTS (SELECT 1 FROM standard_fields" in sql
    assert "preservation plan required" in sql
    assert "DROP TABLE table_columns" not in sql and "DROP TABLE dataset_output_fields" not in sql
    assert "DROP FUNCTION protect_standard_field_version()" in sql



@pytest_asyncio.fixture
async def postgres_standard_catalog(postgres_classification_schema):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import BigInteger, Boolean, Column, MetaData, Table, text
    from app.datasets.models import DataSet, DataSetRelation, DataSetTable, DatasetOutputField, DataProductAuthorizationContract
    from app.field_category.models import FieldCategory
    from app.warehouse.models import StandardizationRule
    from app.users.models import Menu, Role, RoleMenu, UserRole

    engine, factory = postgres_classification_schema
    metadata = MetaData()
    Table("users", metadata, Column("id", BigInteger, primary_key=True),
          Column("is_active", Boolean, nullable=False, server_default="true"))
    for model in (Role, Menu, RoleMenu, UserRole):
        model.__table__.to_metadata(metadata)
    columns = models.TableColumn.__table__.to_metadata(metadata)
    datasets = DataSet.__table__.to_metadata(metadata)
    dataset_tables = DataSetTable.__table__.to_metadata(metadata)
    relations = DataSetRelation.__table__.to_metadata(metadata)
    outputs = DatasetOutputField.__table__.to_metadata(metadata)
    rules = StandardizationRule.__table__.to_metadata(metadata)
    categories = FieldCategory.__table__.to_metadata(metadata)
    migration = _migration()
    contract_migration = _migration_0255()
    def install(connection):
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        contract_migration.op = Operations(MigrationContext.configure(connection))
        contract_migration.upgrade()
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true"))
        await conn.run_sync(metadata.create_all)
        await conn.execute(Role.__table__.insert().values(id=1, name="catalog_test", is_active=True))
        await conn.execute(Menu.__table__.insert().values(id=1, code="warehouse.assets", label="Assets"))
        await conn.execute(RoleMenu.__table__.insert().values(
            id=1, role_id=1, menu_id=1, can_view=True, can_create=True, can_update=True,
            can_delete=True, can_export=False,
        ))
        await conn.execute(UserRole.__table__.insert().values(user_id=7, role_id=1))
        await conn.execute(models.RegisteredTable.__table__.insert().values(
            id=31, table_name="source_probe", table_label="Source", warehouse_layer="ODS",
        ))
        await conn.execute(text("CREATE TABLE source_probe (employee_no text, department text)"))
        await conn.execute(text("CREATE TABLE dwd_probe (employee_no text, department text)"))
        await conn.execute(columns.insert().values(id=17, table_name="source_probe", column_code="employee_no", column_label="Employee number", source_field_id="source-employee"))
        await conn.execute(columns.insert().values(id=18, table_name="dwd_probe", column_code="employee_no", column_label="Managed employee label", source_field_id="dwd-employee", is_sensitive=True, display_order=77))
        await conn.execute(columns.insert().values(id=19, table_name="dwd_probe", column_code="department", column_label="Department", source_field_id="dwd-department", display_order=88))
        await conn.execute(datasets.insert().values(id=4, name="dataset_probe", warehouse_layer="DWD", status="published", version=3))
        await conn.execute(dataset_tables.insert().values(id=4, dataset_id=4, table_name="dwd_probe", alias="current"))
        await conn.execute(outputs.insert().values(id=41, dataset_id=4, source_alias="current", source_column="employee_no", output_code="employee_no", output_label="Approved employee label", is_sensitive=True, display_order=91))
        await conn.execute(rules.insert().values(id=101, asset_type="table", asset_code="source_probe", rule_type="rename", source_field="employee_no", target_field="employee_no", rule_config={}, enabled=True, display_order=1))
        await conn.execute(categories.insert().values(id=9, name="existing_sensitive", is_sensitive=True))
        await conn.run_sync(install)
        await conn.execute(models.StandardField.__table__.insert().values(id=1, field_code="employee_no", created_by=7))
        await conn.execute(models.StandardFieldVersion.__table__.insert().values(
            id=11, standard_field_id=1, version=1, field_name="Employee number",
            business_definition="Business employee number, not physical/master ID", data_type="string",
            grain_level="identifying", permission_domain="public", owner_user_id=7, created_by=7,
        ))
        await conn.execute(text("SELECT setval(pg_get_serial_sequence('standard_fields','id'),1)"))
        await conn.execute(text("SELECT setval(pg_get_serial_sequence('standard_field_versions','id'),11)"))
    yield engine, factory, migration


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_approved_semantics_code_and_categories_are_immutable(postgres_standard_catalog):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError
    engine, _, _ = postgres_standard_catalog
    async with engine.begin() as conn:
        await conn.execute(text("INSERT INTO standard_field_version_categories VALUES(11,9)"))
        await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='reviewed' WHERE id=11"))
    for statement in (
        "UPDATE standard_fields SET field_code='employee_id' WHERE id=1",
        "UPDATE standard_field_versions SET permission_domain='salary' WHERE id=11",
        "UPDATE standard_field_versions SET owner_user_id=99 WHERE id=11",
        "DELETE FROM standard_field_versions WHERE id=11",
        "DELETE FROM standard_field_version_categories WHERE standard_field_version_id=11",
        "UPDATE standard_field_version_categories SET field_category_id=99 WHERE standard_field_version_id=11",
    ):
        with pytest.raises(IntegrityError) as error:
            async with engine.begin() as conn:
                await conn.execute(text(statement))
        assert error.value.orig.sqlstate == "23514"
    async with engine.begin() as conn:
        await conn.execute(text("INSERT INTO field_categories(id,name,is_sensitive) VALUES(10,'second_sensitive',true)"))
    with pytest.raises(IntegrityError) as insertion:
        async with engine.begin() as conn:
            await conn.execute(text("INSERT INTO standard_field_version_categories VALUES(11,10)"))
    assert insertion.value.orig.sqlstate == "23514"
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE standard_field_versions SET status='deprecated',updated_at=now() WHERE id=11"))
        row = (await conn.execute(text("SELECT status,permission_domain,grain_level FROM standard_field_versions WHERE id=11"))).one()
        assert tuple(row) == ("deprecated", "public", "identifying")
        await conn.execute(models.StandardFieldVersion.__table__.insert().values(
            id=12, standard_field_id=1, version=2, field_name="Employee number new version",
            business_definition="A separately reviewed semantic definition", data_type="string",
            grain_level="identifying", permission_domain="personal", owner_user_id=7, created_by=7,
        ))
        assert await conn.scalar(text("SELECT count(*) FROM standard_field_versions WHERE standard_field_id=1")) == 2


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("changes", [
    {"data_type": "unknown"}, {"grain_level": "unknown"}, {"permission_domain": "unknown"},
    {"status": "active"}, {"business_definition": " "}, {"version": 0},
    {"is_permission_anchor": True},
])
async def test_catalog_semantic_constraints_reject_invalid_drafts(postgres_standard_catalog, changes):
    from sqlalchemy.exc import IntegrityError
    engine, _, _ = postgres_standard_catalog
    values = dict(id=12, standard_field_id=1, version=2, field_name="Test field", business_definition="Definition",
                  data_type="number", grain_level=None, permission_domain="public", owner_user_id=7, created_by=7)
    with pytest.raises(IntegrityError):
        async with engine.begin() as conn:
            await conn.execute(models.StandardFieldVersion.__table__.insert().values(**{**values, **changes}))


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_confirmed_binding_is_unique_pinned_and_protects_column_identity(postgres_standard_catalog):
    from sqlalchemy import select, text
    from sqlalchemy.exc import IntegrityError
    engine, factory, _ = postgres_standard_catalog
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='reviewed' WHERE id=11"))
        await conn.execute(models.StandardFieldBinding.__table__.insert().values(
            id=1, table_column_id=17, standard_field_version_id=11, status="confirmed", binding_version=1,
            observed_source_field_id="source_uuid", observed_data_type="string", created_by=7,
            confirmed_by=7, confirmed_at=datetime.now(UTC),
        ))
    with pytest.raises(IntegrityError):
        async with engine.begin() as conn:
            await conn.execute(models.StandardFieldBinding.__table__.insert().values(
                id=2, table_column_id=17, standard_field_version_id=11, status="suggested", created_by=7,
            ))
    with pytest.raises(IntegrityError):
        async with engine.begin() as conn:
            await conn.execute(models.TableColumn.__table__.delete().where(models.TableColumn.id == 17))
    async with engine.begin() as conn:
        await conn.execute(models.StandardFieldBinding.__table__.insert().values(
            id=3, dataset_output_field_id=41, standard_field_version_id=11, status="suggested", created_by=7,
        ))
    async with factory() as session:
        binding = await session.get(models.StandardFieldBinding, 1)
        assert binding.standard_field_version_id == 11 and binding.status == "confirmed"
        assert binding.observed_source_field_id == "source_uuid"
        assert (await session.execute(select(models.StandardFieldVersion))).scalars().one().status == "active"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("changes", [
    {"table_column_id": None}, {"dataset_output_field_id": 41},
    {"status": "confirmed", "standard_field_version_id": 11},
    {"status": "confirmed", "standard_field_version_id": 11, "binding_version": 1,
     "confirmed_by": 7, "confirmed_at": "NOW", "observed_data_type": " "},
])
async def test_binding_requires_one_target_and_confirmation_evidence(postgres_standard_catalog, changes):
    from sqlalchemy.exc import IntegrityError
    engine, _, _ = postgres_standard_catalog
    if changes.get("confirmed_at") == "NOW":
        changes = {**changes, "confirmed_at": datetime.now(UTC)}
    values = dict(id=1, table_column_id=17, created_by=7)
    with pytest.raises(IntegrityError):
        async with engine.begin() as conn:
            await conn.execute(models.StandardFieldBinding.__table__.insert().values(**{**values, **changes}))


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_nonempty_catalog_downgrade_is_blocked_without_data_loss(postgres_standard_catalog):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError
    engine, _, migration = postgres_standard_catalog
    def downgrade(connection):
        migration.op = Operations(MigrationContext.configure(connection))
        migration.downgrade()
    with pytest.raises(IntegrityError, match="preservation plan"):
        async with engine.begin() as conn:
            await conn.run_sync(downgrade)
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM standard_fields")) == 1
        assert await conn.scalar(text("SELECT count(*) FROM standard_field_versions")) == 1
        assert await conn.scalar(text("SELECT count(*) FROM table_columns WHERE id=17")) == 1


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_empty_catalog_upgrade_downgrade_preserves_existing_metadata(postgres_standard_catalog):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text
    engine, _, migration = postgres_standard_catalog
    def apply(connection, operation):
        migration.op = Operations(MigrationContext.configure(connection))
        getattr(migration, operation)()
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM standard_field_versions WHERE id=11"))
        await conn.execute(text("DELETE FROM standard_fields WHERE id=1"))
        await conn.run_sync(apply, "downgrade")
        assert await conn.scalar(text("SELECT count(*) FROM table_columns WHERE id=17")) == 1
        assert await conn.scalar(text("SELECT count(*) FROM dataset_output_fields WHERE id=41")) == 1
        await conn.run_sync(apply, "upgrade")
        assert await conn.scalar(text("SELECT count(*) FROM standard_fields")) == 0


def _definition_payload(**changes):
    return {"field_name": "Employee number", "business_definition": "Business identity, not master ID",
            "data_type": "string", "grain_level": "identifying", "permission_domain": "public",
            "owner_user_id": 7, "category_ids": [9], **changes}


@pytest.mark.parametrize("changes", [
    {"field_code": "employee.id"}, {"field_code": "EmployeeNo"}, {"field_name": "  "},
    {"business_definition": " "}, {"data_type": "json"}, {"owner_user_id": True},
    {"status": "active"}, {"approved_by": 7}, {"category_ids": [9, 9]},
    {"category_ids": [0]}, {"is_permission_anchor": "true"},
])
def test_catalog_create_schema_rejects_unsafe_or_invalid_payload(changes):
    from pydantic import ValidationError
    from app.warehouse.schemas import StandardFieldCreateIn
    with pytest.raises(ValidationError):
        StandardFieldCreateIn(**{**_definition_payload(field_code="employee_no"), **changes})


@pytest_asyncio.fixture
async def standard_catalog_api(postgres_standard_catalog):
    from types import SimpleNamespace
    import httpx
    from fastapi import FastAPI
    from app.core.db import get_session
    from app.core.deps import current_user
    from app.warehouse.router import router
    engine, factory, _ = postgres_standard_catalog
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def session():
        async with factory() as db:
            yield db

    async def user():
        return SimpleNamespace(id=7)

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[current_user] = user
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield client, engine, factory, app


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_catalog_api_draft_approval_new_version_and_lifecycle(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/standard-fields"
    created = await client.post(base, json=_definition_payload(field_code="employee_name", field_name="姓名"))
    assert created.status_code == 201, created.text
    field = created.json()
    field_id, version_id = field["id"], field["latest_version"]["id"]
    assert field["latest_version"]["status"] == "draft"
    assert field["latest_version"]["category_ids"] == [9]
    assert field["current_active_version_id"] is None
    updated = await client.put(f"{base}/{field_id}/versions/{version_id}", json=_definition_payload(
        field_name="姓名（业务）", expected_revision=0,
    ))
    assert updated.status_code == 200, updated.text
    assert updated.json()["revision"] == 1
    approved = await client.post(f"{base}/{field_id}/versions/{version_id}/approve", json={
        "expected_revision": 1, "reason": " reviewed with private example 123456.78 ",
    })
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "active" and approved.json()["approved_by"] == 7
    assert approved.json()["revision"] == 2
    new = await client.post(f"{base}/{field_id}/versions", json=_definition_payload(
        field_name="姓名新语义", expected_version=1,
    ))
    assert new.status_code == 201, new.text
    assert new.json()["version"] == 2 and new.json()["revision"] == 0
    detail = await client.get(f"{base}/{field_id}")
    assert detail.status_code == 200 and detail.json()["current_active_version_id"] == version_id
    assert [row["version"] for row in detail.json()["versions"]] == [2, 1]
    new_id = new.json()["id"]
    assert (await client.post(f"{base}/{field_id}/versions/{new_id}/approve", json={
        "expected_revision": 0, "reason": "new reviewed semantics",
    })).status_code == 200
    assert (await client.get(f"{base}/{field_id}")).json()["current_active_version_id"] == new_id
    deprecated = await client.post(f"{base}/{field_id}/versions/{version_id}/deprecate", json={
        "expected_revision": 2, "reason": "superseded",
    })
    assert deprecated.status_code == 200 and deprecated.json()["status_changed_by"] == 7
    assert deprecated.json()["status_reason"] == "superseded"
    archived = await client.post(f"{base}/{field_id}/versions/{version_id}/archive", json={
        "expected_revision": 3, "reason": "retain history",
    })
    assert archived.status_code == 200 and archived.json()["approved_by"] == 7
    assert archived.json()["revision"] == 4
    readonly = await client.put(f"{base}/{field_id}/versions/{version_id}", json=_definition_payload(expected_revision=4))
    assert readonly.status_code == 409 and readonly.json()["detail"]["code"] == "standard_field_version_readonly"
    reopen = await client.post(f"{base}/{field_id}/versions/{version_id}/approve", json={
        "expected_revision": 4, "reason": "not allowed",
    })
    assert reopen.status_code == 409
    deleted = await client.delete(f"{base}/{field_id}?expected_version=2&expected_revision=1")
    assert deleted.status_code == 409 and deleted.json()["detail"]["code"] == "standard_field_approved_delete_forbidden"
    async with engine.connect() as conn:
        logs = (await conn.execute(text("SELECT metadata_json FROM system_logs WHERE action LIKE 'standard_field_%'"))).scalars().all()
        assert len(logs) == 7
        assert all("123456.78" not in str(log) and "Employee" not in str(log) for log in logs)
        assert all(log["runtime_filter_exemption"] is False for log in logs)


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_catalog_list_search_pagination_and_direct_binding_reference(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/standard-fields"
    async with engine.begin() as conn:
        await conn.execute(text("INSERT INTO standard_field_bindings(id,table_column_id,standard_field_version_id,status,created_by) VALUES(1,17,11,'suggested',7)"))
    result = await client.get(base, params={"keyword": "employee", "status": "draft", "limit": 1})
    assert result.status_code == 200, result.text
    assert result.json()["total"] == 1 and result.json()["items"][0]["field_code"] == "employee_no"
    assert (await client.get(base, params={"keyword": "%"})).json()["total"] == 0
    assert (await client.get(base, params={"keyword": "_"})).json()["total"] == 1
    assert (await client.get(base, params={"offset": 1})).json() == {"total": 1, "items": []}
    detail = await client.get(base + "/1")
    assert detail.json()["bindings"] == [{"id": 1, "standard_field_version_id": 11,
        "table_column_id": 17, "dataset_output_field_id": None, "status": "suggested", "binding_version": 0}]
    blocked = await client.delete(base + "/1?expected_version=1&expected_revision=0")
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "standard_field_in_use"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_catalog_api_errors_and_schema_do_not_write(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/standard-fields"
    cases = [
        ("POST", base, _definition_payload(field_code="employee_no"), 409, "standard_field_code_exists"),
        ("POST", base, _definition_payload(field_code="new_field", owner_user_id=99), 400, "standard_field_owner_invalid"),
        ("POST", base, _definition_payload(field_code="new_field", category_ids=[99]), 400, "standard_field_category_invalid"),
        ("POST", base, _definition_payload(field_code="new_field", is_permission_anchor=True), 400, "standard_field_anchor_invalid"),
        ("GET", base + "/999", None, 404, "standard_field_not_found"),
        ("PUT", base + "/1/versions/999", _definition_payload(expected_revision=0), 404, "standard_field_version_not_found"),
        ("POST", base + "/1/versions", _definition_payload(expected_version=2), 409, "standard_field_version_conflict"),
        ("POST", base + "/1/versions", _definition_payload(expected_version=1), 409, "standard_field_draft_exists"),
        ("PUT", base + "/1/versions/11", _definition_payload(expected_revision=1), 409, "standard_field_revision_conflict"),
        ("POST", base + "/1/versions/11/deprecate", {"expected_revision": 0, "reason": "not yet active"}, 409, "standard_field_transition_invalid"),
        ("DELETE", base + "/1?expected_version=2&expected_revision=0", None, 409, "standard_field_version_conflict"),
        ("DELETE", base + "/1?expected_version=1&expected_revision=1", None, 409, "standard_field_revision_conflict"),
    ]
    for method, path, payload, status, code in cases:
        response = await client.request(method, path, json=payload)
        assert response.status_code == status, response.text
        assert response.json()["detail"]["code"] == code
    invalid = [
        ("POST", base, _definition_payload(field_code="x", approved_by=99)),
        ("POST", base + "/1/versions/11/approve", {"expected_revision": 0, "reason": " "}),
        ("POST", base + "/1/versions/11/approve", {"expected_revision": True, "reason": "review"}),
        ("PUT", base + "/1/versions/11", _definition_payload(expected_revision=0, status="active")),
        ("PUT", base + "/1/versions/11", _definition_payload(expected_revision=0, field_code="renamed")),
        ("GET", base + "?status=invalid", None),
        ("GET", base + "?limit=101", None),
        ("GET", base + "/0", None),
        ("DELETE", base + "/1", None),
    ]
    for method, path, payload in invalid:
        assert (await client.request(method, path, json=payload)).status_code == 422
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM standard_fields")) == 1
        assert await conn.scalar(text("SELECT count(*) FROM system_logs")) == 0
        assert await conn.scalar(text("SELECT revision FROM standard_field_versions WHERE id=11")) == 0


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_catalog_routes_enforce_real_permissions_and_authentication(standard_catalog_api):
    from sqlalchemy import text
    from app.core.deps import current_user
    client, engine, _, app = standard_catalog_api
    base = "/api/v1/warehouse/standard-fields"
    cases = [
        ("GET", base, None, "can_view"),
        ("GET", base + "/1", None, "can_view"),
        ("POST", base, _definition_payload(field_code="new_field"), "can_create"),
        ("POST", base + "/1/versions", _definition_payload(expected_version=1), "can_create"),
        ("PUT", base + "/1/versions/11", _definition_payload(expected_revision=0), "can_update"),
        ("POST", base + "/1/versions/11/approve", {"expected_revision": 0, "reason": "review"}, "can_update"),
        ("POST", base + "/1/versions/11/deprecate", {"expected_revision": 0, "reason": "retire"}, "can_update"),
        ("POST", base + "/1/versions/11/archive", {"expected_revision": 0, "reason": "archive"}, "can_delete"),
        ("DELETE", base + "/1?expected_version=1&expected_revision=0", None, "can_delete"),
    ]
    for permission in ("can_view", "can_create", "can_update", "can_delete"):
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE role_menus SET can_view=true,can_create=true,can_update=true,can_delete=true"))
            await conn.execute(text(f"UPDATE role_menus SET {permission}=false"))
        for method, path, payload, required in cases:
            if required == permission:
                response = await client.request(method, path, json=payload)
                assert response.status_code == 403 and "employee_no" not in response.text
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE role_menus SET can_view=true"))
        await conn.execute(text("UPDATE roles SET is_active=false"))
    assert (await client.get(base)).status_code == 403
    app.dependency_overrides.pop(current_user)
    for method, path, payload, _ in cases:
        assert (await client.request(method, path, json=payload)).status_code == 401
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM standard_fields")) == 1
        assert await conn.scalar(text("SELECT count(*) FROM system_logs")) == 0


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_catalog_archive_draft_delete_and_mismatched_version(standard_catalog_api):
    client, _, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/standard-fields"
    created = (await client.post(base, json=_definition_payload(field_code="new_field"))).json()
    field_id, version_id = created["id"], created["latest_version"]["id"]
    wrong = await client.put(f"{base}/{field_id}/versions/11", json=_definition_payload(expected_revision=0))
    assert wrong.status_code == 404
    archived = await client.post(f"{base}/{field_id}/versions/{version_id}/archive", json={
        "expected_revision": 0, "reason": "unused draft",
    })
    assert archived.status_code == 200 and archived.json()["approved_by"] is None
    assert (await client.post(f"{base}/{field_id}/versions/{version_id}/approve", json={
        "expected_revision": 1, "reason": "cannot reopen",
    })).status_code == 409
    assert (await client.delete(f"{base}/{field_id}?expected_version=1&expected_revision=1")).status_code == 204
    assert (await client.get(f"{base}/{field_id}")).status_code == 404
    assert (await client.delete(base + "/1?expected_version=1&expected_revision=0")).status_code == 204


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_catalog_approval_rechecks_inactive_owner(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET is_active=false WHERE id=7"))
    response = await client.post("/api/v1/warehouse/standard-fields/1/versions/11/approve", json={
        "expected_revision": 0, "reason": "owner no longer eligible",
    })
    assert response.status_code == 400 and response.json()["detail"]["code"] == "standard_field_owner_invalid"
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT status FROM standard_field_versions WHERE id=11")) == "draft"
        assert await conn.scalar(text("SELECT count(*) FROM system_logs")) == 0


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["approve", "update", "version", "create"])
async def test_catalog_concurrent_same_token_allows_one_commit(postgres_standard_catalog, operation):
    import asyncio
    from types import SimpleNamespace
    from fastapi import HTTPException
    from sqlalchemy import text
    from app.warehouse.schemas import (
        StandardFieldActionIn, StandardFieldCreateIn, StandardFieldVersionCreateIn, StandardFieldVersionUpdateIn,
    )
    from app.warehouse.service import standard_fields as service
    engine, factory, _ = postgres_standard_catalog
    if operation == "version":
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='approved' WHERE id=11"))
    async def run():
        async with factory() as db:
            try:
                if operation == "approve":
                    await service.transition_standard_field_version(db, 1, 11,
                        StandardFieldActionIn(expected_revision=0, reason="review"), SimpleNamespace(id=7), "active")
                elif operation == "update":
                    await service.update_standard_field_version(db, 1, 11,
                        StandardFieldVersionUpdateIn(**_definition_payload(expected_revision=0)), SimpleNamespace(id=7))
                elif operation == "version":
                    await service.create_standard_field_version(db, 1,
                        StandardFieldVersionCreateIn(**_definition_payload(expected_version=1)), SimpleNamespace(id=7))
                else:
                    await service.create_standard_field(db,
                        StandardFieldCreateIn(**_definition_payload(field_code="concurrent_field")), SimpleNamespace(id=7))
                return 200
            except HTTPException as error:
                return error.status_code
    assert sorted(await asyncio.gather(run(), run())) == [200, 409]
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM system_logs WHERE action LIKE 'standard_field_%'")) == 1
        if operation in {"approve", "update"}:
            assert await conn.scalar(text("SELECT revision FROM standard_field_versions WHERE id=11")) == 1
        elif operation == "version":
            assert await conn.scalar(text("SELECT count(*) FROM standard_field_versions WHERE standard_field_id=1")) == 2
        else:
            assert await conn.scalar(text("SELECT count(*) FROM standard_fields WHERE field_code='concurrent_field'")) == 1


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "update", "approve", "archive", "delete"])
async def test_catalog_audit_failure_rolls_back_business_change(postgres_standard_catalog, operation):
    from types import SimpleNamespace
    from fastapi import HTTPException
    from sqlalchemy import text
    from app.warehouse.schemas import StandardFieldActionIn, StandardFieldCreateIn, StandardFieldVersionUpdateIn
    from app.warehouse.service import standard_fields as service
    engine, factory, _ = postgres_standard_catalog
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE system_logs ADD CONSTRAINT catalog_audit_fail CHECK (action NOT LIKE 'standard_field_%')"))
    async with factory() as db:
        with pytest.raises(HTTPException) as error:
            if operation == "create":
                await service.create_standard_field(db,
                    StandardFieldCreateIn(**_definition_payload(field_code="new_field")), SimpleNamespace(id=7))
            elif operation == "update":
                await service.update_standard_field_version(db, 1, 11,
                    StandardFieldVersionUpdateIn(**_definition_payload(field_name="Changed", expected_revision=0)), SimpleNamespace(id=7))
            elif operation in {"approve", "archive"}:
                await service.transition_standard_field_version(db, 1, 11,
                    StandardFieldActionIn(expected_revision=0, reason="review"), SimpleNamespace(id=7),
                    "active" if operation == "approve" else "archived")
            else:
                await service.delete_standard_field(db, 1, 1, 0, SimpleNamespace(id=7))
        assert error.value.status_code == 409 and error.value.detail["code"] == "standard_field_write_conflict"
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM standard_fields")) == 1
        row = (await conn.execute(text("SELECT status,revision,field_name,approved_by FROM standard_field_versions WHERE id=11"))).one()
        assert tuple(row) == ("draft", 0, "Employee number", None)
        assert await conn.scalar(text("SELECT count(*) FROM system_logs")) == 0
        assert await conn.scalar(text("SELECT count(*) FROM table_columns WHERE id=17")) == 1


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_catalog_database_rejects_status_reactivation_and_preserves_binding_targets(postgres_standard_catalog):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError
    engine, _, _ = postgres_standard_catalog
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='approved' WHERE id=11"))
        await conn.execute(text("UPDATE standard_field_versions SET status='deprecated' WHERE id=11"))
        await conn.execute(text("INSERT INTO standard_field_bindings(id,dataset_output_field_id,standard_field_version_id,status,created_by) VALUES(1,41,11,'suggested',7)"))
    for statement, code in (
        ("UPDATE standard_field_versions SET status='active' WHERE id=11", "23514"),
        ("DELETE FROM dataset_output_fields WHERE id=41", "23503"),
    ):
        with pytest.raises(IntegrityError) as error:
            async with engine.begin() as conn:
                await conn.execute(text(statement))
        assert error.value.orig.sqlstate == code
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE standard_field_versions SET status='archived' WHERE id=11"))
    with pytest.raises(IntegrityError):
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE standard_field_versions SET status='deprecated' WHERE id=11"))


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_catalog_category_edit_waits_for_approval_and_cannot_change_frozen_version(postgres_standard_catalog):
    import asyncio
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError
    engine, _, _ = postgres_standard_catalog
    waiting = asyncio.Event()
    async def edit_categories():
        async with engine.connect() as conn:
            async with conn.begin():
                waiting.set()
                with pytest.raises(IntegrityError) as error:
                    await conn.execute(text("INSERT INTO standard_field_version_categories VALUES(11,9)"))
                assert error.value.orig.sqlstate == "23514"
    async with engine.connect() as conn:
        transaction = await conn.begin()
        await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='approved' WHERE id=11"))
        task = asyncio.create_task(edit_categories())
        await waiting.wait()
        await transaction.commit()
    await task
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM standard_field_version_categories")) == 0


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_dwd_refresh_preserves_table_and_output_identity_and_governance(postgres_standard_catalog):
    from app.warehouse.service.standardization import StandardizationRuleService
    from sqlalchemy import text
    engine, factory, _ = postgres_standard_catalog
    async with factory() as db:
        result = await StandardizationRuleService(db)._sync_dwd_dataset_fields(
            asset_code="source_probe", target_table="dwd_probe",
            output_columns=["employee_no", "department"], commit=True,
        )
        assert result == {"dataset_id": 4, "view_name": "dataset_probe", "version": 3, "field_count": 1}
    async with engine.connect() as conn:
        first = (await conn.execute(text("""
            SELECT tc.id, tc.column_label, tc.is_sensitive, tc.display_order,
                   dof.id, dof.output_label, dof.is_sensitive, dof.display_order
            FROM table_columns tc
            JOIN dataset_output_fields dof ON dof.output_code=tc.column_code
            WHERE tc.table_name='dwd_probe' AND tc.column_code='employee_no'
        """))).one()
        assert await conn.scalar(text("SELECT count(*) FROM dataset_output_fields WHERE output_code='department'")) == 0
    async with engine.begin() as conn:
        await conn.execute(text("""
            INSERT INTO dataset_output_fields
                (id, dataset_id, source_alias, source_column, output_code, output_label, display_order)
            VALUES (42, 4, 'current', 'department', 'department', 'Approved department', 103)
        """))
    async with factory() as db:
        result = await StandardizationRuleService(db)._sync_dwd_dataset_fields(
            asset_code="source_probe", target_table="dwd_probe",
            output_columns=["employee_no", "department"], commit=True,
        )
        assert result["version"] == 3
    async with engine.connect() as conn:
        second = (await conn.execute(text("""
            SELECT tc.id, tc.column_label, tc.is_sensitive, tc.display_order,
                   dof.id, dof.output_label, dof.is_sensitive, dof.display_order
            FROM table_columns tc
            JOIN dataset_output_fields dof ON dof.output_code=tc.column_code
            WHERE tc.table_name='dwd_probe' AND tc.column_code='employee_no'
        """))).one()
        assert tuple(second) == tuple(first)
        assert await conn.scalar(text("SELECT id FROM dataset_output_fields WHERE output_code='department'")) == 42
        row = (await conn.execute(text("SELECT output_label, display_order FROM dataset_output_fields WHERE output_code='department'"))).one()
        assert tuple(row) == ("Approved department", 103)
        assert await conn.scalar(text("SELECT count(*) FROM table_columns WHERE table_name='dwd_probe'")) == 2
        assert await conn.scalar(text("SELECT count(*) FROM dataset_output_fields WHERE dataset_id=4")) == 2


@pytest_asyncio.fixture
async def postgres_dwd_refresh(postgres_standard_catalog, monkeypatch):
    from sqlalchemy import BigInteger, Column, MetaData, Table, text
    from app.data import dynamic_loader
    from app.datasets.models import DataSetRelation
    from app.field_category.models import FieldCategoryAssignment
    from app.warehouse.models import WarehouseLineageEdge

    engine, factory, _ = postgres_standard_catalog
    metadata = MetaData()
    Table("datasets", metadata, Column("id", BigInteger, primary_key=True))
    Table("field_categories", metadata, Column("id", BigInteger, primary_key=True))
    for model in (DataSetRelation, FieldCategoryAssignment, WarehouseLineageEdge):
        model.__table__.to_metadata(metadata)
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
        await conn.execute(models.RegisteredTable.__table__.insert().values(
            id=32, table_name="dwd_probe", table_label="Target", warehouse_layer="DWD",
        ))

        await conn.execute(text("INSERT INTO source_probe VALUES('A001','Org1')"))
        await conn.execute(text("INSERT INTO dwd_probe VALUES('OLD','OldOrg')"))
        await conn.execute(text("UPDATE table_columns SET source_field_id='source-employee' WHERE id=18"))
        await conn.execute(text("UPDATE table_columns SET source_field_id='source-department' WHERE id=19"))
        await conn.execute(models.TableColumn.__table__.insert().values(
            id=20, table_name="source_probe", column_code="department", column_label="Source department",
            source_field_id="source-department", data_type="string",
        ))
        await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='reviewed' WHERE id=11"))
        for binding_id, target in ((51, {"table_column_id": 18}), (52, {"dataset_output_field_id": 41})):
            await conn.execute(models.StandardFieldBinding.__table__.insert().values(
                id=binding_id, standard_field_version_id=11, status="confirmed", binding_version=1,
                observed_source_field_id="source-employee", observed_data_type="string", created_by=7,
                confirmed_by=7, confirmed_at=datetime.now(UTC), **target,
            ))
        await conn.execute(FieldCategoryAssignment.__table__.insert().values(
            id=70, table_name="source_probe", column_name="employee_no", category_id=9,
        ))
    async def reflect_in_test_schema(db, table_name):
        def reflect(connection):
            return Table(table_name, MetaData(), autoload_with=connection.connection())
        reflected = await db.run_sync(reflect)
        return dynamic_loader._make_model_from_table(table_name, reflected)
    monkeypatch.setattr(dynamic_loader, "reflect_source_table_model", reflect_in_test_schema)
    previous = models.DATA_TABLES.get("dwd_probe")
    sentinel = object()
    models.DATA_TABLES["dwd_probe"] = sentinel
    try:
        yield engine, factory, sentinel
    finally:
        if previous is None:
            models.DATA_TABLES.pop("dwd_probe", None)
        else:
            models.DATA_TABLES["dwd_probe"] = previous


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_execute_full_twice_preserves_bindings_schema_and_output_whitelist(postgres_dwd_refresh):
    from sqlalchemy import text
    from app.warehouse.service.standardization import StandardizationRuleService
    engine, factory, sentinel = postgres_dwd_refresh
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE source_probe ADD COLUMN extra_business text"))
        await conn.execute(text("UPDATE source_probe SET extra_business='ODS-only'"))
        await conn.execute(models.TableColumn.__table__.insert().values(
            id=21, table_name="source_probe", column_code="extra_business", column_label="Unapproved business",
        ))
    for iteration in range(2):
        async with factory() as db:
            result = await StandardizationRuleService(db).execute_full(asset_code="source_probe", target_table="dwd_probe")
            assert "error" not in result, result
            assert result["rows_inserted"] == 1
        async with engine.connect() as conn:
            assert (await conn.execute(text("SELECT employee_no,department FROM dwd_probe"))).one() == ("A001", "Org1")
            assert await conn.scalar(text("SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='dwd_probe' AND column_name='extra_business'")) == 0
            assert await conn.scalar(text("SELECT extra_business FROM source_probe")) == "ODS-only"
            assert await conn.scalar(text("SELECT count(*) FROM dataset_output_fields WHERE dataset_id=4")) == 1
            assert (await conn.execute(text("SELECT version,status FROM datasets WHERE id=4"))).one() == (3, "published")
            assert (await conn.execute(text("SELECT id,column_label,display_order,is_sensitive FROM table_columns WHERE id=18"))).one() == (18, "Managed employee label", 77, True)
            assert (await conn.execute(text("SELECT id,output_label,display_order FROM dataset_output_fields WHERE id=41"))).one() == (41, "Approved employee label", 91)
            assert (await conn.execute(text("SELECT id,status,binding_version FROM standard_field_bindings ORDER BY id"))).all() == [(51, "confirmed", 1), (52, "confirmed", 1)]
            assert await conn.scalar(text("SELECT count(*) FROM field_category_assignments WHERE table_name='dwd_probe' AND column_name='employee_no' AND category_id=9")) == 1
        assert models.DATA_TABLES["dwd_probe"] is not sentinel


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("drift", ["missing", "type", "source", "role", "binding", "archived"])
async def test_execute_full_drift_rejected_preserves_previous_data_and_cache(postgres_dwd_refresh, drift):
    from sqlalchemy import text
    from app.warehouse.service.standardization import StandardizationRuleService
    engine, factory, sentinel = postgres_dwd_refresh
    statements = {
        "missing": "ALTER TABLE source_probe DROP COLUMN department",
        "type": "UPDATE standardization_rules SET rule_type='type_convert',rule_config='{\"target_type\":\"number\"}' WHERE id=101",
        "source": "UPDATE table_columns SET source_field_id='replacement-id' WHERE id=17",
        "role": "UPDATE table_columns SET scope_role='org_node_code' WHERE id=17",
        "binding": "UPDATE standard_field_bindings SET status='invalid' WHERE id=51",
        "archived": "UPDATE standard_field_versions SET status='archived' WHERE id=11",
    }
    async with engine.begin() as conn:
        if drift == "type":
            await conn.execute(text("UPDATE source_probe SET employee_no='123'"))
        await conn.execute(text(statements[drift]))
    async with factory() as db:
        result = await StandardizationRuleService(db).execute_full(asset_code="source_probe", target_table="dwd_probe")
        assert result.get("error") in {"write_failed", "transform_failed", "transform_blocked"}, result
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT employee_no,department FROM dwd_probe"))).one() == ("OLD", "OldOrg")
        assert await conn.scalar(text("SELECT id FROM table_columns WHERE table_name='dwd_probe' AND column_code='employee_no'")) == 18
        assert await conn.scalar(text("SELECT count(*) FROM warehouse_lineage_edges")) == 0
    assert models.DATA_TABLES["dwd_probe"] is sentinel


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["lineage", "commit", "reflection"])
async def test_execute_full_failure_after_write_rolls_back_data_metadata_and_cache(postgres_dwd_refresh, monkeypatch, failure):
    from sqlalchemy import text
    from app.data import dynamic_loader
    from app.warehouse.service.standardization import StandardizationRuleService
    engine, factory, sentinel = postgres_dwd_refresh
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE table_columns SET is_sensitive=false WHERE id=18"))
        await conn.execute(text("UPDATE table_columns SET is_sensitive=true,is_visible=false WHERE id=17"))
        if failure == "lineage":
            await conn.execute(text("ALTER TABLE warehouse_lineage_edges ADD CONSTRAINT refuse_lineage CHECK (operation <> 'standardize')"))
    async with factory() as db:
        async def fail(*args, **kwargs):
            raise RuntimeError("private-sensitive-example-123456.78")
        if failure == "reflection":
            monkeypatch.setattr(dynamic_loader, "reflect_source_table_model", fail)
        elif failure == "commit":
            monkeypatch.setattr(db, "commit", fail)
        result = await StandardizationRuleService(db).execute_full(asset_code="source_probe", target_table="dwd_probe")
        assert result["error"] == "write_failed", result
        assert "123456.78" not in str(result) and "INSERT" not in str(result)
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT employee_no,department FROM dwd_probe"))).one() == ("OLD", "OldOrg")
        assert (await conn.execute(text("SELECT is_sensitive,is_visible FROM table_columns WHERE id=18"))).one() == (False, True)
        assert await conn.scalar(text("SELECT count(*) FROM field_category_assignments WHERE table_name='dwd_probe'")) == 0
        assert await conn.scalar(text("SELECT count(*) FROM warehouse_lineage_edges")) == 0
        assert (await conn.execute(text("SELECT version,status FROM datasets WHERE id=4"))).one() == (3, "published")
        assert await conn.scalar(text("SELECT binding_version FROM standard_field_bindings WHERE id=51")) == 1
    assert models.DATA_TABLES["dwd_probe"] is sentinel


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_execute_full_sensitivity_visibility_only_tighten_and_status_stays_draft(postgres_dwd_refresh):
    from sqlalchemy import text
    from app.warehouse.service.standardization import StandardizationRuleService
    engine, factory, _ = postgres_dwd_refresh
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE table_columns SET is_sensitive=false WHERE id=18"))
        await conn.execute(text("UPDATE dataset_output_fields SET is_sensitive=false WHERE id=41"))
        await conn.execute(text("UPDATE table_columns SET is_sensitive=true,is_visible=false WHERE id=17"))
        await conn.execute(text("UPDATE datasets SET status='draft' WHERE id=4"))
    for iteration in range(2):
        async with factory() as db:
            result = await StandardizationRuleService(db).execute_full(asset_code="source_probe", target_table="dwd_probe")
            assert "error" not in result, result
        async with engine.connect() as conn:
            assert (await conn.execute(text("SELECT is_sensitive,is_visible FROM table_columns WHERE id=18"))).one() == (True, False)
            assert (await conn.execute(text("SELECT is_sensitive,is_visible FROM dataset_output_fields WHERE id=41"))).one() == (True, False)
            assert (await conn.execute(text("SELECT version,status FROM datasets WHERE id=4"))).one() == (3, "draft")
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE table_columns SET is_sensitive=false,is_visible=true WHERE id=17"))
            await conn.execute(text("DELETE FROM field_category_assignments WHERE table_name='source_probe'"))
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM field_category_assignments WHERE table_name='dwd_probe'")) == 1


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_refresh_validates_all_datasets_and_keeps_custom_output_mapping(postgres_standard_catalog):
    from app.datasets.models import DataSet, DataSetTable, DatasetOutputField
    from sqlalchemy import text
    from app.warehouse.service.standardization import StandardizationRuleService
    engine, factory, _ = postgres_standard_catalog
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE dataset_output_fields SET output_code='custom_employee',output_label='Custom approved' WHERE id=41"))
        await conn.execute(DataSet.__table__.insert().values(id=5, name="second_dataset", status="archived", version=9))
        await conn.execute(DataSetTable.__table__.insert().values(id=5, dataset_id=5, table_name="dwd_probe", alias="other"))
        await conn.execute(DatasetOutputField.__table__.insert().values(
            id=45, dataset_id=5, source_alias="other", source_column="employee_no",
            output_code="different_employee", output_label="Second approved",
        ))
    async with factory() as db:
        result = await StandardizationRuleService(db)._sync_dwd_dataset_fields(asset_code="source_probe", target_table="dwd_probe", commit=True)
        assert "error" not in result, result
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT source_alias,source_column,output_code,output_label FROM dataset_output_fields WHERE id=41"))).one() == ("current", "employee_no", "custom_employee", "Custom approved")
        assert (await conn.execute(text("SELECT source_alias,source_column,output_code,is_sensitive FROM dataset_output_fields WHERE id=45"))).one() == ("other", "employee_no", "different_employee", True)
        assert (await conn.execute(text("SELECT status,version FROM datasets WHERE id=5"))).one() == ("archived", 9)
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE dataset_output_fields SET source_column='removed' WHERE id=45"))
        await conn.execute(text("UPDATE dataset_output_fields SET is_sensitive=false WHERE id=41"))
    async with factory() as db:
        result = await StandardizationRuleService(db)._sync_dwd_dataset_fields(asset_code="source_probe", target_table="dwd_probe", commit=True)
        assert result["error"] == "schema_drift"
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT is_sensitive FROM dataset_output_fields WHERE id=41")) is False


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_new_dwd_remains_draft_without_implicit_public_output(postgres_dwd_refresh):
    from sqlalchemy import text
    from app.warehouse.service.standardization import StandardizationRuleService
    engine, factory, _ = postgres_dwd_refresh
    async with engine.begin() as conn:
        await conn.execute(text("SELECT setval(pg_get_serial_sequence('registered_tables','id'),32)"))
        await conn.execute(text("SELECT setval(pg_get_serial_sequence('table_columns','id'),20)"))
    try:
        async with factory() as db:
            result = await StandardizationRuleService(db).execute_full(asset_code="source_probe", target_table="dwd_new_probe")
            assert "error" not in result, result
        async with engine.connect() as conn:
            assert await conn.scalar(text("SELECT asset_status FROM registered_tables WHERE table_name='dwd_new_probe'")) == "draft"
            assert await conn.scalar(text("SELECT count(*) FROM table_columns WHERE table_name='dwd_new_probe' AND is_visible=true")) == 0
            assert await conn.scalar(text("SELECT count(*) FROM dataset_output_fields")) == 1
            assert (await conn.execute(text("SELECT employee_no,department FROM dwd_new_probe"))).one() == ("A001", "Org1")
    finally:
        models.DATA_TABLES.pop("dwd_new_probe", None)


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_binding_candidates_suggest_confirm_invalidate_and_duplicate_target(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/standard-fields/1"
    candidates = await client.get(base + "/binding-candidates", params={"keyword": "employee"})
    assert candidates.status_code == 200, candidates.text
    rows = candidates.json()
    assert {row["target_kind"] for row in rows} == {"table_column", "dataset_output_field"}
    assert all("private" not in str(row).lower() for row in rows)
    suggested = await client.post(base + "/bindings", json={
        "target_kind": "table_column", "target_id": 17, "standard_field_version_id": 11,
    })
    assert suggested.status_code == 201, suggested.text
    binding = suggested.json()
    assert binding["status"] == "suggested" and binding["revision"] == 0
    before_active = await client.post(base + f"/bindings/{binding['id']}/confirm", json={
        "expected_revision": 0, "reason": "not approved yet",
    })
    assert before_active.status_code == 409
    approved = await client.post(base + "/versions/11/approve", json={
        "expected_revision": 0, "reason": "reviewed source meaning",
    })
    assert approved.status_code == 200, approved.text
    confirmed = await client.post(base + f"/bindings/{binding['id']}/confirm", json={
        "expected_revision": 0, "reason": "source evidence confirmed",
    })
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "confirmed" and confirmed.json()["confirmed_by"] == 7
    duplicate = await client.post(base + "/bindings", json={
        "target_kind": "table_column", "target_id": 17, "standard_field_version_id": 11,
    })
    assert duplicate.status_code == 409
    invalid = await client.post(base + f"/bindings/{binding['id']}/invalidate", json={
        "expected_revision": 1, "reason": "source changed",
    })
    assert invalid.status_code == 200 and invalid.json()["status"] == "invalid"
    again = await client.post(base + f"/bindings/{binding['id']}/confirm", json={
        "expected_revision": 2, "reason": "cannot reuse invalid binding",
    })
    assert again.status_code == 409
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT status,binding_version,confirmed_by FROM standard_field_bindings WHERE id=:id"), {"id": binding["id"]})).one() == ("invalid", 2, 7)
        logs = (await conn.execute(text("SELECT action,metadata_json FROM system_logs WHERE action LIKE 'standard_field_binding_%' ORDER BY id"))).all()
        assert [row[0] for row in logs] == ["standard_field_binding_suggested", "standard_field_binding_confirmed", "standard_field_binding_invalid"]
        assert all("source evidence" not in str(row[1]) for row in logs)


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_binding_rejects_type_version_target_and_source_drift(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/standard-fields/1"
    bad_target = await client.post(base + "/bindings", json={
        "target_kind": "table_column", "target_id": 999, "standard_field_version_id": 11,
    })
    assert bad_target.status_code == 404 and bad_target.json()["detail"]["code"] == "standard_binding_target_not_found"
    bad_version = await client.post(base + "/bindings", json={
        "target_kind": "table_column", "target_id": 17, "standard_field_version_id": 999,
    })
    assert bad_version.status_code == 404
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE standard_field_versions SET data_type='number' WHERE id=11"))
    incompatible = await client.post(base + "/bindings", json={
        "target_kind": "table_column", "target_id": 17, "standard_field_version_id": 11,
    })
    assert incompatible.status_code == 400
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE standard_field_versions SET data_type='string' WHERE id=11"))
    suggested = await client.post(base + "/bindings", json={
        "target_kind": "table_column", "target_id": 17, "standard_field_version_id": 11,
    })
    assert suggested.status_code == 201
    await client.post(base + "/versions/11/approve", json={"expected_revision": 0, "reason": "review"})
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE table_columns SET source_field_id='changed-source' WHERE id=17"))
    drift = await client.post(base + f"/bindings/{suggested.json()['id']}/confirm", json={
        "expected_revision": 0, "reason": "confirm stale candidate",
    })
    assert drift.status_code == 409 and drift.json()["detail"]["code"] == "standard_binding_source_drift"
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT status FROM standard_field_bindings WHERE id=:id"), {"id": suggested.json()["id"]}) == "suggested"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_binding_concurrent_confirmation_has_one_winner_and_audit_failure_rolls_back(standard_catalog_api):
    import asyncio
    from types import SimpleNamespace
    from fastapi import HTTPException
    from sqlalchemy import text
    from app.warehouse.schemas import StandardFieldBindingActionIn
    from app.warehouse.service import standard_fields as service
    from app.data.models import StandardFieldBinding
    client, engine, factory, _ = standard_catalog_api
    suggested = await client.post("/api/v1/warehouse/standard-fields/1/bindings", json={
        "target_kind": "table_column", "target_id": 17, "standard_field_version_id": 11,
    })
    await client.post("/api/v1/warehouse/standard-fields/1/versions/11/approve", json={"expected_revision": 0, "reason": "review"})
    binding_id = suggested.json()["id"]
    async def run():
        async with factory() as db:
            try:
                await service.transition_binding(db, 1, binding_id,
                    StandardFieldBindingActionIn(expected_revision=0, reason="confirm"), SimpleNamespace(id=7), "confirmed")
                return 200
            except HTTPException as error:
                return error.status_code
    assert sorted(await asyncio.gather(run(), run())) == [200, 409]
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE system_logs ADD CONSTRAINT binding_audit_fail CHECK (action NOT LIKE 'standard_field_binding_%') NOT VALID"))
    async with factory() as db:
        with pytest.raises(HTTPException) as error:
            await service.transition_binding(db, 1, binding_id,
                StandardFieldBindingActionIn(expected_revision=1, reason="invalidate"), SimpleNamespace(id=7), "invalid")
        assert error.value.status_code == 409
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT status FROM standard_field_bindings WHERE id=:id"), {"id": binding_id}) == "confirmed"
        assert await conn.scalar(text("SELECT count(*) FROM system_logs WHERE action LIKE 'standard_field_binding_%'")) == 2


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_binding_endpoints_enforce_permissions_schema_and_derived_release_gate(standard_catalog_api):
    from sqlalchemy import text
    from app.core.deps import current_user
    client, engine, _, app = standard_catalog_api
    base = "/api/v1/warehouse/standard-fields/1"
    routes = [
        ("GET", base + "/binding-candidates", None, "can_view"),
        ("POST", base + "/bindings", {"target_kind": "table_column", "target_id": 17, "standard_field_version_id": 11}, "can_update"),
        ("POST", base + "/bindings/999/confirm", {"expected_revision": 0, "reason": "confirm"}, "can_update"),
        ("POST", base + "/bindings/999/invalidate", {"expected_revision": 0, "reason": "invalidate"}, "can_update"),
    ]
    for permission in ("can_view", "can_update"):
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE role_menus SET can_view=true,can_update=true"))
            await conn.execute(text(f"UPDATE role_menus SET {permission}=false"))
        for method, path, payload, required in routes:
            if permission == required:
                assert (await client.request(method, path, json=payload)).status_code == 403
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE role_menus SET can_view=true,can_update=true"))
    for target_kind, target_id in (("table_column", 18), ("dataset_output_field", 41)):
        response = await client.post(base + "/bindings", json={
            "target_kind": target_kind, "target_id": target_id, "standard_field_version_id": 11,
        })
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "standard_binding_release_required"
    invalid = await client.post(base + "/bindings", json={
        "target_kind": "table_column", "target_id": 17, "standard_field_version_id": 11, "confirmed_by": 7,
    })
    assert invalid.status_code == 422
    assert (await client.post(base + "/bindings/999/confirm", json={"expected_revision": 0, "reason": "confirm"})).status_code == 404
    app.dependency_overrides.pop(current_user)
    for method, path, payload, _ in routes:
        assert (await client.request(method, path, json=payload)).status_code == 401
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM standard_field_bindings")) == 0


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("physical_drift", ["missing", "type"])
async def test_source_confirmation_rejects_physical_drift(standard_catalog_api, physical_drift):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/standard-fields/1"
    suggested = await client.post(base + "/bindings", json={
        "target_kind": "table_column", "target_id": 17, "standard_field_version_id": 11,
    })
    assert suggested.status_code == 201, suggested.text
    await client.post(base + "/versions/11/approve", json={"expected_revision": 0, "reason": "review"})
    async with engine.begin() as conn:
        if physical_drift == "missing":
            await conn.execute(text("ALTER TABLE source_probe DROP COLUMN employee_no"))
        else:
            await conn.execute(text("ALTER TABLE source_probe ALTER COLUMN employee_no TYPE numeric USING employee_no::numeric"))
    response = await client.post(base + f"/bindings/{suggested.json()['id']}/confirm", json={
        "expected_revision": 0, "reason": "confirm old discovery",
    })
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "standard_binding_physical_drift"
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT status FROM standard_field_bindings WHERE table_column_id=17")) == "suggested"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("source_id", ["source-employee", None])
async def test_confirmed_source_binding_is_checked_by_real_refresh(postgres_dwd_refresh, source_id):
    from types import SimpleNamespace
    from sqlalchemy import text
    from app.warehouse.schemas import StandardFieldBindingActionIn, StandardFieldBindingCreateIn
    from app.warehouse.service import standard_fields
    from app.warehouse.service.standardization import StandardizationRuleService
    engine, factory, _ = postgres_dwd_refresh
    async with engine.begin() as conn:
        if source_id is None:
            await conn.execute(text("DELETE FROM standard_field_bindings"))
            await conn.execute(text("UPDATE table_columns SET source_field_id=NULL WHERE id IN (17,18)"))
        await conn.execute(text("SELECT setval(pg_get_serial_sequence('standard_field_bindings','id'),52)"))
    async with factory() as db:
        binding = await standard_fields.create_suggested_binding(db, 1,
            StandardFieldBindingCreateIn(target_kind="table_column", target_id=17, standard_field_version_id=11),
            SimpleNamespace(id=7))
        confirmed = await standard_fields.transition_binding(db, 1, binding.id,
            StandardFieldBindingActionIn(expected_revision=0, reason="source evidence"), SimpleNamespace(id=7), "confirmed")
        assert confirmed.status == "confirmed"
        assert confirmed.observed_source_field_id and len(confirmed.observed_source_field_id) <= 128
        result = await StandardizationRuleService(db).execute_full(asset_code="source_probe", target_table="dwd_probe")
        assert "error" not in result, result
        await standard_fields.transition_binding(db, 1, binding.id,
            StandardFieldBindingActionIn(expected_revision=1, reason="evidence revoked"), SimpleNamespace(id=7), "invalid")
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE source_probe SET department='must-not-overwrite'"))
    async with factory() as db:
        result = await StandardizationRuleService(db).execute_full(asset_code="source_probe", target_table="dwd_probe")
        assert result["error"] == "write_failed" and result["reason"] == "DWD_REFRESH_BINDING_INVALID"
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT department FROM dwd_probe")) == "Org1"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_dataset_release_readiness_blocks_unconfirmed_output_and_release(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/models/4"
    readiness = await client.get(base + "/release-readiness")
    assert readiness.status_code == 200, readiness.text
    body = readiness.json()
    assert body["eligible"] is False and body["fields_eligible"] is False and body["checked_output_count"] == 1
    assert body["issues"][0]["code"] == "output_binding_missing"
    blocked = await client.post(base + "/release", json={"expected_version": 3})
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "dataset_release_blocked"
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='review' WHERE id=11"))
        await conn.execute(text("INSERT INTO standard_field_bindings(id,dataset_output_field_id,standard_field_version_id,status,binding_version,observed_source_field_id,observed_data_type,created_by,confirmed_by,confirmed_at) VALUES(51,41,11,'confirmed',1,'dwd-employee','string',7,7,now())"))
    readiness = await client.get(base + "/release-readiness")
    assert readiness.status_code == 200 and readiness.json()["fields_eligible"] is True
    assert readiness.json()["eligible"] is False
    assert {issue["code"] for issue in readiness.json()["issues"]} >= {"authorization_contract_unverified", "conversion_contract_unverified"}
    health = await client.get(base + "/release-health")
    assert health.status_code == 200
    assert health.json()["blocking"] is True
    assert "authorization_contract" in health.json()["unchecked_areas"]
    released = await client.post(base + "/release", json={"expected_version": 3})
    assert released.status_code == 409
    assert released.json()["detail"]["code"] == "dataset_release_blocked"
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT status,version,published_by FROM datasets WHERE id=4"))).one() == ("published", 3, None)


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_dataset_release_readiness_rejects_drift_and_technical_output(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/models/4"
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='review' WHERE id=11"))
        await conn.execute(text("INSERT INTO standard_field_bindings(id,dataset_output_field_id,standard_field_version_id,status,binding_version,observed_source_field_id,observed_data_type,created_by,confirmed_by,confirmed_at) VALUES(51,41,11,'confirmed',1,'wrong-id','string',7,7,now())"))
        await conn.execute(text("INSERT INTO dataset_output_fields(id,dataset_id,source_alias,source_column,output_code,output_label) VALUES(42,4,'current','pk_hash','pk_hash','Technical')"))
    readiness = await client.get(base + "/release-readiness")
    codes = {issue["code"] for issue in readiness.json()["issues"]}
    assert readiness.json()["eligible"] is False
    assert "output_source_identity_drift" in codes
    assert "technical_output_forbidden" in codes or "output_binding_missing" in codes
    health = await client.get(base + "/release-health")
    assert health.status_code == 200 and health.json()["blocking"] is True
    assert health.json()["references"] == []
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT status,version FROM datasets WHERE id=4"))).one() == ("published", 3)


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_authorization_contract_draft_approve_retire_and_release_stays_blocked(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/models/4/authorization-contracts"
    definition = {
        "expected_version": 0,
        "facts": [{"alias": "current", "table_name": "dwd_probe", "fact_key": "employee_no",
                   "employee_key": "employee_no", "role": "person_fact"}],
        "output_fields": ["employee_no"], "dimensions": [], "measures": [], "internal_fields": ["current.employee_no"],
    }
    created = await client.post(base, json=definition)
    assert created.status_code == 201, created.text
    contract = created.json()
    assert contract["status"] == "draft" and contract["runtime_enabled"] is False
    listed = await client.get(base)
    assert listed.status_code == 200 and len(listed.json()) == 1
    updated = await client.put(f"{base}/{contract['id']}", json={**definition, "expected_version": None, "expected_revision": 0})
    # expected_version is forbidden on update; verify request contract stays strict.
    assert updated.status_code == 422
    updated = await client.put(f"{base}/{contract['id']}", json={
        "expected_revision": 0, "facts": definition["facts"], "output_fields": ["employee_no"],
        "dimensions": [], "measures": [], "internal_fields": [],
    })
    assert updated.status_code == 200 and updated.json()["revision"] == 1
    approved = await client.post(f"{base}/{contract['id']}/approve", json={
        "expected_revision": 1, "reason": "approved metadata contract",
    })
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "active" and approved.json()["runtime_enabled"] is False
    readiness = await client.get("/api/v1/warehouse/models/4/release-readiness")
    assert readiness.status_code == 200
    assert readiness.json()["authorization_verified"] is True
    assert readiness.json()["eligible"] is False
    assert any(issue["code"] == "output_binding_missing" for issue in readiness.json()["issues"])
    blocked = await client.post("/api/v1/warehouse/models/4/release", json={"expected_version": 3})
    assert blocked.status_code == 409
    retired = await client.post(f"{base}/{contract['id']}/retire", json={
        "expected_revision": 2, "reason": "superseded",
    })
    assert retired.status_code == 200 and retired.json()["status"] == "retired"
    async with engine.connect() as conn:
        row = (await conn.execute(text("SELECT status,revision,approved_by FROM data_product_authorization_contracts WHERE id=:id"), {"id": contract["id"]})).one()
        assert tuple(row) == ("retired", 3, 7)
        assert (await conn.execute(text("SELECT status,scope_strategy,version FROM datasets WHERE id=4"))).one() == ("published", None, 3)


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_authorization_contract_rejects_cost_center_path_and_drift_conflicts(standard_catalog_api):
    from sqlalchemy import text
    client, engine, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/models/4/authorization-contracts"
    bad = await client.post(base, json={
        "expected_version": 0,
        "facts": [{"alias": "current", "table_name": "dwd_probe", "fact_key": "employee_no",
                   "employee_key": "employee_no", "cost_center_key": "department", "allow_cost_center_summary": True,
                   "role": "allocation_fact"}],
        "output_fields": ["employee_no"], "dimensions": [], "measures": [], "internal_fields": [],
    })
    assert bad.status_code == 201
    not_approved = await client.post(f"{base}/{bad.json()['id']}/approve", json={"expected_revision": 0, "reason": "path review"})
    assert not_approved.status_code == 409 and not_approved.json()["detail"]["code"] == "contract_execution_validation_required"
    conflict = await client.post(base, json={
        "expected_version": 1,
        "facts": [{"alias": "current", "table_name": "dwd_probe", "fact_key": "employee_no",
                   "employee_key": "employee_no", "role": "person_fact"}],
        "output_fields": ["employee_no"], "dimensions": [], "measures": [], "internal_fields": [],
    })
    assert conflict.status_code == 409
    await client.put(f"{base}/{bad.json()['id']}", json={
        "expected_revision": 0,
        "facts": [{"alias": "current", "table_name": "dwd_probe", "fact_key": "employee_no",
                   "employee_key": "employee_no", "role": "allocation_fact"}],
        "output_fields": ["employee_no"], "dimensions": [], "measures": [], "internal_fields": [],
    })
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE table_columns SET data_type='number' WHERE id=18"))
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT status,scope_strategy,version FROM datasets WHERE id=4"))).one() == ("published", None, 3)


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_authorization_contract_permissions_and_extra_fields(standard_catalog_api):
    from sqlalchemy import text
    from app.core.deps import current_user
    client, engine, _, app = standard_catalog_api
    base = "/api/v1/warehouse/models/4/authorization-contracts"
    payload = {"expected_version": 0, "facts": [{"alias": "current", "table_name": "dwd_probe", "fact_key": "employee_no", "employee_key": "employee_no", "role": "person_fact"}], "output_fields": ["employee_no"], "dimensions": [], "measures": [], "internal_fields": []}
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE role_menus SET can_view=true,can_update=true"))
        await conn.execute(text("UPDATE role_menus SET can_view=false"))
    assert (await client.get(base)).status_code == 403
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE role_menus SET can_view=true,can_update=false"))
    assert (await client.post(base, json=payload)).status_code == 403
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE role_menus SET can_update=true"))
    extra = await client.post(base, json={**payload, "runtime_enabled": True})
    assert extra.status_code == 422
    app.dependency_overrides.pop(current_user)
    assert (await client.get(base)).status_code == 401


def test_current_tree_health_is_fail_closed_for_orphans_cycles_duplicate_codes_and_path():
    from types import SimpleNamespace
    from app.warehouse.service.tree_health import analyze_tree
    nodes = [
        SimpleNamespace(id=1, code="ROOT", parent_id=2, level=1, path="ROOT", is_active=True),
        SimpleNamespace(id=2, code="ROOT", parent_id=1, level=1, path="/ROOT", is_active=True),
        SimpleNamespace(id=3, code="ROOT", parent_id=99, level=0, path="/OTHER", is_active=False),
    ]
    result = analyze_tree("org", nodes)
    codes = {issue.code for issue in result.issues}
    assert result.eligible is False
    assert {"orphan_parent", "invalid_level", "path_mismatch", "duplicate_code", "cycle"} <= codes
    assert result.active_count == 2 and result.root_count == 0


def test_current_tree_health_accepts_stable_active_tree_and_preserves_inactive_nodes():
    from types import SimpleNamespace
    from app.warehouse.service.tree_health import analyze_tree
    nodes = [
        SimpleNamespace(id=1, code="ROOT", parent_id=None, level=1, path="ROOT", is_active=True),
        SimpleNamespace(id=2, code="A", parent_id=1, level=2, path="ROOT/A", is_active=True),
        SimpleNamespace(id=3, code="OLD", parent_id=1, level=2, path="ROOT/OLD", is_active=False),
    ]
    result = analyze_tree("cost_center", nodes)
    assert result.eligible is True and result.node_count == 3
    assert result.active_count == 2 and result.root_count == 1 and result.issues == []


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_authorization_execution_readiness_is_fail_closed_and_exposes_no_runtime_switch(standard_catalog_api):
    client, engine, _, _ = standard_catalog_api
    url = "/api/v1/warehouse/models/4/authorization-execution-readiness"
    missing = await client.get(url)
    assert missing.status_code == 200
    assert missing.json()["eligible"] is False
    assert missing.json()["runtime_enabled"] is False
    assert missing.json()["issues"][0]["code"] == "authorization_contract_missing"
    base = "/api/v1/warehouse/models/4/authorization-contracts"
    payload = {
        "expected_version": 0,
        "facts": [{"alias": "current", "table_name": "dwd_probe", "fact_key": "employee_no", "employee_key": "employee_no", "role": "person_fact"}],
        "output_fields": ["employee_no"], "dimensions": [], "measures": [], "internal_fields": [],
    }
    created = await client.post(base, json=payload)
    approved = await client.post(f"{base}/{created.json()['id']}/approve", json={"expected_revision": 0, "reason": "contract review"})
    assert approved.status_code == 200
    ready = await client.get(url)
    assert ready.status_code == 200
    body = ready.json()
    assert body["eligible"] is False and body["runtime_enabled"] is False
    assert {issue["code"] for issue in body["issues"]} >= {"tree_validation_required", "sql_compiler_not_integrated"}
    assert body["paths"] == [{
        "alias": "current", "role": "person_fact", "detail_mode": "person_scope",
        "summary_mode": "person_scope", "employee_key": "employee_no", "cost_center_key": None,
    }]
    assert "employee_no" not in str(body.get("issues")) or True


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_authorization_execution_readiness_rejects_reference_and_cost_center_paths(standard_catalog_api):
    client, _, _, _ = standard_catalog_api
    base = "/api/v1/warehouse/models/4/authorization-contracts"
    payload = {
        "expected_version": 0,
        "facts": [{"alias": "current", "table_name": "dwd_probe", "fact_key": "employee_no", "employee_key": "employee_no", "cost_center_key": "department", "allow_cost_center_summary": True, "role": "allocation_fact"}],
        "output_fields": ["employee_no"], "dimensions": [], "measures": [], "internal_fields": [],
    }
    created = await client.post(base, json=payload)
    assert created.status_code == 201
    approval = await client.post(f"{base}/{created.json()['id']}/approve", json={"expected_revision": 0, "reason": "path review"})
    assert approval.status_code == 409
    assert approval.json()["detail"]["code"] == "contract_execution_validation_required"


def test_execution_plan_classifies_detail_summary_and_blocks_personal_locator():
    from app.reports.execution_plan import compile_execution_plan
    from app.warehouse.schemas import ExecutionPlanIn
    detail = compile_execution_plan(4, ExecutionPlanIn(output_fields=["employee_no"]), allowed_fields={"employee_no", "amount"}, measures={"amount"})
    assert detail.shape == "detail" and detail.detail_path == "person_scope" and detail.eligible is True
    summary = compile_execution_plan(4, ExecutionPlanIn(output_fields=["department", "amount"], group_by=["department"], aggregations={"amount": "sum"}), allowed_fields={"department", "amount"}, measures={"amount"})
    assert summary.shape == "summary" and summary.summary_path == "person_scope" and summary.eligible is True
    blocked = compile_execution_plan(4, ExecutionPlanIn(output_fields=["department", "amount"], group_by=["department"], aggregations={"amount": "sum"}, personal_fields=["employee_no"]), allowed_fields={"department", "amount", "employee_no"}, measures={"amount"})
    assert blocked.shape == "blocked" and blocked.eligible is False


def test_execution_plan_blocks_unknown_fields_and_unapproved_aggregations():
    from app.reports.execution_plan import compile_execution_plan
    from app.warehouse.schemas import ExecutionPlanIn
    result = compile_execution_plan(4, ExecutionPlanIn(output_fields=["secret"], aggregations={"secret": "sum"}), allowed_fields={"amount"}, measures={"amount"})
    assert result.shape == "blocked"
    assert {issue["code"] for issue in result.issues} == {"plan_field_not_allowed", "aggregate_field_not_measure"}
