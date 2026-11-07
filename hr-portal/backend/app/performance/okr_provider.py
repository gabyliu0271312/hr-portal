"""绩效参考内容 · OKR 数据源接入。

内容设置里配置的 OKR 参考内容（`reference_kind='more'`, `reference_value='okr'`）
只登记了「要展示 OKR」，真实的目标/KR/进度必须在填写页按被评估人实时取。

数据源由配置决定：

    PERFORMANCE_OKR_PROVIDER = none | feishu

- ``none``（默认）：不接外部系统，``fetch`` 返回 ``None``，前端展示空态；
- ``feishu``：调用飞书开放平台 OKR v1 接口（tenant_access_token）。

身份按员工实时花名册的邮箱、手机号解析为当前应用的 Open ID；
缺少花名册联系方式时兼容已有 Portal 飞书绑定，不写入人员快照或 SSO 绑定。
"""
from __future__ import annotations

import logging
from urllib.parse import quote
from typing import Any, Protocol

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.data.employee_roster_contract import EmployeeRosterContractError, employee_roster_table
from app.integrations.feishu.feishu_client import FeishuClient, FeishuClientError, get_feishu_client
from app.performance.models import PerformanceIdentityLink
from app.users.models import User


logger = logging.getLogger("performance.okr")

#: 飞书 progress_rate.status 既有枚举字符串也有数字码，统一成语义值
_STATUS_ALIASES = {"-1": "unset", "0": "normal", "1": "risk", "2": "extended"}


class OkrKeyResultView(BaseModel):
    """关键结果（KR）"""

    id: str = ""
    content: str = ""
    weight: float | None = None
    percent: float | None = None
    status: str | None = None


class OkrObjectiveView(BaseModel):
    """目标（O）"""

    id: str = ""
    content: str = ""
    weight: float | None = None
    percent: float | None = None
    status: str | None = None
    key_results: list[OkrKeyResultView] = Field(default_factory=list)


class OkrView(BaseModel):
    """一个 OKR（某周期下的一组目标）"""

    source: str = "feishu"
    okr_id: str = ""
    period_id: str | None = None
    period_label: str = ""
    objectives: list[OkrObjectiveView] = Field(default_factory=list)


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _status(value: Any) -> str | None:
    if value is None or value == "":
        return None
    text = str(value).strip().lower()
    return _STATUS_ALIASES.get(text, text)


def _percent(progress_rate: Any) -> float | None:
    if not isinstance(progress_rate, dict):
        return None
    return _as_float(progress_rate.get("percent"))


def _map_feishu_okr(okr: dict[str, Any], *, source: str = "feishu") -> OkrView:
    objectives: list[OkrObjectiveView] = []
    for objective in okr.get("objective_list") or []:
        if not isinstance(objective, dict):
            continue
        progress = objective.get("progress_rate")
        key_results: list[OkrKeyResultView] = []
        for kr in objective.get("kr_list") or []:
            if not isinstance(kr, dict):
                continue
            kr_progress = kr.get("progress_rate")
            key_results.append(OkrKeyResultView(
                id=str(kr.get("id") or ""),
                content=str(kr.get("content") or ""),
                weight=_as_float(kr.get("kr_weight") if kr.get("kr_weight") is not None else kr.get("weight")),
                percent=_percent(kr_progress),
                status=_status(kr_progress.get("status")) if isinstance(kr_progress, dict) else None,
            ))
        objectives.append(OkrObjectiveView(
            id=str(objective.get("id") or ""),
            content=str(objective.get("content") or ""),
            weight=_as_float(objective.get("weight")),
            percent=_percent(progress),
            status=_status(progress.get("status")) if isinstance(progress, dict) else None,
            key_results=key_results,
        ))

    return OkrView(
        source=source,
        okr_id=str(okr.get("id") or ""),
        period_id=str(okr.get("period_id") or "") or None,
        period_label=str(okr.get("name") or ""),
        objectives=objectives,
    )


def map_feishu_okrs(payload: dict[str, Any], *, source: str = "feishu") -> list[OkrView]:
    """把一个飞书分页响应中的全部 OKR 归一化。"""
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return []
    return [_map_feishu_okr(okr, source=source) for okr in data.get("okr_list") or [] if isinstance(okr, dict)]


def map_feishu_okr(payload: dict[str, Any], *, source: str = "feishu") -> OkrView | None:
    """把飞书 OKR 响应的首个 OKR 归一化，保持 legacy 单周期语义。"""
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict) or not data.get("okr_list"):
        return None
    okr = data["okr_list"][0]
    return _map_feishu_okr(okr if isinstance(okr, dict) else {}, source=source)


class OkrProvider(Protocol):
    """OKR 数据源协议"""

    name: str

    async def fetch(self, db: AsyncSession, employee_no: str) -> OkrView | None: ...

    async def fetch_all(self, db: AsyncSession, employee_no: str) -> list[OkrView]: ...


class FeishuOkrProvider:
    """飞书 OKR 数据源。"""

    name = "feishu"

    def __init__(self, client: FeishuClient | None = None, period_ids: list[str] | None = None):
        self._client = client or get_feishu_client()
        self._period_ids = period_ids or []

    async def resolve_open_id(self, db: AsyncSession, employee_no: str) -> str | None:
        """employee_no → current application's Feishu open_id."""
        if not employee_no:
            return None
        try:
            table = employee_roster_table()
            columns = table.c
            email_col = columns.get("corporate_email")
            mobile_col = columns.get("mobile_phone")
            if email_col is not None or mobile_col is not None:
                values = (await db.execute(
                    select(*[column for column in (email_col, mobile_col) if column is not None])
                    .where(columns.employee_no == employee_no)
                )).mappings().one_or_none()
                if values is not None:
                    email = str(values.get("corporate_email") or "").strip()
                    mobile = str(values.get("mobile_phone") or "").strip()
                    payload = {
                        **({"emails": [email]} if email else {}),
                        **({"mobiles": [mobile]} if mobile else {}),
                    }
                    if payload:
                        resolved = await self._client.resolve_user_ids({**payload, "include_resigned": True})
                        users = (resolved.get("data") or {}).get("user_list") or []
                        ids = {str(item.get("user_id")) for item in users if item.get("user_id")}
                        if len(ids) == 1:
                            return next(iter(ids))
                        if len(ids) > 1:
                            logger.warning("[okr] 花名册联系方式解析到多个飞书用户: employee=%s", employee_no)
                        return None
        except EmployeeRosterContractError:
            pass
        except FeishuClientError as exc:
            logger.warning("[okr] 花名册身份解析失败 employee=%s code=%s", employee_no, exc.code)
            return None
        open_id = (await db.execute(
            select(User.feishu_user_id)
            .join(PerformanceIdentityLink, PerformanceIdentityLink.portal_user_id == User.id)
            .where(PerformanceIdentityLink.employee_no == employee_no, PerformanceIdentityLink.is_active.is_(True), User.is_active.is_(True))
        )).scalar_one_or_none()
        return str(open_id).strip() if open_id else None

    async def fetch(self, db: AsyncSession, employee_no: str) -> OkrView | None:
        okrs = await self._fetch(db, employee_no, include_periods=False)
        return okrs[0] if okrs else None

    async def fetch_all(self, db: AsyncSession, employee_no: str) -> list[OkrView]:
        return await self._fetch(db, employee_no, include_periods=True)

    async def _fetch(self, db: AsyncSession, employee_no: str, *, include_periods: bool) -> list[OkrView]:
        open_id = await self.resolve_open_id(db, employee_no)
        if not open_id:
            logger.info("[okr] 员工未绑定飞书身份，跳过 OKR 拉取: %s", employee_no)
            return []

        params: dict[str, Any] = {
            "user_id_type": "open_id",
            "offset": "0",
            "limit": "10",
            "lang": "zh_cn",
        }
        if self._period_ids:
            params["period_ids"] = self._period_ids
        okrs: list[OkrView] = []
        seen_pages = set()
        offset = 0
        total = None
        while True:
            params["offset"] = str(offset)
            try:
                payload = await self._client.get_json(f"/okr/v1/users/{quote(open_id, safe='')}/okrs", params)
            except FeishuClientError as exc:
                # 1001004 = OKR 数据不存在；外部错误按空态降级，不阻塞填写页
                logger.warning("[okr] 拉取飞书 OKR 失败 employee=%s code=%s: %s", employee_no, exc.code, exc)
                return []
            if not include_periods:
                view = map_feishu_okr(payload)
                return [view] if view is not None else []
            page = map_feishu_okrs(payload)
            reported_total = (payload.get("data") or {}).get("total")
            if reported_total is not None:
                total = int(reported_total)
            if not page:
                if total is not None and offset < total:
                    logger.warning("[okr] 飞书分页提前为空 employee=%s offset=%s total=%s", employee_no, offset, total)
                    return []
                break
            page_ids = tuple((view.okr_id, view.period_id) for view in page)
            if page_ids in seen_pages:
                logger.warning("[okr] 飞书返回重复分页 employee=%s offset=%s", employee_no, offset)
                return []
            seen_pages.add(page_ids)
            okrs.extend(page)
            offset += len((payload.get("data") or {}).get("okr_list") or [])
            if total is not None:
                if offset >= total:
                    break
            elif len(page) < 10:
                break
        return okrs


def okr_provider_name() -> str:
    return str(getattr(settings, "PERFORMANCE_OKR_PROVIDER", "") or "").strip().lower()


def get_okr_provider() -> OkrProvider | None:
    """按配置返回 OKR 数据源；未配置/未知返回 None（前端展示空态）。"""
    name = okr_provider_name()
    if name in ("", "none", "disabled", "off"):
        return None
    if name == "feishu":
        period_ids = [item.strip() for item in (getattr(settings, "PERFORMANCE_OKR_PERIOD_IDS", "") or "").split(",") if item.strip()]
        return FeishuOkrProvider(period_ids=period_ids)
    logger.warning("[okr] 未支持的 PERFORMANCE_OKR_PROVIDER=%s", name)
    return None


async def fetch_employee_okr(db: AsyncSession, employee_no: str) -> OkrView | None:
    """按被评估人工号取 OKR；数据源未启用或员工无数据时返回 None。"""
    provider = get_okr_provider()
    if provider is None:
        return None
    try:
        return await provider.fetch(db, employee_no)
    except Exception:  # noqa: BLE001 - 参考内容是旁路信息，任何异常都不应阻塞填写页
        logger.exception("[okr] 获取 OKR 异常 employee=%s", employee_no)
        return None


async def fetch_employee_okrs(db: AsyncSession, employee_no: str) -> list[OkrView]:
    """按被评估人工号读取全部可用 OKR 周期。"""
    provider = get_okr_provider()
    if provider is None:
        return []
    try:
        return await provider.fetch_all(db, employee_no)
    except Exception:  # noqa: BLE001 - 与单周期参考内容使用相同的空态降级边界
        logger.exception("[okr] 获取全部 OKR 异常 employee=%s", employee_no)
        return []
