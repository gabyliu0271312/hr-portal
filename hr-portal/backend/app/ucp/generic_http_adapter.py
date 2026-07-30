"""Controlled, read-only Generic HTTP adapter used by UCP resources."""
from __future__ import annotations

import asyncio
import re
import time
from collections import defaultdict, deque
from typing import Any
from urllib.parse import urljoin

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.masking import mask_sensitive_fields
from app.ucp.ssrf_guard import SSRFError, check_url
from app.ucp.template_engine import (
    build_system_context,
    extract_next_cursor,
    extract_response_data,
    extract_total,
    resolve_variables,
)
from app.ucp.types import AdapterResult


class GenericHttpPolicyError(ValueError):
    """Configuration or response violates the read-only HTTP policy."""


_PARAM_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,127}$")
_FORBIDDEN_HEADERS = {"host", "content-length", "transfer-encoding", "connection"}
_RATE_WINDOWS: dict[str, deque[float]] = defaultdict(deque)
_RATE_LOCK = asyncio.Lock()
_FEISHU_TOKENS: dict[str, tuple[str, float]] = {}


def _upstream_error_summary(response: httpx.Response) -> str:
    parts = [f"HTTP {response.status_code}"]
    content_type = response.headers.get("content-type", "").lower()
    if "json" not in content_type:
        return "; ".join(parts)
    try:
        payload = response.json()
    except ValueError:
        return "; ".join(parts)
    if not isinstance(payload, dict):
        return "; ".join(parts)
    for key in ("code", "msg", "log_id"):
        value = payload.get(key)
        if value not in (None, ""):
            parts.append(f"{key}={str(value).replace(chr(10), ' ').replace(chr(13), ' ')[:300]}")
    return "; ".join(parts)


async def _feishu_tenant_token(secrets: dict[str, Any]) -> str:
    app_id = str(secrets.get("app_id") or "")
    app_secret = str(secrets.get("app_secret") or "")
    if not app_id or not app_secret:
        raise GenericHttpPolicyError("FEISHU_TENANT_APP requires app_id and app_secret")
    cached = _FEISHU_TOKENS.get(app_id)
    if cached and time.time() < cached[1] - 60:
        return cached[0]
    token_url = check_url(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        ["open.feishu.cn"],
    )
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
        response = await client.post(token_url, json={"app_id": app_id, "app_secret": app_secret})
    if response.status_code >= 400:
        raise GenericHttpPolicyError(f"Feishu token request failed: HTTP {response.status_code}")
    payload = response.json()
    if payload.get("code") != 0 or not payload.get("tenant_access_token"):
        raise GenericHttpPolicyError("Feishu token request failed")
    token = str(payload["tenant_access_token"])
    _FEISHU_TOKENS[app_id] = (token, time.time() + int(payload.get("expire") or 7200))
    return token


def _http_config(params: dict[str, Any]) -> dict[str, Any]:
    config = params.get("http_config") or params.get("template") or params
    if not isinstance(config, dict):
        raise GenericHttpPolicyError("http_config must be an object")
    return config


def validate_generic_http_config(config: dict[str, Any]) -> dict[str, Any]:
    method = str(config.get("method") or "GET").upper()
    if method not in {"GET", "POST"}:
        raise GenericHttpPolicyError("only GET and query POST are allowed")
    if method == "POST" and config.get("operation_type") != "QUERY" and "QUERY_POST" not in (config.get("tags") or []):
        raise GenericHttpPolicyError("POST requires operation_type=QUERY")
    base_url = str(config.get("base_url") or "")
    if not base_url:
        raise GenericHttpPolicyError("base_url is required")
    if not base_url.lower().startswith("https://"):
        raise GenericHttpPolicyError("only HTTPS endpoints are allowed")
    path = str(config.get("path") or "")
    if path.startswith("//") or "://" in path:
        raise GenericHttpPolicyError("path must not replace the configured host")
    allowed_domains = config.get("allowed_domains")
    if not isinstance(allowed_domains, list) or not allowed_domains:
        raise GenericHttpPolicyError("allowed_domains is required")
    url = check_url(urljoin(base_url.rstrip("/") + "/", path.lstrip("/")), allowed_domains)
    timeout = int(config.get("timeout_seconds") or 30)
    if not 1 <= timeout <= 60:
        raise GenericHttpPolicyError("timeout_seconds must be between 1 and 60")
    pagination_type = str(config.get("pagination_type") or "NONE").upper()
    if pagination_type not in {"NONE", "PAGE", "OFFSET", "CURSOR"}:
        raise GenericHttpPolicyError("unsupported pagination_type")
    max_pages = int(config.get("max_pages") or 1)
    if not 1 <= max_pages <= 100:
        raise GenericHttpPolicyError("max_pages must be between 1 and 100")
    return {
        **config,
        "method": method,
        "url": url,
        "timeout_seconds": timeout,
        "pagination_type": pagination_type,
        "max_pages": max_pages,
    }


def _as_pairs(config: dict[str, Any], key: str, context: dict[str, Any]) -> dict[str, Any]:
    raw = resolve_variables(config.get(key) or {}, context)
    if isinstance(raw, dict):
        pairs = raw
    elif isinstance(raw, list):
        pairs = {item.get("key"): item.get("value") for item in raw if isinstance(item, dict)}
    else:
        raise GenericHttpPolicyError(f"{key} must be an object or list")
    result: dict[str, Any] = {}
    for name, value in pairs.items():
        if not isinstance(name, str) or not _PARAM_NAME.fullmatch(name):
            raise GenericHttpPolicyError(f"invalid parameter name: {name!r}")
        if value is not None:
            result[name] = value
    return result


async def _enforce_rate_limit(key: str, qps: int | None) -> None:
    if not qps:
        return
    if not 1 <= int(qps) <= 100:
        raise GenericHttpPolicyError("rate_limit_qps must be between 1 and 100")
    async with _RATE_LOCK:
        now = time.monotonic()
        window = _RATE_WINDOWS[key]
        while window and now - window[0] >= 1:
            window.popleft()
        if len(window) >= int(qps):
            raise GenericHttpPolicyError("rate limit exceeded")
        window.append(now)


class GenericHttpActionAdapter:
    """Executes a whitelist-protected JSON REST read operation."""

    async def execute(self, params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
        del db
        try:
            raw_config = _http_config(params)
            context = {
                **build_system_context(),
                **(params.get("context") or {}),
                "secret": secrets or {},
            }
            rendered_path = resolve_variables(str(raw_config.get("path") or ""), context)
            if not isinstance(rendered_path, str) or "{{" in rendered_path:
                raise GenericHttpPolicyError("path contains unresolved variables")
            config = validate_generic_http_config({**raw_config, "path": rendered_path})
            headers = _as_pairs(config, "headers_config", context)
            if any(header.lower() in _FORBIDDEN_HEADERS for header in headers):
                raise GenericHttpPolicyError("restricted request header")
            if config.get("auth_type") == "FEISHU_TENANT_APP":
                headers["Authorization"] = f"Bearer {await _feishu_tenant_token(secrets or {})}"
            headers.setdefault("Accept", "application/json")
            query = _as_pairs(config, "query_config", context)
            body = resolve_variables(config.get("body_template") or {}, context)
            if config["method"] == "POST" and not isinstance(body, dict):
                raise GenericHttpPolicyError("query POST body_template must be an object")

            items: list[dict] = []
            cursor: str | None = None
            total: int | None = None
            async with httpx.AsyncClient(timeout=config["timeout_seconds"], follow_redirects=False) as client:
                for page_index in range(config["max_pages"]):
                    page_query = dict(query)
                    if config["pagination_type"] == "PAGE":
                        page_query[str(config.get("page_param") or "page")] = page_index + 1
                        page_query[str(config.get("page_size_param") or "page_size")] = int(config.get("page_size") or 100)
                    elif config["pagination_type"] == "OFFSET":
                        page_size = int(config.get("page_size") or 100)
                        page_query[str(config.get("offset_param") or "offset")] = page_index * page_size
                        page_query[str(config.get("page_size_param") or "limit")] = page_size
                    elif config["pagination_type"] == "CURSOR" and cursor:
                        page_query[str(config.get("cursor_param") or "cursor")] = cursor

                    await _enforce_rate_limit(config["url"], config.get("rate_limit_qps"))
                    response = await client.request(
                        config["method"], config["url"], headers=headers, params=page_query,
                        json=body if config["method"] == "POST" else None,
                    )
                    if response.status_code == 403:
                        return AdapterResult(status="failed", error_code="FORBIDDEN", error_message="read request forbidden")
                    if response.status_code == 404:
                        return AdapterResult(status="not_found", data=[], row_count=0)
                    if response.status_code == 429:
                        return AdapterResult(status="failed", error_code="RATE_LIMITED", error_message="read request rate limited")
                    if response.status_code >= 400:
                        return AdapterResult(
                            status="failed",
                            error_code=f"HTTP_{response.status_code}",
                            error_message=f"read request failed ({_upstream_error_summary(response)})",
                        )
                    if "json" not in response.headers.get("content-type", "").lower():
                        raise GenericHttpPolicyError("response must use a JSON content type")
                    response_body = response.json()
                    if config.get("auth_type") == "FEISHU_TENANT_APP" and response_body.get("code") != 0:
                        return AdapterResult(
                            status="failed",
                            error_code=(config.get("error_code_map") or {}).get(str(response_body.get("code")), "UPSTREAM_BUSINESS_ERROR"),
                            error_message=str(response_body.get("msg") or "upstream business error")[:500],
                        )
                    extracted = extract_response_data(response_body, config.get("data_path"))
                    page_items = extracted if isinstance(extracted, list) else [extracted]
                    if not all(isinstance(item, dict) for item in page_items):
                        raise GenericHttpPolicyError("response data must be an object or array of objects")
                    items.extend(page_items)
                    total = total if total is not None else extract_total(response_body, config.get("total_path"))
                    cursor = extract_next_cursor(response_body, config.get("next_cursor_path"))
                    if config["pagination_type"] == "NONE" or not page_items:
                        break
                    if config["pagination_type"] == "CURSOR" and not cursor:
                        break
            masked = mask_sensitive_fields(items)
            return AdapterResult(status="success", data=masked, row_count=len(masked), success_count=len(masked), extra={"total": total, "pages_limited": config["max_pages"]})
        except (GenericHttpPolicyError, SSRFError, httpx.TimeoutException) as exc:
            return AdapterResult(status="failed", error_code="GENERIC_HTTP_POLICY", error_message=str(exc)[:500])
        except (httpx.HTTPError, ValueError) as exc:
            return AdapterResult(status="failed", error_code="GENERIC_HTTP_ERROR", error_message=str(exc)[:500])


_generic_http_adapter = GenericHttpActionAdapter()


async def generic_http_action_adapter(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
    return await _generic_http_adapter.execute(params, secrets, db)
