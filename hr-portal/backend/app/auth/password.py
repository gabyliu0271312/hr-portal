"""bcrypt 密码哈希封装

passlib 在 bcrypt 5.x 上有兼容性问题；这里直接用 bcrypt 库，简单可靠。
"""
import bcrypt


def hash_password(password: str) -> str:
    """哈希密码。bcrypt 自带 salt"""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """校验密码。永不抛异常 —— hash 格式错也返回 False"""
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"), password_hash.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


def is_strong_enough(password: str) -> tuple[bool, str | None]:
    """简单的密码强度校验：长度 ≥ 8，含字母和数字"""
    if len(password) < 8:
        return False, "密码至少 8 位"
    has_alpha = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not (has_alpha and has_digit):
        return False, "密码必须同时包含字母和数字"
    return True, None