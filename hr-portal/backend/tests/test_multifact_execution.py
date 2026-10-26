from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from tests.test_d_execution import postgres_d_fact
from tests.test_scope_classification import postgres_classification_schema
from tests.test_standard_field_catalog import postgres_standard_catalog
from app.datasets.authorization_contract import ProductAuthorizationDefinition, _snapshot
from app.datasets.d_execution import SExecutionBindingIn, compile_allocation_fact_s_result_statements_for_user
from app.datasets.multifact_execution import validate_multifact_plan
from app.warehouse.schemas import ExecutionPlanIn


def definition():
    return ProductAuthorizationDefinition(schema_version=3, facts=[
        {"alias": "allocation", "table_name": "allocation_fact", "fact_key": "fact_id", "employee_key": "employee_no", "cost_center_key": "cc_code", "role": "allocation_fact", "allow_cost_center_summary": True},
        {"alias": "salary", "table_name": "person_fact", "fact_key": "fact_id", "employee_key": "employee_no", "role": "person_fact"},
    ])


@pytest_asyncio.fixture
async def multifact(postgres_d_fact):
    from app.data.models import RegisteredTable, TableColumn, StandardField, StandardFieldVersion, StandardFieldBinding
    from app.datasets.models import DataSetTable, DataSetRelation, DatasetOutputField
    from app.warehouse.service.standard_fields import _physical_source_identity
    engine, factory, _ = postgres_d_fact
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from importlib.util import spec_from_file_location, module_from_spec
    from pathlib import Path
    spec = spec_from_file_location("display_name_migration", Path(__file__).parents[1] / "alembic/versions/0272_standard_field_display_name.py")
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    def install(connection):
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
    async with engine.begin() as conn:
        await conn.run_sync(install)
    async with factory() as db:
        await db.execute(text('CREATE UNIQUE INDEX salary_employee_identity ON person_fact (employee_no)'))
        await db.execute(text("UPDATE person_fact SET amount=100 WHERE employee_no='C'"))
        await db.execute(text("INSERT INTO allocation_fact (fact_id,employee_no,amount,cc_code,department) VALUES (4,'A',100,'CC1','O1'),(5,NULL,50,'CC1','UNKNOWN'),(6,'X',60,'CC1','UNKNOWN')"))
        db.add(RegisteredTable(id=33, table_name="person_fact", table_label="Salary", warehouse_layer="DWD", roster_join_col="employee_no"))
        db.add(DataSetTable(id=3, dataset_id=7, table_name="person_fact", alias="salary"))
        db.add(DataSetRelation(id=1, dataset_id=7, left_alias="allocation", right_alias="salary", join_type="left", cardinality="N:1", keys=[{"left": "employee_no", "right": "employee_no"}]))
        allocation_amount = await db.scalar(select(DatasetOutputField).where(DatasetOutputField.dataset_id == 7, DatasetOutputField.output_code == "amount"))
        allocation_amount.agg_role = "measure"
        source = await db.scalar(select(TableColumn).where(TableColumn.table_name == "person_fact", TableColumn.column_code == "amount"))
        now = datetime.now(UTC)
        db.add(StandardField(id=300, field_code="salary_amount", created_by=7))
        await db.flush()
        db.add(StandardFieldVersion(id=300, standard_field_id=300, version=1, field_name="Salary", business_definition="Synthetic salary fact amount", data_type="number", permission_domain="public", owner_user_id=7, created_by=7, status="active", approved_by=7, approved_at=now, approval_reason="isolated fixture"))
        db.add(DatasetOutputField(id=50, dataset_id=7, source_alias="salary", source_column="amount", output_code="salary_amount", output_label="Salary", data_type="number", agg_role="measure", is_sensitive=False))
        await db.flush()
        for target in ({"table_column_id": source.id}, {"dataset_output_field_id": 50}):
            db.add(StandardFieldBinding(**target, standard_field_version_id=300, status="confirmed", binding_version=1, created_by=7, confirmed_by=7, confirmed_at=now, observed_source_field_id=_physical_source_identity("person_fact", "amount"), observed_data_type="number"))
        await db.commit()
        tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == 7))).scalars().all()
        relations = (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == 7))).scalars().all()
        outputs = (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == 7))).scalars().all()
        snapshot = _snapshot(tables, relations, outputs)
    yield engine, factory, {"id": 12, "dataset_id": 7, "contract_version": 1, "status": "active", "contract_json": definition().model_dump(), "model_snapshot": snapshot}


def request(plan=None):
    return SExecutionBindingIn(dataset_id=7, contract_id=12, contract_version=1, plan=plan or ExecutionPlanIn(output_fields=["amount", "salary_amount"], aggregations={"amount": "sum", "salary_amount": "sum"}))


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_multifact_actual_amounts_do_not_multiply_or_collapse_equal_values(multifact):
    engine, factory, contract = multifact
    async with factory() as db:
        statements, issues = await compile_allocation_fact_s_result_statements_for_user(contract=contract, request=request(), user=SimpleNamespace(id=7), db=db)
        assert issues == []
        row = (await db.execute(statements["preview"])).mappings().one()
        assert row["amount"] == 810
        assert row["salary_amount"] == 200
        assert await db.scalar(statements["count"]) == 1
        assert (await db.execute(statements["export"])).mappings().one() == row
        naive = await db.scalar(text("SELECT sum(p.amount) FROM allocation_fact a JOIN person_fact p ON p.employee_no=a.employee_no WHERE p.employee_no IN ('A','C')"))
        collapsed = await db.scalar(text("SELECT sum(DISTINCT p.amount) FROM allocation_fact a JOIN person_fact p ON p.employee_no=a.employee_no WHERE p.employee_no IN ('A','C')"))
        assert naive == 300 and collapsed == 100


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_multifact_rejects_unapproved_salary_split_by_allocation_center(multifact):
    _, factory, contract = multifact
    plan = ExecutionPlanIn(output_fields=["cc_code", "amount", "salary_amount"], group_by=["cc_code"], aggregations={"amount": "sum", "salary_amount": "sum"})
    async with factory() as db:
        statements, issues = await compile_allocation_fact_s_result_statements_for_user(contract=contract, request=request(plan), user=SimpleNamespace(id=7), db=db)
        assert statements is None
        assert issues[0]["code"] == "multi_fact_measure_split_unapproved"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_multifact_center_grant_cannot_authorize_salary(multifact):
    from app.scopes.models import UserScopeTag
    engine, factory, contract = multifact
    async with engine.begin() as conn:
        await conn.execute(UserScopeTag.__table__.delete().where(UserScopeTag.tag_id == 1))
    async with factory() as db:
        statements, issues = await compile_allocation_fact_s_result_statements_for_user(contract=contract, request=request(), user=SimpleNamespace(id=7), db=db)
        assert statements is None
        assert issues[0]["code"] == "d_execution_scope_denied"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_multifact_unique_side_constraint_must_remain_valid(multifact):
    engine, factory, contract = multifact
    async with engine.begin() as conn:
        await conn.execute(text("DROP INDEX salary_employee_identity"))
    async with factory() as db:
        statements, issues = await compile_allocation_fact_s_result_statements_for_user(contract=contract, request=request(), user=SimpleNamespace(id=7), db=db)
        assert statements is None
        assert issues[0]["code"] == "authorization_relation_cardinality_unverified"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_multifact_salary_field_revocation_blocks_all_channels(multifact):
    from app.data.models import TableColumn
    _, factory, contract = multifact
    async with factory() as db:
        salary = await db.scalar(select(TableColumn).where(TableColumn.table_name == "person_fact", TableColumn.column_code == "amount"))
        salary.is_sensitive = True
        await db.commit()
        statements, issues = await compile_allocation_fact_s_result_statements_for_user(contract=contract, request=request(), user=SimpleNamespace(id=7), db=db)
        assert statements is None
        assert issues


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_multifact_group_count_pagination_filters_and_null_bucket(multifact):
    from app.data.models import TableColumn, StandardField, StandardFieldVersion, StandardFieldBinding
    from app.datasets.models import DataSetTable, DataSetRelation, DatasetOutputField
    from app.warehouse.schemas import PlanConditionIn
    from app.warehouse.service.standard_fields import _physical_source_identity
    _, factory, contract = multifact
    async with factory() as db:
        column = TableColumn(table_name="person_fact", column_code="cc_code", column_label="Salary bucket", data_type="string")
        db.add(column)
        db.add(StandardField(id=310, field_code="salary_bucket", created_by=7))
        await db.flush()
        now = datetime.now(UTC)
        db.add(StandardFieldVersion(id=310, standard_field_id=310, version=1, field_name="Salary bucket", business_definition="Synthetic fact-owned bucket", data_type="string", grain_level="coarse", permission_domain="public", owner_user_id=7, created_by=7, status="active", approved_by=7, approved_at=now, approval_reason="isolated fixture"))
        db.add(DatasetOutputField(id=51, dataset_id=7, source_alias="salary", source_column="cc_code", output_code="salary_bucket", output_label="Salary bucket", data_type="string", agg_role="dimension", is_sensitive=False))
        await db.flush()
        for target in ({"table_column_id": column.id}, {"dataset_output_field_id": 51}):
            db.add(StandardFieldBinding(**target, standard_field_version_id=310, status="confirmed", binding_version=1, created_by=7, confirmed_by=7, confirmed_at=now, observed_source_field_id=_physical_source_identity("person_fact", "cc_code"), observed_data_type="string"))
        await db.commit()
        tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == 7))).scalars().all()
        relations = (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == 7))).scalars().all()
        outputs = (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == 7))).scalars().all()
        contract["model_snapshot"] = _snapshot(tables, relations, outputs)
        plan = ExecutionPlanIn(output_fields=["salary_bucket", "amount", "salary_amount"], group_by=["salary_bucket"], aggregations={"amount": "sum", "salary_amount": "sum"})
        statements, issues = await compile_allocation_fact_s_result_statements_for_user(contract=contract, request=request(plan), user=SimpleNamespace(id=7), db=db, page=2, page_size=1)
        assert issues == []
        assert await db.scalar(statements["count"]) == 3
        assert len((await db.execute(statements["preview"])).all()) == 1
        rows = (await db.execute(statements["export"])).mappings().all()
        assert [(row["salary_bucket"], row["amount"], row["salary_amount"]) for row in rows] == [("CC1", 200, 100), ("CC2", 300, 100), (None, 310, None)]
        filtered = plan.model_copy(update={"conditions": [PlanConditionIn(field="salary_bucket", operator="eq", value="CC1")]})
        statements, issues = await compile_allocation_fact_s_result_statements_for_user(contract=contract, request=request(filtered), user=SimpleNamespace(id=7), db=db)
        assert issues == []
        assert await db.scalar(statements["count"]) == 1
        assert (await db.execute(statements["export"])).mappings().one()["amount"] == 200


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_multifact_inner_join_applies_both_fact_scopes(multifact):
    from app.datasets.models import DataSetRelation
    _, factory, contract = multifact
    async with factory() as db:
        relation = await db.get(DataSetRelation, 1)
        relation.join_type = "inner"
        await db.commit()
        contract["model_snapshot"]["relations"][0]["join_type"] = "inner"
        statements, issues = await compile_allocation_fact_s_result_statements_for_user(contract=contract, request=request(), user=SimpleNamespace(id=7), db=db)
        assert issues == []
        row = (await db.execute(statements["export"])).mappings().one()
        assert row["amount"] == 500 and row["salary_amount"] == 200


def test_multifact_right_full_many_to_many_and_detail_remain_closed():
    snapshot = {"tables": [{"id": 1, "alias": "allocation", "table_name": "allocation_fact"}, {"id": 2, "alias": "salary", "table_name": "person_fact"}], "relations": [{"id": 1, "left_alias": "allocation", "right_alias": "salary", "join_type": "full", "cardinality": "N:1", "keys": [{"left": "employee_no", "right": "employee_no"}]}], "outputs": []}
    assert validate_multifact_plan(definition(), snapshot, request().plan)[0]["code"] == "multi_fact_join_unsupported"
    snapshot["relations"][0]["join_type"] = "left"
    snapshot["relations"][0]["cardinality"] = "N:M"
    assert validate_multifact_plan(definition(), snapshot, request().plan)[0]["code"] == "authorization_relation_cardinality_invalid"
