"""Generic design-time field discovery for UCP connector resources.

用途：把「任意已接入 UCP 资源/数据对象」的真实响应字段目录暴露给流程编排设计器，
供 TRANSFORM / 资产写入 / 条件分支等节点作为源字段使用。不绑定具体厂商：

- connector_type 能映射到 make_client 的数据源（北森报表/北森API/飞书表格/
  飞书多维表格/通用HTTP）时，走 client.discover_fields()；
- 否则回退到 adapter schema 的 categories（静态字段目录）。

字段目录由调用方（前端 CONNECTOR 节点配置）持久化到节点 config.output_field_catalog，
作为流程模板的一部分，运行时无需再次发现。
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.catalog import get_connector_type
from app.ucp.credential_service import decrypt_credential_secrets
from app.ucp.models import UcpResource, UcpResourceDataObject

logger = logging.getLogger(__name__)


class FieldCatalogError(ValueError):
    """Raised when a resource cannot produce a field catalog."""


def _infer_field_type(samples: list[Any]) -> str:
    """从样本值推断标量类型；无样本时默认 string。"""
    for value in samples:
        if value is None:
            continue
        if isinstance(value, bool):
            return "boolean"
        if isinstance(value, (int, float)):
            return "number"
        if isinstance(value, str):
            try:
                float(value)
                return "number"
            except (TypeError, ValueError):
                pass
    return "string"


async def _discover_via_client(
    connector: dict[str, Any],
    settings: dict[str, Any],
    secrets: dict[str, Any],
) -> list[dict[str, Any]] | None:
    """尝试用通用 make_client 数据源客户端发现字段；不支持返回 None。"""
    from app.datasources.beisen_client import make_client

    source_type = connector.get("code")
    if not source_type:
        return None
    try:
        client = make_client(source_type, settings, secrets)
    except Exception:
        return None
    if not hasattr(client, "discover_fields"):
        return None
    try:
        return await client.discover_fields()
    except Exception as error:
        message = str(error)
        if "BEISEN_REPORT_ID" in message:
            raise FieldCatalogError(
                "北森报表缺少 Report ID：请在「资源数据对象」配置中填写 report_id 后重试"
            ) from error
        raise FieldCatalogError(f"字段发现失败：{message}") from error


def _discover_via_adapter_schema(
    resource: UcpResource,
) -> list[dict[str, Any]] | None:
    """回退：从 adapter schema categories 提取静态字段目录。"""
    from app.ucp.adapter_registry import get_adapter_definition
    from app.ucp.adapter_schema import extract_categories

    defn = get_adapter_definition(resource.adapter_code or "")
    if defn is None:
        return None
    categories = extract_categories(defn.schema_json)
    fields: list[dict[str, Any]] = []
    for category in categories:
        for field in category.get("fields") or []:
            name = str(field.get("key") or field.get("name") or "")
            if not name:
                continue
            fields.append({
                "source_key": name,
                "label": str(field.get("label") or name),
                "sample_values": [],
            })
    return fields if fields else None


def _connector_settings(
    connector: dict[str, Any],
    resource: UcpResource,
    object_config: dict[str, Any] | None,
) -> dict[str, Any]:
    """把 UCP 资源配置映射为 make_client 的 settings。

    优先级：连接器默认值 + resource.protocol/report_config + 数据对象 object_config。
    """
    defaults = connector.get("ucp_connection_defaults") or {}
    settings = {**defaults}
    settings.update(resource.protocol or {})
    settings.update(resource.report_config or {})
    if object_config:
        settings.update(object_config)
    # 把北森报表的 Report ID 等对象字段映射成客户端期望的 key。
    if connector.get("protocol") == "beisen_report":
        report_id = (
            (object_config or {}).get("report_id")
            or settings.get("BEISEN_REPORT_ID")
            or settings.get("report_id")
        )
        if report_id:
            settings["BEISEN_REPORT_ID"] = str(report_id)
    return settings


async def build_resource_field_catalog(
    db: AsyncSession,
    resource: UcpResource,
    data_object_id: int | None = None,
) -> list[dict[str, Any]]:
    """为 UCP 资源（可选数据对象）构建设计期字段目录。

    返回统一结构：[{source_key, label, sample_values, type}]。
    """
    connector_type = resource.connector_type or ""
    connector = get_connector_type(connector_type, include_internal=True)
    if connector is None:
        connector = None

    object_config: dict[str, Any] | None = None
    if data_object_id is not None:
        obj = await db.get(UcpResourceDataObject, data_object_id)
        if obj is None or obj.resource_id != resource.id:
            raise FieldCatalogError("数据对象不存在或不属于该资源")
        object_config = obj.object_config or {}

    secrets: dict[str, Any] = {}
    if resource.credential_id:
        try:
            secrets = await decrypt_credential_secrets(db, resource.credential_id)
        except Exception as error:
            logger.warning("[field_catalog] 凭证解密失败 resource=%s: %s", resource.resource_code, error)

    fields: list[dict[str, Any]] | None = None
    if connector is not None:
        settings = _connector_settings(connector, resource, object_config)
        fields = await _discover_via_client(connector, settings, secrets)
    if fields is None:
        fields = _discover_via_adapter_schema(resource)
    if fields is None:
        raise FieldCatalogError("该接入类型暂不支持设计期字段发现")

    catalog = []
    for field in fields:
        source_key = str(field.get("source_key") or "")
        if not source_key:
            continue
        samples = list(field.get("sample_values") or [])
        catalog.append({
            "source_key": source_key,
            "label": str(field.get("label") or source_key),
            "sample_values": samples[:5],
            "type": _infer_field_type(samples),
        })
    return catalog


async def list_resource_field_catalog(
    db: AsyncSession,
    resource_id: int,
    data_object_id: int | None = None,
) -> list[dict[str, Any]]:
    resource = await db.get(UcpResource, resource_id)
    if resource is None:
        raise FieldCatalogError("资源不存在")
    return await build_resource_field_catalog(db, resource, data_object_id=data_object_id)
