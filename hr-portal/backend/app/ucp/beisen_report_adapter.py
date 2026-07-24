"""UCP bridge for the standard Beisen Report connection."""
from __future__ import annotations

import httpx

from sqlalchemy.ext.asyncio import AsyncSession

from app.datasources.beisen_client import BeisenReportClient
from app.ucp.types import AdapterResult


DEFAULTS = {
    "BEISEN_TOKEN_URL": "https://openapi.italent.cn/token",
    "BEISEN_HEADER_URL": "https://openapi.italent.cn/Ocean/api/v2/Reports/GridHeader",
    "BEISEN_DATA_URL": "https://openapi.italent.cn/Ocean/api/v2/Reports/GridData",
}


async def beisen_report_pull_adapter(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
    """Read one report object; endpoints are platform defaults unless controlled overrides exist."""
    del db
    object_config = params.get("object_config") if isinstance(params.get("object_config"), dict) else {}
    connection_config = params.get("connection_config") if isinstance(params.get("connection_config"), dict) else {}
    settings = {
        "BEISEN_TOKEN_URL": connection_config.get("BEISEN_TOKEN_URL", DEFAULTS["BEISEN_TOKEN_URL"]),
        "BEISEN_HEADER_URL": connection_config.get("BEISEN_HEADER_URL", DEFAULTS["BEISEN_HEADER_URL"]),
        "BEISEN_DATA_URL": connection_config.get("BEISEN_DATA_URL", DEFAULTS["BEISEN_DATA_URL"]),
        "BEISEN_REPORT_ID": object_config.get("report_id") or params.get("report_id", ""),
    }
    secret_map = {
        "BEISEN_APP_KEY": secrets.get("BEISEN_APP_KEY") or secrets.get("app_id", ""),
        "BEISEN_APP_SECRET": secrets.get("BEISEN_APP_SECRET") or secrets.get("app_secret", ""),
    }
    try:
        rows = await BeisenReportClient(settings, secret_map).get_grid_data(
            page_size=int(object_config.get("page_size") or 1000)
        )
        return AdapterResult(status="success", data=rows, row_count=len(rows), success_count=len(rows))
    except httpx.HTTPStatusError as exc:
        response_text = exc.response.text.strip()[:500]
        if exc.response.status_code == 403 and "\u53d7\u4fe1IP" in response_text:
            return AdapterResult(
                status="failed",
                error_code="BEISEN_TRUSTED_IP_REQUIRED",
                error_message=response_text,
            )
        return AdapterResult(
            status="failed",
            error_code=f"BEISEN_HTTP_{exc.response.status_code}",
            error_message=response_text or str(exc)[:500],
        )
    except Exception as exc:
        return AdapterResult(status="failed", error_code="BEISEN_REPORT_PULL_FAILED", error_message=str(exc)[:500])
