from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpCapabilityTestRun, UcpConnectorPackage, UcpOperationDefinition, UcpSystemCapability

_CODE = re.compile(r"^[A-Z][A-Z0-9_]{1,63}$")


class CapabilityDefinitionError(ValueError):
    pass


def normalize_code(value: str, field: str) -> str:
    result = (value or "").strip().upper()
    if not _CODE.fullmatch(result):
        raise CapabilityDefinitionError(f"{field} is invalid")
    return result


async def create_connector_package(db: AsyncSession, *, package_code: str, package_name: str, host_allowlist: list[str] | None = None, created_by: str = "system") -> UcpConnectorPackage:
    if not package_name.strip():
        raise CapabilityDefinitionError("package_name is required")
    obj = UcpConnectorPackage(package_code=normalize_code(package_code, "package_code"), package_name=package_name.strip(), host_allowlist=list(host_allowlist or []))
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def create_operation_definition(db: AsyncSession, *, package_id: int, object_code: str, operation_code: str, operation_name: str, adapter_code: str | None = None, required_scopes: list[str] | None = None, input_schema: dict[str, Any] | None = None, output_schema: dict[str, Any] | None = None) -> UcpOperationDefinition:
    if not await db.get(UcpConnectorPackage, package_id):
        raise CapabilityDefinitionError("connector package does not exist")
    if not operation_name.strip():
        raise CapabilityDefinitionError("operation_name is required")
    obj = UcpOperationDefinition(package_id=package_id, object_code=normalize_code(object_code, "object_code"), operation_code=normalize_code(operation_code, "operation_code"), operation_name=operation_name.strip(), adapter_code=normalize_code(adapter_code, "adapter_code") if adapter_code else None, required_scopes=list(required_scopes or []), input_schema=dict(input_schema or {}), output_schema=dict(output_schema or {}))
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_system_capability(db: AsyncSession, system_id: int, operation_id: int) -> UcpSystemCapability | None:
    return (await db.execute(select(UcpSystemCapability).where(UcpSystemCapability.system_id == system_id, UcpSystemCapability.operation_id == operation_id))).scalar_one_or_none()


async def create_system_capability(db: AsyncSession, *, system_id: int, operation_id: int, credential_id: int | None = None, runtime_config: dict[str, Any] | None = None) -> UcpSystemCapability:
    if not await db.get(UcpOperationDefinition, operation_id):
        raise CapabilityDefinitionError("operation definition does not exist")
    obj = UcpSystemCapability(system_id=system_id, operation_id=operation_id, credential_id=credential_id, runtime_config=dict(runtime_config or {}))
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def create_capability_test_run(db: AsyncSession, *, capability_id: int, status: str, trace_id: str, request_summary: dict[str, Any] | None = None, response_summary: dict[str, Any] | None = None, error_code: str | None = None) -> UcpCapabilityTestRun:
    if not await db.get(UcpSystemCapability, capability_id) or not trace_id.strip():
        raise CapabilityDefinitionError("capability and trace_id are required")
    obj = UcpCapabilityTestRun(capability_id=capability_id, status=status.upper(), trace_id=trace_id, request_summary=dict(request_summary or {}), response_summary=dict(response_summary or {}), error_code=error_code)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj
