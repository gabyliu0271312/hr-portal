import pytest
import pytest_asyncio

from tests.test_scope_classification import postgres_classification_schema
from tests.test_standard_field_catalog import postgres_standard_catalog

from app.datasets.authorization_contract import ProductAuthorizationDefinition
from app.datasets.d_execution import (
    DExecutionBindingIn,
    DExecutionContractSnapshot,
    SExecutionBindingIn,
    validate_allocation_fact_s_execution,
    validate_person_fact_d_execution,
)
from app.warehouse.schemas import ExecutionPlanIn


def _contract(**overrides):
    definition = ProductAuthorizationDefinition.model_validate({
        "facts": [{
            "alias": "person",
            "table_name": "person_fact",
            "fact_key": "fact_id",
            "employee_key": "employee_no",
            "role": "person_fact",
        }],
        "output_fields": ["employee_no", "amount"],
        "dimensions": ["employee_no"],
        "measures": ["amount"],
        "internal_fields": ["person.fact_id"],
    })
    values = {
        "contract_id": 11,
        "dataset_id": 7,
        "contract_version": 3,
        "status": "active",
        "definition": definition,
        "model_snapshot": {
            "tables": [{"id": 1, "table_name": "person_fact", "alias": "person"}],
            "relations": [],
            "outputs": [
                {"id": 21, "source_alias": "person", "source_column": "employee_no", "output_code": "employee_no"},
                {"id": 22, "source_alias": "person", "source_column": "amount", "output_code": "amount"},
            ],
        },
        "runtime_enabled": False,
    }
    values.update(overrides)
    return DExecutionContractSnapshot(**values)


def test_semantic_locator_codes_use_standard_field_identity():
    from types import SimpleNamespace
    from app.datasets.d_execution import _semantic_locator_codes

    outputs = {"employee_no": {"id": 1}, "department": {"id": 2}, "amount": {"id": 3}}
    semantics = {
        1: (None, SimpleNamespace(grain_level="coarse", permission_domain="public", standard_field_id=5)),
        2: (None, SimpleNamespace(grain_level="coarse", permission_domain="personal", standard_field_id=6)),
        3: (None, SimpleNamespace(grain_level="coarse", permission_domain="public", standard_field_id=5)),
    }
    # 与员工锚点同一标准字段、或 personal 权限域，都算人员定位；不看物理列名。
    assert _semantic_locator_codes(outputs, semantics, 5) == {"employee_no", "department", "amount"}
    assert _semantic_locator_codes(outputs, semantics, None) == {"department"}
    identifying = {
        1: (None, SimpleNamespace(grain_level="identifying", permission_domain="public", standard_field_id=7)),
    }
    assert _semantic_locator_codes(outputs, identifying, None) == {"employee_no"}


def _request(**overrides):
    values = {
        "dataset_id": 7,
        "contract_id": 11,
        "contract_version": 3,
        "plan": ExecutionPlanIn(output_fields=["employee_no", "amount"]),
    }
    values.update(overrides)
    return DExecutionBindingIn(**values)


def _s_contract(**overrides):
    definition = ProductAuthorizationDefinition.model_validate({
        "facts": [{"alias": "allocation", "table_name": "allocation_fact", "fact_key": "fact_id",
                   "employee_key": "employee_no", "cost_center_key": "cc_code",
                   "allow_cost_center_summary": True, "role": "allocation_fact"}],
        "output_fields": ["cc_code", "department", "amount"],
        "dimensions": ["cc_code", "department"], "measures": ["amount"],
        "internal_fields": ["allocation.fact_id", "allocation.employee_no"],
    })
    values = {"contract_id": 12, "dataset_id": 7, "contract_version": 1, "status": "active",
              "definition": definition,
              "model_snapshot": {"tables": [{"id": 2, "table_name": "allocation_fact", "alias": "allocation"}],
                                 "relations": [], "outputs": [
                                     {"id": 31, "source_alias": "allocation", "source_column": "cc_code", "output_code": "cc_code"},
                                     {"id": 32, "source_alias": "allocation", "source_column": "department", "output_code": "department"},
                                     {"id": 33, "source_alias": "allocation", "source_column": "amount", "output_code": "amount"}]},
              "runtime_enabled": False}
    for output in values["model_snapshot"]["outputs"]:
        output.update(is_visible=True, is_sensitive=False,
                      data_type="number" if output["output_code"] == "amount" else "string")
    values.update(overrides)
    return DExecutionContractSnapshot(**values)


def _s_request(**overrides):
    values = {"dataset_id": 7, "contract_id": 12, "contract_version": 1,
              "plan": ExecutionPlanIn(output_fields=["cc_code", "amount"], group_by=["cc_code"], aggregations={"amount": "sum"})}
    values.update(overrides)
    return SExecutionBindingIn(**values)


def test_allocation_fact_s_contract_allows_only_server_bound_summary_plan():
    result = validate_allocation_fact_s_execution(_s_contract(), _s_request())
    assert result.eligible is True and result.summary_path == "person_or_cost_center_scope"
    assert result.runtime_enabled is False
    two_fact_definition = _s_contract().definition.model_dump()
    two_fact_definition["facts"].append({"alias": "reference", "table_name": "reference_fact", "fact_key": "id", "role": "reference"})
    blocked = validate_allocation_fact_s_execution(
        _s_contract(definition=ProductAuthorizationDefinition.model_validate(two_fact_definition)), _s_request())
    assert blocked.eligible is False
    person = validate_allocation_fact_s_execution(_contract(), _s_request())
    assert person.eligible is False
    personal = validate_allocation_fact_s_execution(_s_contract(), _s_request(plan=ExecutionPlanIn(
        output_fields=["cc_code", "amount"], group_by=["cc_code"], aggregations={"amount": "sum"}, personal_fields=["employee_no"])))
    assert personal.eligible is False
    assert "s_execution_personal_locator_forbidden" in {issue["code"] for issue in personal.issues}


def test_allocation_fact_s_rejects_client_binding_or_scope_overrides():
    result = validate_allocation_fact_s_execution(_s_contract(), {**_s_request().model_dump(), "cost_center_ids": ["CC1"]})
    assert result.eligible is False
    assert result.issues[0]["code"] == "authorization_contract_invalid"


@pytest.mark.asyncio
async def test_allocation_fact_s_scope_reuses_person_and_center_scope_without_client_scope(monkeypatch):
    from sqlalchemy import column, false, true
    from app.datasets import d_execution

    calls = []

    async def fake_scope(user, table, db, strategy=None, table_alias=None):
        calls.append(strategy)
        return column(strategy)

    monkeypatch.setattr("app.permissions.scope_filter.build_scope_filter", fake_scope)
    clause, issues = await d_execution.compile_allocation_fact_s_scope(
        user="user", fact=_s_contract().definition.facts[0], model=object(), db="db")
    assert clause is None
    assert issues[0]["code"] == "s_execution_scope_configuration_invalid"
    assert calls == []

    denied = await d_execution.compile_allocation_fact_s_scope(
        user="user", fact=_contract().definition.facts[0], model=object(), db="db")
    assert denied[0] is None and denied[1][0]["code"] == "s_execution_cost_center_path_invalid"


@pytest.mark.parametrize("mutation", ["table", "missing_output", "bad_output", "duplicate", "join", "anchor", "other_alias"])
def test_s_rejects_broken_server_snapshot(mutation):
    from dataclasses import replace
    contract = _s_contract()
    if mutation == "table":
        contract.model_snapshot["tables"][0]["table_name"] = "other"
    elif mutation == "missing_output":
        contract.model_snapshot["outputs"].pop()
    elif mutation == "bad_output":
        contract.model_snapshot["outputs"][0] = None
    elif mutation == "duplicate":
        contract.model_snapshot["outputs"].append(contract.model_snapshot["outputs"][0])
    elif mutation == "join":
        contract.model_snapshot["relations"] = [{"id": 1}]
    elif mutation == "anchor":
        definition = contract.definition.model_dump()
        definition["internal_fields"] = []
        contract = replace(contract, definition=ProductAuthorizationDefinition.model_validate(definition))
    else:
        contract.model_snapshot["outputs"][0]["source_alias"] = "other"
    result = validate_allocation_fact_s_execution(contract, _s_request())
    assert result.eligible is False and result.runtime_enabled is False


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("restriction", [
    "classification", "sensitive", "invisible", "snapshot_sensitive", "invalid_binding",
    "deprecated", "type_drift", "missing_center_anchor", "missing_roster_anchor", "unresolved_person_filter",
    "semantic_classification", "identifying_dimension", "unknown_person_filter", "identity_drift", "fact_key",
])
async def test_postgres_s_rechecks_fields_and_path_configuration(postgres_d_fact, restriction):
    from types import SimpleNamespace
    from sqlalchemy import text
    from app.datasets import d_execution
    engine, factory, _ = postgres_d_fact
    contract = _s_contract()
    changes = {
        "classification": "INSERT INTO field_category_assignments(category_id,table_name,column_name) VALUES(9,'allocation_fact','amount')",
        "sensitive": "UPDATE table_columns SET is_sensitive=true WHERE table_name='allocation_fact' AND column_code='amount'",
        "invisible": "UPDATE table_columns SET is_visible=false WHERE table_name='allocation_fact' AND column_code='amount'",
        "invalid_binding": "UPDATE standard_field_bindings SET status='invalid' WHERE id=100",
        "deprecated": "UPDATE standard_field_versions SET status='deprecated' WHERE id=100",
        "type_drift": "ALTER TABLE allocation_fact ALTER COLUMN amount TYPE text",
        "missing_center_anchor": "UPDATE table_columns SET scope_role=NULL WHERE table_name='allocation_fact' AND column_code='cc_code'",
        "missing_roster_anchor": "UPDATE table_columns SET scope_role=NULL WHERE table_name='emp_realtime_roster' AND column_code='org_node_code'",
        "unresolved_person_filter": "UPDATE scope_tags SET person_scope_enabled=true WHERE id=2",
        "semantic_classification": "INSERT INTO standard_field_version_categories(standard_field_version_id,field_category_id) VALUES(11,9)",
        "identifying_dimension": "UPDATE standard_field_versions SET grain_level='identifying', status='active',approved_by=7,approved_at=now(),approval_reason='review' WHERE id=103",
        "unknown_person_filter": "UPDATE scope_tags SET person_scope_enabled=true WHERE id=2",
        "identity_drift": "UPDATE table_columns SET source_field_id='replacement' WHERE table_name='allocation_fact' AND column_code='amount'",
        "fact_key": "ALTER TABLE allocation_fact DROP CONSTRAINT allocation_fact_pkey",
    }
    if restriction == "snapshot_sensitive":
        contract.model_snapshot["outputs"][-1]["is_sensitive"] = True
    else:
        async with engine.begin() as conn:
            if restriction == "identifying_dimension":
                from app.data import models
                from datetime import datetime, timezone
                await conn.execute(models.StandardField.__table__.insert().values(
                    id=103, field_code="personal_center", created_by=7))
                await conn.execute(models.StandardFieldVersion.__table__.insert().values(
                    id=103, standard_field_id=103, version=1, field_name="Personal center",
                    business_definition="Identifying dimension", data_type="string", grain_level="identifying",
                    permission_domain="personal", owner_user_id=7, created_by=7, status="active",
                    approved_by=7, approved_at=datetime.now(timezone.utc), approval_reason="isolated"))
                await conn.execute(text("UPDATE standard_field_bindings SET standard_field_version_id=103 WHERE id=100"))
            elif restriction == "semantic_classification":
                from app.data import models
                await conn.execute(models.StandardField.__table__.insert().values(
                    id=103, field_code="sensitive_amount", created_by=7))
                await conn.execute(models.StandardFieldVersion.__table__.insert().values(
                    id=103, standard_field_id=103, version=1, field_name="Amount",
                    business_definition="Sensitive amount", data_type="number", permission_domain="salary",
                    owner_user_id=7, created_by=7, status="draft"))
                await conn.execute(models.StandardFieldVersionCategory.__table__.insert().values(
                    standard_field_version_id=103, field_category_id=9))
                await conn.execute(text("UPDATE standard_field_versions SET status='active', approved_by=7, approved_at=now(), approval_reason='isolated' WHERE id=103"))
                await conn.execute(text("UPDATE standard_field_bindings SET standard_field_version_id=103 WHERE id=102"))
            else:
                await conn.execute(text(changes[restriction]))
            if restriction == "unknown_person_filter":
                from app.scopes.models import ScopeTagFilter
                await conn.execute(ScopeTagFilter.__table__.insert().values(
                    id=1, tag_id=2, field_code="employment_type", operator="eq", values=["fulltime"]))
    async with factory() as db:
        statement, issues = await d_execution.compile_allocation_fact_s_select_for_user(
            contract=contract, request=_s_request(), user=SimpleNamespace(id=7), db=db)
        assert statement is None and issues
        assert all(set(issue) == {"code", "message"} for issue in issues)


@pytest.mark.parametrize("value", [[], {}, None, 5])
def test_s_malformed_snapshot_type_is_blocked(value):
    contract = _s_contract()
    contract.model_snapshot["outputs"][0]["data_type"] = value
    result = validate_allocation_fact_s_execution(contract, _s_request())
    assert result.eligible is False
    assert "authorization_snapshot_invalid" in {issue["code"] for issue in result.issues}


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["invalid_binding", "archived", "identifying", "category", "source", "hidden"])
async def test_postgres_s_rechecks_output_semantics(postgres_d_fact, mutation):
    from types import SimpleNamespace
    from sqlalchemy import text
    from app.datasets import d_execution
    engine, factory, _ = postgres_d_fact
    async with engine.begin() as conn:
        if mutation in {"invalid_binding", "archived"}:
            statement = ("UPDATE standard_field_bindings SET status='invalid' WHERE id=202" if mutation == "invalid_binding"
                         else "UPDATE standard_field_versions SET status='archived' WHERE id=202")
            await conn.execute(text(statement))
        elif mutation in {"identifying", "category"}:
            from app.data import models
            await conn.execute(models.StandardField.__table__.insert().values(id=203, field_code="output_amount_new", created_by=7))
            await conn.execute(models.StandardFieldVersion.__table__.insert().values(
                id=203, standard_field_id=203, version=1, field_name="Amount", business_definition="Output-specific",
                data_type="number", grain_level="identifying" if mutation == "identifying" else None,
                permission_domain="salary", owner_user_id=7, created_by=7, status="draft"))
            if mutation == "category":
                await conn.execute(models.StandardFieldVersionCategory.__table__.insert().values(
                    standard_field_version_id=203, field_category_id=9))
            await conn.execute(text("UPDATE standard_field_versions SET status='active', approved_by=7, approved_at=now(), approval_reason='isolated' WHERE id=203"))
            await conn.execute(text("UPDATE standard_field_bindings SET standard_field_version_id=203 WHERE id=202"))
        else:
            await conn.execute(text("UPDATE dataset_output_fields SET " + (
                "source_column='department'" if mutation == "source" else "is_visible=false") + " WHERE id=33"))
    async with factory() as db:
        statement, issues = await d_execution.compile_allocation_fact_s_select_for_user(
            contract=_s_contract(), request=_s_request(), user=SimpleNamespace(id=7), db=db)
        assert statement is None and issues


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("aggregation", ["sum", "avg"])
async def test_postgres_s_rejects_consistent_string_measure(postgres_d_fact, aggregation):
    from types import SimpleNamespace
    from sqlalchemy import text
    from dataclasses import replace
    from app.data import models
    from app.data.dynamic_loader import _make_model_from_table
    from app.datasets import d_execution
    from sqlalchemy import MetaData, Table
    engine, factory, _ = postgres_d_fact
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE allocation_fact ALTER COLUMN amount TYPE text"))
        await conn.execute(text("UPDATE table_columns SET data_type='string' WHERE table_name='allocation_fact' AND column_code='amount'"))
        await conn.execute(text("UPDATE dataset_output_fields SET data_type='string' WHERE id=33"))
        for index, binding_id in ((104, 102), (204, 202)):
            await conn.execute(models.StandardField.__table__.insert().values(id=index, field_code=f"text_amount_{index}", created_by=7))
            await conn.execute(models.StandardFieldVersion.__table__.insert().values(
                id=index, standard_field_id=index, version=1, field_name="Text amount", business_definition="Non numeric",
                data_type="string", permission_domain="public", owner_user_id=7, created_by=7, status="draft"))
            await conn.execute(text("UPDATE standard_field_versions SET status='active',approved_by=7,approved_at=now(),approval_reason='isolated' WHERE id=:id"), {"id": index})
            await conn.execute(text("UPDATE standard_field_bindings SET standard_field_version_id=:version, observed_data_type='string' WHERE id=:id"), {"version": index, "id": binding_id})
        reflected = await conn.run_sync(lambda sync: Table("allocation_fact", MetaData(), autoload_with=sync))
    old = models.DATA_TABLES["allocation_fact"]
    models.DATA_TABLES["allocation_fact"] = _make_model_from_table("allocation_fact", reflected)
    try:
        contract = _s_contract()
        contract.model_snapshot["outputs"][-1]["data_type"] = "string"
        request = _s_request(plan=ExecutionPlanIn(output_fields=["cc_code", "amount"], group_by=["cc_code"], aggregations={"amount": aggregation}))
        async with factory() as db:
            statement, issues = await d_execution.compile_allocation_fact_s_select_for_user(
                contract=contract, request=request, user=SimpleNamespace(id=7), db=db)
            assert statement is None
            assert "s_execution_aggregation_type_invalid" in {issue["code"] for issue in issues}
    finally:
        models.DATA_TABLES["allocation_fact"] = old


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("authorization,expected_total", [("org", 400), ("cc", 300), ("both", 600), ("none", None)])
async def test_postgres_s_count_preview_and_export_share_result(postgres_d_fact, authorization, expected_total):
    from types import SimpleNamespace
    from sqlalchemy import text
    from app.datasets import d_execution
    from app.scopes.models import UserScopeTag
    engine, factory, _ = postgres_d_fact
    retained = {"org": [1], "cc": [2], "both": [1, 2], "none": []}[authorization]
    async with engine.begin() as conn:
        await conn.execute(UserScopeTag.__table__.delete().where(UserScopeTag.tag_id.not_in(retained)))
    request = _s_request(plan=ExecutionPlanIn(output_fields=["department", "cc_code", "amount"],
        group_by=["cc_code", "department"], aggregations={"amount": "sum"}))
    async with factory() as db:
        statements, issues = await d_execution.compile_allocation_fact_s_result_statements_for_user(
            contract=_s_contract(), request=request, user=SimpleNamespace(id=7), db=db, page=1, page_size=1)
        if expected_total is None:
            assert statements is None and issues
            return
        assert issues == []
        exported = (await db.execute(statements["export"])).all()
        assert sum(row.amount for row in exported) == expected_total
        assert await db.scalar(statements["count"]) == len(exported)
        assert (await db.execute(statements["preview"])).all() == exported[:1]
        assert list(statements["export"].selected_columns.keys()) == request.plan.output_fields
        second, issues = await d_execution.compile_allocation_fact_s_result_statements_for_user(
            contract=_s_contract(), request=request, user=SimpleNamespace(id=7), db=db, page=2, page_size=1)
        assert issues == []
        assert (await db.execute(second["preview"])).all() == exported[1:2]
        unpaged, issues = await d_execution.compile_allocation_fact_s_result_statements_for_user(
            contract=_s_contract(), request=request, user=SimpleNamespace(id=7), db=db, page_size=0)
        assert issues == []
        assert (await db.execute(unpaged["preview"])).all() == exported


@pytest.mark.asyncio
@pytest.mark.parametrize("page,size", [(0, 1), (1, -1), (1, 1001), (True, 1), (1, "10")])
async def test_s_result_adapter_rejects_invalid_pagination_before_compile(page, size):
    from app.datasets import d_execution
    statements, issues = await d_execution.compile_allocation_fact_s_result_statements_for_user(
        contract=None, request=None, user=None, db=None, page=page, page_size=size)
    assert statements is None and issues[0]["code"] == "s_execution_pagination_invalid"


@pytest.mark.asyncio
async def test_s_dataset_result_stays_closed_when_readiness_blocks(monkeypatch):
    from types import SimpleNamespace
    from app.datasets import d_execution
    from app.datasets.authorization_contract import AuthorizationExecutionReadinessOut
    async def blocked(db, dataset_id, user):
        return AuthorizationExecutionReadinessOut(dataset_id=dataset_id, contract_id=None, contract_version=None,
            eligible=False, paths=[], issues=[{"code": "sql_compiler_not_integrated", "message": "blocked"}],
            checked_areas=[], unchecked_areas=["sql_compiler"])
    monkeypatch.setattr("app.datasets.authorization_contract.execution_readiness", blocked)
    statement, issues = await d_execution.compile_allocation_fact_s_select_for_dataset(
        db=None, user=SimpleNamespace(id=7), request=_s_request())
    assert statement is None and issues[0]["code"] == "sql_compiler_not_integrated"


def test_person_fact_d_execution_accepts_bound_detail_plan():
    result = validate_person_fact_d_execution(_contract(), _request())

    assert result.eligible is True
    assert result.shape == "detail"
    assert result.detail_path == "person_scope"
    assert result.runtime_enabled is False
    assert result.issues == []


def test_person_fact_d_execution_fails_closed_when_contract_or_plan_binding_differs():
    result = validate_person_fact_d_execution(
        _contract(),
        _request(dataset_id=8, contract_version=2),
    )

    assert result.eligible is False
    assert result.shape == "blocked"
    assert {
        issue["code"] for issue in result.issues
    } >= {"execution_dataset_mismatch", "execution_contract_version_mismatch"}


def test_person_fact_d_execution_hides_contract_parse_errors():
    result = validate_person_fact_d_execution({"status": "active"}, _request())

    assert result.eligible is False
    assert result.issues == [{
        "code": "authorization_contract_invalid",
        "message": "授权合同快照未通过服务端校验",
    }]


def test_person_fact_d_execution_rejects_inactive_contract_and_runtime_enablement():
    result = validate_person_fact_d_execution(
        _contract(status="draft", runtime_enabled=True),
        _request(),
    )

    assert result.eligible is False
    assert {
        issue["code"] for issue in result.issues
    } >= {"authorization_contract_not_active", "runtime_enablement_forbidden"}
    assert result.runtime_enabled is False


def test_person_fact_d_execution_rejects_join_and_non_person_roles():
    definition = ProductAuthorizationDefinition.model_validate({
        "facts": [
            {"alias": "person", "table_name": "person_fact", "fact_key": "fact_id", "employee_key": "employee_no", "role": "person_fact"},
            {"alias": "ref", "table_name": "employee_ref", "fact_key": "id", "role": "reference"},
        ],
        "output_fields": ["employee_no", "amount"],
        "dimensions": ["employee_no"],
        "measures": ["amount"],
    })
    contract = _contract(definition=definition, model_snapshot={
        "tables": [
            {"id": 1, "table_name": "person_fact", "alias": "person"},
            {"id": 2, "table_name": "employee_ref", "alias": "ref"},
        ],
        "relations": [{"id": 1}],
        "outputs": [],
    })

    result = validate_person_fact_d_execution(contract, _request())

    assert result.eligible is False
    assert {issue["code"] for issue in result.issues} >= {
        "d_execution_requires_one_fact",
        "d_execution_requires_one_table",
        "d_execution_join_forbidden",
    }


def test_person_fact_d_execution_rejects_summary_and_unknown_fields():
    request = _request(plan=ExecutionPlanIn(
        output_fields=["employee_no", "amount"],
        group_by=["employee_no"],
        aggregations={"amount": "sum"},
    ))
    result = validate_person_fact_d_execution(_contract(), request)

    assert result.eligible is False
    assert "d_execution_summary_forbidden" in {issue["code"] for issue in result.issues}


@pytest.mark.asyncio
async def test_person_fact_d_membership_uses_roster_scope_and_rejects_unrestricted(monkeypatch):
    from types import SimpleNamespace
    from sqlalchemy import BigInteger, Column, MetaData, String, Table
    from app.data import models
    from app.data.dynamic_loader import _make_model_from_table
    from app.datasets import d_execution

    roster_table = Table("emp_realtime_roster", MetaData(), Column("id", BigInteger, primary_key=True), Column("employee_no", String), Column("org_node_code", String))
    fact_table = Table("person_fact", MetaData(), Column("id", BigInteger, primary_key=True), Column("employee_no", String), Column("amount", String))
    old_roster = models.DATA_TABLES.get("emp_realtime_roster")
    old_fact = models.DATA_TABLES.get("person_fact")
    models.DATA_TABLES["emp_realtime_roster"] = _make_model_from_table("emp_realtime_roster", roster_table)
    models.DATA_TABLES["person_fact"] = _make_model_from_table("person_fact", fact_table)
    fact = SimpleNamespace(table_name="person_fact", role="person_fact", employee_key="employee_no", allow_cost_center_summary=False, cost_center_key=None)
    try:
        async def restricted(*args, **kwargs):
            from sqlalchemy import true
            return true()
        monkeypatch.setattr("app.permissions.scope_filter.build_scope_filter", restricted)
        clause, issues = await d_execution.compile_person_fact_d_membership(user=SimpleNamespace(id=7), fact=fact, db=object())
        assert clause is None and issues[0]["code"] == "d_execution_membership_unrestricted"
    finally:
        if old_roster is None:
            models.DATA_TABLES.pop("emp_realtime_roster", None)
        else:
            models.DATA_TABLES["emp_realtime_roster"] = old_roster
        if old_fact is None:
            models.DATA_TABLES.pop("person_fact", None)
        else:
            models.DATA_TABLES["person_fact"] = old_fact


@pytest.mark.asyncio
async def test_person_fact_d_select_for_user_rejects_hidden_columns_before_membership(monkeypatch):
    from sqlalchemy import BigInteger, Column, MetaData, String, Table
    from app.data import models
    from app.data.dynamic_loader import _make_model_from_table
    from app.datasets import d_execution

    table = Table("person_fact_user", MetaData(), Column("id", BigInteger, primary_key=True), Column("employee_no", String), Column("amount", String))
    model = _make_model_from_table("person_fact_user", table)
    old_model = models.DATA_TABLES.get("person_fact_user")
    models.DATA_TABLES["person_fact_user"] = model
    contract = _contract()
    contract = DExecutionContractSnapshot(contract_id=contract.contract_id, dataset_id=contract.dataset_id,
        contract_version=contract.contract_version, status=contract.status,
        definition=ProductAuthorizationDefinition.model_validate({**contract.definition.model_dump(), "facts": [{"alias": "person", "table_name": "person_fact_user", "fact_key": "id", "employee_key": "employee_no", "role": "person_fact"}], "internal_fields": ["person.id"]}),
        model_snapshot={**contract.model_snapshot, "tables": [{"id": 1, "table_name": "person_fact_user", "alias": "person"}]}, runtime_enabled=False)
    async def hidden(*args, **kwargs):
        return {"amount"}
    async def membership(*args, **kwargs):
        return model.__table__.c.employee_no == "A001", []
    class FakeSession:
        async def execute(self, statement):
            from types import SimpleNamespace
            columns = [SimpleNamespace(column_code="id", is_sensitive=False, is_visible=True),
                       SimpleNamespace(column_code="employee_no", is_sensitive=False, is_visible=True),
                       SimpleNamespace(column_code="amount", is_sensitive=False, is_visible=True)]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: columns))

    monkeypatch.setattr("app.permissions.masker.get_hidden_columns", hidden)
    monkeypatch.setattr(d_execution, "compile_person_fact_d_membership", membership)
    try:
        statement, issues = await d_execution.compile_person_fact_d_select_for_user(contract=contract, request=_request(), user=object(), db=FakeSession())
        assert statement is None and issues[0]["code"] == "d_execution_hidden_field_forbidden"
    finally:
        if old_model is None:
            models.DATA_TABLES.pop("person_fact_user", None)
        else:
            models.DATA_TABLES["person_fact_user"] = old_model


@pytest.mark.asyncio
async def test_person_fact_d_select_for_user_rejects_missing_physical_metadata(monkeypatch):
    from sqlalchemy import BigInteger, Column, MetaData, String, Table
    from types import SimpleNamespace
    from app.data import models
    from app.data.dynamic_loader import _make_model_from_table
    from app.datasets import d_execution

    table = Table("person_fact_missing_meta", MetaData(), Column("id", BigInteger, primary_key=True),
                  Column("employee_no", String), Column("amount", String))
    model = _make_model_from_table("person_fact_missing_meta", table)
    old_model = models.DATA_TABLES.get("person_fact_missing_meta")
    models.DATA_TABLES["person_fact_missing_meta"] = model
    base = _contract()
    contract = DExecutionContractSnapshot(contract_id=base.contract_id, dataset_id=base.dataset_id,
        contract_version=base.contract_version, status=base.status,
        definition=ProductAuthorizationDefinition.model_validate({**base.definition.model_dump(),
            "facts": [{"alias": "person", "table_name": "person_fact_missing_meta", "fact_key": "id", "employee_key": "employee_no", "role": "person_fact"}],
            "internal_fields": ["person.id"]}),
        model_snapshot={**base.model_snapshot, "tables": [{"id": 1, "table_name": "person_fact_missing_meta", "alias": "person"}]})
    class FakeSession:
        async def execute(self, statement):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [
                SimpleNamespace(column_code="employee_no", is_sensitive=False, is_visible=True)]))
    try:
        statement, issues = await d_execution.compile_person_fact_d_select_for_user(
            contract=contract, request=_request(), user=SimpleNamespace(id=7), db=FakeSession())
        assert statement is None and issues[0]["code"] == "d_execution_column_metadata_missing"
    finally:
        if old_model is None:
            models.DATA_TABLES.pop("person_fact_missing_meta", None)
        else:
            models.DATA_TABLES["person_fact_missing_meta"] = old_model


@pytest.mark.asyncio
async def test_person_fact_d_dataset_compiler_stays_blocked_before_business_select(monkeypatch):
    from types import SimpleNamespace
    from app.datasets import d_execution
    from app.datasets.authorization_contract import AuthorizationExecutionReadinessOut

    async def blocked(db, dataset_id, user):
        assert dataset_id == 7
        return AuthorizationExecutionReadinessOut(dataset_id=7, contract_id=None, contract_version=None,
            eligible=False, paths=[], issues=[{"code": "sql_compiler_not_integrated", "message": "暂未接入执行"}],
            checked_areas=["dataset_acl"], unchecked_areas=["sql_compiler"])
    async def should_not_compile(**kwargs):
        raise AssertionError("不得在readiness阻断时进入业务投影")
    monkeypatch.setattr("app.datasets.authorization_contract.execution_readiness", blocked)
    monkeypatch.setattr(d_execution, "compile_person_fact_d_select_for_user", should_not_compile)
    statement, issues = await d_execution.compile_person_fact_d_select_for_dataset(
        db=object(), user=SimpleNamespace(id=7), request=_request())
    assert statement is None and issues[0]["code"] == "sql_compiler_not_integrated"


def test_person_fact_d_execution_rejects_unbound_plan_field():
    result = validate_person_fact_d_execution(
        _contract(),
        _request(plan=ExecutionPlanIn(output_fields=["employee_no", "secret"])),
    )
    assert result.eligible is False
    assert result.issues[0]["code"] == "d_execution_field_not_allowed"


@pytest.mark.asyncio
async def test_person_fact_d_scope_reuses_existing_scope_filter_and_fails_closed(monkeypatch):
    from sqlalchemy import true
    from app.datasets import d_execution

    calls = []

    async def fake_scope_filter(user, table, db, strategy=None, table_alias=None):
        calls.append((user, table, strategy, table_alias))
        return true()

    monkeypatch.setattr("app.permissions.scope_filter.build_scope_filter", fake_scope_filter)
    clause, issues = await d_execution.compile_person_fact_d_scope(
        user="user", table="person_fact", model=object(), db="db", table_alias="person"
    )
    assert clause is not None and issues == []
    assert calls == [("user", "person_fact", "person_first", "person")]

    async def denied_scope_filter(*args, **kwargs):
        from sqlalchemy import false
        return false()

    monkeypatch.setattr("app.permissions.scope_filter.build_scope_filter", denied_scope_filter)
    clause, issues = await d_execution.compile_person_fact_d_scope(
        user="user", table="person_fact", model=object(), db="db"
    )
    assert clause is None and issues[0]["code"] == "d_execution_scope_denied"


@pytest_asyncio.fixture
async def postgres_d_fact(postgres_standard_catalog, monkeypatch):
    from sqlalchemy import BigInteger, Column, MetaData, Numeric, String, Table
    from app.data import models
    from app.data.dynamic_loader import _make_model_from_table
    from app.field_category.models import (
        FieldCategoryAssignment, FieldCategoryToolWhitelist,
        RoleVisibleCategory, UserVisibleCategory,
    )
    from app.scopes.models import ScopeTag, ScopeTagFilter, ScopeTagSelection, UserScopeTag

    engine, factory, _ = postgres_standard_catalog
    metadata = MetaData()
    models.RegisteredTable.__table__.to_metadata(metadata)
    for model in (models.TableColumn, models.OrgNode, models.CostCenterNode):
        model.__table__.to_metadata(metadata)
    from app.users.models import User, Role
    User.__table__.to_metadata(metadata)
    Role.__table__.to_metadata(metadata)
    from app.field_category.models import FieldCategory
    FieldCategory.__table__.to_metadata(metadata)
    for model in (ScopeTag, ScopeTagFilter, ScopeTagSelection, UserScopeTag,
                  FieldCategoryAssignment, FieldCategoryToolWhitelist,
                  RoleVisibleCategory, UserVisibleCategory):
        model.__table__.to_metadata(metadata)
    roster = Table("emp_realtime_roster", metadata,
        Column("id", BigInteger, primary_key=True), Column("employee_no", String),
        Column("org_node_code", String))
    fact = Table("person_fact", metadata,
        Column("fact_id", BigInteger, primary_key=True), Column("employee_no", String),
        Column("amount", Numeric), Column("cc_code", String))
    allocation = Table("allocation_fact", metadata,
        Column("fact_id", BigInteger, primary_key=True), Column("employee_no", String),
        Column("amount", Numeric), Column("cc_code", String), Column("department", String))
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
        await conn.execute(models.RegisteredTable.__table__.insert().values(
            id=32, table_name="allocation_fact", table_label="Allocation", warehouse_layer="DWD",
            roster_join_col="employee_no", scope_strategy="cross_filter",
        ))
        await conn.execute(models.OrgNode.__table__.insert(), [
            {"id": 1, "code": "O1", "name": "Unit_1%", "path": "/Unit_1%/", "level": 1, "parent_id": None, "is_active": True},
            {"id": 2, "code": "O1C", "name": "Child", "path": "/Unit_1%/Child/", "level": 2, "parent_id": 1, "is_active": True},
            {"id": 3, "code": "O2", "name": "UnitX1X", "path": "/UnitX1X/", "level": 1, "parent_id": None, "is_active": True},
            {"id": 4, "code": "OFF", "name": "Inactive", "path": "/Unit_1%/Inactive/", "level": 2, "parent_id": 1, "is_active": False},
        ])
        await conn.execute(models.CostCenterNode.__table__.insert().values(
            id=1, code="CC1", name="Center1", path="/Center1/", level=1, is_active=True))
        await conn.execute(ScopeTag.__table__.insert(), [
            {"id": 1, "name": "org_test", "dimension": "org"},
            {"id": 2, "name": "center_test", "dimension": "cost_center"},
        ])
        await conn.execute(ScopeTagSelection.__table__.insert(), [
            {"id": 1, "tag_id": 1, "node_id": 1, "include_descendants": True},
            {"id": 2, "tag_id": 2, "node_id": 1, "include_descendants": False},
        ])
        await conn.execute(UserScopeTag.__table__.insert(), [{"user_id": 7, "tag_id": 1}, {"user_id": 7, "tag_id": 2}])
        await conn.execute(models.TableColumn.__table__.insert(), [
            {"table_name": "emp_realtime_roster", "column_code": "employee_no", "column_label": "Employee", "data_type": "string", "scope_role": None},
            {"table_name": "emp_realtime_roster", "column_code": "org_node_code", "column_label": "Org", "data_type": "string", "scope_role": "org_node_code"},
            {"table_name": "person_fact", "column_code": "fact_id", "column_label": "Fact", "data_type": "number", "scope_role": None},
            {"table_name": "person_fact", "column_code": "employee_no", "column_label": "Employee", "data_type": "string", "scope_role": None},
            {"table_name": "person_fact", "column_code": "amount", "column_label": "Amount", "data_type": "number", "scope_role": None},
            {"table_name": "allocation_fact", "column_code": "fact_id", "column_label": "Fact", "data_type": "number", "scope_role": None},
            {"table_name": "allocation_fact", "column_code": "employee_no", "column_label": "Employee", "data_type": "string", "scope_role": None},
            {"table_name": "allocation_fact", "column_code": "cc_code", "column_label": "Center", "data_type": "string", "scope_role": "cc_code"},
            {"table_name": "allocation_fact", "column_code": "department", "column_label": "Department", "data_type": "string", "scope_role": None},
            {"table_name": "allocation_fact", "column_code": "amount", "column_label": "Amount", "data_type": "number", "scope_role": None},
        ])
        from datetime import datetime, timezone
        from sqlalchemy import select
        from app.warehouse.service.standard_fields import _physical_source_identity
        now = datetime.now(timezone.utc)
        from app.datasets.models import DataSet, DataSetTable, DatasetOutputField
        await conn.execute(DataSet.__table__.insert().values(
            id=7, name="allocation_product", status="published", version=1))
        await conn.execute(DataSetTable.__table__.insert().values(
            id=2, dataset_id=7, table_name="allocation_fact", alias="allocation"))
        for index, code in enumerate(("cc_code", "department", "amount"), 100):
            column = (await conn.execute(select(models.TableColumn.__table__).where(
                models.TableColumn.table_name == "allocation_fact", models.TableColumn.column_code == code))).mappings().one()
            await conn.execute(models.StandardField.__table__.insert().values(
                id=index, field_code=code, created_by=7))
            await conn.execute(models.StandardFieldVersion.__table__.insert().values(
                id=index, standard_field_id=index, version=1, field_name=code, business_definition=code,
                data_type=column["data_type"], grain_level=None if code == "amount" else "coarse",
                permission_domain="public", owner_user_id=7, created_by=7, status="active",
                approved_by=7, approved_at=now, approval_reason="isolated semantic approval"))
            await conn.execute(models.StandardFieldBinding.__table__.insert().values(
                id=index, table_column_id=column["id"], standard_field_version_id=index,
                status="confirmed", binding_version=1, created_by=7, confirmed_by=7, confirmed_at=now,
                observed_source_field_id=_physical_source_identity("allocation_fact", code),
                observed_data_type=column["data_type"]))
            output_id = index - 69
            await conn.execute(DatasetOutputField.__table__.insert().values(
                id=output_id, dataset_id=7, source_alias="allocation", source_column=code,
                output_code=code, output_label=code, data_type=column["data_type"], is_visible=True, is_sensitive=False))
            await conn.execute(models.StandardField.__table__.insert().values(
                id=index + 100, field_code=f"output_{code}", created_by=7))
            await conn.execute(models.StandardFieldVersion.__table__.insert().values(
                id=index + 100, standard_field_id=index + 100, version=1, field_name=code,
                business_definition=f"Output {code}", data_type=column["data_type"],
                grain_level=None if code == "amount" else "coarse", permission_domain="public",
                owner_user_id=7, created_by=7, status="active", approved_by=7, approved_at=now,
                approval_reason="isolated output approval"))
            await conn.execute(models.StandardFieldBinding.__table__.insert().values(
                id=index + 100, dataset_output_field_id=output_id, standard_field_version_id=index + 100,
                status="confirmed", binding_version=1, created_by=7, confirmed_by=7, confirmed_at=now,
                observed_source_field_id=_physical_source_identity("allocation_fact", code),
                observed_data_type=column["data_type"]))
        await conn.execute(roster.insert(), [
            {"id": 1, "employee_no": "A", "org_node_code": "O1"},
            {"id": 2, "employee_no": "B", "org_node_code": "O2"},
            {"id": 3, "employee_no": "C", "org_node_code": "O1C"},
            {"id": 4, "employee_no": "D", "org_node_code": "OFF"},
        ])
        await conn.execute(fact.insert(), [
            {"fact_id": 1, "employee_no": "A", "amount": 100, "cc_code": "CC1"},
            {"fact_id": 2, "employee_no": "B", "amount": 200, "cc_code": "CC1"},
            {"fact_id": 3, "employee_no": "C", "amount": 300, "cc_code": "CC2"},
            {"fact_id": 4, "employee_no": "D", "amount": 900, "cc_code": "CC1"},
        ])
        await conn.execute(allocation.insert(), [
            {"fact_id": 1, "employee_no": "A", "amount": 100, "cc_code": "CC1", "department": "O1"},
            {"fact_id": 2, "employee_no": "B", "amount": 200, "cc_code": "CC1", "department": "O2"},
            {"fact_id": 3, "employee_no": "C", "amount": 300, "cc_code": "CC2", "department": "O1"},
        ])
    monkeypatch.setitem(models.DATA_TABLES, "emp_realtime_roster", _make_model_from_table("emp_realtime_roster", roster))
    monkeypatch.setitem(models.DATA_TABLES, "person_fact", _make_model_from_table("person_fact", fact))
    monkeypatch.setitem(models.DATA_TABLES, "allocation_fact", _make_model_from_table("allocation_fact", allocation))
    contract = _contract()
    for output in contract.model_snapshot["outputs"]:
        output.update(is_visible=True, is_sensitive=False,
                      data_type="number" if output["output_code"] == "amount" else "string")
    yield engine, factory, contract


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("authorization,total", [("org", 400), ("cc", 300), ("both", 600), ("none", None)])
@pytest.mark.parametrize("multidimensional", [False, True])
async def test_postgres_s_projection_union_scope_dedupes_overlapping_fact_rows(
        postgres_d_fact, authorization, total, multidimensional):
    from types import SimpleNamespace
    from app.datasets import d_execution

    engine, factory, _ = postgres_d_fact
    contract = _s_contract()

    from sqlalchemy import text, func, select
    retained = {"org": [1], "cc": [2], "both": [1, 2], "none": []}[authorization]
    from app.scopes.models import UserScopeTag
    async with engine.begin() as conn:
        await conn.execute(UserScopeTag.__table__.delete().where(UserScopeTag.tag_id.not_in(retained)))
    groups = ["cc_code", "department"] if multidimensional else ["cc_code"]
    request = _s_request(plan=ExecutionPlanIn(
        output_fields=[*groups, "amount"], group_by=groups, aggregations={"amount": "sum"}))
    async with factory() as db:
        statement, issues = await d_execution.compile_allocation_fact_s_select_for_user(
            contract=contract, request=request, user=SimpleNamespace(id=7), db=db)
        if total is None:
            assert statement is None and issues[0]["code"] == "s_execution_scope_denied"
            return
        assert issues == [] and statement is not None
        rows = (await db.execute(statement)).all()
        assert sum(row.amount for row in rows) == total
        count = await db.scalar(select(func.count()).select_from(statement.subquery()))
        assert count == len(rows)
        page = (await db.execute(statement.limit(1))).all()
        assert len(page) == 1
        if authorization == "cc" and multidimensional:
            assert {(row.department, row.amount) for row in rows} == {("O1", 100), ("O2", 200)}
        if authorization == "both" and not multidimensional:
            assert {row.cc_code: row.amount for row in rows} == {"CC1": 300, "CC2": 300}


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("with_center_scope", [False, True])
async def test_postgres_d_projection_personnel_membership_and_revocation(postgres_d_fact, with_center_scope):
    from types import SimpleNamespace
    from sqlalchemy import text
    from app.datasets.d_execution import compile_person_fact_d_select_for_user

    engine, factory, contract = postgres_d_fact
    if not with_center_scope:
        async with engine.begin() as conn:
            await conn.execute(text("DELETE FROM user_scope_tags WHERE user_id=7 AND tag_id=2"))
    async with factory() as db:
        statement, issues = await compile_person_fact_d_select_for_user(
            contract=contract, request=_request(), user=SimpleNamespace(id=7), db=db)
        assert issues == [] and statement is not None
        rows = (await db.execute(statement)).all()
        assert {row.employee_no for row in rows} == {"A", "C"}
        assert sum(row.amount for row in rows) == 400
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM user_scope_tags WHERE user_id=7 AND tag_id=1"))
    async with factory() as db:
        statement, issues = await compile_person_fact_d_select_for_user(
            contract=contract, request=_request(), user=SimpleNamespace(id=7), db=db)
        assert statement is None
        assert issues[0]["code"] == "d_execution_scope_denied"


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
@pytest.mark.parametrize("restriction", ["classification", "sensitive", "invisible"])
async def test_postgres_d_projection_rechecks_current_field_protection(postgres_d_fact, restriction):
    from types import SimpleNamespace
    from sqlalchemy import text
    from app.datasets.d_execution import compile_person_fact_d_select_for_user

    engine, factory, contract = postgres_d_fact
    async with engine.begin() as conn:
        if restriction == "classification":
            await conn.execute(text("INSERT INTO field_category_assignments(category_id,table_name,column_name) VALUES(9,'person_fact','amount')"))
        elif restriction == "sensitive":
            await conn.execute(text("UPDATE table_columns SET is_sensitive=true WHERE table_name='person_fact' AND column_code='amount'"))
        else:
            await conn.execute(text("UPDATE table_columns SET is_visible=false WHERE table_name='person_fact' AND column_code='amount'"))
    async with factory() as db:
        statement, issues = await compile_person_fact_d_select_for_user(
            contract=contract, request=_request(), user=SimpleNamespace(id=7), db=db)
        assert statement is None
        assert issues[0]["code"] == "d_execution_hidden_field_forbidden"


# ==================== 5.1 受控业务筛选（合同批准字段+操作符） ====================

def _s_definition_with_filters(**overrides):
    payload = {
        "facts": [{"alias": "allocation", "table_name": "allocation_fact", "fact_key": "fact_id",
                   "employee_key": "employee_no", "cost_center_key": "cc_code",
                   "allow_cost_center_summary": True, "role": "allocation_fact"}],
        "output_fields": ["cc_code", "department", "amount"],
        "dimensions": ["cc_code", "department"], "measures": ["amount"],
        "internal_fields": ["allocation.fact_id", "allocation.employee_no"],
    }
    payload.update(overrides)
    return ProductAuthorizationDefinition.model_validate(payload)


def _s_plan(**overrides):
    values = {"output_fields": ["cc_code", "amount"], "group_by": ["cc_code"],
              "aggregations": {"amount": "sum"}}
    values.update(overrides)
    return ExecutionPlanIn(**values)


def test_s_execution_accepts_contract_approved_filter():
    contract = _s_contract(definition=_s_definition_with_filters(
        approved_filters=[{"field": "department", "operators": ["eq", "in"]}]))
    result = validate_allocation_fact_s_execution(contract, _s_request(plan=_s_plan(
        conditions=[{"field": "department", "operator": "eq", "value": "组织1"}])))
    assert result.eligible is True


def test_s_execution_rejects_unapproved_filter_field():
    contract = _s_contract(definition=_s_definition_with_filters())
    result = validate_allocation_fact_s_execution(contract, _s_request(plan=_s_plan(
        conditions=[{"field": "department", "operator": "eq", "value": "组织1"}])))
    assert result.eligible is False
    assert any(issue["code"] == "s_execution_filter_not_approved" for issue in result.issues)


def test_s_execution_rejects_unapproved_filter_operator():
    contract = _s_contract(definition=_s_definition_with_filters(
        approved_filters=[{"field": "department", "operators": ["eq"]}]))
    result = validate_allocation_fact_s_execution(contract, _s_request(plan=_s_plan(
        conditions=[{"field": "department", "operator": "in", "value": ["组织1"]}])))
    assert result.eligible is False
    assert any(issue["code"] == "s_execution_filter_not_approved" for issue in result.issues)


def test_s_execution_rejects_invalid_filter_value_shape():
    contract = _s_contract(definition=_s_definition_with_filters(
        approved_filters=[{"field": "department", "operators": ["in", "between"]}]))
    bad_in = validate_allocation_fact_s_execution(contract, _s_request(plan=_s_plan(
        conditions=[{"field": "department", "operator": "in", "value": "组织1"}])))
    assert bad_in.eligible is False
    assert any(issue["code"] == "s_execution_filter_value_invalid" for issue in bad_in.issues)
    bad_between = validate_allocation_fact_s_execution(contract, _s_request(plan=_s_plan(
        conditions=[{"field": "department", "operator": "between", "value": ["a"]}])))
    assert bad_between.eligible is False


def test_contract_rejects_filter_on_measure_or_internal_field():
    with pytest.raises(ValueError):
        _s_definition_with_filters(approved_filters=[{"field": "amount", "operators": ["eq"]}])
    with pytest.raises(ValueError):
        _s_definition_with_filters(approved_filters=[{"field": "allocation.employee_no", "operators": ["eq"]}])


# ==================== schema 3：合同只声明事实与路径 ====================

def _schema3_definition(**overrides):
    payload = {
        "schema_version": 3,
        "facts": [{"alias": "allocation", "table_name": "allocation_fact", "fact_key": "fact_id",
                   "employee_key": "employee_no", "cost_center_key": "cc_code",
                   "allow_cost_center_summary": True, "role": "allocation_fact"}],
    }
    payload.update(overrides)
    return ProductAuthorizationDefinition.model_validate(payload)


def test_schema3_contract_rejects_field_whitelists():
    with pytest.raises(ValueError):
        _schema3_definition(output_fields=["cc_code"])
    with pytest.raises(ValueError):
        _schema3_definition(approved_filters=[{"field": "cc_code", "operators": ["eq"]}])


def test_schema3_derivation_keeps_cost_center_as_dimension():
    from app.datasets.authorization_contract import derived_summary_fields, approved_filter_map
    definition = _schema3_definition()
    outputs = [
        {"output_code": "cc_code", "source_column": "cc_code", "agg_role": "dimension"},
        {"output_code": "department", "source_column": "department", "agg_role": "dimension"},
        {"output_code": "amount", "source_column": "amount", "agg_role": "measure"},
        {"output_code": "employee_no", "source_column": "employee_no", "agg_role": "dimension"},
    ]
    derived = derived_summary_fields(definition, outputs)
    assert derived["identifying"] == {"employee_no"}
    assert set(derived["dimensions"]) == {"cc_code", "department"}
    assert derived["measures"] == ["amount"]
    approved = approved_filter_map(definition, outputs)
    assert set(approved) == {"cc_code", "department"}
    assert approved["cc_code"] == {"eq", "in", "gte", "lte", "between"}
