"""Unified template-backed execution for UCP business actions."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.adapters import get_adapter
from app.ucp.credential_service import decrypt_credential_secrets
from app.ucp.generic_http_adapter import GenericHttpActionAdapter
from app.ucp.models import UcpApiTemplate, UcpOperationDefinition


class CapabilityExecutionError(RuntimeError):
    pass


def _template_config(template: UcpApiTemplate) -> dict:
    return {
        "method": template.method,
        "base_url": template.base_url,
        "path": template.path,
        "headers_config": template.headers_config,
        "query_config": template.query_config,
        "body_template": template.body_template,
        "auth_type": template.auth_type,
        "allowed_domains": template.allowed_domains,
        "timeout_seconds": template.timeout_seconds,
        "pagination_type": template.pagination_type,
        "page_param": template.page_param,
        "page_size_param": template.page_size_param,
        "data_path": template.data_path,
        "total_path": template.total_path,
        "next_cursor_path": template.next_cursor_path,
        "rate_limit_qps": template.rate_limit_qps,
        "tags": template.tags,
        "error_code_map": template.error_code_map,
    }


async def execute_operation_template(
    db: AsyncSession,
    operation: UcpOperationDefinition,
    credential_id: int | None,
    parameters: dict,
    *,
    require_published: bool = False,
):
    if operation.adapter_code != "GENERIC_HTTP_ACTION_ADAPTER":
        if not credential_id:
            raise CapabilityExecutionError("请先绑定有效凭证")
        try:
            adapter = get_adapter(operation.adapter_code or "")
        except RuntimeError as error:
            raise CapabilityExecutionError(str(error)) from error
        return await adapter(parameters, await decrypt_credential_secrets(db, credential_id), db)

    if not operation.executor_template_id:
        raise CapabilityExecutionError("所选业务能力未绑定接口模板")
    template = await db.get(UcpApiTemplate, operation.executor_template_id)
    if not template or template.package_id != operation.package_id or template.operation_definition_id != operation.id:
        raise CapabilityExecutionError("所选业务能力的接口模板关联无效")
    if require_published and (not template.is_published or not template.is_active):
        raise CapabilityExecutionError("所选业务能力的接口模板未发布或已停用")
    if not credential_id:
        raise CapabilityExecutionError("请先绑定有效凭证")
    return await GenericHttpActionAdapter().execute(
        {"http_config": _template_config(template), "context": parameters},
        await decrypt_credential_secrets(db, credential_id),
        db,
    )
