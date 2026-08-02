"""Built-in connector catalog shared by warehouse and UCP."""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal

from app.ucp.webhook_ingress import validate_webhook_ingress_protocol

Consumer = Literal["warehouse", "ucp"]
# Resource templates use the object model as their primary product contract.
# A configuration profile selects the provider-specific connection shape and
# derives the private runtime connector/adapter without exposing that technical
# choice as a user-editable "resource implementation type".
RESOURCE_CONFIGURATION_PROFILES: tuple[dict[str, Any], ...] = (
    {
        "code": "webhook_ingress",
        "label": "Webhook 入站配置",
        "object_type": "EVENT_TYPE",
        "connector_type": "webhook_ingress",
        "configuration_label": "入站事件配置",
        "object_config_schema": [],
    },
    {
        "code": "beisen_report",
        "label": "北森报表访问配置",
        "object_type": "REPORT",
        "connector_type": "beisen_report",
        "configuration_label": "报表访问配置",
        "object_config_schema": [{"key": "report_id", "label": "报表 ID", "required": True}],
    },
    {
        "code": "feishu_sheet",
        "label": "飞书在线表格",
        "object_type": "TABLE",
        "connector_type": "feishu_sheet",
        "configuration_label": "表格访问配置",
        "object_config_schema": [{"key": "spreadsheet_token", "label": "Spreadsheet Token", "required": True}, {"key": "sheet_id", "label": "Sheet ID", "required": True}, {"key": "range", "label": "读取范围", "required": True}],
    },
    {
        "code": "feishu_bitable",
        "label": "飞书多维表格",
        "object_type": "TABLE",
        "connector_type": "feishu_bitable",
        "configuration_label": "表格访问配置",
        "object_config_schema": [{"key": "app_token", "label": "App Token", "required": True}, {"key": "table_id", "label": "数据表 ID", "required": True}, {"key": "view_id", "label": "视图 ID", "required": False}],
    },
    {
        "code": "generic_api_object",
        "label": "通用 API 对象",
        "object_type": "API_OBJECT",
        "connector_type": None,
        "configuration_label": "API 访问配置",
        "object_config_schema": [{"key": "path", "label": "对象路径", "required": True}],
    },
)


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
        "code": "webhook_ingress",
        "label": "Webhook 入站事件",
        "description": "接收外部系统推送的事件，并交由 UCP 事件总线处理。",
        "groups": [
            {"title": "接收配置", "fields": [
                _field("verification_strategy", "验签策略", "select", required=True, default="HMAC_SHA256_TIMESTAMPED", options=[
                    {"label": "HMAC-SHA256 时间戳签名", "value": "HMAC_SHA256_TIMESTAMPED"},
                    {"label": "HMAC-SHA256 原始报文", "value": "HMAC_SHA256"},
                    {"label": "无认证（仅内部测试）", "value": "NONE"},
                ]),
                _field("signature_header", "签名 Header", required=True, default="X-Signature"),
                _field("event_type_path", "事件类型路径", required=True, default="event_type"),
                _field("event_id_path", "请求幂等路径", required=True, default="request_id"),
                _field("batch_id_path", "批次路径", default="batch_id"),
                _field("records_path", "明细路径", default="records"),
            ]},
        ],
        "ucp_credential_fields": ["signing_secret"],
        "secret_keys": ["signing_secret"],
        "testable": True,
        "defaultSchedule": "事件触发",
        "supports_warehouse": False,
        "supports_ucp": True,
        "protocol": "webhook_ingress",
        "connection_kind": "EVENT_INGRESS",
        "object_config_kind": "webhook_event",
        "object_label": "Webhook 事件对象",
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



def list_resource_configuration_profiles(
    object_type: str | None = None,
) -> list[dict[str, Any]]:
    """Return product-facing resource configuration profiles.

    Profiles are intentionally independent from connector catalog records so a
    future TABLE provider only adds a profile/adapter rather than a new object
    type or a new user-facing implementation-type field.
    """
    expected_type = str(object_type or "").strip().upper()
    return [
        deepcopy(profile)
        for profile in RESOURCE_CONFIGURATION_PROFILES
        if not expected_type or profile["object_type"] == expected_type
    ]


def get_resource_configuration_profile(code: str | None) -> dict[str, Any] | None:
    normalized_code = str(code or "").strip()
    profile = next(
        (item for item in RESOURCE_CONFIGURATION_PROFILES if item["code"] == normalized_code),
        None,
    )
    return deepcopy(profile) if profile else None


def detect_resource_configuration_profile(
    *,
    object_type: str | None,
    resource_defaults: dict[str, Any] | None = None,
    object_template: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Derive a profile from stable configuration fields, never a template name."""
    normalized_type = str(object_type or "").strip().upper()
    defaults = resource_defaults or {}
    template = object_template or {}
    object_defaults = template.get("default_object_config") or {}
    if not isinstance(object_defaults, dict):
        raise ValueError("RESOURCE_TEMPLATE_OBJECT_DEFAULTS_INVALID")
    if normalized_type == "EVENT_TYPE":
        validate_webhook_ingress_protocol(defaults.get("protocol"))
        detected = "webhook_ingress"
    elif normalized_type == "REPORT":
        detected = "beisen_report"
    elif normalized_type == "API_OBJECT":
        detected = "generic_api_object"
    elif normalized_type == "TABLE":
        has_sheet = any(_has_configuration_value(object_defaults.get(key)) for key in ("spreadsheet_token", "sheet_id", "range"))
        has_bitable = any(_has_configuration_value(object_defaults.get(key)) for key in ("app_token", "table_id", "view_id"))
        if has_sheet and has_bitable:
            raise ValueError("RESOURCE_TEMPLATE_TABLE_PROFILE_AMBIGUOUS")
        if has_sheet:
            detected = "feishu_sheet"
        elif has_bitable:
            detected = "feishu_bitable"
        else:
            raise ValueError("RESOURCE_TEMPLATE_TABLE_PROFILE_UNDETERMINED")
    else:
        raise ValueError("RESOURCE_TEMPLATE_OBJECT_TYPE_INVALID")
    profile = resolve_resource_configuration_profile(object_type=normalized_type, configuration_profile=detected)
    validate_resource_configuration_profile_config(profile=profile, object_config=object_defaults)
    return profile


def _has_configuration_value(value: Any) -> bool:
    return bool(value.strip()) if isinstance(value, str) else value is not None and value != ""


def validate_resource_configuration_profile_config(*, profile: dict[str, Any], object_config: dict[str, Any]) -> None:
    """Require every profile-defined locator before deriving an adapter."""
    missing_fields = [field["key"] for field in profile.get("object_config_schema", []) if field.get("required") and not _has_configuration_value(object_config.get(field["key"]))]
    if missing_fields:
        raise ValueError("RESOURCE_TEMPLATE_CONFIGURATION_FIELDS_REQUIRED:" f"{profile['code']}:{','.join(missing_fields)}")


def resolve_resource_configuration_profile(*, object_type: str | None, configuration_profile: str | None) -> dict[str, Any]:
    """Validate a persisted profile and derive its internal runtime binding."""
    normalized_type = str(object_type or "").strip().upper()
    if normalized_type not in {"EVENT_TYPE", "REPORT", "TABLE", "API_OBJECT"}:
        raise ValueError("RESOURCE_TEMPLATE_OBJECT_TYPE_INVALID")
    profile = get_resource_configuration_profile(str(configuration_profile or "").strip())
    if profile is None:
        raise ValueError("RESOURCE_TEMPLATE_CONFIGURATION_PROFILE_INVALID")
    if profile["object_type"] != normalized_type:
        raise ValueError("RESOURCE_TEMPLATE_CONFIGURATION_PROFILE_OBJECT_TYPE_MISMATCH")
    connector_type = profile.get("connector_type")
    if connector_type:
        connector = get_connector_type(connector_type, include_internal=True)
        if not connector or not connector.get("supports_ucp"):
            raise ValueError("RESOURCE_TEMPLATE_CONFIGURATION_PROFILE_UNAVAILABLE")
        profile["adapter_code"] = None if connector.get("connection_kind") == "EVENT_INGRESS" else connector.get("ucp_adapter_code")
    else:
        profile["adapter_code"] = None
    return profile
