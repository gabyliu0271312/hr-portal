"""飞书 OpenAPI 客户端封装

封装飞书消息发送 API，管理应用凭证（tenant_access_token）。
屏蔽 token 获取、请求重试、错误解析等细节。

生产使用时需配置环境变量：
  FEISHU_APP_ID
  FEISHU_APP_SECRET

token 不出现在日志中，不返回给前端。
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.core.config import settings


logger = logging.getLogger("feishu.client")

FEISHU_OPEN_API = "https://open.feishu.cn/open-apis"


class FeishuClientError(Exception):
    """飞书接口调用失败"""
    def __init__(self, msg: str, code: int = 0):
        super().__init__(msg)
        self.code = code


class FeishuClient:
    """飞书消息发送客户端（单例模式，应用级复用）。

    token 缓存在实例内，接近过期时自动刷新。
    线程安全性：asyncio 单线程下 OK，不跨线程共享。
    """

    def __init__(self, app_id: str, app_secret: str):
        self._app_id = app_id
        self._app_secret = app_secret
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    @classmethod
    def from_settings(cls) -> "FeishuClient":
        """从全局配置创建客户端。"""
        app_id = getattr(settings, "FEISHU_APP_ID", "")
        app_secret = getattr(settings, "FEISHU_APP_SECRET", "")
        if not app_id or not app_secret:
            logger.warning("[feishu] FEISHU_APP_ID / FEISHU_APP_SECRET 未配置，飞书发送将失败")
        return cls(app_id, app_secret)

    async def _ensure_token(self) -> str:
        """获取或刷新 tenant_access_token。"""
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token

        url = f"{FEISHU_OPEN_API}/auth/v3/tenant_access_token/internal"
        payload = {"app_id": self._app_id, "app_secret": self._app_secret}
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
        data = resp.json()
        if data.get("code") != 0:
            raise FeishuClientError(f"获取 token 失败: {data.get('msg')}", data.get("code", -1))

        self._token = data["tenant_access_token"]
        # expire 为秒数，提前 60s 刷新
        self._token_expires_at = time.time() + data.get("expire", 7200)
        return self._token

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        """通用 POST，携带 token。"""
        token = await self._ensure_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        url = f"{FEISHU_OPEN_API}{path}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
        data = resp.json()
        if data.get("code") != 0:
            msg = data.get("msg", "unknown error")
            raise FeishuClientError(f"飞书接口错误: {msg} (code={data.get('code')})", data.get("code", -1))
        return data

    async def send_text_to_user(self, open_id: str, text: str) -> dict:
        """向个人用户发送文本消息。"""
        return await self._post("/im/v1/messages?receive_id_type=open_id", {
            "receive_id": open_id,
            "msg_type": "text",
            "content": f'{{"text": {_json_str(text)}}}',
        })

    async def send_text_to_chat(self, chat_id: str, text: str) -> dict:
        """向群发送文本消息。"""
        return await self._post("/im/v1/messages?receive_id_type=chat_id", {
            "receive_id": chat_id,
            "msg_type": "text",
            "content": f'{{"text": {_json_str(text)}}}',
        })

    async def send_markdown_to_user(self, open_id: str, title: str, content: str) -> dict:
        """向个人用户发送 post（富文本）消息。"""
        return await self._post("/im/v1/messages?receive_id_type=open_id", {
            "receive_id": open_id,
            "msg_type": "post",
            "content": _build_post_content(title, content),
        })

    async def send_markdown_to_chat(self, chat_id: str, title: str, content: str) -> dict:
        """向群发送 post（富文本）消息。"""
        return await self._post("/im/v1/messages?receive_id_type=chat_id", {
            "receive_id": chat_id,
            "msg_type": "post",
            "content": _build_post_content(title, content),
        })

    # ===== 互动卡片消息 =====

    async def send_interactive_card_to_user(
        self,
        open_id: str,
        card_content: str,
    ) -> dict:
        """向个人用户发送互动卡片消息。

        card_content: 飞书消息卡片 JSON 字符串（符合卡片 JSON 2.0 规范）。
        """
        return await self._post("/im/v1/messages?receive_id_type=open_id", {
            "receive_id": open_id,
            "msg_type": "interactive",
            "content": card_content,
        })

    async def send_interactive_card_to_chat(
        self,
        chat_id: str,
        card_content: str,
    ) -> dict:
        """向群发送互动卡片消息。"""
        return await self._post("/im/v1/messages?receive_id_type=chat_id", {
            "receive_id": chat_id,
            "msg_type": "interactive",
            "content": card_content,
        })

    async def update_interactive_message(
        self,
        message_id: str,
        card_content: str,
    ) -> dict:
        """更新已发送的互动卡片消息（如按钮点击后替换卡片）。

        message_id: 飞书消息 ID。
        card_content: 新的卡片 JSON 字符串。
        """
        token = await self._ensure_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        url = f"{FEISHU_OPEN_API}/im/v1/messages/{message_id}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(url, json={
                "content": card_content,
            }, headers=headers)
        data = resp.json()
        if data.get("code") != 0:
            msg = data.get("msg", "unknown error")
            raise FeishuClientError(
                f"更新消息失败: {msg} (code={data.get('code')})",
                data.get("code", -1),
            )
        return data

    # ===== 用户信息 =====

    async def get_user_info(self, open_id: str) -> dict:
        """根据 open_id 获取用户信息（用于验证 ID 有效性）。"""
        token = await self._ensure_token()
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{FEISHU_OPEN_API}/contact/v3/users/{open_id}?user_id_type=open_id"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
        return resp.json()


def _json_str(s: str) -> str:
    """把 Python 字符串转为 JSON 字符串字面量（含引号）。"""
    import json
    return json.dumps(s, ensure_ascii=False)


def _build_post_content(title: str, content: str) -> str:
    """构建飞书 post 消息的 content JSON 字符串。

    支持在 content 中使用 <at user_id="ou_xxx">@用户名</at> 格式来 @ 提及用户。
    解析后转换为飞书 post 消息的 at 元素。
    """
    import json
    import re

    # 解析 <at> 标签，转换为飞书 post 消息格式
    # 格式：<at user_id="ou_xxx">@用户名</at>
    content_elements = []
    last_end = 0

    for match in re.finditer(r'<at\s+user_id="(.+?)">(.+?)</at>', content):
        # 添加 @ 之前的文本
        if match.start() > last_end:
            text_before = content[last_end:match.start()]
            if text_before:
                content_elements.append({"tag": "text", "text": text_before})

        # 添加 @ 元素
        user_id = match.group(1)
        user_name = match.group(2)
        content_elements.append({
            "tag": "at",
            "user_id": user_id,
            "user_name": user_name,
        })

        last_end = match.end()

    # 添加剩余文本
    if last_end < len(content):
        text_after = content[last_end:]
        if text_after:
            content_elements.append({"tag": "text", "text": text_after})

    # 如果没有 @ 标签，整个内容作为纯文本
    if not content_elements:
        content_elements = [{"tag": "text", "text": content}]

    post_body = {
        "zh_cn": {
            "title": title,
            "content": [content_elements],
        }
    }
    return json.dumps({"post": post_body}, ensure_ascii=False)


# ===== 卡片构建工具 =====

def _card_button_get(card_button, key: str, default=None):
    """?? dict / Pydantic ????????????"""
    if card_button is None:
        return default
    if isinstance(card_button, dict):
        return card_button.get(key, default)
    return getattr(card_button, key, default)


def build_completion_card(
    title: str,
    content: str,
    notification_log_id: int,
    biz_type: str | None = None,
    biz_id: str | None = None,
    completed_names: list[str] | None = None,
    total_count: int | None = None,
    is_group: bool = False,
    card_button: dict | None = None,
) -> str:
    """构建带"标记完成"按钮的飞书互动卡片。

    私聊模式：
      - 显示消息内容 + "✅ 标记完成" 按钮
      - 如果已完成，按钮变为灰色禁用态

    群聊模式：
      - 显示消息内容 + 进度条 + 已完成名单
      - 按钮可点击，完成后更新进度条

    参数:
      title: 卡片标题
      content: 消息正文（markdown）
      notification_log_id: 通知日志 ID（用于回调关联）
      biz_type: 业务类型
      biz_id: 业务 ID
      completed_names: 已完成人员名称列表（群聊用）
      total_count: 总接收人数（群聊用）
      is_group: 是否为群聊模式
    """
    import json

    # 构建回调数据
    callback_data = {
        "notification_log_id": notification_log_id,
        "action": "mark_complete",
    }
    if biz_type:
        callback_data["biz_type"] = biz_type
    if biz_id:
        callback_data["biz_id"] = biz_id

    callback_value = json.dumps(callback_data, ensure_ascii=False)

    # 进度区域（仅群聊）
    progress_elements = []
    if is_group and total_count is not None:
        completed_count = len(completed_names or [])
        percent = int(completed_count / max(total_count, 1) * 100)
        names_text = "、".join(completed_names) if completed_names else "暂无"
        progress_elements = [
            {
                "tag": "hr",
            },
            {
                "tag": "markdown",
                "content": f"📊 **完成进度** {completed_count}/{total_count}",
            },
            _card_progress_bar(percent),
            {
                "tag": "markdown",
                "content": f"已完成：{names_text}",
            },
        ]

    # 消息正文区
    content_tag = "lark_md"  # 飞书 markdown 模式

    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": title},
            "template": "blue",
        },
        "elements": [
            {
                "tag": "div",
                "text": {"tag": content_tag, "content": content},
            },
            *progress_elements,
            {
                "tag": "hr",
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {
                            "tag": "plain_text",
                            "content": "✅ 标记完成",
                        },
                        "type": "primary",
                        "value": callback_value,
                        "confirm": {
                            "title": {"tag": "plain_text", "content": "确认标记完成？"},
                            "text": {
                                "tag": "plain_text",
                                "content": "标记完成后，后续相同通知将不再发送给你。",
                            },
                        },
                    },
                    *([
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": _card_button_get(card_button, "text", "查看详情")},
                            "type": "default",
                            "url": _card_button_get(card_button, "url", ""),
                        }
                    ] if card_button is not None and _card_button_get(card_button, 'enabled', True) else []),
                ],
            },
        ],
    }

    return json.dumps(card, ensure_ascii=False)


def build_completed_card(
    title: str,
    content: str,
    notification_log_id: int,
    biz_type: str | None = None,
    biz_id: str | None = None,
    completed_names: list[str] | None = None,
    total_count: int | None = None,
    is_group: bool = False,
    completed_by_current_user: bool = False,
) -> str:
    """构建已完成/更新后的卡片（替换原卡片用）。

    与原卡片的区别：
      - 私聊：标记完成按钮变灰色禁用态
      - 群聊：更新进度条和已完成名单
      - 全部完成后按钮统一变灰
    """
    import json

    all_completed = (
        is_group
        and total_count is not None
        and len(completed_names or []) >= total_count
    )

    content_tag = "lark_md"

    # 进度区域
    progress_elements = []
    if is_group and total_count is not None:
        completed_count = len(completed_names or [])
        percent = int(completed_count / max(total_count, 1) * 100)
        names_text = "、".join(completed_names) if completed_names else "暂无"
        progress_elements = [
            {"tag": "hr"},
            {
                "tag": "markdown",
                "content": f"📊 **完成进度** {completed_count}/{total_count}",
            },
            _card_progress_bar(percent),
            {
                "tag": "markdown",
                "content": f"已完成：{names_text}",
            },
        ]

    # 按钮：私聊当前用户已完成 → 禁用；群聊全部完成 → 禁用
    button_disabled = (not is_group and completed_by_current_user) or all_completed

    if button_disabled:
        button_text = "✅ 已完成" if not is_group else "✅ 全部已完成"
        button = {
            "tag": "button",
            "text": {"tag": "plain_text", "content": button_text},
            "type": "default",
            "disabled": True,
        }
    else:
        callback_data = {
            "notification_log_id": notification_log_id,
            "action": "mark_complete",
        }
        if biz_type:
            callback_data["biz_type"] = biz_type
        if biz_id:
            callback_data["biz_id"] = biz_id
        callback_value = json.dumps(callback_data, ensure_ascii=False)

        button = {
            "tag": "button",
            "text": {"tag": "plain_text", "content": "✅ 标记完成"},
            "type": "primary",
            "value": callback_value,
            "confirm": {
                "title": {"tag": "plain_text", "content": "确认标记完成？"},
                "text": {"tag": "plain_text", "content": "标记完成后，后续相同通知将不再发送给你。"},
            },
        }

    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": title},
            "template": "blue",
        },
        "elements": [
            {
                "tag": "div",
                "text": {"tag": content_tag, "content": content},
            },
            *progress_elements,
            {"tag": "hr"},
            {
                "tag": "action",
                "actions": [button],
            },
        ],
    }

    return json.dumps(card, ensure_ascii=False)


def _card_progress_bar(percent: int) -> dict:
    """构建卡片中的进度条元素。"""
    filled = max(0, min(percent, 100))
    bar_width = 20
    filled_chars = "█" * int(bar_width * filled / 100)
    empty_chars = "░" * (bar_width - len(filled_chars))
    return {
        "tag": "markdown",
        "content": f"`{filled_chars}{empty_chars}` {filled}%",
    }



def build_markdown_card(
    title: str,
    content: str,
) -> str:
    """构建只包含标题和正文的飞书交互式卡片。

    用于普通 markdown 通知。相比 im post 富文本消息，卡片 lark_md 对中文、换行、
    简单 markdown 更稳定，也能与后续按钮/标记完成能力保持同一消息形态。
    """
    import json

    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": title or "通知"},
            "template": "blue",
        },
        "elements": [
            {
                "tag": "div",
                "text": {"tag": "lark_md", "content": content or " "},
            },
        ],
    }
    return json.dumps(card, ensure_ascii=False)

def build_action_card(
    title: str,
    content: str,
    button_text: str = "查看详情",
    button_url: str = "",
) -> str:
    """构建带「跳转按钮」的飞书交互式卡片。

    与 build_completion_card（标记完成）独立：
      - 本卡片用于通用跳转场景（查看详情、打开报表等）
      - 按钮类型为 link，点击后直接在飞书内打开指定 URL

    参数:
      title: 卡片标题
      content: 消息正文（markdown）
      button_text: 按钮显示文案，如"查看详情"
      button_url: 跳转链接

    返回:
      飞书卡片 JSON 字符串
    """
    import json

    elements = [
        {
            "tag": "div",
            "text": {"tag": "lark_md", "content": content},
        },
        {
            "tag": "hr",
        },
        {
            "tag": "action",
            "actions": [
                {
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": button_text},
                    "type": "primary",
                    "url": button_url,
                }
            ],
        },
    ]

    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": title},
            "template": "blue",
        },
        "elements": elements,
    }

    return json.dumps(card, ensure_ascii=False)


# ===== 模块级单例 =====

_client: FeishuClient | None = None


def get_feishu_client() -> FeishuClient:
    """获取应用级飞书客户端单例。"""
    global _client
    if _client is None:
        _client = FeishuClient.from_settings()
    return _client
