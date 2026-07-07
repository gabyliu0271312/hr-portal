# -*- coding: utf-8 -*-
"""数据仓库业务逻辑层 — 统一入口

子模块按业务阶段组织：
  _utils.py          — SQL 安全工具 + DWD 视图 SQL 表达式
  assets.py          — WarehouseService（资产 CRUD）
  standardization.py — 标准化规则 + 模板
  modeling.py        — 指标计算 + 维度 + DWS 聚合
  materialization.py — 快照 + SCD
  consumption.py     — ADS 组装 + 发布

所有 import 路径保持向后兼容：
  from app.warehouse.service import get_snapshot_service  # 仍然有效
"""
import re

# ── 公共常量 ──
DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 200

# ── SQL 安全工具 ──
_IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


def _quote_ident(name: str) -> str:
    """安全引用 SQL 标识符（表名/字段名）。"""
    name = name.strip().strip('`').strip()
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"非法 SQL 标识符: {name!r}")
    return f"`{name}`"


def validate_identifier(name: str) -> str:
    """校验 SQL 标识符，合法返回原值，非法抛 ValueError。"""
    name = name.strip().strip('`').strip()
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"非法标识符: {name!r}，仅允许字母、数字、下划线，且不能以数字开头")
    return name


# ── DWD 视图 SQL 表达式 ──

def _rule_to_sql_expr(rule, src_field: str, tgt_field: str) -> str:
    """将一条标准化规则转换为 SQL 表达式片段。支持全部 8 类规则。"""
    rt = rule.rule_type
    cfg = rule.rule_config or {}

    if rt == "rename":
        return f"t.`{src_field}` AS `{tgt_field}`"

    if rt == "type_convert":
        target_type = cfg.get("target_type", "string")
        mysql_type = {"int": "SIGNED INTEGER", "float": "DECIMAL(20,4)", "string": "CHAR"}.get(target_type, "CHAR")
        return f"CAST(t.`{src_field}` AS {mysql_type}) AS `{tgt_field}`"

    if rt == "value_map":
        mappings = cfg.get("mappings", {})
        unmapped = cfg.get("unmapped", "keep")
        parts = [f"WHEN '{sv}' THEN '{tv}'" for sv, tv in mappings.items()]
        else_c = "ELSE NULL" if unmapped == "set_null" else f"ELSE t.`{src_field}`"
        return f"CASE t.`{src_field}` {' '.join(parts)} {else_c} END AS `{tgt_field}`"

    if rt == "unit_convert":
        multiplier = cfg.get("multiplier", 1)
        return f"(t.`{src_field}` * {multiplier}) AS `{tgt_field}`"

    if rt == "split_merge":
        action = cfg.get("action", "merge")
        if action == "merge":
            sources = cfg.get("sources", [])
            delim = cfg.get("delimiter", "")
            src_parts = ", ".join([f"t.`{s}`" for s in sources])
            return f"CONCAT_WS('{delim}', {src_parts}) AS `{tgt_field}`"

    if rt == "deduplicate":
        return f"t.`{src_field}` AS `{tgt_field}` -- deduplicate handled by outer SELECT DISTINCT / ROW_NUMBER"

    if rt == "null_handling":
        strategy = cfg.get("strategy", "fill_default")
        default_val = cfg.get("default", "")
        if strategy == "fill_default":
            return f"COALESCE(t.`{src_field}`, '{default_val}') AS `{tgt_field}`"
        return f"t.`{src_field}` AS `{tgt_field}`"

    if rt == "format_standardize":
        fmt = cfg.get("format", "lower")
        if fmt == "lower":
            return f"LOWER(t.`{src_field}`) AS `{tgt_field}`"
        if fmt == "upper":
            return f"UPPER(t.`{src_field}`) AS `{tgt_field}`"
        if fmt == "trim":
            return f"TRIM(t.`{src_field}`) AS `{tgt_field}`"
        if fmt == "truncate":
            return f"LEFT(t.`{src_field}`, {cfg.get('max_length', 255)}) AS `{tgt_field}`"
        if fmt == "pad":
            fn = "LPAD" if cfg.get("side", "left") == "left" else "RPAD"
            return f"{fn}(t.`{src_field}`, {cfg.get('length', 10)}, '{cfg.get('pad_char', ' ')}') AS `{tgt_field}`"
        if fmt == "regex":
            return f"REGEXP_REPLACE(t.`{src_field}`, '{cfg.get('pattern', '')}', '{cfg.get('replacement', '')}') AS `{tgt_field}`"
        if fmt == "date":
            return f"STR_TO_DATE(t.`{src_field}`, '{cfg.get('from_format', '%Y%m%d')}') AS `{tgt_field}`"

    return f"t.`{src_field}` AS `{tgt_field}`"


# ── 血缘边写入（Z02）────────────────────────

async def write_lineage_edge(db, source_asset: str, target_asset: str, operation: str, operator: str = "", run_id: int = None, metadata: dict = None):
    """在关键操作执行成功后写入血缘边记录。

    P0-5: metadata 包含 definition_id / rule_ids / version 等可解释上下文。
    """
    from app.warehouse.models import WarehouseLineageEdge
    edge = WarehouseLineageEdge(
        source_asset=source_asset,
        target_asset=target_asset,
        operation=operation,
        operator=operator or "system",
        run_id=run_id,
        metadata=metadata,
    )
    db.add(edge)


# ── 向后兼容：从各子模块 re-export ──

from app.warehouse.service.assets import WarehouseService, get_warehouse_service
from app.warehouse.service.standardization import (
    StandardizationRuleService, get_standardization_rule_service,
    StandardizationTemplateService, get_standardization_template_service,
)
from app.warehouse.service.modeling import (
    MetricComputeService, get_metric_compute_service,
    DimensionService, get_dimension_service,
    DwsAggregateService, get_dws_aggregate_service,
)
from app.warehouse.service.materialization import (
    SnapshotService, get_snapshot_service,
    ScdService, get_scd_service,
)
from app.warehouse.service.consumption import AdsService, get_ads_service
