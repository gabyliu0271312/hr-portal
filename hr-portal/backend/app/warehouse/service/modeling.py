# -*- coding: utf-8 -*-
"""指标计算 + 维度 + DWS 聚合服务"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# ==================== 指标计算 (R0302) ====================

class MetricComputeService:
    """指标计算与结果管理"""
    def __init__(self, session: AsyncSession): self.session = session

    async def compute_metric(self, metric_id: int, period: str, user_id=None):
        from datetime import datetime as dt
        from app.datasets.models import WarehouseMetric
        from app.warehouse.models import MetricResult, MetricRun
        from app.ai_formula.evaluator import evaluate_formula
        from sqlalchemy import text as sa_text
        m = await self.session.get(WarehouseMetric, metric_id)
        if m is None: return {"error": "not_found", "detail": f"指标不存在: {metric_id}"}
        if m.status == "archived": return {"error": "bad_request", "detail": "已归档指标不可计算"}
        started = dt.utcnow()
        run = MetricRun(metric_id=metric_id, status="running", period=period, started_at=started)
        self.session.add(run); await self.session.flush()
        try:
            value = None
            if m.formula_expr:
                row_data = {}
                if m.related_dataset_id:
                    try:
                        ds = await self.session.get(DataSet, m.related_dataset_id)
                        if ds and ds.tables:
                            fst = ds.tables[0]
                            rr = await self.session.execute(sa_text(f"SELECT * FROM {fst.table_name} LIMIT 1"))
                            row = rr.fetchone()
                            if row: row_data = dict(row._mapping)
                    except: pass
                eval_result = evaluate_formula(m.formula_expr, row_data)
                value = eval_result if eval_result is not None else None
            result = MetricResult(metric_id=metric_id, period=period, value={"value": value, "metric_code": m.metric_code}, computed_at=dt.utcnow())
            self.session.add(result); await self.session.flush()
            run.status = "success"; run.result_id = result.id; run.finished_at = dt.utcnow()
            # Z02: 自动血缘边
            from app.warehouse.service import write_lineage_edge
            await write_lineage_edge(self.session, f"metric:{m.metric_code}", f"result:{period}", "metric_compute")
            return {"run_id": run.id, "metric_id": metric_id, "status": "success", "period": period, "value": result.value, "error_message": None}
        except Exception as exc:
            run.status = "failed"; run.error_message = str(exc)[:1000]; run.finished_at = dt.utcnow()
            return {"run_id": run.id, "metric_id": metric_id, "status": "failed", "period": period, "value": None, "error_message": run.error_message}

    async def recalc_metric(self, metric_id: int, period: str, user_id=None):
        from app.warehouse.models import MetricResult
        old = await self.session.execute(select(MetricResult).where(MetricResult.metric_id == metric_id, MetricResult.period == period))
        for r in old.scalars().all(): await self.session.delete(r)
        await self.session.flush()
        return await self.compute_metric(metric_id, period, user_id)

    async def list_results(self, metric_id: int, page=1, page_size=20):
        from app.warehouse.models import MetricResult
        page_size = min(max(page_size, 1), 200)
        base = select(MetricResult).where(MetricResult.metric_id == metric_id)
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.order_by(MetricResult.computed_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": r.id, "metric_id": r.metric_id, "period": r.period, "value": r.value, "computed_at": r.computed_at.isoformat() if r.computed_at else None} for r in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def list_runs(self, metric_id: int, page=1, page_size=20):
        from app.warehouse.models import MetricRun
        page_size = min(max(page_size, 1), 200)
        base = select(MetricRun).where(MetricRun.metric_id == metric_id)
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.order_by(MetricRun.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": r.id, "metric_id": r.metric_id, "status": r.status, "error_message": r.error_message, "period": r.period, "result_id": r.result_id, "started_at": r.started_at.isoformat() if r.started_at else None, "finished_at": r.finished_at.isoformat() if r.finished_at else None, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}


def get_metric_compute_service(session: AsyncSession) -> MetricComputeService:
    return MetricComputeService(session)


# ==================== 维度定义 (R0305) ====================

class DimensionService:
    """维度目录管理"""
    def __init__(self, session: AsyncSession): self.session = session

    async def list_dimensions(self):
        from app.warehouse.models import Dimension
        rows = (await self.session.execute(select(Dimension).order_by(Dimension.display_order, Dimension.id))).scalars().all()
        return [{"id": d.id, "dimension_code": d.dimension_code, "dimension_name": d.dimension_name, "parent_id": d.parent_id, "bound_table": d.bound_table, "bound_field": d.bound_field, "description": d.description, "display_order": d.display_order, "created_at": d.created_at.isoformat() if d.created_at else None, "updated_at": d.updated_at.isoformat() if d.updated_at else None} for d in rows]

    async def get_dimension(self, dim_id: int):
        from app.warehouse.models import Dimension
        d = await self.session.get(Dimension, dim_id)
        if d is None: return None
        return {"id": d.id, "dimension_code": d.dimension_code, "dimension_name": d.dimension_name, "parent_id": d.parent_id, "bound_table": d.bound_table, "bound_field": d.bound_field, "description": d.description, "display_order": d.display_order}

    async def get_tree(self):
        dims = {d["id"]: {**d, "children": []} for d in await self.list_dimensions()}
        roots = []
        for d_id, node in dims.items():
            parent_id = next((x["parent_id"] for x in [dims.get(d_id, {})] if x.get("parent_id")), None)
            pid = node.get("parent_id")
            if pid and pid in dims: dims[pid]["children"].append(node)
            else: roots.append(node)
        return roots

    async def create_dimension(self, payload: dict):
        from app.warehouse.models import Dimension
        exists = (await self.session.execute(select(func.count(Dimension.id)).where(Dimension.dimension_code == payload["dimension_code"]))).scalar_one()
        if exists > 0: raise ValueError(f"维度编码已存在: {payload['dimension_code']}")
        parent_id = payload.get("parent_id")
        if parent_id:
            parent = await self.session.get(Dimension, parent_id)
            if parent is None: raise ValueError(f"父维度不存在: {parent_id}")
        d = Dimension(dimension_code=payload["dimension_code"], dimension_name=payload["dimension_name"], parent_id=parent_id, bound_table=payload.get("bound_table"), bound_field=payload.get("bound_field"), description=payload.get("description"), display_order=payload.get("display_order", 0))
        self.session.add(d); await self.session.commit(); await self.session.refresh(d)
        return await self.get_dimension(d.id)

    async def update_dimension(self, dim_id: int, payload: dict):
        from app.warehouse.models import Dimension
        d = await self.session.get(Dimension, dim_id)
        if d is None: return None
        if "parent_id" in payload:
            new_parent = payload["parent_id"]
            if new_parent == dim_id: raise ValueError("不能将维度设为自身的父维度")
            if new_parent is not None:
                parent = await self.session.get(Dimension, new_parent)
                if parent is None: raise ValueError(f"父维度不存在: {new_parent}")
        for key in ("dimension_name", "parent_id", "bound_table", "bound_field", "description", "display_order"):
            if key in payload and payload[key] is not None: setattr(d, key, payload[key])
        return d

    async def delete_dimension(self, dim_id: int) -> bool:
        from app.warehouse.models import Dimension
        d = await self.session.get(Dimension, dim_id)
        if d is None: return False
        children = (await self.session.execute(select(Dimension).where(Dimension.parent_id == dim_id))).scalars().all()
        for child in children: child.parent_id = None
        await self.session.delete(d); await self.session.commit()
        return True

    async def get_impact(self, dim_id: int):
        from app.warehouse.models import Dimension, DwsAggregateDefinition
        d = await self.session.get(Dimension, dim_id)
        if d is None: return None
        aggs = (await self.session.execute(select(DwsAggregateDefinition).where(DwsAggregateDefinition.group_by.contains([d.dimension_code])))).scalars().all()
        children = (await self.session.execute(select(Dimension).where(Dimension.parent_id == dim_id))).scalars().all()
        return {"dimension_id": dim_id, "dimension_code": d.dimension_code, "referenced_by_aggregates": [{"id": a.id, "name": a.name} for a in aggs], "referenced_by_children": [{"id": c.id, "dimension_code": c.dimension_code} for c in children], "can_delete": len(list(aggs)) == 0}


def get_dimension_service(session: AsyncSession) -> DimensionService:
    return DimensionService(session)


# ==================== DWS 聚合定义 (R0308) ====================

DWS_AGGREGATIONS = ("sum", "count", "avg", "max", "min")


class DwsAggregateService:
    """DWD → DWS 聚合定义管理"""
    def __init__(self, session: AsyncSession): self.session = session

    async def list_aggregates(self, metric_id=None, status=None, page=1, page_size=20):
        from app.warehouse.models import DwsAggregateDefinition
        page_size = min(max(page_size, 1), 200)
        base = select(DwsAggregateDefinition)
        if metric_id is not None: base = base.where(DwsAggregateDefinition.metric_id == metric_id)
        if status: base = base.where(DwsAggregateDefinition.status == status)
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.order_by(DwsAggregateDefinition.id.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": a.id, "name": a.name, "metric_id": a.metric_id, "source_dataset_id": a.source_dataset_id, "group_by": a.group_by, "filter": a.filter, "aggregation": a.aggregation, "measure_field": a.measure_field, "time_grain": a.time_grain, "business_definition": a.business_definition, "status": a.status} for a in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_aggregate(self, agg_id: int):
        from app.warehouse.models import DwsAggregateDefinition
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return None
        return {"id": a.id, "name": a.name, "metric_id": a.metric_id, "source_dataset_id": a.source_dataset_id, "group_by": a.group_by, "filter": a.filter, "aggregation": a.aggregation, "measure_field": a.measure_field, "time_grain": a.time_grain, "business_definition": a.business_definition, "status": a.status}

    async def create_aggregate(self, payload: dict):
        from app.warehouse.models import DwsAggregateDefinition, Dimension
        from app.datasets.models import WarehouseMetric
        if payload.get("aggregation") not in DWS_AGGREGATIONS: raise ValueError(f"非法聚合方式: {payload['aggregation']}")
        if payload.get("metric_id"):
            m = await self.session.get(WarehouseMetric, payload["metric_id"])
            if m is None: raise ValueError(f"指标不存在: {payload['metric_id']}")
        if payload.get("source_dataset_id"):
            ds = await self.session.get(DataSet, payload["source_dataset_id"])
            if ds is None: raise ValueError(f"数据集不存在: {payload['source_dataset_id']}")
        group_by = payload.get("group_by", [])
        if group_by:
            existing_dims = (await self.session.execute(select(Dimension.dimension_code).where(Dimension.dimension_code.in_(group_by)))).scalars().all()
            existing_set = set(existing_dims)
            for code in group_by:
                if code not in existing_set: raise ValueError(f"维度 code 不存在: {code}")
        a = DwsAggregateDefinition(name=payload["name"], metric_id=payload.get("metric_id"), source_dataset_id=payload.get("source_dataset_id"), group_by=group_by, filter=payload.get("filter"), aggregation=payload.get("aggregation", "sum"), measure_field=payload.get("measure_field"), time_grain=payload.get("time_grain"), business_definition=payload.get("business_definition"), status="draft")
        self.session.add(a); await self.session.commit(); await self.session.refresh(a)
        return await self.get_aggregate(a.id)

    async def update_aggregate(self, agg_id: int, payload: dict):
        from app.warehouse.models import DwsAggregateDefinition, Dimension
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return None
        if a.status == "archived": raise ValueError("已归档聚合定义不可编辑")
        if "group_by" in payload and payload["group_by"]:
            existing_dims = (await self.session.execute(select(Dimension.dimension_code).where(Dimension.dimension_code.in_(payload["group_by"])))).scalars().all()
            for code in payload["group_by"]:
                if code not in set(existing_dims): raise ValueError(f"维度 code 不存在: {code}")
        allowed = {"name", "group_by", "filter", "aggregation", "measure_field", "time_grain", "business_definition"}
        for key, val in payload.items():
            if key in allowed: setattr(a, key, val)
        if "aggregation" in payload and payload["aggregation"] not in DWS_AGGREGATIONS: raise ValueError(f"非法聚合方式")
        return a

    async def delete_aggregate(self, agg_id: int) -> bool:
        from app.warehouse.models import DwsAggregateDefinition
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return False
        await self.session.delete(a); await self.session.commit()
        return True

    async def publish_aggregate(self, agg_id: int):
        from app.warehouse.models import DwsAggregateDefinition
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return None
        if a.status != "draft": raise ValueError("仅 draft 可发布")
        a.status = "published"; await self.session.commit(); await self.session.refresh(a)
        return await self.get_aggregate(agg_id)

    async def archive_aggregate(self, agg_id: int):
        from app.warehouse.models import DwsAggregateDefinition
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return None
        if a.status != "published": raise ValueError("仅 published 可归档")
        a.status = "archived"; await self.session.commit(); await self.session.refresh(a)
        return await self.get_aggregate(agg_id)

    async def validate_aggregate(self, payload: dict):
        from app.warehouse.models import Dimension
        errors = []
        if not payload.get("name"): errors.append({"field": "name", "message": "名称为必填"})
        if not payload.get("group_by"): errors.append({"field": "group_by", "message": "至少需要一个分组维度"})
        elif payload["group_by"]:
            existing = (await self.session.execute(select(Dimension.dimension_code).where(Dimension.dimension_code.in_(payload["group_by"])))).scalars().all()
            for code in payload["group_by"]:
                if code not in set(existing): errors.append({"field": "group_by", "message": f"维度 code 不存在: {code}"})
        if not payload.get("measure_field"): errors.append({"field": "measure_field", "message": "度量字段为必填"})
        return {"valid": len(errors) == 0, "errors": errors}

    async def generate_dws_view(self, agg_id: int):
        # P0-1: 分层流转校验
        from app.warehouse.layer_policy import validate_layer_transition
        validate_layer_transition("DWD", "DWS", "aggregate")
        from datetime import datetime as dt
        from app.warehouse.models import DwsAggregateDefinition, Dimension
        agg = await self.session.get(DwsAggregateDefinition, agg_id)
        if agg is None: return None
        dim_map = {}
        if agg.group_by:
            dims = (await self.session.execute(select(Dimension).where(Dimension.dimension_code.in_(agg.group_by)))).scalars().all()
            for d in dims:
                dim_map[d.dimension_code] = f"{d.bound_table}.{d.bound_field}" if d.bound_table and d.bound_field else d.dimension_code
        measure = agg.measure_field or "*"
        agg_func = agg.aggregation.upper() if agg.aggregation else "SUM"
        resolved_cols = [dim_map.get(c, c) for c in (agg.group_by or [])]
        group_cols = ", ".join(resolved_cols) if resolved_cols else ""
        view_name = f"dws_{agg.name.replace(' ', '_').lower()}"
        sql_summary = f"CREATE VIEW {view_name} AS\nSELECT {group_cols + ', ' if group_cols else ''}{agg_func}({measure}) AS {agg_func}_{measure}\nFROM datasets.id={agg.source_dataset_id}\nGROUP BY {group_cols if group_cols else '()'}"
        ds_name = view_name
        existing = (await self.session.execute(select(DataSet).where(DataSet.name == ds_name))).scalars().first()
        if existing: ds = existing; ds.version = (ds.version or 0) + 1
        else:
            ds = DataSet(name=ds_name, description=agg.business_definition or f"从 {agg.name} 生成", warehouse_layer="DWS", status="published", version=1, published_at=dt.utcnow())
            self.session.add(ds); await self.session.flush()
        return {"aggregate_id": agg_id, "view_name": ds_name, "sql_summary": sql_summary, "output_fields": list(agg.group_by or []) + [f"{agg_func}_{measure}"], "dependencies": [], "version": ds.version, "status": "published"}

    async def get_view_impact(self, agg_id: int):
        from app.warehouse.models import DwsAggregateDefinition
        agg = await self.session.get(DwsAggregateDefinition, agg_id)
        if agg is None: return None
        deps = []; warnings = []
        if not agg.measure_field: warnings.append("未指定度量字段")
        if not agg.group_by: warnings.append("未指定分组维度")
        return {"aggregate_id": agg_id, "aggregate_name": agg.name, "dependencies": deps, "warnings": warnings, "estimated_output_fields": len(agg.group_by or []) + 1}


def get_dws_aggregate_service(session: AsyncSession) -> DwsAggregateService:
    return DwsAggregateService(session)


