"""UCP Upsert 服务

Phase 1A 职责：
  - 合并北森待入职人员 + 飞书 Offer 详情，按 application_id upsert 写入 hr_pending_employee_full
  - 幂等主键：application_id
  - 北森有、飞书 Offer 成功 → 合并写入
  - 北森有、飞书 Offer 查询失败 → 写入北森基础信息，Offer 字段为空
  - 北森有、飞书 Offer 不存在 → 记录 OFFER_NOT_FOUND
  - 历史存在、本次北森不存在 → 标记 is_active=false / sync_status=NOT_IN_SOURCE
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import Base
from app.data.models import DATA_TABLES

logger = logging.getLogger("ucp.upsert_service")


async def upsert_to_target_table(
    db: AsyncSession,
    target_table: str,
    merged_rows: list[dict],
    join_key: str,
    source_key_map: dict[str, dict] | None = None,
) -> dict:
    """合并写入目标表（按 join_key upsert）。

    返回统计 dict：
      - status: SUCCESS / PARTIAL_SUCCESS
      - merged_count: upsert 成功数
      - failed_count: 失败数
      - pending_count: 北森待入职人数
      - offer_success_count: 飞书 Offer 成功数
      - offer_not_found_count: 飞书 Offer 未找到数
      - failed_application_ids: 失败投递 ID 列表（不含薪酬明细）
    """
    if not merged_rows:
        return {
            "status": "SUCCESS",
            "merged_count": 0,
            "failed_count": 0,
            "pending_count": 0,
        }

    # 查找目标表的 ORM Model（动态注册的实体列宽表）
    Model = DATA_TABLES.get(target_table)
    if Model is None:
        # 目标表可能尚未存在，需要动态创建
        logger.warning("[ucp] target table '%s' not in DATA_TABLES, creating dynamically", target_table)
        # Phase 1A 先使用原始 SQL upsert，后续对齐动态表机制
        return await _raw_sql_upsert(db, target_table, merged_rows, join_key)

    # 使用 ORM Model 进行 upsert
    merged_count = 0
    failed_count = 0
    failed_ids: list[str] = []

    for row in merged_rows:
        try:
            key_value = str(row.get(join_key, ""))
            if not key_value:
                failed_count += 1
                continue

            # 查找已有记录
            existing = None
            if hasattr(Model, join_key):
                stmt = select(Model).where(Model.__table__.c[join_key] == key_value)
                existing = (await db.execute(stmt)).scalar_one_or_none()

            if existing is not None:
                # UPDATE：合并字段值（飞书 Offer 字段覆盖北森基础字段）
                for field_name, field_value in row.items():
                    if hasattr(existing, field_name) and field_value is not None:
                        setattr(existing, field_name, field_value)
                # 确保激活
                if hasattr(existing, "is_active"):
                    existing.is_active = True
                if hasattr(existing, "sync_status"):
                    existing.sync_status = "ACTIVE"
                merged_count += 1
            else:
                # INSERT
                new_row = Model()
                for field_name, field_value in row.items():
                    if hasattr(new_row, field_name):
                        setattr(new_row, field_name, field_value)
                # 设置默认字段
                if hasattr(new_row, "is_active"):
                    new_row.is_active = True
                if hasattr(new_row, "sync_status"):
                    new_row.sync_status = "ACTIVE"
                db.add(new_row)
                merged_count += 1

        except Exception as e:
            failed_count += 1
            failed_ids.append(str(row.get(join_key, "unknown")))
            logger.warning("[ucp] upsert failed for %s=%s: %s", join_key, row.get(join_key), e)

    await db.flush()

    # 标记历史中不在本次北森数据中的记录为 is_active=false
    await _mark_inactive_records(db, Model, target_table, join_key, merged_rows)

    # 统计
    status = "SUCCESS" if failed_count == 0 else "PARTIAL_SUCCESS"
    result = {
        "status": status,
        "merged_count": merged_count,
        "failed_count": failed_count,
        "failed_application_ids": failed_ids,
        "pending_count": len(merged_rows),
    }
    logger.info("[ucp] upsert completed: table=%s merged=%d failed=%d", target_table, merged_count, failed_count)
    return result


async def _raw_sql_upsert(
    db: AsyncSession,
    target_table: str,
    merged_rows: list[dict],
    join_key: str,
) -> dict:
    """使用原始 SQL 进行 upsert（当 ORM Model 不可用时）。

    Phase 1A 用于 hr_pending_employee_full 等目标表。
    """
    if not merged_rows:
        return {"status": "SUCCESS", "merged_count": 0}

    merged_count = 0
    failed_count = 0
    failed_ids: list[str] = []

    for row in merged_rows:
        try:
            key_value = row.get(join_key)
            if not key_value:
                failed_count += 1
                continue

            # 收集所有非空字段
            fields = {k: v for k, v in row.items() if v is not None and k != "id"}
            if not fields:
                continue

            # 检查是否已有记录
            check_sql = text(f"SELECT id FROM {target_table} WHERE {join_key} = :key_value")
            existing = (await db.execute(check_sql, {"key_value": key_value})).scalar_one_or_none()

            if existing is not None:
                # UPDATE
                set_clauses = ", ".join(f"{k} = :upd_{k}" for k in fields.keys())
                params = {f"upd_{k}": v for k, v in fields.items()}
                params["key_value"] = key_value
                update_sql = text(f"UPDATE {target_table} SET {set_clauses} WHERE {join_key} = :key_value")
                await db.execute(update_sql, params)
                # 确保 is_active
                if "is_active" in fields or True:
                    await db.execute(
                        text(f"UPDATE {target_table} SET is_active = true, sync_status = 'ACTIVE' WHERE {join_key} = :key_value"),
                        {"key_value": key_value},
                    )
            else:
                # INSERT
                col_list = ", ".join(fields.keys())
                val_list = ", ".join(f":ins_{k}" for k in fields.keys())
                params = {f"ins_{k}": v for k, v in fields.items()}
                insert_sql = text(f"INSERT INTO {target_table} ({col_list}) VALUES ({val_list})")
                await db.execute(insert_sql, params)

            merged_count += 1
        except Exception as e:
            failed_count += 1
            failed_ids.append(str(row.get(join_key, "unknown")))
            logger.warning("[ucp] raw_sql upsert failed for %s: %s", row.get(join_key), e)

    await db.flush()

    # 标记不在本次数据中的历史记录为不活跃
    active_keys = [str(row.get(join_key, "")) for row in merged_rows if row.get(join_key)]
    if active_keys:
        # 将不在 active_keys 中的记录标记为 is_active=false, sync_status=NOT_IN_SOURCE
        try:
            deactivate_sql = text(
                f"UPDATE {target_table} SET is_active = false, sync_status = 'NOT_IN_SOURCE' "
                f"WHERE {join_key} NOT IN :active_keys AND is_active = true"
            )
            await db.execute(deactivate_sql, {"active_keys": tuple(active_keys)})
            await db.flush()
        except Exception as e:
            logger.warning("[ucp] deactivate records failed: %s", e)

    status = "SUCCESS" if failed_count == 0 else "PARTIAL_SUCCESS"
    return {
        "status": status,
        "merged_count": merged_count,
        "failed_count": failed_count,
        "failed_application_ids": failed_ids,
        "pending_count": len(merged_rows),
    }


async def _mark_inactive_records(
    db: AsyncSession,
    Model,
    target_table: str,
    join_key: str,
    merged_rows: list[dict],
) -> None:
    """将不在本次北森数据中的历史记录标记为 is_active=false。"""
    active_keys = [str(row.get(join_key, "")) for row in merged_rows if row.get(join_key)]
    if not active_keys or not hasattr(Model, join_key):
        return

    try:
        # 找出需要标记为不活跃的记录
        stmt = select(Model).where(
            Model.__table__.c[join_key].notin_(active_keys),
        )
        if hasattr(Model, "is_active"):
            stmt = stmt.where(Model.is_active == True)

        inactive_records = (await db.execute(stmt)).scalars().all()
        for record in inactive_records:
            if hasattr(record, "is_active"):
                record.is_active = False
            if hasattr(record, "sync_status"):
                record.sync_status = "NOT_IN_SOURCE"

        if inactive_records:
            logger.info("[ucp] marked %d records as inactive in %s", len(inactive_records), target_table)
            await db.flush()
    except Exception as e:
        logger.warning("[ucp] mark inactive records failed for %s: %s", target_table, e)
