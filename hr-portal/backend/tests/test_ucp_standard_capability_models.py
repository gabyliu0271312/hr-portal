import pytest

from app.ucp.capability_dto import ConnectorPackageCreateDTO, SystemCapabilityCreateDTO
from app.ucp.capability_service import CapabilityDefinitionError, normalize_code
from app.ucp.models import UcpCapabilityTestRun, UcpConnectorPackage, UcpOperationDefinition, UcpSystemCapability


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
