"""Restricted OpenAPI 3.x importer for read-only Generic HTTP templates."""
from __future__ import annotations

import re
from typing import Any

from app.ucp.generic_http_adapter import GenericHttpPolicyError, validate_generic_http_config


class OpenApiImportError(ValueError):
    pass


_CODE_PART = re.compile(r"[^A-Z0-9_]+")


def preview_openapi(document: dict[str, Any], *, allowed_domains: list[str], code_prefix: str = "OPENAPI") -> dict[str, Any]:
    if not isinstance(document, dict) or not str(document.get("openapi") or "").startswith("3."):
        raise OpenApiImportError("only OpenAPI 3.x documents are supported")
    _reject_external_refs(document)
    server_url = _server_url(document, allowed_domains)
    schemes = ((document.get("components") or {}).get("securitySchemes") or {})
    operations: list[dict[str, Any]] = []
    rejected: list[dict[str, str]] = []
    seen: set[str] = set()
    for path, path_item in (document.get("paths") or {}).items():
        if not isinstance(path_item, dict) or not isinstance(path, str):
            continue
        for method, operation in path_item.items():
            method = str(method).upper()
            if method not in {"GET", "POST"} or not isinstance(operation, dict):
                if method in {"PUT", "PATCH", "DELETE"}:
                    rejected.append({"path": path, "method": method, "reason": "write operations are not supported"})
                continue
            if method == "POST" and operation.get("x-ucp-operation-type") != "QUERY":
                rejected.append({"path": path, "method": method, "reason": "POST requires x-ucp-operation-type: QUERY"})
                continue
            operation_id = str(operation.get("operationId") or f"{method}_{path}")
            if operation_id in seen:
                raise OpenApiImportError(f"duplicate operationId: {operation_id}")
            seen.add(operation_id)
            auth_type = _auth_type(operation, document, schemes)
            if auth_type == "UNSUPPORTED":
                rejected.append({"path": path, "method": method, "reason": "unsupported or unknown authentication"})
                continue
            parameters = (path_item.get("parameters") or []) + (operation.get("parameters") or [])
            query_config = [{"key": item["name"], "value": f"{{{{input.{item['name']}}}}}"} for item in parameters if isinstance(item, dict) and item.get("in") == "query" and item.get("name")]
            operations.append({
                "operation_id": operation_id,
                "template_code": _template_code(code_prefix, operation_id),
                "template_name": str(operation.get("summary") or operation_id),
                "method": method, "base_url": server_url, "path": path,
                "allowed_domains": allowed_domains, "auth_type": auth_type or None,
                "query_config": query_config, "body_template": {},
                "data_path": operation.get("x-ucp-data-path"),
                "total_path": operation.get("x-ucp-total-path"),
                "pagination_type": str(operation.get("x-ucp-pagination-type") or "NONE").upper(),
                "tags": ["OPENAPI_IMPORT"] + (["QUERY_POST"] if method == "POST" else []),
                "description": str(operation.get("description") or ""),
            })
    return {"server_url": server_url, "operations": operations, "rejected": rejected}


def _reject_external_refs(value: Any) -> None:
    if isinstance(value, dict):
        if isinstance(value.get("$ref"), str) and not value["$ref"].startswith("#/"):
            raise OpenApiImportError("external $ref is not supported")
        for item in value.values(): _reject_external_refs(item)
    elif isinstance(value, list):
        for item in value: _reject_external_refs(item)


def _server_url(document: dict[str, Any], allowed_domains: list[str]) -> str:
    servers = document.get("servers") or []
    url = str(servers[0].get("url") or "") if servers and isinstance(servers[0], dict) else ""
    if "{" in url or not url.lower().startswith("https://"):
        raise OpenApiImportError("server URL must be a concrete HTTPS URL")
    try:
        return validate_generic_http_config({"base_url": url, "allowed_domains": allowed_domains, "method": "GET"})["url"].rstrip("/")
    except GenericHttpPolicyError as exc:
        raise OpenApiImportError(str(exc)) from exc


def _auth_type(operation: dict[str, Any], document: dict[str, Any], schemes: dict[str, Any]) -> str | None:
    requirements = operation.get("security", document.get("security", []))
    if not requirements: return None
    if not isinstance(requirements, list) or len(requirements) != 1 or not isinstance(requirements[0], dict): return "UNSUPPORTED"
    names = list(requirements[0])
    scheme = schemes.get(names[0]) if len(names) == 1 else None
    if not isinstance(scheme, dict): return "UNSUPPORTED"
    if scheme.get("type") == "http" and str(scheme.get("scheme") or "").lower() in {"bearer", "basic"}: return str(scheme["scheme"]).upper()
    if scheme.get("type") == "apiKey" and scheme.get("in") in {"header", "query"}: return "API_KEY"
    return "UNSUPPORTED"


def _template_code(prefix: str, operation_id: str) -> str:
    return (_CODE_PART.sub("_", f"{prefix}_{operation_id}".upper()).strip("_") or "OPENAPI_OPERATION")[:64]
