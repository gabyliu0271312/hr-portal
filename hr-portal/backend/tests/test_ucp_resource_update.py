from types import SimpleNamespace

import pytest

from app.ucp.models import UcpResource
from app.ucp.system_service import update_resource


pytestmark = pytest.mark.asyncio


class FakeSession:
    def __init__(self, resource):
        self.resource = resource
        self.committed = False
        self.refreshed = False

    async def get(self, model, resource_id):
        assert model is UcpResource
        assert resource_id == 1
        return self.resource

    async def commit(self):
        self.committed = True

    async def refresh(self, resource):
        assert resource is self.resource
        self.refreshed = True


def make_resource():
    return SimpleNamespace(
        resource_code="BEISEN_REPORT",
        resource_name="北森报表",
        connector_type="beisen_report",
        adapter_code="BEISEN_REPORT_PULL_ADAPTER",
        credential_id=1,
        status=0,
        protocol=None,
    )


async def test_update_resource_ignores_unchanged_inherited_fields():
    resource = make_resource()
    db = FakeSession(resource)

    updated = await update_resource(
        db,
        1,
        skip_schema_validation=True,
        status=1,
        resource_name="北森报表（已启用）",
        credential_id=2,
        connector_type="beisen_report",
        adapter_code="BEISEN_REPORT_PULL_ADAPTER",
    )

    assert updated is resource
    assert resource.status == 1
    assert resource.resource_name == "北森报表（已启用）"
    assert resource.credential_id == 2
    assert resource.connector_type == "beisen_report"
    assert resource.adapter_code == "BEISEN_REPORT_PULL_ADAPTER"
    assert db.committed is True
    assert db.refreshed is True


async def test_update_resource_rejects_changed_inherited_fields():
    db = FakeSession(make_resource())

    with pytest.raises(ValueError, match="RESOURCE_TEMPLATE_INHERITED_FIELDS_IMMUTABLE"):
        await update_resource(
            db,
            1,
            skip_schema_validation=True,
            connector_type="webhook_ingress",
        )

    assert db.committed is False
