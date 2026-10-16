import pytest

from app.datasets.authorization_contract import ProductAuthorizationDefinition
from app.datasets.d_execution import (
    DExecutionBindingIn,
    DExecutionContractSnapshot,
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


def _request(**overrides):
    values = {
        "dataset_id": 7,
        "contract_id": 11,
        "contract_version": 3,
        "plan": ExecutionPlanIn(output_fields=["employee_no", "amount"]),
    }
    values.update(overrides)
    return DExecutionBindingIn(**values)


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
