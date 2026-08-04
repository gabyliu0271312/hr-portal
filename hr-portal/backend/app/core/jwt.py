"""JWT 签发与校验。
本期决策（plan KD-1 + research R-9）：
- token 只放 user_id 与 exp，不缓存权限
- 每次受保护请求重新查库取权限
"""
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt

from app.core.config import settings


TOKEN_SUBJECT_TYPE_PORTAL_USER = "PORTAL_USER"
TOKEN_SUBJECT_TYPE_PERFORMANCE_SYSTEM_ACCOUNT = "PERFORMANCE_SYSTEM_ACCOUNT"


def _create_token(
    subject_id: int,
    subject_type: str,
    expires_minutes: int | None = None,
) -> str:
    expire = datetime.now(UTC) + timedelta(
        minutes=expires_minutes or settings.JWT_EXPIRE_MINUTES
    )
    payload: dict[str, Any] = {
        "sub": str(subject_id),
        "subject_type": subject_type,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: int, expires_minutes: int | None = None) -> str:
    return _create_token(
        user_id,
        TOKEN_SUBJECT_TYPE_PORTAL_USER,
        expires_minutes,
    )


def create_performance_system_access_token(
    account_id: int,
    expires_minutes: int | None = None,
) -> str:
    return _create_token(
        account_id,
        TOKEN_SUBJECT_TYPE_PERFORMANCE_SYSTEM_ACCOUNT,
        expires_minutes,
    )


def decode_token_payload(token: str) -> dict[str, Any]:
    """Decode a signed access token without collapsing its subject type."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def decode_token(token: str) -> int:
    """成功返回 user_id，失败抛 JWTError"""
    try:
        payload = decode_token_payload(token)
    except JWTError:
        raise
    if payload.get("subject_type") not in (None, TOKEN_SUBJECT_TYPE_PORTAL_USER):
        raise JWTError("unexpected token subject type")
    sub = payload.get("sub")
    if sub is None:
        raise JWTError("missing sub")
    try:
        return int(sub)
    except (TypeError, ValueError) as e:
        raise JWTError("invalid sub") from e