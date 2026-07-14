from types import SimpleNamespace

import pytest

from app.automation.action_registry import _ensure_default_config
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
