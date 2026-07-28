from types import SimpleNamespace

import pytest

from app.datasources import router


pytestmark = pytest.mark.asyncio


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    def __init__(self, insert_result, existing):
        self.insert_result = insert_result
        self.existing = existing
        self.committed = False

    async def execute(self, _statement):
        return FakeResult(self.insert_result)

    async def commit(self):
        self.committed = True

    async def scalar(self, _statement):
        return self.existing

    async def get(self, _model, _id):
        return self.existing


def body():
    return router.DataSourceCreateIn(table_name="ods_unique", table_label="唯一来源")


async def test_create_datasource_returns_existing_record_on_table_conflict():
    existing = SimpleNamespace(
        id=9, table_name="ods_unique", table_label="已有来源", source_type="upload",
        schedule="手动触发", settings={"kept": True}, secrets_encrypted={}, is_active=False,
        sync_semantics=None, write_strategy=None, missing_row_strategy=None,
        business_key_fields=[], last_sync_at=None, last_status="pending", last_rows=None,
        last_message=None,
    )
    response = SimpleNamespace(status_code=None)
    db = FakeSession(None, existing)

    result = await router.create_datasource(body(), response, SimpleNamespace(), db)

    assert db.committed is True
    assert response.status_code == 200
    assert result.id == 9
    assert result.settings == {"kept": True}


async def test_create_datasource_returns_new_record_when_insert_succeeds():
    created = SimpleNamespace(
        id=10, table_name="ods_unique", table_label="唯一来源", source_type="http_api",
        schedule="", settings={}, secrets_encrypted={}, is_active=True,
        sync_semantics=None, write_strategy=None, missing_row_strategy=None,
        business_key_fields=[], last_sync_at=None, last_status="pending", last_rows=None,
        last_message=None,
    )
    response = SimpleNamespace(status_code=None)
    db = FakeSession(10, created)

    result = await router.create_datasource(body(), response, SimpleNamespace(), db)

    assert db.committed is True
    assert result.id == 10
