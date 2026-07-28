from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.datasources import router


pytestmark = pytest.mark.asyncio


class FakeSession:
    def __init__(self, datasource, scalar_results):
        self.datasource = datasource
        self.scalar_results = iter(scalar_results)

    async def get(self, _model, _id):
        return self.datasource

    async def scalar(self, _statement):
        return next(self.scalar_results)


async def test_sync_rejects_unconfigured_field_period_table(monkeypatch):
    datasource = SimpleNamespace(id=1, table_name="ods_monthly", schedule="手动触发", is_active=True)
    table = SimpleNamespace(is_period=True, period_source="field", period_col="month")
    db = FakeSession(datasource, [table, None])

    with pytest.raises(HTTPException, match="发现字段并保存实际期间字段") as exc:
        await router.sync_datasource(1, SimpleNamespace(login_name="tester"), db)

    assert exc.value.status_code == 422


async def test_sync_allows_configured_field_period_table(monkeypatch):
    datasource = SimpleNamespace(id=1, table_name="ods_monthly", schedule="手动触发", is_active=True)
    table = SimpleNamespace(is_period=True, period_source="field", period_col="pay_month")
    db = FakeSession(datasource, [table, SimpleNamespace()])

    class Engine:
        async def run_job_now(self, *_args, **_kwargs):
            return SimpleNamespace(status="success", rows=2, message="ok", finished_at=None)

    async def fake_get_job(*_args):
        return SimpleNamespace(id=9)

    monkeypatch.setattr("app.scheduler.engine.get_engine", lambda: Engine())
    monkeypatch.setattr("app.scheduler.service.get_job_by_business", fake_get_job)

    result = await router.sync_datasource(1, SimpleNamespace(login_name="tester"), db)

    assert result.ok is True
    assert result.rows == 2
