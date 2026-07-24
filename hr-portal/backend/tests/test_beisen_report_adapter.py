import httpx
import pytest

from app.ucp.beisen_report_adapter import beisen_report_pull_adapter


@pytest.mark.asyncio
async def test_beisen_trusted_ip_error_is_exposed(monkeypatch):
    class Client:
        def __init__(self, *_args, **_kwargs):
            pass

        async def get_grid_data(self, **_kwargs):
            request = httpx.Request("GET", "https://openapi.italent.cn/Ocean/api/v2/Reports/GridData")
            response = httpx.Response(403, request=request, text="\u5f53\u524d\u4f01\u4e1a\u5df2\u8bbe\u7f6eOpenAPI\u8c03\u7528\u53d7\u4fe1IP")
            raise httpx.HTTPStatusError("forbidden", request=request, response=response)

    monkeypatch.setattr("app.ucp.beisen_report_adapter.BeisenReportClient", Client)

    result = await beisen_report_pull_adapter(
        {"object_config": {"report_id": "report-1"}},
        {"BEISEN_APP_KEY": "key", "BEISEN_APP_SECRET": "secret"},
        db=None,
    )

    assert result.status == "failed"
    assert result.error_code == "BEISEN_TRUSTED_IP_REQUIRED"
