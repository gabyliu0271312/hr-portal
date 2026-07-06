# -*- coding: utf-8 -*-
"""数据质量规则执行引擎

Q03 契约：
- 执行对象为仓内已落地表，不触发 DataSource/UCP 实时拉取
- Q0307: not_null + unique
- Q0308: enum + date_format
- Q0309: referential_integrity/custom_sql 明确标记为"暂不支持"

返回统一结构：{status, checked_count, failed_count, sample_rows, message}
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.permissions.masker import get_hidden_columns, get_sensitive_columns
from app.warehouse.schemas import EXECUTABLE_RULE_TYPES

logger = logging.getLogger(__name__)

# 采样上限
MAX_SAMPLE_ROWS = 20


async def execute_quality_rule(
    session: AsyncSession,
    rule_id: int,
    asset_type: str,
    asset_code: str,
    rule_type: str,
    rule_config: dict,
    user=None,
) -> dict:
    """执行单条质量规则。

    Args:
        user: 当前用户对象，用于字段权限校验（隐藏列过滤 + 敏感列脱敏）。
              传 None 时跳过权限过滤（仅用于内部/脚本场景）。

    Returns:
        dict with keys: status, checked_count, failed_count, sample_rows, message
    """
    # Q0309: 明确标记不支持的规则类型
    if rule_type not in EXECUTABLE_RULE_TYPES:
        return {
            "status": "error",
            "checked_count": 0,
            "failed_count": 0,
            "sample_rows": [],
            "message": f"规则类型 '{rule_type}' 暂不支持执行，规划中",
        }

    handler = _ENGINE_MAP.get(rule_type)
    if handler is None:
        return {
            "status": "error",
            "checked_count": 0,
            "failed_count": 0,
            "sample_rows": [],
            "message": f"未知规则类型: {rule_type}",
        }

    table_name = asset_code
    column_code = rule_config.get("column", "")

    if asset_type == "field" and "." in asset_code:
        table_name, column_code = asset_code.rsplit(".", 1)

    if not column_code:
        return {
            "status": "error",
            "checked_count": 0,
            "failed_count": 0,
            "sample_rows": [],
            "message": "rule_config 中缺少 column 参数",
        }

    # 计算隐藏列和脱敏列（复用 masker 统一入口）—— fail-closed：权限裁剪失败则拒绝返回样例数据
    hidden: set = set()
    sensitive: set = set()
    if user is not None:
        try:
            hidden = await get_hidden_columns(user, table_name, session)
        except Exception:
            logger.exception(f"获取隐藏列失败 table={table_name}")
            return {
                "status": "error",
                "checked_count": 0,
                "failed_count": 0,
                "sample_rows": [],
                "message": f"字段权限裁剪失败（get_hidden_columns），无法安全返回质量样例数据",
            }
        try:
            sensitive = await get_sensitive_columns(user, table_name, session)
        except Exception:
            logger.exception(f"获取脱敏列失败 table={table_name}")
            return {
                "status": "error",
                "checked_count": 0,
                "failed_count": 0,
                "sample_rows": [],
                "message": f"字段权限裁剪失败（get_sensitive_columns），无法安全返回质量样例数据",
            }

    try:
        return await handler(session, table_name, column_code, rule_config, hidden, sensitive)
    except Exception as e:
        logger.exception(f"质量规则执行失败 rule_id={rule_id}")
        return {
            "status": "error",
            "checked_count": 0,
            "failed_count": 0,
            "sample_rows": [],
            "message": f"执行异常: {str(e)}",
        }


# ==================== Q0307: not_null ====================

async def _check_not_null(
    session: AsyncSession,
    table_name: str,
    column_code: str,
    config: dict,
    hidden: set,
    sensitive: set,
) -> dict:
    """检查非空"""
    col = _safe_ident(column_code)
    tbl = _safe_ident(table_name)

    # 总数
    total_sql = f"SELECT COUNT(*) FROM {tbl}"
    total = (await session.execute(text(total_sql))).scalar() or 0

    # 空值数
    null_sql = f"SELECT COUNT(*) FROM {tbl} WHERE {col} IS NULL"
    null_count = (await session.execute(text(null_sql))).scalar() or 0

    # 样例（过滤隐藏列 + 脱敏敏感列）
    sample: list = []
    if null_count > 0:
        sample_sql = f"SELECT * FROM {tbl} WHERE {col} IS NULL LIMIT {MAX_SAMPLE_ROWS}"
        rows = (await session.execute(text(sample_sql))).fetchall()
        cols = (await session.execute(text(sample_sql))).keys()
        sample = [_row_to_dict(r, cols, hidden, sensitive) for r in rows]

    status = "fail" if null_count > 0 else "pass"
    return {
        "status": status,
        "checked_count": total,
        "failed_count": null_count,
        "sample_rows": sample,
        "message": f"非空检查: {null_count}/{total} 行为 NULL" if null_count > 0 else f"非空检查通过 ({total} 行)",
    }


# ==================== Q0307: unique ====================

async def _check_unique(
    session: AsyncSession,
    table_name: str,
    column_code: str,
    config: dict,
    hidden: set,
    sensitive: set,
) -> dict:
    """检查唯一性"""
    col = _safe_ident(column_code)
    tbl = _safe_ident(table_name)

    total_sql = f"SELECT COUNT(*) FROM {tbl}"
    total = (await session.execute(text(total_sql))).scalar() or 0

    dup_sql = f"""
        SELECT {col}, COUNT(*) AS cnt
        FROM {tbl}
        WHERE {col} IS NOT NULL
        GROUP BY {col}
        HAVING COUNT(*) > 1
    """
    dup_rows = (await session.execute(text(dup_sql))).fetchall()
    dup_count = sum(r[1] - 1 for r in dup_rows) if dup_rows else 0

    sample: list = []
    if dup_rows:
        # 取一个重复值展示其样例行
        first_dup = dup_rows[0][0]
        sample_sql = f"SELECT * FROM {tbl} WHERE {col} = :val LIMIT {MAX_SAMPLE_ROWS}"
        rows = (await session.execute(text(sample_sql), {"val": first_dup})).fetchall()
        cols = (await session.execute(text(sample_sql), {"val": first_dup})).keys()
        sample = [_row_to_dict(r, cols, hidden, sensitive) for r in rows]

    status = "fail" if dup_count > 0 else "pass"
    return {
        "status": status,
        "checked_count": total,
        "failed_count": dup_count,
        "sample_rows": sample,
        "message": f"唯一性检查: {len(dup_rows)} 个重复值, {dup_count} 行冗余" if dup_count > 0 else f"唯一性检查通过 ({total} 行)",
    }


# ==================== Q0308: enum ====================

async def _check_enum(
    session: AsyncSession,
    table_name: str,
    column_code: str,
    config: dict,
    hidden: set,
    sensitive: set,
) -> dict:
    """检查枚举值"""
    col = _safe_ident(column_code)
    tbl = _safe_ident(table_name)
    valid_values = config.get("values", [])

    if not valid_values:
        return {
            "status": "error",
            "checked_count": 0,
            "failed_count": 0,
            "sample_rows": [],
            "message": "rule_config 中缺少 values 参数",
        }

    total_sql = f"SELECT COUNT(*) FROM {tbl}"
    total = (await session.execute(text(total_sql))).scalar() or 0

    placeholders = ", ".join(f":v{i}" for i in range(len(valid_values)))
    params = {f"v{i}": v for i, v in enumerate(valid_values)}
    fail_sql = f"SELECT COUNT(*) FROM {tbl} WHERE {col} IS NOT NULL AND {col} NOT IN ({placeholders})"
    fail_count = (await session.execute(text(fail_sql), params)).scalar() or 0

    sample: list = []
    if fail_count > 0:
        sample_sql = f"SELECT * FROM {tbl} WHERE {col} IS NOT NULL AND {col} NOT IN ({placeholders}) LIMIT {MAX_SAMPLE_ROWS}"
        rows = (await session.execute(text(sample_sql), params)).fetchall()
        cols = (await session.execute(text(sample_sql), params)).keys()
        sample = [_row_to_dict(r, cols, hidden, sensitive) for r in rows]

    status = "fail" if fail_count > 0 else "pass"
    return {
        "status": status,
        "checked_count": total,
        "failed_count": fail_count,
        "sample_rows": sample,
        "message": f"枚举检查: {fail_count}/{total} 行不在合法值 {valid_values} 中" if fail_count > 0
        else f"枚举检查通过 ({total} 行, 合法值: {valid_values})",
    }


# ==================== Q0308: date_format ====================

async def _check_date_format(
    session: AsyncSession,
    table_name: str,
    column_code: str,
    config: dict,
    hidden: set,
    sensitive: set,
) -> dict:
    """检查日期格式"""
    col = _safe_ident(column_code)
    tbl = _safe_ident(table_name)
    fmt = config.get("format", "%Y-%m-%d")

    total_sql = f"SELECT COUNT(*) FROM {tbl}"
    total = (await session.execute(text(total_sql))).scalar() or 0

    # 用 STR_TO_DATE 尝试解析；无法解析的即为非法
    fail_sql = f"""
        SELECT COUNT(*)
        FROM {tbl}
        WHERE {col} IS NOT NULL
          AND STR_TO_DATE({col}, :fmt) IS NULL
    """
    fail_count = (await session.execute(text(fail_sql), {"fmt": fmt})).scalar() or 0

    sample: list = []
    if fail_count > 0:
        sample_sql = f"""
            SELECT * FROM {tbl}
            WHERE {col} IS NOT NULL AND STR_TO_DATE({col}, :fmt) IS NULL
            LIMIT {MAX_SAMPLE_ROWS}
        """
        rows = (await session.execute(text(sample_sql), {"fmt": fmt})).fetchall()
        cols = (await session.execute(text(sample_sql), {"fmt": fmt})).keys()
        sample = [_row_to_dict(r, cols, hidden, sensitive) for r in rows]

    status = "fail" if fail_count > 0 else "pass"
    return {
        "status": status,
        "checked_count": total,
        "failed_count": fail_count,
        "sample_rows": sample,
        "message": f"日期格式检查 ({fmt}): {fail_count}/{total} 行格式不符" if fail_count > 0
        else f"日期格式检查通过 ({fmt}, {total} 行)",
    }


# ==================== 引擎映射 ====================

_ENGINE_MAP = {
    "not_null": _check_not_null,
    "unique": _check_unique,
    "enum": _check_enum,
    "date_format": _check_date_format,
}


# ==================== 辅助 ====================

def _safe_ident(name: str) -> str:
    """基础标识符安全校验：仅允许字母、数字、下划线"""
    if not name or not name.replace("_", "").replace("-", "").isalnum():
        raise ValueError(f"非法标识符: {name}")
    # 用反引号包住以支持 MySQL 关键字和特殊字符
    safe = name.replace("`", "``")
    return f"`{safe}`"


def _row_to_dict(row, keys, hidden=None, sensitive=None) -> dict:
    """将 Row 转为 dict，过滤隐藏列、脱敏敏感列、处理 datetime 序列化"""
    hidden = hidden or set()
    sensitive = sensitive or set()
    d = {}
    for k, v in zip(keys, row):
        if k in hidden:
            continue
        if k in sensitive:
            d[k] = "******"
        elif isinstance(v, datetime):
            d[k] = v.isoformat()
        else:
            d[k] = v
    return d
