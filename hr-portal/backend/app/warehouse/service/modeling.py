# -*- coding: utf-8 -*-
"""指标计算 + 维度 + DWS 聚合服务"""
from __future__ import annotations

from sqlalchemy import func, select
from app.datasets.models import DataSet
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
            await write_lineage_edge(self.session, f"metric:{m.metric_code}", f"result:{period}", "metric_compute", metadata={
                "definition_id": metric_id, "version": 1, "rule_ids": [],
            })
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

async def _validate_field_in_dataset(session: AsyncSession, dataset_id: int, field_name: str):
    """校验字段是否存在于数据集输出字段中。"""
    from app.datasets.models import DatasetOutputField
    exists = await session.execute(
        select(func.count(DatasetOutputField.id)).where(
            DatasetOutputField.dataset_id == dataset_id,
            func.lower(DatasetOutputField.output_code) == field_name.lower(),
        )
    )
    if exists.scalar_one() == 0:
        exists2 = await session.execute(
            select(func.count(DatasetOutputField.id)).where(
                DatasetOutputField.dataset_id == dataset_id,
                func.lower(DatasetOutputField.source_column) == field_name.lower(),
            )
        )
        if exists2.scalar_one() == 0:
            raise ValueError(f"字段 '{field_name}' 不在数据集 {dataset_id} 的输出字段中")

class DimensionService:
    """维度目录管理"""
    def __init__(self, session: AsyncSession): self.session = session

    async def list_dimensions(self):
        from app.warehouse.models import Dimension
        rows = (await self.session.execute(select(Dimension).order_by(Dimension.display_order, Dimension.id))).scalars().all()
        return [{"id": d.id, "dimension_code": d.dimension_code, "dimension_name": d.dimension_name, "parent_id": d.parent_id, "source_dataset_id": d.source_dataset_id, "bound_table": d.bound_table, "bound_field": d.bound_field, "description": d.description, "display_order": d.display_order, "created_at": d.created_at.isoformat() if d.created_at else None, "updated_at": d.updated_at.isoformat() if d.updated_at else None} for d in rows]

    async def get_dimension(self, dim_id: int):
        from app.warehouse.models import Dimension
        d = await self.session.get(Dimension, dim_id)
        if d is None: return None
        return {"id": d.id, "dimension_code": d.dimension_code, "dimension_name": d.dimension_name, "parent_id": d.parent_id, "source_dataset_id": d.source_dataset_id, "bound_table": d.bound_table, "bound_field": d.bound_field, "description": d.description, "display_order": d.display_order}

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
        sid = payload.get("source_dataset_id")
        if not sid: raise ValueError("数据集为必填")
        ds = await self.session.get(DataSet, sid) if sid else None
        if not ds: raise ValueError(f"数据集不存在: {sid}")
        if ds.warehouse_layer != "DWD": raise ValueError("维度只能绑定DWD层数据集")
        bf = payload.get("bound_field")
        if not bf: raise ValueError("绑定字段为必填")
        # 校验字段属于数据集输出字段
        await _validate_field_in_dataset(self.session, sid, bf)
        d = Dimension(dimension_code=payload["dimension_code"], dimension_name=payload["dimension_name"], parent_id=parent_id, source_dataset_id=sid, bound_field=bf, description=payload.get("description"), display_order=payload.get("display_order", 0))
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
        sid_changed = "source_dataset_id" in payload and payload["source_dataset_id"] is not None
        bf_changed = "bound_field" in payload and payload["bound_field"] is not None
        if sid_changed:
            ds = await self.session.get(DataSet, payload["source_dataset_id"])
            if not ds: raise ValueError(f"数据集不存在: {payload['source_dataset_id']}")
            if ds.warehouse_layer != "DWD": raise ValueError("维度只能绑定DWD层数据集")
        # 只要数据集或字段任一变化，就以最终值校验字段合法性
        if sid_changed or bf_changed:
            final_sid = payload.get("source_dataset_id") or d.source_dataset_id
            final_bf = payload.get("bound_field") or d.bound_field
            if final_sid and final_bf:
                await _validate_field_in_dataset(self.session, final_sid, final_bf)
        for key in ("dimension_name", "parent_id", "source_dataset_id", "bound_table", "bound_field", "description", "display_order"):
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

    async def _validate_aggregate_source(self, payload: dict):
        """硬兜底同源校验：create/update 都必须通过。"""
        from app.warehouse.models import Dimension as Dim
        from app.datasets.models import WarehouseMetric as WM
        sid = payload.get("source_dataset_id")
        if not sid: raise ValueError("source_dataset_id 为必填")
        ds = await self.session.get(DataSet, sid)
        if ds is None: raise ValueError(f"数据集不存在: {sid}")
        if ds.warehouse_layer != "DWD": raise ValueError("只能选择DWD层数据集")
        if payload.get("metric_id"):
            m = await self.session.get(WM, payload["metric_id"])
            if m is None: raise ValueError(f"指标不存在: {payload['metric_id']}")
            if m.related_dataset_id != sid: raise ValueError("指标必须与聚合使用同一个DWD数据集")
        group_by = payload.get("group_by", [])
        if not group_by: raise ValueError("至少需要一个分组维度")
        dims = (await self.session.execute(select(Dim).where(Dim.dimension_code.in_(group_by)))).scalars().all()
        for code in group_by:
            d = next((dd for dd in dims if dd.dimension_code == code), None)
            if d is None: raise ValueError(f"维度不存在: {code}")
            if not d.source_dataset_id or d.source_dataset_id != sid:
                raise ValueError(f"维度 '{code}' 必须绑定同一个DWD数据集({sid})")
            if not d.bound_field: raise ValueError(f"维度 '{code}' 缺少绑定字段")
        if payload.get("measure_field"):
            await _validate_field_in_dataset(self.session, sid, payload["measure_field"])

    async def create_aggregate(self, payload: dict):
        from app.warehouse.models import DwsAggregateDefinition
        if payload.get("aggregation") not in DWS_AGGREGATIONS: raise ValueError(f"非法聚合方式: {payload['aggregation']}")
        await self._validate_aggregate_source(payload)
        a = DwsAggregateDefinition(name=payload["name"], metric_id=payload.get("metric_id"), source_dataset_id=payload.get("source_dataset_id"), group_by=payload.get("group_by", []), filter=payload.get("filter"), aggregation=payload.get("aggregation", "sum"), measure_field=payload.get("measure_field"), time_grain=payload.get("time_grain"), business_definition=payload.get("business_definition"), status="draft")
        self.session.add(a); await self.session.commit(); await self.session.refresh(a)
        return await self.get_aggregate(a.id)

    async def update_aggregate(self, agg_id: int, payload: dict):
        from app.warehouse.models import DwsAggregateDefinition
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return None
        if a.status == "archived": raise ValueError("已归档聚合定义不可编辑")
        merged = {"source_dataset_id": a.source_dataset_id, "metric_id": a.metric_id, "group_by": a.group_by or [], "measure_field": a.measure_field}
        for k in ("source_dataset_id", "metric_id", "group_by", "measure_field"):
            if k in payload and payload[k] is not None: merged[k] = payload[k]
        await self._validate_aggregate_source(merged)
        allowed = {"name", "group_by", "filter", "aggregation", "measure_field", "time_grain", "business_definition", "metric_id", "source_dataset_id"}
        for key, val in payload.items():
            if key in allowed and val is not None: setattr(a, key, val)
        if "aggregation" in payload and payload["aggregation"] not in DWS_AGGREGATIONS: raise ValueError(f"非法聚合方式")
        await self.session.commit(); await self.session.refresh(a)
        return await self.get_aggregate(a.id)

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
        errors = []
        if not payload.get("name"): errors.append({"field": "name", "message": "名称为必填"})
        try:
            await self._validate_aggregate_source(payload)
        except ValueError as e:
            errors.append({"field": "source", "message": str(e)})
        return {"valid": len(errors) == 0, "errors": errors}

    @staticmethod
    def _quote_ident(name: str) -> str:
        """安全引用 PostgreSQL 标识符（表名、列名、别名）。"""
        return '"' + name.replace('"', '""') + '"'

    async def generate_dws_view(self, agg_id: int):
        from app.warehouse.layer_policy import validate_layer_transition
        validate_layer_transition("DWD", "DWS", "aggregate")
        from datetime import datetime as dt
        from app.warehouse.models import DwsAggregateDefinition, Dimension
        from sqlalchemy import text as sa_text
        Q = self._quote_ident
        agg = await self.session.get(DwsAggregateDefinition, agg_id)
        if agg is None: return None

        await self._validate_aggregate_source({
            "source_dataset_id": agg.source_dataset_id,
            "metric_id": agg.metric_id,
            "group_by": agg.group_by or [],
            "measure_field": agg.measure_field,
        })

        # 维度映射：
        # - SELECT 使用 "alias"."source_column" AS "output_code"，保证视图列名与数据集输出字段一致
        # - GROUP BY 使用原始来源表达式，避免按别名分组在不同数据库方言下不兼容
        # - 元数据注册使用 output_code，不写入带引号的 SQL 表达式
        dim_select_map = {}
        dim_group_map = {}
        dim_col_name = {}
        if agg.group_by:
            from app.datasets.models import DatasetOutputField
            dims = (await self.session.execute(select(Dimension).where(Dimension.dimension_code.in_(agg.group_by)))).scalars().all()
            for d in dims:
                col = d.bound_field or d.dimension_code
                # 查 DatasetOutputField 获取 source_alias 和 source_column
                dof = (await self.session.execute(
                    select(DatasetOutputField).where(
                        DatasetOutputField.dataset_id == agg.source_dataset_id,
                        (
                            (DatasetOutputField.output_code == col)
                            | (DatasetOutputField.source_column == col)
                        ),
                    )
                )).scalars().first()
                if dof and dof.source_column and dof.source_alias:
                    source_expr = f"{Q(dof.source_alias)}.{Q(dof.source_column)}"
                    output_code = dof.output_code or col
                else:
                    source_expr = Q(col)
                    output_code = col
                dim_group_map[d.dimension_code] = source_expr
                dim_select_map[d.dimension_code] = f"{source_expr} AS {Q(output_code)}"
                dim_col_name[d.dimension_code] = output_code

        # 度量字段
        measure = agg.measure_field
        if not measure and agg.metric_id:
            from app.datasets.models import WarehouseMetric
            m = await self.session.get(WarehouseMetric, agg.metric_id)
            measure = m.formula_expr if m else None
        if not measure:
            measure = "*"

        # 源数据集 FROM 子句构建：单表直接引用，多表使用 DataSetRelation 显式 JOIN
        dataset_id = agg.source_dataset_id
        if not dataset_id:
            raise ValueError("聚合缺少 source_dataset_id")
        ds_src = await self.session.get(DataSet, dataset_id)
        if not ds_src: raise ValueError(f"数据集不存在: {dataset_id}")
        if ds_src.warehouse_layer != "DWD": raise ValueError("只能基于DWD数据集生成DWS视图")
        from app.datasets.models import DataSetTable, DataSetRelation, DatasetOutputField
        ds_tables = (await self.session.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id))).scalars().all()
        table_names = [t.table_name for t in ds_tables] if ds_tables else []
        if not table_names: raise ValueError(f"数据集 {dataset_id} 没有关联物理表")
        if len(table_names) == 1:
            # 单表也必须带数据集内 alias；DatasetOutputField.source_alias 会引用该 alias。
            t = ds_tables[0]
            alias = t.alias or t.table_name
            from_table = f"{Q(t.table_name)} AS {Q(alias)}"
        else:
            alias_to_table = {t.alias or t.table_name: t.table_name for t in ds_tables}
            all_aliases = set(alias_to_table.keys())
            relations = (await self.session.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == dataset_id))).scalars().all()
            if not relations: raise ValueError("多表数据集缺少显式关联关系，无法生成 DWS 视图")
            # 按 DataSetTable 顺序取起点，有向 BFS：只处理 left_alias 已在 joined 的 relation
            # 这样 LEFT JOIN 方向始终是从已连接表 → 新表，与 relation 定义的语义一致
            start = ds_tables[0].alias or ds_tables[0].table_name
            joined: set[str] = {start}
            processed: set[int] = set()
            from_parts: list[str] = [f"{Q(alias_to_table[start])} AS {Q(start)}"]
            pending = list(relations)  # 待处理队列
            progress = True
            while pending and progress:
                progress = False
                remaining = []
                for rel in pending:
                    if id(rel) in processed: continue
                    # 只处理 left_alias 已在 joined 中的 relation（保证方向）
                    if rel.left_alias in joined and rel.right_alias not in joined:
                        kp = []
                        for k in (rel.keys or []):
                            kp.append(f"{Q(rel.left_alias)}.{Q(k['left'])} = {Q(rel.right_alias)}.{Q(k['right'])}")
                        if not kp: raise ValueError(f"关联关系 {rel.left_alias} ↔ {rel.right_alias} 缺少 join key")
                        jt = rel.join_type.upper() if rel.join_type else "LEFT"
                        rt = alias_to_table.get(rel.right_alias, rel.right_alias)
                        from_parts.append(f"{jt} JOIN {Q(rt)} AS {Q(rel.right_alias)} ON {' AND '.join(kp)}")
                        joined.add(rel.right_alias)
                        processed.add(id(rel))
                        progress = True
                    else:
                        remaining.append(rel)
                pending = remaining
            # 第二遍：left→right 走不通的，尝试 right→left（反转方向）
            if pending:
                progress = True
                while pending and progress:
                    progress = False
                    remaining = []
                    for rel in pending:
                        if id(rel) in processed: continue
                        if rel.right_alias in joined and rel.left_alias not in joined:
                            kp = []
                            for k in (rel.keys or []):
                                kp.append(f"{Q(rel.right_alias)}.{Q(k['right'])} = {Q(rel.left_alias)}.{Q(k['left'])}")
                            if not kp: raise ValueError(f"关联关系 {rel.left_alias} ↔ {rel.right_alias} 缺少 join key")
                            lt = alias_to_table.get(rel.left_alias, rel.left_alias)
                            rev = {"LEFT": "RIGHT", "RIGHT": "LEFT", "INNER": "INNER", "FULL": "FULL"}
                            jt = rev.get(rel.join_type.upper(), rel.join_type.upper()) if rel.join_type else "LEFT"
                            from_parts.append(f"{jt} JOIN {Q(lt)} AS {Q(rel.left_alias)} ON {' AND '.join(kp)}")
                            joined.add(rel.left_alias)
                            processed.add(id(rel))
                            progress = True
                        else:
                            remaining.append(rel)
                    pending = remaining
            # 校验所有表都被覆盖
            missing = all_aliases - joined
            if missing: raise ValueError(f"数据集表未连接: {', '.join(sorted(missing))}")
            from_table = " ".join(from_parts)

        agg_func = agg.aggregation.upper() if agg.aggregation else "SUM"
        select_dim_cols = [dim_select_map.get(c, Q(c)) for c in (agg.group_by or [])]
        group_exprs = [dim_group_map.get(c, Q(c)) for c in (agg.group_by or [])]
        select_group_cols = ", ".join(select_dim_cols) if select_dim_cols else ""
        group_cols = ", ".join(group_exprs) if group_exprs else ""
        # measure 是复杂表达式时直接引用，不再包聚合函数
        is_simple = measure.replace('.', '').replace('_', '').isalnum()
        if is_simple:
            # measure_field 来自数据集输出字段时，SQL 必须使用其 source_alias/source_column。
            # 同时兼容历史值保存 source_column 的情况。
            measure_dof = (await self.session.execute(
                select(DatasetOutputField).where(
                    DatasetOutputField.dataset_id == dataset_id,
                    (
                        (DatasetOutputField.output_code == measure)
                        | (DatasetOutputField.source_column == measure)
                    ),
                )
            )).scalars().first()
            if measure_dof and measure_dof.source_column and measure_dof.source_alias:
                measure_source = f"{Q(measure_dof.source_alias)}.{Q(measure_dof.source_column)}"
            else:
                measure_source = Q(measure)
            measure_expr = f"{agg_func}({measure_source})"
        else:
            measure_expr = measure  # 公式表达式本身已是聚合
        measure_alias = "aggregated_value"
        view_name = f"ds_dws_{agg_id}"

        # 1. 创建数据库 VIEW（含 ROW_NUMBER() 作为 id 主键列）
        select_clause = f"ROW_NUMBER() OVER () AS {Q('id')}, {select_group_cols + ', ' if select_group_cols else ''}{measure_expr} AS {Q(measure_alias)}, NULL::timestamptz AS {Q('synced_at')}"
        ddl = f"CREATE OR REPLACE VIEW {Q(view_name)} AS SELECT {select_clause} FROM {from_table}"
        if group_cols:
            ddl += f" GROUP BY {group_cols}"
        # DDL 在独立 session 执行，避免污染主 session 导致后续 DataSet/RegisteredTable 写入失败
        from app.core.db import get_session_factory
        async with get_session_factory()() as ddl_db:
            try:
                await ddl_db.execute(sa_text("DROP VIEW IF EXISTS " + Q(view_name)))
                await ddl_db.execute(sa_text(ddl))
                await ddl_db.commit()
            except Exception as e:
                    try:
                        await ddl_db.rollback()
                    except Exception:
                        pass
                    raise ValueError(f"创建视图失败: {str(e)[:200]}")

        # 2. 创建/更新 DataSet
        ds_name = view_name
        existing = (await self.session.execute(select(DataSet).where(DataSet.name == ds_name))).scalars().first()
        if existing: ds = existing; ds.version = (ds.version or 0) + 1
        else:
            ds = DataSet(name=ds_name, description=agg.business_definition or f"从 {agg.name} 生成", warehouse_layer="DWS", status="published", version=1, published_at=dt.utcnow())
            self.session.add(ds); await self.session.flush()

        # 3. 注册数据资产表 + 列
        from app.data.models import RegisteredTable, TableColumn
        rt_exists = (await self.session.execute(select(RegisteredTable).where(RegisteredTable.table_name == ds_name))).scalars().first()
        if not rt_exists:
            rt = RegisteredTable(table_name=ds_name, table_label=agg.name, warehouse_layer="DWS", source_system="dws_aggregate")
            self.session.add(rt); await self.session.flush()
        # 注册列：id / 分组维度 / 度量值 / synced_at
        col_order = 0
        for col_code, col_label in [("id", "ID"), ("synced_at", "同步时间")]:
            ec = (await self.session.execute(select(TableColumn).where(TableColumn.table_name == ds_name, TableColumn.column_code == col_code))).scalars().first()
            if not ec:
                self.session.add(TableColumn(table_name=ds_name, column_code=col_code, column_label=col_label, data_type="integer" if col_code == "id" else "timestamptz", display_order=col_order, is_visible=True))
            col_order += 1
        for code in (agg.group_by or []):
            col_name = dim_col_name.get(code, code)
            ec = (await self.session.execute(select(TableColumn).where(TableColumn.table_name == ds_name, TableColumn.column_code == col_name))).scalars().first()
            if not ec:
                self.session.add(TableColumn(table_name=ds_name, column_code=col_name, column_label=col_name, data_type="string", display_order=col_order, is_visible=True))
            col_order += 1
        ec = (await self.session.execute(select(TableColumn).where(TableColumn.table_name == ds_name, TableColumn.column_code == measure_alias))).scalars().first()
        if not ec:
            self.session.add(TableColumn(table_name=ds_name, column_code=measure_alias, column_label=measure_alias, data_type="numeric", display_order=col_order, is_visible=True))

        # 4. 动态注册到 DATA_TABLES（使预览/查询可用）
        from app.data.dynamic_loader import _register_view_model
        try:
            async with get_session_factory()() as reg_db:
                await _register_view_model(reg_db, view_name, force=True)
        except Exception:
            pass

        sql_summary = ddl
        output_fields = [dim_col_name.get(code, code) for code in (agg.group_by or [])] + [measure_alias]
        return {"aggregate_id": agg_id, "view_name": ds_name, "sql_summary": sql_summary, "output_fields": output_fields, "dependencies": [], "version": ds.version, "status": "published"}

    async def get_view_impact(self, agg_id: int):
        from app.warehouse.models import DwsAggregateDefinition
        agg = await self.session.get(DwsAggregateDefinition, agg_id)
        if agg is None: return None
        deps = []; warnings = []
        if not agg.measure_field and not agg.metric_id: warnings.append("未指定度量字段")
        if not agg.group_by: warnings.append("未指定分组维度")
        return {"aggregate_id": agg_id, "aggregate_name": agg.name, "dependencies": deps, "warnings": warnings, "estimated_output_fields": len(agg.group_by or []) + 1}


def get_dws_aggregate_service(session: AsyncSession) -> DwsAggregateService:
    return DwsAggregateService(session)


