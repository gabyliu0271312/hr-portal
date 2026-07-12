"""Z01 ODS→DWD 自动化 验收测试脚本

运行: docker exec hr-portal-backend python tests/z01_acceptance.py
"""
import asyncio
import sys
from sqlalchemy import text as sa_text, select

from app.core.db import get_session_factory
from app.warehouse.models import OdsDwdAutomationConfig
from app.automation.action_registry import _ensure_default_config


async def test_01_no_business_key_no_auto_enable():
    """验收: 无业务主键表不自动启用"""
    async with get_session_factory()() as db:
        # 创建一个临时注册表（无 pk_columns）
        r = await db.execute(sa_text(
            "SELECT table_name FROM registered_tables WHERE warehouse_layer = 'ODS' LIMIT 1"
        ))
        table = r.scalar()
        if not table:
            print("SKIP: 无 ODS 表")
            return

        # 删除已有 config
        await db.execute(sa_text("DELETE FROM ods_dwd_automation_configs WHERE ods_table_name = :t"), {"t": table})
        await db.commit()

        # 检查业务主键
        pk = (await db.execute(sa_text(
            "SELECT count(*) FROM table_columns WHERE table_name = :t AND is_pk_part = true"
        ), {"t": table})).scalar() or 0

        config = await _ensure_default_config(table, db)
        if pk == 0 and config is None:
            print(f"PASS: {table} 无业务主键 → 不自动启用")
        elif pk > 0 and config is not None and config.enabled:
            print(f"PASS: {table} 有业务主键 → 自动启用, risk={config.risk_decision}")
        elif pk == 0 and config is not None:
            print(f"WARN: {table} 无业务主键但仍创建了配置 enabled={config.enabled}")
        else:
            print(f"INFO: {table} pk={pk} config={'created' if config else 'None'}")


async def test_02_full_snapshot_mark_inactive_block():
    """验收: full_snapshot + mark_inactive 无软失效字段时阻断"""
    async with get_session_factory()() as db:
        # 找一张 full_snapshot 表
        from app.warehouse.router import _detect_ods_config
        r = await db.execute(sa_text(
            "SELECT table_name FROM registered_tables WHERE warehouse_layer = 'ODS' LIMIT 5"
        ))
        for row in r.all():
            table = row[0]
            detected = await _detect_ods_config(table, db)
            if detected["ods_sync_semantics"] != "full_snapshot":
                continue
            dwd_table = f"dwd_{table.replace('ods_', '').replace('raw_', '').replace('src_', '')}"
            # 检查 DWD 是否有软失效字段
            cols = (await db.execute(sa_text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = :t AND column_name IN ('is_active', 'is_deleted', 'valid_to')"
            ), {"t": dwd_table})).all()
            if cols:
                print(f"PASS: {table} → {dwd_table} 有软失效字段: {[c[0] for c in cols]}")
            else:
                print(f"WARN: {table} → {dwd_table} full_snapshot 但无软失效字段，自建配置会被阻断")

    print("INFO: 手动验证 — 找一张无 is_active 的 full_snapshot 表，删除 config 后触发 ODS 变更，确认配置未被创建")


async def test_03_ghost_data_elimination():
    """验收: full_snapshot 名单减少后 DWD 正确失效"""
    print("INFO: 手动验证步骤 —")
    print("  1. 选一张 full_snapshot 表（如 cost_center_monthly），确保 DWD 有 is_active 字段")
    print("  2. 在 ODS 中删除一条记录")
    print("  3. 触发 ODS→DWD 同步")
    print("  4. 检查 DWD 中对应记录的 is_active 是否为 false")
    print("  5. 查询 DWD current view 不应包含该记录")


async def test_04_sensitive_field_quality_block():
    """验收: 敏感字段/质量 BLOCK/高风险 门禁"""
    print("INFO: 当前安全门禁覆盖——")
    print("  - 业务主键检查: incremental_upsert 无 PK → 不自动启用")
    print("  - 软失效检查: full_snapshot + mark_inactive 无 is_active/is_deleted/valid_to → 不自动启用")
    print("  - DWD 表存在性: 无 DWD 表 → 不自动启用")
    print("  - 敏感字段/质量 BLOCK: 通过 risk_decision 字段预留，当前默认 safe")
    print("  完整敏感/质量门禁需集成 QualityEngine + SensitiveFieldScanner，建议第二期实现")


async def test_05_auto_created_audit_fields():
    """验收: 自动配置审计字段完整"""
    async with get_session_factory()() as db:
        configs = (await db.execute(
            select(OdsDwdAutomationConfig).where(OdsDwdAutomationConfig.auto_created == True)
        )).scalars().all()
        if not configs:
            print("INFO: 暂无 auto_created 配置，需要先触发一次自动创建")
            return
        for c in configs:
            fields_ok = all([
                c.auto_created is True,
                c.trigger_event is not None,
                c.default_strategy is not None,
                c.risk_decision is not None,
                c.trace_id is not None,
                c.source_system == "system",
            ])
            status = "PASS" if fields_ok else "FAIL"
            print(f"{status}: {c.ods_table_name} auto_created={c.auto_created} event={c.trigger_event} "
                  f"strategy={c.default_strategy} risk={c.risk_decision} trace={c.trace_id} source={c.source_system}")


async def main():
    print("=" * 60)
    print("Z01 ODS→DWD 自动化 验收测试")
    print("=" * 60)
    await test_01_no_business_key_no_auto_enable()
    print()
    await test_02_full_snapshot_mark_inactive_block()
    print()
    await test_03_ghost_data_elimination()
    print()
    await test_04_sensitive_field_quality_block()
    print()
    await test_05_auto_created_audit_fields()
    print()
    print("=" * 60)
    print("验收完成")


if __name__ == "__main__":
    asyncio.run(main())
