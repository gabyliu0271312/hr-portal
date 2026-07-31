"""Validation for UCP webhook ingress resource protocols."""
from __future__ import annotations

import hashlib
import hmac
import re
import time
from typing import Any


WEBHOOK_VERIFICATION_STRATEGIES = {
    "NONE",
    "HMAC_SHA256",
    "HMAC_SHA256_TIMESTAMPED",
    "FEISHU_ENCRYPTED_EVENT",
}

_ALLOWED_INGRESS_KEYS = {
    "verification_strategy",
    "signature_header",
    "timestamp_header",
    "nonce_header",
    "request_id_header",
    "integration_id_header",
    "integration_id",
    "max_timestamp_diff_seconds",
    "max_body_bytes",
    "rate_limit_per_minute",
    "rate_limit_burst",
    "event_type_path",
    "event_id_path",
    "batch_id_path",
    "payload_path",
}

_HEADER_NAME_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")
_PATH_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$")
_SECRET_KEY_RE = re.compile(r"secret|password|credential|private[_-]?key", re.IGNORECASE)


def _require_string(ingress: dict[str, Any], key: str) -> None:
    value = ingress.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Webhook ingress 配置 {key} 必须是非空字符串")


def _validate_header(ingress: dict[str, Any], key: str) -> None:
    if key not in ingress:
        return
    value = ingress[key]
    if not isinstance(value, str) or not _HEADER_NAME_RE.fullmatch(value):
        raise ValueError(f"Webhook ingress 配置 {key} 必须是合法 Header 名称")


def _validate_path(ingress: dict[str, Any], key: str, *, allow_empty: bool = False) -> None:
    if key not in ingress:
        return
    value = ingress[key]
    if not isinstance(value, str) or (not allow_empty and not value):
        raise ValueError(f"Webhook ingress 配置 {key} 必须是字段路径")
    if value and not _PATH_RE.fullmatch(value):
        raise ValueError(f"Webhook ingress 配置 {key} 只支持点分隔字段路径")


def _validate_positive_int(ingress: dict[str, Any], key: str, *, maximum: int) -> None:
    if key not in ingress:
        return
    value = ingress[key]
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= maximum:
        raise ValueError(f"Webhook ingress 配置 {key} 必须是 1 到 {maximum} 的整数")


def validate_webhook_ingress_protocol(protocol: dict[str, Any] | None) -> None:
    """Validate non-secret ingress settings stored on ``UcpResource.protocol``."""
    if not isinstance(protocol, dict):
        raise ValueError("Webhook resource protocol 必须是对象")
    if set(protocol) != {"ingress"}:
        raise ValueError("Webhook resource protocol 仅允许 ingress 配置")

    ingress = protocol.get("ingress")
    if not isinstance(ingress, dict):
        raise ValueError("Webhook resource protocol.ingress 必须是对象")

    unknown = sorted(set(ingress) - _ALLOWED_INGRESS_KEYS)
    if unknown:
        raise ValueError(f"Webhook ingress 包含不支持的配置: {unknown}")
    sensitive = sorted(key for key in ingress if _SECRET_KEY_RE.search(key))
    if sensitive:
        raise ValueError("Webhook ingress 不允许保存密钥，请使用凭证引用")

    strategy = ingress.get("verification_strategy", "NONE")
    if strategy not in WEBHOOK_VERIFICATION_STRATEGIES:
        raise ValueError("Webhook ingress verification_strategy 不受支持")

    for key in (
        "signature_header",
        "timestamp_header",
        "nonce_header",
        "request_id_header",
        "integration_id_header",
    ):
        _validate_header(ingress, key)
    for key in ("event_type_path", "event_id_path", "batch_id_path"):
        _validate_path(ingress, key)
    _validate_path(ingress, "payload_path", allow_empty=True)
    for key, maximum in (
        ("max_timestamp_diff_seconds", 3600),
        ("max_body_bytes", 10 * 1024 * 1024),
        ("rate_limit_per_minute", 10_000),
        ("rate_limit_burst", 10_000),
    ):
        _validate_positive_int(ingress, key, maximum=maximum)

    has_integration_header = "integration_id_header" in ingress
    has_integration_id = "integration_id" in ingress
    if has_integration_header != has_integration_id:
        raise ValueError("Webhook ingress integration_id 与 integration_id_header 必须成对配置")
    if has_integration_id:
        _require_string(ingress, "integration_id")

    if strategy != "NONE":
        _require_string(ingress, "signature_header")
    if strategy == "HMAC_SHA256_TIMESTAMPED":
        for key in ("timestamp_header", "nonce_header", "request_id_header", "event_id_path"):
            _require_string(ingress, key)
        if "max_timestamp_diff_seconds" not in ingress:
            raise ValueError("Webhook ingress 时间戳签名必须配置 max_timestamp_diff_seconds")


def extract_payload_path(payload: dict[str, Any], path: str) -> Any:
    """Read a configured dot-separated path from an object payload."""
    if not path:
        return payload
    current: Any = payload
    for key in path.split("."):
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def _read_path(payload: dict[str, Any], path: str) -> str | None:
    current = extract_payload_path(payload, path)
    return current if isinstance(current, str) and current else None


def verify_timestamped_hmac(
    *,
    ingress: dict[str, Any],
    headers: Any,
    raw_body: bytes,
    payload: dict[str, Any],
    secret: str,
    now: int | None = None,
) -> tuple[bool, str]:
    """Verify a timestamped HMAC request without exposing verification details."""
    timestamp = headers.get(ingress["timestamp_header"], "")
    nonce = headers.get(ingress["nonce_header"], "")
    request_id = headers.get(ingress["request_id_header"], "")
    payload_request_id = _read_path(payload, ingress["event_id_path"])
    if not timestamp or not nonce or not request_id or request_id != payload_request_id:
        return False, "SIGNATURE_HEADERS_INVALID"
    try:
        timestamp_value = int(timestamp)
    except (TypeError, ValueError):
        return False, "TIMESTAMP_INVALID"
    if abs((now if now is not None else int(time.time())) - timestamp_value) > ingress["max_timestamp_diff_seconds"]:
        return False, "TIMESTAMP_EXPIRED"
    if not secret:
        return False, "SIGNING_SECRET_MISSING"

    body_hash = hashlib.sha256(raw_body).hexdigest()
    material = f"{timestamp}\n{nonce}\n{request_id}\n{body_hash}"
    expected = hmac.new(secret.encode("utf-8"), material.encode("utf-8"), hashlib.sha256).hexdigest()
    provided = headers.get(ingress["signature_header"], "")
    return (hmac.compare_digest(provided, expected), "SIGNATURE_INVALID")
