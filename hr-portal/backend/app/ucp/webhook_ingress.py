"""Shared Webhook ingress protocol validation and timestamped HMAC signing."""
from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any


SUPPORTED_STRATEGIES = {"NONE", "HMAC_SHA256", "HMAC_SHA256_TIMESTAMPED", "FEISHU_ENCRYPTED_EVENT"}


def extract_path(payload: Any, path: str | None) -> Any:
    """Extract a restricted dot-separated object path; arrays and expressions are rejected."""
    if not path:
        return None
    current = payload
    for segment in path.split("."):
        if not segment or not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]
    return current


def validate_ingress_config(config: dict[str, Any]) -> dict[str, Any]:
    strategy = str(config.get("verification_strategy") or "NONE").upper()
    if strategy not in SUPPORTED_STRATEGIES:
        raise ValueError("unsupported verification strategy")
    result = dict(config)
    result["verification_strategy"] = strategy
    for key in ("signature_header", "integration_header", "request_id_header", "timestamp_header", "nonce_header"):
        if key in result and result[key] is not None:
            value = str(result[key])
            if not value or any(char.isspace() for char in value):
                raise ValueError(f"invalid header: {key}")
            result[key] = value
    for key in ("event_type_path", "event_id_path", "batch_id_path", "records_path"):
        if key in result and result[key] is not None:
            path = str(result[key])
            if not path or any(not segment or not segment.replace("_", "a").isalnum() for segment in path.split(".")):
                raise ValueError(f"invalid path: {key}")
            result[key] = path
    return result


def verify_timestamped_hmac(
    *, raw_body: bytes, secret: str, timestamp: str, nonce: str,
    request_id: str, signature: str, now: int | None = None, tolerance_seconds: int = 300,
) -> bool:
    try:
        timestamp_int = int(timestamp)
    except (TypeError, ValueError):
        return False
    current = int(time.time()) if now is None else int(now)
    if abs(current - timestamp_int) > tolerance_seconds or not nonce or not request_id or not secret:
        return False
    body_hash = hashlib.sha256(raw_body).hexdigest()
    signing_string = f"{timestamp}\n{nonce}\n{request_id}\n{body_hash}"
    expected = hmac.new(secret.encode(), signing_string.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(str(signature or ""), expected)
