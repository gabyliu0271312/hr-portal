"""UCP 敏感字段脱敏工具

脱敏规则：
  - 手机号：中间 4 位替换为 ****
  - 身份证号：中间部分替换为 ****
  - 银行卡号：只保留前 4 和后 4 位
  - 薪酬/薪资：整体替换为 "[已脱敏]"
  - 外部系统账号凭证：整体替换为 "[已脱敏]"

Phase 1A 简化版：基于字段名关键词匹配脱敏。
后续迭代可对接 field_category 模块的敏感字段分类。
"""
from __future__ import annotations

import re
from typing import Any

# 敏感字段关键词（字段名包含这些词即脱敏）
SALARY_KEYWORDS = ["salary", "薪酬", "薪资", "月薪", "年薪", "offer_salary", "compensation", "base_salary", "bonus"]
PHONE_KEYWORDS = ["phone", "mobile", "手机", "手机号", "telephone", "联系电话"]
ID_CARD_KEYWORDS = ["id_card", "身份证", "identity_card", "id_number"]
BANK_CARD_KEYWORDS = ["bank_card", "银行卡", "bank_account"]
CREDENTIAL_KEYWORDS = ["password", "secret", "token", "api_key", "app_secret", "credential"]


def is_sensitive_field(field_name: str) -> bool:
    """判断字段是否为敏感字段。"""
    name_lower = str(field_name).lower()
    return any(kw in name_lower for kw in (
        SALARY_KEYWORDS + PHONE_KEYWORDS + ID_CARD_KEYWORDS + BANK_CARD_KEYWORDS + CREDENTIAL_KEYWORDS
    ))


def mask_value(value: Any, field_name: str) -> Any:
    """根据字段类型对值做脱敏。"""
    if value is None or value == "":
        return value

    str_val = str(value)
    name_lower = str(field_name).lower()

    # 薪酬类 → 整体替换
    if any(kw in name_lower for kw in SALARY_KEYWORDS):
        return "[已脱敏]"

    # 手机号 → 中间 4 位 *
    if any(kw in name_lower for kw in PHONE_KEYWORDS):
        if len(str_val) >= 7:
            return str_val[:3] + "****" + str_val[-4:]
        return "****"

    # 身份证 → 中间替换
    if any(kw in name_lower for kw in ID_CARD_KEYWORDS):
        if len(str_val) >= 10:
            return str_val[:3] + "***********" + str_val[-4:]
        return "****"

    # 银行卡 → 只保留前 4 后 4
    if any(kw in name_lower for kw in BANK_CARD_KEYWORDS):
        if len(str_val) >= 8:
            return str_val[:4] + "****" + str_val[-4:]
        return "****"

    # 凭证类 → 整体替换
    if any(kw in name_lower for kw in CREDENTIAL_KEYWORDS):
        return "[已脱敏]"

    # 其他敏感字段 → 简单掩码
    if is_sensitive_field(field_name):
        if len(str_val) > 4:
            return str_val[:2] + "****"
        return "****"

    return value


def mask_dict(data: dict) -> dict:
    """对 dict 中所有敏感字段值做脱敏。"""
    if not isinstance(data, dict):
        return data
    masked: dict = {}
    for key, value in data.items():
        if isinstance(value, dict):
            masked[key] = mask_dict(value)
        elif isinstance(value, list):
            masked[key] = [mask_dict(item) if isinstance(item, dict) else item for item in value]
        else:
            masked[key] = mask_value(value, key)
    return masked


def mask_sensitive_fields(data: list[dict] | dict, max_rows: int = 20) -> list[dict]:
    """对数据列表或单个 dict 中所有敏感字段做脱敏。

    用于 Context 快照、日志、通知、测试预览等场景。
    """
    if isinstance(data, dict):
        return [mask_dict(data)]

    if not isinstance(data, list):
        return []

    result = []
    for row in data[:max_rows]:
        if isinstance(row, dict):
            result.append(mask_dict(row))
        else:
            result.append(row)
    return result


# ===== 便捷脱敏函数（Phase 3-4 起新增） =====


def mask_phone(phone: str | None) -> str | None:
    """手机号脱敏: 138****8000。

    输入为空返回 None。
    """
    if not phone:
        return None
    s = str(phone).strip()
    if len(s) < 7:
        return "****"
    return s[:3] + "****" + s[-4:]


def mask_name(name: str | None) -> str | None:
    """姓名脱敏: 张* (保留姓氏)。

    输入为空返回 None。
    """
    if not name:
        return None
    s = str(name).strip()
    if not s:
        return None
    if len(s) == 1:
        return s + "*"
    if len(s) == 2:
        return s[0] + "*"
    # 3 字符及以上: 保留首字 + 中间 * + 末字
    return s[0] + "*" * (len(s) - 2) + s[-1] if len(s) > 2 else s[0] + "*"
