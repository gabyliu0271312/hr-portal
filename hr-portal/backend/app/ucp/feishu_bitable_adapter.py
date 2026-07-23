"""Feishu Bitable pull adapter for reusable UCP resources."""
from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.types import AdapterResult

FEISHU_OPEN_API = "https://open.feishu.cn/open-apis"
_TOKEN_PATH = "/auth/v3/tenant_access_token/internal"
_RECORDS_PATH = "/bitable/v1/apps/{app_token}/tables/{table_id}/records"


class FeishuBitableError(RuntimeError):
    pass


async def _get_tenant_access_token(secrets: dict[str, str]) -> str:
    direct_token = str(secrets.get("tenant_access_token") or "").strip()
    if direct_token:
        return direct_token
    app_id = str(secrets.get("app_id") or "").strip()
    app_secret = str(secrets.get("app_secret") or "").strip()
    if not app_id or not app_secret:
        raise FeishuBitableError("飞书凭证缺少 app_id/app_secret 或 tenant_access_token")
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            f"{FEISHU_OPEN_API}{_TOKEN_PATH}",
            json={"app_id": app_id, "app_secret": app_secret},
        )
    response.raise_for_status()
    body = response.json()
    if body.get("code", 0) != 0 or not body.get("tenant_access_token"):
        raise FeishuBitableError(f"飞书令牌获取失败: {body.get('msg') or body.get('code')}")
    return str(body["tenant_access_token"])


def _mapped_fields(fields: dict[str, Any], mapping: dict[str, Any]) -> dict[str, Any]:
    return {str(mapping.get(key) or key): value for key, value in fields.items()}


async def feishu_bitable_pull_adapter(
    params: dict[str, Any], secrets: dict[str, str], _db: AsyncSession
) -> AdapterResult:
    """Read records from one configured Feishu Bitable table."""
    app_token = str(params.get("app_token") or "").strip()
    table_id = str(params.get("table_id") or "").strip()
    if not app_token or not table_id:
        return AdapterResult(status="failed", error_code="BITABLE_CONFIG_INVALID", error_message="缺少 app_token 或 table_id")
    page_size = params.get("page_size", 100)
    max_records = params.get("max_records", 10000)
    if not isinstance(page_size, int) or not 1 <= page_size <= 500:
        return AdapterResult(status="failed", error_code="BITABLE_CONFIG_INVALID", error_message="page_size 必须在 1 到 500 之间")
    if not isinstance(max_records, int) or not 1 <= max_records <= 50000:
        return AdapterResult(status="failed", error_code="BITABLE_CONFIG_INVALID", error_message="max_records 必须在 1 到 50000 之间")
    mapping = params.get("field_mapping") or {}
    if not isinstance(mapping, dict):
        return AdapterResult(status="failed", error_code="BITABLE_CONFIG_INVALID", error_message="field_mapping 必须为对象")

    try:
        token = await _get_tenant_access_token(secrets)
        rows: list[dict[str, Any]] = []
        page_token: str | None = None
        page_count = 0
        truncated = False
        async with httpx.AsyncClient(timeout=30.0) as client:
            while len(rows) < max_records:
                query: dict[str, Any] = {"page_size": min(page_size, max_records - len(rows))}
                if page_token:
                    query["page_token"] = page_token
                if params.get("view_id"):
                    query["view_id"] = params["view_id"]
                filter_config = params.get("filter_config") or {}
                if isinstance(filter_config, dict) and filter_config.get("field_names"):
                    query["field_names"] = filter_config["field_names"]
                response = await client.get(
                    f"{FEISHU_OPEN_API}{_RECORDS_PATH.format(app_token=app_token, table_id=table_id)}",
                    params=query,
                    headers={"Authorization": f"Bearer {token}"},
                )
                response.raise_for_status()
                body = response.json()
                if body.get("code", 0) != 0:
                    raise FeishuBitableError(f"飞书多维表格读取失败: {body.get('msg') or body.get('code')}")
                data = body.get("data") or {}
                items = data.get("items") or []
                if not isinstance(items, list):
                    raise FeishuBitableError("飞书多维表格返回 records 格式异常")
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    fields = item.get("fields") or {}
                    if isinstance(fields, dict):
                        rows.append(_mapped_fields(fields, mapping))
                    if len(rows) >= max_records:
                        truncated = bool(data.get("has_more"))
                        break
                page_count += 1
                if not data.get("has_more") or not data.get("page_token"):
                    break
                page_token = str(data["page_token"])
        return AdapterResult(status="success", data=rows, row_count=len(rows), success_count=len(rows), extra={"page_count": page_count, "truncated": truncated, "app_token": app_token, "table_id": table_id})
    except httpx.HTTPStatusError as exc:
        return AdapterResult(status="failed", error_code="FEISHU_HTTP_ERROR", error_message=f"飞书接口响应异常: {exc.response.status_code}")
    except (httpx.HTTPError, FeishuBitableError) as exc:
        return AdapterResult(status="failed", error_code="FEISHU_BITABLE_ERROR", error_message=str(exc)[:500])
    except Exception as exc:
        return AdapterResult(status="failed", error_code="FEISHU_BITABLE_UNEXPECTED", error_message=str(exc)[:500])