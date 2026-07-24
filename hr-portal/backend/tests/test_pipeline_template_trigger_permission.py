from types import SimpleNamespace

import pytest

from app.ucp.pipeline_engine import check_pipeline_trigger_permission


class _Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def all(self):
        return self.value


class _Session:
    def __init__(self, *results):
        self.results = iter(results)

    async def execute(self, _statement):
        return _Result(next(self.results))


@pytest.mark.asyncio
async def test_template_owner_can_trigger_without_persisted_pipeline_config():
    await check_pipeline_trigger_permission(
        _Session([], None, SimpleNamespace(created_by="admin")),
        "PENDING_HIRE_OFFER_ENRICHMENT",
        SimpleNamespace(id=1, login_name="admin", is_admin=False, is_superuser=False),
    )


@pytest.mark.asyncio
async def test_super_admin_role_can_trigger_pipeline():
    await check_pipeline_trigger_permission(
        _Session([("超级管理员",)]),
        "PENDING_HIRE_OFFER_ENRICHMENT",
        SimpleNamespace(id=1, login_name="admin", is_admin=False, is_superuser=False),
    )
