"""UCP runtime bridge for the shared Feishu online spreadsheet connector."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.datasources.beisen_client import FeishuSheetClient
from app.ucp.types import AdapterResult


async def feishu_sheet_pull_adapter(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
    """Read one configured spreadsheet object without exposing implementation details to UI."""
    del db
    object_config = params.get("object_config") if isinstance(params.get("object_config"), dict) else {}
    settings = {
        "FEISHU_WIKI_URL_OR_TOKEN": object_config.get("source_url") or params.get("source_url", ""),
        "FEISHU_SPREADSHEET_TOKEN": object_config.get("spreadsheet_token") or params.get("spreadsheet_token", ""),
        "FEISHU_SHEET_ID": object_config.get("sheet_id") or params.get("sheet_id", ""),
        "FEISHU_RANGE": object_config.get("range") or params.get("range", "A1:ZZ10000"),
        "FEISHU_HEADER_ROW": object_config.get("header_row") or params.get("header_row", "1"),
    }
    secret_map = {
        "FEISHU_APP_ID": secrets.get("FEISHU_APP_ID") or secrets.get("app_id", ""),
        "FEISHU_APP_SECRET": secrets.get("FEISHU_APP_SECRET") or secrets.get("app_secret", ""),
    }
    try:
        rows = await FeishuSheetClient(settings, secret_map).fetch()
        return AdapterResult(status="success", data=rows, row_count=len(rows), success_count=len(rows))
    except Exception as exc:
        return AdapterResult(status="failed", error_message=str(exc)[:500])
