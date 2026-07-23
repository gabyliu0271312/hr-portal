"""Built-in connector catalog shared by warehouse and UCP."""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal

Consumer = Literal["warehouse", "ucp"]


def _field(key: str, label: str, field_type: str = "text", **extra: Any) -> dict[str, Any]:
    return {"key": key, "label": label, "type": field_type, **extra}


CONNECTOR_TYPES: tuple[dict[str, Any], ...] = (
    {
        "code": "feishu_sheet",
        "label": "\u98de\u4e66\u5728\u7ebf\u8868\u683c",
        "description": "\u8bfb\u53d6\u98de\u4e66\u5728\u7ebf\u7535\u5b50\u8868\u683c\uff08Spreadsheet / Sheet\uff09\u7684\u884c\u5217\u6570\u636e\u3002",
        "groups": [
            {"title": "\u8ba4\u8bc1\u4fe1\u606f", "fields": [
                _field("FEISHU_APP_ID", "App ID", required=True, placeholder="\u98de\u4e66\u5f00\u653e\u5e73\u53f0\u5e94\u7528 App ID"),
                _field("FEISHU_APP_SECRET", "App Secret", "password", required=True),
            ]},
            {"title": "\u8868\u683c\u5b9a\u4f4d", "fields": [
                _field("FEISHU_WIKI_URL_OR_TOKEN", "\u98de\u4e66\u8868\u683c\u94fe\u63a5", required=True, placeholder="https://xxx.feishu.cn/wiki/xxxx"),
                _field("FEISHU_SPREADSHEET_TOKEN", "Spreadsheet Token", placeholder="\u8868\u683c URL \u4e2d /sheets/ \u540e\u7684 token"),
                _field("FEISHU_SHEET_ID", "Sheet ID", placeholder="\u53ef\u9009\uff1b\u7559\u7a7a\u8bfb\u53d6\u7b2c\u4e00\u4e2a\u5de5\u4f5c\u8868"),
                _field("FEISHU_RANGE", "\u8bfb\u53d6\u8303\u56f4", required=True, default="A1:ZZ10000"),
                _field("FEISHU_SHEET_RANGE", "\u5b8c\u6574\u8303\u56f4\uff08\u53ef\u9009\uff09"),
                _field("FEISHU_HEADER_ROW", "\u8868\u5934\u884c\u53f7", required=True, default="1"),
            ]},
        ],
        "secret_keys": ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
        "testable": True,
        "defaultSchedule": "\u6bcf\u65e5 06:00",
        "supports_warehouse": True,
        "supports_ucp": True,
        # 仅供 UCP 服务端内部映射；普通产品界面不得展示 adapter code。
        "ucp_adapter_code": "FEISHU_SHEET_PULL_ADAPTER",
        "protocol": "feishu_sheets",
        "connection_kind": "DATA_OBJECT",
        "object_config_kind": "feishu_sheet",
        "object_label": "工作表数据对象",
        "status": "active",
    },
    {
        "code": "feishu_bitable",
        "label": "\u98de\u4e66\u591a\u7ef4\u8868\u683c",
        "description": "\u8bfb\u53d6\u98de\u4e66\u591a\u7ef4\u8868\u683c\uff08Bitable\uff09\u4e2d\u6307\u5b9a\u6570\u636e\u8868\u6216\u89c6\u56fe\u7684\u8bb0\u5f55\u3002",
        "groups": [
            {"title": "\u8ba4\u8bc1\u4fe1\u606f", "fields": [
                _field("FEISHU_APP_ID", "App ID", required=True, placeholder="\u98de\u4e66\u5f00\u653e\u5e73\u53f0\u5e94\u7528 App ID"),
                _field("FEISHU_APP_SECRET", "App Secret", "password", required=True),
            ]},
            {"title": "\u591a\u7ef4\u8868\u683c\u5b9a\u4f4d", "fields": [
                _field("FEISHU_BITABLE_APP_TOKEN", "App Token", required=True, placeholder="\u591a\u7ef4\u8868\u683c\u94fe\u63a5\u4e2d\u7684 app_token"),
                _field("FEISHU_BITABLE_TABLE_ID", "\u6570\u636e\u8868 ID", required=True, placeholder="tblxxxx"),
                _field("FEISHU_BITABLE_VIEW_ID", "\u89c6\u56fe ID\uff08\u53ef\u9009\uff09", placeholder="vewxxxx"),
                _field("FEISHU_BITABLE_PAGE_SIZE", "\u5206\u9875\u5927\u5c0f", default="100"),
                _field("FEISHU_BITABLE_MAX_RECORDS", "\u6700\u5927\u8bfb\u53d6\u8bb0\u5f55\u6570", default="10000"),
            ]},
        ],
        "secret_keys": ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
        "testable": True,
        "defaultSchedule": "\u6bcf\u65e5 06:00",
        "supports_warehouse": True,
        "supports_ucp": True,
        "ucp_adapter_code": "FEISHU_BITABLE_PULL_ADAPTER",
        "protocol": "feishu_bitable",
        "connection_kind": "DATA_OBJECT",
        "object_config_kind": "feishu_bitable",
        "object_label": "多维表格数据对象",
        "status": "active",
    },
    {
        "code": "beisen_report",
        "label": "北森报表",
        "description": "通过北森报表 API 拉取一个或多个业务报表数据对象。",
        "groups": [
            {"title": "认证信息", "fields": [
                _field("BEISEN_APP_KEY", "AppKey", required=True, placeholder="北森后台 → 应用管理获取"),
                _field("BEISEN_APP_SECRET", "AppSecret", "password", required=True),
                _field("BEISEN_REPORT_ID", "Report ID", required=True, placeholder="北森后台 → 报表管理"),
            ]},
            {"title": "报表数据对象", "fields": [
                _field("BEISEN_TOKEN_URL", "Token 接口", "url", required=True, default="https://openapi.italent.cn/token"),
                _field("BEISEN_HEADER_URL", "表头接口", "url", required=True, default="https://openapi.italent.cn/Ocean/api/v2/Reports/GridHeader"),
                _field("BEISEN_DATA_URL", "数据接口", "url", required=True, default="https://openapi.italent.cn/Ocean/api/v2/Reports/GridData"),
            ]},
        ],
        # 数据仓库沿用完整独立来源表单；UCP 按 credential / connection / object 分层消费。
        "ucp_credential_fields": ["BEISEN_APP_KEY", "BEISEN_APP_SECRET"],
        "ucp_connection_defaults": {
            "BEISEN_TOKEN_URL": "https://openapi.italent.cn/token",
            "BEISEN_HEADER_URL": "https://openapi.italent.cn/Ocean/api/v2/Reports/GridHeader",
            "BEISEN_DATA_URL": "https://openapi.italent.cn/Ocean/api/v2/Reports/GridData",
        },
        "ucp_object_fields": [
            _field("report_id", "Report ID", required=True, placeholder="北森后台 → 报表管理"),
        ],
        "secret_keys": ["BEISEN_APP_KEY", "BEISEN_APP_SECRET"],
        "testable": True,
        "defaultSchedule": "每日 06:00",
        "supports_warehouse": True,
        "supports_ucp": True,
        "ucp_adapter_code": "BEISEN_REPORT_PULL_ADAPTER",
        "legacy_ucp_adapter_codes": ["BEISEN_PENDING_LIST_ADAPTER"],
        "protocol": "beisen_report",
        "connection_kind": "DATA_OBJECT",
        "object_config_kind": "beisen_report",
        "object_label": "北森报表数据对象",
        "legacy_source_types": ["beisen_api"],
        "status": "active",
    },
)


def _public_connector_type(item: dict[str, Any]) -> dict[str, Any]:
    """Return the product-facing DTO without technical adapter implementation details."""
    public = deepcopy(item)
    public.pop("ucp_adapter_code", None)
    return public


def list_connector_types(
    consumer: Consumer | None = None, *, include_internal: bool = False
) -> list[dict[str, Any]]:
    if consumer not in (None, "warehouse", "ucp"):
        raise ValueError(f"unsupported connector consumer: {consumer}")
    capability = f"supports_{consumer}" if consumer else None
    items = [item for item in CONNECTOR_TYPES if capability is None or item[capability]]
    if include_internal:
        return [deepcopy(item) for item in items]
    return [_public_connector_type(item) for item in items]


def get_connector_type(code: str, *, include_internal: bool = False) -> dict[str, Any] | None:
    item = next((item for item in CONNECTOR_TYPES if item["code"] == code), None)
    if item is None:
        return None
    return deepcopy(item) if include_internal else _public_connector_type(item)


def find_connector_type_by_adapter(adapter_code: str | None) -> dict[str, Any] | None:
    """Compatibility projection for resources created before connector_type existed."""
    if not adapter_code:
        return None
    item = next(
        (
            item for item in CONNECTOR_TYPES
            if item.get("ucp_adapter_code") == adapter_code
            or adapter_code in item.get("legacy_ucp_adapter_codes", [])
        ),
        None,
    )
    return deepcopy(item) if item else None
