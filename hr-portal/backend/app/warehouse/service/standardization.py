# -*- coding: utf-8 -*-
"""标准化规则 + 模板服务"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# ==================== 标准化规则 (R01) ====================

STANDARDIZATION_RULE_TYPES = ("rename", "type_convert", "value_map", "unit_convert", "split_merge", "deduplicate", "null_handling", "format_standardize")


class StandardizationRuleService:
    """ODS→DWD 标准化规则 CRUD + 预览 + 执行 + DWD 视图生成"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def _get_layer(self, table_name: str) -> str | None:
        from app.data.models import RegisteredTable
        r = await self.session.scalar(select(RegisteredTable).where(RegisteredTable.table_name == table_name))
        return r.warehouse_layer if r else None

    async def list_rules(self, *, page=1, page_size=20, asset_type=None, asset_code=None, rule_type=None, enabled=None):
        from app.warehouse.models import StandardizationRule
        page_size = min(max(page_size, 1), 200)
        base = select(StandardizationRule)
        if asset_type: base = base.where(StandardizationRule.asset_type == asset_type)
        if asset_code: base = base.where(StandardizationRule.asset_code == asset_code)
        if rule_type: base = base.where(StandardizationRule.rule_type == rule_type)
        if enabled is not None: base = base.where(StandardizationRule.enabled == enabled)
        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()
        offset = (page - 1) * page_size
        rows = (await self.session.execute(base.order_by(StandardizationRule.display_order, StandardizationRule.id).offset(offset).limit(page_size))).scalars().all()
        return {"total": total, "page": page, "page_size": page_size, "items": [{"id": r.id, "asset_type": r.asset_type, "asset_code": r.asset_code, "rule_type": r.rule_type, "source_field": r.source_field, "target_field": r.target_field, "rule_config": r.rule_config, "enabled": r.enabled, "display_order": r.display_order, "description": r.description, "created_at": r.created_at.isoformat() if r.created_at else None, "updated_at": r.updated_at.isoformat() if r.updated_at else None} for r in rows]}

    async def get_rule(self, rule_id: int):
        from app.warehouse.models import StandardizationRule
        return await self.session.get(StandardizationRule, rule_id)

    async def create_rule(self, payload: dict):
        from app.warehouse.models import StandardizationRule
        if payload.get("rule_type") not in STANDARDIZATION_RULE_TYPES:
            raise ValueError(f"非法 rule_type: {payload.get('rule_type')}")
        rule = StandardizationRule(**{k: v for k, v in payload.items() if k in ("asset_type", "asset_code", "rule_type", "source_field", "target_field", "rule_config", "enabled", "display_order", "description")})
        self.session.add(rule); await self.session.commit(); await self.session.refresh(rule)
        return rule

    async def update_rule(self, rule_id: int, payload: dict):
        from app.warehouse.models import StandardizationRule
        rule = await self.session.get(StandardizationRule, rule_id)
        if rule is None: return None
        allowed = {"source_field", "target_field", "rule_config", "enabled", "display_order", "description"}
        for k, v in payload.items():
            if k in allowed: setattr(rule, k, v)
        await self.session.commit(); await self.session.refresh(rule)
        return rule

    async def set_enabled(self, rule_id: int, enabled: bool):
        from app.warehouse.models import StandardizationRule
        rule = await self.session.get(StandardizationRule, rule_id)
        if rule is None: return None
        rule.enabled = enabled; await self.session.commit(); await self.session.refresh(rule)
        return rule

    async def delete_rule(self, rule_id: int) -> bool:
        from app.warehouse.models import StandardizationRule
        rule = await self.session.get(StandardizationRule, rule_id)
        if rule is None: return False
        await self.session.delete(rule); await self.session.commit()
        return True

    async def preview(self, *, asset_code: str, rules: list, sample_size: int = 20):
        """预览标准化规则效果（采样）"""
        from app.warehouse.models import StandardizationRule
        from app.warehouse.standardization_engine import execute_rules
        from sqlalchemy import text as sa_text
        try:
            result = await self.session.execute(sa_text(f"SELECT * FROM `{asset_code}` LIMIT {sample_size}"))
            rows_raw = result.fetchall()
            if not rows_raw: return {"error": "empty"}
            cols = list(result.keys())
            rows = [dict(zip(cols, row)) for row in rows_raw]
            rule_objs = []
            for r in rules:
                if r.get("id"):
                    existing = await self.session.get(StandardizationRule, r["id"])
                    if existing: rule_objs.append(existing)
                else:
                    rule_objs.append(StandardizationRule(**r))
            transformed = execute_rules(rule_objs, rows)
            return {"columns": list(transformed[0].keys()) if transformed else cols, "items": rows, "preview_items": transformed}
        except Exception as e:
            return {"error": str(e)}

    async def execute_full(self, *, asset_code: str, target_table: str) -> dict:
        """全量执行 ODS→DWD 标准化并写入目标物理表。"""
        from app.warehouse.models import StandardizationRule
        from app.warehouse.standardization_engine import execute_rules
        from app.data.models import RegisteredTable, TableColumn
        from sqlalchemy import text as sa_text, delete as sa_delete
        q = select(StandardizationRule).where(StandardizationRule.asset_code == asset_code, StandardizationRule.enabled == True).order_by(StandardizationRule.display_order)
        rules = (await self.session.execute(q)).scalars().all()
        if not rules: return {"error": "no_rules", "detail": f"表 {asset_code} 没有启用的标准化规则"}
        try:
            result = await self.session.execute(sa_text(f"SELECT * FROM `{asset_code}`"))
            rows_raw = result.fetchall()
            if not rows_raw: return {"error": "empty", "detail": "ODS 表无数据", "total": 0, "success": 0, "failed": 0, "errors": [], "target_table": target_table}
            cols = list(result.keys())
            rows = [dict(zip(cols, row)) for row in rows_raw]
        except Exception as e: return {"error": "read_failed", "detail": str(e)}
        total = len(rows)
        try: transformed = execute_rules(rules, rows)
        except Exception as e: return {"error": "transform_failed", "detail": str(e), "total": total, "success": 0, "failed": total, "errors": []}
        success = len(transformed); failed = total - success
        if not target_table: return {"error": "no_target", "detail": "未指定目标表名"}
        target = target_table.strip().replace("`", "")
        try:
            # P0-1: DDL 安全校验 — DROP+CREATE = REPLACE 语义
            from app.warehouse.layer_policy import validate_ddl_operation, validate_layer_transition, DDL_REPLACE, DDL_CREATE
            validate_layer_transition("ODS", "DWD", "standardize")
            existing = await self._get_layer(target)
            if existing is not None:
                await validate_ddl_operation(self.session, target, DDL_REPLACE)
            else:
                await validate_ddl_operation(self.session, target, DDL_CREATE, target_layer="DWD")
            await self.session.execute(sa_text(f"DROP TABLE IF EXISTS `{target}`"))
            if transformed:
                sample = transformed[0]
                col_defs = []
                for k, v in sample.items():
                    ctype = "BOOLEAN" if isinstance(v, bool) else "BIGINT" if isinstance(v, int) else "DOUBLE PRECISION" if isinstance(v, float) else "TEXT"
                    col_defs.append(f"`{k}` {ctype}")
                await self.session.execute(sa_text(f"CREATE TABLE `{target}` ({', '.join(col_defs)})"))
                batch_size = 1000
                for bs in range(0, len(transformed), batch_size):
                    batch = transformed[bs:bs + batch_size]
                    bcols = list(batch[0].keys())
                    placeholders = ", ".join([f"({', '.join([f':{c}_{i}' for c in bcols])})" for i in range(len(batch))])
                    params = {}
                    for i, row in enumerate(batch):
                        for c in bcols: params[f"{c}_{i}"] = row.get(c)
                    await self.session.execute(sa_text(f"INSERT INTO `{target}` ({', '.join([f'`{c}`' for c in bcols])}) VALUES {placeholders}"), params)
            await self.session.commit()
        except Exception as e: return {"error": "write_failed", "detail": str(e), "total": total, "success": 0, "failed": total, "errors": []}
        # Fix4: 注册 DWD 目标表 — 独立 try，失败不影响已写入的数据
        reg_error = None
        try:
            existing_rt = (await self.session.execute(
                select(RegisteredTable).where(RegisteredTable.table_name == target)
            )).scalars().first()
            if existing_rt is not None:
                existing_rt.warehouse_layer = "DWD"
            else:
                self.session.add(RegisteredTable(table_name=target, table_label=target, warehouse_layer="DWD", source_system="数据加工", asset_status="published"))
            await self.session.flush()
            await self.session.execute(sa_delete(TableColumn).where(TableColumn.table_name == target))
            seen = set()
            for i, r in enumerate(rules):
                tgt = r.target_field or r.source_field
                if tgt in seen: continue
                seen.add(tgt)
                self.session.add(TableColumn(table_name=target, column_name=tgt, column_code=tgt, column_label=tgt, data_type="string", is_visible=True, display_order=(i + 1) * 10))
            await self.session.commit()
        except Exception as exc:
            reg_error = str(exc)[:500]
            await self.session.rollback()
        # Z02: 自动血缘边
        from app.warehouse.service import write_lineage_edge
        rule_ids = [r.id for r in rules]
        await write_lineage_edge(self.session, asset_code, target, "standardize", metadata={
            "definition_id": None, "rule_ids": rule_ids, "version": 1,
        })
        # P0-3: 空结果警告
        result = {"total": total, "success": success, "failed": failed, "errors": [], "target_table": target}
        if success == 0:
            result["warning"] = "标准化结果为空（0 行），请检查源数据和规则配置"
        if reg_error:
            result["reg_warning"] = f"资产注册失败: {reg_error}"
        return result

    async def generate_dwd_view(self, *, asset_code: str, asset_type: str = "table", owner_user_id=None, owner_name=None) -> dict:
        """基于规则生成 DWD 视图（更新已有单表数据集，避免重复建）"""
        from app.warehouse.models import StandardizationRule
        from app.datasets.models import DataSet, DataSetTable, DatasetOutputField
        from app.data.models import TableColumn
        from app.warehouse.standardization_engine import RULE_ORDER
        q = select(StandardizationRule).where(StandardizationRule.asset_code == asset_code, StandardizationRule.enabled == True).order_by(StandardizationRule.display_order)
        rules = (await self.session.execute(q)).scalars().all()
        if not rules: return None
        from app.datasets.single_table import find_single_table_dataset, ensure_single_table_dataset
        ds = await find_single_table_dataset(asset_code, self.session)
        if ds is None: ds = await ensure_single_table_dataset(asset_code, self.session)
        ds.warehouse_layer = "DWD"; ds.status = "published"; ds.version = (ds.version or 1) + 1
        from sqlalchemy import delete as sa_delete
        await self.session.execute(sa_delete(DatasetOutputField).where(DatasetOutputField.dataset_id == ds.id))
        # Generate output fields from rules
        rule_by_source = {}
        for r in rules:
            rule_by_source.setdefault(r.source_field, []).append(r)
        output_fields = []
        for i, r in enumerate(rules):
            target_col = r.target_field or r.source_field
            output_fields.append({"source_alias": "t", "source_column": r.source_field, "output_code": target_col, "output_label": r.description or target_col, "data_type": "string", "agg_role": "dimension"})
        for i, of in enumerate(output_fields):
            self.session.add(DatasetOutputField(dataset_id=ds.id, source_alias=of["source_alias"], source_column=of["source_column"], output_code=of["output_code"], output_label=of["output_label"], data_type=of["data_type"], agg_role=of["agg_role"], description="", display_order=i))
        await self.session.commit(); await self.session.refresh(ds)
        return {"dataset_id": ds.id, "view_name": ds.name, "version": ds.version}


def get_standardization_rule_service(session: AsyncSession) -> StandardizationRuleService:
    return StandardizationRuleService(session)


# ==================== 标准化模板 (R0106) ====================

class StandardizationTemplateService:
    """标准化模板 CRUD + 加载到表"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_templates(self, *, page=1, page_size=20, business_object=None):
        from app.warehouse.models import StandardizationTemplate
        page_size = min(max(page_size, 1), 200)
        base = select(StandardizationTemplate)
        if business_object: base = base.where(StandardizationTemplate.business_object == business_object)
        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()
        offset = (page - 1) * page_size
        rows = (await self.session.execute(base.order_by(StandardizationTemplate.id.desc()).offset(offset).limit(page_size))).scalars().all()
        items = [{"id": t.id, "name": t.name, "description": t.description, "business_object": t.business_object, "template_rules": t.template_rules, "version": t.version, "created_at": t.created_at.isoformat() if t.created_at else None, "updated_at": t.updated_at.isoformat() if t.updated_at else None} for t in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_template(self, template_id: int):
        from app.warehouse.models import StandardizationTemplate
        return await self.session.get(StandardizationTemplate, template_id)

    async def create_template(self, payload: dict):
        from app.warehouse.models import StandardizationTemplate
        t = StandardizationTemplate(**{k: v for k, v in payload.items() if k in ("name", "description", "business_object", "template_rules")})
        self.session.add(t); await self.session.commit(); await self.session.refresh(t)
        return t

    async def update_template(self, template_id: int, payload: dict):
        from app.warehouse.models import StandardizationTemplate
        t = await self.session.get(StandardizationTemplate, template_id)
        if t is None: return None
        for k, v in payload.items():
            if k in ("name", "description", "business_object", "template_rules"): setattr(t, k, v)
        t.version = (t.version or 1) + 1; await self.session.commit(); await self.session.refresh(t)
        return t

    async def delete_template(self, template_id: int) -> bool:
        from app.warehouse.models import StandardizationTemplate
        t = await self.session.get(StandardizationTemplate, template_id)
        if t is None: return False
        await self.session.delete(t); await self.session.commit()
        return True

    async def load_template_to_asset(self, template_id: int, asset_code: str, asset_type: str = "table", on_conflict: str = "skip"):
        from app.warehouse.models import StandardizationTemplate, StandardizationRule
        t = await self.session.get(StandardizationTemplate, template_id)
        if t is None: return None
        if not t.template_rules: return {"loaded": 0, "skipped": 0, "template_id": template_id}
        existing = (await self.session.execute(select(StandardizationRule).where(StandardizationRule.asset_code == asset_code))).scalars().all()
        existing_keys = {(r.source_field, r.rule_type) for r in existing}
        loaded = 0; skipped = 0
        max_order = max((r.display_order for r in existing), default=0)
        for i, rule_data in enumerate(t.template_rules):
            key = (rule_data.get("source_field", ""), rule_data.get("rule_type", ""))
            if key in existing_keys:
                if on_conflict == "skip": skipped += 1; continue
            rule = StandardizationRule(asset_type=asset_type, asset_code=asset_code, rule_type=rule_data["rule_type"], source_field=rule_data.get("source_field", ""), target_field=rule_data.get("target_field", ""), rule_config=rule_data.get("rule_config", {}), enabled=True, display_order=max_order + (i + 1) * 10)
            self.session.add(rule); loaded += 1
        await self.session.commit()
        return {"loaded": loaded, "skipped": skipped, "template_id": template_id}


def get_standardization_template_service(session: AsyncSession) -> StandardizationTemplateService:
    return StandardizationTemplateService(session)


