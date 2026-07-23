"""飞书事件订阅协议解析 (Phase 3-2)

飞书事件订阅协议 (v2):
  1. URL Verification: 飞书发送 {"challenge": "xxx", "type": "url_verification"} → 直接回传 challenge
  2. Event Callback v2:
     - 加密模式 (encrypt): {"encrypt": "..."}  → 解密后再做 verification
     - 明文模式: {"schema": "2.0", "header": {...}, "event": {...}}
  3. v1 (老协议): {"uuid": "...", "event": {...}, "type": "event_callback", "token": "..."}

事件签名校验 (可选):
  - timestamp + nonce + encrypt_key 生成 sign
  - header.sign 字段比对

参考: https://open.feishu.cn/document/server-docs/event-subscription-guide/overview
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding


logger = logging.getLogger("ucp.feishu_webhook")


# ============================================================
# 飞书事件协议常量
# ============================================================
FEISHU_TYPE_URL_VERIFICATION = "url_verification"
FEISHU_TYPE_EVENT_CALLBACK = "event_callback"
FEISHU_SCHEMA_V2 = "2.0"

# 飞书事件 → UCP 内部事件类型映射
# 完整映射见飞书文档;此处列出最常用 6 类
FEISHU_EVENT_TYPE_MAP: dict[str, str] = {
    # 招聘
    "hire_offer.status_update": "OFFER_STATUS_CHANGE",
    "hire_offer.created_v1": "OFFER_CREATED",
    "hire_application.stage_changed_v1": "APPLICATION_STAGE_CHANGED",
    # 通讯录
    "contact.department.created_v3": "ORG_DEPT_CREATED",
    "contact.department.updated_v3": "ORG_DEPT_UPDATED",
    "contact.department.deleted_v3": "ORG_DEPT_DELETED",
    "contact.user.created_v3": "CONTACT_USER_CREATED",
    "contact.user.updated_v3": "CONTACT_USER_UPDATED",
    "contact.user.deleted_v3": "EMPLOYEE_OFFBOARD",
    "contact.user.created_v3": "EMPLOYEE_ONBOARD",
    # 审批
    "approval.approval.approved_v1": "APPROVAL_APPROVED",
    "approval.approval.rejected_v1": "APPROVAL_REJECTED",
}


class FeishuWebhookError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message}")


# ============================================================
# AES-256-CBC 加解密 (飞书事件 v2 加密模式)
# ============================================================
def _derive_aes_key(encrypt_key: str) -> bytes:
    """从飞书 EncryptKey 派生 32 字节 AES key（SHA256）。"""
    return hashlib.sha256(encrypt_key.encode("utf-8")).digest()


def decrypt_feishu_event(encrypt_str: str, encrypt_key: str) -> dict[str, Any]:
    """解密飞书事件 v2 加密模式。

    Args:
        encrypt_str: 加密字符串 (base64)
        encrypt_key: 飞书应用的 EncryptKey

    Returns:
        解密后的 dict (含 schema/header/event)

    Raises:
        FeishuWebhookError: 解密失败
    """
    if not encrypt_key:
        raise FeishuWebhookError("MISSING_ENCRYPT_KEY", "飞书触发器未配置 encrypt_key，无法解密")
    try:
        # 延迟导入：cryptography 仅在 v2 加密模式下需要
        try:
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
            from cryptography.hazmat.primitives import padding
        except ImportError:
            raise FeishuWebhookError(
                "CRYPT_LIB_MISSING",
                "未安装 cryptography 库，无法解密飞书 v2 加密事件；请 pip install cryptography",
            )
        aes_key = _derive_aes_key(encrypt_key)
        raw = base64.b64decode(encrypt_str)
        iv = raw[:16]
        ciphertext = raw[16:]
        cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv))
        decryptor = cipher.decryptor()
        padded = decryptor.update(ciphertext) + decryptor.finalize()
        # PKCS#7 unpad
        unpadder = padding.PKCS7(128).unpadder()
        plain = unpadder.update(padded) + unpadder.finalize()
        return json.loads(plain.decode("utf-8"))
    except FeishuWebhookError:
        raise
    except Exception as e:  # noqa: BLE001
        raise FeishuWebhookError("DECRYPT_FAILED", f"飞书事件解密失败: {e}")


# ============================================================
# URL Verification 处理
# ============================================================
def handle_url_verification(body: dict[str, Any]) -> dict[str, Any] | None:
    """如果请求是 url_verification 类型，返回 challenge 响应；否则返回 None。"""
    if body.get("type") == FEISHU_TYPE_URL_VERIFICATION:
        return {"challenge": body.get("challenge", "")}
    return None


# ============================================================
# 事件标准化（v1 / v2 / 加密 / 明文）
# ============================================================
def normalize_feishu_event(
    raw_body: dict[str, Any],
    *,
    encrypt_key: str | None = None,
    verification_token: str | None = None,
) -> dict[str, Any]:
    """将飞书原始事件解析为 UCP 内部事件结构。

    Returns:
        dict: {
          "event_id": "...",      # 飞书 event_id 或 uuid
          "event_type": "...",    # 映射后的 UCP 事件类型
          "feishu_event_type": "...",
          "tenant_key": "...",
          "app_id": "...",
          "payload": {...},
          "raw": {...}            # 保留飞书原始 payload 供排查
        }

    Raises:
        FeishuWebhookError: 无法识别的事件结构
    """
    body = raw_body or {}

    # 1) URL verification 已在 handle_url_verification 单独处理（不会到达此处）
    # 2) v2 加密模式
    if "encrypt" in body:
        if not encrypt_key:
            raise FeishuWebhookError("ENCRYPTED_BUT_NO_KEY", "飞书事件为加密模式但未配置 encrypt_key")
        decrypted = decrypt_feishu_event(body["encrypt"], encrypt_key)
        return _normalize_v2_decrypted(decrypted)

    # 3) v2 明文模式
    if body.get("schema") == FEISHU_SCHEMA_V2 and "event" in body:
        return _normalize_v2_decrypted(body)

    # 4) v1 模式
    if body.get("type") == FEISHU_TYPE_EVENT_CALLBACK and "event" in body:
        return _normalize_v1(body, verification_token)

    raise FeishuWebhookError("UNKNOWN_FORMAT", f"无法识别的飞书事件格式: {list(body.keys())}")


def _normalize_v2_decrypted(body: dict[str, Any]) -> dict[str, Any]:
    """解析 v2 解密后的 body。"""
    header = body.get("header") or {}
    event = body.get("event") or {}
    feishu_type = header.get("event_type", "")
    ucp_type = FEISHU_EVENT_TYPE_MAP.get(feishu_type, feishu_type or "GENERIC")
    event_id = event.get("event_id") or header.get("event_id") or ""
    return {
        "event_id": f"feishu_{event_id}" if event_id else f"feishu_{int(time.time() * 1000)}",
        "event_type": ucp_type,
        "feishu_event_type": feishu_type,
        "tenant_key": header.get("tenant_key", ""),
        "app_id": header.get("app_id", ""),
        "payload": event,
        "raw": body,
    }


def _normalize_v1(body: dict[str, Any], verification_token: str | None) -> dict[str, Any]:
    """解析 v1 协议事件。"""
    uuid_ = body.get("uuid", "")
    event = body.get("event") or {}
    feishu_type = event.get("type", "")
    ucp_type = FEISHU_EVENT_TYPE_MAP.get(feishu_type, feishu_type or "GENERIC")
    return {
        "event_id": f"feishu_{uuid_}" if uuid_ else f"feishu_{int(time.time() * 1000)}",
        "event_type": ucp_type,
        "feishu_event_type": feishu_type,
        "tenant_key": "",
        "app_id": "",
        "payload": event,
        "raw": body,
    }


# ============================================================
# 签名校验（v2 加密 + sign 模式）
# ============================================================
def verify_feishu_signature(
    timestamp: str,
    nonce: str,
    body_str: bytes | str,
    sign: str,
    encrypt_key: str,
) -> bool:
    """校验飞书 v2 加密模式的签名。

    算法: sha256(timestamp + nonce + encrypt_key + body)
    """
    if not sign or not encrypt_key:
        return False
    body = body_str if isinstance(body_str, str) else body_str.decode("utf-8")
    raw = f"{timestamp}{nonce}{encrypt_key}{body}".encode("utf-8")
    expected = hashlib.sha256(raw).hexdigest()
    return hmac.compare_digest(expected, sign)


# ============================================================
# Verification Token 校验（v1 模式）
# ============================================================
def verify_feishu_token(received_token: str | None, expected_token: str | None) -> bool:
    """v1 模式使用 verification_token 校验。"""
    if not expected_token:
        # 未配置则跳过
        return True
    if not received_token:
        return False
    return hmac.compare_digest(received_token, expected_token)
