import pytest

from app.datasources import sync_service


pytestmark = pytest.mark.asyncio


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalars(self):
        return self

    def all(self):
        return self.value


class FakeSession:
    def __init__(self, columns):
        self.columns = columns

    async def execute(self, _statement):
        return ScalarResult(self.columns)

    async def flush(self):
        pass


async def test_ensure_period_meta_rejects_missing_period_column(monkeypatch):
    monkeypatch.setitem(sync_service.PERIOD_TABLES, "period_meta_table", {
        "period_col": "pay_month", "period_source": "field",
    })

    with pytest.raises(RuntimeError, match="尚未注册为实体列"):
        await sync_service._ensure_period_meta("period_meta_table", FakeSession([]))


async def test_ensure_period_meta_marks_period_column_as_primary_key(monkeypatch):
    column = type("Column", (), {"is_pk_part": False, "display_order": 10})()
    monkeypatch.setitem(sync_service.PERIOD_TABLES, "period_meta_table", {
        "period_col": "pay_month", "period_source": "field",
    })

    await sync_service._ensure_period_meta("period_meta_table", FakeSession([column]))

    assert column.is_pk_part is True
    assert column.display_order == 0
