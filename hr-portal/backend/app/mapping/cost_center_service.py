"""成本中心 Mapping 周期服务。

业务生命周期在此层实现；MappingExecutor 仍只负责内存规则执行。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import uuid
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.mapping.cost_center_models import (
    CostCenterMappingPeriod,
    CostCenterMappingException,
    CostCenterMappingDiff,
    CostCenterMappingNotification,
)
from app.mapping.errors import MappingException, MappingErrorCode, conflict_error
from app.mapping.models import MappingPublishAudit, MappingRebuildRun
from app.mapping.service import MappingService


REVIEW_REQUIRED = "review_required"
VALID_DIFFS = {"added", "changed", "invalid", "inactive", "removed"}
NOTIFICATION_RETRY_DELAYS = (60, 300, 1800, 7200, 43200)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def build_cost_center_rule_document(
    *,
    period: str,
    source_asset: str = "cost_center_monthly",
    target_asset: str = "dwd_cost_center_monthly",
    reference_dataset: str = "cost_center_tree",
    overrides: dict[str, str] | None = None,
    code_field: str = "code",
    name_field: str = "name",
) -> dict[str, Any]:
    """构造稀疏成本中心规则文档；默认自映射不展开为 rows。

    ``code_field`` / ``name_field`` 必须使用 ODS/DWD 的真实物理字段。当前生产
    ``cost_center_monthly`` 契约为 ``code`` / ``name``；参数仅用于兼容经元数据
    注册的等价物理列，不创建平行规则正文或修改现有表结构。

    ``overrides`` 只来自已发布周期的异常表，绝不从 ODS 行或客户端文档读取。
    """
    return {
        "mappingSchemaVersion": 1,
        "ruleSet": {
            "id": f"cost-center-{period}",
            "name": f"成本中心 {period}",
            "sourceAsset": source_asset,
            "targetAsset": target_asset,
            "rules": [
                {
                    "id": "cost-center-identity",
                    "type": "identity_with_overrides",
                    "enabled": True,
                    "displayOrder": 0,
                    "sourceFields": [code_field],
                    "targetFields": [code_field],
                    "config": {
                        "defaultBehavior": "keep_source",
                        "overrides": dict(overrides or {}),
                        "unmatched": "keep",
                    },
                },
                {
                    "id": "cost-center-attributes",
                    "type": "reference_lookup",
                    "enabled": True,
                    "displayOrder": 1,
                    "sourceFields": [code_field],
                    "targetFields": [name_field],
                    "config": {
                        "referenceDatasetId": reference_dataset,
                        "matchRules": [
                            {
                                "id": "cost-center-code",
                                "priority": 1,
                                "sourceField": code_field,
                                "referenceField": "code",
                                "conditions": {},
                                "onMatch": "use_and_stop",
                            }
                        ],
                        "outputMap": {name_field: "name"},
                        "unmatched": "keep",
                    },
                },
            ],
        },
    }


def calculate_cost_center_diffs(previous: dict[str, dict[str, Any]], current: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """比较周期快照；默认映射不产生差异，只有目标变化才进入人工确认。"""
    diffs: list[dict[str, Any]] = []
    for code in sorted(set(previous) | set(current)):
        old = previous.get(code)
        new = current.get(code)
        if old is None:
            diff_type = "added"
        elif new is None:
            diff_type = "removed"
        elif new.get("active", True) is False:
            diff_type = "inactive"
        elif new != old:
            diff_type = "changed"
        else:
            continue
        if new is not None and not str(new.get("name", "")).strip():
            diff_type = "invalid"
        diffs.append({"source_code": code, "diff_type": diff_type, "previous_value": old, "current_value": new})
    return diffs


class CostCenterMappingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def initialize_period(self, *, period: str, source_snapshot: dict[str, dict[str, Any]], actor: str = "system") -> dict[str, Any]:
        if len(period) != 6 or not period.isdigit():
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心期间必须为 YYYYMM", http_status=422)
        existing = (await self.db.execute(select(CostCenterMappingPeriod).where(CostCenterMappingPeriod.period == period))).scalar_one_or_none()
        if existing:
            return await self.get_period(period=period)
        if not source_snapshot:
            source_snapshot = await self.load_source_snapshot(period=period)
        binding = await MappingService(self.db).get_or_create_binding(caller="warehouse", asset_id="cost_center_monthly", binding_key=f"period:{period}")
        row = CostCenterMappingPeriod(period=period, binding_id=binding.id, status="draft", version=0, expected_version=0, source_codes=sorted(source_snapshot), source_snapshot=source_snapshot, review_required=False)
        self.db.add(row)
        await self.db.flush()
        return await self.get_period(period=period)

    async def load_source_snapshot(self, *, period: str) -> dict[str, dict[str, Any]]:
        """从真实 ODS 物理表读取当前成本中心快照。

        期间列若存在则按 ``month`` 过滤；历史表没有期间列时仍读取当前全量快照。
        字段名固定使用生产契约 ``code`` / ``name``，状态沿用同步链路的“启用”语义。
        """
        columns = {
            row[0]
            for row in (
                await self.db.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_schema = current_schema() AND table_name = 'cost_center_monthly'"
                    )
                )
            ).all()
        }
        required = {"code", "name"}
        if not required <= columns:
            missing = ", ".join(sorted(required - columns))
            raise MappingException(
                MappingErrorCode.MAPPING_ASSET_FORBIDDEN,
                f"成本中心 ODS 缺少必需物理字段: {missing}",
                http_status=422,
            )
        where = " WHERE month = :period" if "month" in columns else ""
        query = text(
            'SELECT "code", "name", "status" '
            f'FROM "cost_center_monthly"{where} ORDER BY "code"'
        )
        params = {"period": period} if where else {}
        result = await self.db.execute(query, params)
        snapshot: dict[str, dict[str, Any]] = {}
        for code, name, status in result.all():
            if code is None:
                continue
            snapshot[str(code)] = {
                "name": name,
                "active": str(status or "").strip() == "启用",
            }
        return snapshot

    async def copy_previous_period(self, *, period: str, expected_version: int, source_snapshot: dict[str, dict[str, Any]], actor: str = "system") -> dict[str, Any]:
        current = await self._period(period, for_update=True)
        if current.expected_version != expected_version:
            raise conflict_error(f"版本冲突: 期望 {expected_version}, 实际 {current.expected_version}")
        if not source_snapshot:
            source_snapshot = await self.load_source_snapshot(period=period)
        previous = (
            await self.db.execute(
                select(CostCenterMappingPeriod)
                .where(
                    CostCenterMappingPeriod.period < period,
                    CostCenterMappingPeriod.status == "published",
                )
                .order_by(CostCenterMappingPeriod.period.desc())
            )
        ).scalars().first()
        previous_snapshot = (previous.source_snapshot or {}) if previous else {}
        current.source_snapshot = source_snapshot
        current.source_codes = sorted(source_snapshot)
        current.copied_from_period = previous.period if previous else None
        current.status = "draft"
        current.review_required = False
        current.version += 1
        current.expected_version = current.version
        await self.db.execute(delete(CostCenterMappingDiff).where(CostCenterMappingDiff.period_id == current.id))
        await self.db.execute(delete(CostCenterMappingException).where(CostCenterMappingException.period_id == current.id))
        if previous is not None:
            previous_exceptions = (
                await self.db.execute(
                    select(CostCenterMappingException).where(
                        CostCenterMappingException.period_id == previous.id,
                    )
                )
            ).scalars().all()
            for item in previous_exceptions:
                self.db.add(
                    CostCenterMappingException(
                        period_id=current.id,
                        source_code=item.source_code,
                        target_code=item.target_code,
                        attributes=item.attributes or {},
                        actor=actor,
                    )
                )
        for item in calculate_cost_center_diffs(previous_snapshot, source_snapshot):
            self.db.add(CostCenterMappingDiff(period_id=current.id, **item, status="pending"))
            current.review_required = True
        await self.db.flush()
        return await self.get_period(period=period)

    async def update_exception(self, *, period: str, source_code: str, target_code: str, expected_version: int, attributes: dict[str, Any] | None = None, actor: str = "system") -> dict[str, Any]:
        row = await self._period(period, for_update=True)
        if row.expected_version != expected_version:
            raise conflict_error(f"版本冲突: 期望 {expected_version}, 实际 {row.expected_version}")
        source_code = source_code.strip()
        target_code = target_code.strip()
        source_value = (row.source_snapshot or {}).get(source_code)
        if source_value is None:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, f"来源成本中心 {source_code} 不属于期间 {period}", http_status=422)
        if isinstance(source_value, dict) and source_value.get("active", True) is False:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, f"来源成本中心 {source_code} 已停用", http_status=422)
        from app.data.models import CostCenterNode
        target_node = (
            await self.db.execute(
                select(CostCenterNode).where(
                    CostCenterNode.code == target_code,
                    CostCenterNode.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if target_node is None:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, f"目标成本中心 {target_code} 不存在或已停用", http_status=422)
        item = (await self.db.execute(select(CostCenterMappingException).where(CostCenterMappingException.period_id == row.id, CostCenterMappingException.source_code == source_code))).scalar_one_or_none()
        if item is None:
            item = CostCenterMappingException(period_id=row.id, source_code=source_code, target_code=target_code, attributes=attributes or {}, actor=actor)
            self.db.add(item)
        else:
            item.target_code, item.attributes, item.actor = target_code, attributes or {}, actor
        row.version += 1
        row.expected_version = row.version
        row.status = "draft"
        await self.db.flush()
        return await self.get_period(period=period)

    async def confirm_diff(self, *, period: str, diff_id: int, expected_version: int, actor: str) -> dict[str, Any]:
        row = await self._period(period, for_update=True)
        if row.expected_version != expected_version:
            raise conflict_error(f"版本冲突: 期望 {expected_version}, 实际 {row.expected_version}")
        diff = await self.db.get(CostCenterMappingDiff, diff_id)
        if diff is None or diff.period_id != row.id:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心差异不存在", http_status=404)
        diff.status, diff.confirmed_by, diff.confirmed_at = "confirmed", actor, _now()
        row.version += 1
        row.expected_version = row.version
        row.review_required = await self._has_pending(row.id)
        await self.db.flush()
        return await self.get_period(period=period)

    async def publish_period(self, *, period: str, expected_version: int, actor: str = "system") -> dict[str, Any]:
        row = await self._period(period, for_update=True)
        if row.expected_version != expected_version:
            raise conflict_error(f"版本冲突: 期望 {expected_version}, 实际 {row.expected_version}")
        if row.review_required or await self._has_pending(row.id):
            row.review_required = True
            await self.db.flush()
            return {"status": REVIEW_REQUIRED, "period": period, "version": row.version, "reason": "unconfirmed_cost_center_diffs"}

        new_version = row.version + 1
        event_id = str(uuid.uuid4())
        audit = MappingPublishAudit(
            binding_id=row.binding_id,
            event_id=event_id,
            idempotency_key=f"cost-center-publish:{row.id}:{new_version}",
            event_type="cost_center_mapping_published",
            mapping_version=new_version,
            schema_hash="",
            rebuild_policy="manual",
            actor=actor,
            payload={"period": period, "exception_count": await self._exception_count(row.id)},
            occurred_at=_now(),
        )
        self.db.add(audit)
        await self.db.flush()
        notification_key = f"publish:{period}:{new_version}"
        notification = await self.ensure_notification(
            period=period,
            notification_key=notification_key,
            event_id=event_id,
        )
        rebuild = MappingRebuildRun(
            binding_id=row.binding_id,
            audit_id=audit.id,
            event_id=event_id,
            mapping_version=new_version,
            status="pending",
            target_type="dwd",
            target_id="dwd_cost_center_monthly",
            started_at=None,
        )
        self.db.add(rebuild)
        await self.db.flush()
        from app.ucp.outbox_service import enqueue_event
        await enqueue_event(
            self.db,
            topic="mapping_published",
            dedup_key=f"cost-center:{row.binding_id}:{new_version}:{period}:dwd_cost_center_monthly",
            payload={
                "event_id": event_id,
                "event_type": "cost_center_mapping_published",
                "period": period,
                "period_id": row.id,
                "binding_id": row.binding_id,
                "mapping_version": new_version,
                "audit_id": audit.id,
                "rebuild_run_id": rebuild.id,
                "notification_id": notification.get("id"),
                "target_type": "dwd",
                "target_id": "dwd_cost_center_monthly",
                "actor": actor,
            },
        )

        row.status, row.published_by, row.published_at = "published", actor, _now()
        row.version = new_version
        row.expected_version = new_version
        row.publish_audit_id = audit.id
        row.rebuild_run_id = rebuild.id
        row.rebuild_status = "pending"
        row.notification_status = "not_started"
        await self.db.flush()
        return {
            "status": "published",
            "period": period,
            "version": row.version,
            "binding_id": row.binding_id,
            "event_id": event_id,
            "audit_id": audit.id,
            "rebuild_run_id": rebuild.id,
            "rebuild_status": row.rebuild_status,
            "notification_status": row.notification_status,
            "notification_id": notification.get("id"),
            "notification_key": notification_key,
        }

    async def ensure_dwd_allowed(self, *, period: str) -> dict[str, Any]:
        row = await self._period(period)
        if row.status != "published" or row.review_required:
            return {"status": REVIEW_REQUIRED, "period": period, "version": row.version, "binding_id": row.binding_id, "reason": "cost_center_mapping_not_published"}
        return {"status": "allowed", "period": period, "version": row.version, "binding_id": row.binding_id}

    async def get_published_execution_context(self, *, period: str) -> dict[str, Any]:
        """返回已发布期间供 DWD 执行使用的稀疏规则和参考快照。"""
        gate = await self.ensure_dwd_allowed(period=period)
        if gate["status"] != "allowed":
            return gate
        row = await self._period(period)
        exceptions = (
            await self.db.execute(
                select(CostCenterMappingException)
                .where(CostCenterMappingException.period_id == row.id)
                .order_by(CostCenterMappingException.id)
            )
        ).scalars().all()
        overrides = {item.source_code: item.target_code for item in exceptions}
        from app.data.models import CostCenterNode

        nodes = (
            await self.db.execute(
                select(CostCenterNode).where(CostCenterNode.is_active.is_(True)).order_by(CostCenterNode.code)
            )
        ).scalars().all()
        reference_rows = [
            {
                "code": node.code,
                "name": node.name,
            }
            for node in nodes
        ]
        return {
            **gate,
            "rule_document": build_cost_center_rule_document(
                period=period,
                overrides=overrides,
            ),
            "overrides": overrides,
            "reference_datasets": {"cost_center_tree": reference_rows},
        }

    async def mark_rebuild_result(
        self,
        *,
        period: str,
        success: bool,
        error: str | None = None,
        event_id: str | None = None,
        mapping_version: int | None = None,
        target_id: str | None = None,
    ) -> dict[str, Any]:
        row = await self._period(period, for_update=True)
        if row.rebuild_run_id is None:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心周期没有待执行的 DWD 重算", http_status=409)
        run = await self.db.get(MappingRebuildRun, row.rebuild_run_id)
        if run is None:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心 DWD 重算记录不存在", http_status=404)
        if event_id is not None and run.event_id != event_id:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心 DWD 重算事件不匹配", http_status=409)
        if mapping_version is not None and run.mapping_version != mapping_version:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心 DWD 重算版本不匹配", http_status=409)
        if target_id is not None and run.target_id != target_id:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心 DWD 重算目标不匹配", http_status=409)
        now = _now()
        run.started_at = run.started_at or now
        run.completed_at = now
        run.status = "success" if success else "failed"
        run.error_message = None if success else (error or "cost_center_rebuild_failed")[:500]
        row.rebuild_status = run.status
        await self.db.flush()
        return {"status": run.status, "run_id": run.id, "period": period}

    async def ensure_notification(self, *, period: str, notification_key: str, event_id: str | None = None) -> dict[str, Any]:
        row = await self._period(period, for_update=True)
        item = (await self.db.execute(select(CostCenterMappingNotification).where(CostCenterMappingNotification.period_id == row.id, CostCenterMappingNotification.notification_key == notification_key))).scalar_one_or_none()
        if item:
            return {
                "status": "already_exists",
                "id": item.id,
                "notification_key": notification_key,
                "delivery_status": item.status,
                "retry_count": item.retry_count,
            }
        item = CostCenterMappingNotification(
            period_id=row.id,
            notification_key=notification_key,
            event_id=event_id,
            status="pending",
        )
        # 周期行锁负责同一 period 内的顺序；唯一约束 + savepoint 负责跨
        # 连接并发下的最终幂等边界，捕获后可安全继续提交外层事务。
        try:
            async with self.db.begin_nested():
                self.db.add(item)
                await self.db.flush()
        except IntegrityError as exc:
            if "uq_cost_center_mapping_notification" not in str(exc) and getattr(
                getattr(exc, "orig", None), "diag", None
            ) is None:
                raise
            existing = (
                await self.db.execute(
                    select(CostCenterMappingNotification).where(
                        CostCenterMappingNotification.period_id == row.id,
                        CostCenterMappingNotification.notification_key == notification_key,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                raise
            return {
                "status": "already_exists",
                "id": existing.id,
                "notification_key": notification_key,
                "delivery_status": existing.status,
                "retry_count": existing.retry_count,
            }
        row.notification_status = "pending"
        await self.db.flush()
        return {"status": "pending", "id": item.id, "notification_key": notification_key, "retry_count": 0}

    async def mark_notification_sent(self, *, period: str, notification_id: int) -> dict[str, Any]:
        row = await self._period(period, for_update=True)
        item = await self.db.get(CostCenterMappingNotification, notification_id)
        if item is None or item.period_id != row.id:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心通知不存在", http_status=404)
        item.status = "sent"
        item.sent_at = _now()
        item.dispatch_started_at = None
        item.last_error = None
        item.next_retry_at = None
        item.exhausted_at = None
        row.notification_status = "sent"
        await self.db.flush()
        return {"status": "sent", "id": item.id, "retry_count": item.retry_count}

    async def mark_notification_failed(self, *, period: str, notification_id: int, error: str) -> dict[str, Any]:
        row = await self._period(period, for_update=True)
        item = await self.db.get(CostCenterMappingNotification, notification_id)
        if item is None or item.period_id != row.id:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心通知不存在", http_status=404)
        item.retry_count += 1
        item.dispatch_started_at = None
        item.last_error = error[:500]
        if item.retry_count >= len(NOTIFICATION_RETRY_DELAYS):
            item.status = "exhausted"
            item.exhausted_at = _now()
            item.next_retry_at = None
            row.notification_status = "exhausted"
        else:
            item.status = "retrying"
            item.next_retry_at = _now() + timedelta(seconds=NOTIFICATION_RETRY_DELAYS[item.retry_count - 1])
            row.notification_status = "retrying"
        await self.db.flush()
        return {
            "status": item.status,
            "id": item.id,
            "retry_count": item.retry_count,
            "next_retry_at": item.next_retry_at.isoformat() if item.next_retry_at else None,
        }

    async def retry_notification(self, *, period: str, notification_id: int) -> dict[str, Any]:
        row = await self._period(period, for_update=True)
        item = await self.db.get(CostCenterMappingNotification, notification_id)
        if item is None or item.period_id != row.id:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, "成本中心通知不存在", http_status=404)
        if item.status not in {"retrying", "exhausted"}:
            return {"status": item.status, "id": item.id, "retry_count": item.retry_count}
        item.status = "pending"
        item.dispatch_started_at = None
        item.next_retry_at = None
        item.exhausted_at = None
        row.notification_status = "pending"
        await self.db.flush()
        return {"status": "pending", "id": item.id, "retry_count": item.retry_count}

    async def recover_stale_notifications(self, *, lease_seconds: int = 900) -> int:
        cutoff = _now() - timedelta(seconds=lease_seconds)
        items = (
            await self.db.execute(
                select(CostCenterMappingNotification)
                .where(
                    CostCenterMappingNotification.status == "dispatching",
                    CostCenterMappingNotification.dispatch_started_at <= cutoff,
                )
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        for item in items:
            item.status = "retrying"
            item.dispatch_started_at = None
            item.last_error = "notification_dispatch_lease_expired"
            item.next_retry_at = _now()
        await self.db.flush()
        return len(items)

    async def get_period(self, *, period: str) -> dict[str, Any]:
        row = await self._period(period)
        exceptions = (await self.db.execute(select(CostCenterMappingException).where(CostCenterMappingException.period_id == row.id))).scalars().all()
        diffs = (await self.db.execute(select(CostCenterMappingDiff).where(CostCenterMappingDiff.period_id == row.id))).scalars().all()
        notifications = (await self.db.execute(select(CostCenterMappingNotification).where(CostCenterMappingNotification.period_id == row.id))).scalars().all()
        return {
            "id": row.id,
            "period": row.period,
            "status": row.status,
            "version": row.version,
            "expectedVersion": row.expected_version,
            "bindingId": row.binding_id,
            "copiedFromPeriod": row.copied_from_period,
            "reviewRequired": row.review_required,
            "publishAuditId": row.publish_audit_id,
            "rebuildRunId": row.rebuild_run_id,
            "rebuildStatus": row.rebuild_status,
            "notificationStatus": row.notification_status,
            "sourceCount": len(row.source_codes or []),
            "exceptionCount": len(exceptions),
            "pendingDiffCount": sum(1 for item in diffs if item.status == "pending"),
            "exceptions": [{"sourceCode": item.source_code, "targetCode": item.target_code, "attributes": item.attributes} for item in exceptions],
            "diffs": [{"id": item.id, "sourceCode": item.source_code, "diffType": item.diff_type, "status": item.status, "previousValue": item.previous_value, "currentValue": item.current_value} for item in diffs],
            "notifications": [{"id": item.id, "notificationKey": item.notification_key, "status": item.status, "retryCount": item.retry_count, "lastError": item.last_error} for item in notifications],
        }

    async def _period(self, period: str, *, for_update: bool = False) -> CostCenterMappingPeriod:
        statement = select(CostCenterMappingPeriod).where(CostCenterMappingPeriod.period == period)
        if for_update:
            statement = statement.with_for_update()
        row = (await self.db.execute(statement)).scalar_one_or_none()
        if row is None:
            raise MappingException(MappingErrorCode.MAPPING_ASSET_FORBIDDEN, f"成本中心期间 {period} 不存在", http_status=404)
        return row

    async def _has_pending(self, period_id: int) -> bool:
        return (await self.db.execute(select(CostCenterMappingDiff.id).where(CostCenterMappingDiff.period_id == period_id, CostCenterMappingDiff.status == "pending"))).first() is not None

    async def _exception_count(self, period_id: int) -> int:
        return len((await self.db.execute(select(CostCenterMappingException.id).where(CostCenterMappingException.period_id == period_id))).all())
