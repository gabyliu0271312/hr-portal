from types import SimpleNamespace

import pytest

from app.ucp.models import UcpCredential, UcpResource
from app.ucp.system_service import resolve_resource_template_defaults, update_resource


pytestmark = pytest.mark.asyncio


class FakeSession:
    def __init__(self, resource):
        self.resource = resource
        self.committed = False
        self.refreshed = False

    async def get(self, model, resource_id):
        if model is UcpResource:
            assert resource_id == 1
            return self.resource
        if model is UcpCredential:
            return SimpleNamespace(auth_type="token")
        raise AssertionError(f"unexpected model: {model}")

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


async def test_resource_template_can_declare_a_stable_resource_code():
    template = SimpleNamespace(package_code="COST_ALLOCATION_LOCKED_INGRESS", package_name="周期锁定事件接收", system_schema={"resource_code": "cost-allocation-locked", "resource_name": "成本分摊系统 Webhook"})

    assert resolve_resource_template_defaults(template) == ("cost-allocation-locked", "成本分摊系统 Webhook")