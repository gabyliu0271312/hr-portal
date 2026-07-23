"""Standard SaaS capability discovery for the system onboarding wizard."""
from __future__ import annotations

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpConnectorPackage, UcpOperationDefinition, UcpSystem, UcpSystemCapability
from app.ucp.models import UcpCapabilityTestRun
from app.ucp.masking import mask_dict
from app.ucp.masking import mask_sensitive_fields
from app.ucp.credential_service import decrypt_credential_secrets
from app.ucp.adapters import get_adapter
import uuid


def operation_summary(operation: UcpOperationDefinition, capability: UcpSystemCapability | None = None) -> dict:
    enabled = bool(capability and capability.enabled)
    has_credential = bool(capability and capability.credential_id)
    test_status = "待补充测试参数" if enabled and has_credential else "未测试"
    return {
        "operation_id": operation.id,
        "object_code": operation.object_code,
        "operation_code": operation.operation_code,
        "operation_name": operation.operation_name,
        "enabled": enabled,
        "connection_status": capability.connection_status if capability else "UNVERIFIED",
        "verification_status": capability.verification_status if capability else "NOT_TESTED",
        "test_status": test_status,
        "input_fields": list((operation.input_schema or {}).get("required", [])),
        "input_parameters": [{"key": key, "label": ((operation.input_schema or {}).get("properties", {}).get(key, {}) or {}).get("label", key)} for key in (operation.input_schema or {}).get("required", [])],
        "output_fields": list((operation.output_schema or {}).get("properties", {}).keys()),
    }


def capability_test_run_summary(run: UcpCapabilityTestRun) -> dict:
    return {
        "id": run.id,
        "status": run.status,
        "request_summary": run.request_summary or {},
        "response_summary": run.response_summary or {"rows": []},
        "error_code": run.error_code,
        "error_message": run.error_message,
        "trace_id": run.trace_id,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


async def list_standard_packages(db: AsyncSession) -> list[dict]:
    packages = list((await db.execute(
        select(UcpConnectorPackage).where(
            UcpConnectorPackage.connection_mode == "STANDARD_SAAS",
            UcpConnectorPackage.status == "PUBLISHED",
        ).order_by(UcpConnectorPackage.package_name)
    )).scalars())
    if not packages:
        return []
    operations = list((await db.execute(
        select(UcpOperationDefinition).where(UcpOperationDefinition.package_id.in_([item.id for item in packages]))
        .order_by(UcpOperationDefinition.object_code, UcpOperationDefinition.operation_code)
    )).scalars())
    grouped: dict[int, list[UcpOperationDefinition]] = {item.id: [] for item in packages}
    for operation in operations:
        grouped[operation.package_id].append(operation)
    return [{
        "package_code": package.package_code,
        "package_name": package.package_name,
        "description": package.description,
        "operations": [operation_summary(operation) for operation in grouped[package.id]],
    } for package in packages]


async def list_system_capabilities(db: AsyncSession, system_id: int) -> list[dict] | None:
    if not await db.get(UcpSystem, system_id):
        return None
    rows = (await db.execute(
        select(UcpOperationDefinition, UcpSystemCapability)
        .outerjoin(
            UcpSystemCapability,
            (UcpSystemCapability.operation_id == UcpOperationDefinition.id)
            & (UcpSystemCapability.system_id == system_id),
        )
        .join(UcpConnectorPackage, UcpConnectorPackage.id == UcpOperationDefinition.package_id)
        .where(
            UcpConnectorPackage.connection_mode == "STANDARD_SAAS",
            UcpConnectorPackage.status == "PUBLISHED",
        )
        .order_by(UcpConnectorPackage.package_name, UcpOperationDefinition.object_code)
    )).all()
    return [operation_summary(operation, capability) for operation, capability in rows]


async def set_system_capability(
    db: AsyncSession,
    *,
    system_id: int,
    operation_id: int,
    credential_id: int | None,
    enabled: bool,
) -> dict | None:
    if not await db.get(UcpSystem, system_id):
        return None
    operation = await db.get(UcpOperationDefinition, operation_id)
    if not operation:
        raise ValueError("能力不存在")
    capability = (await db.execute(select(UcpSystemCapability).where(
        UcpSystemCapability.system_id == system_id,
        UcpSystemCapability.operation_id == operation_id,
    ))).scalar_one_or_none()
    if capability is None:
        capability = UcpSystemCapability(system_id=system_id, operation_id=operation_id)
        db.add(capability)
    capability.credential_id = credential_id
    capability.enabled = enabled
    capability.connection_status = "PENDING_TEST_PARAMETERS" if enabled and credential_id else "UNVERIFIED"
    capability.verification_status = "NOT_TESTED"
    await db.commit()
    await db.refresh(capability)
    return operation_summary(operation, capability)


async def test_system_capability(db: AsyncSession, *, system_id: int, operation_id: int, parameters: dict) -> dict:
    capability = (await db.execute(select(UcpSystemCapability).where(
        UcpSystemCapability.system_id == system_id,
        UcpSystemCapability.operation_id == operation_id,
    ))).scalar_one_or_none()
    operation = await db.get(UcpOperationDefinition, operation_id)
    if not capability or not operation or not capability.enabled:
        raise ValueError("该业务能力尚未启用")
    trace_id = uuid.uuid4().hex
    required = list((operation.input_schema or {}).get("required", []))
    missing = [name for name in required if not parameters.get(name)]
    if missing:
        status, error_code, message = "PARAMETER_REQUIRED", "MISSING_TEST_PARAMETER", f"请补充测试参数：{'、'.join(missing)}"
    elif not capability.credential_id:
        status, error_code, message = "CREDENTIAL_REQUIRED", "MISSING_CREDENTIAL", "请先绑定有效凭证"
    else:
        try:
            result = await get_adapter(operation.adapter_code or "")(parameters, await decrypt_credential_secrets(db, capability.credential_id), db)
            status = "SUCCESS" if result.status == "success" else result.status.upper()
            error_code = result.error_code
            message = "Offer 查询成功" if result.status == "success" else (result.error_message or "Offer 查询失败")
            capability.connection_status = "CONNECTED" if result.status in ("success", "offer_not_found") else "FAILED"
            capability.verification_status = "VERIFIED" if result.status in ("success", "offer_not_found") else "FAILED"
        except Exception as error:
            result = None
            status, error_code, message = "FAILED", "CAPABILITY_TEST_FAILED", str(error)[:500]
            capability.connection_status = "FAILED"
            capability.verification_status = "FAILED"
    test_run = UcpCapabilityTestRun(
        capability_id=capability.id,
        status=status,
        request_summary=mask_dict(parameters),
        response_summary={"rows": mask_sensitive_fields(result.data) if result else []},
        error_code=error_code,
        error_message=message,
        trace_id=trace_id,
    )
    db.add(test_run)
    await db.commit()
    await db.refresh(test_run)
    return {
        "status": status,
        "error_code": error_code,
        "message": message,
        "trace_id": trace_id,
        "test_run": capability_test_run_summary(test_run),
    }


async def list_capability_test_runs(
    db: AsyncSession,
    *,
    system_id: int,
    operation_id: int,
    limit: int = 20,
) -> list[dict] | None:
    capability = (await db.execute(select(UcpSystemCapability).where(
        UcpSystemCapability.system_id == system_id,
        UcpSystemCapability.operation_id == operation_id,
    ))).scalar_one_or_none()
    if capability is None:
        return None
    rows = list((await db.execute(
        select(UcpCapabilityTestRun)
        .where(UcpCapabilityTestRun.capability_id == capability.id)
        .order_by(desc(UcpCapabilityTestRun.created_at), desc(UcpCapabilityTestRun.id))
        .limit(max(1, min(limit, 50)))
    )).scalars())
    return [capability_test_run_summary(run) for run in rows]
