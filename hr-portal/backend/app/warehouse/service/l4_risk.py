# -*- coding: utf-8 -*-
"""Z03 L4 风险自动评估服务 — 统一口径，审批/执行/预览/审计复用同一套检查"""
from __future__ import annotations

from typing import Any
from sqlalchemy import func, select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession


class L4RiskAssessmentService:
    """L4 全自动级联风险统一评估"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def assess(self, metric_id: int) -> dict:
        """
        对指定指标执行完整 L4 风险评估，返回：
        {
          "risk_level": "low"|"medium"|"high",
          "checks": [{code, status:"pass"|"warn"|"block", detail, score}],
          "can_auto_publish": bool,
          "requires_review": bool,
          "requires_approval": bool,
        }
        """
        from app.datasets.models import WarehouseMetric

        metric = await self.db.get(WarehouseMetric, metric_id)
        if not metric:
            return self._result("high", [{"code": "metric_exists", "status": "block", "detail": "指标不存在", "score": 100}])

        checks: list[dict] = []
        total_score = 0

        # 1) 数据集存在性
        checks.append(await self._check_dataset(metric))
        # 2) 公式/口径检查
        checks.append(self._check_formula(metric))
        # 3) 敏感字段
        checks.append(self._check_sensitive(metric))
        # 4) 下游消费者
        checks.append(await self._check_consumers(metric_id))
        # 5) 草稿状态
        checks.append(self._check_draft_status(metric))
        # 6) 小样本风险
        checks.append(await self._check_small_sample(metric))
        # 7) 最近发布成功率
        checks.append(await self._check_recent_publish(metric_id))
        # 8) 跨主题域
        checks.append(self._check_cross_subject(metric))
        # 9) 字段类型/删除变化
        checks.append(self._check_field_stability(metric))

        for c in checks:
            total_score += c.get("score", 0)
            if c["status"] == "block":
                total_score += 30  # 阻断项加权

        # 风险判定
        if total_score >= 50:
            risk_level = "high"
        elif total_score >= 20:
            risk_level = "medium"
        else:
            risk_level = "low"

        return self._result(risk_level, checks)

    def _result(self, level: str, checks: list[dict]) -> dict:
        return {
            "risk_level": level,
            "checks": checks,
            "can_auto_publish": level == "low",
            "requires_review": level == "medium",
            "requires_approval": level == "high",
        }

    async def _check_dataset(self, metric) -> dict:
        c = {"code": "dataset", "status": "pass", "detail": "已关联数据集", "score": 0}
        if not metric.related_dataset_id:
            c["status"] = "block"
            c["detail"] = "未关联数据集"
            c["score"] = 40
        return c

    def _check_formula(self, metric) -> dict:
        c = {"code": "formula", "status": "pass", "detail": "有公式/口径定义", "score": 0}
        if not metric.formula_expr and not metric.calculation_desc:
            c["status"] = "warn"
            c["detail"] = "缺少公式表达式"
            c["score"] = 10
        elif metric.formula_expr:
            upper = metric.formula_expr.upper()
            for kw in ("DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "EXEC", "TRUNCATE"):
                if kw in upper:
                    c["status"] = "block"
                    c["detail"] = f"公式含高危关键字: {kw}"
                    c["score"] = 50
                    break
        return c

    def _check_sensitive(self, metric) -> dict:
        c = {"code": "sensitive_field", "status": "pass", "detail": "无敏感字段", "score": 0}
        if metric.related_fields:
            for f in metric.related_fields:
                if isinstance(f, dict) and f.get("is_sensitive"):
                    c["status"] = "block"
                    c["detail"] = f"含未脱敏敏感字段: {f.get('column_code', f.get('field', ''))}"
                    c["score"] = 30
                    return c  # 直接阻断，不可降级
        return c

    async def _check_consumers(self, metric_id: int) -> dict:
        c = {"code": "consumers", "status": "pass", "detail": "下游消费者 ≤ 3", "score": 0}
        try:
            from app.warehouse.models import AssetConsumer
            cnt = (await self.db.execute(
                select(func.count()).select_from(AssetConsumer).where(
                    AssetConsumer.asset_type == "metric",
                    AssetConsumer.asset_id == metric_id,
                )
            )).scalar() or 0
            if cnt > 10:
                c["status"] = "block"; c["detail"] = f"下游消费者 > 10: {cnt}，可能存在未知外部消费风险"; c["score"] = 30
            elif cnt > 3:
                c["status"] = "warn"; c["detail"] = f"下游消费者 4-10: {cnt}"; c["score"] = 10
            else:
                c["detail"] = f"下游消费者: {cnt}"
        except Exception:
            c["status"] = "warn"; c["detail"] = "无法检查下游消费者，保守按未知风险处理"; c["score"] = 15
        return c

    def _check_draft_status(self, metric) -> dict:
        c = {"code": "draft_status", "status": "pass", "detail": "指标已发布", "score": 0}
        if metric.status == "draft":
            c["status"] = "warn"; c["detail"] = "指标为草稿状态"; c["score"] = 5
        return c

    async def _check_small_sample(self, metric) -> dict:
        c = {"code": "small_sample", "status": "pass", "detail": "数据量充足", "score": 0}
        if not metric.related_dataset_id:
            return {"code": "small_sample", "status": "pass", "detail": "无数据集，跳过小样本检查", "score": 0}
        try:
            from app.datasets.models import DataSet
            ds = await self.db.get(DataSet, metric.related_dataset_id)
            if ds and ds.tables:
                tn = getattr(ds.tables[0], 'table_name', str(ds.tables[0]))
                import re
                if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', tn):
                    return {"code": "small_sample", "status": "warn", "detail": f"表名不合法: {tn}", "score": 5}
                r = await self.db.execute(sa_text(f'SELECT count(*) FROM "{tn}"'))
                count = r.scalar() or 0
                if count < 10:
                    # 含人员/组织/薪酬敏感维度
                    if self._has_sensitive_dimension(metric):
                        c["status"] = "block"; c["detail"] = f"小样本阻断(含敏感维度): {count} 行"; c["score"] = 40
                    else:
                        c["status"] = "warn"; c["detail"] = f"小样本(<10): {count} 行"; c["score"] = 15
                elif count < 30:
                    c["status"] = "warn"; c["detail"] = f"小样本(<30): {count} 行"; c["score"] = 8
        except Exception:
            c["status"] = "block"; c["detail"] = "无法检查样本量，保守阻断（无法确认=不可自动发布）"; c["score"] = 20
        return c

    def _has_sensitive_dimension(self, metric) -> bool:
        """判断是否含人员/组织/薪酬等敏感维度"""
        if metric.related_fields:
            for f in metric.related_fields:
                code = f.get("column_code", f.get("field", "")) if isinstance(f, dict) else str(f)
                code_lower = code.lower()
                for kw in ("employee", "emp_id", "salary", "cost", "org", "dept", "person", "wage"):
                    if kw in code_lower:
                        return True
        if metric.subject_area:
            sa = metric.subject_area.lower()
            for kw in ("薪酬", "成本", "组织", "人员", "salary", "cost", "org"):
                if kw in sa:
                    return True
        return False

    async def _check_recent_publish(self, metric_id: int) -> dict:
        c = {"code": "recent_publish", "status": "pass", "detail": "近 3 次受控发布成功", "score": 0}
        try:
            from app.warehouse.models import AutomationAuditEvent
            events = (await self.db.execute(
                select(AutomationAuditEvent).where(
                    AutomationAuditEvent.metric_id == metric_id,
                    AutomationAuditEvent.action.in_(["dws_published", "ads_published"]),
                ).order_by(AutomationAuditEvent.created_at.desc()).limit(3)
            )).scalars().all()
            fails = sum(1 for e in events if e.status == "failed")
            if len(events) < 3:
                c["status"] = "block"
                c["detail"] = f"近 3 次受控发布记录不足: 仅 {len(events)} 次，不允许进入低风险"
                c["score"] = 25
            elif fails > 0:
                c["status"] = "block"
                c["detail"] = f"近 3 次发布有 {fails} 次失败"
                c["score"] = 30
        except Exception:
            c["status"] = "block"
            c["detail"] = "无法检查发布历史，保守按高风险处理（无法确认=不可自动发布）"
            c["score"] = 25
        return c

    def _check_cross_subject(self, metric) -> dict:
        c = {"code": "cross_subject", "status": "pass", "detail": "同一主题域", "score": 0}
        # 当前指标只有一个 subject_area，默认为同主题域
        if not metric.subject_area:
            c["status"] = "warn"; c["detail"] = "未设置主题域"; c["score"] = 5
        return c

    def _check_field_stability(self, metric) -> dict:
        c = {"code": "field_stability", "status": "pass", "detail": "字段结构稳定", "score": 0}
        if not metric.related_fields:
            return c
        # 检查是否有历史字段变更记录
        for f in metric.related_fields:
            if isinstance(f, dict):
                if f.get("change_type") in ("removed", "type_changed"):
                    c["status"] = "block"
                    c["detail"] = f"字段变更风险: {f.get('column_code', '')} {f.get('change_type')}"
                    c["score"] = 30
                    break
                if f.get("change_type") == "added":
                    c["status"] = "warn"
                    c["detail"] = "检测到字段新增"
                    c["score"] = 5
        return c
