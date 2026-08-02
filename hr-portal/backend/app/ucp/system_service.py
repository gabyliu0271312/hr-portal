"""Phase 4: 接入系统 service 层

- UcpSystem  业务系统（北森/飞书）
- UcpResource 数据资源（员工表/组织表）
- UcpCredential 凭证（解耦，可被 N 个 resource 共享）

Phase 5-4: resource JSON 字段按 adapter schema 校验
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpSystem,
    UcpResource,
    UcpCredential,
    UcpPipelineExecution,
    UcpPipelineTemplate,
    UcpEventDelivery,
    UcpConnectorPackage,
    UcpResourceDataObject,
    UcpEventDefinition,
)
from app.ucp.adapter_schema import (
    extract_categories,
    validate_payload_against_schema,
)
from app.ucp.webhook_ingress import validate_webhook_ingress_protocol
from app.connectors.catalog import (
    find_connector_type_by_adapter,
    get_connector_type,
)


class ResourceSchemaError(ValueError):
    """resource 字段不符合 adapter schema."""


def _validate_webhook_ingress_credential(
    protocol: dict[str, Any] | None,
    credential: UcpCredential | None,
) -> None:
    ingress = (protocol or {}).get("ingress") if isinstance(protocol, dict) else None
    strategy = str((ingress or {}).get("verification_strategy") or "NONE").upper()
    if strategy not in {"HMAC_SHA256", "HMAC_SHA256_TIMESTAMPED"}:
        return
    if credential is None or credential.auth_type != "hmac_sha256_timestamped":
        raise ValueError("WEBHOOK_INGRESS_REQUIRES_HMAC_TIMESTAMPED_CREDENTIAL")


def resolve_resource_connector_type(resource: UcpResource) -> str | None:
    """Return a stable product connector type for new and legacy resources."""
    if resource.connector_type:
        return resource.connector_type
    legacy = find_connector_type_by_adapter(resource.adapter_code)
    return legacy["code"] if legacy else None


def resource_template_defaults(template: UcpConnectorPackage) -> dict[str, Any]:
    metadata = template.system_schema or {}
    defaults = metadata.get("resource_defaults") or {}
    if not isinstance(defaults, dict):
        raise ValueError("RESOURCE_TEMPLATE_DEFAULTS_INVALID")
    return dict(defaults)

def resolve_resource_template_defaults(template: UcpConnectorPackage) -> tuple[str, str]:
    """Return the stable resource identity declared by an instance-resource template."""
    metadata = template.system_schema or {}
    defaults = resource_template_defaults(template)
    resource_code = str(metadata.get("resource_code") or defaults.get("resource_code") or template.package_code).strip()
    resource_name = str(metadata.get("resource_name") or defaults.get("resource_name") or template.package_name).strip()
    if not resource_code or not resource_name:
        raise ValueError("RESOURCE_TEMPLATE_DEFAULTS_INVALID")
    return resource_code, resource_name

def serialize_resource(resource: UcpResource) -> dict[str, Any]:
    """Product DTO. Adapter codes stay available only for legacy runtime compatibility."""
    return {
        "id": resource.id,
        "system_id": resource.system_id,
        "system_code": getattr(resource, "system_code", None),
        "resource_code": resource.resource_code,
        "resource_name": resource.resource_name,
        "resource_template_id": getattr(resource, "source_template_id", None),
        "resource_template_code": getattr(resource, "source_template_code", None),
        "connector_type": resolve_resource_connector_type(resource),
        "credential_id": resource.credential_id,
        "protocol": resource.protocol,
        "report_config": resource.report_config,
        "mapping_config": resource.mapping_config,
        "file_config": resource.file_config,
        "scheduling": resource.scheduling,
        "notification_config": resource.notification_config,
        "retry_config": resource.retry_config,
        "circuit_breaker_config": resource.circuit_breaker_config,
        "test_status": resource.test_status,
        "test_result": resource.test_result,
        "test_time": resource.test_time,
        "status": resource.status,
        "created_at": resource.created_at,
        "updated_at": resource.updated_at,
    }


def _resolve_connector_for_write(
    connector_type: str | None,
    adapter_code: str | None,
) -> tuple[str | None, str | None]:
    """Map a product connector type to its private runtime adapter."""
    if not connector_type:
        return None, adapter_code
    connector = get_connector_type(connector_type, include_internal=True)
    if not connector or not connector.get("supports_ucp"):
        raise ResourceSchemaError("不支持的接入类型")
    if connector.get("connection_kind") == "EVENT_INGRESS":
        return connector["code"], None
    if connector.get("connection_kind") != "DATA_OBJECT":
        raise ResourceSchemaError("标准 SaaS 请在业务能力中启用，不能创建为数据资源")
    mapped_adapter = connector.get("ucp_adapter_code")
    if not mapped_adapter:
        raise ResourceSchemaError("该接入类型尚未配置运行适配器")
    return connector["code"], mapped_adapter


# ===== UcpSystem =====


async def list_systems(
    db: AsyncSession, system_type: str | None = None, is_active: int | None = None
) -> list[UcpSystem]:
    stmt = select(UcpSystem)
    if system_type:
        stmt = stmt.where(UcpSystem.system_type == system_type)
    if is_active is not None:
        stmt = stmt.where(UcpSystem.is_active == is_active)
    stmt = stmt.order_by(UcpSystem.system_code)
    r = await db.execute(stmt)
    return list(r.scalars().all())


async def get_system(db: AsyncSession, system_id: int) -> UcpSystem | None:
    return await db.get(UcpSystem, system_id)


async def get_system_by_code(db: AsyncSession, system_code: str) -> UcpSystem | None:
    stmt = select(UcpSystem).where(UcpSystem.system_code == system_code)
    r = await db.execute(stmt)
    return r.scalar_one_or_none()


async def list_system_resource_templates(
    db: AsyncSession, system_id: int
) -> list[UcpConnectorPackage]:
    system = await db.get(UcpSystem, system_id)
    if system is None:
        raise ValueError("SYSTEM_NOT_FOUND")
    if system.package_id is None:
        return []
    parent_package = await db.get(UcpConnectorPackage, system.package_id)
    if parent_package is None:
        return []
    templates = list(
        (
            await db.execute(
                select(UcpConnectorPackage)
                .where(
                    UcpConnectorPackage.category == "INSTANCE_RESOURCE",
                    UcpConnectorPackage.status == "PUBLISHED",
                )
                .order_by(UcpConnectorPackage.package_code)
            )
        ).scalars()
    )
    existing_template_codes = set(
        (
            await db.execute(
                select(UcpResource.source_template_id).where(
                    UcpResource.system_id == system_id,
                    UcpResource.source_template_id.is_not(None),
                )
            )
        ).scalars()
    )
    return [
        item
        for item in templates
        if str((item.system_schema or {}).get("parent_package_code") or "").upper()
        == parent_package.package_code.upper()
        and item.id not in existing_template_codes
    ]


async def create_system(
    db: AsyncSession,
    *,
    system_code: str,
    system_name: str,
    system_type: str = "CUSTOM",
    icon: str | None = None,
    owner: str | None = None,
    description: str | None = None,
    created_by: str | None = None,
    package_id: int | None = None,
    catalog_version: str | None = None,
    connection_mode: str | None = None,
    instance_config: dict[str, Any] | None = None,
    is_catalog_test_instance: bool = False,
) -> UcpSystem:
    if instance_config is not None and not isinstance(instance_config, dict):
        raise ValueError('系统实例配置必须是对象')
    normalized_instance_config = dict(instance_config or {})
    package = None
    if package_id is not None:
        package = await db.get(UcpConnectorPackage, package_id)
        if package is None:
            raise ValueError('接入类型不存在')
        if package.status != 'PUBLISHED' or package.deprecated_at is not None:
            raise ValueError('接入类型未发布或已弃用，不能用于新增系统')
        if package.category == 'INSTANCE_RESOURCE':
            raise ValueError('实例资源必须在已接入系统的“资源管理”中新增，不能作为独立系统创建')
        connection_mode = package.category or package.connection_mode
        catalog_version = package.version
        schema_fields = (package.system_schema or {}).get('fields') or []
        allowed_keys = {str(field.get('key')) for field in schema_fields if isinstance(field, dict) and field.get('key')}
        unknown_keys = set(normalized_instance_config) - allowed_keys
        if unknown_keys:
            raise ValueError(f'系统实例配置包含未定义字段：{", ".join(sorted(unknown_keys))}')
        missing_keys = [
            str(field['key'])
            for field in schema_fields
            if isinstance(field, dict) and field.get('key') and field.get('required') and normalized_instance_config.get(field['key']) in (None, '')
        ]
        if missing_keys:
            raise ValueError(f'请填写必填系统字段：{", ".join(missing_keys)}')
    obj = UcpSystem(
        system_code=system_code,
        system_name=system_name,
        system_type=system_type,
        icon=icon,
        owner=owner,
        description=description,
        created_by=created_by,
        package_id=package_id,
        catalog_version=catalog_version,
        connection_mode=connection_mode,
        instance_config=normalized_instance_config,
        is_catalog_test_instance=1 if is_catalog_test_instance else 0,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def update_system(db: AsyncSession, system_id: int, **fields) -> UcpSystem | None:
    obj = await db.get(UcpSystem, system_id)
    if not obj:
        return None
    for k, v in fields.items():
        if v is not None and hasattr(obj, k):
            setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_system(db: AsyncSession, system_id: int) -> bool:
    obj = await db.get(UcpSystem, system_id)
    if not obj:
        return False
    # 解绑该系统下的所有凭证 (FK ON DELETE RESTRICT, 凭证保留不删)
    from sqlalchemy import update
    await db.execute(
        update(UcpCredential)
        .where(UcpCredential.system_id == system_id)
        .values(system_id=None)
    )
    await db.delete(obj)
    await db.commit()
    return True


# ===== UcpResource =====


async def list_resources(
    db: AsyncSession,
    *,
    system_id: int | None = None,
    credential_id: int | None = None,
    status: int | None = None,
) -> list[UcpResource]:
    # Phase 5-2: join system 以便返回 system_code (前端订阅资源下拉用)
    stmt = select(UcpResource, UcpSystem.system_code).join(
        UcpSystem, UcpResource.system_id == UcpSystem.id
    )
    if system_id is not None:
        stmt = stmt.where(UcpResource.system_id == system_id)
    if credential_id is not None:
        stmt = stmt.where(UcpResource.credential_id == credential_id)
    if status is not None:
        stmt = stmt.where(UcpResource.status == status)
    stmt = stmt.order_by(UcpResource.system_id, UcpResource.resource_code)
    r = await db.execute(stmt)
    rows = r.all()
    # 列表保持原行为(只返回 UcpResource),但把 system_code 挂到对象属性
    resources: list[UcpResource] = []
    for res, sys_code in rows:
        setattr(res, "system_code", sys_code)
        resources.append(res)
    return resources


async def get_resource(db: AsyncSession, resource_id: int) -> UcpResource | None:
    return await db.get(UcpResource, resource_id)


def _validate_template_credential_requirement(template: UcpConnectorPackage, credential: UcpCredential | None) -> None:
    requirement = (template.system_schema or {}).get("credential_requirement") or {}
    expected_auth_type = str(requirement.get("auth_type") or "").strip()
    required_secret_keys = {str(key) for key in requirement.get("required_secret_keys") or []}
    if not expected_auth_type and not required_secret_keys:
        return
    if credential is None:
        raise ValueError("RESOURCE_TEMPLATE_CREDENTIAL_REQUIRED")
    if expected_auth_type and expected_auth_type != "none" and credential.auth_type != expected_auth_type:
        raise ValueError("RESOURCE_TEMPLATE_CREDENTIAL_AUTH_TYPE_MISMATCH")
    if missing_keys := required_secret_keys - set((credential.secrets_encrypted or {}).keys()):
        raise ValueError("RESOURCE_TEMPLATE_CREDENTIAL_SECRET_MISSING")

async def _create_template_default_objects(
    db: AsyncSession,
    resource: UcpResource,
    template: UcpConnectorPackage,
) -> None:
    object_template = (template.system_schema or {}).get("object_template") or {}
    for default_object in object_template.get("default_objects") or []:
        definition_code = str(default_object.get("event_definition_code") or "").strip()
        if not definition_code:
            raise ValueError("RESOURCE_TEMPLATE_DEFAULT_EVENT_INVALID")
        definition = (
            await db.execute(
                select(UcpEventDefinition).where(
                    UcpEventDefinition.event_code == definition_code,
                    UcpEventDefinition.status == "PUBLISHED",
                ).order_by(UcpEventDefinition.updated_at.desc())
            )
        ).scalars().first()
        if definition is None:
            raise ValueError("RESOURCE_TEMPLATE_DEFAULT_EVENT_UNAVAILABLE")
        db.add(UcpResourceDataObject(
            resource_id=resource.id,
            connector_type=resource.connector_type or "webhook_ingress",
            object_code=str(default_object.get("object_code") or definition.event_code.upper().replace(".", "_"))[:64],
            object_name=str(default_object.get("object_name") or definition.event_name)[:128],
            object_type="EVENT_TYPE",
            event_definition_id=definition.id,
            event_config={},
            verification_status="PENDING",
            schema_version=definition.version,
            is_active=int(default_object.get("is_active", True)),
            created_by=resource.created_by,
        ))

async def create_resource(
    db: AsyncSession,
    *,
    system_id: int,
    resource_code: str | None = None,
    resource_name: str | None = None,
    connector_type: str | None = None,
    adapter_code: str | None = None,
    credential_id: int | None = None,
    protocol: dict | None = None,
    report_config: dict | None = None,
    mapping_config: dict | None = None,
    file_config: dict | None = None,
    scheduling: dict | None = None,
    notification_config: dict | None = None,
    retry_config: dict | None = None,
    circuit_breaker_config: dict | None = None,
    created_by: str | None = None,
    resource_template_code: str | None = None,
    # Phase 5-4: 跳过 schema 校验(供导入脚本/迁移使用)
    skip_schema_validation: bool = False,
) -> UcpResource:
    if not resource_template_code:
        raise ValueError("RESOURCE_TEMPLATE_REQUIRED")
    system = await db.get(UcpSystem, system_id)
    if system is None:
        raise ValueError("SYSTEM_NOT_FOUND")
    if system.package_id is None:
        raise ValueError("SYSTEM_PACKAGE_REQUIRED")
    template = (
        await db.execute(
            select(UcpConnectorPackage).where(
                UcpConnectorPackage.package_code == resource_template_code.upper()
            )
        )
    ).scalar_one_or_none()
    if template is None or template.category != "INSTANCE_RESOURCE":
        raise ValueError("RESOURCE_TEMPLATE_NOT_FOUND")
    if template.status != "PUBLISHED":
        raise ValueError("RESOURCE_TEMPLATE_NOT_PUBLISHED")
    parent_package = await db.get(UcpConnectorPackage, system.package_id)
    metadata = template.system_schema or {}
    parent_package_code = str(metadata.get("parent_package_code") or "").upper()
    template_connector_type = str(metadata.get("resource_connector_type") or "")
    if not parent_package or parent_package.package_code.upper() != parent_package_code:
        raise ValueError("RESOURCE_TEMPLATE_PARENT_MISMATCH")
    template_connector_type, template_adapter_code = _resolve_connector_for_write(
        template_connector_type, None
    )
    resource_code, resource_name = resolve_resource_template_defaults(template)
    template_defaults = resource_template_defaults(template)
    duplicate = (
        await db.execute(
            select(UcpResource.id).where(
                UcpResource.system_id == system_id,
                UcpResource.resource_code == resource_code,
            )
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise ValueError("RESOURCE_TEMPLATE_ALREADY_ADDED")
    primary_credential_id = await find_credential_id_for_system(db, system_id)
    if primary_credential_id is None:
        raise ValueError("SYSTEM_PRIMARY_CREDENTIAL_REQUIRED")
    _validate_template_credential_requirement(template, await db.get(UcpCredential, primary_credential_id))
    obj = UcpResource(
        system_id=system_id,
        resource_code=resource_code,
        resource_name=resource_name,
        source_template_id=template.id,
        source_template_code=template.package_code,
        connector_type=template_connector_type,
        adapter_code=template_adapter_code,
        credential_id=primary_credential_id,
        protocol=template_defaults.get("protocol"),
        report_config=template_defaults.get("report_config"),
        mapping_config=template_defaults.get("mapping_config"),
        file_config=template_defaults.get("file_config"),
        scheduling=template_defaults.get("scheduling"),
        notification_config=template_defaults.get("notification_config"),
        retry_config=template_defaults.get("retry_config"),
        circuit_breaker_config=template_defaults.get("circuit_breaker_config"),
        created_by=created_by,
    )
    db.add(obj)
    await db.flush()
    await _create_template_default_objects(db, obj, template)
    await db.commit()
    await db.refresh(obj)
    return obj

    connector_type, adapter_code = _resolve_connector_for_write(connector_type, adapter_code)
    # Phase 5-4: 按 adapter schema 校验 8 个 JSON 字段
    if not skip_schema_validation:
        await _validate_resource_fields_against_schema(
            db,
            adapter_code=adapter_code,
            fields={
                "protocol": protocol,
                "report_config": report_config,
                "mapping_config": mapping_config,
                "file_config": file_config,
                "scheduling": scheduling,
                "notification_config": notification_config,
                "retry_config": retry_config,
                "circuit_breaker_config": circuit_breaker_config,
            },
        )

    obj = UcpResource(
        system_id=system_id,
        resource_code=resource_code,
        resource_name=resource_name,
        connector_type=connector_type,
        adapter_code=adapter_code,
        credential_id=credential_id,
        protocol=protocol,
        report_config=report_config,
        mapping_config=mapping_config,
        file_config=file_config,
        scheduling=scheduling,
        notification_config=notification_config,
        retry_config=retry_config,
        circuit_breaker_config=circuit_breaker_config,
        created_by=created_by,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def create_webhook_resource(
    db: AsyncSession,
    *,
    system_id: int,
    resource_code: str,
    resource_name: str,
    credential_id: int,
    protocol: dict[str, Any],
    created_by: str | None = None,
) -> UcpResource:
    system = await db.get(UcpSystem, system_id)
    if system is None:
        raise ValueError("SYSTEM_NOT_FOUND")
    duplicate = await db.scalar(
        select(UcpResource.id).where(
            UcpResource.system_id == system_id,
            UcpResource.resource_code == resource_code,
        )
    )
    if duplicate is not None:
        raise ValueError("RESOURCE_CODE_ALREADY_EXISTS")
    validate_webhook_ingress_protocol(protocol)
    obj = UcpResource(
        system_id=system_id,
        resource_code=resource_code,
        resource_name=resource_name,
        connector_type="webhook_ingress",
        credential_id=credential_id,
        protocol=protocol,
        status=0,
        created_by=created_by,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


def _changed_leaf_paths(before: Any, after: Any, prefix: str = "") -> set[str]:
    if isinstance(before, dict) and isinstance(after, dict):
        paths: set[str] = set()
        for key in set(before) | set(after):
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            paths |= _changed_leaf_paths(before.get(key), after.get(key), child_prefix)
        return paths
    return {prefix} if before != after and prefix else set()


async def _validate_resource_template_overrides(
    db: AsyncSession,
    resource: UcpResource,
    fields: dict[str, Any],
) -> None:
    source_template_id = getattr(resource, "source_template_id", None)
    source_template_code = getattr(resource, "source_template_code", None)
    if not source_template_id and not source_template_code:
        return
    template = await db.get(UcpConnectorPackage, source_template_id) if source_template_id else (
        await db.execute(select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == source_template_code))
    ).scalar_one_or_none()
    policy = (template.system_schema or {}).get("instance_override_policy") if template else None
    allowed_fields = set((policy or {}).get("allowed_fields") or [])
    always_allowed = {"credential_id", "status"}
    changed_fields = {
        field_name
        for field_name, value in fields.items()
        if field_name in {"resource_name", "protocol", "report_config", "mapping_config", "file_config", "scheduling", "notification_config", "retry_config", "circuit_breaker_config"}
        and value != getattr(resource, field_name)
    }
    disallowed = {
        field_name
        for field_name in changed_fields
        if field_name != "protocol" and field_name not in allowed_fields
    }
    if "protocol" in changed_fields:
        disallowed |= {
            path
            for path in _changed_leaf_paths(resource.protocol or {}, fields["protocol"] or {}, "protocol")
            if path not in allowed_fields
        }
    if disallowed:
        raise ValueError("RESOURCE_TEMPLATE_OVERRIDE_NOT_ALLOWED")

async def update_resource(
    db: AsyncSession,
    resource_id: int,
    *,
    skip_schema_validation: bool = False,
    **fields,
) -> UcpResource | None:
    obj = await db.get(UcpResource, resource_id)
    if not obj:
        return None

    inherited_fields = {"resource_code", "connector_type", "adapter_code"}
    for field_name in inherited_fields & set(fields):
        if fields[field_name] != getattr(obj, field_name):
            raise ValueError("RESOURCE_TEMPLATE_INHERITED_FIELDS_IMMUTABLE")
        fields.pop(field_name)
    await _validate_resource_template_overrides(db, obj, fields)

    if str(getattr(obj, "connector_type", "") or "").lower() in {"webhook_ingress", "webhook"}:
        validate_webhook_ingress_protocol(fields.get("protocol", obj.protocol))

    # Phase 5-4: 收集将要写入的 JSON 字段,做合并校验
    # 1) 先确定最终 adapter_code (可能本次更新, 也可能沿用旧的)
    final_adapter_code = fields.get("adapter_code", obj.adapter_code)
    if not skip_schema_validation:
        merged: dict[str, Any] = {
            "protocol": fields.get("protocol", obj.protocol),
            "report_config": fields.get("report_config", obj.report_config),
            "mapping_config": fields.get("mapping_config", obj.mapping_config),
            "file_config": fields.get("file_config", obj.file_config),
            "scheduling": fields.get("scheduling", obj.scheduling),
            "notification_config": fields.get(
                "notification_config", obj.notification_config
            ),
            "retry_config": fields.get("retry_config", obj.retry_config),
            "circuit_breaker_config": fields.get(
                "circuit_breaker_config", obj.circuit_breaker_config
            ),
        }
        # 过滤 None: 客户端未传 = 不动 = 用对象原值
        merged = {k: v for k, v in merged.items() if v is not None}
        await _validate_resource_fields_against_schema(
            db, adapter_code=final_adapter_code, fields=merged
        )
    credential_id = fields.get("credential_id", obj.credential_id)
    credential = await db.get(UcpCredential, credential_id) if credential_id else None
    if getattr(obj, "source_template_id", None):
        template = await db.get(UcpConnectorPackage, obj.source_template_id)
        if template is not None:
            _validate_template_credential_requirement(template, credential)
    _validate_webhook_ingress_credential(
        fields.get("protocol", obj.protocol), credential
    )

    for k, v in fields.items():
        if hasattr(obj, k):
            setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


async def _validate_resource_fields_against_schema(
    db: AsyncSession,
    *,
    adapter_code: str | None,
    fields: dict[str, Any],
) -> None:
    """根据 adapter schema 校验 resource 的 JSON 字段 payload.

    - adapter_code 为空 / schema 为空 / schema 无 categories → 跳过校验
    - 任一字段类型错误 / 必填缺失 → 抛 ResourceSchemaError
    """
    if not adapter_code:
        return
    # 避免循环 import
    from app.ucp.adapter_registry import get_adapter_definition

    defn = await get_adapter_definition(db, adapter_code)
    if defn is None or not defn.schema_json:
        return
    categories = extract_categories(defn.schema_json)
    if not categories:
        return
    errors = validate_payload_against_schema(fields, categories)
    if errors:
        # 取首条作主错误, 其余 join
        raise ResourceSchemaError("; ".join(errors))


async def delete_resource(db: AsyncSession, resource_id: int) -> bool:
    obj = await db.get(UcpResource, resource_id)
    if not obj:
        return False
    await db.delete(obj)
    await db.commit()
    return True


# ===== 聚合视图：系统 + 资源 + 凭证 =====


async def get_system_overview(
    db: AsyncSession, system_id: int
) -> dict[str, Any] | None:
    """系统详情：包含其下所有资源 + 凭证.

    凭证查询策略：直接按 system_id 查 ucp_credentials
    （不依赖 resource.credential_id 间接查），因为凭证可能在
    还没有资源的情况下就已经录入（Phase 4-2 凭证强绑 system 模式）。
    """
    sys = await db.get(UcpSystem, system_id)
    if not sys:
        return None
    resources = await list_resources(db, system_id=system_id)

    # 直接按 system_id 查凭证（核心修复：之前从 resource.credential_id 间接查）
    cred_stmt = (
        select(UcpCredential)
        .where(UcpCredential.system_id == system_id)
        .order_by(UcpCredential.is_primary.desc(), UcpCredential.id.asc())
    )
    cred_r = await db.execute(cred_stmt)
    credentials = list(cred_r.scalars().all())

    return {
        "system": sys,
        "resources": resources,
        "credentials": credentials,
    }


async def list_systems_with_resource_count(
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """列出所有系统 + 资源数量 + 凭证数量（聚合查询）."""
    sys_list = await list_systems(db)

    # 按 system_id 聚合资源数
    stmt = (
        select(
            UcpResource.system_id,
            func.count(UcpResource.id).label("resource_count"),
            func.sum(func.coalesce(UcpResource.status, 0)).label("active_count"),
        )
        .group_by(UcpResource.system_id)
    )
    r = await db.execute(stmt)
    res_map = {row.system_id: row for row in r.all()}

    out: list[dict[str, Any]] = []
    for s in sys_list:
        agg = res_map.get(s.id)
        out.append(
            {
                "system": s,
                "resource_count": int(agg.resource_count) if agg else 0,
                "active_count": int(agg.active_count or 0) if agg else 0,
            }
        )
    return out


async def find_credential_id_for_system(
    db: AsyncSession, system_id: int
) -> int | None:
    """查找该系统下任意 resource 使用的凭证 ID（用于「添加表」时默认带出凭证）."""
    stmt = (
        select(UcpCredential.id)
        .where(UcpCredential.system_id == system_id)
        .where(UcpCredential.is_primary == 1)
        .order_by(UcpCredential.id.desc())
        .limit(1)
    )
    r = await db.execute(stmt)
    return r.scalar_one_or_none()


async def get_systems_overview(db: AsyncSession) -> list[dict[str, Any]]:
    """系统卡片聚合数据：资源数、流水线数、24h 同步次数、成功率、凭证状态。

    用于前端首页系统卡片，所有指标来自真实数据，不根据系统名称硬编码推断。
    """
    # 1. 系统列表 + 资源数
    sys_data = await list_systems_with_resource_count(db)

    # 2. 资源 → 系统映射
    res_stmt = select(UcpResource.id, UcpResource.system_id)
    res_rows = (await db.execute(res_stmt)).all()
    resource_system: dict[int, int] = {r.id: r.system_id for r in res_rows}

    # 3. 流水线模板 → 系统（通过 nodes_json 中的 resource_id）
    tpl_stmt = select(UcpPipelineTemplate)
    tpls = (await db.execute(tpl_stmt)).scalars().all()
    pipeline_per_system: dict[int, set[int]] = defaultdict(set)
    for tpl in tpls:
        nodes = tpl.nodes_json or []
        for n in nodes:
            cfg = n.get("config") if isinstance(n, dict) else {}
            res_id = cfg.get("resource_id")
            if isinstance(res_id, int) and res_id in resource_system:
                pipeline_per_system[resource_system[res_id]].add(tpl.id)

    # 4. 24h 执行统计（按 pipeline_code 聚合，再反查系统）
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    exec_stmt = (
        select(UcpPipelineExecution)
        .where(UcpPipelineExecution.created_at >= since)
    )
    execs = (await db.execute(exec_stmt)).scalars().all()

    # pipeline_code → system_id（通过模板 nodes_json 反查）
    tpl_code_to_systems: dict[str, set[int]] = defaultdict(set)
    for tpl in tpls:
        nodes = tpl.nodes_json or []
        for n in nodes:
            cfg = n.get("config") if isinstance(n, dict) else {}
            res_id = cfg.get("resource_id")
            if isinstance(res_id, int) and res_id in resource_system:
                tpl_code_to_systems[tpl.template_code].add(resource_system[res_id])

    exec_per_system: dict[int, dict] = defaultdict(lambda: {"total": 0, "success": 0, "latest": None})
    for e in execs:
        sys_ids = tpl_code_to_systems.get(e.pipeline_code, set())
        for sid in sys_ids:
            exec_per_system[sid]["total"] += 1
            if e.status in ("SUCCESS", "PARTIAL_SUCCESS"):
                exec_per_system[sid]["success"] += 1
            if e.started_at and (
                exec_per_system[sid]["latest"] is None
                or e.started_at > exec_per_system[sid]["latest"]
            ):
                exec_per_system[sid]["latest"] = e.started_at

    # 5. 凭证状态（过期检测）
    cred_stmt = select(UcpCredential)
    creds = (await db.execute(cred_stmt)).scalars().all()
    now = datetime.now(timezone.utc)
    cred_per_system: dict[int, dict] = defaultdict(lambda: {"total": 0, "expired": 0, "warn": 0})
    for c in creds:
        if not c.system_id:
            continue
        sid = c.system_id
        cred_per_system[sid]["total"] += 1
        if c.expires_at:
            exp = c.expires_at.replace(tzinfo=timezone.utc) if c.expires_at.tzinfo is None else c.expires_at
            if exp < now:
                cred_per_system[sid]["expired"] += 1
            elif (exp - now).days < 7:
                cred_per_system[sid]["warn"] += 1

    # 6. 死信数量（按 trigger_code 模糊匹配 system_code）
    dl_stmt = (
        select(UcpEventDelivery.trigger_code, func.count(UcpEventDelivery.id))
        .where(UcpEventDelivery.status == "DEAD_LETTER")
        .group_by(UcpEventDelivery.trigger_code)
    )
    dl_rows = (await db.execute(dl_stmt)).all()
    dl_count_per_system: dict[int, int] = defaultdict(int)
    for item in sys_data:
        sc = item["system"].system_code.lower()
        for dl_row in dl_rows:
            if dl_row.trigger_code and sc in dl_row.trigger_code.lower():
                dl_count_per_system[item["system"].id] += dl_row[1]

    # 7. 组装返回
    result: list[dict[str, Any]] = []
    for item in sys_data:
        s = item["system"]
        sid = s.id
        exec_stats = exec_per_system.get(sid, {})
        exec_total = exec_stats.get("total", 0)
        exec_success = exec_stats.get("success", 0)
        cred_stats = cred_per_system.get(sid, {})

        if cred_stats.get("expired", 0) > 0:
            cred_status = "expired"
        elif cred_stats.get("warn", 0) > 0:
            cred_status = "warning"
        elif cred_stats.get("total", 0) == 0:
            cred_status = "none"
        else:
            cred_status = "ok"

        if not s.is_active:
            health_status = "offline"
        elif cred_status == "expired":
            health_status = "blocked"
        elif exec_total > 0 and exec_success == 0:
            health_status = "failing"
        elif cred_status == "warning":
            health_status = "warning"
        elif exec_total == 0 and cred_stats.get("total", 0) == 0:
            health_status = "unconfigured"
        else:
            health_status = "ok"

        result.append({
            "system_id": sid,
            "resource_count": item["resource_count"],
            "active_count": item["active_count"],
            "pipeline_count": len(pipeline_per_system.get(sid, set())),
            "sync_count_24h": exec_total,
            "success_count_24h": exec_success,
            "success_rate_24h": round(exec_success / exec_total, 4) if exec_total > 0 else None,
            "dead_letter_count": dl_count_per_system.get(sid, 0),
            "latest_run_at": exec_stats.get("latest").isoformat() if exec_stats.get("latest") else None,
            "credential_status": cred_status,
            "credential_count": cred_stats.get("total", 0),
            "health_status": health_status,
        })

    return result
