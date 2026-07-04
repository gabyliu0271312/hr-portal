# -*- coding: utf-8 -*-
"""数据仓库影响分析

G00 契约：
- 统一返回：type/id/name/usage/risk_level/blocking/blocking_reason/route
- risk_level: low/medium/high（已发布=high, draft=medium）
- blocking: 已发布对象引用=true（带 blocking_reason）
- 字段匹配必须绑定 alias/table_name，禁止全局模糊匹配
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import RegisteredTable
from app.datasets.models import (
    DataSet,
    DataSetTable,
    DataSetRelation,
    DatasetOutputField,
    DatasetCalculatedField,
    WarehouseMetric,
)
from app.reports.models import Report


class ImpactAnalyzer:
    """影响分析器"""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ==================== 统一结构 ====================

    def _ref(
        self,
        ref_type: str,
        ref_id: int,
        name: str,
        usage: str = "",
        risk_level: str = "low",
        blocking: bool = False,
        blocking_reason: str = "",
        route: Optional[str] = None,
    ) -> dict:
        return {
            "type": ref_type,
            "id": ref_id,
            "name": name,
            "usage": usage,
            "risk_level": risk_level,
            "blocking": blocking,
            "blocking_reason": blocking_reason or (f"已发布{ref_type}引用" if blocking else ""),
            "route": route,
        }

    def _risk(self, is_published: bool, ref_type: str = "对象") -> tuple[str, bool, str]:
        """已发布 → high + blocking"""
        if is_published:
            return "high", True, f"已发布{ref_type}引用，操作会破坏下游"
        return "medium", False, ""

    # ==================== 别名映射 ====================

    async def _alias_to_table(self, dataset_id: int) -> dict[str, str]:
        """查询 dataset 内 alias → table_name 的映射"""
        rows = (
            await self.session.execute(
                select(DataSetTable.alias, DataSetTable.table_name).where(
                    DataSetTable.dataset_id == dataset_id
                )
            )
        ).all()
        return {row[0]: row[1] for row in rows}

    # ==================== 表级影响 ====================

    async def scan_table(self, table_name: str) -> list[dict]:
        """G0102: 扫描对该表的引用"""
        refs: list[dict] = []
        rows = (
            await self.session.execute(
                select(DataSetTable, DataSet).join(
                    DataSet, DataSet.id == DataSetTable.dataset_id
                ).where(DataSetTable.table_name == table_name)
            )
        ).all()
        for dt, ds in rows:
            rl, bl, reason = self._risk(ds.status == "published", "数据集")
            refs.append(
                self._ref(
                    "dataset", ds.id, ds.name,
                    usage=f"数据集包含表 {table_name}（别名: {dt.alias}）",
                    risk_level=rl, blocking=bl, blocking_reason=reason,
                    route=f"/warehouse/models/{ds.id}",
                )
            )
        return refs

    # ==================== 字段级影响 ====================

    async def scan_field(self, table_name: str, column_code: str) -> list[dict]:
        """G0103-G0107: 扫描对该字段的引用（5个来源，绑定 alias→table）"""
        refs: list[dict] = []

        # --- G0103: DataSetRelation.keys ---
        # rel.left_alias/right_alias 指向表别名，keys[].left/.right 是字段名
        rels = (
            await self.session.execute(
                select(DataSetRelation, DataSet).join(
                    DataSet, DataSet.id == DataSetRelation.dataset_id
                )
            )
        ).all()
        for rel, ds in rels:
            alias_map = await self._alias_to_table(ds.id)
            left_table = alias_map.get(rel.left_alias, "")
            right_table = alias_map.get(rel.right_alias, "")
            if left_table != table_name and right_table != table_name:
                continue
            keys = rel.keys or []
            for k in keys:
                if not isinstance(k, dict):
                    continue
                col_left = k.get("left")
                col_right = k.get("right")
                matched = False
                usage = ""
                if left_table == table_name and col_left == column_code:
                    matched, usage = True, f"关联 left={rel.left_alias}←{left_table}.{col_left}"
                elif right_table == table_name and col_right == column_code:
                    matched, usage = True, f"关联 right={rel.right_alias}←{right_table}.{col_right}"
                if matched:
                    rl, bl, reason = self._risk(ds.status == "published", "数据集")
                    refs.append(
                        self._ref(
                            "dataset_relation", ds.id, ds.name,
                            usage=usage, risk_level=rl, blocking=bl,
                            blocking_reason=reason,
                            route=f"/warehouse/models/{ds.id}",
                        )
                    )

        # --- G0104: DatasetOutputField（绑定 source_alias→table） ---
        of_rows = (
            await self.session.execute(
                select(DatasetOutputField, DataSet).join(
                    DataSet, DataSet.id == DatasetOutputField.dataset_id
                )
            )
        ).all()
        for of_, ds in of_rows:
            alias_map = await self._alias_to_table(ds.id)
            src_table = alias_map.get(of_.source_alias, "")
            if src_table == table_name and of_.source_column == column_code:
                rl, bl, reason = self._risk(ds.status == "published", "数据集")
                refs.append(
                    self._ref(
                        "output_field", ds.id, ds.name,
                        usage=f"输出字段: {of_.output_code} ({of_.source_alias}.{of_.source_column})",
                        risk_level=rl, blocking=bl, blocking_reason=reason,
                        route=f"/warehouse/models/{ds.id}",
                    )
                )

        # --- G0105: DatasetCalculatedField.depends_on ---
        calc_rows = (
            await self.session.execute(
                select(DatasetCalculatedField, DataSet).join(
                    DataSet, DataSet.id == DatasetCalculatedField.dataset_id
                )
            )
        ).all()
        for cf, ds in calc_rows:
            deps = cf.depends_on or []
            # depends_on 存的是 alias.column_code 或 column_code
            for dep in deps:
                dep_col = dep.split(".")[-1] if "." in dep else dep
                if dep_col == column_code:
                    rl, bl, reason = self._risk(ds.status == "published", "数据集")
                    refs.append(
                        self._ref(
                            "calculated_field", ds.id, ds.name,
                            usage=f"计算字段 {cf.code} depends_on {dep}",
                            risk_level=rl, blocking=bl, blocking_reason=reason,
                            route=f"/warehouse/models/{ds.id}",
                        )
                    )
                    break

        # --- G0106: Report config（column_settings + filters + sorts） ---
        reports = (await self.session.execute(select(Report))).scalars().all()
        for r in reports:
            config = r.config or {}
            # column_settings
            for col_code in config.get("column_settings", {}).keys():
                if col_code.endswith(f".{column_code}") or col_code == column_code:
                    rl, bl, reason = self._risk(r.is_published, "报表")
                    refs.append(
                        self._ref(
                            "report", r.id, r.name,
                            usage=f"报表字段: {col_code}",
                            risk_level=rl, blocking=bl, blocking_reason=reason,
                            route=f"/reports/{r.id}",
                        )
                    )
                    break
            # filters
            for f in config.get("filters", []):
                if isinstance(f, dict) and f.get("column", "").endswith(f".{column_code}"):
                    rl, bl, reason = self._risk(r.is_published, "报表")
                    refs.append(
                        self._ref(
                            "report", r.id, r.name,
                            usage=f"报表筛选: {f.get('column')}",
                            risk_level=rl, blocking=bl, blocking_reason=reason,
                            route=f"/reports/{r.id}",
                        )
                    )
                    break
            # sorts
            for s in config.get("sorts", []):
                if isinstance(s, dict) and s.get("column", "").endswith(f".{column_code}"):
                    rl, bl, reason = self._risk(r.is_published, "报表")
                    refs.append(
                        self._ref(
                            "report", r.id, r.name,
                            usage=f"报表排序: {s.get('column')}",
                            risk_level=rl, blocking=bl, blocking_reason=reason,
                            route=f"/reports/{r.id}",
                        )
                    )
                    break

        # --- G0107: WarehouseMetric.related_fields ---
        metrics = (await self.session.execute(select(WarehouseMetric))).scalars().all()
        for m in metrics:
            rfields = m.related_fields or []
            for rf in rfields:
                rf_col = rf.split(".")[-1] if "." in rf else rf
                if rf_col == column_code:
                    rl, bl, reason = self._risk(m.status == "published", "指标")
                    refs.append(
                        self._ref(
                            "metric", m.id, m.metric_name,
                            usage=f"指标依赖字段: {rf}",
                            risk_level=rl, blocking=bl, blocking_reason=reason,
                            route=f"/warehouse/metrics/{m.id}",
                        )
                    )
                    break

        return refs

    # ==================== 模型级影响 ====================

    async def scan_model(self, dataset_id: int) -> tuple[list[dict], bool]:
        """G0203: 扫描模型的下游引用。返回 (refs, dataset_exists)"""
        refs: list[dict] = []

        ds = await self.session.get(DataSet, dataset_id)
        if ds is None:
            return refs, False

        # 报表引用
        reports = (
            await self.session.execute(
                select(Report).where(Report.dataset_id == dataset_id)
            )
        ).scalars().all()
        for r in reports:
            rl, bl, reason = self._risk(r.is_published, "报表")
            refs.append(
                self._ref(
                    "report", r.id, r.name,
                    usage=f"报表基于数据集 {ds.name}",
                    risk_level=rl, blocking=bl, blocking_reason=reason,
                    route=f"/reports/{r.id}",
                )
            )

        # 指标引用
        metrics = (
            await self.session.execute(
                select(WarehouseMetric).where(
                    WarehouseMetric.related_dataset_id == dataset_id
                )
            )
        ).scalars().all()
        for m in metrics:
            rl, bl, reason = self._risk(m.status == "published", "指标")
            refs.append(
                self._ref(
                    "metric", m.id, m.metric_name,
                    usage=f"指标依赖数据集 {ds.name}",
                    risk_level=rl, blocking=bl, blocking_reason=reason,
                    route=f"/warehouse/metrics/{m.id}",
                )
            )

        return refs, True

    # ==================== 辅助 ====================

    @staticmethod
    def has_blocking(refs: list[dict]) -> bool:
        return any(r.get("blocking") for r in refs)


def get_impact_analyzer(session: AsyncSession) -> ImpactAnalyzer:
    return ImpactAnalyzer(session)
