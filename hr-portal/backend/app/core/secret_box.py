"""数据源凭证加密 / 解密

使用 Fernet（cryptography 库）对 AppSecret / 数据库密码等敏感字段加密后入库。
生产环境务必把 `SECRET_BOX_KEY` 通过环境变量注入，且不进版本控制。
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_fernet: Fernet | None = None


def _box() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(settings.SECRET_BOX_KEY.encode("utf-8"))
    return _fernet


def encrypt(plain: str) -> str:
    """字符串 → 密文（base64 字符串）。空串原样返回。"""
    if not plain:
        return ""
    return _box().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    """密文 → 字符串。空串或解密失败返回空串。"""
    if not token:
        return ""
    try:
        return _box().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""
