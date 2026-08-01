import hashlib
import hmac

import pytest

from app.connectors.catalog import get_connector_type, list_connector_types
from app.ucp.webhook_ingress import (
    extract_payload_path,
    validate_webhook_ingress_protocol,
    verify_timestamped_hmac,
)


def _timestamped_ingress():
    return {
        "verification_strategy": "HMAC_SHA256_TIMESTAMPED",
        "signature_header": "X-Signature",
        "timestamp_header": "X-Timestamp",
        "nonce_header": "X-Nonce",
        "request_id_header": "X-Request-Id",
        "event_id_path": "request_id",
        "max_timestamp_diff_seconds": 300,
    }


def _timestamped_headers(raw_body, *, timestamp="1000", nonce="nonce-1", request_id="req-1", secret="secret"):
    body_hash = hashlib.sha256(raw_body).hexdigest()
    material = f"{timestamp}\n{nonce}\n{request_id}\n{body_hash}"
    return {
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Request-Id": request_id,
        "X-Signature": hmac.new(secret.encode(), material.encode(), hashlib.sha256).hexdigest(),
    }


def test_extract_payload_path_supports_configured_nested_objects():
    payload = {
        "header": {"event_type": "allocation_period.locked", "request_id": "req-1"},
        "event": {"records": [{"employee_no": "00123"}]},
    }

    assert extract_payload_path(payload, "header.event_type") == "allocation_period.locked"
    assert extract_payload_path(payload, "event.records") == [{"employee_no": "00123"}]
    assert extract_payload_path(payload, "") == payload
    assert extract_payload_path(payload, "event.missing") is None

    raw_body = b'{"request_id":"req-1"}'
    verified, reason = verify_timestamped_hmac(
        ingress=_timestamped_ingress(),
        headers=_timestamped_headers(raw_body),
        raw_body=raw_body,
        payload={"request_id": "req-1"},
        secret="secret",
        now=1001,
    )

    assert verified is True
    assert reason == "SIGNATURE_INVALID"


@pytest.mark.parametrize(
    ("headers", "payload", "secret", "now", "reason"),
    [
        ({}, {"request_id": "req-1"}, "secret", 1000, "SIGNATURE_HEADERS_INVALID"),
        (_timestamped_headers(b'{"request_id":"req-1"}', request_id="req-2"), {"request_id": "req-1"}, "secret", 1000, "SIGNATURE_HEADERS_INVALID"),
        (_timestamped_headers(b'{"request_id":"req-1"}', timestamp="bad"), {"request_id": "req-1"}, "secret", 1000, "TIMESTAMP_INVALID"),
        (_timestamped_headers(b'{"request_id":"req-1"}', timestamp="1"), {"request_id": "req-1"}, "secret", 1000, "TIMESTAMP_EXPIRED"),
        (_timestamped_headers(b'{"request_id":"req-1"}'), {"request_id": "req-1"}, "", 1000, "SIGNING_SECRET_MISSING"),
        ({**_timestamped_headers(b'{"request_id":"req-1"}'), "X-Signature": "wrong"}, {"request_id": "req-1"}, "secret", 1000, "SIGNATURE_INVALID"),
    ],
)
def test_timestamped_hmac_rejects_invalid_requests(headers, payload, secret, now, reason):
    verified, actual_reason = verify_timestamped_hmac(
        ingress=_timestamped_ingress(),
        headers=headers,
        raw_body=b'{"request_id":"req-1"}',
        payload=payload,
        secret=secret,
        now=now,
    )

    assert verified is False
    assert actual_reason == reason


def test_webhook_ingress_connector_is_available_to_ucp():
    connector = get_connector_type("webhook_ingress", include_internal=True)

    assert connector["supports_ucp"] is True
    assert connector["supports_warehouse"] is False
    assert connector["connection_kind"] == "EVENT_INGRESS"
    assert "webhook_ingress" in {
        item["code"] for item in list_connector_types("ucp")
    }


def test_webhook_ingress_protocol_accepts_non_secret_settings():
    validate_webhook_ingress_protocol(
        {
            "ingress": {
                "verification_strategy": "HMAC_SHA256",
                "signature_header": "X-Signature",
                "integration_id": "cost-allocation-system",
                "integration_id_header": "X-Integration-Id",
                "event_type_path": "event_type",
                "event_id_path": "request_id",
                "batch_id_path": "batch_id",
                "payload_path": "records",
                "max_body_bytes": 5 * 1024 * 1024,
                "rate_limit_per_minute": 60,
                "rate_limit_burst": 10,
            }
        }
    )


@pytest.mark.parametrize(
    ("protocol", "message"),
    [
        ({"ingress": {"signing_secret": "bad"}}, "不支持的配置"),
        ({"ingress": {"verification_strategy": "UNKNOWN"}}, "不受支持"),
        ({"ingress": {"signature_header": "bad header"}}, "Header"),
        ({"ingress": {"event_id_path": "records[0]"}}, "字段路径"),
        ({"ingress": {"max_body_bytes": 0}}, "整数"),
        ({"other": {}}, "仅允许 ingress"),
    ],
)
def test_webhook_ingress_protocol_rejects_unsafe_or_invalid_settings(protocol, message):
    with pytest.raises(ValueError, match=message):
        validate_webhook_ingress_protocol(protocol)
