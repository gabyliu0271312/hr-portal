# -*- coding: utf-8 -*-
"""标准化规则 + 模板服务"""
from __future__ import annotations

from datetime import UTC, date, datetime, time
from copy import deepcopy
from decimal import Decimal
from types import SimpleNamespace
from typing import Any, Literal
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ==================== 标准化规则 (R01) ====================

async def _publish_std_rule_changed(asset_code: str) -> None:
    """发布 standardization_rule_changed 事件。"""
    try:
        from datetime import UTC, datetime as dt
        from app.automation.events import AutomationEvent, publish_event
        from app.core.db import get_session_factory
        async with get_session_factory()() as new_db:
            await publish_event(AutomationEvent(
                trigger_type="standardization_rule_changed",
                biz_type="ods_table", biz_id=asset_code,
                payload={"trigger_type": "standardization_rule_changed", "table_name": asset_code,
                          "change_type": "updated", "changed_at": dt.now(UTC).strftime("%Y-%m-%d %H:%M:%S")},
            ), new_db)
    except Exception:
        pass


STANDARDIZATION_RULE_TYPES = (
    "rename", "type_convert", "value_map", "unit_convert",
    "split_merge", "deduplicate", "null_handling", "format_standardize",
    "reference_lookup", "identity_with_overrides",
)

# PostgreSQL/asyncpg rejects a single prepared statement with more than 32767
# bind parameters. Standardization writes one INSERT statement per batch where
# parameter count = row_count * column_count, so wide HR salary tables can exceed
# the driver limit even with a seemingly safe fixed 1000-row batch. Keep a small
# margin below the hard limit for dialect-generated/internal parameters.
MAX_INSERT_BIND_PARAMS = 30000
DEFAULT_INSERT_BATCH_ROWS = 1000
SYSTEM_TECHNICAL_COLUMNS = {"id", "pk_hash", "synced_at"}

# User-facing standard field names that must keep stable internal field codes.
# Business users may type/select Chinese labels in cleaning rules; DWD physical
# columns, dataset relations and reports must still use these codes.
STANDARD_FIELD_CODE_ALIASES: dict[str, str] = {
    "工号": "employee_no",
    "员工工号": "employee_no",
    "员工编号": "employee_no",
    "人员编号": "employee_no",
    "雇员编号": "employee_no",
    "月份": "month",
    "年月": "month",
    "期间": "month",
    "成本月份": "month",
    "成本归属年月": "cost_period",
    "成本归属月份": "cost_period",
    "发薪月份": "pay_month",
    "工资月份": "pay_month",
    "奖金归属年": "bonus_year",
    "奖金发放月份": "bonus_month",
    "离职月份": "terminated_month",
}

def _is_ascii_identifier(value: str | None) -> bool:
    import re
    return bool(value) and bool(re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", str(value)))


def _clean_field_label(value: str | None) -> str:
    return (value or "").strip()


def _field_code_from_label(label: str | None) -> str | None:
    label = _clean_field_label(label)
    if not label:
        return None
    return STANDARD_FIELD_CODE_ALIASES.get(label)


def _clone_rule(rule, *, source_field: str | None = None, target_field: str | None = None, rule_config: dict | None = None):
    """Return a lightweight rule copy without mutating persisted ORM rows."""
    data = {
        "id": getattr(rule, "id", None),
        "asset_type": getattr(rule, "asset_type", None),
        "asset_code": getattr(rule, "asset_code", None),
        "rule_type": getattr(rule, "rule_type", None),
        "source_field": source_field if source_field is not None else getattr(rule, "source_field", ""),
        "target_field": target_field if target_field is not None else getattr(rule, "target_field", ""),
        "rule_config": rule_config if rule_config is not None else deepcopy(getattr(rule, "rule_config", None) or {}),
        "enabled": getattr(rule, "enabled", True),
        "display_order": getattr(rule, "display_order", 0),
        "description": getattr(rule, "description", None),
    }
    return SimpleNamespace(**data)


def _normalize_standardization_rules(
    rules: list,
    *,
    source_columns: list[str] | None = None,
    source_label_by_code: dict[str, str] | None = None,
) -> list:
    """Normalize user-entered labels to stable internal field codes.

    Product rule:
    - Existing-field rename edits the display label, not the physical code.
    - A saved rule that keeps the employee number label unchanged should output employee_no with that display label.
    - If the ODS physical column is still Chinese, use it as source and rename
      to the stable code; if ODS already has the stable code, use that directly.
    - New/derived fields may still use explicitly supplied ASCII target codes.
    """
    source_columns_set = set(source_columns or [])

    # Canonical business aliases should win over source metadata labels because
    # report joins depend on these stable codes (employee_no/month/etc.).
    label_to_code: dict[str, str] = dict(STANDARD_FIELD_CODE_ALIASES)
    for code, label in (source_label_by_code or {}).items():
        if label and label not in label_to_code:
            label_to_code[label] = code

    canonical_to_label: dict[str, str] = {}
    for label, code in STANDARD_FIELD_CODE_ALIASES.items():
        canonical_to_label.setdefault(code, label)

    def source_for(label_or_code: str) -> str:
        mapped = label_to_code.get(label_or_code)
        if mapped and (not source_columns_set or mapped in source_columns_set):
            return mapped
        if label_or_code in source_columns_set:
            return label_or_code
        return mapped or label_or_code

    normalized: list = []
    current_code_by_original: dict[str, str] = {}

    for rule in rules:
        cfg = deepcopy(getattr(rule, "rule_config", None) or {})
        source_original = getattr(rule, "source_field", "") or ""
        target_original = getattr(rule, "target_field", "") or source_original

        source = current_code_by_original.get(source_original) or source_for(source_original)

        target = current_code_by_original.get(target_original) or target_original
        target_label = None
        if target_original and not _is_ascii_identifier(target_original):
            target_label = target_original
            # For existing-field rename, Chinese target is display label. If it
            # is a known business field, output the stable code; otherwise keep
            # the source code to avoid creating Chinese physical columns.
            target = label_to_code.get(target_original) or source
        elif not target:
            target = source

        if getattr(rule, "rule_type", None) == "rename":
            if target_label and not cfg.get("output_label"):
                cfg["output_label"] = target_label
            elif target == source and not cfg.get("output_label"):
                inherited_label = (source_label_by_code or {}).get(source) or canonical_to_label.get(source)
                if inherited_label:
                    cfg["output_label"] = inherited_label
            current_code_by_original[source_original] = target
            current_code_by_original[target_original] = target

        if getattr(rule, "rule_type", None) == "split_merge" and cfg.get("action") == "split":
            target_fields = []
            output_labels = dict(cfg.get("output_labels") or {})
            for field in cfg.get("target_fields") or []:
                normalized_field = field
                if field and not _is_ascii_identifier(field):
                    output_labels.setdefault(field, field)
                    normalized_field = label_to_code.get(field) or field
                    if normalized_field != field:
                        output_labels.setdefault(normalized_field, field)
                target_fields.append(normalized_field)
            cfg["target_fields"] = target_fields
            if output_labels:
                cfg["output_labels"] = output_labels

        normalized.append(_clone_rule(rule, source_field=source, target_field=target, rule_config=cfg))

    return normalized


def _is_system_technical_column(column_code: str) -> bool:
    return column_code in SYSTEM_TECHNICAL_COLUMNS


def _resolve_wage_rollout(
    *,
    persisted: dict[str, Any],
    requested_mode: Literal["shadow", "gray", "rollback"] | None,
    requested_component_percent: int | None,
) -> tuple[Literal["shadow", "gray", "rollback"], int]:
    """Resolve persisted wage rollout unless this execution explicitly overrides it."""
    if requested_mode is None and requested_component_percent is None:
        mode = str(persisted.get("mode") or "shadow")
        percent = int(persisted.get("component_percent") or 0)
    else:
        mode = requested_mode or "shadow"
        percent = requested_component_percent or 0

    if mode not in {"shadow", "gray", "rollback"}:
        raise ValueError("wage_mode 仅支持 shadow/gray/rollback")
    if not 0 <= percent <= 100:
        raise ValueError("wage_component_percent 必须在 0 到 100 之间")
    return mode, percent


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


def _dwd_create_column_definitions(columns: list[str], column_types: dict[str, str]) -> list[str]:
    """Build DWD columns with a target-owned auto-generated primary key."""
    col_defs: list[str] = [f'{_quote_ident("id")} BIGSERIAL PRIMARY KEY']
    for col in columns:
        if col == "id":
            continue
        sql_type = column_types.get(col, "TEXT")
        col_defs.append(f'{_quote_ident(col)} {sql_type}')
    return col_defs

def _rule_output_labels(rules: list) -> dict[str, str]:
    labels: dict[str, str] = {}
    for rule in rules:
        cfg = rule.rule_config or {}
        target = rule.target_field or rule.source_field
        if target and cfg.get("output_label"):
            labels[target] = cfg["output_label"]
        if rule.rule_type == "split_merge" and cfg.get("action") == "split":
            output_labels = cfg.get("output_labels", {}) or {}
            for field in cfg.get("target_fields") or []:
                if output_labels.get(field):
                    labels[field] = output_labels[field]
                else:
                    legacy_label = next(
                        (label for label, code in STANDARD_FIELD_CODE_ALIASES.items() if code == field and output_labels.get(label)),
                        None,
                    )
                    if legacy_label:
                        labels[field] = output_labels[legacy_label]
    return labels


def _dwd_source_field_map(source_columns: list[str], rules: list) -> dict[str, str]:
    """Map DWD output columns back to their ODS source columns for metadata inheritance."""
    mapping = {col: col for col in source_columns}
    for rule in rules:
        cfg = rule.rule_config or {}
        source = rule.source_field
        target = rule.target_field or source
        if rule.rule_type == "rename":
            mapping.pop(source, None)
            if target:
                mapping[target] = source
        elif rule.rule_type == "split_merge" and cfg.get("action") == "split":
            for field in cfg.get("target_fields") or []:
                mapping[field] = source
        elif target and target != source and rule.rule_type not in {"reference_lookup", "identity_with_overrides"}:
            mapping[target] = source
    return mapping


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
        await _publish_std_rule_changed(rule.asset_code)
        return rule

    async def update_rule(self, rule_id: int, payload: dict):
        from app.warehouse.models import StandardizationRule
        rule = await self.session.get(StandardizationRule, rule_id)
        if rule is None: return None
        allowed = {"source_field", "target_field", "rule_config", "enabled", "display_order", "description"}
        for k, v in payload.items():
            if k in allowed: setattr(rule, k, v)
        await self.session.commit(); await self.session.refresh(rule)
        await _publish_std_rule_changed(rule.asset_code)
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
        asset_code = rule.asset_code
        await self.session.delete(rule); await self.session.commit()
        await _publish_std_rule_changed(asset_code)
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
            from app.data.models import TableColumn
            source_columns_meta = (
                await self.session.execute(
                    select(TableColumn)
                    .where(TableColumn.table_name == asset_code)
                )
            ).scalars().all()
            source_label_by_code = {c.column_code: c.column_label for c in source_columns_meta}
            rule_objs = []
            for r in rules:
                if r.get("id"):
                    existing = await self.session.get(StandardizationRule, r["id"])
                    if existing: rule_objs.append(existing)
                else:
                    rule_objs.append(StandardizationRule(**r))
            rule_objs = _normalize_standardization_rules(
                rule_objs,
                source_columns=cols,
                source_label_by_code=source_label_by_code,
            )
            transformed = execute_rules(rule_objs, rows)
            return {"columns": list(transformed[0].keys()) if transformed else cols, "items": rows, "preview_items": transformed}
        except Exception as e:
            return {"error": str(e)}

    async def _sync_dwd_dataset_fields(
        self,
        *,
        asset_code: str,
        target_table: str | None = None,
        output_columns: list[str] | None = None,
        commit: bool = False,
    ) -> dict | None:
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

        from app.data.models import TableColumn

        source_columns_meta = (
            await self.session.execute(
                select(TableColumn)
                .where(TableColumn.table_name == asset_code)
                .order_by(TableColumn.display_order, TableColumn.id)
            )
        ).scalars().all()
        rules = _normalize_standardization_rules(
            rules,
            source_columns=[c.column_code for c in source_columns_meta],
            source_label_by_code={c.column_code: c.column_label for c in source_columns_meta},
        )

        dwd_columns = (
            await self.session.execute(
                select(TableColumn)
                .where(TableColumn.table_name == dwd_table)
                .order_by(TableColumn.display_order, TableColumn.id)
            )
        ).scalars().all()
        dwd_by_code = {c.column_code: c for c in dwd_columns}
        columns = output_columns or [c.column_code for c in dwd_columns]
        if not columns:
            columns = []
            seen_rule_cols = set()
            for r in rules:
                target_col = r.target_field or r.source_field
                if target_col and target_col not in seen_rule_cols:
                    columns.append(target_col)
                    seen_rule_cols.add(target_col)

        output_labels = _rule_output_labels(rules)
        seen = set()
        display_order = 0
        for target_col in columns:
            if not target_col or target_col in seen:
                continue
            col_meta = dwd_by_code.get(target_col)
            # Dataset outputs drive front-end visible fields. Keep physical DWD
            # technical columns for PK/audit, but do not publish hidden metadata
            # columns such as id/pk_hash/synced_at to the dataset field list.
            if col_meta is not None and not bool(col_meta.is_visible):
                continue
            if col_meta is None and _is_system_technical_column(target_col):
                continue
            seen.add(target_col)
            self.session.add(DatasetOutputField(
                dataset_id=ds.id,
                source_alias=source_alias,
                source_column=target_col,
                output_code=target_col,
                output_label=output_labels.get(target_col) or (col_meta.column_label if col_meta else target_col),
                data_type=(col_meta.data_type if col_meta else "string"),
                agg_role=(col_meta.agg_role if col_meta else "dimension"),
                description=(col_meta.description if col_meta else "") or "",
                display_order=display_order,
            ))
            display_order += 10

        if commit:
            await self.session.commit()
            await self.session.refresh(ds)
        return {"dataset_id": ds.id, "view_name": ds.name, "version": ds.version, "field_count": len(seen)}


    async def _validate_dataset_relation_keys_for_target(self, *, target_table: str, output_columns: list[str]) -> None:
        """Block DWD rebuilds that would remove fields used by dataset joins."""
        from app.datasets.models import DataSetRelation, DataSetTable

        rows = (
            await self.session.execute(
                select(DataSetTable.dataset_id, DataSetTable.alias)
                .where(DataSetTable.table_name == target_table)
            )
        ).all()
        if not rows:
            return

        output_set = set(output_columns or [])
        issues: list[str] = []
        for dataset_id, alias in rows:
            rels = (
                await self.session.execute(
                    select(DataSetRelation).where(
                        DataSetRelation.dataset_id == dataset_id,
                        ((DataSetRelation.left_alias == alias) | (DataSetRelation.right_alias == alias)),
                    )
                )
            ).scalars().all()
            for rel in rels:
                for key in rel.keys or []:
                    required = key.get("left") if rel.left_alias == alias else key.get("right")
                    if required and required not in output_set:
                        issues.append(f"dataset={dataset_id}, alias={alias}, field={required}")

        if issues:
            raise RuntimeError(
                "DWD relation key fields are missing from output columns; rebuild was blocked to avoid disabling reports. "
                "For existing fields, rename should change display label rather than field code. Missing: "
                + "; ".join(issues[:20])
            )

    async def _write_transformed_rows(
        self,
        *,
        target_table: str,
        rows: list[dict],
        columns: list[str],
        column_types: dict[str, str],
        write_strategy: str,
        business_key_fields: list[str] | None,
        ods_sync_semantics: str,
        missing_row_strategy: str,
    ) -> int:
        """Persist already-standardized rows without replacing the DWD table."""
        from sqlalchemy import text as sa_text

        if write_strategy == "passthrough_view":
            raise RuntimeError("清洗规则不能使用 passthrough_view；请改用全量重建、增量更新或追加写入")
        if write_strategy not in {"incremental_upsert", "append"}:
            raise RuntimeError(f"不支持的清洗写入策略: {write_strategy}")

        from app.warehouse.asset_sink import _business_key_hash

        requires_hash = "pk_hash" not in columns or any(row.get("pk_hash") is None for row in rows)
        if requires_hash and not business_key_fields:
            raise RuntimeError("清洗后的增量写入需要 pk_hash 或业务主键")
        if "pk_hash" not in columns:
            columns = [*columns, "pk_hash"]
            column_types = {**column_types, "pk_hash": "TEXT"}
        if requires_hash:
            for row in rows:
                if row.get("pk_hash") is None:
                    row["pk_hash"] = _business_key_hash(row, business_key_fields or [])

        current_columns = set((await self.session.execute(sa_text(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = :table_name"
        ), {"table_name": target_table})).scalars().all())
        for definition in _dwd_create_column_definitions(columns, column_types):
            column_name = definition.split('"', 2)[1]
            if column_name not in current_columns:
                await self.session.execute(sa_text(f'ALTER TABLE {_quote_ident(target_table)} ADD COLUMN {definition}'))

        existing_records = (await self.session.execute(
            sa_text(f'SELECT * FROM {_quote_ident(target_table)}')
        )).mappings().all()
        if business_key_fields:
            for existing in existing_records:
                if existing.get("pk_hash") is None:
                    pk_hash = _business_key_hash(dict(existing), business_key_fields)
                    await self.session.execute(
                        sa_text(f'UPDATE {_quote_ident(target_table)} SET "pk_hash" = :pk_hash WHERE "id" = :id'),
                        {"pk_hash": pk_hash, "id": existing["id"]},
                    )
        existing_rows = {
            row["pk_hash"] or _business_key_hash(dict(row), business_key_fields or []): row
            for row in existing_records
            if row.get("pk_hash") is not None or business_key_fields
        }
        inserted = 0
        updated = 0
        incoming_keys = set()
        for row in rows:
            values = {
                column: _coerce_insert_value(row.get(column), column_types.get(column, "TEXT"))
                for column in columns
            }
            pk_hash = values.get("pk_hash")
            if pk_hash is None:
                raise RuntimeError("清洗后的增量写入缺少 pk_hash")
            incoming_keys.add(pk_hash)
            if pk_hash in existing_rows:
                if write_strategy == "append":
                    continue
                set_clause = ", ".join(
                    f'{_quote_ident(column)} = :{column}'
                    for column in values
                    if column != "pk_hash"
                )
                await self.session.execute(
                    sa_text(f'UPDATE {_quote_ident(target_table)} SET {set_clause} WHERE pk_hash = :pk_hash'),
                    values,
                )
                updated += 1
            else:
                names = ", ".join(_quote_ident(column) for column in values)
                placeholders = ", ".join(f':{column}' for column in values)
                await self.session.execute(
                    sa_text(f'INSERT INTO {_quote_ident(target_table)} ({names}) VALUES ({placeholders})'),
                    values,
                )
                inserted += 1

        if write_strategy == "incremental_upsert" and ods_sync_semantics == "full_snapshot":
            stale_keys = [key for key in existing_rows if key not in incoming_keys]
            if stale_keys and missing_row_strategy == "hard_delete":
                placeholders = ", ".join(f':stale_{index}' for index in range(len(stale_keys)))
                await self.session.execute(
                    sa_text(f'DELETE FROM {_quote_ident(target_table)} WHERE pk_hash IN ({placeholders})'),
                    {f"stale_{index}": key for index, key in enumerate(stale_keys)},
                )
            elif stale_keys and missing_row_strategy == "mark_inactive":
                current_columns = set((await self.session.execute(sa_text(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = :table_name"
                ), {"table_name": target_table})).scalars().all())
                placeholders = ", ".join(f':stale_{index}' for index in range(len(stale_keys)))
                params = {f"stale_{index}": key for index, key in enumerate(stale_keys)}
                if "is_active" in current_columns:
                    await self.session.execute(
                        sa_text(f'UPDATE {_quote_ident(target_table)} SET is_active = FALSE WHERE pk_hash IN ({placeholders})'),
                        params,
                    )
                elif "is_deleted" in current_columns:
                    await self.session.execute(
                        sa_text(f'UPDATE {_quote_ident(target_table)} SET is_deleted = TRUE WHERE pk_hash IN ({placeholders})'),
                        params,
                    )
                elif "valid_to" in current_columns:
                    await self.session.execute(
                        sa_text(f'UPDATE {_quote_ident(target_table)} SET valid_to = :now WHERE pk_hash IN ({placeholders})'),
                        {**params, "now": datetime.now(UTC)},
                    )
                else:
                    raise RuntimeError(
                        f"full_snapshot 表 {target_table} 缺少软失效字段(is_active/is_deleted/valid_to)，"
                        "无法标记 ODS 已删除的行。请在 DWD 表中添加 is_active 字段或改用全量重建策略。"
                    )

        return inserted + updated


    async def execute_full(
        self,
        *,
        asset_code: str,
        target_table: str | None = None,
        rule_ids: list[int] | None = None,
        wage_mode: Literal["shadow", "gray", "rollback"] | None = None,
        wage_component_percent: int | None = None,
        cost_center_period: str | None = None,
        dwd_write_strategy: Literal["full_refresh", "incremental_upsert", "append", "passthrough_view"] = "full_refresh",
        business_key_fields: list[str] | None = None,
        ods_sync_semantics: Literal["full_snapshot", "incremental_append", "incremental_upsert"] = "full_snapshot",
        missing_row_strategy: Literal["mark_inactive", "keep_history", "hard_delete"] = "mark_inactive",
    ) -> dict:
        """全量执行 ODS→DWD 标准化并写入目标物理表。

        工资表在兼容期先执行 Legacy + 公共 MappingExecutor 双跑；两项
        rollout 参数均未传时读取持久化控制，显式 ``shadow/0`` 则覆盖
        持久化配置并继续选择 Legacy。
        """
        from app.warehouse.models import StandardizationRule
        from app.warehouse.standardization_engine import execute_rules
        from app.data.models import RegisteredTable, TableColumn
        from sqlalchemy import text as sa_text, delete as sa_delete

        # P0: 校验来源层级 — 仅允许 ODS 或 DWD
        source_layer = await self._get_layer(asset_code)
        if source_layer not in ("ODS", "DWD"):
            return {"error": "invalid_source", "detail": f"数据清洗仅支持 ODS/DWD 来源表，当前表层级为 {source_layer or '未注册'}"}

        # 成本中心规则必须先完成周期发布和差异确认；门禁位于任何 DWD DDL/DML 之前。
        # 期间是该门禁的一部分，禁止调用方通过省略期间绕过发布状态检查。
        if asset_code == "cost_center_monthly":
            if not cost_center_period:
                return {
                    "error": "review_required",
                    "status": "review_required",
                    "reason": "cost_center_period_required",
                    "detail": "成本中心 DWD 执行必须提供已发布的 YYYYMM 期间",
                    "total": 0,
                    "success": 0,
                    "failed": 0,
                    "errors": [],
                }
            from app.mapping.cost_center_service import CostCenterMappingService
            gate = await CostCenterMappingService(self.session).ensure_dwd_allowed(period=cost_center_period)
            if gate["status"] != "allowed":
                return {"error": "review_required", **gate, "total": 0, "success": 0, "failed": 0, "errors": []}

        # 推导目标表名
        if not target_table:
            target_table = self._derive_dwd_name(asset_code)

        q = select(StandardizationRule).where(StandardizationRule.asset_code == asset_code, StandardizationRule.enabled == True)
        if rule_ids is not None:
            if not rule_ids:
                return {"error": "no_rules_configured", "detail": "自动化清洗未绑定任何规则"}
            q = q.where(StandardizationRule.id.in_(rule_ids))
        q = q.order_by(StandardizationRule.display_order, StandardizationRule.id)
        rules = (await self.session.execute(q)).scalars().all()
        if rule_ids is not None and len(rules) != len(set(rule_ids)):
            return {"error": "invalid_rule_binding", "detail": "绑定规则不存在、未启用或不属于当前 ODS 表"}
        if not rules and asset_code != "cost_center_monthly":
            return {"error": "no_rules", "detail": f"表 {asset_code} 没有启用的标准化规则"}
        try:
            query = f'SELECT * FROM "{asset_code}"'
            params = {}
            if asset_code == "cost_center_monthly":
                period_column = "month"
                query += f' WHERE {_quote_ident(period_column)} = :cost_center_period'
                params["cost_center_period"] = cost_center_period
            result = await self.session.execute(sa_text(query), params)
            rows_raw = result.fetchall()
            if not rows_raw:
                return {"error": "empty", "detail": "ODS 表无当前期间数据", "total": 0, "success": 0, "failed": 0, "errors": [], "target_table": target_table}
            cols = list(result.keys())
            rows = [dict(zip(cols, row)) for row in rows_raw]
        except Exception as e: return {"error": "read_failed", "detail": str(e)}
        source_columns_meta_for_rules = (
            await self.session.execute(
                select(TableColumn)
                .where(TableColumn.table_name == asset_code)
                .order_by(TableColumn.display_order, TableColumn.id)
            )
        ).scalars().all()
        rules = _normalize_standardization_rules(
            rules,
            source_columns=cols,
            source_label_by_code={c.column_code: c.column_label for c in source_columns_meta_for_rules},
        )
        total = len(rows)
        wage_dual_outcome = None
        wage_rollout_control = None
        wage_rebuild_run = None
        cost_center_context = None
        try:
            if asset_code == "cost_center_monthly":
                from app.mapping.cost_center_service import CostCenterMappingService
                from app.mapping.dto import MappingDocumentV1
                from app.mapping.executor import MappingExecutor
                from app.mapping.policy import build_policy

                cost_center_context = await CostCenterMappingService(self.session).get_published_execution_context(
                    period=cost_center_period,
                )
                if cost_center_context.get("status") != "allowed":
                    return {"error": "review_required", **cost_center_context, "total": total, "success": 0, "failed": total, "errors": []}
                required_fields = {"code", "name"}
                missing_fields = sorted(required_fields - set(cols))
                if missing_fields:
                    raise RuntimeError(
                        "成本中心 ODS 物理字段契约不完整，缺少: " + ", ".join(missing_fields)
                    )
                reference_rows = cost_center_context["reference_datasets"].get("cost_center_tree", [])
                reference_snapshot = {
                    "cost_center_tree": {
                        (str(item.get("code")),): item for item in reference_rows
                    }
                }
                document = MappingDocumentV1.from_dict(cost_center_context["rule_document"])
                policy = build_policy(
                    "warehouse",
                    source_asset_id=asset_code,
                    source_field_ids=list(cols),
                    target_asset_id=target_table,
                    target_field_ids=list(cols),
                    allowed_reference_datasets=["cost_center_tree"],
                    allowed_reference_fields=["code", "name"],
                )
                mapping_result = await MappingExecutor().execute(
                    document, rows, reference_snapshot=reference_snapshot, policy=policy,
                )
                if mapping_result.errors:
                    raise RuntimeError(mapping_result.errors[0].message)
                transformed = mapping_result.outputRows
            elif asset_code == "emp_monthly_salary":
                from app.datasources.sync_service import (
                    apply_lookups_to_row,
                    build_lookup_maps,
                )
                from app.mapping.wage_dual_run import (
                    WAGE_REFERENCE_DATASET,
                    build_wage_mapping_document,
                    run_wage_dual_run,
                )

                lookup_maps = await build_lookup_maps(asset_code, self.session)
                from app.mapping.service import MappingService
                mapping_service = MappingService(self.session)
                wage_rollout_control = await mapping_service.get_wage_rollout(asset_id=asset_code)
                wage_mode, wage_component_percent = _resolve_wage_rollout(
                    persisted=wage_rollout_control,
                    requested_mode=wage_mode,
                    requested_component_percent=wage_component_percent,
                )
                wage_rule = next(
                    (
                        rule for rule in rules
                        if rule.rule_type == "reference_lookup"
                        and (rule.rule_config or {}).get("lookup_table") == WAGE_REFERENCE_DATASET
                        and (rule.rule_config or {}).get("target", rule.target_field) == "expense_type"
                    ),
                    None,
                )
                if wage_rule is not None and lookup_maps:
                    # 其他 ODS→DWD 规则仍由 standardization_rules 引擎执行；
                    # 工资 expense_type 只替换为公共双跑结果，避免跳过既有清洗规则。
                    non_wage_rules = [rule for rule in rules if rule is not wage_rule]
                    base_rows = execute_rules(non_wage_rules, rows)
                    wage_document = build_wage_mapping_document(
                        wage_rule.rule_config,
                        source_asset=asset_code,
                        target_asset=target_table,
                        source_fields=("employee_no", "client"),
                        target_field=wage_rule.target_field or "expense_type",
                    )
                    wage_key_fields = [
                        column.column_code
                        for column in source_columns_meta_for_rules
                        if bool(column.is_pk_part)
                    ] or ["employee_no", "pay_month"]
                    wage_dual_outcome = await run_wage_dual_run(
                        base_rows,
                        lookup_maps,
                        business_key_fields=wage_key_fields,
                        legacy_evaluator=apply_lookups_to_row,
                        mode=wage_mode,
                        component_percent=wage_component_percent,
                        component_document=wage_document,
                    )
                    transformed = wage_dual_outcome.selectedRows
                    logger.info(
                        "[wage_mapping] dwd %s",
                        wage_dual_outcome.report.to_log_dict(),
                    )
                else:
                    transformed = execute_rules(rules, rows)
            else:
                transformed = execute_rules(rules, rows)
        except Exception as e:
            block_code = getattr(e, "code", None)
            return {
                "error": "transform_blocked" if block_code else "transform_failed",
                "detail": str(e),
                "block_code": block_code.value if hasattr(block_code, "value") else block_code,
                "total": total,
                "success": 0,
                "failed": total,
                "errors": [],
            }
        success = len(transformed); failed = total - success
        target = target_table.strip().replace('"', "")
        # P0: 校验目标层级 — 目标表若已注册，必须是 DWD 层
        target_layer = await self._get_layer(target)
        if target_layer and target_layer != "DWD":
            return {"error": "invalid_target", "detail": f"目标表 {target} 已注册为 {target_layer} 层，数据清洗目标必须是 DWD"}
        if dwd_write_strategy not in {"full_refresh", "incremental_upsert", "append", "passthrough_view"}:
            return {"error": "invalid_write_strategy", "detail": f"不支持的 DWD 写入策略: {dwd_write_strategy}"}
        if dwd_write_strategy == "passthrough_view":
            return {
                "error": "incompatible_write_strategy",
                "detail": "已启用清洗规则时不能使用直通视图写入；请改用全量重建、增量更新或追加写入",
                "target_table": target,
            }
        try:
            # P0-1: 仅全量重建允许 DROP + CREATE；增量和追加保留既有 DWD 表。
            from app.warehouse.layer_policy import validate_ddl_operation, validate_layer_transition, DDL_REPLACE, DDL_CREATE, DDL_ALTER
            validate_layer_transition("ODS", "DWD", "standardize")
            bcols = [col for col in (_ordered_output_columns(transformed) if transformed else cols) if col != "id"]
            column_types = _infer_column_types(transformed) if transformed else {column: "TEXT" for column in bcols}
            target_exists = bool(await self.session.scalar(sa_text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = current_schema() AND table_name = :table_name)"
            ), {"table_name": target}))
            replace_target = dwd_write_strategy == "full_refresh" or not target_exists
            if replace_target:
                existing = await self._get_layer(target)
                if existing is not None:
                    await validate_ddl_operation(self.session, target, DDL_REPLACE)
                else:
                    await validate_ddl_operation(self.session, target, DDL_CREATE, target_layer="DWD")
                await self._validate_dataset_relation_keys_for_target(target_table=target, output_columns=bcols)
                col_defs = _dwd_create_column_definitions(bcols, column_types)
                # 即使转换后没有行，也保留空 DWD 物理表及其元数据契约。
                # DDL 和元数据仍处于同一事务，异常会整体回滚而不会留下“有元数据无表”。
                await self.session.execute(sa_text(f'DROP TABLE IF EXISTS {_quote_ident(target)}'))
                await self.session.execute(sa_text(f'CREATE TABLE {_quote_ident(target)} ({", ".join(col_defs)})'))
                rows_written = 0
                if transformed:
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
                    rows_written = len(transformed)
            else:
                await validate_ddl_operation(self.session, target, DDL_ALTER)
                rows_written = await self._write_transformed_rows(
                    target_table=target,
                    rows=transformed,
                    columns=bcols,
                    column_types=column_types,
                    write_strategy=dwd_write_strategy,
                    business_key_fields=business_key_fields,
                    ods_sync_semantics=ods_sync_semantics,
                    missing_row_strategy=missing_row_strategy,
                )
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
            source_columns_meta = (
                await self.session.execute(
                    select(TableColumn)
                    .where(TableColumn.table_name == asset_code)
                    .order_by(TableColumn.display_order, TableColumn.id)
                )
            ).scalars().all()
            source_by_code = {c.column_code: c for c in source_columns_meta}
            source_field_map = _dwd_source_field_map(cols, rules)
            output_labels = _rule_output_labels(rules)
            display_index = 0
            for i, tgt in enumerate(bcols if transformed else cols):
                src_meta = source_by_code.get(source_field_map.get(tgt, tgt))
                # System technical columns can exist physically for ORM/audit, but
                # if ODS does not expose them as business metadata, do not create
                # DWD table_columns for them. Some front-end table views build
                # headers from table_columns, so hidden rows are not enough.
                if src_meta is None and _is_system_technical_column(tgt):
                    continue
                display_index += 1
                self.session.add(TableColumn(
                    table_name=target,
                    column_code=tgt,
                    column_label=output_labels.get(tgt) or (src_meta.column_label if src_meta else tgt),
                    source_field_id=(src_meta.source_field_id if src_meta else None),
                    data_type=_to_table_column_data_type(column_types.get(tgt, "TEXT")) if transformed else (src_meta.data_type if src_meta else "string"),
                    is_pk_part=bool(src_meta.is_pk_part) if src_meta else False,
                    is_sensitive=bool(src_meta.is_sensitive) if src_meta else False,
                    is_visible=bool(src_meta.is_visible) if src_meta else True,
                    display_order=(src_meta.display_order if src_meta else display_index * 10),
                    auto_discovered=True,
                    agg_role=(src_meta.agg_role if src_meta else "dimension"),
                    scope_role=(src_meta.scope_role if src_meta else None),
                    description=(src_meta.description if src_meta else None),
                ))
            await self.session.flush()
            # Z02: 血缘写入与主流程同一事务
            from app.warehouse.service import write_lineage_edge
            rule_ids = [r.id for r in rules]
            await write_lineage_edge(self.session, asset_code, target, "standardize", metadata={
                "definition_id": None, "rule_ids": rule_ids, "version": 1,
            })
            # P2/P3 收口：执行成功后同步 DWD 单表数据集输出字段，避免额外“发布 DWD 视图”动作。
            sync_result = await self._sync_dwd_dataset_fields(asset_code=asset_code, target_table=target, output_columns=(bcols if transformed else cols), commit=False)
            if sync_result and sync_result.get("error"):
                raise RuntimeError(sync_result.get("detail") or "DWD 数据集字段同步失败")
            if wage_dual_outcome is not None and wage_rollout_control and wage_rollout_control.get("binding_id"):
                wage_rebuild_run = await MappingService(self.session).record_rebuild_success(
                    binding_id=wage_rollout_control["binding_id"],
                    target_id=target,
                    row_count=success,
                    audit_id=wage_rollout_control.get("audit_id"),
                    event_id=wage_rollout_control.get("event_id"),
                    mapping_version=int(wage_rollout_control.get("expected_version") or 0),
                )
            if asset_code == "cost_center_monthly" and cost_center_period:
                from app.mapping.cost_center_service import CostCenterMappingService
                await CostCenterMappingService(self.session).mark_rebuild_result(
                    period=cost_center_period,
                    success=True,
                )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            return {"error": "write_failed", "detail": str(e)[:500], "total": total, "success": 0, "failed": total, "target_table": target, "errors": []}
        # P0-3: 空结果警告
        result = {
            "total": total,
            "success": success,
            "failed": failed,
            "errors": [],
            "target_table": target,
            "rows_inserted": rows_written,
            "write_strategy": dwd_write_strategy,
        }
        if wage_dual_outcome is not None:
            result["wage_rollout"] = {
                "mode": wage_dual_outcome.report.mode,
                "selected_evaluator": wage_dual_outcome.report.selectedEvaluator,
                "component_percent": wage_dual_outcome.report.componentPercent,
                "same": wage_dual_outcome.report.same,
                "different": wage_dual_outcome.report.different,
                "publish_blocked": wage_dual_outcome.report.publishBlocked,
                "block_code": wage_dual_outcome.report.blockCode,
                "binding_id": (wage_rollout_control or {}).get("binding_id"),
                "rebuild_run_id": getattr(wage_rebuild_run, "id", None),
            }
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
        existing_by_key = {(r.source_field, r.rule_type): r for r in existing}
        loaded = 0; skipped = 0
        max_order = max((r.display_order for r in existing), default=0)
        for i, rule_data in enumerate(t.template_rules):
            key = (rule_data.get("source_field", ""), rule_data.get("rule_type", ""))
            conflict = existing_by_key.get(key)
            if conflict is not None:
                if on_conflict == "skip":
                    skipped += 1
                    continue
                if on_conflict != "overwrite":
                    raise ValueError("on_conflict must be skip or overwrite")
                conflict.target_field = rule_data.get("target_field", "")
                conflict.rule_config = rule_data.get("rule_config", {})
                conflict.enabled = True
                conflict.display_order = max_order + (i + 1) * 10
                loaded += 1
                continue
            rule = StandardizationRule(asset_type=asset_type, asset_code=asset_code, rule_type=rule_data["rule_type"], source_field=rule_data.get("source_field", ""), target_field=rule_data.get("target_field", ""), rule_config=rule_data.get("rule_config", {}), enabled=True, display_order=max_order + (i + 1) * 10)
            self.session.add(rule); loaded += 1
        await self.session.commit()
        return {"loaded": loaded, "skipped": skipped, "template_id": template_id}


def get_standardization_template_service(session: AsyncSession) -> StandardizationTemplateService:
    return StandardizationTemplateService(session)
