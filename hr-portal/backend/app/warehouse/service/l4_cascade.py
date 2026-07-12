# -*- coding: utf-8 -*-
"""Z03 L4 全自动级联执行引擎

从事件触发 → 查 L4 审批+规则 → 诊断指标 → DWS 草稿 → 门禁检查 →
按风险状态机决策 → 发布/等待确认 → ADS 草稿 → 门禁检查 → 发布 →
更新 BI 消费契约 → 审计。失败时补偿回滚。
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime as dt, timezone, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.warehouse.service.metric_automation import get_metric_automation_service


logger = logging.getLogger("l4.cascade")

# L4 触发源统一常量（router/seed/engine/frontend 复用）
L4_ALL_TRIGGERS = frozenset({
    "metric_saved",
    "dwd_data_refreshed", "dwd_schema_changed", "dwd_metadata_changed",
    "ods_table_data_changed", "datasource_sync_completed",
    "ods_table_metadata_changed", "standardization_rule_changed",
    "ods_dwd_automation_config_changed",
})

# 紧急停止标记（进程内缓存 + DB 持久化）
_emergency_stop: bool = False
_last_stop_check: float = 0.0

# 需要从外部注入 session_factory（由 main.py 或 startup 事件设置）
_session_factory = None


def init_l4_session_factory(factory):
    global _session_factory
    _session_factory = factory


def is_emergency_stopped() -> bool:
    return _emergency_stop


async def refresh_emergency_stop() -> None:
    """从 DB 刷新紧急停止状态（最多每秒一次）。"""
    global _emergency_stop, _last_stop_check
    import time as _time
    now = _time.monotonic()
    if now - _last_stop_check < 1.0:
        return
    _last_stop_check = now
    if _session_factory is None:
        return
    try:
        from app.warehouse.models import L4RuntimeControl
        async with _session_factory() as db:
            ctrl = await db.get(L4RuntimeControl, 1)
            if ctrl:
                _emergency_stop = ctrl.emergency_stop
    except Exception:
        pass


def set_emergency_stop(v: bool) -> None:
    global _emergency_stop
    _emergency_stop = v


class L4CascadeEngine:
    """L4 全自动级联编排引擎"""

    def __init__(self, db: AsyncSession, trace_id: str | None = None, execution_id: int | None = None):
        self.db = db
        self.trace_id = trace_id or f"l4_{uuid.uuid4().hex[:12]}"
        self.execution_id = execution_id

    async def process_event(self, event_payload: dict) -> dict:
        """主入口：根据事件类型找到受影响的已审批 L4 指标，执行级联。"""
        trigger_type = event_payload.get("trigger_type", "")

        if not settings.WAREHOUSE_FEATURE_L4_FULL_AUTO:
            return {"status": "skipped", "reason": "feature_flag_disabled"}

        await refresh_emergency_stop()
        if is_emergency_stopped():
            return {"status": "skipped", "reason": "emergency_stop_active"}

        if trigger_type == "metric_saved":
            metric_id = event_payload.get("metric_id")
            if not metric_id:
                return {"status": "skipped", "reason": "no_metric_id"}
            return await self._cascade_metric(metric_id, trigger_type)

        # 所有 table-level trigger 统一通过 _cascade_by_table 处理
        if trigger_type in (
            "dwd_data_refreshed", "dwd_schema_changed", "dwd_metadata_changed",
            "ods_table_data_changed", "datasource_sync_completed",
            "ods_table_metadata_changed", "standardization_rule_changed",
            "ods_dwd_automation_config_changed",
        ):
            table_name = event_payload.get("table_name") or event_payload.get("asset_code", "")
            return await self._cascade_by_table(table_name, trigger_type)

        return {"status": "skipped", "reason": f"unhandled_trigger:{trigger_type}"}

    async def _cascade_by_table(self, table_name: str, trigger_type: str) -> dict:
        """找到使用此表的所有已审批 L4 指标，逐个执行级联。"""
        if not table_name:
            return {"status": "skipped", "reason": "no_table_name"}

        from app.warehouse.models import L4AutoApproval, L4CascadeRule
        from app.datasets.models import WarehouseMetric, DataSet, DataSetTable

        # 查找引用了此表的 dataset（通过 dataset_tables 关联表）
        ds_ids = (await self.db.execute(
            select(DataSetTable.dataset_id).where(DataSetTable.table_name == table_name)
        )).scalars().all()

        # 也查找 DWD 表名（ods_xxx 更新后，dwd_xxx 也会变化）
        dwd_table = table_name.replace("ods_", "dwd_").replace("raw_", "dwd_").replace("src_", "dwd_")
        if dwd_table != table_name:
            dwd_ids = (await self.db.execute(
                select(DataSetTable.dataset_id).where(DataSetTable.table_name == dwd_table)
            )).scalars().all()
            ds_ids = list(set(list(ds_ids) + list(dwd_ids)))

        if not ds_ids:
            return {"status": "skipped", "reason": f"no_dataset_uses_table:{table_name}"}

        # 找到使用这些 dataset 的指标
        metric_rows = (await self.db.execute(
            select(WarehouseMetric.id, WarehouseMetric.metric_code).where(
                WarehouseMetric.related_dataset_id.in_(ds_ids),
                WarehouseMetric.status.in_(["published", "draft"]),
            )
        )).all()

        results: list[dict] = []
        for metric_id, metric_code in metric_rows:
            # 检查 L4 审批和规则
                approval = (await self.db.execute(
                    select(L4AutoApproval).where(
                        L4AutoApproval.metric_id == metric_id,
                        L4AutoApproval.status == "approved",
                    )
                )).scalar_one_or_none()
                if not approval:
                    continue

                rule = (await self.db.execute(
                    select(L4CascadeRule).where(L4CascadeRule.metric_id == metric_id)
                )).scalar_one_or_none()
                if not rule:
                    continue

                triggers = rule.trigger_conditions or []
                if trigger_type not in triggers:
                    continue

                r = await self._cascade_metric(metric_id, trigger_type)
                results.append(r)

        return {"status": "completed", "table_name": table_name, "trigger": trigger_type,
                "metrics_processed": len(results), "results": results}

    async def _cascade_metric(self, metric_id: int, trigger: str) -> dict:
        """对单个已审批 L4 指标执行完整级联。"""
        from app.warehouse.models import L4AutoApproval, L4CascadeRule
        from app.datasets.models import WarehouseMetric
        from app.automation.models import AutomationExecution

        # 1) 检查 L4 审批
        approval = (await self.db.execute(
            select(L4AutoApproval).where(
                L4AutoApproval.metric_id == metric_id,
                L4AutoApproval.status == "approved",
            )
        )).scalar_one_or_none()
        if not approval:
            return {"status": "skipped", "reason": "not_approved_for_l4", "metric_id": metric_id}

        # 2) 加载规则
        rule = (await self.db.execute(
            select(L4CascadeRule).where(L4CascadeRule.metric_id == metric_id)
        )).scalar_one_or_none()
        if not rule:
            return {"status": "skipped", "reason": "no_cascade_rule", "metric_id": metric_id}

        if not rule.trigger_conditions:
            return {"status": "skipped", "reason": "no_trigger_conditions_configured", "metric_id": metric_id}
        if trigger and trigger not in rule.trigger_conditions:
            return {"status": "skipped", "reason": f"trigger_not_configured:{trigger}", "metric_id": metric_id}

        # 3) 频率上限
        # 3) 紧急停止（刷新 DB 状态）
        await refresh_emergency_stop()
        if is_emergency_stopped():
            return {"status": "skipped", "reason": "emergency_stop", "metric_id": metric_id}

        # 4) 执行级联（频率上限检查移到生成 DWS 草稿后）
        metric = await self.db.get(WarehouseMetric, metric_id)
        steps: list[dict] = []
        svc = get_metric_automation_service(self.db, trace_id=self.trace_id)

        # Step A: 诊断
        diag = await svc.diagnose_metric(metric_id)
        await self._audit_step(metric_id, "diagnose", "指标解析诊断", "success" if diag["automatable"] else "failed", 1, output_data=diag)
        if not diag["automatable"]:
            await self._audit(metric_id, "diagnose_failed", "; ".join(diag["errors"]), "failed")
            return {"status": "failed", "step": "diagnose", "metric_id": metric_id, "errors": diag["errors"]}
        steps.append({"step": "diagnose", "status": "success"})

        # Step B: 风险预判（使用统一 L4RiskAssessmentService）
        from app.warehouse.service.l4_risk import L4RiskAssessmentService
        risk = await L4RiskAssessmentService(self.db).assess(metric_id)
        await self._audit_step(metric_id, "risk_assess", "风险预判", risk["risk_level"], 2, risk_level=risk["risk_level"], output_data=risk)
        steps.append({"step": "risk_assess", "status": risk["risk_level"], "checks": risk.get("checks", [])})

        # 高风险 / 中风险 → 阻断或等待确认（复用 check 结果判定）
        if risk["risk_level"] == "high":
            await self._save_pending(metric_id, trigger, "approval_required", "risk_assess",
                                     steps=steps, risk=risk)
            await self._audit(metric_id, "l4_blocked", "高风险阻断全自动", "blocked",
                              extra={"risk": risk})
            return {"status": "approval_required", "metric_id": metric_id, "steps": steps, "risk": risk}

        if risk["risk_level"] == "medium":
            await self._save_pending(metric_id, trigger, "review_required", "risk_assess",
                                     steps=steps, risk=risk)
            await self._audit(metric_id, "l4_review_required", "中风险需确认", "review_required",
                              extra={"steps": steps})
            return {"status": "review_required", "metric_id": metric_id, "steps": steps, "risk": risk}

        # Step C: 生成 DWS 草稿
        await refresh_emergency_stop()
        if is_emergency_stopped():
            return {"status": "skipped", "reason": "emergency_stop_during_cascade", "metric_id": metric_id, "step": "generate_dws"}
        dws_result = await svc.generate_dws_draft(metric_id)
        if dws_result.get("status") == "failed":
            await self._audit(metric_id, "dws_draft_failed", dws_result.get("error", "DWS 草稿生成失败"), "failed")
            return {"status": "failed", "step": "generate_dws", "metric_id": metric_id, "error": dws_result.get("error")}
        dws_id = dws_result["draft_id"]
        await self._audit_step(metric_id, "dws_draft", "生成 DWS 草稿", "success", 3, output_data={"draft_id": dws_id})
        steps.append({"step": "generate_dws", "status": "success", "draft_id": dws_id})

        # 频率上限检查（DWS 草稿已生成，超限时退化为草稿模式）
        if not await self._check_frequency(metric_id, rule.max_frequency):
            await self._save_pending(metric_id, trigger, "review_required", "dws_draft",
                                     dws_draft_id=dws_id, steps=steps, risk=risk)
            await self._audit(metric_id, "frequency_cap_exceeded",
                              f"24h 内已达上限 {rule.max_frequency} 次，DWS 草稿已生成待确认", "review_required",
                              extra={"dws_draft_id": dws_id, "steps": steps})
            return {"status": "review_required", "reason": "frequency_cap_exceeded",
                    "detail": f"24h 内已达每日上限 {rule.max_frequency} 次，DWS 草稿已生成待确认",
                    "draft_mode": True, "dws_draft_id": dws_id, "steps": steps, "metric_id": metric_id}

        # Step D: 门禁检查
        preview = await svc.preview_draft(dws_id, "dws")
        await self._audit_step(metric_id, "gate_dws", "DWS 门禁检查", "blocked" if preview.get("blocked") else "success", 4, risk_level=preview.get("risk_level"), output_data=preview)
        steps.append({"step": "preview_dws", "status": preview.get("risk_level", "low"),
                       "blocked": preview.get("blocked", False),
                       "blocked_reasons": preview.get("blocked_reasons", [])})

        blocked = preview.get("blocked", False)
        risk_level = preview.get("risk_level", risk["risk_level"])

        if blocked or risk_level == "high":
            # 门禁阻断 → FAILED（保留旧版本，不发布）
            await self._audit(metric_id, "dws_gate_blocked", str(preview.get("blocked_reasons", [])), "failed")
            return {"status": "failed", "step": "gate_dws", "metric_id": metric_id,
                    "blocked_reasons": preview.get("blocked_reasons", [])}

        # 中风险 → REVIEW_REQUIRED（生成草稿但等待确认）
        if risk_level == "medium":
            await self._save_pending(metric_id, trigger, "review_required", "gate_dws",
                                     dws_draft_id=dws_id, steps=steps, preview=preview, risk=risk)
            await self._audit(metric_id, "l4_review_required", "中风险需确认", "review_required",
                              extra={"dws_draft_id": dws_id, "steps": steps})
            return {"status": "review_required", "metric_id": metric_id, "dws_draft_id": dws_id,
                    "steps": steps, "preview": preview, "risk": risk}

        # ===== 发布前：采集完整快照 =====
        pre_snapshot = await self._capture_pre_publish_snapshot(metric_id)

        # Step E: 自动发布 DWS
        await refresh_emergency_stop()
        if is_emergency_stopped():
            return {"status": "skipped", "reason": "emergency_stop_during_cascade", "metric_id": metric_id, "step": "publish_dws"}
        pub_result = await svc.publish_draft(dws_id, "dws")
        if pub_result.get("status") == "failed":
            await self._audit(metric_id, "dws_publish_failed", pub_result.get("error", "DWS 发布失败"), "failed")
            return {"status": "failed", "step": "publish_dws", "metric_id": metric_id, "error": pub_result.get("error")}
        dws_version = pub_result.get("published_version", 1)
        dws_view_name = pub_result.get("view_name", "")
        await self._audit_step(metric_id, "publish_dws", "发布 DWS View", "success", 5, output_data={"version": dws_version, "view_name": dws_view_name})
        steps.append({"step": "publish_dws", "status": "success", "version": dws_version, "view_name": dws_view_name})

        # Step F: 生成 ADS 草稿
        await refresh_emergency_stop()
        if is_emergency_stopped():
            await self._save_pending(metric_id, trigger, "review_required", "generate_ads",
                                     dws_draft_id=dws_id, dws_published=True, steps=steps, risk=risk,
                                     dws_version=dws_version, dws_view_name=dws_view_name)
            await self._audit(metric_id, "l4_interrupted", "紧急停止：ADS 生成前中断 (DWS 已发布)", "partial_failed",
                              extra={"dws_published": True, "saved_pending": True})
            return {"status": "partial_failed", "reason": "emergency_stop_after_dws_published",
                    "metric_id": metric_id, "step": "generate_ads", "dws_published": True, "saved_pending": True}
        ads_result = await svc.generate_ads_draft("dws_aggregate", dws_id)
        if ads_result.get("error"):
            if rule.auto_rollback:
                try:
                    await svc.rollback_draft(dws_id, "dws", max(1, dws_version - 1))
                    steps.append({"step": "compensation", "status": "dws_rolled_back"})
                except Exception as e:
                    steps.append({"step": "compensation", "status": "rollback_failed", "error": str(e)})
            await self._audit(metric_id, "ads_draft_failed", ads_result.get("error", "ADS 生成失败"), "partial_failed",
                              extra={"dws_published": True, "dws_rolled_back": rule.auto_rollback})
            return {"status": "partial_failed", "step": "generate_ads", "metric_id": metric_id,
                    "error": ads_result.get("error"), "dws_published": True, "dws_rolled_back": rule.auto_rollback}
        ads_id = ads_result["draft_id"]
        await self._audit_step(metric_id, "ads_draft", "生成 ADS 草稿", "success", 6, output_data={"draft_id": ads_id})
        steps.append({"step": "generate_ads", "status": "success", "draft_id": ads_id})

        # Step G: 门禁检查 ADS
        ads_preview = await svc.preview_draft(ads_id, "ads")
        await self._audit_step(metric_id, "gate_ads", "ADS 门禁检查", "blocked" if ads_preview.get("blocked") else "success", 7, output_data=ads_preview)
        if ads_preview.get("blocked"):
            if rule.auto_rollback:
                try:
                    await svc.rollback_draft(dws_id, "dws", max(1, dws_version - 1))
                    steps.append({"step": "compensation", "status": "dws_rolled_back"})
                except Exception:
                    pass
            return {"status": "failed", "step": "gate_ads", "metric_id": metric_id,
                    "blocked_reasons": ads_preview.get("blocked_reasons", [])}

        # Step H: 自动发布 ADS
        await refresh_emergency_stop()
        if is_emergency_stopped():
            # DWS 已发布 → 保存 pending，不能简单 skipped
            await self._save_pending(metric_id, trigger, "review_required", "publish_ads",
                                     dws_draft_id=dws_id, dws_published=True, ads_draft_id=ads_id,
                                     steps=steps, risk=risk, dws_version=dws_version, dws_view_name=dws_view_name)
            await self._audit(metric_id, "l4_interrupted", "紧急停止：ADS 发布前中断 (DWS 已发布)", "partial_failed",
                              extra={"dws_published": True, "saved_pending": True})
            return {"status": "partial_failed", "reason": "emergency_stop_after_dws_published",
                    "metric_id": metric_id, "step": "publish_ads", "dws_published": True, "saved_pending": True}
        ads_pub = await svc.publish_draft(ads_id, "ads")
        if ads_pub.get("status") == "failed":
            if rule.auto_rollback:
                try:
                    await svc.rollback_draft(dws_id, "dws", max(1, dws_version - 1))
                    steps.append({"step": "compensation", "status": "dws_rolled_back"})
                except Exception:
                    pass
            await self._audit(metric_id, "ads_publish_failed", ads_pub.get("error", "ADS 发布失败"), "partial_failed")
            return {"status": "partial_failed", "step": "publish_ads", "metric_id": metric_id,
                    "error": ads_pub.get("error"), "dws_published": True}
        ads_version = ads_pub.get("published_version", 1)
        ads_view_name = ads_pub.get("view_name", "")
        steps.append({"step": "publish_ads", "status": "success", "version": ads_version, "view_name": ads_view_name})
        await self._audit_step(metric_id, "publish_ads", "发布 ADS View", "success", 8, output_data={"version": ads_version})

        # Step I: 更新 BI 消费契约
        try:
            bi = await svc.generate_bi_contract("ads", ads_id)
            if bi and not bi.get("error"):
                steps.append({"step": "bi_contract", "status": "success"})
                await self._audit_step(metric_id, "bi_contract", "更新 BI 消费契约", "success", 9, output_data=bi)
            else:
                steps.append({"step": "bi_contract", "status": "warn", "detail": str(bi.get("error", ""))[:200]})
                await self._audit_step(metric_id, "bi_contract", "更新 BI 消费契约", "warn", 9, error_message=str(bi.get("error", ""))[:200])
        except Exception:
            steps.append({"step": "bi_contract", "status": "warn", "detail": "BI 契约更新异常"})
            await self._audit_step(metric_id, "bi_contract", "更新 BI 消费契约", "failed", 9, error_message="BI 契约更新异常")

        # 记录发布批次（使用发布前采集的快照）
        await self._record_batch(
            metric_id, metric.metric_code if metric else "", trigger,
            "success",
            published_assets=[
                {"asset_type": "dws", "asset_id": dws_id, "view_name": dws_view_name, "version": dws_version},
                {"asset_type": "ads", "asset_id": ads_id, "view_name": ads_view_name, "version": ads_version},
            ],
            previous_versions=[
                {"asset_type": "dws", "asset_id": dws_id, "from_version": max(1, dws_version - 1), "to_version": dws_version, "view_name": dws_view_name},
                {"asset_type": "ads", "asset_id": ads_id, "from_version": max(1, ads_version - 1), "to_version": ads_version, "view_name": ads_view_name},
            ],
            pre_snapshot=pre_snapshot,
        )

        # 完成
        await self._audit(metric_id, "l4_cascade_complete",
                          f"全链路完成 DWS→ADS (metric={metric_id})",
                          "success", extra={"steps": steps, "trace_id": self.trace_id})

        return {"status": "success", "metric_id": metric_id, "steps": steps,
                "metric_code": metric.metric_code if metric else "",
                "risk_level": risk_level, "trace_id": self.trace_id}

    async def _check_frequency(self, metric_id: int, max_per_day: int) -> bool:
        """检查最近 24h 内执行次数是否超限。"""
        from app.automation.models import AutomationExecution

        since = dt.now(timezone.utc) - timedelta(hours=24)
        count = (await self.db.execute(
            select(func.count()).select_from(AutomationExecution).where(
                AutomationExecution.biz_type == "metric",
                AutomationExecution.biz_id == str(metric_id),
                AutomationExecution.started_at >= since,
                AutomationExecution.status.in_(["success", "review_required", "approval_required"]),
            )
        )).scalar() or 0
        return count < max_per_day

    async def _audit(self, metric_id: int, action: str, message: str, status: str,
                     extra: dict | None = None, error_message: str | None = None) -> None:
        """写入 SystemLog 审计（全链路统一入口，含 trace_id 贯穿）。"""
        try:
            from app.system.models import SystemLog
            log_entry = SystemLog(
                category="l4_full_auto",
                action=action,
                status=status,
                user_id=None,
                request_summary=message,
                response_summary=f"{action}:{status}",
                metadata_json={
                    "metric_id": metric_id,
                    "trace_id": self.trace_id,
                    "extra": extra or {},
                    "error": error_message,
                },
            )
            self.db.add(log_entry)
        except Exception:
            logger.exception("[l4] 审计写入失败 metric_id=%s action=%s", metric_id, action)

    async def _audit_step(self, metric_id: int, step_code: str, step_name: str,
                          status: str, step_order: int = 0, risk_level: str | None = None,
                          input_data: dict | None = None, output_data: dict | None = None,
                          error_message: str | None = None, operator: str = "system") -> None:
        """写入 L4 结构化审计步骤（完整时间线）。"""
        try:
            from datetime import UTC, datetime as dt_real
            from app.warehouse.models import L4AuditStep
            step = L4AuditStep(
                trace_id=self.trace_id,
                execution_id=self.execution_id,
                metric_id=metric_id,
                step_code=step_code,
                step_name=step_name,
                step_order=step_order,
                status=status,
                risk_level=risk_level,
                input_snapshot=input_data,
                output_snapshot=output_data,
                error_message=error_message,
                operator=operator,
                started_at=dt_real.now(UTC),
                finished_at=dt_real.now(UTC),
            )
            self.db.add(step)
        except Exception:
            logger.exception("[l4] 审计步骤写入失败 step=%s", step_code)

    async def _save_pending(self, metric_id: int, trigger_type: str, risk_state: str,
                            current_step: str, dws_draft_id: int | None = None,
                            ads_draft_id: int | None = None, dws_published: bool = False,
                            steps: list[dict] | None = None,
                            preview: dict | None = None, risk: dict | None = None,
                            dws_version: int | None = None, dws_view_name: str | None = None) -> None:
        """保存待确认/待审批执行上下文。"""
        try:
            from app.warehouse.models import L4PendingExecution
            pending = L4PendingExecution(
                execution_id=self.execution_id or 0,
                metric_id=metric_id,
                trace_id=self.trace_id,
                trigger_type=trigger_type,
                current_step=current_step,
                risk_state=risk_state,
                dws_draft_id=dws_draft_id,
                dws_published=dws_published,
                ads_draft_id=ads_draft_id,
                steps_snapshot=steps or [],
                preview_snapshot=preview,
                risk_assessment=risk,
                status="pending",
            )
            self.db.add(pending)
            await self.db.flush()
        except Exception:
            logger.exception("[l4] 保存 pending context 失败 metric_id=%s", metric_id)

    async def resume_from_pending(self, pending_id: int, action: str) -> dict:
        """从待确认/待审批状态继续执行剩余链路。"""
        from app.warehouse.models import L4PendingExecution, L4AutoApproval, L4CascadeRule
        from app.datasets.models import WarehouseMetric

        pending = await self.db.get(L4PendingExecution, pending_id)
        if not pending:
            return {"status": "failed", "error": "pending execution not found"}
        if pending.status != "pending":
            return {"status": "failed", "error": f"pending status is {pending.status}, not pending"}
        if pending.risk_state != action:
            return {"status": "failed", "error": f"pending risk_state {pending.risk_state} != action {action}"}

        mid = pending.metric_id  # 使用 pending 中的 metric_id，避免作用域问题
        metric = await self.db.get(WarehouseMetric, mid)
        if not metric:
            return {"status": "failed", "error": "metric not found"}

        # 加载级联规则（用于 auto_rollback 判断）
        rule = (await self.db.execute(
            select(L4CascadeRule).where(L4CascadeRule.metric_id == mid)
        )).scalar_one_or_none()

        svc = get_metric_automation_service(self.db, trace_id=self.trace_id)
        steps: list[dict] = list(pending.steps_snapshot or [])

        # 更新 pending 状态
        operator = "confirm" if action == "review_required" else "approve"
        if action == "review_required":
            pending.status = "confirmed"
        elif action == "approval_required":
            pending.status = "approved"
        await self._audit_step(mid, "resume_start", f"Resume 开始 ({operator})", "running", 0, operator=operator)

        # 从 current_step 继续执行
        if pending.current_step == "risk_assess" and not pending.dws_draft_id:
            diag = await svc.diagnose_metric(mid)
            if not diag["automatable"]:
                await self._audit_step(mid, "resume_diagnose", "Resume: 诊断失败", "failed", 1, error_message="; ".join(diag["errors"]))
                return {"status": "failed", "step": "diagnose", "errors": diag["errors"]}
            dws_result = await svc.generate_dws_draft(mid)
            if dws_result.get("status") == "failed":
                await self._audit_step(mid, "resume_dws_draft", "Resume: DWS 草稿生成失败", "failed", 2)
                return {"status": "failed", "step": "generate_dws", "error": dws_result.get("error")}
            pending.dws_draft_id = dws_result["draft_id"]
            steps.append({"step": "generate_dws", "status": "success", "draft_id": pending.dws_draft_id})
            await self._audit_step(mid, "resume_dws_draft", "Resume: DWS 草稿已生成", "success", 2, output_data={"draft_id": pending.dws_draft_id}, operator=operator)

        # 发布 DWS（或从已发布状态恢复 dws_version）
        dws_id = pending.dws_draft_id
        dws_version = pending.dws_version or 1
        dws_view_name_restored = pending.dws_view_name or ""
        # 发布前采集快照（resume 路径也需要）
        resume_pre_snapshot = await self._capture_pre_publish_snapshot(mid)

        if not pending.dws_published and dws_id:
            # 频率上限二次校验
            if not await self._check_frequency(mid, (rule.max_frequency if rule else 1)):
                await self._audit(mid, "resume_frequency_cap", "Resume: 频率上限超限", "review_required")
                return {"status": "review_required", "reason": "frequency_cap_exceeded_resume",
                        "metric_id": mid, "draft_mode": True}
            # DWS gate 二次校验（与主流程统一）
            dws_preview = await svc.preview_draft(dws_id, "dws")
            if dws_preview.get("blocked"):
                await self._audit(mid, "resume_gate_dws", "Resume: DWS 门禁阻断", "blocked")
                return {"status": "failed", "step": "gate_dws", "blocked_reasons": dws_preview.get("blocked_reasons", [])}
            await self._audit_step(mid, "resume_gate_dws", "Resume: DWS 门禁检查通过", "success", 3, risk_level=dws_preview.get("risk_level"))
            await refresh_emergency_stop()
            if is_emergency_stopped():
                pending.status = "partial_failed"
                await self._audit(mid, "emergency_stop_resume_dws", "紧急停止：resume DWS 发布前中断", "skipped")
                await self._audit_step(mid, "resume_emergency_stop", "Resume: 紧急停止 (DWS 未发布)", "skipped", 3)
                return {"status": "skipped", "reason": "emergency_stop", "dws_published": False}
            pub_result = await svc.publish_draft(dws_id, "dws")
            if pub_result.get("status") == "failed":
                await self._audit_step(mid, "resume_publish_dws", "Resume: DWS 发布失败", "failed", 4, error_message=pub_result.get("error"))
                return {"status": "failed", "step": "publish_dws", "error": pub_result.get("error")}
            pending.dws_published = True
            dws_version = pub_result.get("published_version", 1)
            pending.dws_version = dws_version
            pending.dws_view_name = pub_result.get("view_name", "")
            steps.append({"step": "publish_dws", "status": "success", "draft_id": dws_id, "version": dws_version, "view_name": pending.dws_view_name})
            await self._audit_step(mid, "resume_publish_dws", "Resume: DWS 已发布", "success", 4, output_data={"version": dws_version}, operator=operator)

            # 生成 ADS
            ads_result = await svc.generate_ads_draft("dws_aggregate", dws_id)
            if ads_result.get("error"):
                await self._audit_step(mid, "resume_ads_draft", "Resume: ADS 草稿生成失败", "failed", 5, error_message=ads_result.get("error"))
                return {"status": "partial_failed", "step": "generate_ads", "error": ads_result.get("error")}
            pending.ads_draft_id = ads_result["draft_id"]
            steps.append({"step": "generate_ads", "status": "success", "draft_id": pending.ads_draft_id})

        # 发布 ADS
        ads_id = pending.ads_draft_id
        if ads_id:
            ads_preview = await svc.preview_draft(ads_id, "ads")
            if ads_preview.get("blocked"):
                pending.status = "failed"
                await self._audit(mid, "gate_ads_blocked", "ADS 门禁阻断", "blocked")
                await self._audit_step(mid, "resume_gate_ads", "Resume: ADS 门禁阻断", "blocked", 6, error_message=str(ads_preview.get("blocked_reasons", [])))
                return {"status": "failed", "step": "gate_ads", "blocked_reasons": ads_preview.get("blocked_reasons", [])}
            await refresh_emergency_stop()
            if is_emergency_stopped():
                # DWS 已发布，紧急停止 → 补偿回滚
                if rule and rule.auto_rollback and dws_id:
                    try:
                        rollback_ver = max(1, dws_version - 1)
                        await svc.rollback_draft(dws_id, "dws", rollback_ver)
                        await self._audit_step(mid, "compensation", "紧急停止: 自动回滚 DWS", "success", 99, operator="system")
                    except Exception as re:
                        await self._audit_step(mid, "compensation", "紧急停止: 回滚失败", "failed", 99, error_message=str(re))
                pending.status = "partial_failed"
                await self._audit(mid, "emergency_stop_resume_ads", "紧急停止：resume ADS 发布前中断 (DWS 已发布)", "partial_failed")
                return {"status": "partial_failed", "reason": "emergency_stop_after_dws", "dws_published": True,
                        "dws_rolled_back": rule.auto_rollback if rule else True}
            ads_pub = await svc.publish_draft(ads_id, "ads")
            if ads_pub.get("status") == "failed":
                auto_rollback = rule.auto_rollback if rule else True
                if auto_rollback and pending.dws_published and dws_id:
                    try:
                        rollback_ver = max(1, dws_version - 1)
                        await svc.rollback_draft(dws_id, "dws", rollback_ver)
                        await self._audit_step(mid, "compensation", "补偿回滚 DWS", "success", 99, operator="system")
                    except Exception as re:
                        await self._audit_step(mid, "compensation", "补偿回滚失败", "failed", 99, error_message=str(re))
                pending.status = "partial_failed"
                await self._audit(mid, "publish_ads_failed", f"ADS 发布失败: {ads_pub.get('error')}", "partial_failed",
                                  extra={"dws_published": pending.dws_published, "dws_rolled_back": auto_rollback})
                await self._audit_step(mid, "resume_publish_ads", "Resume: ADS 发布失败", "partial_failed", 7, error_message=ads_pub.get("error"), operator=operator)
                return {"status": "partial_failed", "step": "publish_ads", "error": ads_pub.get("error"),
                        "dws_published": pending.dws_published, "dws_rolled_back": auto_rollback}
            steps.append({"step": "publish_ads", "status": "success", "draft_id": ads_id, "version": ads_pub.get("published_version", 1), "view_name": ads_pub.get("view_name")})
            await self._audit_step(mid, "resume_publish_ads", "Resume: ADS 已发布", "success", 7, output_data={"version": ads_pub.get("published_version", 1)}, operator=operator)

            # BI 契约更新
            try:
                bi = await svc.generate_bi_contract("ads", ads_id)
                if bi and not bi.get("error"):
                    steps.append({"step": "bi_contract", "status": "success"})
            except Exception:
                pass

            # 记录发布批次（使用 pending 中保存的 version/view_name）
            dws_view_name_for_batch = pending.dws_view_name or dws_view_name_restored
            ads_view_name = ads_pub.get("view_name", "")
            ads_version_val = ads_pub.get("published_version", 1)
            await self._record_batch(
                mid, metric.metric_code or "", pending.trigger_type,
                "success",
                published_assets=[
                    {"asset_type": "dws", "asset_id": dws_id, "view_name": dws_view_name_for_batch, "version": dws_version},
                    {"asset_type": "ads", "asset_id": ads_id, "view_name": ads_view_name, "version": ads_version_val},
                ],
                previous_versions=[
                    {"asset_type": "dws", "asset_id": dws_id, "from_version": max(1, dws_version - 1), "to_version": dws_version, "view_name": dws_view_name_for_batch},
                    {"asset_type": "ads", "asset_id": ads_id, "from_version": max(1, ads_version_val - 1), "to_version": ads_version_val, "view_name": ads_view_name},
                ],
                pre_snapshot=resume_pre_snapshot,
            )

        await self.db.commit()
        await self._audit(mid, f"l4_resumed_{action}",
                          f"确认/审批后继续执行完成 (pending_id={pending_id})",
                          "success", extra={"steps": steps, "trace_id": self.trace_id})
        await self._audit_step(mid, "resume_complete", f"Resume 完成 ({operator})", "success", 99, operator=operator)

        return {"status": "success", "metric_id": mid, "steps": steps,
                "pending_id": pending_id, "trace_id": self.trace_id}


    async def _capture_pre_publish_snapshot(self, metric_id: int) -> dict:
        """在发布 DWS/ADS/BI 之前采集完整快照（4 类）。"""
        return {
            "dataset_outputs_before": await self._snapshot_dataset_outputs(metric_id),
            "lineage_before": await self._snapshot_lineage_for_rollback(metric_id),
            "permissions_before": await self._snapshot_permissions_for_rollback(metric_id),
            "bi_contract_before": await self._snapshot_bi_contracts_for_rollback(metric_id),
        }

    async def _record_batch(self, metric_id: int, metric_code: str, trigger_type: str,
                            status: str, published_assets: list[dict],
                            previous_versions: list[dict] | None = None,
                            pre_snapshot: dict | None = None) -> None:
        """记录 L4 发布批次（回滚依据）。所有快照必须通过 pre_snapshot 传入（发布前采集）。"""
        try:
            from app.warehouse.models import L4PublishBatch

            pre = pre_snapshot or {}
            batch = L4PublishBatch(
                metric_id=metric_id, metric_code=metric_code,
                trace_id=self.trace_id, trigger_type=trigger_type,
                status=status, published_assets=published_assets,
                previous_versions=previous_versions or [],
                dataset_outputs_before=pre.get("dataset_outputs_before", []),
                lineage_before=pre.get("lineage_before", []),
                permissions_before=pre.get("permissions_before", []),
                bi_contract_before=pre.get("bi_contract_before", []),
            )
            self.db.add(batch)
        except Exception:
            logger.exception("[l4] 批次记录失败 metric_id=%s", metric_id)

    async def _snapshot_lineage_for_rollback(self, metric_id: int) -> list[dict]:
        """在发布前采集 lineage（当前状态 = 回滚目标）。"""
        try:
            from app.warehouse.models import LineageEdge
            edges = (await self.db.execute(
                select(LineageEdge).limit(100)  # 采集当前所有血缘边（回滚时按资产名匹配恢复）
            )).scalars().all()
            return [{"source_asset": e.source_asset, "target_asset": e.target_asset,
                     "operation": e.operation, "operator": e.operator} for e in edges]
        except Exception:
            return []

    async def _snapshot_permissions_for_rollback(self, metric_id: int) -> list[dict]:
        """在发布前采集权限（基于当前活跃 BI 契约）。"""
        try:
            from app.warehouse.models import BiContract
            contracts = (await self.db.execute(
                select(BiContract).where(BiContract.status == "active").limit(200)
            )).scalars().all()
            return [{"asset_type": c.asset_type, "asset_id": c.asset_id,
                     "asset_name": c.asset_name, "status": c.status} for c in contracts]
        except Exception:
            return []

    async def _snapshot_bi_contracts_for_rollback(self, metric_id: int) -> list[dict]:
        """在发布前采集 BI 契约（当前状态 = 回滚目标）。"""
        try:
            from app.warehouse.models import BiContract
            contracts = (await self.db.execute(
                select(BiContract).where(BiContract.status == "active").limit(200)
            )).scalars().all()
            return [{"asset_type": c.asset_type, "asset_id": c.asset_id,
                     "asset_name": c.asset_name, "status": c.status,
                     "version": c.version} for c in contracts]
        except Exception:
            return []

    async def _snapshot_dataset_outputs(self, metric_id: int) -> list[dict]:
        """捕获发布前数据集输出字段快照（含完整字段属性）。"""
        try:
            from app.datasets.models import WarehouseMetric, DatasetOutputField
            m = await self.db.get(WarehouseMetric, metric_id)
            if not m or not m.related_dataset_id:
                return []
            fields = (await self.db.execute(
                select(DatasetOutputField).where(DatasetOutputField.dataset_id == m.related_dataset_id)
            )).scalars().all()
            return [{
                "field_code": getattr(f, "field_code", ""),
                "field_label": getattr(f, "field_label", ""),
                "data_type": getattr(f, "data_type", "string"),
                "is_sensitive": getattr(f, "is_sensitive", False),
                "is_visible": getattr(f, "is_visible", True),
                "display_order": getattr(f, "display_order", 0),
                "scope_role": getattr(f, "scope_role", ""),
                "agg_role": getattr(f, "agg_role", ""),
                "description": getattr(f, "description", ""),
            } for f in fields]
        except Exception:
            return []

    async def _snapshot_lineage(self, published_assets: list[dict]) -> list[dict]:
        """捕获发布前血缘边快照（用于回滚恢复）。"""
        try:
            from app.warehouse.models import LineageEdge
            view_names = [a.get("view_name", "") for a in published_assets if a.get("view_name")]
            if not view_names:
                return []
            edges = (await self.db.execute(
                select(LineageEdge).where(LineageEdge.target_asset.in_(view_names))
            )).scalars().all()
            return [{"source_asset": e.source_asset, "target_asset": e.target_asset,
                     "operation": e.operation, "operator": e.operator,
                     "edge_metadata": getattr(e, "edge_metadata", None)} for e in edges]
        except Exception:
            return []

    async def _snapshot_permissions(self, published_assets: list[dict]) -> list[dict]:
        """捕获发布前权限快照（基于 BI 消费契约 + 资产状态）。"""
        try:
            from app.warehouse.models import BiContract
            view_names = [a.get("view_name", "") for a in published_assets if a.get("view_name")]
            if not view_names:
                return []
            contracts = (await self.db.execute(
                select(BiContract).where(BiContract.asset_name.in_(view_names))
            )).scalars().all()
            return [{"asset_type": c.asset_type, "asset_id": c.asset_id,
                     "asset_name": c.asset_name, "status": c.status,
                     "version": c.version, "contract_json": getattr(c, "contract_json", None),
                     "permission_note": "View 重建后通过 BiContract.status 恢复权限可见性"}
                    for c in contracts]
        except Exception:
            return []

    async def _snapshot_bi_contracts(self, published_assets: list[dict]) -> list[dict]:
        """捕获发布前 BI 消费契约快照。"""
        try:
            from app.warehouse.models import BiContract
            view_names = [a.get("view_name", "") for a in published_assets if a.get("view_name")]
            if not view_names:
                return []
            contracts = (await self.db.execute(
                select(BiContract).where(BiContract.asset_name.in_(view_names))
            )).scalars().all()
            return [{"asset_type": c.asset_type, "asset_id": c.asset_id, "asset_name": c.asset_name, "status": c.status, "version": c.version} for c in contracts]
        except Exception:
            return []
