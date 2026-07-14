"""Action 注册表

每个 Action 是一个 async callable，接受 action_config 和 event_payload，
执行具体动作并返回结果。

第一期注册：
  feishu_send_message — 发送飞书消息
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.warehouse.service.standardization import get_standardization_rule_service


logger = logging.getLogger("automation.action_registry")


ActionFn = Callable[
    [dict[str, Any], dict[str, Any], AsyncSession, int | None],
    Awaitable[dict[str, Any]],
]
"""
Action 函数签名：
  action_config  — 动作配置（来自 automation_rules.actions_config[i].config）
  event_payload  — 触发事件的 payload（来自 AutomationEvent.payload）
  db             — AsyncSession
  execution_id   — 关联的 AutomationExecution.id（用于写 feishu_notification_logs）

返回：output_snapshot dict
"""


# ===== feishu_send_message Action =====

async def _action_feishu_send_message(
    action_config: dict[str, Any],
    event_payload: dict[str, Any],
    db: AsyncSession,
    execution_id: int | None = None,
) -> dict[str, Any]:
    """发送飞书消息动作。

    action_config 结构（对应 NotificationConfig）：
      {
        "enabled": true,
        "receivers": [...],
        "message": {...}
      }

    event_payload 中的字段可作为消息模板的 context。
    """
    from app.integrations.feishu.notification_service import send_notification
    from app.integrations.feishu.schemas import NotificationConfig

    try:
        config = NotificationConfig.model_validate(action_config)
    except Exception as e:
        raise RuntimeError(f"feishu_send_message action_config 格式错误: {e}") from e

    # event_payload 直接作为通知上下文
    context = dict(event_payload)

    result = await send_notification(
        config=config,
        context=context,
        db=db,
        biz_type=event_payload.get("biz_type"),
        biz_id=event_payload.get("biz_id"),
        is_test=False,
        automation_execution_id=execution_id,
    )

    return {
        "status": result.status,
        "success_count": result.success_count,
        "failed_count": result.failed_count,
        "log_id": result.log_id,
        "errors": result.errors,
    }


# ===== trigger_dwd_standardization Action (Z0103) =====

async def _action_trigger_dwd_standardization(
    action_config: dict[str, Any],
    event_payload: dict[str, Any],
    db: AsyncSession,
    execution_id: int | None = None,
) -> dict[str, Any]:
    """ODS→DWD 自动化标准化动作。

    根据事件类型和 ODS 表的自动化配置，触发 DWD 更新：
      - ods_table_data_changed → 执行 DWD 数据更新（cleaning_rule / passthrough）
      - datasource_sync_completed → 记录同步完成，派生 ods_table_data_changed
      - ods_table_metadata_changed → 同步 DWD 元数据
      - standardization_rule_changed → 重新校验规则产物
      - ods_dwd_automation_config_changed → 配置校验和预览
    """
    from app.core.config import settings
    from app.warehouse.models import OdsDwdAutomationConfig

    if not settings.WAREHOUSE_FEATURE_ODS_DWD_AUTOMATION:
        return {"status": "skipped", "reason": "feature_flag_disabled"}

    table_name = event_payload.get("table_name") or event_payload.get("asset_code", "")
    trigger_type = event_payload.get("trigger_type", "")
    sync_status = event_payload.get("sync_status", "")

    if not table_name:
        return {"status": "skipped", "reason": "no_table_name_in_payload"}

    # 查自动化配置
    result = await db.execute(
        select(OdsDwdAutomationConfig).where(OdsDwdAutomationConfig.ods_table_name == table_name)
    )
    config = result.scalar_one_or_none()

    # datasource_sync_completed 处理：只记录审计，不直接执行 DWD 更新
    # 实际 DWD 更新由统一 ods_table_data_changed 事件驱动
    if trigger_type == "datasource_sync_completed":
        if sync_status == "failed":
            return {"status": "audited", "reason": "sync_failed_recorded", "table_name": table_name}
        return {"status": "audited", "reason": "sync_completed_recorded", "table_name": table_name,
                "note": "DWD update delegated to ods_table_data_changed event"}

    # ods_table_data_changed 处理
    if trigger_type == "ods_table_data_changed":
        if not config:
            config = await _ensure_default_config(table_name, db)
            if config is None:
                return {"status": "skipped", "reason": "no_safe_default_config", "table_name": table_name}
            # 自动创建并启用，立即执行 DWD 更新
            return await _execute_dwd_update(config, table_name, db, event_payload)
        if not config.enabled:
            return {"status": "skipped", "reason": "automation_disabled", "table_name": table_name}

        return await _execute_dwd_update(config, table_name, db, event_payload)

    # ods_table_metadata_changed 处理
    if trigger_type == "ods_table_metadata_changed":
        if not config:
            return {"status": "skipped", "reason": "no_automation_config", "table_name": table_name}
        if not config.enabled:
            return {"status": "skipped", "reason": "automation_disabled", "table_name": table_name}

        change_type = event_payload.get("change_type", "")
        if change_type in ("column_added", "column_removed", "column_code_changed"):
            return {"status": "review_required", "reason": f"high_risk_metadata_change:{change_type}", "table_name": table_name, "detail": "字段结构变更需人工确认"}

        # 纯元数据变更（label/pk/sensitive/visibility/order/description）同步 DWD 元数据
        svc = get_standardization_rule_service(db)
        sync_result = await svc.generate_dwd_view(asset_code=table_name)
        if not sync_result or "error" in sync_result:
            return {"status": "failed", "reason": sync_result.get("error"), "table_name": table_name, "detail": sync_result.get("detail", "")}
        return {"status": "success", "mode": "metadata_sync", "table_name": table_name, "change_type": change_type, **sync_result}

    # standardization_rule_changed 处理
    if trigger_type == "standardization_rule_changed":
        if not config or not config.enabled or config.update_mode != "cleaning_rule":
            return {"status": "skipped", "reason": "not_applicable", "table_name": table_name}
        return {"status": "validated", "reason": "rule_change_recorded", "table_name": table_name, "detail": "规则变更已记录，下次 ODS 数据变更时将使用新规则"}

    # ods_dwd_automation_config_changed 处理
    if trigger_type == "ods_dwd_automation_config_changed":
        return {"status": "validated", "reason": "config_change_recorded", "table_name": table_name, "detail": "自动化配置变更已生效"}

    return {"status": "skipped", "reason": "unknown_trigger_type", "trigger_type": trigger_type}


async def _ensure_default_config(table_name: str, db: AsyncSession):
    """无配置时自动创建安全默认配置，通过安全门禁后自动启用。"""
    from app.warehouse.models import OdsDwdAutomationConfig
    from app.data.models import RegisteredTable, TableColumn
    import uuid

    dwd_table = f"dwd_{table_name.replace('ods_', '').replace('raw_', '').replace('src_', '')}"
    dwd_exists = (await db.execute(
        select(RegisteredTable).where(RegisteredTable.table_name == dwd_table)
    )).scalar_one_or_none()
    if not dwd_exists:
        return None

    # 安全门禁 1: 检查业务主键
    pk_count = (await db.execute(
        select(func.count()).select_from(TableColumn).where(
            TableColumn.table_name == table_name,
            TableColumn.is_pk_part.is_(True),
        )
    )).scalar() or 0

    # 自动检测同步语义
    from app.warehouse.router import _detect_ods_config
    detected = await _detect_ods_config(table_name, db)
    semantics = detected["ods_sync_semantics"]
    strategy = detected["dwd_write_strategy"]
    missing_strategy = detected["missing_row_strategy"]
    biz_keys = detected.get("business_key_fields")

    # 安全门禁 2: full_snapshot + mark_inactive 需检查 DWD 是否有软失效字段
    # 没有软删除字段时自动降级为 hard_delete（ODS 中消失的行从 DWD 物理删除）
    risk = "safe"
    if semantics == "full_snapshot" and missing_strategy == "mark_inactive":
        from sqlalchemy import text as sa_text
        cols = (await db.execute(sa_text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = :tbl AND column_name IN ('is_active', 'is_deleted', 'valid_to')"
        ), {"tbl": dwd_table})).all()
        if not cols:
            missing_strategy = "hard_delete"
            risk = "warn"

    if strategy == "incremental_upsert" and pk_count == 0:
        semantics = "full_snapshot"
        strategy = "full_refresh"
        missing_strategy = "hard_delete"
        biz_keys = None
        risk = "warn"
    elif pk_count == 0:
        risk = "warn"

    trace_id = f"auto_{uuid.uuid4().hex[:12]}"
    config = OdsDwdAutomationConfig(
        ods_table_name=table_name,
        target_dwd_table_name=dwd_table,
        update_mode="passthrough",
        ods_sync_semantics=semantics,
        dwd_write_strategy=strategy,
        business_key_fields=biz_keys,
        missing_row_strategy=missing_strategy,
        enabled=True,
        trigger_strategy="on_sync_success",
        auto_created=True,
        trigger_event="ods_table_data_changed",
        default_strategy=f"{semantics}+{strategy}",
        risk_decision=risk,
        trace_id=trace_id,
        source_system="system",
    )
    db.add(config)
    await db.commit()
    return config


async def _execute_dwd_update(
    config, table_name: str, db: AsyncSession, event_payload: dict[str, Any],
) -> dict[str, Any]:
    """执行 DWD 数据更新：严格按用户配置的 update_mode 执行。"""
    from app.core.db import get_session_factory

    async with get_session_factory()() as work_db:
        if config.update_mode == "cleaning_rule":
            if not config.standardization_rule_set_id and not config.standardization_rule_ids:
                return {"status": "failed", "reason": "no_rules_configured", "table_name": table_name, "detail": "cleaning_rule 模式但未配置规则"}

            svc = get_standardization_rule_service(work_db)
            exec_result = await svc.execute_full(
                asset_code=table_name,
                target_table=config.target_dwd_table_name or None,
            )
            if "error" in exec_result:
                await _update_config_execution_status(config, "failed", 0, exec_result.get("detail", ""), db)
                return {"status": "failed", "reason": exec_result.get("error"), "table_name": table_name, "detail": exec_result.get("detail", str(exec_result))}

            rows = exec_result.get("rows_inserted") or exec_result.get("total_rows", 0)
            await _update_config_execution_status(config, "success", rows, None, db)
            await _publish_dwd_refreshed(table_name, db)
            return {
                "status": "success", "mode": "cleaning_rule", "table_name": table_name, "rows": rows,
                "ods_sync_semantics": config.ods_sync_semantics,
                **exec_result,
            }

        elif config.update_mode == "passthrough":
            dwd_table = config.target_dwd_table_name or f"dwd_{table_name.replace('ods_', '').replace('raw_', '').replace('src_', '')}"
            import re
            if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table_name) or not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', dwd_table):
                return {"status": "failed", "reason": "invalid_table_name", "table_name": table_name}

            # 直通：按 DWD 写入策略同步 ODS → DWD
            try:
                rows = await _passthrough_sync(table_name, dwd_table, config, work_db)
            except Exception as e:
                await _update_config_execution_status(config, "failed", 0, str(e)[:500], db)
                return {"status": "failed", "reason": "passthrough_failed", "table_name": table_name, "detail": str(e)[:500]}

            await _update_config_execution_status(config, "success", rows, None, db)
            await _publish_dwd_refreshed(table_name, db)
            return {"status": "success", "mode": "passthrough", "table_name": table_name, "rows": rows, "dwd_table": dwd_table}

        return {"status": "skipped", "reason": f"unknown_update_mode:{config.update_mode}", "table_name": table_name}


async def _passthrough_sync(
    ods_table: str, dwd_table: str, config, db: AsyncSession,
) -> int:
    """直通同步：按 DWD 写入策略把 ODS 数据写入 DWD。"""
    from sqlalchemy import text as sa_text, inspect as sa_inspect
    from app.data.ddl import add_source_column, column_exists

    # 同步 table_columns 元数据（每次执行都同步 ODS → DWD）
    from app.data.models import TableColumn
    ods_cols = (await db.execute(
        select(TableColumn).where(TableColumn.table_name == ods_table)
    )).scalars().all()
    dwd_cols = {c.column_code: c for c in (await db.execute(
        select(TableColumn).where(TableColumn.table_name == dwd_table)
    )).scalars().all()}
    for col in ods_cols:
        # 无论元数据是否存在，都确保物理列存在
        if not await column_exists(db, dwd_table, col.column_code):
            await add_source_column(db, dwd_table, col.column_code, col.data_type)
        if col.column_code in dwd_cols:
            existing = dwd_cols[col.column_code]
            for attr in ("column_label", "data_type", "is_pk_part", "is_sensitive", "is_visible", "display_order", "description"):
                setattr(existing, attr, getattr(col, attr))
        else:
            db.add(TableColumn(
                table_name=dwd_table, column_code=col.column_code, column_label=col.column_label,
                data_type=col.data_type, is_pk_part=col.is_pk_part, is_sensitive=col.is_sensitive,
                is_visible=col.is_visible, display_order=col.display_order,
                auto_discovered=col.auto_discovered, description=col.description,
                scope_role=col.scope_role, agg_role=col.agg_role,
            ))
    # ODS 已删除的字段标记为不可见
    ods_codes = {c.column_code for c in ods_cols}
    for code, col in dwd_cols.items():
        if code not in ods_codes and code not in ("id", "pk_hash", "synced_at"):
            col.is_visible = False
    await db.commit()

    strategy = config.dwd_write_strategy

    if strategy == "full_refresh":
        await db.execute(sa_text(f'DELETE FROM "{dwd_table}"'))
        await db.execute(sa_text(f'INSERT INTO "{dwd_table}" SELECT * FROM "{ods_table}"'))
        await db.commit()
        return (await db.execute(sa_text(f'SELECT COUNT(*) FROM "{dwd_table}"'))).scalar() or 0

    # 获取 ODS 行（在所有检查之前）
    ods_rows = (await db.execute(sa_text(f'SELECT * FROM "{ods_table}"'))).mappings().all()

    # 确认 ODS 表有 pk_hash 字段
    has_pk_hash = 'pk_hash' in (ods_rows[0] if ods_rows else {})
    pk_cols = config.business_key_fields or []

    # 无可靠主键或业务主键：拒绝伪增量
    if not has_pk_hash:
        raise RuntimeError("ODS 表无 pk_hash 字段，不支持增量更新，请在配置中改用 full_refresh 策略")
    if not pk_cols:
        raise RuntimeError("未配置业务主键，不支持增量更新，请在配置中设置 business_key_fields 或改用 full_refresh")

    if strategy == "append":
        # 只插入不存在的行
        dwd_pks = {r['pk_hash'] for r in (await db.execute(sa_text(f'SELECT pk_hash FROM "{dwd_table}"'))).mappings().all()}
        inserted = 0
        for row in ods_rows:
            if row['pk_hash'] not in dwd_pks:
                cols = ', '.join(f'"{c}"' for c in row.keys())
                vals = ', '.join(f':{c}' for c in row.keys())
                await db.execute(sa_text(f'INSERT INTO "{dwd_table}" ({cols}) VALUES ({vals})'), dict(row))
                inserted += 1
        await db.commit()
        return inserted

    # incremental_upsert (默认)
    dwd_rows = {r['pk_hash']: r for r in (await db.execute(sa_text(f'SELECT * FROM "{dwd_table}"'))).mappings().all()}
    inserted, updated = 0, 0
    for row in ods_rows:
        if row['pk_hash'] in dwd_rows:
            # UPDATE
            set_clause = ', '.join(f'"{c}" = :{c}' for c in row.keys() if c != 'pk_hash')
            await db.execute(
                sa_text(f'UPDATE "{dwd_table}" SET {set_clause} WHERE pk_hash = :pk_hash'),
                dict(row),
            )
            updated += 1
        else:
            # INSERT
            cols = ', '.join(f'"{c}"' for c in row.keys())
            vals = ', '.join(f':{c}' for c in row.keys())
            await db.execute(sa_text(f'INSERT INTO "{dwd_table}" ({cols}) VALUES ({vals})'), dict(row))
            inserted += 1

    # full_snapshot: 标记 ODS 中不存在的 DWD 行
    if config.ods_sync_semantics == "full_snapshot" and config.missing_row_strategy == "mark_inactive":
        ods_pks = {r['pk_hash'] for r in ods_rows}
        stale = [pk for pk in dwd_rows if pk not in ods_pks]
        if stale:
            sample = dwd_rows[list(dwd_rows.keys())[0]] if dwd_rows else {}
            if 'is_active' in sample:
                placeholders = ', '.join(f':pk_{i}' for i in range(len(stale)))
                params = {f'pk_{i}': pk for i, pk in enumerate(stale)}
                await db.execute(sa_text(f'UPDATE "{dwd_table}" SET is_active = false WHERE pk_hash IN ({placeholders})'), params)
            elif 'is_deleted' in sample:
                placeholders = ', '.join(f':pk_{i}' for i in range(len(stale)))
                params = {f'pk_{i}': pk for i, pk in enumerate(stale)}
                await db.execute(sa_text(f'UPDATE "{dwd_table}" SET is_deleted = true WHERE pk_hash IN ({placeholders})'), params)
            elif 'valid_to' in sample:
                from datetime import UTC, datetime as dt
                placeholders = ', '.join(f':pk_{i}' for i in range(len(stale)))
                params = {f'pk_{i}': pk for i, pk in enumerate(stale)}
                await db.execute(sa_text(f'UPDATE "{dwd_table}" SET valid_to = :now WHERE pk_hash IN ({placeholders})'), {**params, 'now': dt.now(UTC)})
            else:
                # 无软失效字段 → 阻断执行，不允许幽灵数据
                raise RuntimeError(
                    f"full_snapshot 表 {dwd_table} 缺少软失效字段(is_active/is_deleted/valid_to)，"
                    "无法标记 ODS 已删除的行。请在 DWD 表中添加 is_active 字段或改用 full_refresh 策略。"
                    f" 待失效行: {len(stale)}"
                )

    await db.commit()
    return inserted + updated


async def _update_config_execution_status(
    config, status: str, rows: int, error: str | None, db: AsyncSession,
) -> None:
    """更新配置的最近执行状态。"""
    from datetime import datetime
    config.last_execution_status = status
    config.last_execution_at = datetime.utcnow()
    config.last_execution_rows = rows
    config.last_execution_error = error


async def _publish_dwd_refreshed(table_name: str, db: AsyncSession) -> None:
    """发布 dwd_data_refreshed 事件，触发 L4 级联检查。"""
    try:
        from app.automation.events import AutomationEvent, publish_event
        from app.core.db import get_session_factory
        async with get_session_factory()() as new_db:
            await publish_event(AutomationEvent(
                trigger_type="dwd_data_refreshed",
                biz_type="ods_table",
                biz_id=table_name,
                payload={
                    "trigger_type": "dwd_data_refreshed",
                    "table_name": table_name,
                },
            ), new_db)
    except Exception:
        pass


# ===== trigger_l4_cascade Action (Z0303) =====

async def _action_l4_cascade_execute(
    action_config: dict[str, Any],
    event_payload: dict[str, Any],
    db: AsyncSession,
    execution_id: int | None = None,
) -> dict[str, Any]:
    """L4 全自动级联执行动作。

    接收标准事件 payload，调用 L4CascadeEngine 完成全链路级联。
    """
    from app.core.config import settings
    from app.warehouse.service.l4_cascade import L4CascadeEngine, is_emergency_stopped, refresh_emergency_stop

    if not settings.WAREHOUSE_FEATURE_L4_FULL_AUTO:
        return {"status": "skipped", "reason": "feature_flag_disabled"}

    await refresh_emergency_stop()
    if is_emergency_stopped():
        return {"status": "skipped", "reason": "emergency_stop_active"}

    engine = L4CascadeEngine(db, trace_id=f"l4_evt_{event_payload.get('event_id', '')[:12]}", execution_id=execution_id)
    return await engine.process_event(event_payload)


# ===== 注册表 =====

ACTION_REGISTRY: dict[str, ActionFn] = {
    "feishu_send_message": _action_feishu_send_message,
    "trigger_dwd_standardization": _action_trigger_dwd_standardization,
    "l4_cascade_execute": _action_l4_cascade_execute,
}


def get_action(action_type: str) -> ActionFn:
    fn = ACTION_REGISTRY.get(action_type)
    if fn is None:
        raise RuntimeError(
            f"未注册的 action type: {action_type}（可选: {list(ACTION_REGISTRY.keys())}）"
        )
    return fn


def list_action_types() -> list[str]:
    return list(ACTION_REGISTRY.keys())
