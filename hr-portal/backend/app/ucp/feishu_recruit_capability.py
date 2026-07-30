"""Feishu Recruiting standard SaaS capability package definitions."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.action_contract import build_field_catalog
from app.ucp.models import UcpApiTemplate, UcpConnectorPackage, UcpOperationDefinition


FEISHU_RECRUIT_PACKAGE_CODE = "FEISHU_RECRUIT"


def _operation(
    object_code: str,
    operation_code: str,
    operation_name: str,
    path: str,
    input_schema: dict,
    output_schema: dict,
) -> dict[str, Any]:
    return {
        "object_code": object_code,
        "operation_code": operation_code,
        "operation_name": operation_name,
        "adapter_code": "GENERIC_HTTP_ACTION_ADAPTER",
        "required_scopes": ["hire:application:readonly"] if object_code == "OFFER" else (["hire:candidates:read"] if object_code == "CANDIDATE" else ["hire:jobs:read"]),
        "input_schema": input_schema,
        "output_schema": output_schema,
        "template_code": f"FEISHU_RECRUIT_{object_code}_{operation_code}",
        "path": path,
    }


FEISHU_RECRUIT_OPERATIONS: tuple[dict[str, Any], ...] = (
    _operation(
        "OFFER", "QUERY_BY_CANDIDATE_ID", "按投递记录 ID 查询 Offer",
        "/open-apis/hire/v1/applications/{{application_id}}/offer",
        {"required": ["application_id"], "properties": {"application_id": {"type": "string", "label": "投递记录 ID"}}},
        {"properties": {"application_id": {"type": "string", "label": "投递记录 ID"}, "offer_id": {"type": "string", "label": "Offer ID"}, "offer_status": {"type": "string", "label": "Offer 状态"}, "salary_amount": {"type": "number", "label": "基本工资", "sensitivity": "compensation_high"}, "salary_currency": {"type": "string", "label": "薪资币种", "sensitivity": "compensation_high"}, "target_bonus": {"type": "number", "label": "目标奖金", "sensitivity": "compensation_high"}}},
    ),
    _operation(
        "CANDIDATE", "QUERY_LIST", "分页查询应聘者", "/open-apis/hire/v1/candidates",
        {"properties": {"page_size": {"type": "integer", "minimum": 1, "maximum": 100}, "page_token": {"type": "string"}}},
        {"properties": {"candidate_id": {"type": "string"}, "name": {"type": "string", "sensitivity": "pii"}, "page_token": {"type": "string"}, "has_more": {"type": "boolean"}}},
    ),
    _operation(
        "CANDIDATE", "QUERY_DETAIL", "查询应聘者详情", "/open-apis/hire/v1/candidates/{{candidate_id}}",
        {"required": ["candidate_id"], "properties": {"candidate_id": {"type": "string"}}},
        {"properties": {"candidate_id": {"type": "string"}, "name": {"type": "string", "sensitivity": "pii"}}},
    ),
    _operation(
        "JOB", "QUERY_LIST", "分页查询职位", "/open-apis/hire/v1/jobs",
        {"properties": {"page_size": {"type": "integer", "minimum": 1, "maximum": 100}, "page_token": {"type": "string"}}},
        {"properties": {"job_id": {"type": "string"}, "job_name": {"type": "string"}, "page_token": {"type": "string"}, "has_more": {"type": "boolean"}}},
    ),
    _operation(
        "JOB", "QUERY_DETAIL", "查询职位详情", "/open-apis/hire/v1/jobs/{{job_id}}",
        {"required": ["job_id"], "properties": {"job_id": {"type": "string"}}},
        {"properties": {"job_id": {"type": "string"}, "job_name": {"type": "string"}}},
    ),
)


async def ensure_feishu_recruit_capability_package(db: AsyncSession) -> UcpConnectorPackage:
    package = (await db.execute(select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == FEISHU_RECRUIT_PACKAGE_CODE))).scalar_one_or_none()
    if package is None:
        package = UcpConnectorPackage(package_code=FEISHU_RECRUIT_PACKAGE_CODE, package_name="飞书招聘", status="PUBLISHED", host_allowlist=["open.feishu.cn"], description="飞书招聘预置只读业务能力包")
        db.add(package)
        await db.flush()
    package.category = "STANDARD_SAAS"
    package.connection_mode = "STANDARD_SAAS"
    package.owner = getattr(package, "owner", None) or "平台管理员"
    package.auth_policy = getattr(package, "auth_policy", None) or {
        "auth_type": "FEISHU_TENANT_APP",
        "credential_schema": [
            {"key": "app_id", "label": "飞书应用 App ID", "required": True, "secret": False},
            {"key": "app_secret", "label": "飞书应用 App Secret", "required": True, "secret": True},
        ],
    }
    package.system_schema = getattr(package, "system_schema", None) or {"base_url": "https://open.feishu.cn", "fields": [{"key": "tenant_name", "label": "租户名称", "type": "string", "required": False}]}
    package.feature_flags = getattr(package, "feature_flags", None) or {"supports_capabilities": True, "supports_resources": False}

    existing = {(item.object_code, item.operation_code): item for item in (await db.execute(select(UcpOperationDefinition).where(UcpOperationDefinition.package_id == package.id))).scalars()}
    for definition in FEISHU_RECRUIT_OPERATIONS:
        operation = existing.get((definition["object_code"], definition["operation_code"]))
        if operation is None:
            operation = UcpOperationDefinition(
                package_id=package.id, object_code=definition["object_code"], operation_code=definition["operation_code"],
                operation_name=definition["operation_name"], adapter_code="GENERIC_HTTP_ACTION_ADAPTER",
                required_scopes=[], input_schema=definition["input_schema"], output_schema=definition["output_schema"],
                field_catalog=build_field_catalog(definition["output_schema"]), source_type="PRESET",
                approval_status="PUBLISHED", version="1.0.0", status="PUBLISHED", risk_level="read_low",
            )
            db.add(operation)
            await db.flush()
        elif operation.status != "DISABLED":
            operation.adapter_code = "GENERIC_HTTP_ACTION_ADAPTER"
            operation.status = "PUBLISHED"
            operation.approval_status = "PUBLISHED"
            operation.field_catalog = operation.field_catalog or build_field_catalog(operation.output_schema or {})

        template = (await db.execute(select(UcpApiTemplate).where(UcpApiTemplate.template_code == definition["template_code"]))).scalar_one_or_none()
        if template is None:
            template = UcpApiTemplate(
                template_code=definition["template_code"], template_name=definition["operation_name"], category="PACKAGE_PRESET",
                method="GET", base_url="https://open.feishu.cn", path=definition["path"], headers_config=[], query_config=[],
                auth_type="FEISHU_TENANT_APP", data_path="$.data", pagination_type="NONE", allowed_domains=["open.feishu.cn"],
                tags=["package-preset"], package_id=package.id, operation_definition_id=operation.id,
                allowed_domains_snapshot=["open.feishu.cn"], auth_policy_snapshot=package.auth_policy, is_published=1,
            )
            db.add(template)
            await db.flush()
        else:
            template.is_published = 1
        if operation.executor_template_id != template.id:
            operation.executor_template_id = template.id
        if template.package_id != package.id:
            template.package_id = package.id
        if template.operation_definition_id != operation.id:
            template.operation_definition_id = operation.id
    await db.commit()
    await db.refresh(package)
    return package
