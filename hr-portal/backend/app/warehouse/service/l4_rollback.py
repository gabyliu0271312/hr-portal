# -*- coding: utf-8 -*-
"""Z03 L4 一键回滚服务 — 完整撤销最近一次自动发布"""
from __future__ import annotations

import logging
from datetime import datetime as dt, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.warehouse.service.metric_automation import get_metric_automation_service

logger = logging.getLogger("l4.rollback")


class L4RollbackService:
    """L4 全自动级联回滚服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def rollback_latest(self, metric_id: int, operator: str = "system") -> dict:
        """按顺序完整回滚最近一次 L4 自动发布。

        1. 冻结当前批次对外可见性。
        2. 回滚 ADS → 回滚 DWS。
        3. 从快照恢复数据集输出字段 / 血缘 / 权限 / BI 契约。
        4. 写审计。
        """
        from app.warehouse.models import L4PublishBatch

        batch = (await self.db.execute(
            select(L4PublishBatch).where(
                L4PublishBatch.metric_id == metric_id,
                L4PublishBatch.rollback_status.is_(None),
            ).order_by(L4PublishBatch.id.desc()).limit(1)
        )).scalar_one_or_none()

        if not batch:
            return {"ok": False, "error": "未找到可回滚的 L4 发布批次"}

        # 使用原批次的 trace_id
        rollback_trace_id = batch.trace_id or f"rollback_{metric_id}_{dt.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        svc = get_metric_automation_service(self.db, trace_id=rollback_trace_id)
        rolled_back: list[dict] = []
        errors: list[str] = []
        pv_list = batch.previous_versions or []

        # 1) 冻结批次
        batch.rollback_status = "rolling_back"
        await self.db.flush()

        # 2) 按逆序回滚资产（先 ADS 再 DWS）
        sorted_assets = sorted(pv_list, key=lambda x: 0 if x.get("asset_type") == "ads" else 1)
        for pv in sorted_assets:
            asset_type = pv.get("asset_type", "")
            asset_id = pv.get("asset_id", 0)
            from_version = pv.get("from_version", 1)
            if not asset_type or not asset_id:
                continue
            try:
                result = await svc.rollback_draft(int(asset_id), asset_type, from_version)
                if result.get("status") == "success":
                    rolled_back.append({"asset_type": asset_type, "asset_id": asset_id, "to_version": from_version})
                    await self._audit_step(metric_id, "rollback_asset",
                                           f"回滚 {asset_type}#{asset_id}→v{from_version}",
                                           "success", operator=operator, trace_id=rollback_trace_id)
                else:
                    errors.append(f"{asset_type}#{asset_id}: {result.get('error')}")
            except Exception as e:
                errors.append(f"{asset_type}#{asset_id}: {e}")

        # 3) 从快照恢复 BI 消费契约
        bi_before = batch.bi_contract_before or []
        ads_asset_ids = [int(pv["asset_id"]) for pv in pv_list if pv.get("asset_type") == "ads"]
        try:
            from app.warehouse.models import BiContract
            if ads_asset_ids:
                bi_contracts = (await self.db.execute(
                    select(BiContract).where(BiContract.asset_type == "ads", BiContract.asset_id.in_(ads_asset_ids))
                )).scalars().all()
                for bc in bi_contracts:
                    # 恢复快照中的状态，若无快照则归档
                    match = next((b for b in bi_before if b.get("asset_name") == bc.asset_name), None)
                    bc.status = match.get("status", "archived") if match else "archived"
                await self._audit_step(metric_id, "rollback_bi",
                                       f"恢复 BI 消费契约 ({len(bi_contracts)} 条)", "success",
                                       operator=operator, trace_id=rollback_trace_id)
        except Exception as e:
            logger.warning("[l4_rollback] BI contract restore failed: %s", e)

        # 4) 恢复数据集输出字段（从快照，含完整字段属性）
        snapshots_restored: list[str] = ["bi_contract"]
        ds_before = batch.dataset_outputs_before or []
        if ds_before:
            try:
                from app.datasets.models import DatasetOutputField, WarehouseMetric
                m = await self.db.get(WarehouseMetric, metric_id)
                if m and m.related_dataset_id:
                    current = (await self.db.execute(
                        select(DatasetOutputField).where(DatasetOutputField.dataset_id == m.related_dataset_id)
                    )).scalars().all()
                    for c in current:
                        await self.db.delete(c)
                    for f in ds_before:
                        self.db.add(DatasetOutputField(
                            dataset_id=m.related_dataset_id,
                            field_code=f.get("field_code", ""),
                            field_label=f.get("field_label", ""),
                            data_type=f.get("data_type", "string"),
                            is_sensitive=f.get("is_sensitive", False),
                            is_visible=f.get("is_visible", True),
                            display_order=f.get("display_order", 0),
                            scope_role=f.get("scope_role", ""),
                            agg_role=f.get("agg_role", ""),
                            description=f.get("description", ""),
                        ))
                    snapshots_restored.append("dataset_outputs")
                    await self._audit_step(metric_id, "rollback_ds_outputs",
                                           f"恢复数据集输出字段 ({len(ds_before)} 条，含 data_type/is_sensitive/scope_role/agg_role)", "success",
                                           operator=operator, trace_id=rollback_trace_id)
            except Exception as e:
                logger.warning("[l4_rollback] dataset outputs restore failed: %s", e)

        # 5) 恢复血缘边（从快照重建）
        lineage_before = batch.lineage_before or []
        if lineage_before:
            try:
                from app.warehouse.models import LineageEdge
                from app.warehouse.service import write_lineage_edge
                target_assets = list(set(e.get("target_asset", "") for e in lineage_before if e.get("target_asset")))
                if target_assets:
                    # 删除当前血缘边
                    current_edges = (await self.db.execute(
                        select(LineageEdge).where(LineageEdge.target_asset.in_(target_assets))
                    )).scalars().all()
                    for ce in current_edges:
                        await self.db.delete(ce)
                    # 从快照重建
                    for e in lineage_before:
                        await write_lineage_edge(
                            self.db, e.get("source_asset", ""), e.get("target_asset", ""),
                            e.get("operation", "rollback_restore"),
                            operator=e.get("operator", operator),
                            metadata=e.get("edge_metadata") or {"restored_from_snapshot": True}
                        )
                    snapshots_restored.append("lineage")
                    await self._audit_step(metric_id, "rollback_lineage",
                                           f"恢复血缘边 ({len(lineage_before)} 条)", "success",
                                           operator=operator, trace_id=rollback_trace_id)
            except Exception as e:
                logger.warning("[l4_rollback] lineage restore failed: %s", e)

        # 6) 恢复权限（通过 BI 契约状态 + View 重建自动继承权限）
        perm_before = batch.permissions_before or []
        if perm_before and any(p.get("status") for p in perm_before):
            try:
                from app.warehouse.models import BiContract
                asset_names = [p.get("asset_name", "") for p in perm_before if p.get("asset_name")]
                if asset_names:
                    perm_contracts = (await self.db.execute(
                        select(BiContract).where(BiContract.asset_name.in_(asset_names))
                    )).scalars().all()
                    for pc in perm_contracts:
                        match = next((p for p in perm_before if p.get("asset_name") == pc.asset_name and p.get("status")), None)
                        if match:
                            pc.status = match["status"]
                    snapshots_restored.append("permissions")
                    await self._audit_step(metric_id, "rollback_permissions",
                                           f"恢复权限 ({len(perm_contracts)} 条)", "success",
                                           operator=operator, trace_id=rollback_trace_id)
            except Exception as e:
                logger.warning("[l4_rollback] permissions restore failed: %s", e)

        # 7) 标记批次已回滚
        batch.rollback_status = "rolled_back" if not errors else "partial"
        batch.rollback_by = operator
        batch.rollback_at = dt.now(timezone.utc)

        # 8) 写入审计
        await self._audit_step(metric_id, "rollback_complete",
                               f"回滚完成: {len(rolled_back)} 资产" + (f", {len(errors)} 失败" if errors else ""),
                               "success" if not errors else "partial_failed",
                               output_data={"rolled_back": rolled_back, "errors": errors, "snapshots_restored": snapshots_restored},
                               operator=operator, trace_id=rollback_trace_id)

        await self.db.commit()

        return {
            "ok": len(errors) == 0,
            "message": f"已回滚 {len(rolled_back)} 个资产" + (f"，{len(errors)} 个失败" if errors else ""),
            "batch_id": batch.id, "trace_id": rollback_trace_id,
            "rolled_back": rolled_back, "errors": errors,
            "snapshots_restored": snapshots_restored,
        }

    async def _audit_step(self, metric_id: int, step_code: str, step_name: str,
                          status: str, output_data: dict | None = None,
                          error_message: str | None = None, operator: str = "system",
                          trace_id: str | None = None) -> None:
        try:
            from datetime import UTC, datetime as dt_real
            from app.warehouse.models import L4AuditStep
            step = L4AuditStep(
                trace_id=trace_id or f"rollback_{metric_id}_{dt_real.now(UTC).strftime('%Y%m%d%H%M%S')}",
                metric_id=metric_id,
                step_code=step_code,
                step_name=step_name,
                status=status,
                output_snapshot=output_data,
                error_message=error_message,
                operator=operator,
            )
            self.db.add(step)
        except Exception:
            pass
