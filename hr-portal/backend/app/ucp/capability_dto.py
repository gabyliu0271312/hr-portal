from typing import Any
from pydantic import BaseModel, Field


class ConnectorPackageCreateDTO(BaseModel):
    package_code: str
    package_name: str
    host_allowlist: list[str] = Field(default_factory=list)


class OperationDefinitionCreateDTO(BaseModel):
    package_id: int
    object_code: str
    operation_code: str
    operation_name: str
    adapter_code: str | None = None
    required_scopes: list[str] = Field(default_factory=list)
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)


class SystemCapabilityCreateDTO(BaseModel):
    system_id: int
    operation_id: int
    credential_id: int | None = None
    runtime_config: dict[str, Any] = Field(default_factory=dict)
