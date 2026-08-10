from types import SimpleNamespace

import pytest

from app.automation.action_registry import _ensure_default_config, _reconcile_cleaning_mode
from app.data.models import RegisteredTable


pytestmark = pytest.mark.asyncio


class FakeResult:
    def __init__(self, value=None, rows=None):
        self.value = value
        self.rows = rows or []

    def scalar_one_or_none(self):
        return self.value

    def scalar(self):
        return self.value

    def all(self):
        return list(self.rows)

    def scalars(self):
        return self


class FakeSession:
    def __init__(self, results):
        self.results = list(results)
        self.added = []
        self.committed = False

    async def execute(self, statement, params=None):
        result = self.results.pop(0)
        if isinstance(result, FakeResult):
            return result
        return FakeResult(result)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed = True

    async def flush(self):
        pass


async def test_default_config_without_business_key_downgrades_to_full_refresh(monkeypatch):
    async def fake_detect_ods_config(table_name, db):
        return {
            "ods_sync_semantics": "incremental_upsert",
            "dwd_write_strategy": "incremental_upsert",
            "missing_row_strategy": "keep_history",
            "business_key_fields": None,
        }

    import app.warehouse.router as warehouse_router
    monkeypatch.setattr(warehouse_router, "_detect_ods_config", fake_detect_ods_config)

    db = FakeSession([
        FakeResult(RegisteredTable(table_name="dwd__d1_special_personnel_list")),
        FakeResult(0),
    ])

    config = await _ensure_default_config("ods__d1_special_personnel_list", db)

    assert config is not None
    assert config.ods_table_name == "ods__d1_special_personnel_list"
    assert config.target_dwd_table_name == "dwd__d1_special_personnel_list"
    assert config.update_mode == "passthrough"
    assert config.ods_sync_semantics == "full_snapshot"
    assert config.dwd_write_strategy == "full_refresh"
    assert config.business_key_fields is None
    assert config.missing_row_strategy == "hard_delete"
    assert config.enabled is True
    assert config.default_strategy == "full_snapshot+full_refresh"
    assert config.risk_decision == "warn"
    assert db.committed is True


async def test_reconcile_uses_enabled_cleaning_rules_without_overwriting_write_strategy():
    config = SimpleNamespace(
        update_mode="passthrough",
        standardization_rule_ids=None,
        standardization_rule_set_id=99,
        dwd_write_strategy="incremental_upsert",
    )
    db = FakeSession([FakeResult(rows=[6, 9])])

    rule_ids = await _reconcile_cleaning_mode(config, "emp_monthly_salary", db)

    assert rule_ids == [6, 9]
    assert config.update_mode == "cleaning_rule"
    assert config.standardization_rule_ids == [6, 9]
    assert config.standardization_rule_set_id is None
    assert config.dwd_write_strategy == "incremental_upsert"


async def test_reconcile_falls_back_to_passthrough_when_no_enabled_rules_remain():
    config = SimpleNamespace(
        update_mode="cleaning_rule",
        standardization_rule_ids=[6],
        standardization_rule_set_id=99,
        dwd_write_strategy="append",
    )
    db = FakeSession([FakeResult(rows=[])])

    rule_ids = await _reconcile_cleaning_mode(config, "emp_monthly_salary", db)

    assert rule_ids == []
    assert config.update_mode == "passthrough"
    assert config.standardization_rule_ids is None
    assert config.standardization_rule_set_id is None
    assert config.dwd_write_strategy == "append"
