# -*- coding: utf-8 -*-
"""标准化规则 + 模板服务"""
from __future__ import annotations

from datetime import UTC, date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# ==================== 标准化规则 (R01) ====================

STANDARDIZATION_RULE_TYPES = ("rename", "type_convert", "value_map", "unit_convert", "split_merge", "deduplicate", "null_handling", "format_standardize")

# PostgreSQL/asyncpg rejects a single prepared statement with more than 32767
# bind parameters. Standardization writes one INSERT statement per batch where
# parameter count = row_count * column_count, so wide HR salary tables can exceed
# the driver limit even with a seemingly safe fixed 1000-row batch. Keep a small
# margin below the hard limit for dialect-generated/internal parameters.
MAX_INSERT_BIND_PARAMS = 30000
DEFAULT_INSERT_BATCH_ROWS = 1000


def _safe_insert_batch_size(column_count: int, *, max_rows: int = DEFAULT_INSERT_BATCH_ROWS) -> int:
    """Return a batch row count that stays under asyncpg's bind parameter cap."""
    if column_count <= 0:
        return 1
    return max(1, min(max_rows, MAX_INSERT_BIND_PARAMS // column_count))


def _quote_ident(identifier: str) -> str:
    """Quote a PostgreSQL identifier used in application-built DWD DDL/DML."""
    return '"' + str(identifier).replace('"', '""') + '"'


def _is_tz_aware(value: datetime) -> bool:
    return value.tzinfo is not None and value.utcoffset() is not None


def _infer_sql_type(value: Any) -> str:
    """Infer a PostgreSQL column type for cleaned DWD physical tables."""
    if isinstance(value, bool):
        return "BOOLEAN"
    if isinstance(value, int) and not isinstance(value, bool):
        return "BIGINT"
    if isinstance(value, Decimal):
        return "NUMERIC"
    if isinstance(value, float):
        return "DOUBLE PRECISION"
    if isinstance(value, datetime):
        return "TIMESTAMPTZ" if _is_tz_aware(value) else "TIMESTAMP"
    if isinstance(value, date):
        return "DATE"
    return "TEXT"


def _merge_sql_types(types: set[str]) -> str:
    """Merge per-value inferred types into one safe PostgreSQL column type."""
    if not types:
        return "TEXT"
    if len(types) == 1:
        return next(iter(types))

    if "TEXT" in types:
        return "TEXT"

    datetime_types = {"TIMESTAMPTZ", "TIMESTAMP", "DATE"}
    if types <= datetime_types:
        if "TIMESTAMPTZ" in types:
            return "TIMESTAMPTZ"
        if "TIMESTAMP" in types:
            return "TIMESTAMP"
        return "DATE"

    numeric_types = {"BIGINT", "NUMERIC", "DOUBLE PRECISION"}
    if types <= numeric_types:
        if "DOUBLE PRECISION" in types:
            return "DOUBLE PRECISION"
        if "NUMERIC" in types:
            return "NUMERIC"
        return "BIGINT"

    # Mixed boolean/date/numeric/etc. is safest as TEXT instead of risking
    # asyncpg bind errors during a full rebuild.
    return "TEXT"


def _ordered_output_columns(rows: list[dict]) -> list[str]:
    """Return union of output columns preserving first-seen row/key order."""
    columns: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for col in row.keys():
            if col not in seen:
                seen.add(col)
                columns.append(col)
    return columns


def _infer_column_types(rows: list[dict]) -> dict[str, str]:
    """Infer each output column from all non-null values.

    Some HR source fields (for example synced_at/hire_date) may be null on the
    first row and datetime/date on later rows. Inferring from only the first row
    creates TEXT columns and asyncpg then rejects datetime values for TEXT binds.
    Also scan all rows so mixed aware/naive datetime columns choose TIMESTAMPTZ.
    """
    if not rows:
        return {}
    columns = _ordered_output_columns(rows)
    inferred: dict[str, str] = {}
    for col in columns:
        value_types = {
            _infer_sql_type(row.get(col))
            for row in rows
            if row.get(col) is not None
        }
        inferred[col] = _merge_sql_types(value_types)
    return inferred


def _coerce_insert_value(value: Any, sql_type: str) -> Any:
    """Normalize values for asyncpg text() inserts into the inferred SQL type."""
    if value is None:
        return None
    if sql_type == "TEXT" and not isinstance(value, str):
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        return str(value)
    if sql_type == "TIMESTAMPTZ":
        if isinstance(value, datetime):
            return value if _is_tz_aware(value) else value.replace(tzinfo=UTC)
        if isinstance(value, date):
            return datetime.combine(value, time.min, tzinfo=UTC)
    if sql_type == "TIMESTAMP":
        if isinstance(value, datetime):
            if _is_tz_aware(value):
                return value.astimezone(UTC).replace(tzinfo=None)
            return value
        if isinstance(value, date):
            return datetime.combine(value, time.min)
    if sql_type == "DATE" and isinstance(value, datetime):
        return value.date()
    if sql_type == "DOUBLE PRECISION" and isinstance(value, Decimal):
        return float(value)
    return value


def _to_table_column_data_type(sql_type: str) -> str:
    """Map physical PostgreSQL type back to table_columns.data_type values."""
    if sql_type in ("BIGINT", "INTEGER", "NUMERIC", "DOUBLE PRECISION"):
        return "number"
    if sql_type == "DATE":
        return "date"
    if sql_type in ("TIMESTAMP", "TIMESTAMPTZ"):
        return "datetime"
    if sql_type == "BOOLEAN":
        return "bool"
    return "string"


class StandardizationRuleService:
    """ODS→DWD 标准化规则 CRUD + 预览 + 执行 + DWD 视图生成"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def _get_layer(self, table_name: str) -> str | None:
        from app.data.models import RegisteredTable
        r = await self.session.scalar(select(RegisteredTable).where(RegisteredTable.table_name == table_name))
        return r.warehouse_layer if r else None

    @staticmethod
    def _derive_dwd_name(asset_code: str) -> str:
        """基于命名约定推导 DWD 标准表名。"""
        for prefix in ("ods_", "raw_", "src_"):
            if asset_code.lower().startswith(prefix):
                return "dwd_" + asset_code[len(prefix):]
        return "dwd_" + asset_code

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
        source_layer = await self._get_layer(asset_code)
        if source_layer not in ("ODS", "DWD"):
            return {"error": f"数据清洗仅支持 ODS/DWD 来源表，当前表层级为 {source_layer or '未注册'}"}
        try:
            result = await self.session.execute(sa_text(f'SELECT * FROM "{asset_code}" LIMIT {sample_size}'))
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

    async def _sync_dwd_dataset_fields(self, *, asset_code: str, target_table: str | None = None, commit: bool = False) -> dict | None:
        """同步 DWD 单表数据集输出字段；默认不提交，供执行链路纳入同一事务。"""
        from app.warehouse.models import StandardizationRule
        from app.datasets.models import DataSet, DataSetTable, DatasetOutputField
        from sqlalchemy import delete as sa_delete

        q = select(StandardizationRule).where(
            StandardizationRule.asset_code == asset_code,
            StandardizationRule.enabled == True,
        ).order_by(StandardizationRule.display_order)
        rules = (await self.session.execute(q)).scalars().all()
        if not rules:
            return None

        dwd_table = target_table or self._derive_dwd_name(asset_code)
        ds_row = (
            await self.session.execute(
                select(DataSet, DataSetTable.alias)
                .join(DataSetTable, DataSetTable.dataset_id == DataSet.id)
                .where(DataSetTable.table_name == dwd_table)
                .order_by(
                    (DataSet.warehouse_layer == "DWD").desc(),
                    DataSet.id,
                    DataSetTable.id,
                )
            )
        ).first()
        if ds_row is None:
            return {"error": "no_dwd_dataset", "detail": f"未找到 DWD 数据集（{dwd_table}），请先检查 datasets/dataset_tables 关联"}
        ds, source_alias = ds_row

        ds.warehouse_layer = "DWD"
        ds.status = "published"
        ds.version = (ds.version or 1) + 1
        await self.session.execute(sa_delete(DatasetOutputField).where(DatasetOutputField.dataset_id == ds.id))

        seen = set()
        display_order = 0
        for r in rules:
            cfg = r.rule_config or {}
            if cfg.get("output_enabled") is False:
                continue
            target_col = r.target_field or r.source_field
            if not target_col or target_col in seen:
                continue
            seen.add(target_col)
            label = cfg.get("output_label") or r.description or target_col
            desc = cfg.get("output_description") or ""
            self.session.add(DatasetOutputField(
                dataset_id=ds.id,
                source_alias=source_alias,
                source_column=target_col,
                output_code=target_col,
                output_label=label,
                data_type="string",
                agg_role="dimension",
                description=desc,
                display_order=display_order,
            ))
            display_order += 10

        if commit:
            await self.session.commit()
            await self.session.refresh(ds)
        return {"dataset_id": ds.id, "view_name": ds.name, "version": ds.version, "field_count": len(seen)}

    async def execute_full(self, *, asset_code: str, target_table: str | None = None) -> dict:
        """全量执行 ODS→DWD 标准化并写入目标物理表。"""
        from app.warehouse.models import StandardizationRule
        from app.warehouse.standardization_engine import execute_rules
        from app.data.models import RegisteredTable, TableColumn
        from sqlalchemy import text as sa_text, delete as sa_delete

        # P0: 校验来源层级 — 仅允许 ODS 或 DWD
        source_layer = await self._get_layer(asset_code)
        if source_layer not in ("ODS", "DWD"):
            return {"error": "invalid_source", "detail": f"数据清洗仅支持 ODS/DWD 来源表，当前表层级为 {source_layer or '未注册'}"}

        # 推导目标表名
        if not target_table:
            target_table = self._derive_dwd_name(asset_code)

        q = select(StandardizationRule).where(StandardizationRule.asset_code == asset_code, StandardizationRule.enabled == True).order_by(StandardizationRule.display_order)
        rules = (await self.session.execute(q)).scalars().all()
        if not rules: return {"error": "no_rules", "detail": f"表 {asset_code} 没有启用的标准化规则"}
        try:
            result = await self.session.execute(sa_text(f'SELECT * FROM "{asset_code}"'))
            rows_raw = result.fetchall()
            if not rows_raw: return {"error": "empty", "detail": "ODS 表无数据", "total": 0, "success": 0, "failed": 0, "errors": [], "target_table": target_table}
            cols = list(result.keys())
            rows = [dict(zip(cols, row)) for row in rows_raw]
        except Exception as e: return {"error": "read_failed", "detail": str(e)}
        total = len(rows)
        try: transformed = execute_rules(rules, rows)
        except Exception as e: return {"error": "transform_failed", "detail": str(e), "total": total, "success": 0, "failed": total, "errors": []}
        success = len(transformed); failed = total - success
        target = target_table.strip().replace('"', "")
        # P0: 校验目标层级 — 目标表若已注册，必须是 DWD 层
        target_layer = await self._get_layer(target)
        if target_layer and target_layer != "DWD":
            return {"error": "invalid_target", "detail": f"目标表 {target} 已注册为 {target_layer} 层，数据清洗目标必须是 DWD"}
        try:
            # P0-1: DDL 安全校验 — DROP+CREATE = REPLACE 语义
            from app.warehouse.layer_policy import validate_ddl_operation, validate_layer_transition, DDL_REPLACE, DDL_CREATE
            validate_layer_transition("ODS", "DWD", "standardize")
            existing = await self._get_layer(target)
            if existing is not None:
                await validate_ddl_operation(self.session, target, DDL_REPLACE)
            else:
                await validate_ddl_operation(self.session, target, DDL_CREATE, target_layer="DWD")
            await self.session.execute(sa_text(f'DROP TABLE IF EXISTS "{target}"'))
            if transformed:
                bcols = _ordered_output_columns(transformed)
                column_types = _infer_column_types(transformed)
                col_defs = []
                for k in bcols:
                    col_defs.append(f'{_quote_ident(k)} {column_types.get(k, "TEXT")}')
                await self.session.execute(sa_text(f'CREATE TABLE {_quote_ident(target)} ({", ".join(col_defs)})'))
                batch_size = _safe_insert_batch_size(len(bcols))
                for bs in range(0, len(transformed), batch_size):
                    batch = transformed[bs:bs + batch_size]
                    # Use generated bind names instead of raw column names so columns
                    # containing spaces, punctuation, or non-ASCII characters remain safe.
                    placeholders = ", ".join([
                        f"({', '.join([f':p_{i}_{j}' for j, _c in enumerate(bcols)])})"
                        for i in range(len(batch))
                    ])
                    params = {}
                    for i, row in enumerate(batch):
                        for j, c in enumerate(bcols):
                            params[f"p_{i}_{j}"] = _coerce_insert_value(row.get(c), column_types.get(c, "TEXT"))
                    await self.session.execute(sa_text(f'INSERT INTO {_quote_ident(target)} ({", ".join([_quote_ident(c) for c in bcols])}) VALUES {placeholders}'), params)
            # P0-1: 注册 DWD 目标表 — 在同一事务内，失败则回滚全部
            existing_rt = (await self.session.execute(
                select(RegisteredTable).where(RegisteredTable.table_name == target)
            )).scalars().first()
            if existing_rt is not None:
                existing_rt.warehouse_layer = "DWD"
            else:
                self.session.add(RegisteredTable(table_name=target, table_label=target, warehouse_layer="DWD", source_system="数据加工", asset_status="published"))
            await self.session.flush()
            from app.data.dynamic_loader import register_source_table_model
            await register_source_table_model(self.session, target, force=True)
            await self.session.execute(sa_delete(TableColumn).where(TableColumn.table_name == target))
            seen = set()
            for i, r in enumerate(rules):
                tgt = r.target_field or r.source_field
                if tgt in seen: continue
                seen.add(tgt)
                self.session.add(TableColumn(
                    table_name=target,
                    column_code=tgt,
                    column_label=tgt,
                    data_type=_to_table_column_data_type(column_types.get(tgt, "TEXT")) if transformed else "string",
                    is_visible=True,
                    display_order=(i + 1) * 10,
                ))
            # Z02: 血缘写入与主流程同一事务
            from app.warehouse.service import write_lineage_edge
            rule_ids = [r.id for r in rules]
            await write_lineage_edge(self.session, asset_code, target, "standardize", metadata={
                "definition_id": None, "rule_ids": rule_ids, "version": 1,
            })
            # P2/P3 收口：执行成功后同步 DWD 单表数据集输出字段，避免额外“发布 DWD 视图”动作。
            sync_result = await self._sync_dwd_dataset_fields(asset_code=asset_code, target_table=target, commit=False)
            if sync_result and sync_result.get("error"):
                raise RuntimeError(sync_result.get("detail") or "DWD 数据集字段同步失败")
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            return {"error": "write_failed", "detail": str(e)[:500], "total": total, "success": 0, "failed": total, "target_table": target, "errors": []}
        # P0-3: 空结果警告
        result = {"total": total, "success": success, "failed": failed, "errors": [], "target_table": target}
        if success == 0:
            result["warning"] = "标准化结果为空（0 行），请检查源数据和规则配置"
        return result

    async def generate_dwd_view(self, *, asset_code: str, asset_type: str = "table", owner_user_id=None, owner_name=None) -> dict:
        """兼容旧接口：仅同步已有 DWD 数据集输出字段，不再创建指向 ODS 的逻辑视图。"""
        # P0: 校验来源层级
        source_layer = await self._get_layer(asset_code)
        if source_layer not in ("ODS", "DWD"):
            return {"error": "invalid_source", "detail": f"数据清洗仅支持 ODS/DWD 来源表，当前表层级为 {source_layer or '未注册'}"}

        return await self._sync_dwd_dataset_fields(asset_code=asset_code, commit=True)


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


