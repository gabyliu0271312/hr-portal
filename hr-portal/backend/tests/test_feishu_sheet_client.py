import pytest

from app.datasources.beisen_client import FeishuSheetClient


pytestmark = pytest.mark.asyncio


def make_client(chunk_size=1000):
    return FeishuSheetClient(
        {"FEISHU_ROW_CHUNK_SIZE": str(chunk_size)},
        {"FEISHU_APP_ID": "app", "FEISHU_APP_SECRET": "secret"},
    )


async def test_chunked_fetch_continues_after_short_and_empty_chunks(monkeypatch):
    client = make_client(chunk_size=2)
    requested = []
    responses = {
        "sheet!A1:D2": [["name"], ["first"]],
        "sheet!A3:D4": [],
        "sheet!A5:D5": [["last"]],
    }

    async def fake_fetch(_http, _spreadsheet, _token, read_range):
        requested.append(read_range)
        return responses[read_range]

    monkeypatch.setattr(client, "_fetch_value_range", fake_fetch)

    values = await client._fetch_values_chunked(None, "sheet-token", "token", "sheet!A1:D5")

    assert requested == ["sheet!A1:D2", "sheet!A3:D4", "sheet!A5:D5"]
    assert values == [["name"], ["first"], ["last"]]


async def test_chunked_fetch_splits_90221_range_in_order(monkeypatch):
    client = make_client(chunk_size=4)
    requested = []

    async def fake_fetch(_http, _spreadsheet, _token, read_range):
        requested.append(read_range)
        if read_range == "sheet!A1:D4":
            raise RuntimeError("飞书表格读取失败 (code=90221): too large")
        return [[read_range]]

    monkeypatch.setattr(client, "_fetch_value_range", fake_fetch)

    values = await client._fetch_values_chunked(None, "sheet-token", "token", "sheet!A1:D4")

    assert requested == ["sheet!A1:D4", "sheet!A1:D2", "sheet!A3:D4"]
    assert values == [["sheet!A1:D2"], ["sheet!A3:D4"]]


async def test_chunked_fetch_reports_single_row_90221(monkeypatch):
    client = make_client()

    async def fake_fetch(_http, _spreadsheet, _token, _read_range):
        raise RuntimeError("飞书表格读取失败 (code=90221): too large")

    monkeypatch.setattr(client, "_fetch_value_range", fake_fetch)

    with pytest.raises(RuntimeError, match=r"单行仍超过 10MB.*sheet!A1:D1"):
        await client._fetch_values_chunked(None, "sheet-token", "token", "sheet!A1:D1")
