"""bcrypt 密码哈希封装

passlib 在 bcrypt 5.x 上有兼容性问题；这里直接用 bcrypt 库，简单可靠。
"""
import bcrypt

PASSWORD_POLICY_HINT = "密码至少 8 位，且必须包含大写字母、小写字母、数字和特殊符号"


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
    """校验密码强度：长度 ≥ 8，含大小写字母、数字和特殊符号。"""
    if len(password) < 8:
        return False, "密码至少 8 位"
    has_lower = any("a" <= c <= "z" for c in password)
    has_upper = any("A" <= c <= "Z" for c in password)
    has_digit = any("0" <= c <= "9" for c in password)
    has_special = any(c.isascii() and not c.isalnum() and not c.isspace() for c in password)
    missing: list[str] = []
    if not has_upper:
        missing.append("大写字母")
    if not has_lower:
        missing.append("小写字母")
    if not has_digit:
        missing.append("数字")
    if not has_special:
        missing.append("特殊符号")
    if missing:
        return False, f"密码必须包含{'、'.join(missing)}"
    return True, None
