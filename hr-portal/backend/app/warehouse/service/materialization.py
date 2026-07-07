# -*- coding: utf-8 -*-
"""快照 + SCD 拉链服务"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# ==================== 快照任务 (R0401) ====================

class SnapshotService:
    """快照任务管理 + 执行"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_jobs(self, page=1, page_size=20):
        from app.warehouse.models import SnapshotJob
        page_size = min(max(page_size, 1), 200)
        base = select(SnapshotJob).order_by(SnapshotJob.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": j.id, "name": j.name, "source_table": j.source_table, "target_table": j.target_table, "snapshot_keys": j.snapshot_keys, "period": j.period, "retention": j.retention, "enabled": j.enabled, "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None, "last_status": j.last_status} for j in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_job(self, job_id: int):
        from app.warehouse.models import SnapshotJob
        j = await self.session.get(SnapshotJob, job_id)
        if j is None: return None
        return {"id": j.id, "name": j.name, "source_table": j.source_table, "target_table": j.target_table, "snapshot_keys": j.snapshot_keys, "period": j.period, "retention": j.retention, "enabled": j.enabled}

    async def create_job(self, payload: dict):
        from app.warehouse.models import SnapshotJob
        j = SnapshotJob(name=payload["name"], source_table=payload["source_table"], target_table=payload["target_table"], snapshot_keys=payload.get("snapshot_keys", []), period=payload.get("period", "monthly"), retention=payload.get("retention", 12))
        self.session.add(j); await self.session.commit(); await self.session.refresh(j)
        return await self.get_job(j.id)

    async def update_job(self, job_id: int, payload: dict):
        from app.warehouse.models import SnapshotJob
        j = await self.session.get(SnapshotJob, job_id)
        if j is None: return None
        for k in ("name", "snapshot_keys", "period", "retention", "enabled"):
            if k in payload: setattr(j, k, payload[k])
        await self.session.commit(); await self.session.refresh(j)
        return await self.get_job(j.id)

    async def delete_job(self, job_id: int) -> bool:
        from app.warehouse.models import SnapshotJob
        j = await self.session.get(SnapshotJob, job_id)
        if j is None: return False
        await self.session.delete(j); await self.session.commit()
        return True

    async def trigger_snapshot(self, job_id: int, period_value: str) -> dict:
        """手动触发快照执行"""
        from datetime import datetime as dt
        from app.warehouse.models import SnapshotJob, SnapshotRun
        from sqlalchemy import text as sa_text
        j = await self.session.get(SnapshotJob, job_id)
        if j is None: return {"error": "not_found"}
        # P0-6: SQL identifier 安全校验
        validate_identifier(j.source_table)
        validate_identifier(j.target_table)
        # Fix3: period_value 安全校验
        safe_period = period_value.replace("-", "_").replace("Q", "Q")
        validate_identifier(safe_period)
        started = dt.utcnow()
        run = SnapshotRun(job_id=job_id, status="running", period_value=period_value, started_at=started)
        self.session.add(run); await self.session.flush()
        try:
            # Fix1: DROP+CREATE → REPLACE 语义
            from app.warehouse.layer_policy import validate_ddl_operation, DDL_DROP, DDL_CREATE, DDL_REPLACE
            from app.warehouse.layer_policy import get_registered_layer as _get_registered_layer
            snap_target = f"{j.target_table}_{safe_period}"
            existing = await _get_registered_layer(self.session, snap_target)
            if existing is not None:
                await validate_ddl_operation(self.session, snap_target, DDL_REPLACE)
            else:
                await validate_ddl_operation(self.session, snap_target, DDL_CREATE, target_layer="DWS")
            result = await self.session.execute(sa_text(f"SELECT * FROM `{j.source_table}`"))
            rows = result.fetchall()
            cols = list(result.keys())
            row_count = len(rows)
            # COPY to target
            await self.session.execute(sa_text(f"DROP TABLE IF EXISTS `{snap_target}`"))
            await self.session.execute(sa_text(f"CREATE TABLE `{snap_target}` AS SELECT * FROM `{j.source_table}`"))
            # Fix2: 清理旧快照加 DDL_DROP 校验
            all_tables = await self.session.execute(sa_text(
                f"SELECT table_name FROM information_schema.tables WHERE table_name LIKE :pat"
            ).bindparams(pat=f"{j.target_table}_%"))
            snap_tables = [r[0] for r in all_tables.fetchall()]
            for old_table in snap_tables[j.retention:]:
                validate_identifier(old_table)
                await validate_ddl_operation(self.session, old_table, DDL_DROP)
                await self.session.execute(sa_text(f"DROP TABLE IF EXISTS `{old_table}`"))
            run.status = "success"; run.row_count = row_count
            j.last_run_at = dt.utcnow(); j.last_status = "success"
            # Z02: 自动血缘边
            from app.warehouse.service import write_lineage_edge
            await write_lineage_edge(self.session, j.source_table, snap_target, "snapshot")
        except Exception as e:
            run.status = "failed"; run.error_message = str(e)[:1000]
            j.last_run_at = dt.utcnow(); j.last_status = "failed"
        run.finished_at = dt.utcnow()
        await self.session.commit()
        return {"run_id": run.id, "status": run.status, "row_count": run.row_count, "error_message": run.error_message}

    async def list_runs(self, job_id: int = None, page=1, page_size=20):
        from app.warehouse.models import SnapshotRun
        page_size = min(max(page_size, 1), 200)
        base = select(SnapshotRun)
        if job_id: base = base.where(SnapshotRun.job_id == job_id)
        base = base.order_by(SnapshotRun.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": r.id, "job_id": r.job_id, "status": r.status, "period_value": r.period_value, "row_count": r.row_count, "error_message": r.error_message, "started_at": r.started_at.isoformat() if r.started_at else None, "finished_at": r.finished_at.isoformat() if r.finished_at else None} for r in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}


def get_snapshot_service(session: AsyncSession) -> SnapshotService:
    return SnapshotService(session)


# ==================== SCD Service (R0403) ====================

class ScdService:
    """SCD Type 2 拉链服务 — 配置管理 + 拉链执行"""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── CRUD ──────────────────────────────────────

    async def list_configs(self, page=1, page_size=20):
        from app.warehouse.models import ScdConfig
        page_size = min(max(page_size, 1), 200)
        base = select(ScdConfig).order_by(ScdConfig.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [self._config_out(c) for c in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_config(self, config_id: int):
        from app.warehouse.models import ScdConfig
        c = await self.session.get(ScdConfig, config_id)
        return self._config_out(c) if c else None

    async def create_config(self, payload: dict):
        from app.warehouse.models import ScdConfig
        c = ScdConfig(
            name=payload["name"],
            source_table=payload["source_table"],
            target_table=payload["target_table"],
            business_key=payload["business_key"],
            effective_from_field=payload.get("effective_from_field", "effective_from"),
            effective_to_field=payload.get("effective_to_field", "effective_to"),
            current_flag_field=payload.get("current_flag_field", "current_flag"),
            compare_fields=payload.get("compare_fields", []),
        )
        self.session.add(c); await self.session.commit(); await self.session.refresh(c)
        return self._config_out(c)

    async def update_config(self, config_id: int, payload: dict):
        from app.warehouse.models import ScdConfig
        c = await self.session.get(ScdConfig, config_id)
        if c is None: return None
        for k in ("name", "business_key", "effective_from_field", "effective_to_field", "current_flag_field", "compare_fields", "enabled"):
            if k in payload: setattr(c, k, payload[k])
        await self.session.commit(); await self.session.refresh(c)
        return self._config_out(c)

    async def delete_config(self, config_id: int) -> bool:
        from app.warehouse.models import ScdConfig
        c = await self.session.get(ScdConfig, config_id)
        if c is None: return False
        await self.session.delete(c); await self.session.commit()
        return True

    def _config_out(self, c):
        return {
            "id": c.id, "name": c.name,
            "source_table": c.source_table, "target_table": c.target_table,
            "business_key": c.business_key,
            "effective_from_field": c.effective_from_field,
            "effective_to_field": c.effective_to_field,
            "current_flag_field": c.current_flag_field,
            "compare_fields": c.compare_fields or [],
            "enabled": c.enabled,
            "last_run_at": c.last_run_at.isoformat() if c.last_run_at else None,
            "last_status": c.last_status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }

    # ── 拉链执行 ─────────────────────────────────

    async def execute_scd(self, config_id: int) -> dict:
        """执行 SCD Type 2 拉链逻辑

        三场景：
        1. 新增 — 业务键在 target 中不存在 → INSERT（ef=now, et=9999, cf=1）
        2. 变更 — 业务键存在且 compare_fields 任一变 → UPDATE 旧记录（et=now, cf=0）+ INSERT 新记录
        3. 不变 — 业务键存在且 compare_fields 未变 → 跳过
        """
        from datetime import datetime as dt
        from app.warehouse.models import ScdConfig, ScdRun
        from sqlalchemy import text as sa_text

        c = await self.session.get(ScdConfig, config_id)
        if c is None: return {"error": "not_found", "detail": f"SCD config {config_id} not found"}

        # P0-6: SQL identifier 安全校验
        validate_identifier(c.source_table)
        validate_identifier(c.target_table)
        validate_identifier(c.effective_from_field)
        validate_identifier(c.effective_to_field)
        validate_identifier(c.current_flag_field)
        for k in c.business_key.split(","):
            validate_identifier(k.strip())

        started = dt.utcnow()
        run = ScdRun(config_id=config_id, status="running", started_at=started)
        self.session.add(run); await self.session.flush()

        try:
            # P0-1: 分层流转校验 — SCD 在 DWD/DWS 层做快照
            from app.warehouse.layer_policy import validate_layer_transition
            validate_layer_transition("DWD", "DWS", "snapshot")
            # 1. 确保 target 表存在

            # 检查 target 是否存在，不存在则从 source 结构创建
            check = await self.session.execute(
                sa_text(f"SELECT 1 FROM information_schema.tables WHERE table_name = :t")
                .bindparams(t=c.target_table)
            )
            target_exists = check.fetchone() is not None
            if not target_exists:
                # P0-1: DDL 安全校验 — CREATE SCD 拉链表
                from app.warehouse.layer_policy import validate_ddl_operation, DDL_CREATE
                await validate_ddl_operation(self.session, c.target_table, DDL_CREATE, target_layer="DWS")
                await self.session.execute(
                    sa_text(f"CREATE TABLE `{c.target_table}` LIKE `{c.source_table}`")
                )
                # 添加拉链字段
                for col_def in [
                    (c.effective_from_field, "DATETIME NOT NULL"),
                    (c.effective_to_field, "DATETIME NOT NULL DEFAULT '9999-12-31 23:59:59'"),
                    (c.current_flag_field, "INT NOT NULL DEFAULT 1"),
                ]:
                    try:
                        await self.session.execute(
                            sa_text(f"ALTER TABLE `{c.target_table}` ADD COLUMN `{col_def[0]}` {col_def[1]}")
                        )
                    except Exception:
                        pass  # column may already exist

            # 2. 获取 source 当前全量数据
            src_rows = (await self.session.execute(
                sa_text(f"SELECT * FROM `{c.source_table}`")
            )).fetchall()
            src_cols = list((await self.session.execute(
                sa_text(f"SELECT * FROM `{c.source_table}` LIMIT 0")
            )).keys())

            # 3. 获取 target 当前有效记录（current_flag=1）
            tgt_rows = (await self.session.execute(
                sa_text(f"SELECT * FROM `{c.target_table}` WHERE `{c.current_flag_field}` = 1")
            )).fetchall()
            tgt_cols = list((await self.session.execute(
                sa_text(f"SELECT * FROM `{c.target_table}` LIMIT 0")
            )).keys())

            # 4. 构建 target 业务键索引
            bk_fields = [k.strip() for k in c.business_key.split(",")]
            def bk_val(row, cols):
                return tuple(row[cols.index(f)] for f in bk_fields)

            tgt_bk_map = {}
            for row in tgt_rows:
                key = bk_val(row, tgt_cols)
                tgt_bk_map[key] = row

            # 5. 定义 compare 函数
            compare_fields = c.compare_fields or []
            if not compare_fields:
                # 默认：对比 source 中所有字段（排除拉链表特有字段）
                compare_fields = [col for col in src_cols if col not in (
                    c.effective_from_field, c.effective_to_field, c.current_flag_field
                )]

            def has_changed(src_row, tgt_row):
                for f in compare_fields:
                    if f in src_cols and f in tgt_cols:
                        sv = src_row[src_cols.index(f)]
                        tv = tgt_row[tgt_cols.index(f)]
                        if str(sv) != str(tv):
                            return True
                return False

            # 6. 三场景处理
            new_count = 0
            updated_count = 0
            closed_count = 0
            now = dt.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            far_future = "9999-12-31 23:59:59"

            for src_row in src_rows:
                key = bk_val(src_row, src_cols)
                if key in tgt_bk_map:
                    tgt_row = tgt_bk_map[key]
                    if has_changed(src_row, tgt_row):
                        # 变更：关闭旧记录
                        await self.session.execute(
                            sa_text(
                                f"UPDATE `{c.target_table}` SET `{c.effective_to_field}` = :et, `{c.current_flag_field}` = 0 "
                                f"WHERE `{c.current_flag_field}` = 1 "
                                + " AND ".join([f"`{f}` = :bk_{f}" for f in bk_fields])
                            ).bindparams(**{"et": now, **{f"bk_{f}": src_row[src_cols.index(f)] for f in bk_fields}})
                        )
                        closed_count += 1
                        # 插入新版本
                        await self._do_insert(c, src_row, src_cols, now, far_future)
                        updated_count += 1
                    # 未变更：跳过
                else:
                    # 新增
                    await self._do_insert(c, src_row, src_cols, now, far_future)
                    new_count += 1

            # 7. 更新 run 记录
            run.status = "success"
            run.new_count = new_count
            run.updated_count = updated_count
            run.closed_count = closed_count
            c.last_run_at = now
            c.last_status = "success"
            run.finished_at = dt.utcnow()
            # Z02: 自动血缘边
            from app.warehouse.service import write_lineage_edge
            await write_lineage_edge(self.session, c.source_table, c.target_table, "scd")
            await self.session.commit()

            return {
                "run_id": run.id, "status": "success",
                "new_count": new_count, "updated_count": updated_count,
                "closed_count": closed_count,
            }
        except Exception as e:
            await self.session.rollback()
            run.status = "failed"
            run.error_message = str(e)[:2000]
            run.finished_at = dt.utcnow()
            c.last_run_at = dt.utcnow()
            c.last_status = "failed"
            await self.session.commit()
            return {"run_id": run.id, "status": "failed", "error": str(e)[:500]}

    def _insert_new_row(self, c, src_row, src_cols, now, far_future):
        """构建 INSERT 语句并异步执行 — 由 execute_scd 内部 await"""
        pass  # 实际 INSERT 在 execute_scd 中内联，此方法为接口占位

    async def _do_insert(self, c, src_row, src_cols, now, far_future):
        """插入新版本拉链记录"""
        from sqlalchemy import text as sa_text
        col_names = [f"`{col}`" for col in src_cols]
        col_names.append(f"`{c.effective_from_field}`")
        col_names.append(f"`{c.effective_to_field}`")
        col_names.append(f"`{c.current_flag_field}`")
        placeholders = [f":v_{i}" for i in range(len(src_cols))]
        placeholders += [":ef", ":et", ":cf"]
        sql = f"INSERT INTO `{c.target_table}` ({', '.join(col_names)}) VALUES ({', '.join(placeholders)})"
        params = {f"v_{i}": src_row[i] for i in range(len(src_cols))}
        params["ef"] = now
        params["et"] = far_future
        params["cf"] = 1
        await self.session.execute(sa_text(sql).bindparams(**params))

    async def list_runs(self, config_id=None, page=1, page_size=20):
        from app.warehouse.models import ScdRun
        page_size = min(max(page_size, 1), 200)
        base = select(ScdRun)
        if config_id: base = base.where(ScdRun.config_id == config_id)
        base = base.order_by(ScdRun.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{
            "id": r.id, "config_id": r.config_id,
            "status": r.status,
            "new_count": r.new_count, "updated_count": r.updated_count,
            "closed_count": r.closed_count,
            "error_message": r.error_message,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        } for r in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    # ── 候选字段检测 API（UI 辅助）───────────────

    async def detect_candidates(self, table_name: str) -> dict:
        """检测表结构，推荐业务键和时间字段候选"""
        from sqlalchemy import text as sa_text

        if not table_name.replace("_", "").isalnum():
            return {"error": "invalid_table_name"}

        try:
            cols = (await self.session.execute(
                sa_text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :t ORDER BY ordinal_position")
                .bindparams(t=table_name)
            )).fetchall()
        except Exception:
            return {"error": "table_not_found", "table_name": table_name}

        columns = [{"name": c[0], "type": c[1]} for c in cols]

        # 候选业务键：含 id/key/code 且非时间字段
        bk_candidates = [
            c["name"] for c in columns
            if ("id" in c["name"].lower() or "key" in c["name"].lower() or "code" in c["name"].lower())
            and c["name"] not in ("effective_from", "effective_to", "current_flag")
        ]

        # 候选时间字段：date/time 类型
        time_candidates = [
            c["name"] for c in columns
            if "date" in c["type"].lower() or "time" in c["type"].lower() or "timestamp" in c["type"].lower()
        ]

        # 候选对比字段：非时间、非主键的普通字段
        compare_candidates = [
            c["name"] for c in columns
            if c["name"] not in bk_candidates and c["name"] not in time_candidates
            and c["name"] not in ("created_at", "updated_at")
        ]

        return {
            "table_name": table_name,
            "columns": columns,
            "business_key_candidates": bk_candidates,
            "time_candidates": time_candidates,
            "compare_candidates": compare_candidates,
            "risk_warnings": [
                "拉链表需要业务键唯一标识实体（如 employee_id），请确认选中的字段能唯一确定一条记录",
                "source 表需有变更时间字段（如 updated_at），用于判断 effective_from",
                "拉链表 target 不可与 source 为同一张表",
            ],
        }


def get_scd_service(session: AsyncSession) -> ScdService:
    return ScdService(session)


