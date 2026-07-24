"""UCP 资源适配器

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

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.types import AdapterResult  # Phase 1C: 独立 types 模块避免循环导入

logger = logging.getLogger("ucp.adapters")


class FeishuRecruitError(RuntimeError):
    def __init__(self, error_code: str, message: str):
        super().__init__(message)
        self.error_code = error_code


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
        return await self._get_detail(f"/hire/v1/applications/{application_id}/offer", timeout=timeout)

    async def get_candidate_detail(self, candidate_id: str, timeout: float = 30.0) -> dict | None:
        return await self._get_detail(f"/hire/v1/candidates/{candidate_id}", timeout=timeout)

    async def get_job_detail(self, job_id: str, timeout: float = 30.0) -> dict | None:
        return await self._get_detail(f"/hire/v1/jobs/{job_id}", timeout=timeout)

    async def list_candidates(self, *, page_size: int = 50, page_token: str | None = None, timeout: float = 30.0) -> dict:
        return await self._get_list("/hire/v1/candidates", page_size=page_size, page_token=page_token, timeout=timeout)

    async def list_jobs(self, *, page_size: int = 50, page_token: str | None = None, timeout: float = 30.0) -> dict:
        return await self._get_list("/hire/v1/jobs", page_size=page_size, page_token=page_token, timeout=timeout)

    async def _get_list(self, path: str, *, page_size: int, page_token: str | None, timeout: float) -> dict:
        import httpx

        token = await self._ensure_token()
        params: dict[str, Any] = {"page_size": max(1, min(int(page_size), 100))}
        if page_token:
            params["page_token"] = page_token
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{self.FEISHU_OPEN_API}{path}", headers=headers, params=params)
        if response.status_code == 403:
            raise FeishuRecruitError("FORBIDDEN", "Feishu recruiting permission denied")
        if response.status_code == 429:
            raise FeishuRecruitError("RATE_LIMITED", "Feishu recruiting rate limit exceeded")
        if response.status_code >= 400:
            raise FeishuRecruitError("UPSTREAM_HTTP_ERROR", f"Feishu recruiting HTTP {response.status_code}")
        payload = response.json()
        if str(payload.get("code", "0")) != "0":
            raise FeishuRecruitError("UPSTREAM_BUSINESS_ERROR", str(payload.get("msg", "unknown error")))
        return payload.get("data") if isinstance(payload.get("data"), dict) else {}

    async def _get_detail(self, path: str, *, timeout: float) -> dict | None:
        import httpx

        token = await self._ensure_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{self.FEISHU_OPEN_API}{path}", headers=headers)
        if response.status_code == 404:
            return None
        if response.status_code == 403:
            raise FeishuRecruitError("FORBIDDEN", "Feishu recruiting permission denied")
        if response.status_code == 429:
            raise FeishuRecruitError("RATE_LIMITED", "Feishu recruiting rate limit exceeded")
        if response.status_code >= 400:
            raise FeishuRecruitError("UPSTREAM_HTTP_ERROR", f"Feishu recruiting HTTP {response.status_code}")
        payload = response.json()
        if str(payload.get("code", "0")) != "0":
            raise FeishuRecruitError("UPSTREAM_BUSINESS_ERROR", str(payload.get("msg", "unknown error")))
        data = payload.get("data", {})
        return data if isinstance(data, dict) else None


def _salary_amount(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return _salary_amount(json.loads(value))
        except (TypeError, ValueError):
            return value
    if isinstance(value, dict):
        return value.get("amount") if "amount" in value else value.get("value")
    return value

def _target_bonus_amount(offer: dict[str, Any], compensation: dict[str, Any], custom_field_ids: list[str]) -> Any:
    for source in (offer, compensation):
        for field in ("target_bonus", "target_bonus_amount", "bonus_amount", "annual_bonus", "annual_bonus_amount"):
            value = source.get(field)
            if value not in (None, ""):
                return _salary_amount(value)
    if not custom_field_ids:
        return None
    for item in compensation.get("customize_info_list") or []:
        if not isinstance(item, dict) or str(item.get("object_id") or "") not in custom_field_ids:
            continue
        value = item.get("customize_value")
        if value not in (None, ""):
            return _salary_amount(value)
    return None


def _normalize_offer(
    application_id: str,
    offer: dict[str, Any],
    *,
    target_bonus_custom_field_ids: list[str] | None = None,
) -> dict[str, Any]:
    offer_payload = offer.get("offer") if isinstance(offer.get("offer"), dict) else offer
    compensation = (
        offer_payload.get("compensation")
        or offer_payload.get("salary")
        or offer_payload.get("salary_plan")
        or {}
    )
    if not isinstance(compensation, dict):
        compensation = {}
    bonus_field_ids = [str(value) for value in (target_bonus_custom_field_ids or []) if value not in (None, "")]
    return {
        **offer,
        "application_id": application_id,
        "offer_id": offer_payload.get("offer_id") or offer_payload.get("id"),
        "offer_status": offer_payload.get("offer_status") or offer_payload.get("status"),
        "salary_amount": _salary_amount(offer_payload.get("salary_amount") or compensation.get("amount") or compensation.get("basic_salary")),
        "salary_currency": offer_payload.get("salary_currency") or compensation.get("currency"),
        "target_bonus": _target_bonus_amount(offer_payload, compensation, bonus_field_ids),
    }

async def feishu_offer_detail_adapter(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
    application_id = str(params.get("application_id") or "")
    if not application_id:
        return AdapterResult(status="failed", error_code="MISSING_APPLICATION_ID", error_message="application_id is required")
    client = FeishuRecruitClient(str(secrets.get("app_id") or ""), str(secrets.get("app_secret") or ""))
    try:
        offer = await client.get_offer_detail(application_id)
        if offer is None:
            return AdapterResult(status="offer_not_found", data=[], row_count=0, extra={"application_id": application_id})
        offers = offer.get("offers") if isinstance(offer, dict) else None
        if isinstance(offers, list):
            if not offers:
                return AdapterResult(status="offer_not_found", data=[], row_count=0, extra={"application_id": application_id})
            if len(offers) != 1:
                return AdapterResult(
                    status="failed",
                    error_code="FAILED_AMBIGUOUS_OFFER",
                    error_message="同一投递记录匹配到多个 Offer，需人工确认",
                    extra={"application_id": application_id, "offer_count": len(offers)},
                )
            offer = offers[0]
        if not isinstance(offer, dict):
            return AdapterResult(status="offer_not_found", data=[], row_count=0, extra={"application_id": application_id})
        bonus_field_ids = params.get("target_bonus_custom_field_ids") or []
        if isinstance(bonus_field_ids, str):
            bonus_field_ids = [bonus_field_ids]
        if not isinstance(bonus_field_ids, list):
            bonus_field_ids = []
        return AdapterResult(
            status="success",
            data=[_normalize_offer(application_id, offer, target_bonus_custom_field_ids=bonus_field_ids)],
            row_count=1,
            success_count=1,
        )
    except FeishuRecruitError as error:
        return AdapterResult(status="failed", error_code=error.error_code, error_message=str(error)[:500], extra={"application_id": application_id})
    except Exception as error:
        logger.exception("[ucp] feishu_offer_detail failed for %s", application_id)
        return AdapterResult(status="failed", error_code="UPSTREAM_ERROR", error_message=str(error)[:500], extra={"application_id": application_id})


async def _feishu_detail_adapter(*, params: dict, secrets: dict, key_name: str, loader: str, entity_name: str) -> AdapterResult:
    entity_id = str(params.get(key_name) or "")
    if not entity_id:
        return AdapterResult(status="failed", error_code=f"MISSING_{key_name.upper()}", error_message=f"{key_name} is required")
    client = FeishuRecruitClient(str(secrets.get("app_id") or ""), str(secrets.get("app_secret") or ""))
    try:
        data = await getattr(client, loader)(entity_id)
        if data is None:
            return AdapterResult(status="not_found", data=[], row_count=0, extra={key_name: entity_id})
        return AdapterResult(status="success", data=[{key_name: entity_id, **data}], row_count=1, success_count=1)
    except FeishuRecruitError as error:
        return AdapterResult(status="failed", error_code=error.error_code, error_message=str(error)[:500], extra={key_name: entity_id})
    except Exception as error:
        logger.warning("[ucp] Feishu %s detail failed: %s", entity_name, error)
        return AdapterResult(status="failed", error_code="UPSTREAM_ERROR", error_message=str(error)[:500], extra={key_name: entity_id})


async def feishu_recruit_candidate_adapter(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
    return await _feishu_detail_adapter(params=params, secrets=secrets, key_name="candidate_id", loader="get_candidate_detail", entity_name="candidate")


async def feishu_recruit_job_adapter(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
    return await _feishu_detail_adapter(params=params, secrets=secrets, key_name="job_id", loader="get_job_detail", entity_name="job")


# ===== 适配器注册表 =====

async def _feishu_list_adapter(*, params: dict, secrets: dict, loader: str, entity_name: str) -> AdapterResult:
    client = FeishuRecruitClient(str(secrets.get("app_id") or ""), str(secrets.get("app_secret") or ""))
    try:
        data = await getattr(client, loader)(
            page_size=int(params.get("page_size") or 50),
            page_token=params.get("page_token") or None,
        )
        rows = data.get("items") or data.get(entity_name + "s") or []
        if not isinstance(rows, list):
            rows = []
        return AdapterResult(
            status="success",
            data=rows,
            row_count=len(rows),
            success_count=len(rows),
            extra={"page_token": data.get("page_token"), "has_more": bool(data.get("has_more"))},
        )
    except FeishuRecruitError as error:
        return AdapterResult(status="failed", error_code=error.error_code, error_message=str(error)[:500])
    except Exception as error:
        logger.exception("[ucp] feishu_recruit_%s_list failed", entity_name)
        return AdapterResult(status="failed", error_code="UPSTREAM_ERROR", error_message=str(error)[:500])


async def feishu_recruit_candidate_list_adapter(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
    return await _feishu_list_adapter(params=params, secrets=secrets, loader="list_candidates", entity_name="candidate")


async def feishu_recruit_job_list_adapter(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
    return await _feishu_list_adapter(params=params, secrets=secrets, loader="list_jobs", entity_name="job")


ADAPTER_REGISTRY: dict[str, callable] = {
    "BEISEN_PENDING_LIST_ADAPTER": beisen_pending_list_adapter,
    "FEISHU_OFFER_DETAIL_ADAPTER": feishu_offer_detail_adapter,
    "FEISHU_RECRUIT_CANDIDATE_ADAPTER": feishu_recruit_candidate_adapter,
    "FEISHU_RECRUIT_JOB_ADAPTER": feishu_recruit_job_adapter,
    "FEISHU_RECRUIT_CANDIDATE_LIST_ADAPTER": feishu_recruit_candidate_list_adapter,
    "FEISHU_RECRUIT_JOB_LIST_ADAPTER": feishu_recruit_job_list_adapter,
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

    可在 Pipeline 的 RESOURCE 步骤中使用，与 upload 端点配合：
      1. POST /ucp/excel/upload 上传得到 file_key
      2. 配置资源 file_config.file_key 或步骤 params.file_path
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

# Phase 4: Feishu Bitable reusable resource adapter
from app.ucp.feishu_bitable_adapter import feishu_bitable_pull_adapter  # noqa: E402
ADAPTER_REGISTRY["FEISHU_BITABLE_PULL_ADAPTER"] = feishu_bitable_pull_adapter

# X0211: shared connector catalog runtime bridge for Feishu online spreadsheets.
from app.ucp.feishu_sheet_adapter import feishu_sheet_pull_adapter  # noqa: E402
ADAPTER_REGISTRY["FEISHU_SHEET_PULL_ADAPTER"] = feishu_sheet_pull_adapter

# X0211: standard Beisen report connection, with platform-owned endpoint defaults.
from app.ucp.beisen_report_adapter import beisen_report_pull_adapter  # noqa: E402
ADAPTER_REGISTRY["BEISEN_REPORT_PULL_ADAPTER"] = beisen_report_pull_adapter

# X0206: platform-owned, whitelist-protected generic read-only REST adapter.
from app.ucp.generic_http_adapter import generic_http_action_adapter  # noqa: E402
ADAPTER_REGISTRY["GENERIC_HTTP_ACTION_ADAPTER"] = generic_http_action_adapter

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
