"""UCP 连接器适配器

将现有的北森客户端、飞书客户端封装为 UCP 标准适配器接口。
新增飞书招聘 Offer 查询客户端。

适配器协议：
  - async execute(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult
  - AdapterResult 包含 status, data, row_count, error 等

Phase 1A 适配器：
  - BEISEN_PENDING_LIST_ADAPTER  复用 BeisenApiClient 拉取北森待入职列表
  - FEISHU_OFFER_DETAIL_ADAPTER  新建飞书招聘 Offer 查询
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.types import AdapterResult  # Phase 1C: 独立 types 模块避免循环导入

logger = logging.getLogger("ucp.adapters")


# AdapterResult 已在 app.ucp.types 中定义（Phase 1C 提取以避免循环导入）


# ===== 北森待入职列表适配器 =====

async def beisen_pending_list_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """从北森拉取待入职人员列表。

    复用现有 BeisenApiClient，参数映射到 UCP 格式。
    params 应包含：
      - token_url: 北森 token 接口 URL
      - data_url: 北森待入职人员列表 API URL
      - method: HTTP 方法（默认 POST）
      - body_template: 请求体 JSON 模板
    secrets 应包含：
      - app_key: 北森 App Key
      - app_secret: 北森 App Secret
    """
    from app.datasources.beisen_client import BeisenApiClient

    settings = {
        "BEISEN_API_TOKEN_URL": params.get("token_url", ""),
        "BEISEN_API_DATA_URL": params.get("data_url", ""),
        "BEISEN_API_METHOD": params.get("method", "POST"),
        "BEISEN_API_BODY_TEMPLATE": params.get("body_template", ""),
    }
    secret_map = {
        "BEISEN_API_APP_KEY": secrets.get("app_key", ""),
        "BEISEN_API_APP_SECRET": secrets.get("app_secret", ""),
    }

    client = BeisenApiClient(settings, secret_map)
    try:
        data = await client.fetch()
        return AdapterResult(
            status="success",
            data=data,
            row_count=len(data),
            success_count=len(data),
        )
    except Exception as e:
        logger.exception("[ucp] beisen_pending_list failed: %s", e)
        return AdapterResult(
            status="failed",
            error_message=str(e)[:500],
        )


# ===== 飞书招聘 Offer 详情适配器 =====

class FeishuRecruitClient:
    """飞书招聘 API 客户端。

    专用于查询 Offer 详情，支持按 application_id 查询。
    认证使用飞书 tenant_access_token（与飞书消息客户端共用 app_id/app_secret，
    但可能使用不同的飞书应用——招聘应用 vs 消息应用）。
    """

    FEISHU_OPEN_API = "https://open.feishu.cn/open-apis"

    def __init__(self, app_id: str, app_secret: str):
        self._app_id = app_id
        self._app_secret = app_secret
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    async def _ensure_token(self) -> str:
        """获取飞书 tenant_access_token，带缓存。"""
        import time
        import httpx

        if self._token and time.time() < self._token_expires_at - 60:
            return self._token

        url = f"{self.FEISHU_OPEN_API}/auth/v3/tenant_access_token/internal"
        payload = {"app_id": self._app_id, "app_secret": self._app_secret}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"飞书招聘 token 获取失败: {data.get('msg')} (code={data.get('code')})")

        self._token = data["tenant_access_token"]
        self._token_expires_at = time.time() + data.get("expire", 7200)
        return self._token

    async def get_offer_detail(
        self,
        application_id: str,
        timeout: float = 30.0,
    ) -> dict | None:
        """按 application_id 查询飞书招聘 Offer 详情。

        返回 Offer 数据 dict，如果未找到返回 None。
        注意：飞书招聘 API 的具体路径和参数需要根据实际接口确认。
        Phase 1A 使用占位路径，后续联调时修正。
        """
        import httpx

        token = await self._ensure_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        # 飞书招聘 Offer 查询 API（具体路径需联调确认）
        # 预期路径：/hire/v1/offers?application_id={application_id}
        # 或：/hire/v1/applications/{application_id}/offer
        url = f"{self.FEISHU_OPEN_API}/hire/v1/offers"

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                url,
                params={"application_id": application_id},
                headers=headers,
            )

        if resp.status_code == 404:
            return None  # Offer 不存在

        data = resp.json()
        if str(data.get("code", "0")) != "0":
            # 飞书业务错误
            error_msg = data.get("msg", "unknown error")
            error_code = data.get("code", -1)
            raise RuntimeError(f"飞书招聘 Offer 查询失败 (code={error_code}): {error_msg}")

        # 提取 Offer 数据
        offer_data = data.get("data", {})
        if isinstance(offer_data, dict):
            return offer_data
        return None


async def feishu_offer_detail_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """从飞书招聘查询单个 Offer 详情。

    params 应包含：
      - application_id: 投递 ID（必填）
    secrets 应包含：
      - app_id: 飞书招聘应用 App ID
      - app_secret: 飞书招聘应用 App Secret
    """
    application_id = params.get("application_id", "")
    if not application_id:
        return AdapterResult(
            status="failed",
            error_code="MISSING_APPLICATION_ID",
            error_message="application_id 参数为空",
        )

    app_id = secrets.get("app_id", "")
    app_secret = secrets.get("app_secret", "")

    client = FeishuRecruitClient(app_id, app_secret)
    try:
        offer = await client.get_offer_detail(application_id)

        if offer is None:
            return AdapterResult(
                status="offer_not_found",
                data=[],
                row_count=0,
                extra={"application_id": application_id},
            )

        # 将 Offer 数据标准化为列表格式（统一返回 data 为 list[dict]）
        offer_record = {"application_id": application_id, **(offer or {})}
        return AdapterResult(
            status="success",
            data=[offer_record],
            row_count=1,
            success_count=1,
        )
    except RuntimeError as e:
        logger.warning("[ucp] feishu_offer_detail failed for %s: %s", application_id, e)
        return AdapterResult(
            status="failed",
            error_message=str(e)[:500],
            extra={"application_id": application_id},
        )
    except Exception as e:
        logger.exception("[ucp] feishu_offer_detail unexpected error for %s", application_id)
        return AdapterResult(
            status="failed",
            error_message=str(e)[:500],
            extra={"application_id": application_id},
        )


# ===== 适配器注册表 =====

ADAPTER_REGISTRY: dict[str, callable] = {
    "BEISEN_PENDING_LIST_ADAPTER": beisen_pending_list_adapter,
    "FEISHU_OFFER_DETAIL_ADAPTER": feishu_offer_detail_adapter,
}


# Phase 2-7: Excel 文件导入适配器

async def excel_import_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """Excel 文件导入适配器：解析 params.file_path 指向的 Excel，返回行数据。

    params 应包含：
      - file_path: 已上传的 Excel 文件绝对路径（必填）
      - sheet_name: 工作表名（可选，默认第一个）
      - mapping_rules: 字段映射 [{source, target}]（可选）

    可在 Pipeline 的 CONNECTOR 步骤中使用，与 upload 端点配合：
      1. POST /ucp/excel/upload 上传得到 file_key
      2. 配置连接器 file_config.file_key 或步骤 params.file_path
    """
    from app.ucp.excel_service import parse_excel_file, resolve_file_path, _apply_mapping, ExcelImportError

    file_key = params.get("file_key") or params.get("file_path")
    if not file_key:
        return AdapterResult(
            status="failed",
            error_code="MISSING_FILE",
            error_message="缺少 file_key / file_path 参数",
        )

    try:
        # 如果是 file_key（不含路径分隔符），解析为绝对路径
        if "/" not in str(file_key) and "\\" not in str(file_key):
            file_path = resolve_file_path(str(file_key))
        else:
            file_path = str(file_key)
        parsed = parse_excel_file(file_path, sheet_name=params.get("sheet_name"))
    except ExcelImportError as e:
        return AdapterResult(
            status="failed",
            error_code=e.code,
            error_message=e.message,
        )
    except Exception as e:
        logger.exception("[ucp] excel_import_adapter failed: %s", e)
        return AdapterResult(
            status="failed",
            error_code="EXCEL_PARSE_ERROR",
            error_message=str(e)[:500],
        )

    mapping_rules = params.get("mapping_rules")
    rows = parsed["rows"]
    if mapping_rules:
        rows = [_apply_mapping(r, mapping_rules) for r in rows]

    return AdapterResult(
        status="success",
        data=rows,
        row_count=len(rows),
        success_count=len(rows),
        extra={"headers": parsed["headers"]},
    )


ADAPTER_REGISTRY["EXCEL_IMPORT_ADAPTER"] = excel_import_adapter


# Phase 1C: 集成现有视图配置桥接适配器
from app.ucp.datasource_bridge import ADAPTER_REGISTRY_BRIDGE  # noqa: E402
ADAPTER_REGISTRY.update(ADAPTER_REGISTRY_BRIDGE)

# Phase 1C: 集成现有 push_target 桥接适配器
from app.ucp.push_bridge import ADAPTER_REGISTRY_PUSH_BRIDGE  # noqa: E402
ADAPTER_REGISTRY.update(ADAPTER_REGISTRY_PUSH_BRIDGE)

# Phase 3-4: 外部账号适配器（滴滴/曹操等）
from app.ucp.external_account_adapters import register_external_account_adapters  # noqa: E402
register_external_account_adapters()

# Phase 3-6: OA 组织架构同步适配器
from app.ucp.oa_sync_adapters import register_oa_sync_adapters  # noqa: E402
register_oa_sync_adapters()


def get_adapter(adapter_code: str) -> callable:
    """获取适配器函数。"""
    adapter = ADAPTER_REGISTRY.get(adapter_code)
    if adapter is None:
        raise RuntimeError(
            f"Adapter '{adapter_code}' not registered; "
            f"available={list(ADAPTER_REGISTRY.keys())}"
        )
    return adapter
