from types import SimpleNamespace

import pytest
from sqlalchemy.dialects import postgresql

from app.scheduler.engine import SchedulerEngine
from app.warehouse.quality_engine import _ENGINE_MAP, execute_quality_rule
from app.warehouse.quality_service import _relation_dependency_tables


def test_relation_dependency_index_tracks_both_relation_tables():
    rule = SimpleNamespace(rule_type="relation_cardinality", rule_config={"relation_id": 251})
    relation = SimpleNamespace(id=251, left_alias="allocation", right_alias="factor")

    assert _relation_dependency_tables(
        rule, relation, {"allocation": "emp_monthly_allocation", "factor": "dwd_factor"}
    ) == {"emp_monthly_allocation", "dwd_factor"}


def test_relation_dependency_index_ignores_nonmatching_rule():
    rule = SimpleNamespace(rule_type="relation_cardinality", rule_config={"relation_id": 252})
    relation = SimpleNamespace(id=251, left_alias="left", right_alias="right")

    assert _relation_dependency_tables(rule, relation, {"left": "a", "right": "b"}) == set()


class _SessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, *args):
        return False


class _InternalJobDb:
    def __init__(self):
        self.statements = []
        self.commits = 0

    async def execute(self, statement):
        self.statements.append(statement)

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_internal_quality_queue_creation_is_atomic_upsert():
    db = _InternalJobDb()
    engine = SchedulerEngine(lambda: _SessionContext(db))

    await engine._ensure_internal_jobs()

    assert db.commits == 1
    assert len(db.statements) == 2
    sql = "\n".join(
        str(statement.compile(dialect=postgresql.dialect()))
        for statement in db.statements
    )
    assert sql.count("ON CONFLICT (kind, business_id) DO NOTHING") == 2
    assert db.statements[0].compile().params["kind"] == "quality_queue"
    assert db.statements[1].compile().params["kind"] == "cost_center_notification_queue"


@pytest.mark.asyncio
async def test_quality_execution_error_exposes_only_error_code(monkeypatch, caplog):
    async def explode(*args, **kwargs):
        raise RuntimeError('relation "salary" failed near SELECT secret_column')

    monkeypatch.setitem(_ENGINE_MAP, "not_null", explode)

    result = await execute_quality_rule(
        session=SimpleNamespace(),
        rule_id=99,
        asset_type="table",
        asset_code="emp_monthly_salary",
        rule_type="not_null",
        rule_config={"column": "employee_no"},
    )

    assert result["message"] == "QUALITY_EXECUTION_FAILED"
    assert "secret_column" not in result["message"]
    assert "secret_column" not in caplog.text
