"""Feishu Recruiting standard SaaS capability package definitions."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpConnectorPackage, UcpOperationDefinition


FEISHU_RECRUIT_PACKAGE_CODE = "FEISHU_RECRUIT"

FEISHU_RECRUIT_OPERATIONS: tuple[dict[str, Any], ...] = (
    {
        "object_code": "OFFER",
        "operation_code": "QUERY_BY_CANDIDATE_ID",
        "operation_name": "按投递记录 ID 查询 Offer",
        "adapter_code": "FEISHU_OFFER_DETAIL_ADAPTER",
        "required_scopes": ["hire:application:readonly"],
        "input_schema": {"required": ["application_id"], "properties": {"application_id": {"type": "string", "label": "投递记录 ID"}}},
        "output_schema": {"properties": {"offer_id": {"type": "string"}, "offer_status": {"type": "string"}, "salary_amount": {"type": "number", "sensitivity": "compensation_high"}, "salary_currency": {"type": "string", "sensitivity": "compensation_high"}}},
    },
    {
        "object_code": "CANDIDATE",
        "operation_code": "QUERY_DETAIL",
        "operation_name": "查询应聘者详情",
        "adapter_code": "FEISHU_RECRUIT_CANDIDATE_ADAPTER",
        "required_scopes": ["hire:candidates:read"],
        "input_schema": {"required": ["candidate_id"], "properties": {"candidate_id": {"type": "string"}}},
        "output_schema": {"properties": {"candidate_id": {"type": "string"}, "name": {"type": "string", "sensitivity": "pii"}}},
    },
    {
        "object_code": "JOB",
        "operation_code": "QUERY_DETAIL",
        "operation_name": "查询职位详情",
        "adapter_code": "FEISHU_RECRUIT_JOB_ADAPTER",
        "required_scopes": ["hire:jobs:read"],
        "input_schema": {"required": ["job_id"], "properties": {"job_id": {"type": "string"}}},
        "output_schema": {"properties": {"job_id": {"type": "string"}, "job_name": {"type": "string"}}},
    },
)


async def ensure_feishu_recruit_capability_package(db: AsyncSession) -> UcpConnectorPackage:
    package = (await db.execute(select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == FEISHU_RECRUIT_PACKAGE_CODE))).scalar_one_or_none()
    if package is None:
        package = UcpConnectorPackage(package_code=FEISHU_RECRUIT_PACKAGE_CODE, package_name="飞书招聘", status="PUBLISHED", host_allowlist=["open.feishu.cn"], description="飞书招聘预置只读业务能力包")
        db.add(package)
        await db.flush()
    existing_operations = list((await db.execute(
        select(UcpOperationDefinition).where(UcpOperationDefinition.package_id == package.id)
    )).scalars().all())
    existing = {(item.object_code, item.operation_code): item for item in existing_operations}
    for operation in FEISHU_RECRUIT_OPERATIONS:
        current = existing.get((operation["object_code"], operation["operation_code"]))
        if current is not None:
            for field, value in operation.items():
                setattr(current, field, value)
            continue
        db.add(UcpOperationDefinition(package_id=package.id, version="1.0.0", status="DRAFT", risk_level="read_low", **operation))
    await db.commit()
    await db.refresh(package)
    return package
