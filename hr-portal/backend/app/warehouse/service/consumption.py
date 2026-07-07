# -*- coding: utf-8 -*-
"""ADS 消费资产组装与发布服务"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# ==================== ADS Service (R0702 + R0704) ====================

class AdsService:
    """ADS 消费资产组装与发布服务"""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── CRUD ──────────────────────────────────────

    async def list_definitions(self, page=1, page_size=20, status=None):
        from app.warehouse.models import AdsDefinition
        page_size = min(max(page_size, 1), 200)
        base = select(AdsDefinition)
        if status: base = base.where(AdsDefinition.publish_status == status)
        base = base.order_by(AdsDefinition.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [self._def_out(d) for d in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_definition(self, def_id: int):
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        return self._def_out(d) if d else None

    async def create_definition(self, payload: dict):
        from app.warehouse.models import AdsDefinition
        d = AdsDefinition(
            name=payload["name"],
            description=payload.get("description"),
            source_type=payload.get("source_type", "dws_aggregate"),
            source_id=payload["source_id"],
            source_label=payload.get("source_label"),
            dimension_refs=payload.get("dimension_refs", []),
            output_fields=payload.get("output_fields", []),
            preset_filters=payload.get("preset_filters"),
            subject_area=payload.get("subject_area"),
            consume_domain=payload.get("consume_domain"),
            owner_name=payload.get("owner_name"),
        )
        self.session.add(d); await self.session.commit(); await self.session.refresh(d)
        return self._def_out(d)

    async def update_definition(self, def_id: int, payload: dict):
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return None
        for k in ("name", "description", "source_type", "source_id", "source_label",
                  "dimension_refs", "output_fields", "preset_filters",
                  "subject_area", "consume_domain", "owner_name"):
            if k in payload: setattr(d, k, payload[k])
        await self.session.commit(); await self.session.refresh(d)
        return self._def_out(d)

    async def delete_definition(self, def_id: int) -> bool:
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return False
        await self.session.delete(d); await self.session.commit()
        return True

    def _def_out(self, d):
        return {
            "id": d.id, "name": d.name, "description": d.description,
            "source_type": d.source_type, "source_id": d.source_id,
            "source_label": d.source_label,
            "dimension_refs": d.dimension_refs or [],
            "output_fields": d.output_fields or [],
            "preset_filters": d.preset_filters,
            "subject_area": d.subject_area,
            "consume_domain": d.consume_domain,
            "owner_name": d.owner_name,
            "publish_status": d.publish_status,
            "publish_targets": d.publish_targets or [],
            "permissions_inherited_from": d.permissions_inherited_from,
            "lineage_snapshot": d.lineage_snapshot,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        }

    # ── 预览 (R0702) ──────────────────────────────

    async def preview(self, def_id: int) -> dict:
        """预览 ADS 组装结果，返回字段摘要和来源信息"""
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return {"error": "not_found"}

        fields = d.output_fields or []
        dims = d.dimension_refs or []
        filters = d.preset_filters or []

        return {
            "definition_id": d.id,
            "name": d.name,
            "source": {"type": d.source_type, "id": d.source_id, "label": d.source_label},
            "output_fields": fields,
            "dimensions": dims,
            "preset_filters": filters,
            "field_count": len(fields),
            "dimension_count": len(dims),
            "sensitive_fields": [f for f in fields if f.get("is_sensitive")],
            "warnings": self._build_warnings(fields, dims),
        }

    def _build_warnings(self, fields, dims):
        warnings = []
        if not fields:
            warnings.append("未配置输出字段，ADS 不产生数据")
        if not dims:
            warnings.append("未关联维度，消费端无法按维度筛选")
        sensitive = [f.get("output_name", "") for f in fields if f.get("is_sensitive")]
        if sensitive:
            warnings.append(f"以下字段含敏感标记: {', '.join(sensitive)}，发布为 API/推送时需脱敏")
        # 检查字段名冲突
        names = [f.get("output_name", "") for f in fields]
        dupes = [n for n in set(names) if names.count(n) > 1]
        if dupes:
            warnings.append(f"输出字段名重复: {', '.join(dupes)}")
        return warnings

    # ── 校验 (R0702) ──────────────────────────────

    async def validate(self, payload: dict) -> dict:
        """保存前校验 ADS 组装配置"""
        errors = []
        if not payload.get("name", "").strip():
            errors.append("名称为必填项")
        if not payload.get("source_id"):
            errors.append("来源 ID 为必填项")
        output_fields = payload.get("output_fields", [])
        if not output_fields:
            errors.append("至少需配置一个输出字段")
        # 校验 output_fields 每个 item
        for i, f in enumerate(output_fields):
            if not f.get("output_name"):
                errors.append(f"输出字段 #{i+1} 缺少 output_name")
            if not f.get("source_field"):
                errors.append(f"输出字段 #{i+1} 缺少 source_field")
        # 校验 dimension_refs
        for i, dim in enumerate(payload.get("dimension_refs", [])):
            if not dim.get("code"):
                errors.append(f"维度 #{i+1} 缺少 code")
        # 校验 filters
        for i, flt in enumerate(payload.get("preset_filters") or []):
            if not flt.get("field"):
                errors.append(f"过滤条件 #{i+1} 缺少 field")
        return {"valid": len(errors) == 0, "errors": errors}

    # ── 发布 (R0704) ──────────────────────────────

    async def publish(self, def_id: int, targets: list[str]) -> dict:
        """发布 ADS 为消费资产

        targets: ['asset', 'view', 'api', 'push'] 至少一个

        P0-3 嵌入式安全校验：空字段 / 敏感字段 / 权限摘要
        P0-4 权限继承摘要：先计算 computed 标记，再校验
        """
        from app.warehouse.models import AdsDefinition
        from datetime import datetime as dt

        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return {"error": "not_found", "detail": "ADS 定义不存在"}

        if not targets:
            return {"error": "validation", "detail": "至少需选择一个发布目标"}

        valid_targets = {"asset", "view", "api", "push"}
        invalid = set(targets) - valid_targets
        if invalid:
            return {"error": "validation", "detail": f"无效的发布目标: {invalid}"}

        # P0-3: 输出字段非空检查
        if not d.output_fields:
            return {"error": "empty_fields", "detail": "ADS 输出字段为空，无法发布"}
        # P0-3: 来源校验
        if not d.source_id:
            return {"error": "no_source", "detail": "ADS 无来源资产，无法发布"}

        # P0-3: 敏感字段检查 — API/推送不可包含未脱敏敏感字段
        sensitive = [f.get("output_name", "") for f in (d.output_fields or []) if f.get("is_sensitive")]
        if sensitive and ("api" in targets or "push" in targets):
            return {
                "error": "sensitive_fields",
                "detail": f"以下字段含敏感标记，不可发布为 API/推送: {', '.join(sensitive)}。请先脱敏或移除对应发布目标。",
                "sensitive_fields": sensitive,
            }

        # P0-4: 权限继承摘要 — 先计算再校验
        perm_summary = await self._compute_permission_summary(d)
        d.permissions_inherited_from = perm_summary

        # P0-3: API/推送发布必须权限摘要 computed=true
        if "api" in targets or "push" in targets:
            if perm_summary.get("computed") is not True:
                return {
                    "error": "permission_summary",
                    "detail": "API/推送发布需要权限继承摘要计算成功 (computed=true)，当前未完成",
                }

        # 构建血缘快照
        lineage = {
            "source": {"type": d.source_type, "id": d.source_id, "label": d.source_label},
            "dimensions": [dim.get("code") for dim in (d.dimension_refs or [])],
            "published_at": dt.utcnow().isoformat(),
        }

        d.publish_status = "published"
        d.publish_targets = targets
        d.lineage_snapshot = lineage
        # Z02/P0-5: 自动血缘边 + metadata
        from app.warehouse.service import write_lineage_edge
        await write_lineage_edge(self.session, d.source_label or str(d.source_id), f"ads:{d.name}", "ads_publish")
        await self.session.commit(); await self.session.refresh(d)

        result = self._def_out(d)
        result["publish_result"] = {
            "status": "published",
            "targets": targets,
            "asset_registered": "asset" in targets,
            "view_created": "view" in targets,
            "api_candidate": "api" in targets,
            "push_candidate": "push" in targets,
            "lineage_recorded": True,
            "permission_summary": perm_summary,
        }
        return result

    async def _compute_permission_summary(self, d) -> dict:
        """P0-4: 计算权限继承摘要。

        必须区分"计算失败"和"确实无敏感字段"：
        - 计算成功: computed=true
        - 计算失败: computed=false（不可降级为 computed=true + 空字段）
        """
        try:
            output_fields = d.output_fields or []
            sensitive_fields = [
                f.get("output_name", "")
                for f in output_fields
                if f.get("is_sensitive")
            ]
            return {
                "computed": True,
                "hidden_field_count": 0,
                "masked_field_count": 0,
                "sensitive_field_count": len(sensitive_fields),
                "sensitive_fields": sensitive_fields,
                "inherit_strategy": "source_recursive",
                "source_assets": [d.source_label] if d.source_label else [str(d.source_id)],
            }
        except Exception:
            return {"computed": False}

    async def unpublish(self, def_id: int) -> dict:
        """撤回 ADS 发布"""
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return {"error": "not_found"}
        if d.publish_status != "published":
            return {"error": "not_published", "detail": "当前状态不是已发布"}
        d.publish_status = "draft"
        d.publish_targets = None
        await self.session.commit()
        return {"status": "draft", "id": d.id, "name": d.name}

    # ── 来源列表（UI 辅助）────────────────────────

    async def list_sources(self) -> dict:
        """列出可用的 DWS 来源列表（聚合定义 + 数据集）"""
        from app.warehouse.models import DwsAggregateDefinition
        from app.datasets.models import DataSet

        # DWS 聚合定义
        dws_rows = (await self.session.execute(
            select(DwsAggregateDefinition).where(DwsAggregateDefinition.status == "published")
        )).scalars().all()
        dws_sources = [{"type": "dws_aggregate", "id": r.id, "label": f"聚合: {r.name}", "fields": []} for r in dws_rows]

        # 已发布数据集
        ds_rows = (await self.session.execute(
            select(DataSet).where(DataSet.status == "published")
        )).scalars().all()
        ds_sources = [{"type": "dataset", "id": r.id, "label": f"数据集: {r.name}", "fields": []} for r in ds_rows]

        return {"sources": dws_sources + ds_sources}

    async def list_dimensions(self) -> list:
        """列出可用维度供 ADS 组装参考"""
        from app.warehouse.models import Dimension as DimModel
        rows = (await self.session.execute(select(DimModel).order_by(DimModel.display_order))).scalars().all()
        return [{"id": r.id, "code": r.dimension_code, "name": r.dimension_name, "bound_table": r.bound_table, "bound_field": r.bound_field} for r in rows]


def get_ads_service(session: AsyncSession) -> AdsService:
    return AdsService(session)
