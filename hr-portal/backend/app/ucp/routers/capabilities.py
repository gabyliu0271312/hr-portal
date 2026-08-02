"""Business-facing standard SaaS capability discovery endpoints."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, select

from app.core.db import get_session
from app.core.deps import require_op
from app.ucp.capability_discovery import (
    list_capability_test_runs,
    list_standard_packages,
    list_system_capabilities,
    set_system_capability,
    test_system_capability,
)
from app.ucp.models import UcpApiTemplate, UcpCapabilityTestRun, UcpConnectorPackage, UcpCredential, UcpResource, UcpSystemCapability, UcpOperationDefinition, UcpSystem
from app.ucp.api_template_service import ApiTemplateError, create_openapi_drafts, create_template, publish_template, update_template
from app.ucp.capability_execution import execute_operation_template
from app.ucp.credential_service import decrypt_credential_secrets
from app.ucp.generic_http_adapter import GenericHttpActionAdapter
from app.ucp.openapi_import_service import OpenApiImportError, preview_openapi
from app.ucp.system_service import create_system
from app.ucp.action_contract import ActionContractError, build_field_catalog, redact_sample, resolve_business_error, schema_hash, validate_condition_ast, validate_mapping, validate_schema
from app.connectors.catalog import get_connector_type

router = APIRouter()


def _resource_template_metadata(schema: dict) -> tuple[str, str]:
    parent_package_code = str(schema.get("parent_package_code") or "").strip().upper()
    connector_type = str(schema.get("resource_connector_type") or "").strip()
    if not parent_package_code or not connector_type:
        raise HTTPException(422, "RESOURCE_TEMPLATE_METADATA_REQUIRED")
    connector = get_connector_type(connector_type, include_internal=True)
    if not connector or connector.get("connection_kind") not in {"DATA_OBJECT", "EVENT_INGRESS"}:
        raise HTTPException(422, "RESOURCE_TEMPLATE_CONNECTOR_INVALID")
    return parent_package_code, connector_type


def _package_item(item: UcpConnectorPackage) -> dict:
    return {
        'id': item.id, 'package_code': item.package_code, 'package_name': item.package_name,
        'category': item.category or item.connection_mode or 'STANDARD_SAAS', 'connection_mode': item.connection_mode,
        'version': item.version, 'status': item.status, 'description': item.description, 'icon': item.icon,
        'host_allowlist': item.host_allowlist or [], 'auth_policy': item.auth_policy or {},
        'system_schema': item.system_schema or {}, 'feature_flags': item.feature_flags or {},
        'owner': item.owner, 'release_notes': item.release_notes,
        'compatibility_impact': item.compatibility_impact,
        'published_at': item.published_at, 'deprecated_at': item.deprecated_at,
    }


def _operation_item(item: UcpOperationDefinition) -> dict:
    return {
        'id': item.id, 'package_id': item.package_id,
        'object_code': item.object_code, 'operation_code': item.operation_code,
        'operation_name': item.operation_name, 'adapter_code': item.adapter_code,
        'required_scopes': item.required_scopes or [], 'input_schema': item.input_schema or {},
        'output_schema': item.output_schema or {}, 'risk_level': item.risk_level,
        'version': item.version, 'status': item.status,
        'source_type': item.source_type or 'PRESET', 'approval_status': item.approval_status or 'PUBLISHED',
        'executor_template_id': item.executor_template_id,
        'field_catalog': item.field_catalog or [], 'masking_rules': item.masking_rules or {},
        'error_rules': item.error_rules or [], 'sample_response': item.sample_response,
        'sample_schema_hash': item.sample_schema_hash, 'last_tested_at': item.last_tested_at,
    }


_PACKAGE_CATEGORIES = {'STANDARD_SAAS', 'INSTANCE_RESOURCE', 'CONTROLLED_API'}
_ACTION_PACKAGE_CATEGORIES = {'STANDARD_SAAS', 'CONTROLLED_API'}
_READ_METHODS = {'GET', 'POST'}


def _safe_path(value: object) -> str:
    path = str(value or '').strip()
    if not path.startswith('/') or '://' in path or '//' in path or '..' in path:
        raise HTTPException(422, '接口路径必须是安全的相对路径')
    return path


def _package_base_url(package: UcpConnectorPackage) -> str | None:
    schema = package.system_schema or {}
    configured = schema.get('base_url') if isinstance(schema, dict) else None
    if configured:
        return str(configured).rstrip('/')
    allowlist = list(package.host_allowlist or [])
    if not allowlist:
        return None
    host = str(allowlist[0]).strip().rstrip('/')
    return host if host.startswith('https://') else f'https://{host}'


async def _primary_credential(db: AsyncSession, system_id: int) -> UcpCredential | None:
    return (await db.execute(
        select(UcpCredential)
        .where(UcpCredential.system_id == system_id, UcpCredential.is_active == 1)
        .order_by(UcpCredential.is_primary.desc(), UcpCredential.id.asc())
        .limit(1)
    )).scalar_one_or_none()


async def _package_by_code(db: AsyncSession, package_code: str) -> UcpConnectorPackage:
    package = (await db.execute(
        select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == package_code.upper())
    )).scalar_one_or_none()
    if not package:
        raise HTTPException(404, '接入类型不存在')
    return package


async def _package_operation(
    db: AsyncSession, package: UcpConnectorPackage, operation_id: int,
) -> UcpOperationDefinition:
    operation = await db.get(UcpOperationDefinition, operation_id)
    if not operation or operation.package_id != package.id:
        raise HTTPException(404, '预置业务能力不存在')
    return operation


def _business_test_message(operation: UcpOperationDefinition, result: Any, success: bool) -> str:
    message = resolve_business_error(
        operation.error_rules or [],
        status_code=getattr(result, "status_code", None),
        error_code=result.error_code,
        fallback="动作测试成功" if success else "动作测试失败，请检查参数和系统凭证",
    )
    if (
        not success
        and str(result.error_code or "").startswith("HTTP_")
        and result.error_message
    ):
        return f"{message}（{result.error_message}）"
    return message


async def _test_package_operation(
    db: AsyncSession,
    package: UcpConnectorPackage,
    operation: UcpOperationDefinition,
    system_id: int,
    context: dict,
) -> dict:
    system = await db.get(UcpSystem, system_id)
    if not system or system.package_id != package.id:
        raise HTTPException(422, '请选择使用当前接入类型的系统实例进行连接测试')
    credential = await _primary_credential(db, system_id)
    template = await db.get(UcpApiTemplate, operation.executor_template_id)
    if not credential or not template:
        raise HTTPException(409, '请先配置测试系统凭证和接口模板')
    capability = (await db.execute(select(UcpSystemCapability).where(
        UcpSystemCapability.system_id == system_id,
        UcpSystemCapability.operation_id == operation.id,
    ))).scalar_one_or_none()
    if capability is None:
        capability = UcpSystemCapability(
            system_id=system_id, operation_id=operation.id,
            credential_id=credential.id, enabled=False,
        )
        db.add(capability)
        await db.flush()
    try:
        result = await execute_operation_template(db, operation, credential.id, context)
    except Exception as error:
        result = type('PackageTestResult', (), {
            'status': 'failed', 'data': [], 'error_code': 'PACKAGE_TEST_FAILED',
            'error_message': str(error)[:500],
        })()
    success = result.status == 'success'
    business_message = _business_test_message(operation, result, success)
    capability.credential_id = credential.id
    capability.enabled = False
    capability.verification_status, capability.connection_status = (
        ('VERIFIED', 'CONNECTED') if success else ('FAILED', 'FAILED')
    )
    operation.status = 'TESTED' if success else 'FAILED'
    operation.catalog_test_system_id = system.id
    operation.last_tested_at = datetime.now(timezone.utc)
    if success:
        sample = result.data[0] if isinstance(result.data, list) and result.data else result.data
        operation.sample_response = redact_sample(sample, operation.field_catalog or [])
        operation.sample_schema_hash = schema_hash(operation.input_schema or {}, operation.output_schema or {})
    db.add(UcpCapabilityTestRun(
        capability_id=capability.id,
        status='SUCCESS' if success else 'FAILED',
        trace_id=f'pkgop-{operation.id}-{int(datetime.now(timezone.utc).timestamp())}',
        request_summary={'template_code': template.template_code},
        response_summary={'rows': result.data[:3] if isinstance(result.data, list) else result.data},
        error_code=result.error_code,
        error_message=business_message,
    ))
    await db.commit()
    return {
        'status': 'SUCCESS' if success else 'FAILED',
        'message': business_message,
        'operation': _operation_item(operation),
    }


@router.get("/capabilities/catalog")
async def route_verified_capability_catalog(
    include_unverified: bool = Query(False),
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "V")),
):
    stmt = (
        select(UcpSystemCapability, UcpOperationDefinition, UcpSystem)
        .join(UcpOperationDefinition, UcpOperationDefinition.id == UcpSystemCapability.operation_id)
        .join(UcpSystem, UcpSystem.id == UcpSystemCapability.system_id)
        .where(UcpSystemCapability.enabled.is_(True))
        .where(
            UcpOperationDefinition.approval_status == 'PUBLISHED',
        )
        .order_by(UcpSystem.system_name, UcpOperationDefinition.object_code, UcpOperationDefinition.operation_name)
    )
    if not include_unverified:
        stmt = stmt.where(
            UcpSystemCapability.verification_status == "VERIFIED",
            UcpOperationDefinition.status == 'PUBLISHED',
        )
    rows = (await db.execute(stmt)).all()
    return {"items": [{"capability_id": capability.id, "system_id": system.id, "system_name": system.system_name, "object_code": operation.object_code, "operation_name": operation.operation_name, "operation_id": operation.id, "operation_version": operation.version, "source_type": operation.source_type, "risk_level": operation.risk_level, "verification_status": capability.verification_status, "output_schema": operation.output_schema or {}} for capability, operation, system in rows]}


@router.get("/standard-packages")
async def route_list_standard_packages(
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "V")),
):
    return {"items": await list_standard_packages(db)}


@router.get("/systems/{system_id}/capabilities")
async def route_list_system_capabilities(
    system_id: int,
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "V")),
):
    items = await list_system_capabilities(db, system_id)
    if items is None:
        raise HTTPException(404, "系统不存在")
    return {"items": items}


@router.put("/systems/{system_id}/capabilities/{operation_id}")
async def route_set_system_capability(
    system_id: int,
    operation_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "U")),
):
    try:
        item = await set_system_capability(
            db,
            system_id=system_id,
            operation_id=operation_id,
            credential_id=payload.get("credential_id"),
            enabled=bool(payload.get("enabled", False)),
        )
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
    if item is None:
        raise HTTPException(404, "系统不存在")
    return item


@router.post("/systems/{system_id}/capabilities/{operation_id}/test")
async def route_test_system_capability(
    system_id: int,
    operation_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "U")),
):
    try:
        return await test_system_capability(db, system_id=system_id, operation_id=operation_id, parameters=payload.get("parameters") or {})
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.get("/systems/{system_id}/capabilities/{operation_id}/test-runs")
async def route_list_capability_test_runs(
    system_id: int,
    operation_id: int,
    limit: int = 20,
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "V")),
):
    items = await list_capability_test_runs(
        db,
        system_id=system_id,
        operation_id=operation_id,
        limit=limit,
    )
    if items is None:
        raise HTTPException(404, "业务能力尚未启用")
    return {"items": items}

@router.get('/connector-packages')
async def route_list_connector_packages(category: str | None = None, status: str | None = None, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.systems', 'V'))):
    statement = select(UcpConnectorPackage).order_by(UcpConnectorPackage.package_name)
    if category:
        statement = statement.where(UcpConnectorPackage.category == category.upper())
    if status:
        statement = statement.where(UcpConnectorPackage.status == status.upper())
    packages = list((await db.execute(statement)).scalars())
    operation_rows = (await db.execute(
        select(UcpOperationDefinition)
        .where(
            UcpOperationDefinition.package_id.in_([item.id for item in packages] or [-1]),
            UcpOperationDefinition.status == 'PUBLISHED',
            UcpOperationDefinition.approval_status == 'PUBLISHED',
        )
        .order_by(UcpOperationDefinition.operation_name)
    )).scalars().all()
    operations_by_package: dict[int, list[dict]] = {}
    for operation in operation_rows:
        operations_by_package.setdefault(operation.package_id, []).append(_operation_item(operation))
    return {
        'items': [
            _package_item(item) | {'operations': operations_by_package.get(item.id, [])}
            for item in packages
        ]
    }


@router.get('/connector-packages/{package_code}')
async def route_get_connector_package(package_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'V'))):
    return _package_item(await _package_by_code(db, package_code))


@router.get('/connector-packages/{package_code}/resource-impact')
async def route_resource_template_impact(package_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'V'))):
    package = await _package_by_code(db, package_code)
    rows = (await db.execute(
        select(UcpResource, UcpSystem)
        .join(UcpSystem, UcpSystem.id == UcpResource.system_id)
        .where(or_(UcpResource.source_template_id == package.id, UcpResource.source_template_code == package.package_code))
        .order_by(UcpSystem.system_name, UcpResource.resource_name)
    )).all()
    return {"template": _package_item(package), "total": len(rows), "items": [
        {"system_id": system.id, "system_code": system.system_code, "system_name": system.system_name, "resource_id": resource.id, "resource_code": resource.resource_code, "resource_name": resource.resource_name, "status": resource.status, "test_status": resource.test_status}
        for resource, system in rows
    ]}

@router.post('/connector-packages', status_code=201)
async def route_create_connector_package(payload: dict, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'C'))):
    code, name = str(payload.get('package_code') or '').strip().upper(), str(payload.get('package_name') or '').strip()
    category = str(payload.get('category') or 'STANDARD_SAAS').upper()
    if not code or not name or category not in _PACKAGE_CATEGORIES:
        raise HTTPException(422, '接入类型编码、名称或分类不合法')
    schema = dict(payload.get("system_schema") or {})
    if category == "INSTANCE_RESOURCE":
        _resource_template_metadata(schema)
    if (await db.execute(select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == code))).scalar_one_or_none():
        raise HTTPException(409, '接入类型编码已存在')
    item = UcpConnectorPackage(package_code=code, package_name=name, category=category, connection_mode=category, version=str(payload.get('version') or '1.0.0'), status='DRAFT', description=payload.get('description'), release_notes=payload.get('release_notes'), compatibility_impact=payload.get('compatibility_impact'), icon=payload.get('icon'), host_allowlist=list(payload.get('host_allowlist') or []), auth_policy=dict(payload.get('auth_policy') or {}), system_schema=schema, feature_flags=dict(payload.get('feature_flags') or {}), owner=payload.get('owner'))
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _package_item(item)


@router.patch('/connector-packages/{package_code}')
async def route_update_connector_package(package_code: str, payload: dict, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'U'))):
    item = (await db.execute(select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == package_code.upper()))).scalar_one_or_none()
    if not item:
        raise HTTPException(404, '接入类型不存在')
    if item.status == 'DEPRECATED':
        raise HTTPException(409, '已弃用接入类型不可修改')
    next_category = str(payload.get("category") or item.category).upper()
    next_schema = dict(payload.get("system_schema", item.system_schema) or {})
    if next_category == "INSTANCE_RESOURCE":
        _resource_template_metadata(next_schema)
    allowed = {'package_name', 'description', 'release_notes', 'compatibility_impact', 'icon', 'host_allowlist', 'auth_policy', 'system_schema', 'feature_flags', 'owner', 'version'}
    for key in allowed:
        if key in payload:
            value = payload[key]
            setattr(item, key, list(value) if key == 'host_allowlist' else dict(value) if key in {'auth_policy', 'system_schema', 'feature_flags'} else value)
    if 'category' in payload:
        category = str(payload['category']).upper()
        if category not in _PACKAGE_CATEGORIES:
            raise HTTPException(422, '接入类型分类不合法')
        item.category = item.connection_mode = category
    await db.commit()
    await db.refresh(item)
    return _package_item(item)


@router.post('/connector-packages/{package_code}/validate')
async def route_validate_connector_package(package_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'V'))):
    item = (await db.execute(select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == package_code.upper()))).scalar_one_or_none()
    if not item:
        raise HTTPException(404, '接入类型不存在')
    errors = []
    if not item.owner:
        errors.append('需填写维护人')
    if item.category not in _PACKAGE_CATEGORIES:
        errors.append('接入类型分类不合法')
    if item.category == 'CONTROLLED_API' and not item.host_allowlist:
        errors.append('受控 API 必须配置域名白名单')
    if item.category == "INSTANCE_RESOURCE":
        try:
            parent_package_code, _connector_type = _resource_template_metadata(
                item.system_schema or {}
            )
            parent_exists = (
                await db.execute(
                    select(UcpConnectorPackage.id).where(
                        UcpConnectorPackage.package_code == parent_package_code,
                        UcpConnectorPackage.category.in_(_ACTION_PACKAGE_CATEGORIES),
                    )
                )
            ).scalar_one_or_none()
            if parent_exists is None:
                errors.append("RESOURCE_TEMPLATE_PARENT_NOT_FOUND")
        except HTTPException as exc:
            errors.append(str(exc.detail))
    if item.category in _ACTION_PACKAGE_CATEGORIES:
        operation_count = (await db.execute(select(UcpOperationDefinition.id).where(
            UcpOperationDefinition.package_id == item.id,
            UcpOperationDefinition.status == 'PUBLISHED',
            UcpOperationDefinition.approval_status == 'PUBLISHED',
        ))).first()
        if not operation_count:
            errors.append('接入类型至少需要发布一项预置业务动作')
    return {'valid': not errors, 'errors': errors}


@router.post('/connector-packages/{package_code}/publish')
async def route_publish_connector_package(package_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'U'))):
    item = (await db.execute(select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == package_code.upper()))).scalar_one_or_none()
    if not item:
        raise HTTPException(404, '接入类型不存在')
    validation = await route_validate_connector_package(package_code, db, _user)
    if not validation['valid']:
        raise HTTPException(409, '；'.join(validation['errors']))
    item.status, item.published_at, item.deprecated_at = 'PUBLISHED', datetime.now(timezone.utc), None
    await db.commit()
    await db.refresh(item)
    return _package_item(item)


@router.post('/connector-packages/{package_code}/deprecate')
async def route_deprecate_connector_package(package_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'U'))):
    item = (await db.execute(select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == package_code.upper()))).scalar_one_or_none()
    if not item:
        raise HTTPException(404, '接入类型不存在')
    item.status, item.deprecated_at = 'DEPRECATED', datetime.now(timezone.utc)
    await db.commit()
    return _package_item(item)


@router.get('/connector-packages/{package_code}/operations')
async def route_list_package_operations(package_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'V'))):
    package = await _package_by_code(db, package_code)
    rows = (await db.execute(
        select(UcpOperationDefinition)
        .where(
            UcpOperationDefinition.package_id == package.id,
        )
        .order_by(UcpOperationDefinition.operation_name)
    )).scalars().all()
    items = []
    for item in rows:
        payload = _operation_item(item)
        template = await db.get(UcpApiTemplate, item.executor_template_id)
        if template:
            payload.update({
                'template_code': template.template_code, 'path': template.path,
                'method': template.method, 'base_url': template.base_url,
                'query_config': template.query_config or [], 'headers_config': template.headers_config or [],
                'body_template': template.body_template, 'data_path': template.data_path,
                'description': template.description,
            })
        items.append(payload)
    return {'items': items}


@router.get('/connector-packages/{package_code}/operations/{operation_id}/sample')
async def route_get_package_operation_sample(package_code: str, operation_id: int, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'V'))):
    operation = await _package_operation(db, await _package_by_code(db, package_code), operation_id)
    current_hash = schema_hash(operation.input_schema or {}, operation.output_schema or {})
    if not operation.sample_response or operation.sample_schema_hash != current_hash:
        raise HTTPException(409, '当前动作没有可用样本，请先完成连接测试')
    return {'schema_hash': current_hash, 'field_catalog': operation.field_catalog or [], 'sample': operation.sample_response}


@router.post('/action-config/validate-mapping')
async def route_validate_mapping_contract(payload: dict, _user=Depends(require_op('ucp.pipelines', 'U'))):
    try:
        return {'mapping': validate_mapping(dict(payload.get('mapping') or {}), source_catalog=list(payload.get('source_catalog') or []), target_catalog=list(payload.get('target_catalog') or []))}
    except ActionContractError as error:
        raise HTTPException(422, str(error)) from error


@router.post('/action-config/validate-condition')
async def route_validate_condition_contract(payload: dict, _user=Depends(require_op('ucp.pipelines', 'U'))):
    try:
        return {'condition': validate_condition_ast(dict(payload.get('condition') or {}), catalog=list(payload.get('field_catalog') or []))}
    except ActionContractError as error:
        raise HTTPException(422, str(error)) from error


@router.post('/connector-packages/{package_code}/operations', status_code=201)
async def route_create_package_operation(package_code: str, payload: dict, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'C'))):
    package = await _package_by_code(db, package_code)
    if package.status == 'DEPRECATED' or package.category == 'INSTANCE_RESOURCE':
        raise HTTPException(409, '已弃用接入类型不可新增业务能力')
    path, code = _safe_path(payload.get('path')), str(payload.get('operation_code') or '').strip().upper()
    name, method = str(payload.get('operation_name') or '').strip(), str(payload.get('method') or 'GET').upper()
    if not code or not name or method not in _READ_METHODS:
        raise HTTPException(422, '请填写业务能力编码、名称，并仅使用 GET 或查询型 POST')
    duplicate = (await db.execute(select(UcpOperationDefinition).where(
        UcpOperationDefinition.package_id == package.id,
        UcpOperationDefinition.operation_code == code,
    ))).scalar_one_or_none()
    if duplicate:
        raise HTTPException(409, '该接入类型内业务能力编码已存在')
    if payload.get('headers_config'):
        raise HTTPException(422, '类型级只读动作不允许配置 Header 表单字段')
    try:
        input_schema = validate_schema(dict(payload.get('input_schema') or {}), label='输入')
        output_schema = validate_schema(dict(payload.get('output_schema') or {}), label='输出')
    except ActionContractError as error:
        raise HTTPException(422, str(error)) from error
    item = UcpOperationDefinition(
        package_id=package.id, source_type='MANUAL', approval_status='DRAFT',
        object_code=str(payload.get('object_code') or 'CUSTOM').upper(), operation_code=code,
        operation_name=name, adapter_code='GENERIC_HTTP_ACTION_ADAPTER',
        required_scopes=list(payload.get('required_scopes') or []), input_schema=input_schema,
        output_schema=output_schema, field_catalog=build_field_catalog(output_schema),
        masking_rules=dict(payload.get('masking_rules') or {}), error_rules=list(payload.get('error_rules') or []), risk_level='read_low',
        version='0.1.0', status='DRAFT',
    )
    db.add(item)
    await db.flush()
    template_code = f'PKG{package.id}_{code}'
    try:
        await create_template(
            db, template_code=template_code, template_name=name, category='PACKAGE_PRESET',
            method=method, base_url=_package_base_url(package), path=path,
            headers_config=[],
            query_config=list(payload.get('query_config') or []), body_template=payload.get('body_template'),
            auth_type=(package.auth_policy or {}).get('auth_type'), data_path=payload.get('data_path'),
            field_mappings=list(payload.get('field_mappings') or []),
            allowed_domains=list(package.host_allowlist or []), tags=['package-preset', package.package_code],
            description=payload.get('description'),
        )
    except ApiTemplateError as error:
        raise HTTPException(422, error.message) from error
    template = (await db.execute(select(UcpApiTemplate).where(UcpApiTemplate.template_code == template_code))).scalar_one()
    template.package_id, template.operation_definition_id = package.id, item.id
    template.allowed_domains_snapshot, template.auth_policy_snapshot = list(package.host_allowlist or []), dict(package.auth_policy or {})
    item.executor_template_id = template.id
    await db.commit()
    await db.refresh(item)
    return _operation_item(item) | {'template_code': template_code, 'path': path}


@router.patch('/connector-packages/{package_code}/operations/{operation_id}')
async def route_update_package_operation(package_code: str, operation_id: int, payload: dict, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'U'))):
    package, item = await _package_by_code(db, package_code), None
    item = await _package_operation(db, package, operation_id)
    if item.status not in {'DRAFT', 'FAILED'}:
        raise HTTPException(409, '仅草稿或测试失败的业务能力可修改')
    template = await db.get(UcpApiTemplate, item.executor_template_id)
    if not template:
        raise HTTPException(409, '业务能力未绑定接口模板')
    if payload.get('headers_config'):
        raise HTTPException(422, '类型级只读动作不允许配置 Header 表单字段')
    for field in {'operation_name', 'object_code', 'input_schema', 'output_schema', 'required_scopes', 'masking_rules', 'error_rules'}:
        if field in payload:
            setattr(item, field, payload[field])
    try:
        item.input_schema = validate_schema(item.input_schema or {}, label='输入')
        item.output_schema = validate_schema(item.output_schema or {}, label='输出')
    except ActionContractError as error:
        raise HTTPException(422, str(error)) from error
    item.field_catalog = build_field_catalog(item.output_schema)
    item.sample_response, item.sample_schema_hash = None, None
    fields = {key: payload[key] for key in {
        'template_name', 'method', 'path', 'query_config', 'body_template',
        'data_path', 'field_mappings', 'description',
    } if key in payload}
    if 'path' in fields:
        fields['path'] = _safe_path(fields['path'])
    if 'method' in fields and str(fields['method']).upper() not in _READ_METHODS:
        raise HTTPException(422, '仅允许 GET 或查询型 POST')
    if fields:
        try:
            await update_template(
                db, template.template_code, allowed_domains=list(package.host_allowlist or []),
                auth_type=(package.auth_policy or {}).get('auth_type'), updated_by='package-editor', **fields,
            )
        except ApiTemplateError as error:
            raise HTTPException(422, error.message) from error
    item.status, item.approval_status = 'DRAFT', 'DRAFT'
    await db.commit()
    await db.refresh(item)
    return _operation_item(item)


@router.post('/connector-packages/{package_code}/operations/{operation_id}/test')
async def route_test_package_operation(package_code: str, operation_id: int, payload: dict, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'U'))):
    package = await _package_by_code(db, package_code)
    operation = await _package_operation(db, package, operation_id)
    result = await _test_package_operation(db, package, operation, int(payload.get('system_id') or 0), dict(payload.get('context') or {}))
    operation.tested_by_user_id = getattr(_user, 'id', None)
    await db.commit()
    return result


@router.post('/connector-packages/{package_code}/catalog-test-instance', status_code=201)
async def route_ensure_catalog_test_instance(package_code: str, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'U'))):
    package = await _package_by_code(db, package_code)
    existing = (await db.execute(select(UcpSystem).where(UcpSystem.package_id == package.id, UcpSystem.is_catalog_test_instance == 1).order_by(UcpSystem.id))).scalars().first()
    if existing:
        return {'id': existing.id, 'system_code': existing.system_code, 'system_name': existing.system_name, 'created': False}
    try:
        system = await create_system(
            db, system_code=f'CATALOG_TEST_{package.id}', system_name=f'{package.package_name}目录测试实例',
            system_type='CATALOG_TEST', created_by='catalog-action-test', package_id=package.id,
            instance_config={}, is_catalog_test_instance=True,
        )
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return {'id': system.id, 'system_code': system.system_code, 'system_name': system.system_name, 'created': True}


@router.post('/connector-packages/{package_code}/operations/{operation_id}/publish')
async def route_publish_package_operation(package_code: str, operation_id: int, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'U'))):
    operation = await _package_operation(db, await _package_by_code(db, package_code), operation_id)
    template = await db.get(UcpApiTemplate, operation.executor_template_id)
    if not template:
        raise HTTPException(409, '业务能力未绑定接口模板')
    if operation.status not in {'TESTED', 'PENDING_APPROVAL'}:
        raise HTTPException(409, '仅测试通过的业务能力可发布')
    if not operation.catalog_test_system_id:
        raise HTTPException(409, '缺少已通过测试的系统实例，无法发布')
    capability = (await db.execute(select(UcpSystemCapability).where(
        UcpSystemCapability.system_id == operation.catalog_test_system_id,
        UcpSystemCapability.operation_id == operation.id,
    ))).scalar_one_or_none()
    if not capability or not capability.credential_id or capability.verification_status != 'VERIFIED' or capability.connection_status != 'CONNECTED':
        raise HTTPException(409, '测试系统能力未完成有效验证，请重新测试后发布')
    try:
        await publish_template(db, template.template_code, 'package-operation')
    except ApiTemplateError as error:
        raise HTTPException(422, error.message) from error
    capability.enabled = True
    operation.status, operation.approval_status, operation.version = 'PUBLISHED', 'PUBLISHED', template.version
    operation.published_by_user_id = getattr(_user, 'id', None)
    await db.commit()
    return _operation_item(operation)


@router.post('/connector-packages/{package_code}/operations/{operation_id}/disable')
async def route_disable_package_operation(package_code: str, operation_id: int, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'U'))):
    operation = await _package_operation(db, await _package_by_code(db, package_code), operation_id)
    operation.status, operation.approval_status = 'DISABLED', 'DISABLED'
    await db.commit()
    return _operation_item(operation)


@router.post('/connector-packages/{package_code}/operations/openapi/import', status_code=201)
async def route_import_package_openapi(package_code: str, payload: dict, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'C'))):
    package = await _package_by_code(db, package_code)
    try:
        preview = preview_openapi(
            dict(payload.get('document') or {}), allowed_domains=list(package.host_allowlist or []),
            code_prefix=f'PKG{package.id}',
        )
        templates = await create_openapi_drafts(
            db, preview['operations'], list(payload.get('selected_operation_ids') or []), 'package-openapi',
        )
    except (OpenApiImportError, ApiTemplateError) as error:
        raise HTTPException(422, str(error)) from error
    candidates = {item['template_code']: item for item in preview['operations']}
    created = []
    for template_data in templates:
        template = await db.get(UcpApiTemplate, template_data['id'])
        candidate = candidates[template.template_code]
        suffix = template.template_code.rsplit('_', 1)[-1]
        operation = UcpOperationDefinition(
            package_id=package.id, source_type='OPENAPI', approval_status='DRAFT',
            object_code='CUSTOM', operation_code=suffix, operation_name=template.template_name,
            adapter_code='GENERIC_HTTP_ACTION_ADAPTER', input_schema={}, output_schema={}, risk_level='read_low',
            version='0.1.0', status='DRAFT', executor_template_id=template.id,
        )
        db.add(operation)
        await db.flush()
        template.package_id, template.operation_definition_id = package.id, operation.id
        template.allowed_domains_snapshot, template.auth_policy_snapshot = list(package.host_allowlist or []), dict(package.auth_policy or {})
        created.append(_operation_item(operation) | {'template_code': template.template_code, 'path': candidate['path']})
    await db.commit()
    return {'items': created, 'rejected': preview['rejected']}


@router.post('/connector-packages/{package_code}/operations/openapi/preview')
async def route_preview_package_openapi(package_code: str, payload: dict, db: AsyncSession = Depends(get_session), _user=Depends(require_op('ucp.connector_catalog', 'V'))):
    package = await _package_by_code(db, package_code)
    try:
        return preview_openapi(
            dict(payload.get('document') or {}), allowed_domains=list(package.host_allowlist or []),
            code_prefix=f'PKG{package.id}',
        )
    except OpenApiImportError as error:
        raise HTTPException(422, str(error)) from error
