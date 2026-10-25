import httpx
import pytest

from app.datasources.beisen_client import BeisenApiClient


class _FakeAsyncClient:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def request(self, method, url, **kwargs):
        body = kwargs.get("json") or kwargs.get("params") or {}
        page = int(body.get("pageIndex", 1))
        self.calls.append(page)
        payload = self.responses[page]
        request = httpx.Request(method, url)
        return httpx.Response(200, json=payload, request=request)

    async def get(self, url, **kwargs):
        return await self.request("GET", url, **kwargs)


@pytest.mark.asyncio
async def test_beisen_api_fetches_all_pages(monkeypatch):
    fake = _FakeAsyncClient({
        1: {"code": "200", "data": {"items": [{"id": 1}, {"id": 2}], "total": 5, "pageIndex": 1, "pageSize": 2, "hasMore": True}},
        2: {"code": "200", "data": {"items": [{"id": 3}, {"id": 4}], "total": 5, "pageIndex": 2, "pageSize": 2, "hasMore": True}},
        3: {"code": "200", "data": {"items": [{"id": 5}], "total": 5, "pageIndex": 3, "pageSize": 2, "hasMore": False}},
    })
    monkeypatch.setattr("app.datasources.beisen_client._get_token", _fake_token)
    monkeypatch.setattr("app.datasources.beisen_client.httpx.AsyncClient", lambda **_kwargs: fake)

    client = BeisenApiClient({"BEISEN_API_TOKEN_URL": "token", "BEISEN_API_DATA_URL": "data"}, {
        "BEISEN_API_APP_KEY": "key", "BEISEN_API_APP_SECRET": "secret",
    })
    rows = await client.fetch()

    assert [row["id"] for row in rows] == [1, 2, 3, 4, 5]
    assert fake.calls == [1, 2, 3]


@pytest.mark.asyncio
async def test_beisen_api_keeps_non_paginated_array_compatibility(monkeypatch):
    fake = _FakeAsyncClient({1: [{"id": 1}, {"id": 2}]})
    monkeypatch.setattr("app.datasources.beisen_client._get_token", _fake_token)
    monkeypatch.setattr("app.datasources.beisen_client.httpx.AsyncClient", lambda **_kwargs: fake)

    client = BeisenApiClient({"BEISEN_API_TOKEN_URL": "token", "BEISEN_API_DATA_URL": "data"}, {
        "BEISEN_API_APP_KEY": "key", "BEISEN_API_APP_SECRET": "secret",
    })
    rows = await client.fetch()

    assert rows == [{"id": 1}, {"id": 2}]
    assert fake.calls == [1]


async def _fake_token(*_args, **_kwargs):
    return "token"
