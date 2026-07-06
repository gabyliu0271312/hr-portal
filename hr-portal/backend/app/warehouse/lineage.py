# -*- coding: utf-8 -*-
"""数据血缘服务

Q00 契约：
- 复用 impact.py 的引用扫描逻辑，不得另起一套独立查询
- 权限：读操作统一挂 require_op("warehouse.governance", "V")
- UCP 不可用时降级：UCP 节点仅展示摘要，不展开凭证和 Pipeline 内部细节
- 禁止触发 DataSource/UCP 实时拉取（只查仓内已落地数据）

Q0207 性能保护：
- depth 默认 3，最大 5
- limit 默认 50，最大 200
- 超限返回 truncated=true + truncation_message
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import RegisteredTable
from app.datasets.models import DataSet, DataSetTable, WarehouseMetric
from app.reports.models import Report
from app.warehouse.impact import get_impact_analyzer

# Q0207 性能保护默认值
DEFAULT_DEPTH = 3
MAX_DEPTH = 5
DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class LineageBuilder:
    """血缘图构建器。

    复用 impact.py 的 ImpactAnalyzer.scan_table/scan_field/scan_model 方法
    获取引用关系，再转换为 lineage graph (nodes + edges)。
    """

    def __init__(self, session: AsyncSession):
        self.session = session
        self.analyzer = get_impact_analyzer(session)
        self._seen_nodes: set[str] = set()
        self._seen_edges: set[str] = set()
        self._nodes: dict[str, dict] = {}
        self._edges: list[dict] = []

    # ==================== 公共 API ====================

    async def build_table_lineage(
        self,
        table_name: str,
        depth: int = DEFAULT_DEPTH,
        limit: int = DEFAULT_LIMIT,
    ) -> dict | None:
        """构建表级血缘图（Q0203）。

        上游：DataSource 同步、UCP 资源
        下游：DataSet（使用该表）、Metric（依赖该表）、Report（使用该表）
        """
        depth = min(depth, MAX_DEPTH)
        limit = min(limit, MAX_LIMIT)
        self._reset()

        # 验证表存在
        rt = (
            await self.session.execute(
                select(RegisteredTable).where(RegisteredTable.table_name == table_name)
            )
        ).scalar_one_or_none()
        if rt is None:
            return None

        # 添加目标表节点
        table_id = self._nid("table", table_name)
        self._add_node(table_id, "table", rt.table_label or table_name,
                       status=rt.asset_status or "published",
                       detail_route=f"/warehouse/assets/{table_name}")

        # --- 上游：DataSource 同步 ---
        from app.datasources.models import DataSource
        ds_rows = (
            await self.session.execute(
                select(DataSource).where(DataSource.table_name == table_name)
            )
        ).scalars().all()
        for ds in ds_rows:
            if self._hit_limit(limit):
                break
            ds_id = self._nid("datasource", ds.id)
            self._add_node(ds_id, "datasource",
                           label=ds.table_label or ds.table_name,
                           status="active" if ds.is_active else "inactive",
                           detail_route="DatasourceEndpoints")
            self._add_edge(ds_id, table_id, "upstream", "sync", "数据同步")

        # --- 上游：UCP 资源 ---
        try:
            from app.warehouse.ucp_adapter import get_asset_ucp_info
            ucp_info = await get_asset_ucp_info(
                self.session, table_name,
                ucp_system_id=rt.ucp_system_id,
                ucp_resource_id=rt.ucp_resource_id,
                ucp_connector_config_id=rt.ucp_connector_config_id,
            )
            if ucp_info and ucp_info.enabled and ucp_info.system_id:
                ucp_id = self._nid("ucp_resource", ucp_info.resource_id or 0)
                self._add_node(ucp_id, "ucp_resource", label="UCP 连接资源",
                               status="unknown", detail_route=ucp_info.config_route,
                               ucp_summary=ucp_info.to_dict())
                self._add_edge(ucp_id, table_id, "upstream", "sync", "UCP 接入")
        except Exception:
            pass  # UCP 不可用时跳过

        # --- 下游：扫描表引用 ---
        refs = await self.analyzer.scan_table(table_name)
        for ref in refs[:limit]:
            ref_type = ref["type"]
            ref_id_val = ref["id"]
            node_id = self._nid(ref_type, ref_id_val)
            self._add_node(node_id, ref_type, label=ref["name"],
                           status="published" if ref.get("risk_level") == "high" else "draft",
                           detail_route=ref.get("route"))
            self._add_edge(table_id, node_id, "downstream", "reference",
                           ref.get("usage", "引用"))

        # --- 下游：指标直接依赖 ---
        metric_rows = (
            await self.session.execute(
                select(WarehouseMetric).where(
                    WarehouseMetric.related_dataset_id.in_(
                        select(DataSet.id).join(
                            DataSetTable, DataSet.id == DataSetTable.dataset_id
                        ).where(DataSetTable.table_name == table_name)
                    )
                )
            )
        ).scalars().all()
        for m in metric_rows[:limit]:
            mid = self._nid("metric", m.id)
            self._add_node(mid, "metric", label=m.metric_name,
                           status=m.status or "draft",
                           detail_route=f"/warehouse/metrics/{m.id}")
            self._add_edge(table_id, mid, "downstream", "reference", "指标依赖")

        # --- 下游：报表通过 DataSet 间接引用 ---
        ds_ids_q = select(DataSet.id).join(
            DataSetTable, DataSet.id == DataSetTable.dataset_id
        ).where(DataSetTable.table_name == table_name)
        ds_ids = [row[0] for row in (await self.session.execute(ds_ids_q)).all()]
        if ds_ids:
            report_rows = (
                await self.session.execute(
                    select(Report).where(Report.dataset_id.in_(ds_ids))
                )
            ).scalars().all()
            for r in report_rows[:limit]:
                rid = self._nid("report", r.id)
                self._add_node(rid, "report", label=r.name,
                               status="published" if r.is_published else "draft",
                               detail_route=f"/reports/{r.id}")
                self._add_edge(table_id, rid, "downstream", "reference", "报表消费")

        truncated = self._node_count() >= limit * 3
        return {
            "nodes": list(self._nodes.values()),
            "edges": self._edges,
            "truncated": truncated,
            "truncation_message": f"结果过多，已截断至 {limit} 条关联" if truncated else None,
        }

    async def build_field_lineage(
        self,
        table_name: str,
        column_code: str,
        depth: int = DEFAULT_DEPTH,
        limit: int = DEFAULT_LIMIT,
    ) -> dict | None:
        """构建字段级血缘图（Q0204）。

        上游：源表字段
        下游：输出字段、计算字段、关联键、报表字段/筛选/排序、指标依赖字段
        """
        depth = min(depth, MAX_DEPTH)
        limit = min(limit, MAX_LIMIT)
        self._reset()

        # 验证表和字段存在
        from app.data.models import TableColumn
        rt = (
            await self.session.execute(
                select(RegisteredTable).where(RegisteredTable.table_name == table_name)
            )
        ).scalar_one_or_none()
        if rt is None:
            return None

        col = (
            await self.session.execute(
                select(TableColumn).where(
                    TableColumn.table_name == table_name,
                    TableColumn.column_code == column_code,
                )
            )
        ).scalar_one_or_none()
        if col is None:
            return None

        # 添加目标字段节点
        field_id = self._nid("field", f"{table_name}.{column_code}")
        table_id = self._nid("table", table_name)
        self._add_node(table_id, "table", label=rt.table_label or table_name,
                       status=rt.asset_status or "published",
                       detail_route=f"/warehouse/assets/{table_name}")
        self._add_node(field_id, "field",
                       label=f"{rt.table_label or table_name}.{col.column_label or column_code}",
                       status="published")
        self._add_edge(table_id, field_id, "downstream", "output", "包含字段")

        # --- 下游：复用 impact.py 的 scan_field ---
        refs = await self.analyzer.scan_field(table_name, column_code)
        for ref in refs[:limit]:
            ref_type = ref["type"]
            ref_id_val = ref["id"]
            node_id = self._nid(ref_type, ref_id_val)
            self._add_node(node_id, ref_type, label=ref["name"],
                           status="published" if ref.get("risk_level") == "high" else "draft",
                           detail_route=ref.get("route"))
            # 根据 ref_type 映射到合适的 relation_type
            rel_type_map = {
                "dataset_relation": "reference",
                "output_field": "output",
                "calculated_field": "calculation",
                "report": "reference",
                "metric": "reference",
            }
            rel_type = rel_type_map.get(ref_type, "reference")
            self._add_edge(field_id, node_id, "downstream", rel_type,
                           ref.get("usage", "引用"))

        truncated = self._node_count() >= limit * 3
        return {
            "nodes": list(self._nodes.values()),
            "edges": self._edges,
            "truncated": truncated,
            "truncation_message": f"结果过多，已截断至 {limit} 条关联" if truncated else None,
        }

    # ==================== 内部方法 ====================

    def _reset(self):
        self._seen_nodes = set()
        self._seen_edges = set()
        self._nodes = {}
        self._edges = []

    def _node_count(self) -> int:
        return len(self._nodes)

    def _nid(self, type: str, id_val) -> str:
        return f"{type}:{id_val}"

    def _add_node(self, id: str, type: str, label: str,
                  status: str = "unknown",
                  detail_route: str | None = None,
                  ucp_summary: dict | None = None):
        if id in self._seen_nodes:
            return
        self._seen_nodes.add(id)
        node = {
            "id": id, "type": type, "label": label,
            "status": status, "risk_level": "low",
            "detail_route": detail_route,
        }
        if ucp_summary:
            node["ucp_summary"] = ucp_summary
        self._nodes[id] = node

    def _add_edge(self, source: str, target: str, direction: str,
                  relation_type: str, label: str = ""):
        key = f"{source}→{target}:{relation_type}"
        if key in self._seen_edges:
            return
        self._seen_edges.add(key)
        self._edges.append({
            "source_id": source, "target_id": target,
            "direction": direction, "relation_type": relation_type,
            "label": label,
        })

    def _hit_limit(self, limit: int) -> bool:
        return len(self._nodes) >= limit * 3


def get_lineage_builder(session: AsyncSession) -> LineageBuilder:
    return LineageBuilder(session)
