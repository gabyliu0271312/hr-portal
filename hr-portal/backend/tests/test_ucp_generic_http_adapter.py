"""X0206 coverage for the controlled Generic HTTP action adapter."""
from __future__ import annotations

from urllib.parse import parse_qs

import httpx
import pytest

from app.ucp.generic_http_adapter import (
    GenericHttpActionAdapter,
    GenericHttpPolicyError,
    validate_generic_http_config,
)


def _config(**overrides):
    config = {
        "base_url": "https://api.example.com",
        "path": "/employees",
        "allowed_domains": ["api.example.com"],
        "method": "GET",
        "data_path": "$.data.items",
        "max_pages": 1,
    }
    config.update(overrides)
    return config


def _mock_client(monkeypatch, handler):
    import app.ucp.generic_http_adapter as module

    original_client = httpx.AsyncClient

    class MockClient:
        def __init__(self, **kwargs):
            self.client = original_client(transport=httpx.MockTransport(handler), **kwargs)

        async def __aenter__(self):
            return self.client

        async def __aexit__(self, *args):
            await self.client.aclose()

    monkeypatch.setattr(module.httpx, "AsyncClient", MockClient)


@pytest.mark.asyncio
async def test_adapter_paginates_and_masks_sensitive_response(monkeypatch):
    calls = []

    def handler(request: httpx.Request):
        calls.append(parse_qs(request.url.query.decode()))
        page = int(request.url.params["page"])
        return httpx.Response(200, json={"data": {"items": [{"id": page, "mobile": "13800138000"}]}})

    _mock_client(monkeypatch, handler)
    result = await GenericHttpActionAdapter().execute(
        {"http_config": _config(pagination_type="PAGE", max_pages=2, page_size=20)}, {}, None
    )

    assert result.status == "success"
    assert result.row_count == 2
    assert result.data[0]["mobile"] == "138****8000"
    assert calls == [{"page": ["1"], "page_size": ["20"]}, {"page": ["2"], "page_size": ["20"]}]


@pytest.mark.asyncio
async def test_adapter_rejects_parameter_injection_before_request():
    result = await GenericHttpActionAdapter().execute(
        {"http_config": _config(query_config={"bad key": "value"})}, {}, None
    )

    assert result.status == "failed"
    assert result.error_code == "GENERIC_HTTP_POLICY"


@pytest.mark.asyncio
async def test_adapter_handles_timeout(monkeypatch):
    def handler(_request: httpx.Request):
        raise httpx.TimeoutException("timed out")

    _mock_client(monkeypatch, handler)
    result = await GenericHttpActionAdapter().execute({"http_config": _config()}, {}, None)

    assert result.status == "failed"
    assert result.error_code == "GENERIC_HTTP_POLICY"


@pytest.mark.asyncio
async def test_adapter_rejects_non_json_response(monkeypatch):
    _mock_client(monkeypatch, lambda _request: httpx.Response(200, text="not json"))

    result = await GenericHttpActionAdapter().execute({"http_config": _config()}, {}, None)

    assert result.status == "failed"
    assert result.error_code == "GENERIC_HTTP_POLICY"


def test_policy_rejects_private_http_and_non_query_post():
    with pytest.raises(GenericHttpPolicyError):
        validate_generic_http_config(_config(base_url="http://127.0.0.1", allowed_domains=["*"]))
    with pytest.raises(GenericHttpPolicyError):
        validate_generic_http_config(_config(method="POST"))


def test_generic_adapter_is_registered_for_pipeline_execution():
    from app.ucp.adapters import get_adapter

    assert get_adapter("GENERIC_HTTP_ACTION_ADAPTER").__name__ == "generic_http_action_adapter"
