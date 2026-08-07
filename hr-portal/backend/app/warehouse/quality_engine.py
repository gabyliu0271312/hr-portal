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

_DATE_FORMAT_PATTERNS = {
    "%Y-%m-%d": r"^\d{4}-\d{2}-\d{2}$",
    "%Y/%m/%d": r"^\d{4}/\d{2}/\d{2}$",
    "%Y%m%d": r"^\d{8}$",
    "%d/%m/%Y": r"^\d{2}/\d{2}/\d{4}$",
    "%Y-%m-%d %H:%i:%s": r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$",
}


def _execution_error(code: str) -> dict:
    return {
        "status": "error",
        "checked_count": 0,
        "failed_count": 0,
        "sample_rows": [],
        "sample_key_hashes": [],
        "duplicate_key_count": 0,
        "missing_key_count": 0,
        "message": code,
    }


def _log_execution_error(code: str, *, rule_id: int, exc: Exception) -> None:
    logger.error("quality rule failed code=%s rule_id=%s error_type=%s", code, rule_id, type(exc).__name__)


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

    if rule_type == "relation_cardinality":
        try:
            return await handler(session, rule_config)
        except Exception as exc:
            _log_execution_error("QUALITY_RELATION_EXECUTION_FAILED", rule_id=rule_id, exc=exc)
            return _execution_error("QUALITY_RELATION_EXECUTION_FAILED")
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
            sensitive = await get_sensitive_columns(user, table_name, session)
        except Exception as exc:
            _log_execution_error("QUALITY_PERMISSION_MASKING_FAILED", rule_id=rule_id, exc=exc)
            return _execution_error("QUALITY_PERMISSION_MASKING_FAILED")


    try:
        return await handler(session, table_name, column_code, rule_config, hidden, sensitive)
    except Exception as exc:
        _log_execution_error("QUALITY_EXECUTION_FAILED", rule_id=rule_id, exc=exc)
        return _execution_error("QUALITY_EXECUTION_FAILED")


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

    status = "fail" if null_count > 0 else "pass"
    return {
        "status": status,
        "checked_count": total,
        "failed_count": null_count,
        "sample_rows": [],
        "sample_key_hashes": [],
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
        SELECT md5(CAST({col} AS text)) AS key_hash, COUNT(*) AS cnt
        FROM {tbl}
        WHERE {col} IS NOT NULL
        GROUP BY {col}
        HAVING COUNT(*) > 1
    """
    dup_rows = (await session.execute(text(dup_sql))).fetchall()
    dup_count = sum(r[1] - 1 for r in dup_rows) if dup_rows else 0

    sample_key_hashes = [
        {"type": "duplicate", "key_hash": row[0]}
        for row in (dup_rows or [])[:MAX_SAMPLE_ROWS]
    ]

    status = "fail" if dup_count > 0 else "pass"
    return {
        "status": status,
        "checked_count": total,
        "failed_count": dup_count,
        "sample_rows": [],
        "sample_key_hashes": sample_key_hashes,
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

    sample_key_hashes: list = []
    if fail_count > 0:
        sample_sql = f"SELECT md5(CAST({col} AS text)) AS key_hash FROM {tbl} WHERE {col} IS NOT NULL AND {col} NOT IN ({placeholders}) LIMIT {MAX_SAMPLE_ROWS}"
        rows = (await session.execute(text(sample_sql), params)).fetchall()
        sample_key_hashes = [
            {"type": "invalid", "key_hash": row[0]}
            for row in rows
        ]

    status = "fail" if fail_count > 0 else "pass"
    return {
        "status": status,
        "checked_count": total,
        "failed_count": fail_count,
        "sample_rows": [],
        "sample_key_hashes": sample_key_hashes,
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
    """Check date text using PostgreSQL-compatible regular expressions."""
    col = _safe_ident(column_code)
    tbl = _safe_ident(table_name)
    fmt = config.get("format", "%Y-%m-%d")
    pattern = _DATE_FORMAT_PATTERNS.get(fmt)
    if pattern is None:
        return {"status": "error", "checked_count": 0, "failed_count": 0, "sample_rows": [], "message": f"不支持的日期格式: {fmt}"}
    total_sql = f"SELECT COUNT(*) FROM {tbl}"
    total = (await session.execute(text(total_sql))).scalar() or 0
    invalid_condition = f"{col}::text !~ :pattern"
    fail_sql = f"SELECT COUNT(*) FROM {tbl} WHERE {col} IS NOT NULL AND {invalid_condition}"
    params = {"pattern": pattern}
    fail_count = (await session.execute(text(fail_sql), params)).scalar() or 0
    sample_key_hashes: list = []
    if fail_count > 0:
        sample_sql = f"SELECT md5(CAST({col} AS text)) AS key_hash FROM {tbl} WHERE {col} IS NOT NULL AND {invalid_condition} LIMIT {MAX_SAMPLE_ROWS}"
        rows = (await session.execute(text(sample_sql), params)).fetchall()
        sample_key_hashes = [
            {"type": "invalid", "key_hash": row[0]}
            for row in rows
        ]
    status = "fail" if fail_count > 0 else "pass"
    return {"status": status, "checked_count": total, "failed_count": fail_count, "sample_rows": [], "sample_key_hashes": sample_key_hashes, "message": f"日期格式检查 ({fmt}): {fail_count}/{total} 行格式不符" if fail_count > 0 else f"日期格式检查通过 ({fmt}, {total} 行)"}


# ==================== 关系基数校验 ====================

async def _check_relation_cardinality(session: AsyncSession, config: dict) -> dict:
    """检查数据集关系的 1:1/N:1 基数与左侧匹配完整性。"""
    from app.datasets.models import DataSetRelation

    dataset_id = config.get("dataset_id")
    relation_id = config.get("relation_id")
    if not dataset_id or not relation_id:
        return _relation_error("rule_config 中缺少 dataset_id 或 relation_id")
    relation = await session.get(DataSetRelation, int(relation_id))
    if relation is None or relation.dataset_id != int(dataset_id):
        return _relation_error("数据集关系不存在或不属于指定数据集")

    rows = (await session.execute(
        text("SELECT table_name, alias FROM dataset_tables WHERE dataset_id = :dataset_id"),
        {"dataset_id": int(dataset_id)},
    )).mappings().all()
    alias_to_table = {row["alias"]: row["table_name"] for row in rows}
    left_table = alias_to_table.get(relation.left_alias)
    right_table = alias_to_table.get(relation.right_alias)
    keys = relation.keys or []
    if not left_table or not right_table or not keys:
        return _relation_error("关系左右表或关联键配置无效")
    if any(not item.get("left") or not item.get("right") for item in keys):
        return _relation_error("关系键配置无效")

    expected = config.get("expected_cardinality", relation.cardinality)
    if expected != relation.cardinality or expected not in ("1:1", "N:1"):
        return _relation_error("规则基数与数据集关系定义不一致或暂不支持")

    left_keys = [item["left"] for item in keys]
    right_keys = [item["right"] for item in keys]
    try:
        left_table_sql = _pg_ident(left_table)
        right_table_sql = _pg_ident(right_table)
        left_columns = [_pg_ident(value) for value in left_keys]
        right_columns = [_pg_ident(value) for value in right_keys]
    except ValueError as exc:
        return _relation_error(str(exc))

    period = str(config.get("period") or "").strip()
    left_period = config.get("left_period_column") or config.get("period_column") or (left_keys[0] if left_keys else None)
    right_period = config.get("right_period_column") or (right_keys[0] if right_keys else None)
    params: dict[str, str] = {}
    left_where = right_where = ""
    if not period:
        return _relation_error("关系质量检查必须指定期间，拒绝全表扫描")
    if period:
        if not left_period or not right_period:
            return _relation_error("期间检查必须同时配置左右期间字段")
        try:
            left_where = f" WHERE l.{_pg_ident(str(left_period))} = :period"
            right_where = f" WHERE r.{_pg_ident(str(right_period))} = :period"
        except ValueError as exc:
            return _relation_error(str(exc))
        params["period"] = period

    left_key_expr = ", ".join(f"l.{column}" for column in left_columns)
    right_key_expr = ", ".join(f"r.{column}" for column in right_columns)
    join_conditions = " AND ".join(f"l.{left_column} = r.{right_column}" for left_column, right_column in zip(left_columns, right_columns))
    if period:
        join_conditions += f" AND r.{_pg_ident(str(right_period))} = :period"
    left_hash_values = ", ".join(f"COALESCE(l.{column}::text, '')" for column in left_columns)
    right_hash_values = ", ".join(f"COALESCE(r.{column}::text, '')" for column in right_columns)
    duplicate_sql = f"SELECT md5(concat_ws('|', {right_hash_values})) AS key_hash FROM {right_table_sql} r {right_where} GROUP BY {right_key_expr} HAVING COUNT(*) > 1"
    duplicate_rows = (await session.execute(text(duplicate_sql), params)).mappings().all()
    left_duplicate_rows = []
    if expected == "1:1":
        left_duplicate_sql = f"SELECT md5(concat_ws('|', {left_hash_values})) AS key_hash FROM {left_table_sql} l {left_where} GROUP BY {left_key_expr} HAVING COUNT(*) > 1"
        left_duplicate_rows = (await session.execute(text(left_duplicate_sql), params)).mappings().all()
    missing_sql = f"SELECT md5(concat_ws('|', {left_hash_values})) AS key_hash FROM {left_table_sql} l LEFT JOIN {right_table_sql} r ON {join_conditions} {left_where} GROUP BY {left_key_expr} HAVING COUNT(r.*) = 0"
    missing_rows = (await session.execute(text(missing_sql), params)).mappings().all()
    checked_count = (await session.execute(text(f"SELECT COUNT(*) FROM {left_table_sql} l {left_where}"), params)).scalar() or 0
    duplicate_count, missing_count = len(duplicate_rows) + len(left_duplicate_rows), len(missing_rows)
    samples = ([{"type": "duplicate", "key_hash": row["key_hash"]} for row in (duplicate_rows + left_duplicate_rows)[:MAX_SAMPLE_ROWS]] + [{"type": "missing", "key_hash": row["key_hash"]} for row in missing_rows[:MAX_SAMPLE_ROWS]])
    missing_is_warning = str(config.get("missing_key_severity", "warn")).lower() in ("warn", "warning")
    result_status = "fail" if duplicate_count else ("warn" if missing_count and missing_is_warning else ("fail" if missing_count else "pass"))
    return {"status": result_status, "checked_count": checked_count, "failed_count": duplicate_count + missing_count, "duplicate_key_count": duplicate_count, "missing_key_count": missing_count, "sample_rows": samples, "sample_key_hashes": samples, "message": f"关系基数检查 {expected}: 右侧重复键 {duplicate_count}，左侧缺失键 {missing_count}"}


def _relation_error(message: str) -> dict:
    return {"status": "error", "checked_count": 0, "failed_count": 0, "duplicate_key_count": 0, "missing_key_count": 0, "sample_rows": [], "sample_key_hashes": [], "message": message}


def _pg_ident(name: str) -> str:
    import re
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        raise ValueError(f"非法标识符: {name}")
    return f'"{name}"'
# ==================== 引擎映射 ====================

_ENGINE_MAP = {
    "not_null": _check_not_null,
    "unique": _check_unique,
    "enum": _check_enum,
    "date_format": _check_date_format,
    "relation_cardinality": _check_relation_cardinality,
}


# ==================== 辅助 ====================

def _safe_ident(name: str) -> str:
    """Return a PostgreSQL-safe quoted identifier after strict validation."""
    import re
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        raise ValueError(f"非法标识符: {name}")
    return f'"{name}"'


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
