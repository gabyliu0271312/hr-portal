"""飞书 OAuth 客户端（用飞书账号登录 HR Portal）

链路：
- get_authorize_url：拼飞书网页授权地址，浏览器跳过去让用户确认
- exchange_user_info：拿回调 code 换 user_access_token，再取用户邮箱 / open_id / 姓名

app_access_token 走自建应用凭证，带 30 分钟内存缓存（飞书有效期约 7200s）。
失败统一抛 FeishuError，由 router 决定如何回给前端。
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import settings


_AUTHORIZE_URL = "https://open.feishu.cn/open-apis/authen/v1/authorize"
_APP_TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal"
_OIDC_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v1/oidc/access_token"
_USER_INFO_URL = "https://open.feishu.cn/open-apis/authen/v1/user_info"


class FeishuError(Exception):
    """飞书接口返回非 0 code 或网络异常"""


@dataclass
class FeishuUser:
    open_id: str
    name: str
    email: str | None
    enterprise_email: str | None


@dataclass
class _TokenCache:
    token: str
    expires_at: float


_app_token_cache: dict[str, _TokenCache] = {}


def get_authorize_url(state: str) -> str:
    """拼飞书网页授权地址。redirect_uri 必须与开放平台白名单一致。"""
    params = {
        "app_id": settings.FEISHU_APP_ID,
        "redirect_uri": settings.FEISHU_REDIRECT_URI,
        "response_type": "code",
        "state": state,
    }
    return f"{_AUTHORIZE_URL}?{urlencode(params)}"


async def _get_app_access_token(timeout: float = 15.0) -> str:
    """获取 app_access_token，带 30 分钟缓存"""
    cache_key = settings.FEISHU_APP_ID
    now = time.time()
    cached = _app_token_cache.get(cache_key)
    if cached and cached.expires_at > now + 60:
        return cached.token

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            _APP_TOKEN_URL,
            json={
                "app_id": settings.FEISHU_APP_ID,
                "app_secret": settings.FEISHU_APP_SECRET,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    if data.get("code") != 0:
        raise FeishuError(f"获取 app_access_token 失败：{data.get('msg')}")

    token = data["app_access_token"]
    _app_token_cache[cache_key] = _TokenCache(
        token=token, expires_at=now + data.get("expire", 7200)
    )
    return token


async def exchange_user_info(code: str, timeout: float = 15.0) -> FeishuUser:
    """回调 code -> user_access_token -> 用户信息"""
    app_token = await _get_app_access_token(timeout=timeout)

    async with httpx.AsyncClient(timeout=timeout) as client:
        token_resp = await client.post(
            _OIDC_TOKEN_URL,
            headers={"Authorization": f"Bearer {app_token}"},
            json={"grant_type": "authorization_code", "code": code},
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
        if token_data.get("code") != 0:
            raise FeishuError(f"换取用户 token 失败：{token_data.get('msg')}")
        user_access_token = token_data["data"]["access_token"]

        info_resp = await client.get(
            _USER_INFO_URL,
            headers={"Authorization": f"Bearer {user_access_token}"},
        )
        info_resp.raise_for_status()
        info_data = info_resp.json()
    if info_data.get("code") != 0:
        raise FeishuError(f"获取用户信息失败：{info_data.get('msg')}")

    d = info_data["data"]
    return FeishuUser(
        open_id=d["open_id"],
        name=d.get("name", ""),
        email=d.get("email"),
        enterprise_email=d.get("enterprise_email"),
    )
