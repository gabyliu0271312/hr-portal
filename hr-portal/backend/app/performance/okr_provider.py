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


def map_feishu_okr(payload: dict[str, Any], *, source: str = "feishu") -> OkrView | None:
    """把飞书 ``/okr/v1/users/{user_id}/okrs`` 的响应归一化成 :class:`OkrView`。

    纯函数（不触网、不查库），便于用固定响应体做回归测试。
    响应中没有 OKR（或 okr_list 为空）时返回 ``None``。
    """
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return None
    okr_list = data.get("okr_list") or []
    if not okr_list:
        return None

    okr = okr_list[0] if isinstance(okr_list[0], dict) else {}
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


class OkrProvider(Protocol):
    """OKR 数据源协议"""

    name: str

    async def fetch(self, db: AsyncSession, employee_no: str) -> OkrView | None: ...


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
        open_id = await self.resolve_open_id(db, employee_no)
        if not open_id:
            logger.info("[okr] 员工未绑定飞书身份，跳过 OKR 拉取: %s", employee_no)
            return None

        params: dict[str, Any] = {
            "user_id_type": "open_id",
            "offset": "0",
            "limit": "10",
            "lang": "zh_cn",
        }
        if self._period_ids:
            params["period_ids"] = self._period_ids
        try:
            payload = await self._client.get_json(f"/okr/v1/users/{quote(open_id, safe='')}/okrs", params)
        except FeishuClientError as exc:
            # 1001004 = OKR 数据不存在，属于正常空态；其它错误记录后按空态降级，不阻塞填写页
            logger.warning("[okr] 拉取飞书 OKR 失败 employee=%s code=%s: %s", employee_no, exc.code, exc)
            return None

        view = map_feishu_okr(payload)
        if view is None:
            logger.info("[okr] 飞书未返回 OKR: employee=%s", employee_no)
        return view


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
