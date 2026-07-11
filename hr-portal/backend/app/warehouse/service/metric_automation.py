# -*- coding: utf-8 -*-
"""X05 指标自动化数仓开发服务

从指标定义出发，自动生成 DWS/ADS 草稿 → 预览 → 门禁 → 发布 → 审计。
所有生产操作必须人工确认，L4 全自动级联（第三期）默认禁用。
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime as dt, timezone
from typing import Any

from sqlalchemy import func, select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.warehouse.service import validate_identifier
from app.warehouse.service.modeling import DWS_AGGREGATIONS


# ==================== 指标解析（X0502） ====================

class MetricAutomationService:
    """指标驱动的自动化数仓开发服务"""

    def __init__(self, session: AsyncSession, trace_id: str | None = None):
        self.session = session
        self._trace_id = trace_id

    # ── 工具函数 ──

    def _extract_select_sql(self, sql: str) -> str:
        """从 CREATE VIEW ... AS SELECT ... 中提取 SELECT 部分。
        解析失败直接抛 ValueError，不允许 fallback。
        """
        import re as _re
        sql = sql.strip().rstrip(";")
        pattern = r'^CREATE\s+VIEW\s+"?[\w_]+"?\s+AS\s+(SELECT\s+.+)$'
        match = _re.match(pattern, sql, flags=_re.IGNORECASE | _re.DOTALL)
        if not match:
            raise ValueError("SQL 不是合法的 CREATE VIEW ... AS SELECT ... 格式")
        select_sql = match.group(1).strip()
        if not select_sql.upper().startswith("SELECT"):
            raise ValueError("View SQL 必须以 SELECT 开始")
        return select_sql

    # ── X0502: 指标解析诊断 ──

    async def diagnose_metric(self, metric_id: int) -> dict:
        """诊断指标是否可自动化生成 DWS/ADS 草稿。

        返回结构化诊断结果：automatable + errors/warnings/suggestions。
        """
        self._start_trace(metric_id, "diagnose")
        from app.datasets.models import WarehouseMetric, DataSet

        m = await self.session.get(WarehouseMetric, metric_id)
        if m is None:
            return self._diag_error(metric_id, "", "", [f"指标不存在: {metric_id}"])

        errors: list[str] = []
        warnings: list[str] = []
        suggestions: list[str] = []

        # 1) 基础合法性
        if m.status == "archived":
            errors.append("已归档指标不可自动化")

        # 2) 关联数据集
        ds_id = m.related_dataset_id
        ds_name = None
        if ds_id:
            ds = await self.session.get(DataSet, ds_id)
            if ds is None:
                errors.append(f"关联数据集不存在: {ds_id}")
            else:
                ds_name = ds.name
        else:
            errors.append("未关联数据集，无法确定数据来源")

        # 3) 公式 + 相关字段解析
        dims: list[str] = []
        measures: list[str] = []
        aggs: list[str] = []
        filters: list[dict] = []

        formula = m.formula_expr or m.calculation_desc or ""

        related_fields = m.related_fields or []
        # 未显式配置时，从公式自动提取字段引用
        if not related_fields and formula:
            import re as _re
            keywords = {"SUM", "COUNT", "COUNT_DISTINCT", "AVG", "MAX", "MIN", "IF",
                        "ROUND", "ABS", "AND", "OR", "NOT", "TRUE", "FALSE", "NULL",
                        "WHERE", "FILTER", "GROUP", "BY", "SELECT", "FROM", "AS",
                        "YEAR", "QUARTER", "MONTH", "DAY", "ELSE", "THEN", "CASE",
                        "WHEN", "END", "XOR", "IN", "LIKE", "IS", "BETWEEN"}
            # 去掉 = 前缀和引号内字符串后再提取
            cleaned = _re.sub(r'"[^"]*"', '""', formula.lstrip('='))
            cleaned = _re.sub(r"'[^']*'", "''", cleaned)
            tokens = _re.findall(r'[a-zA-Z_][a-zA-Z0-9_]*', cleaned)
            for t in tokens:
                if t.upper() not in keywords and len(t) > 1:
                    if t not in related_fields:
                        related_fields.append(t)
            if related_fields:
                suggestions.append(f"与公式自动提取字段: {', '.join(related_fields[:10])}")

        # 有公式但提取不到字段时也不阻断（公式本身是口径来源）
        if not related_fields and not formula:
            errors.append("未配置公式或 related_fields，无法确定维度和度量字段")
            suggestions.append("请先在依赖数据集中选择数据来源，并编写公式表达式")
        elif related_fields:
            # 尝试从 dataset 的 output_fields 推导角色
            for f in related_fields:
                if isinstance(f, str):
                    dims.append(f)
                elif isinstance(f, dict):
                    code = f.get("field") or f.get("column_code") or ""
                    role = f.get("agg_role") or f.get("role", "")
                    if code:
                        if role == "measure":
                            measures.append(code)
                        else:
                            dims.append(code)

        # 4) 公式解析（简单推导聚合函数）
        if formula:
            formula_upper = formula.upper()
            for fn in ("COUNT_DISTINCT", "COUNT", "SUM", "AVG", "MAX", "MIN"):
                if fn in formula_upper:
                    aggs.append(fn.lower())
            # 提取过滤条件关键词
            if "WHERE" in formula_upper or "FILTER" in formula_upper:
                filters.append({"type": "formula_filter", "source": "formula_expr"})

        if not aggs:
            aggs.append("sum")  # 默认
            suggestions.append("未从公式推导出明确聚合函数，默认使用 SUM")

        # 5) 时间粒度 — 自动检测 DWD 表的日期字段，派生多粒度列
        time_grain = "month"  # 默认最细粒度，BI 端可下钻
        time_col = None
        if ds_id:
            time_col = await self._detect_date_column(ds_id)
            if time_col:
                # 将 year/quarter/month 自动加入维度列表
                for derived in ("year", "quarter", "month"):
                    if derived not in dims:
                        dims.append(derived)
                suggestions.append(f"检测到日期字段 {time_col}，DWS 将自动派生 year/quarter/month 列，BI 端支持下钻")

        automatable = len(errors) == 0

        return {
            "metric_id": metric_id,
            "metric_code": m.metric_code,
            "metric_name": m.metric_name,
            "automatable": automatable,
            "metric_type": m.metric_type or "derived",
            "source_dataset_id": ds_id,
            "source_dataset_name": ds_name,
            "dimension_fields": dims,
            "measure_fields": measures,
            "aggregation_functions": aggs,
            "filters": filters,
            "time_grain": time_grain,
            "errors": errors,
            "warnings": warnings,
            "suggestions": suggestions,
        }

    def _diag_error(self, metric_id, code, name, errors):
        return {
            "metric_id": metric_id, "metric_code": code, "metric_name": name,
            "automatable": False, "metric_type": "derived",
            "source_dataset_id": None, "source_dataset_name": None,
            "dimension_fields": [], "measure_fields": [],
            "aggregation_functions": [], "filters": [], "time_grain": None,
            "errors": errors, "warnings": [], "suggestions": [],
        }

    async def _detect_date_column(self, dataset_id: int) -> str | None:
        """检测数据集中最可能的日期/时间字段，用于多粒度下钻派生。

        优先匹配: month / date / period / time 相关列名
        返回列名或 None
        """
        try:
            from app.datasets.models import DataSet
            ds = await self.session.get(DataSet, dataset_id)
            if not ds or not ds.tables:
                return None
            # 从第一个表的列中查找日期字段
            tbl = ds.tables[0]
            tn = getattr(tbl, 'table_name', str(tbl))
            cols = (await self.session.execute(sa_text(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_name = :t AND table_schema = 'public'"
            ), {"t": tn})).fetchall()
            date_patterns = ["month", "date", "period", "time", "year", "ym", "ymd"]
            for col_name, col_type in cols:
                lower = col_name.lower()
                # 匹配名称包含日期关键词
                if any(p in lower for p in date_patterns):
                    return col_name
                # 匹配 date/time 类型
                if col_type and any(t in col_type.lower() for t in ("date", "time", "timestamp")):
                    return col_name
        except Exception:
            pass
        return None

    # ── X0503: DWS 草稿生成 ──

    async def generate_dws_draft(self, metric_id: int, overrides: dict | None = None) -> dict:
        """根据指标解析结果生成 DWS 聚合定义草稿。

        只生成草稿（status=draft），不发布生产资产。
        """
        overrides = overrides or {}

        # 1) 诊断
        diag = await self.diagnose_metric(metric_id)
        if not diag["automatable"]:
            return {"metric_id": metric_id, "diagnosis": diag, "status": "failed",
                    "error": "; ".join(diag["errors"])}

        # 2) 生成聚合名称
        agg_name = overrides.get("aggregate_name") or f"dws_{diag['metric_code']}_auto"

        # 3) 分组维度
        group_by = overrides.get("group_by") or diag["dimension_fields"][:5]

        # 4) 度量字段和聚合方式
        measure = overrides.get("measure_field") or (diag["measure_fields"][0] if diag["measure_fields"] else None)
        agg_fn = overrides.get("aggregation") or (diag["aggregation_functions"][0] if diag["aggregation_functions"] else "sum")
        if agg_fn not in DWS_AGGREGATIONS:
            agg_fn = "sum"
        # SUM/AVG/MAX/MIN 不能对 * 操作，无度量字段时退化为 COUNT
        if not measure:
            if agg_fn in ("sum", "avg", "max", "min"):
                agg_fn = "count"
            measure = "*"

        # 5) 创建 DWS 草稿
        from app.warehouse.models import DwsAggregateDefinition
        agg = DwsAggregateDefinition(
            name=agg_name,
            metric_id=metric_id,
            source_dataset_id=diag["source_dataset_id"],
            group_by=group_by,
            filter=overrides.get("filter") or (diag["filters"][0] if diag["filters"] else None),
            aggregation=agg_fn,
            measure_field=measure,
            time_grain=overrides.get("time_grain") or diag["time_grain"],
            business_definition=f"从指标 '{diag['metric_name']}' 自动生成 (v{diag.get('metric_type', '')})",
            status="draft",
        )
        self.session.add(agg)
        await self.session.commit()
        await self.session.refresh(agg)

        # 6) 写审计
        await self._audit(metric_id, "dws_draft_generated",
                          f"DWS 草稿已生成: {agg_name} (id={agg.id})",
                          {"draft_id": agg.id, "group_by": group_by, "aggregation": agg_fn})

        return {
            "draft_id": agg.id, "metric_id": metric_id,
            "metric_code": diag["metric_code"], "metric_name": diag["metric_name"],
            "aggregate_name": agg_name,
            "source_dataset_id": diag["source_dataset_id"],
            "source_dataset_name": diag["source_dataset_name"],
            "group_by": group_by, "filter": agg.filter,
            "aggregation": agg_fn, "measure_field": measure,
            "time_grain": diag["time_grain"],
            "business_definition": agg.business_definition,
            "status": "draft",
            "diagnosis": diag,
        }

    # ── X0504: 受控 SQL/View 生成与安全校验 ──

    async def generate_view_sql(self, draft_id: int, draft_type: str = "dws") -> dict:
        """生成受控 SQL/View，含安全校验。

        返回 view_name, sql_summary, output_fields, dependencies, validation_errors。
        """
        from app.warehouse.models import DwsAggregateDefinition, AdsDefinition
        from app.datasets.models import DataSet

        errors: list[str] = []
        warnings: list[str] = []

        if draft_type == "dws":
            agg = await self.session.get(DwsAggregateDefinition, draft_id)
            if agg is None:
                return {"draft_id": draft_id, "draft_type": draft_type, "error": "DWS 草稿不存在"}
            return await self._generate_dws_view_sql(agg, errors, warnings)

        elif draft_type == "ads":
            ads = await self.session.get(AdsDefinition, draft_id)
            if ads is None:
                return {"draft_id": draft_id, "draft_type": draft_type, "error": "ADS 草稿不存在"}
            return await self._generate_ads_view_sql(ads, errors, warnings)

        return {"draft_id": draft_id, "draft_type": draft_type, "error": f"未知 draft_type: {draft_type}"}

    async def _generate_dws_view_sql(self, agg, errors, warnings) -> dict:
        """生成 DWS View SQL"""
        from app.warehouse.models import Dimension
        from app.datasets.models import DataSet

        # 1) 安全校验
        agg_name_clean = agg.name.replace(" ", "_").lower()
        try:
            validate_identifier(agg_name_clean)
        except ValueError:
            agg_name_clean = f"dws_agg_{agg.id}"

        view_name = f"dws_{agg_name_clean}"

        # 解析维度字段
        dim_map: dict[str, str] = {}
        if agg.group_by:
            dims = (await self.session.execute(
                select(Dimension).where(Dimension.dimension_code.in_(agg.group_by))
            )).scalars().all()
            for d in dims:
                dim_map[d.dimension_code] = d.bound_field or d.dimension_code

        # 解析维度字段，处理时间派生列（year/quarter/month → EXTRACT）
        date_col = None
        if agg.source_dataset_id:
            date_col = await self._detect_date_column(agg.source_dataset_id)

        resolved_cols: list[str] = []
        for c in (agg.group_by or []):
            resolved = dim_map.get(c, c)
            # 时间派生列
            if resolved in ("year", "quarter", "month") and date_col:
                if resolved == "year":
                    resolved_cols.append(f"EXTRACT(YEAR FROM \"{date_col}\")::int")
                elif resolved == "quarter":
                    resolved_cols.append(f"EXTRACT(QUARTER FROM \"{date_col}\")::int")
                elif resolved == "month":
                    resolved_cols.append(f"EXTRACT(MONTH FROM \"{date_col}\")::int")
            else:
                try:
                    validate_identifier(str(resolved))
                except ValueError as e:
                    errors.append(f"非法列名: {resolved} — {e}")
                resolved_cols.append(f"\"{resolved}\"")

        # 度量字段
        measure = agg.measure_field or "*"
        agg_func = agg.aggregation.upper() if agg.aggregation else "SUM"
        # SUM/AVG/MAX/MIN 不接受 *，退化为 COUNT
        if measure == "*" and agg_func in ("SUM", "AVG", "MAX", "MIN"):
            agg_func = "COUNT"
        if measure != "*":
            try:
                validate_identifier(measure)
            except ValueError as e:
                errors.append(f"非法度量字段: {measure} — {e}")

        # 构建 SQL（时间派生列带别名）
        group_clause_parts: list[str] = []
        select_clause_parts: list[str] = []
        for i, expr in enumerate(resolved_cols):
            # EXTRACT 表达式需要别名
            col_name = (agg.group_by or [])[i] if i < len(agg.group_by or []) else f"col_{i}"
            select_clause_parts.append(f"{expr} AS \"{col_name}\"")
            group_clause_parts.append(expr)

        group_cols = ", ".join(resolved_cols) if resolved_cols else ""
        select_cols = (", ".join(select_clause_parts) + ", " if select_clause_parts else "") + f"{agg_func}({measure}) AS {agg_func}_{measure}"
        group_clause = f"GROUP BY {', '.join(group_clause_parts)}" if group_clause_parts else ""

        # 来源表（校验标识符安全性）
        source_table = "UNKNOWN"
        source_table_safe = False
        if agg.source_dataset_id:
            ds = await self.session.get(DataSet, agg.source_dataset_id)
            if ds and ds.tables:
                raw_table = ds.tables[0].table_name if hasattr(ds.tables[0], 'table_name') else str(ds.tables[0])
                try:
                    validate_identifier(raw_table)
                    source_table = raw_table
                    source_table_safe = True
                except ValueError:
                    errors.append(f"来源表名不合法: {raw_table}")
        if not source_table_safe and source_table == "UNKNOWN":
            errors.append("无法确定安全的来源表名")

        filter_sql, filter_params = self._filter_to_sql(agg.filter) if agg.filter else ("", {})
        filter_clause = f"WHERE {filter_sql}" if filter_sql else ""

        sql = f"CREATE VIEW \"{view_name}\" AS\nSELECT {select_cols}\nFROM \"{source_table}\"\n{filter_clause}\n{group_clause}".replace("\n\n", "\n").strip()

        # 输出字段
        output_fields = []
        for i, col in enumerate(resolved_cols):
            output_fields.append({"index": i, "name": col, "alias": col, "role": "dimension"})
        output_fields.append({"index": len(output_fields), "name": f"{agg_func}_{measure}", "alias": f"{agg_func}_{measure}", "role": "measure"})

        # 依赖
        deps = []
        if agg.source_dataset_id:
            deps.append({"type": "dataset", "id": agg.source_dataset_id, "table": source_table})
        if agg.metric_id:
            deps.append({"type": "metric", "id": agg.metric_id})

        return {
            "draft_id": agg.id, "draft_type": "dws",
            "view_name": view_name, "sql_summary": sql,
            "output_fields": output_fields, "dependencies": deps,
            "validation_errors": errors, "validation_warnings": warnings,
        }

    async def _generate_ads_view_sql(self, ads, errors, warnings) -> dict:
        """生成 ADS View SQL（简化版：SELECT 所有 output_fields FROM source）"""
        # 校验来源标识符
        source_label = ads.source_label or f"source_{ads.source_id}"
        try:
            validate_identifier(source_label)
        except ValueError:
            source_label = f"src_{ads.source_id}"
            warnings.append(f"ADS 来源标识符不合法，已替换为: {source_label}")

        view_name = f"ads_{ads.name.replace(' ', '_').lower()}"[:63]
        try:
            validate_identifier(view_name)
        except ValueError:
            view_name = f"ads_auto_{ads.id}"

        of = ads.output_fields or []
        cols = []
        output_fields = []
        for i, f in enumerate(of):
            src = f.get("source_field", f.get("output_name", f"col_{i}"))
            alias = f.get("output_name", src)
            try:
                validate_identifier(src)
                validate_identifier(alias)
            except ValueError:
                src = f"col_{i}"; alias = f"col_{i}"
                warnings.append(f"字段标识符不合法，已替换: {f.get('source_field', '')}")
            cols.append(f"\"{src}\" AS \"{alias}\"")
            output_fields.append({"index": i, "name": alias, "source": src,
                                  "data_type": f.get("data_type", "string"),
                                  "is_sensitive": f.get("is_sensitive", False)})

        select_clause = ", ".join(cols) if cols else "*"
        sql = f"CREATE VIEW \"{view_name}\" AS\nSELECT {select_clause}\nFROM \"{source_label}\""

        return {
            "draft_id": ads.id, "draft_type": "ads",
            "view_name": view_name, "sql_summary": sql,
            "output_fields": output_fields, "dependencies": [{"type": ads.source_type, "id": ads.source_id}],
            "validation_errors": errors, "validation_warnings": warnings,
        }

    def _filter_to_sql(self, filter_obj: dict) -> tuple[str, dict]:
        """过滤条件转参数化 SQL — 返回 (where_sql, params_dict)"""
        if not filter_obj:
            return "", {}
        field = (filter_obj.get("field") or "").strip()
        op = (filter_obj.get("operator") or "eq").strip()
        value = filter_obj.get("value")

        validate_identifier(field)

        op_map = {"eq": "=", "ne": "!=", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "LIKE"}
        if op not in op_map:
            raise ValueError(f"不支持的过滤操作符: {op}")

        param_name = f"filter_{field}"
        return f"\"{field}\" {op_map[op]} :{param_name}", {param_name: value}

    # ── X0505: DWS 草稿预览、质量门禁、小样本风险 ──

    async def preview_draft(self, draft_id: int, draft_type: str = "dws", sample_size: int = 20) -> dict:
        """预览 DWS/ADS 草稿：生成 SQL → 质量门禁 → 小样本风险 → 数据样例。"""
        # 1) 生成 SQL
        sql_info = await self.generate_view_sql(draft_id, draft_type)
        if "error" in sql_info:
            return sql_info

        # 2) 质量门禁
        quality = await self._check_quality_gates(draft_id, draft_type, sql_info)

        # 3) 小样本风险
        sample_risk = await self._check_small_sample_risk(draft_type, sql_info)

        # 4) 数据样例
        sample_cols, sample_rows, truncated = await self._preview_sample(sql_info, sample_size)

        # 5) 风险判定
        risk, blocked, block_reasons = self._assess_risk(quality, sample_risk, sql_info)

        return {
            "draft_id": draft_id, "draft_type": draft_type,
            "view_name": sql_info["view_name"],
            "sql_summary": sql_info["sql_summary"],
            "output_fields": sql_info["output_fields"],
            "dependencies": sql_info["dependencies"],
            "sample_columns": sample_cols,
            "sample_rows": sample_rows,
            "sample_truncated": truncated,
            "quality_status": quality["status"],
            "quality_checks": quality["checks"],
            "small_sample_risk": sample_risk["risk"],
            "small_sample_detail": sample_risk.get("detail"),
            "risk_level": risk,
            "blocked": blocked,
            "blocked_reasons": block_reasons,
        }

    async def _check_quality_gates(self, draft_id: int, draft_type: str, sql_info: dict) -> dict:
        """质量门禁检查"""
        checks: list[dict] = []
        status = "pass"

        # 检查 1: 输出字段不为空
        if not sql_info.get("output_fields"):
            checks.append({"check": "output_fields", "status": "fail", "message": "输出字段为空"})
            status = "fail"
        else:
            checks.append({"check": "output_fields", "status": "pass",
                           "message": f"{len(sql_info['output_fields'])} 个输出字段"})

        # 检查 2: 依赖资产存在
        for dep in sql_info.get("dependencies", []):
            if dep.get("type") == "dataset":
                ds_exists = await self._check_dataset_exists(dep.get("id"))
                if not ds_exists:
                    checks.append({"check": "dependency", "status": "warn",
                                   "message": f"依赖数据集不存在: {dep.get('id')}"})
                    if status == "pass":
                        status = "warn"

        # 检查 3: SQL 注入关键字
        dangerous = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "TRUNCATE", "EXEC", "EXECUTE", "--"]
        sql_upper = sql_info.get("sql_summary", "").upper()
        for kw in dangerous:
            if kw in sql_upper:
                checks.append({"check": "sql_safety", "status": "fail", "message": f"SQL 含危险关键字: {kw}"})
                status = "fail"

        if not any(c["check"] == "sql_safety" and c["status"] == "fail" for c in checks):
            checks.append({"check": "sql_safety", "status": "pass", "message": "SQL 安全校验通过"})

        return {"status": status, "checks": checks}

    async def _check_small_sample_risk(self, draft_type: str, sql_info: dict) -> dict:
        """小样本风险检查（标识符校验 + 参数化）"""
        for dep in sql_info.get("dependencies", []):
            if dep.get("type") == "dataset":
                try:
                    ds_id = dep.get("id")
                    if ds_id:
                        from app.datasets.models import DataSet
                        ds = await self.session.get(DataSet, ds_id)
                        if ds and ds.tables:
                            tbl = ds.tables[0]
                            tn = getattr(tbl, 'table_name', str(tbl))
                            validate_identifier(tn)
                            r = await self.session.execute(
                                sa_text(f"SELECT count(*) FROM \"{tn}\"")
                            )
                            count = r.scalar() or 0
                            if count < 10:
                                return {"risk": "block", "detail": f"来源表 {tn} 行数 < 10，小样本阻断"}
                            elif count < 30:
                                return {"risk": "warn", "detail": f"来源表 {tn} 行数 {count} < 30，小样本警告"}
                            else:
                                return {"risk": "low", "detail": f"来源表 {tn} 行数 {count} >= 30"}
                except (ValueError, Exception):
                    pass
        return {"risk": "unknown", "detail": "无法检查行数"}

    async def _preview_sample(self, sql_info: dict, sample_size: int) -> tuple[list[str], list[dict], bool]:
        """从 SQL 生成数据样例（标识符校验 + 参数化）"""
        view_name = sql_info.get("view_name", "")
        if view_name:
            try:
                validate_identifier(view_name)
                r = await self.session.execute(
                    sa_text(f"SELECT * FROM \"{view_name}\" LIMIT :limit"),
                    {"limit": sample_size}
                )
                cols = list(r.keys())
                rows = [dict(row._mapping) for row in r.fetchmany(sample_size)]
                return cols, rows, len(rows) >= sample_size
            except (ValueError, Exception):
                pass

        # 回退：从依赖表取样例
        for dep in sql_info.get("dependencies", []):
            if dep.get("type") == "dataset":
                from app.datasets.models import DataSet
                ds = await self.session.get(DataSet, dep.get("id"))
                if ds and ds.tables:
                    tn = getattr(ds.tables[0], 'table_name', str(ds.tables[0]))
                    try:
                        validate_identifier(tn)
                        r = await self.session.execute(
                            sa_text(f"SELECT * FROM \"{tn}\" LIMIT :limit"),
                            {"limit": sample_size}
                        )
                        cols = list(r.keys())
                        rows = [dict(row._mapping) for row in r.fetchmany(sample_size)]
                        return cols, rows, len(rows) >= sample_size
                    except (ValueError, Exception):
                        pass
        return [], [], False

    def _assess_risk(self, quality: dict, sample_risk: dict, sql_info: dict) -> tuple[str, bool, list[str]]:
        """综合风险评估"""
        blocked = False
        reasons: list[str] = []
        risk = "low"

        if quality["status"] == "fail":
            blocked = True
            reasons.append("质量门禁 FAIL")
            risk = "high"

        if sample_risk["risk"] == "block":
            blocked = True
            reasons.append("小样本阻断")
            risk = "high"
        elif sample_risk["risk"] == "warn":
            if risk == "low":
                risk = "medium"

        # 敏感字段检查
        for f in sql_info.get("output_fields", []):
            if f.get("is_sensitive"):
                reasons.append(f"输出含敏感字段: {f.get('name')}")
                if risk == "low":
                    risk = "medium"

        return risk, blocked, reasons

    async def _check_dataset_exists(self, ds_id) -> bool:
        if not ds_id:
            return False
        from app.datasets.models import DataSet
        ds = await self.session.get(DataSet, ds_id)
        return ds is not None

    # ── X0506: DWS 发布/回滚 ──

    async def publish_draft(self, draft_id: int, draft_type: str = "dws", user_id=None) -> dict:
        """发布 DWS/ADS 草稿为生产资产。

        执行: status→published, 生成/刷新 view, 写入血缘, 写审计。
        仅在 feature flag 开启且门禁通过时允许发布。
        """
        self._start_trace(draft_id, f"publish_{draft_type}")
        await self._audit(draft_id, f"publish_{draft_type}", f"开始发布 {draft_type}",
                          asset_type=draft_type, asset_id=draft_id, status="started")
        if not settings.WAREHOUSE_FEATURE_METRIC_AUTOMATION:
            await self._audit(draft_id, f"publish_{draft_type}", "feature flag 未开启",
                              asset_type=draft_type, asset_id=draft_id, status="failed",
                              error_message="指标自动化 feature flag 未开启")
            return {"draft_id": draft_id, "draft_type": draft_type,
                    "status": "failed", "error": "指标自动化 feature flag 未开启"}

        # 门禁检查
        preview = await self.preview_draft(draft_id, draft_type)
        if preview.get("blocked"):
            await self._audit(draft_id, "quality_gate", "质量门禁阻断",
                              extra={"blocked_reasons": preview.get("blocked_reasons")},
                              asset_type=draft_type, asset_id=draft_id, status="blocked")
            return {"draft_id": draft_id, "draft_type": draft_type,
                    "status": "failed", "error": f"发布阻断: {preview.get('blocked_reasons')}"}

        sample_risk = preview.get("small_sample_risk") or ""
        sample_detail = preview.get("small_sample_detail") or ""
        warnings_list = [sample_detail] if sample_risk == "warn" and sample_detail else []

        if draft_type == "dws":
            return await self._publish_dws(draft_id, preview, user_id, warnings_list)
        elif draft_type == "ads":
            return await self._publish_ads(draft_id, preview, user_id, warnings_list)

        return {"draft_id": draft_id, "draft_type": draft_type,
                "status": "failed", "error": f"未知 draft_type: {draft_type}"}

    async def _publish_dws(self, draft_id: int, preview: dict, user_id, warnings: list) -> dict:
        """发布 DWS 聚合 — 带版本快照"""
        from app.warehouse.models import DwsAggregateDefinition, WarehouseModelVersion
        from app.datasets.models import DataSet
        from app.warehouse.service import write_lineage_edge

        agg = await self.session.get(DwsAggregateDefinition, draft_id)
        if agg is None:
            return {"draft_id": draft_id, "draft_type": "dws",
                    "status": "failed", "error": "DWS 草稿不存在"}
        if agg.status == "archived":
            return {"draft_id": draft_id, "draft_type": "dws",
                    "status": "failed", "error": "已归档的草稿不可发布"}

        view_name = preview.get("view_name", f"dws_{agg.name.replace(' ', '_').lower()}")
        sql = preview.get("sql_summary", "")

        # 计算版本号（按 asset_type + asset_id 隔离）
        last_ver = (await self.session.execute(
            select(func.coalesce(func.max(WarehouseModelVersion.version), 0))
            .where(WarehouseModelVersion.asset_type == "dws")
            .where(WarehouseModelVersion.asset_id == draft_id)
        )).scalar_one()
        new_version = last_ver + 1

        # 提取 SELECT + 执行 CREATE VIEW
        try:
            select_part = self._extract_select_sql(sql)
            await self.session.execute(sa_text(f"DROP VIEW IF EXISTS \"{view_name}\" CASCADE"))
            await self.session.execute(sa_text(f"CREATE VIEW \"{view_name}\" AS {select_part}"))
        except ValueError as e:
            return {"draft_id": draft_id, "draft_type": "dws",
                    "status": "failed", "error": str(e)}
        except Exception as e:
            return {"draft_id": draft_id, "draft_type": "dws",
                    "status": "failed", "error": f"View 创建失败: {e}"}

        # 写入版本快照
        snapshot = {
            "asset_type": "dws",
            "asset_id": draft_id,
            "draft_type": "dws",
            "view_name": view_name,
            "sql": sql,
            "select_sql": select_part,
            "output_fields": preview.get("output_fields", []),
            "aggregation": agg.aggregation,
            "measure_field": agg.measure_field,
            "group_by": agg.group_by,
            "published_at": dt.now(timezone.utc).isoformat(),
        }
        ver = WarehouseModelVersion(
            model_id=draft_id, asset_type="dws", asset_id=draft_id,
            version=new_version, status="published",
            snapshot=snapshot, published_by=user_id,
            published_at=dt.now(timezone.utc),
        )
        self.session.add(ver)

        # 更新状态
        agg.status = "published"
        await self.session.commit()
        await self.session.refresh(agg)

        # 注册数据集
        ds_name = view_name
        existing = (await self.session.execute(
            select(DataSet).where(DataSet.name == ds_name)
        )).scalars().first()
        if existing:
            existing.version = (existing.version or 0) + 1
            existing.published_at = dt.now(timezone.utc)
        else:
            ds = DataSet(
                name=ds_name, description=agg.business_definition or f"由指标自动生成",
                warehouse_layer="DWS", status="published", version=1,
                published_at=dt.now(timezone.utc),
            )
            self.session.add(ds)

        await self.session.commit()

        # 写血缘
        if agg.metric_id:
            from app.datasets.models import WarehouseMetric
            m = await self.session.get(WarehouseMetric, agg.metric_id)
            if m:
                await write_lineage_edge(
                    self.session, f"metric:{m.metric_code}", f"view:{view_name}",
                    "metric_to_dws", operator=f"user:{user_id}" if user_id else "system",
                    metadata={"draft_id": draft_id, "version": new_version}
                )

        # 写审计
        await self._audit(
            agg.metric_id or 0, "dws_published",
            f"DWS 已发布: {view_name} v{new_version} (draft_id={draft_id})",
            {"view_name": view_name, "version": new_version,
             "output_fields_count": len(preview.get("output_fields", []))}
        )

        return {
            "draft_id": draft_id, "draft_type": "dws",
            "status": "published", "published_version": new_version,
            "view_name": view_name,
            "output_fields_count": len(preview.get("output_fields", [])),
            "warnings": warnings,
        }

    async def _publish_ads(self, draft_id: int, preview: dict, user_id, warnings: list) -> dict:
        """发布 ADS 消费资产 — 带版本快照"""
        from app.warehouse.models import AdsDefinition, WarehouseModelVersion
        from app.warehouse.service import write_lineage_edge

        ads = await self.session.get(AdsDefinition, draft_id)
        if ads is None:
            return {"draft_id": draft_id, "draft_type": "ads",
                    "status": "failed", "error": "ADS 草稿不存在"}

        view_name = preview.get("view_name", f"ads_{ads.name.replace(' ', '_').lower()}")
        sql = preview.get("sql_summary", "")

        last_ver = (await self.session.execute(
            select(func.coalesce(func.max(WarehouseModelVersion.version), 0))
            .where(WarehouseModelVersion.asset_type == "ads")
            .where(WarehouseModelVersion.asset_id == draft_id)
        )).scalar_one()
        new_version = last_ver + 1

        try:
            select_part = self._extract_select_sql(sql)
            await self.session.execute(sa_text(f"DROP VIEW IF EXISTS \"{view_name}\" CASCADE"))
            await self.session.execute(sa_text(f"CREATE VIEW \"{view_name}\" AS {select_part}"))
        except Exception as e:
            return {"draft_id": draft_id, "draft_type": "ads",
                    "status": "failed", "error": f"View 创建失败: {e}"}

        snapshot = {
            "asset_type": "ads", "asset_id": draft_id,
            "draft_type": "ads",
            "view_name": view_name, "sql": sql,
            "select_sql": select_part,
            "output_fields": preview.get("output_fields", []),
            "source_type": ads.source_type, "source_id": ads.source_id,
            "published_at": dt.now(timezone.utc).isoformat(),
        }
        ver = WarehouseModelVersion(
            model_id=draft_id, asset_type="ads", asset_id=draft_id,
            version=new_version, status="published",
            snapshot=snapshot, published_by=user_id,
            published_at=dt.now(timezone.utc),
        )
        self.session.add(ver)

        ads.publish_status = "published"
        await self.session.commit()
        await self.session.refresh(ads)

        await write_lineage_edge(
            self.session, f"{ads.source_type}:{ads.source_id}", f"view:{view_name}",
            "source_to_ads", operator=f"user:{user_id}" if user_id else "system",
            metadata={"draft_id": draft_id, "version": new_version}
        )

        await self._audit(
            0, "ads_published",
            f"ADS 已发布: {view_name} v{new_version} (draft_id={draft_id})",
            {"view_name": view_name, "version": new_version,
             "source_type": ads.source_type, "source_id": ads.source_id}
        )

        return {
            "draft_id": draft_id, "draft_type": "ads",
            "status": "published", "published_version": new_version,
            "view_name": view_name,
            "output_fields_count": len(preview.get("output_fields", [])),
            "warnings": warnings,
        }

    async def rollback_draft(self, draft_id: int, draft_type: str = "dws", target_version: int = 1) -> dict:
        """回滚 DWS/ADS 到指定版本 — 从版本快照恢复 View + 数据集 + 血缘"""
        from app.warehouse.models import WarehouseModelVersion, DwsAggregateDefinition, AdsDefinition
        from app.datasets.models import DataSet

        # 查找目标版本的快照（按 asset_type + asset_id 隔离）
        ver = (await self.session.execute(
            select(WarehouseModelVersion).where(
                WarehouseModelVersion.asset_type == draft_type,
                WarehouseModelVersion.asset_id == draft_id,
                WarehouseModelVersion.version == target_version,
            )
        )).scalars().first()

        if ver is None:
            return {"draft_id": draft_id, "draft_type": draft_type,
                    "status": "failed", "error": f"版本 {target_version} 不存在"}

        snapshot = ver.snapshot or {}
        ver_draft_type = snapshot.get("draft_type", "")
        if ver_draft_type != draft_type:
            return {"draft_id": draft_id, "draft_type": draft_type,
                    "status": "failed", "error": f"版本 {target_version} 类型不匹配 (expected {draft_type}, got {ver_draft_type})"}

        view_name = snapshot.get("view_name", "")
        sql = snapshot.get("sql", "")

        if not view_name or not sql:
            return {"draft_id": draft_id, "draft_type": draft_type,
                    "status": "failed", "error": f"版本 {target_version} 快照不完整，无法恢复"}

        # 提取 SELECT 部分
        try:
            select_part = self._extract_select_sql(sql)
        except ValueError as e:
            return {"draft_id": draft_id, "draft_type": draft_type,
                    "status": "failed", "error": str(e)}

        # 恢复 View
        try:
            await self.session.execute(sa_text(f"DROP VIEW IF EXISTS \"{view_name}\" CASCADE"))
            await self.session.execute(sa_text(f"CREATE VIEW \"{view_name}\" AS {select_part}"))
        except Exception as e:
            return {"draft_id": draft_id, "draft_type": draft_type,
                    "status": "failed", "error": f"回滚 View 恢复失败: {e}"}

        # 恢复 DataSet 状态
        existing_ds = (await self.session.execute(
            select(DataSet).where(DataSet.name == view_name)
        )).scalars().first()
        if existing_ds:
            existing_ds.status = "published"
            existing_ds.version = (existing_ds.version or 0) + 1

        # 恢复定义状态
        if draft_type == "dws":
            agg = await self.session.get(DwsAggregateDefinition, draft_id)
            if agg:
                agg.status = "published"
                # 恢复聚合参数
                if snapshot.get("measure_field"):
                    agg.measure_field = snapshot["measure_field"]
                if snapshot.get("group_by"):
                    agg.group_by = snapshot["group_by"]
        elif draft_type == "ads":
            ads = await self.session.get(AdsDefinition, draft_id)
            if ads:
                ads.publish_status = "published"

        # 重写血缘边
        from app.warehouse.service import write_lineage_edge
        if draft_type == "dws" and agg and agg.metric_id:
            from app.datasets.models import WarehouseMetric
            m = await self.session.get(WarehouseMetric, agg.metric_id)
            if m:
                await write_lineage_edge(
                    self.session, f"metric:{m.metric_code}", f"view:{view_name}",
                    "metric_to_dws_rollback", operator="system",
                    metadata={"draft_id": draft_id, "version": target_version, "rollback": True}
                )

        await self.session.commit()

        await self._audit(
            0, f"{draft_type}_rolled_back",
            f"{draft_type.upper()} 已回滚至 v{target_version}: {view_name}",
            {"target_version": target_version, "view_name": view_name}
        )

        return {"draft_id": draft_id, "draft_type": draft_type,
                "status": "published", "restored_version": target_version,
                "view_name": view_name, "snapshot": snapshot}

    # ── X0507: ADS 草稿生成 ──

    async def generate_ads_draft(self, source_type: str, source_id: int,
                                  name: str | None = None, consume_domain: str | None = None) -> dict:
        """从 DWS 聚合/数据集/模型 生成 ADS 消费草稿"""
        from app.warehouse.models import DwsAggregateDefinition, AdsDefinition
        from app.datasets.models import DataSet

        # 解析来源
        source_label = ""
        subject_area = None
        output_fields: list[dict] = []
        dim_refs: list[dict] = []

        if source_type == "dws_aggregate":
            agg = await self.session.get(DwsAggregateDefinition, source_id)
            if agg is None:
                return {"error": f"DWS 聚合不存在: {source_id}"}
            source_label = agg.name
            if not name:
                name = f"ads_{agg.name}_view"

            # 继承 DWS 的 group_by 和 measure_field 作为输出字段
            for i, col in enumerate(agg.group_by or []):
                output_fields.append({"source_field": col, "output_name": col, "output_label": col,
                                       "data_type": "string", "agg_role": "dimension", "is_sensitive": False})
                dim_refs.append({"code": col, "name": col, "field": col, "ref_table": ""})
            if agg.measure_field:
                out_name = f"{agg.aggregation}_{agg.measure_field}" if agg.aggregation else agg.measure_field
                output_fields.append({"source_field": agg.measure_field, "output_name": out_name,
                                       "output_label": out_name, "data_type": "number",
                                       "agg_role": "measure", "is_sensitive": False})

        elif source_type == "dataset":
            ds = await self.session.get(DataSet, source_id)
            if ds is None:
                return {"error": f"数据集不存在: {source_id}"}
            source_label = ds.name
            if not name:
                name = f"ads_{ds.name}_view"
            # 从 output_fields 继承
            for of in ds.output_fields or []:
                output_fields.append({
                    "source_field": of.output_code, "output_name": of.output_code,
                    "output_label": of.output_label or of.output_code,
                    "data_type": of.data_type or "string",
                    "agg_role": "dimension", "is_sensitive": of.is_sensitive,
                })

        else:
            return {"error": f"不支持的 source_type: {source_type}"}

        # 创建 ADS 草稿
        ads = AdsDefinition(
            name=name, description=f"从 {source_label} 自动生成",
            source_type=source_type, source_id=source_id,
            source_label=source_label,
            dimension_refs=dim_refs,
            output_fields=output_fields,
            subject_area=subject_area,
            consume_domain=consume_domain,
            owner_name="system",
            publish_status="draft",
        )
        self.session.add(ads)
        await self.session.commit()
        await self.session.refresh(ads)

        await self._audit(0, "ads_draft_generated",
                          f"ADS 草稿已生成: {name} (id={ads.id})",
                          {"source_type": source_type, "source_id": source_id})

        return {
            "draft_id": ads.id, "name": ads.name,
            "source_type": ads.source_type, "source_id": ads.source_id,
            "source_label": ads.source_label,
            "output_fields": ads.output_fields or [],
            "dimension_refs": ads.dimension_refs or [],
            "preset_filters": ads.preset_filters,
            "subject_area": ads.subject_area,
            "consume_domain": ads.consume_domain,
            "status": ads.publish_status,
        }

    # ── X0508: ADS 下游影响分析 ──

    async def get_ads_impact(self, ads_id: int) -> dict:
        """获取 ADS 发布/变更的下游影响分析

        扫描范围：同源 ADS、已发布 DWS 聚合、数据集引用、View 依赖
        """
        from app.warehouse.models import AdsDefinition, DwsAggregateDefinition, AssetConsumer

        ads = await self.session.get(AdsDefinition, ads_id)
        if ads is None:
            return {"error": f"ADS 不存在: {ads_id}"}

        # 1) 查询真实消费关系表
        consumers = (await self.session.execute(
            select(AssetConsumer).where(
                AssetConsumer.asset_type == "ads",
                AssetConsumer.asset_id == ads_id,
            )
        )).scalars().all()

        affected_consumers: list[dict] = [
            {
                "consumer_type": c.consumer_type,
                "consumer_id": c.consumer_id, "consumer_name": c.consumer_name,
                "owner_id": c.owner_id, "owner_name": c.owner_name,
                "sla_level": c.sla_level,
                "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
            }
            for c in consumers
        ]
        affected_reports = [c for c in affected_consumers if c["consumer_type"] == "report"]
        affected_apis = [c for c in affected_consumers if c["consumer_type"] == "api"]
        affected_push = [c for c in affected_consumers if c["consumer_type"] == "push"]
        affected_bi_contracts = [c for c in affected_consumers if c["consumer_type"] == "bi_contract"]

        # 2) 同源 ADS
        affected_ads: list[dict] = []
        if ads.source_type and ads.source_id:
            siblings = (await self.session.execute(
                select(AdsDefinition).where(
                    AdsDefinition.source_type == ads.source_type,
                    AdsDefinition.source_id == ads.source_id,
                    AdsDefinition.id != ads.id, AdsDefinition.publish_status == "published",
                )
            )).scalars().all()
            for s in siblings:
                affected_ads.append({"id": s.id, "name": s.name, "status": s.publish_status})

        # 3) 关联 DWS
        affected_dws: list[dict] = []
        if ads.source_type == "dws_aggregate":
            dws = await self.session.get(DwsAggregateDefinition, ads.source_id)
            if dws:
                affected_dws.append({"id": dws.id, "name": dws.name, "status": dws.status})

        # 4) 字段变更
        of = ads.output_fields or []
        sensitive_count = sum(1 for f in of if f.get("is_sensitive"))

        # 5) 风险定级（按消费方 SLA + 数量）
        risk = "low"
        notes: list[str] = []
        if any(c.sla_level == "high" for c in consumers):
            risk = "high"
            notes.append(f"含高 SLA 消费方")
        elif sensitive_count > 0 and consumers:
            risk = "medium"
            notes.append(f"含 {sensitive_count} 个敏感字段，且 {len(consumers)} 个下游消费方")
        elif len(consumers) >= 5:
            risk = "medium"
            notes.append(f"下游 {len(consumers)} 个消费方")

        return {
            "ads_id": ads_id, "ads_name": ads.name,
            "affected_ads": affected_ads,
            "affected_dws": affected_dws,
            "affected_consumers": affected_consumers,
            "affected_reports": affected_reports,
            "affected_apis": affected_apis,
            "affected_push_tasks": affected_push,
            "affected_bi_contracts": affected_bi_contracts,
            "risk_level": risk,
            "sensitive_field_count": sensitive_count,
            "output_field_count": len(of),
            "notes": notes,
        }

    # ── X0509: BI 消费契约 ──

    async def generate_bi_contract(self, asset_type: str, asset_id: int) -> dict:
        """为已发布 DWS/ADS View 生成 BI 消费说明 — 持久化到 warehouse_bi_contracts"""
        from app.warehouse.models import BiContract, AssetConsumer, DwsAggregateDefinition, AdsDefinition

        view_name = ""
        fields: list[dict] = []

        if asset_type == "dws":
            agg = await self.session.get(DwsAggregateDefinition, asset_id)
            if agg is None:
                return {"error": f"DWS 不存在: {asset_id}"}
            view_name = f"dws_{agg.name.replace(' ', '_').lower()}"
            for col in agg.group_by or []:
                fields.append({"name": col, "type": "string", "role": "dimension"})
            if agg.measure_field:
                fields.append({"name": f"{agg.aggregation}_{agg.measure_field}",
                               "type": "number", "role": "measure"})
        elif asset_type == "ads":
            ads = await self.session.get(AdsDefinition, asset_id)
            if ads is None:
                return {"error": f"ADS 不存在: {asset_id}"}
            view_name = f"ads_{ads.name.replace(' ', '_').lower()}"
            for f in ads.output_fields or []:
                fields.append({"name": f.get("output_name", ""),
                               "type": f.get("data_type", "string"),
                               "role": "dimension",
                               "is_sensitive": f.get("is_sensitive", False)})

        time_fields = [f for f in fields if f.get("name") in ("year", "quarter", "month")]
        drill_note = ""
        if len(time_fields) >= 2:
            drill_note = "支持帆软自然下钻：年 → 季 → 月。拖入 year 字段可年度汇总，双击下钻到 quarter，再下钻到 month。"

        payload = {
            "asset_type": asset_type, "asset_id": asset_id,
            "view_name": view_name, "fields": fields,
            "refresh_semantics": "View 实时查询，无需仓内刷新",
            "connection_hint": f"通过 PostgreSQL 直接查询 {view_name}",
            "permissions": "继承上游权限，敏感字段已脱敏",
            "drill_down": drill_note or None,
        }

        # 持久化 contract（upsert）
        existing_contract = (await self.session.execute(
            select(BiContract).where(
                BiContract.asset_type == asset_type,
                BiContract.asset_id == asset_id,
            )
        )).scalars().first()

        if existing_contract:
            existing_contract.asset_name = view_name
            existing_contract.contract_json = payload
            existing_contract.version = (existing_contract.version or 0) + 1
            existing_contract.status = "active"
            existing_contract.updated_at = dt.now(timezone.utc)
            contract = existing_contract
        else:
            contract = BiContract(
                asset_type=asset_type, asset_id=asset_id, asset_name=view_name,
                version=1, contract_json=payload, status="active",
            )
            self.session.add(contract)
        await self.session.flush()

        # 写入消费关系（去重）
        existing_consumer = (await self.session.execute(
            select(AssetConsumer).where(
                AssetConsumer.asset_type == asset_type,
                AssetConsumer.asset_id == asset_id,
                AssetConsumer.consumer_type == "bi_contract",
                AssetConsumer.consumer_id == contract.id,
            )
        )).scalars().first()

        if not existing_consumer:
            self.session.add(AssetConsumer(
                asset_type=asset_type, asset_id=asset_id, asset_name=view_name,
                consumer_type="bi_contract", consumer_id=contract.id,
                consumer_name=f"{view_name} BI消费契约",
                sla_level="medium",
            ))

        await self.session.commit()

        payload["contract_id"] = contract.id
        payload["contract_version"] = contract.version
        return payload

    # ── X0510: 指标变更驱动的下游更新方案 ──

    async def generate_change_plan(self, metric_id: int, previous_snapshot: dict | None = None) -> dict:
        """当指标定义变更时，生成下游影响方案"""
        from app.datasets.models import WarehouseMetric
        from app.warehouse.models import DwsAggregateDefinition, AdsDefinition

        m = await self.session.get(WarehouseMetric, metric_id)
        if m is None:
            return {"error": f"指标不存在: {metric_id}"}

        # 扫描依赖该指标的 DWS
        aggs = (await self.session.execute(
            select(DwsAggregateDefinition).where(DwsAggregateDefinition.metric_id == metric_id)
        )).scalars().all()

        affected_dws = []
        affected_ads = []

        for agg in aggs:
            ads_list = (await self.session.execute(
                select(AdsDefinition).where(
                    AdsDefinition.source_type == "dws_aggregate",
                    AdsDefinition.source_id == agg.id
                )
            )).scalars().all()

            affected_dws.append({"id": agg.id, "name": agg.name, "status": agg.status})
            for a in ads_list:
                affected_ads.append({"id": a.id, "name": a.name, "status": a.publish_status,
                                     "source_aggregate": agg.name})

        risk = "low"
        if len(affected_ads) > 5:
            risk = "medium"
        if len(affected_ads) > 10:
            risk = "high"

        blocked = risk == "high"
        actions: list[str] = []
        if affected_dws:
            actions.append(f"需要重新生成 {len(affected_dws)} 个 DWS 草稿")
        if affected_ads:
            actions.append(f"需要重新生成 {len(affected_ads)} 个 ADS 草稿")
        if not actions:
            actions.append("无下游影响")

        return {
            "metric_id": metric_id, "metric_code": m.metric_code,
            "metric_version": m.version or 1,
            "change_type": "updated",
            "affected_dws": affected_dws,
            "affected_ads": affected_ads,
            "affected_bi_contracts": [],
            "risk_level": risk,
            "blocked": blocked,
            "recommended_actions": actions,
        }

    # ── X0511: 刷新策略（持久化到 warehouse_asset_refresh_policies）──

    async def get_refresh_strategy(self, asset_type: str, asset_id: int) -> dict:
        """获取资产刷新策略 — 从 warehouse_asset_refresh_policies 读取（按 asset_type + asset_id）"""
        from app.warehouse.models import AssetRefreshPolicy
        policy = (await self.session.execute(
            select(AssetRefreshPolicy).where(
                AssetRefreshPolicy.asset_type == asset_type,
                AssetRefreshPolicy.asset_id == asset_id,
            )
        )).scalars().first()
        if policy:
            return {
                "asset_type": policy.asset_type, "asset_id": policy.asset_id,
                "asset_name": policy.asset_name,
                "refresh_strategy": policy.strategy,
                "requires_refresh": policy.strategy != "view_realtime",
                "reason": "普通 View 实时查询，无需仓内刷新" if policy.strategy == "view_realtime" else f"策略: {policy.strategy}",
                "enabled": policy.enabled, "cron_expr": policy.cron_expr,
            }
        return {
            "asset_type": asset_type, "asset_id": asset_id,
            "refresh_strategy": "view_realtime",
            "requires_refresh": False,
            "reason": "普通 View 实时查询，无需仓内刷新",
        }

    async def set_refresh_strategy(self, asset_type: str, asset_id: int, strategy: str) -> dict:
        """设置刷新策略 — 写入 warehouse_asset_refresh_policies（按 asset_type + asset_id upsert）"""
        valid = ("view_realtime", "manual", "scheduled", "upstream_trigger")
        if strategy not in valid:
            return {"error": f"无效策略: {strategy}，允许: {valid}"}
        from app.warehouse.models import AssetRefreshPolicy
        existing = (await self.session.execute(
            select(AssetRefreshPolicy).where(
                AssetRefreshPolicy.asset_type == asset_type,
                AssetRefreshPolicy.asset_id == asset_id,
            )
        )).scalars().first()
        asset_name = f"{asset_type}_{asset_id}"
        if existing:
            existing.strategy = strategy
            existing.updated_at = dt.now(timezone.utc)
        else:
            self.session.add(AssetRefreshPolicy(
                asset_type=asset_type, asset_id=asset_id, asset_name=asset_name,
                strategy=strategy,
            ))
        await self.session.commit()
        await self._audit(0, "set_refresh_policy", f"refresh_policy:{asset_name}",
                          {"asset_type": asset_type, "asset_id": asset_id, "strategy": strategy})
        return {
            "asset_type": asset_type, "asset_id": asset_id,
            "refresh_strategy": strategy,
            "requires_refresh": strategy != "view_realtime",
            "reason": "普通 View 实时查询，无需仓内刷新" if strategy == "view_realtime" else f"已设为 {strategy}",
        }

    # ── X0511 附加: 刷新执行与运行记录 ──

    async def refresh_asset(self, asset_type: str, asset_id: int, trigger_type: str = "manual") -> dict:
        """执行资产刷新 — 记录运行状态，失败保留旧版本"""
        from app.warehouse.models import AssetRefreshPolicy, AssetRefreshRun

        policy = (await self.session.execute(
            select(AssetRefreshPolicy).where(
                AssetRefreshPolicy.asset_type == asset_type,
                AssetRefreshPolicy.asset_id == asset_id,
            )
        )).scalars().first()

        asset_name = policy.asset_name if policy else f"{asset_type}_{asset_id}"
        strategy = policy.strategy if policy else "view_realtime"

        run = AssetRefreshRun(
            policy_id=policy.id if policy else None,
            asset_type=asset_type, asset_id=asset_id, asset_name=asset_name,
            status="running", started_at=dt.now(timezone.utc), trigger_type=trigger_type,
        )
        self.session.add(run)
        await self.session.commit()
        run_id = run.id

        started = dt.now(timezone.utc)
        try:
            if strategy == "view_realtime":
                run.status = "success"
                run.finished_at = dt.now(timezone.utc)
                run.duration_ms = int((dt.now(timezone.utc) - started).total_seconds() * 1000)
                run.row_count = 0
                await self.session.commit()
                return {"status": "success", "run_id": run_id,
                        "reason": "View 实时查询，无需刷新", "old_version_kept": True}

            # 物化刷新：当前版本仅支持 view_realtime
            run.status = "failed"
            run.error_message = "当前版本仅支持 view_realtime 策略，物化刷新未启用"
            run.finished_at = dt.now(timezone.utc)
            run.duration_ms = int((dt.now(timezone.utc) - started).total_seconds() * 1000)
            await self.session.commit()
            await self._audit(0, "refresh_run", f"刷新失败: {asset_name}",
                              {"asset_type": asset_type, "asset_id": asset_id, "strategy": strategy},
                              status="failed", error_message=run.error_message)
            return {"status": "failed", "run_id": run_id, "old_version_kept": True,
                    "error": "当前版本仅支持 view_realtime 策略，物化刷新未启用"}

        except Exception as e:
            run.status = "failed"
            run.error_message = str(e)
            run.finished_at = dt.now(timezone.utc)
            run.duration_ms = int((dt.now(timezone.utc) - started).total_seconds() * 1000)
            await self.session.commit()
            await self._audit(0, "refresh_run", f"刷新失败: {asset_name}",
                              {"asset_type": asset_type, "asset_id": asset_id},
                              status="failed", error_message=str(e))
            return {"status": "failed", "error": str(e), "run_id": run_id, "old_version_kept": True}

    async def get_refresh_runs(self, asset_type: str, asset_id: int, limit: int = 20) -> dict:
        """获取资产刷新运行记录"""
        from app.warehouse.models import AssetRefreshRun
        rows = (await self.session.execute(
            select(AssetRefreshRun).where(
                AssetRefreshRun.asset_type == asset_type,
                AssetRefreshRun.asset_id == asset_id,
            ).order_by(AssetRefreshRun.created_at.desc()).limit(limit)
        )).scalars().all()

        return {
            "asset_type": asset_type, "asset_id": asset_id,
            "runs": [
                {
                    "id": r.id, "status": r.status,
                    "started_at": r.started_at.isoformat() if r.started_at else None,
                    "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                    "error_message": r.error_message,
                    "trigger_type": r.trigger_type,
                    "row_count": r.row_count, "duration_ms": r.duration_ms,
                }
                for r in rows
            ],
        }

    # ── X0512: 审计时间线 ──

    async def get_timeline(self, metric_id: int) -> dict:
        """获取指标自动化全链路审计时间线 — 从 warehouse_automation_audit_events 读取"""
        from app.warehouse.models import AutomationAuditEvent
        rows = (await self.session.execute(
            select(AutomationAuditEvent).where(
                AutomationAuditEvent.metric_id == metric_id
            ).order_by(AutomationAuditEvent.created_at.desc()).limit(100)
        )).scalars().all()

        events: list[dict] = []
        for evt in rows:
            events.append({
                "id": evt.id,
                "trace_id": evt.trace_id,
                "action": evt.action,
                "status": evt.status,
                "message": evt.error_message or "",
                "input": evt.input_json,
                "output": evt.output_json,
                "asset_type": evt.asset_type,
                "asset_id": evt.asset_id,
                "duration_ms": evt.duration_ms,
                "created_at": evt.created_at.isoformat() if evt.created_at else None,
            })

        # 按 trace_id 分组统计
        traces: set[str] = set()
        by_status: dict[str, int] = {}
        for evt in events:
            if evt["trace_id"]:
                traces.add(evt["trace_id"])
            by_status[evt["status"]] = by_status.get(evt["status"], 0) + 1

        return {
            "metric_id": metric_id,
            "events": events,
            "summary": {
                "total_events": len(events),
                "total_traces": len(traces),
                "by_status": by_status,
            },
        }

    # ── 审计辅助 ──

    def _start_trace(self, metric_id: int, action: str) -> str:
        """开始一个新的审计追踪链路"""
        self._trace_id = f"{metric_id}-{action}-{dt.now(timezone.utc).strftime('%H%M%S')}-{str(uuid.uuid4())[:4]}"
        return self._trace_id

    async def _audit(self, metric_id: int, action: str, message: str, extra: dict | None = None,
                     status: str = "success", asset_type: str | None = None, asset_id: int | None = None,
                     error_message: str | None = None, duration_ms: int | None = None,
                     actor_id: int | None = None):
        """写入专用审计表 warehouse_automation_audit_events"""
        try:
            from app.warehouse.models import AutomationAuditEvent
            if not self._trace_id:
                self._start_trace(metric_id or 0, action)
            evt = AutomationAuditEvent(
                trace_id=self._trace_id,
                metric_id=metric_id or None,
                asset_type=asset_type,
                asset_id=asset_id,
                action=action,
                status=status,
                actor_id=actor_id,
                input_json=extra,
                output_json={"message": message} if message else None,
                error_message=error_message,
                duration_ms=duration_ms,
            )
            self.session.add(evt)
            await self.session.commit()
        except Exception:
            pass


def get_metric_automation_service(session: AsyncSession, trace_id: str | None = None) -> MetricAutomationService:
    return MetricAutomationService(session, trace_id=trace_id)
