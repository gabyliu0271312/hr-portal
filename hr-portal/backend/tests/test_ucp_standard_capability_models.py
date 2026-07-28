from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.dialects import postgresql

from app.ucp.capability_discovery import list_standard_packages
from app.ucp.capability_dto import ConnectorPackageCreateDTO, SystemCapabilityCreateDTO
from app.ucp.capability_service import CapabilityDefinitionError, normalize_code
from app.ucp.models import UcpCapabilityTestRun, UcpConnectorPackage, UcpOperationDefinition, UcpSystemCapability
from app.ucp.routers.capabilities import _primary_credential, router as capabilities_router
import app.ucp.routers.capabilities as capabilities


def test_new_capability_models_keep_legacy_resource_model_untouched():
    assert UcpConnectorPackage.__tablename__ == "ucp_connector_package"
    assert UcpOperationDefinition.__tablename__ == "ucp_operation_definition"
    assert UcpSystemCapability.__tablename__ == "ucp_system_capability"
    assert UcpCapabilityTestRun.__tablename__ == "ucp_capability_test_run"


def test_capability_code_normalization():
    assert normalize_code("feishu_hiring", "package_code") == "FEISHU_HIRING"


@pytest.mark.parametrize("value", ["", "offer-query", "1OFFER"])
def test_capability_code_validation(value):
    with pytest.raises(CapabilityDefinitionError):
        normalize_code(value, "operation_code")


def test_safe_dto_defaults():
    assert ConnectorPackageCreateDTO(package_code="FEISHU_HIRING", package_name="飞书招聘").host_allowlist == []
    assert SystemCapabilityCreateDTO(system_id=1, operation_id=2).runtime_config == {}


class _PrimaryCredentialResult:
    def scalar_one_or_none(self):
        return None


class _CapturedCredentialSession:
    statement = None

    async def execute(self, statement):
        self.statement = statement
        return _PrimaryCredentialResult()


@pytest.mark.asyncio
async def test_primary_credential_uses_integer_active_flag_for_postgresql():
    db = _CapturedCredentialSession()

    assert await _primary_credential(db, 7) is None

    compiled = db.statement.compile(dialect=postgresql.dialect())
    sql = str(compiled).lower()
    assert "is_active is true" not in sql
    assert "is_active =" in sql
    assert 1 in compiled.params.values()
    assert 7 in compiled.params.values()
    assert "is_primary desc" in sql
    assert "id asc" in sql
    assert "limit" in sql


class _EmptyPackageResult:
    def scalars(self):
        return ()


class _CapturedPackageSession:
    statement = None

    async def execute(self, statement):
        self.statement = statement
        return _EmptyPackageResult()


@pytest.mark.asyncio
async def test_published_action_discovery_includes_controlled_api_packages():
    db = _CapturedPackageSession()

    assert await list_standard_packages(db) == []

    assert {"STANDARD_SAAS", "CONTROLLED_API"} == set(db.statement.compile().params["connection_mode_1"])


def test_system_scope_exposes_no_custom_operation_routes_or_switches():
    paths = {route.path for route in capabilities_router.routes}

    assert "/systems/{system_id}/custom-operations" not in paths
    assert "/systems/{system_id}/capabilities/{operation_id}" in paths
    source = (Path(__file__).resolve().parents[1] / "app/ucp/routers/capabilities.py").read_text(encoding="utf-8")
    assert "supports_custom_operations" not in source


def _package_operation(status: str, *, submitted_by_user_id: int | None = None):
    return SimpleNamespace(
        id=8, package_id=3, object_code="OFFER", operation_code="QUERY_BY_CANDIDATE_ID",
        operation_name="查询 Offer", adapter_code="GENERIC_HTTP_ACTION_ADAPTER", required_scopes=[],
        input_schema={}, output_schema={}, risk_level="read_low", version="1.0.0", status=status,
        source_type="PRESET", approval_status=status, executor_template_id=11,
        catalog_test_system_id=5,
        field_catalog=[], masking_rules={}, error_rules=[], sample_response=None,
        sample_schema_hash=None, last_tested_at=None, submitted_by_user_id=submitted_by_user_id,
        published_by_user_id=None,
    )


def _verified_capability():
    return SimpleNamespace(
        system_id=5, operation_id=8, credential_id=12, enabled=False,
        verification_status="VERIFIED", connection_status="CONNECTED",
    )


def _capability_result(capability):
    return SimpleNamespace(scalar_one_or_none=lambda: capability)


@pytest.mark.asyncio
async def test_tested_operation_publishes_without_duty_separation(monkeypatch):
    operation = _package_operation("TESTED", submitted_by_user_id=5)
    capability = _verified_capability()
    db = AsyncMock()
    db.get = AsyncMock(return_value=SimpleNamespace(template_code="OFFER_QUERY", version="1.2.0"))
    db.execute = AsyncMock(return_value=_capability_result(capability))
    monkeypatch.setattr(capabilities, "_package_by_code", AsyncMock(return_value=SimpleNamespace(id=3)))
    monkeypatch.setattr(capabilities, "_package_operation", AsyncMock(return_value=operation))
    publish_template = AsyncMock()
    monkeypatch.setattr(capabilities, "publish_template", publish_template)

    result = await capabilities.route_publish_package_operation("FEISHU_RECRUIT", 8, db, SimpleNamespace(id=5))

    publish_template.assert_awaited_once_with(db, "OFFER_QUERY", "package-operation")
    assert operation.status == operation.approval_status == "PUBLISHED"
    assert operation.version == "1.2.0"
    assert operation.published_by_user_id == 5
    assert capability.enabled is True
    assert result["status"] == "PUBLISHED"


@pytest.mark.asyncio
async def test_pending_approval_operation_remains_publishable_for_transition(monkeypatch):
    operation = _package_operation("PENDING_APPROVAL", submitted_by_user_id=5)
    capability = _verified_capability()
    db = AsyncMock()
    db.get = AsyncMock(return_value=SimpleNamespace(template_code="OFFER_QUERY", version="1.2.0"))
    db.execute = AsyncMock(return_value=_capability_result(capability))
    monkeypatch.setattr(capabilities, "_package_by_code", AsyncMock(return_value=SimpleNamespace(id=3)))
    monkeypatch.setattr(capabilities, "_package_operation", AsyncMock(return_value=operation))
    monkeypatch.setattr(capabilities, "publish_template", AsyncMock())

    await capabilities.route_publish_package_operation("FEISHU_RECRUIT", 8, db, SimpleNamespace(id=5))

    assert operation.status == operation.approval_status == "PUBLISHED"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["DRAFT", "FAILED", "DISABLED"])
async def test_unverified_operation_cannot_publish(monkeypatch, status):
    operation = _package_operation(status)
    db = AsyncMock()
    db.get = AsyncMock(return_value=SimpleNamespace(template_code="OFFER_QUERY", version="1.2.0"))
    monkeypatch.setattr(capabilities, "_package_by_code", AsyncMock(return_value=SimpleNamespace(id=3)))
    monkeypatch.setattr(capabilities, "_package_operation", AsyncMock(return_value=operation))
    publish_template = AsyncMock()
    monkeypatch.setattr(capabilities, "publish_template", publish_template)

    with pytest.raises(capabilities.HTTPException) as error:
        await capabilities.route_publish_package_operation("FEISHU_RECRUIT", 8, db, SimpleNamespace(id=5))

    assert error.value.status_code == 409
    publish_template.assert_not_awaited()


@pytest.mark.asyncio
async def test_publish_requires_verified_catalog_test_capability(monkeypatch):
    operation = _package_operation("TESTED")
    capability = _verified_capability()
    capability.verification_status = "FAILED"
    db = AsyncMock()
    db.get = AsyncMock(return_value=SimpleNamespace(template_code="OFFER_QUERY", version="1.2.0"))
    db.execute = AsyncMock(return_value=_capability_result(capability))
    monkeypatch.setattr(capabilities, "_package_by_code", AsyncMock(return_value=SimpleNamespace(id=3)))
    monkeypatch.setattr(capabilities, "_package_operation", AsyncMock(return_value=operation))
    publish_template = AsyncMock()
    monkeypatch.setattr(capabilities, "publish_template", publish_template)

    with pytest.raises(capabilities.HTTPException) as error:
        await capabilities.route_publish_package_operation("FEISHU_RECRUIT", 8, db, SimpleNamespace(id=5))

    assert error.value.status_code == 409
    publish_template.assert_not_awaited()


@pytest.mark.asyncio
async def test_publish_requires_catalog_test_system(monkeypatch):
    operation = _package_operation("TESTED")
    operation.catalog_test_system_id = None
    db = AsyncMock()
    db.get = AsyncMock(return_value=SimpleNamespace(template_code="OFFER_QUERY", version="1.2.0"))
    monkeypatch.setattr(capabilities, "_package_by_code", AsyncMock(return_value=SimpleNamespace(id=3)))
    monkeypatch.setattr(capabilities, "_package_operation", AsyncMock(return_value=operation))
    publish_template = AsyncMock()
    monkeypatch.setattr(capabilities, "publish_template", publish_template)

    with pytest.raises(capabilities.HTTPException) as error:
        await capabilities.route_publish_package_operation("FEISHU_RECRUIT", 8, db, SimpleNamespace(id=5))

    assert error.value.status_code == 409
    publish_template.assert_not_awaited()


def test_package_operation_submit_route_is_removed():
    paths = {route.path for route in capabilities_router.routes}
    assert "/connector-packages/{package_code}/operations/{operation_id}/submit" not in paths
