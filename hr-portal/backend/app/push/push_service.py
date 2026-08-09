"""对外推送服务

支持三种推送方式：
  external_db — 写入对方数据库（MySQL / PostgreSQL）
  http_push   — POST JSON 到对方接口
  api_expose  — 暴露只读 API（生成 token，对方主动拉取）

推送逻辑与拉取完全镜像（upsert + 删孤儿）：
  - 月度表：只处理当月，历史月份保留
  - 非月度表：全量处理
  - 有主键匹配 → UPDATE；本次新增 → INSERT；本次没有 → DELETE
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.ddl import POSTGRES_IDENTIFIER_MAX_BYTES, make_identifier, postgres_type, quote_ident
from app.data.models import DATA_TABLES, TableColumn
from app.datasources.sync_service import PERIOD_TABLES

logger = logging.getLogger("push_service")


async def _resolve_push_mapping_policy(
    source_table: str,
    field_mappings: list[Any],
    db: AsyncSession,
    source_field_ids: list[str] | None = None,
):
    """Issue a server-side policy from the registered source schema."""
    from app.mapping.policy import build_policy

    columns = (
        await db.execute(select(TableColumn).where(TableColumn.table_name == source_table))
    ).scalars().all()
    source_fields = source_field_ids or [column.column_code for column in columns]
    if source_table.startswith("report:"):
        # 报表字段优先由报表定义签发，其次才接受已返回行的 schema。
        report_fields: list[str] = []
        from app.reports.models import Report
        from app.reports.router import get_report_push_columns

        report = await db.get(Report, parse_report_source_id(source_table))
        if report is not None:
            report_columns = await get_report_push_columns(report, db)
            report_fields = [str(column.get("code")) for column in report_columns if column.get("code")]
        mapping_fields = [
            str(mapping.get("source"))
            for mapping in field_mappings
            if isinstance(mapping, dict) and mapping.get("source")
        ]
        source_fields = mapping_fields or report_fields or source_fields
    if not source_fields:
        # 空结果仍需构造合法策略；没有行时不会实际写入目标。
        if source_table.startswith("report:"):
            return build_policy(
                caller="push_target",
                source_asset_id=source_table,
                source_field_ids=[],
                target_field_ids=sorted({str(m.get("target")) for m in field_mappings if isinstance(m, dict) and m.get("target")}),
            )
        raise RuntimeError("PushTarget 来源资产没有可信字段目录")
    target_fields = [
        str(mapping.get("target"))
        for mapping in field_mappings
        if isinstance(mapping, dict) and mapping.get("target")
    ]
    return build_policy(
        caller="push_target",
        source_asset_id=source_table,
        source_field_ids=source_fields,
        target_field_ids=sorted(set(source_fields) | set(target_fields)),
        target_protected_keys=[column.column_code for column in columns if column.is_pk_part],
        target_readonly=[column.column_code for column in columns if column.is_computed],
    )


def _is_managed_schema(value: str) -> bool:
    return bool(re.fullmatch(r"finebi_[a-z0-9_]+", value or ""))


def _schema_history(target, current_schema: str) -> list[str]:
    history = [name for name in (target.schema_history or []) if _is_managed_schema(name)]
    if _is_managed_schema(current_schema) and current_schema not in history:
        history.append(current_schema)
    return history[-20:]


async def _referenced_schemas(db: AsyncSession, excluding_target_id: int | None = None) -> set[str]:
    from app.push.models import PushTarget

    rows = (await db.execute(select(PushTarget).where(
        PushTarget.push_type.in_(("db_realtime", "db_snapshot"))
    ))).scalars().all()
    schemas = set()
    for target in rows:
        if target.id == excluding_target_id:
            continue
        values = [(target.settings or {}).get("schema"), *(target.schema_history or [])]
        schemas.update(name for name in values if _is_managed_schema(name))
    return schemas


async def cleanup_managed_schemas(
    db: AsyncSession, candidates: list[str], excluding_target_id: int | None = None,
) -> list[str]:
    referenced = await _referenced_schemas(db, excluding_target_id)
    removed = []
    for schema_name in set(candidates):
        if not _is_managed_schema(schema_name) or schema_name in referenced:
            continue
        exists = (await db.execute(text(
            "SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = :schema_name)"
        ), {"schema_name": schema_name})).scalar_one()
        if exists:
            await db.execute(text(f"DROP SCHEMA IF EXISTS {_quote_pg_identifier(schema_name)} CASCADE"))
            removed.append(schema_name)
    return removed


async def list_orphan_schemas(db: AsyncSession) -> list[dict]:
    referenced = await _referenced_schemas(db)
    rows = (await db.execute(text(
        "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'finebi\\_%' ESCAPE '\\' ORDER BY nspname"
    ))).scalars().all()
    result = []
    for schema_name in rows:
        if not _is_managed_schema(schema_name):
            continue
        count = (await db.execute(text(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema = :schema_name"
        ), {"schema_name": schema_name})).scalar_one()
        result.append({
            "schema": schema_name,
            "object_count": count,
            "safe_to_delete": schema_name not in referenced,
            "reason": "未被任何推送目标引用" if schema_name not in referenced else "仍被推送目标引用",
        })
    return result


# ===== 字段映射 =====

def apply_field_mappings(row: dict, mappings: list[dict]) -> dict:
    """Legacy-compatible single-row helper; outbound runtimes use execute_push_mapping."""
    if not mappings:
        return row
    mapping_dict = {m["source"]: m["target"] for m in mappings if m.get("source") and m.get("target")}
    return {mapping_dict.get(k, k): v for k, v in row.items()}


async def execute_push_mapping(
    rows: list[dict],
    field_mappings: list[Any],
    *,
    policy=None,
    mapping_component: dict | None = None,
) -> list[dict]:
    """Execute PushTarget legacy mappings through the shared adapter and executor.

    A non-empty mapping must run under a caller policy resolved from the persisted
    PushTarget and server-side field catalogs. A bare default policy would turn an
    unknown target schema into an allow-all path.
    """
    if not field_mappings and not mapping_component:
        return rows

    from app.mapping.adapters.push_target_legacy import PushTargetLegacyAdapter
    from app.mapping.errors import MappingErrorCode, MappingException
    from app.mapping.executor import MappingExecutor
    from app.mapping.policy import build_policy
    from app.mapping.validator import MappingValidator

    # 兼容纯服务调用与历史调度入口：调用方尚未注入持久化目标 schema
    # 时只能从当前数据和已持久化的 legacy mapping 构造最小字段集合；新的
    # router/执行入口应显式传入服务端签发 policy。
    if policy is None:
        source_fields = sorted({str(key) for row in rows for key in row})
        target_fields = sorted(set(source_fields) | {
            str(mapping.get("target"))
            for mapping in field_mappings
            if isinstance(mapping, dict) and mapping.get("target")
        })
        policy = build_policy(
            caller="push_target",
            source_field_ids=source_fields,
            target_field_ids=target_fields,
        )
    if mapping_component:
        from app.mapping.dto import MappingDocumentV1
        document = MappingDocumentV1.from_dict(mapping_component)
        MappingValidator().validate(document, policy)
        result = await MappingExecutor().execute(document, rows, None, policy)
        if result.errors:
            detail = "; ".join(f"{error.code}: {error.message}" for error in result.errors[:5])
            raise RuntimeError(detail)
        return result.outputRows

    opened = PushTargetLegacyAdapter().read(
        {"field_mappings": field_mappings},
        policy=policy,
    )
    if not opened.compatibility.writable:
        raise MappingException(
            MappingErrorCode.MAPPING_LOSSY_WRITE_BLOCKED,
            "PushTarget field_mappings 包含无法无损执行的旧字段",
            http_status=422,
            details={
                "lossyFields": opened.compatibility.lossyFields,
                "unknownFields": opened.compatibility.unknownFields,
            },
        )
    MappingValidator().validate(opened.document, policy)
    result = await MappingExecutor().execute(opened.document, rows, None, policy)
    if result.errors:
        detail = "; ".join(f"{error.code}: {error.message}" for error in result.errors[:5])
        raise RuntimeError(detail)
    return result.outputRows


def _ensure_entity_model(Model, table_name: str) -> None:
    if "raw" in Model.__table__.columns:
        raise RuntimeError(f"业务表 {table_name} 不是实体列结构，请先重建为实体列业务表")


def _entity_column(Model, table_name: str, column_code: str):
    if column_code not in Model.__table__.columns:
        raise RuntimeError(f"业务表 {table_name} 缺少实体列: {column_code}")
    return Model.__table__.c[column_code]


def _normalize_outbound_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def json_ready_row(row: dict[str, Any]) -> dict[str, Any]:
    """Convert one outbound API/HTTP row to JSON-serializable values."""
    return {k: _normalize_outbound_value(v) for k, v in row.items()}


def _row_entity_value(row: Any, column_code: str) -> Any:
    if not hasattr(row, column_code):
        raise RuntimeError(f"数据行缺少实体列: {column_code}")
    return getattr(row, column_code)


def _dedupe_labels(cols: list[TableColumn]) -> dict[str, str]:
    """FineBI 暴露使用中文列名，同名时加后缀避免 CREATE TABLE 冲突。"""
    counts: dict[str, int] = {}
    out: dict[str, str] = {}
    for col in cols:
        base = (col.column_label or col.column_code).strip() or col.column_code
        counts[base] = counts.get(base, 0) + 1
        out[col.column_code] = base if counts[base] == 1 else f"{base}_{counts[base]}"
    return out


def _quote_pg_identifier(identifier: str) -> str:
    """Quote arbitrary PostgreSQL identifiers such as Chinese FineBI labels。
    超过 63 字节上限时自动截断并追加短 hash 保持唯一性。
    """
    import hashlib
    value = str(identifier or "").strip()
    if not value:
        raise RuntimeError("PostgreSQL 标识符不能为空")
    encoded = value.encode("utf-8")
    if len(encoded) <= POSTGRES_IDENTIFIER_MAX_BYTES:
        return f'"{value.replace(chr(34), chr(34) * 2)}"'
    # 截断：保留前 N 个字符（按字节），末尾加 4 字符 hash
    hash_suffix = "_" + hashlib.md5(encoded).hexdigest()[:4]
    suffix_bytes = len(hash_suffix.encode("utf-8"))
    max_body_bytes = POSTGRES_IDENTIFIER_MAX_BYTES - suffix_bytes
    body = ""
    for ch in value:
        b = ch.encode("utf-8")
        if len(body.encode("utf-8")) + len(b) > max_body_bytes:
            break
        body += ch
    truncated = body + hash_suffix
    return f'"{truncated.replace(chr(34), chr(34) * 2)}"'


def _quote_pg_literal(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _quote_conn_part(value: str) -> str:
    return quote(str(value), safe="")


# ===== 读取源数据 =====

from datetime import date, datetime as dt_datetime
from decimal import Decimal, InvalidOperation


def _coerce_pg_value(value, data_type: str):
    """将 Python 值转为 asyncpg 可接受的 PostgreSQL 类型。

    报表来源的 _collect_export_rows 返回的值可能是字符串
    （如日期 '2026-02-02'），但表列是 DATE/NUMERIC 等类型，
    必须显式转换。
    """
    if value is None:
        return None
    dt = (data_type or "").strip().lower()
    try:
        if dt in ("date",):
            if isinstance(value, str):
                return date.fromisoformat(value)
        if dt in ("datetime",):
            if isinstance(value, str):
                return dt_datetime.fromisoformat(value)
        if dt in ("number", "decimal", "float", "double", "numeric"):
            if isinstance(value, str):
                return Decimal(value)
            if isinstance(value, (int, float)):
                return Decimal(str(value))
        if dt == "integer":
            if isinstance(value, str):
                return int(value)
        if dt in ("boolean", "bool"):
            if isinstance(value, str):
                return value.lower() in ("true", "1", "yes")
    except (ValueError, InvalidOperation):
        return value   # 转换失败保留原值
    return value


def is_report_source(source_table: str) -> bool:
    return str(source_table or "").startswith("report:")


def parse_report_source_id(source_table: str) -> int:
    if not is_report_source(source_table):
        raise RuntimeError(f"不是有效的报表推送源: {source_table}")
    try:
        return int(str(source_table).split(":", 1)[1])
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"报表推送源格式不正确: {source_table}") from exc


async def _load_report_source_rows(source_table: str, db: AsyncSession) -> list[dict[str, Any]]:
    from app.reports.models import Report
    from app.reports.router import collect_report_push_rows

    report_id = parse_report_source_id(source_table)
    report = await db.get(Report, report_id)
    if report is None:
        raise RuntimeError(f"报表不存在: {report_id}")
    rows, _labels = await collect_report_push_rows(report, db)
    return rows


async def _load_source_columns_meta(
    source_table: str, db: AsyncSession
) -> tuple[list[str], dict[str, str], dict[str, str]]:
    """返回 (codes, label_by_code, type_by_code)。"""
    if is_report_source(source_table):
        from app.reports.models import Report
        from app.reports.router import get_report_push_columns

        report_id = parse_report_source_id(source_table)
        report = await db.get(Report, report_id)
        if report is None:
            raise RuntimeError(f"报表不存在: {report_id}")
        cols = await get_report_push_columns(report, db)
        codes = [str(c.get("code")) for c in cols if c.get("code")]
        labels = {
            str(c.get("code")): str(c.get("label") or c.get("code"))
            for c in cols if c.get("code")
        }
        types = {
            str(c.get("code")): str(c.get("data_type") or "string")
            for c in cols if c.get("code")
        }
        return codes, labels, types

    source_cols = (
        await db.execute(
            select(TableColumn)
            .where(TableColumn.table_name == source_table, TableColumn.is_visible.is_(True))
            .order_by(TableColumn.display_order)
        )
    ).scalars().all()
    codes = [c.column_code for c in source_cols]
    labels = {
        c.column_code: (c.column_label or c.column_code).strip() or c.column_code
        for c in source_cols
    }
    types = {c.column_code: str(c.data_type or "string") for c in source_cols}
    return codes, labels, types


async def _load_source_rows(
    source_table: str,
    db: AsyncSession,
    period_ym: str = "",
    runtime_filters: list[dict[str, Any]] | None = None,
) -> list[dict]:
    """从本地表/报表读取要推送的行，月度表按 period_ym 过滤"""
    if is_report_source(source_table):
        return await _load_report_source_rows(source_table, db)

    Model = DATA_TABLES.get(source_table)
    if Model is None:
        raise RuntimeError(f"未知数据表: {source_table}")
    _ensure_entity_model(Model, source_table)

    # 取可见字段列表
    cols = (
        await db.execute(
            select(TableColumn)
            .where(TableColumn.table_name == source_table, TableColumn.is_visible.is_(True))
            .order_by(TableColumn.display_order)
        )
    ).scalars().all()
    col_codes = [c.column_code for c in cols]
    for code in col_codes:
        _entity_column(Model, source_table, code)

    stmt = select(Model)
    period_cfg = PERIOD_TABLES.get(source_table)
    if period_cfg and period_ym:
        period_col = period_cfg["period_col"]
        stmt = stmt.where(_entity_column(Model, source_table, period_col) == period_ym)

    for runtime_filter in runtime_filters or []:
        if runtime_filter.get("op") != "eq":
            raise RuntimeError("Unsupported runtime filter operation")
        column = str(runtime_filter.get("column") or "")
        stmt = stmt.where(_entity_column(Model, source_table, column) == runtime_filter.get("value"))

    rows = (await db.execute(stmt)).scalars().all()
    return [
        {code: _row_entity_value(r, code) for code in col_codes}
        for r in rows
    ]


def _row_pk_hash(row: dict, pk_cols: list[str]) -> str:
    if pk_cols:
        material = "||".join(str(row.get(c, "")) for c in pk_cols)
    else:
        material = json.dumps(json_ready_row(row), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(material.encode()).hexdigest()[:32]


# ===== external_db 推送（MySQL / PostgreSQL）=====

async def push_external_db(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    """写入外部数据库，upsert + 删孤儿"""
    import aiomysql

    host = settings.get("host", "localhost")
    port = int(settings.get("port", 3306))
    database = settings.get("database", "")
    user = settings.get("user", "")
    target_table = settings.get("target_table", source_table)
    dialect = settings.get("dialect", "mysql")

    password = secrets.get("password", "")

    # 月度判断
    period_cfg = PERIOD_TABLES.get(source_table)
    period_ym = settings.get("period_ym", "")

    rows = await _load_source_rows(source_table, db, period_ym)
    if not rows:
        return 0, "源表无数据，推送跳过"

    # 字段映射
    policy = await _resolve_push_mapping_policy(source_table, field_mappings, db)
    mapped_rows = await execute_push_mapping(rows, field_mappings, policy=policy)

    # 空字符串 → None，避免 MySQL 严格模式 DECIMAL/数值列报错
    def _clean(row: dict) -> dict:
        return {k: (None if v == "" else v) for k, v in row.items()}
    mapped_rows = [_clean(r) for r in mapped_rows]

    # 取主键列（源表 is_pk_part 的字段，映射后的名字）
    src_pk_cols = [
        c.column_code for c in (
            await db.execute(
                select(TableColumn).where(
                    TableColumn.table_name == source_table,
                    TableColumn.is_pk_part.is_(True),
                )
            )
        ).scalars().all()
    ]
    pk_mapping = {m["source"]: m["target"] for m in field_mappings if m.get("source") and m.get("target")}
    target_pk_cols = [pk_mapping.get(c, c) for c in src_pk_cols]

    all_cols = list(mapped_rows[0].keys()) if mapped_rows else []
    # 非主键列（用于 UPDATE SET）
    non_pk_cols = [c for c in all_cols if c not in target_pk_cols]

    conn = await aiomysql.connect(
        host=host, port=port, db=database,
        user=user, password=password,
        charset="utf8mb4", autocommit=False,
    )
    try:
        async with conn.cursor() as cur:
            # 推送前去重：目标表按业务主键有重复行时，保留 MIN(id)，删除多余行
            deduped = 0
            if target_pk_cols:
                pk_col_list = ", ".join(f"`{c}`" for c in target_pk_cols)
                dedup_sql = (
                    f"DELETE FROM `{target_table}` WHERE id NOT IN ("
                    f"SELECT min_id FROM ("
                    f"SELECT MIN(id) AS min_id FROM `{target_table}` GROUP BY {pk_col_list}"
                    f") AS t"
                    f")"
                )
                await cur.execute(dedup_sql)
                deduped = cur.rowcount
                await conn.commit()

            current_hashes: set[str] = set()
            upserted = 0

            if not target_pk_cols:
                # 无业务主键：全量替换（月度表只删当月，非月度表全删）
                if period_cfg and period_ym:
                    period_target_col = pk_mapping.get(period_cfg["period_col"], period_cfg["period_col"])
                    await cur.execute(
                        f"DELETE FROM `{target_table}` WHERE `{period_target_col}` = %s",
                        (period_ym,),
                    )
                else:
                    await cur.execute(f"DELETE FROM `{target_table}`")
                await conn.commit()

            for row in mapped_rows:
                ph = _row_pk_hash(row, target_pk_cols)
                current_hashes.add(ph)

                if not all_cols:
                    continue

                if target_pk_cols and non_pk_cols:
                    # 有业务主键：先 SELECT 判断存在，存在则 UPDATE，否则 INSERT
                    where_clause = " AND ".join(f"`{c}` = %s" for c in target_pk_cols)
                    await cur.execute(
                        f"SELECT COUNT(*) FROM `{target_table}` WHERE {where_clause}",
                        [row.get(c) for c in target_pk_cols],
                    )
                    (cnt,) = await cur.fetchone()
                    if cnt > 0:
                        set_clause = ", ".join(f"`{c}` = %s" for c in non_pk_cols)
                        await cur.execute(
                            f"UPDATE `{target_table}` SET {set_clause} WHERE {where_clause}",
                            [row.get(c) for c in non_pk_cols] + [row.get(c) for c in target_pk_cols],
                        )
                    else:
                        col_list = ", ".join(f"`{c}`" for c in all_cols)
                        placeholders = ", ".join(["%s"] * len(all_cols))
                        await cur.execute(
                            f"INSERT INTO `{target_table}` ({col_list}) VALUES ({placeholders})",
                            [row.get(c) for c in all_cols],
                        )
                else:
                    # 无业务主键：全量替换，直接 INSERT（上面已清空当期）
                    col_list = ", ".join(f"`{c}`" for c in all_cols)
                    placeholders = ", ".join(["%s"] * len(all_cols))
                    await cur.execute(
                        f"INSERT INTO `{target_table}` ({col_list}) VALUES ({placeholders})",
                        [row.get(c) for c in all_cols],
                    )
                upserted += 1

            # 删孤儿：月度表只删当月，非月度表全量
            deleted = 0
            if target_pk_cols:
                # 查出目标表当前主键（月度表加 period 过滤）
                if period_cfg and period_ym:
                    period_target_col = pk_mapping.get(period_cfg["period_col"], period_cfg["period_col"])
                    await cur.execute(
                        f"SELECT {', '.join(f'`{c}`' for c in target_pk_cols)} "
                        f"FROM `{target_table}` WHERE `{period_target_col}` = %s",
                        (period_ym,),
                    )
                else:
                    await cur.execute(
                        f"SELECT {', '.join(f'`{c}`' for c in target_pk_cols)} FROM `{target_table}`"
                    )
                existing = await cur.fetchall()

                to_delete = []
                for ex_row in existing:
                    ex_dict = dict(zip(target_pk_cols, ex_row))
                    ex_hash = _row_pk_hash(ex_dict, target_pk_cols)
                    if ex_hash not in current_hashes:
                        to_delete.append(ex_dict)

                deleted = 0
                for d in to_delete:
                    where = " AND ".join(f"`{c}` = %s" for c in target_pk_cols)
                    await cur.execute(
                        f"DELETE FROM `{target_table}` WHERE {where}",
                        [d[c] for c in target_pk_cols],
                    )
                    deleted += 1

        await conn.commit()
        msg = f"推送成功：去重 {deduped} 行，upsert {upserted} 行，删除 {deleted} 行孤儿"
        logger.info("[push_external_db] %s → %s:%s/%s  %s", source_table, host, port, target_table, msg)
        return upserted, msg
    finally:
        conn.close()


# ===== http_push 推送 =====

async def push_http(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    """POST JSON 到对方接口"""
    import httpx

    url = settings.get("url", "")
    method = settings.get("method", "POST").upper()
    headers = dict(settings.get("headers") or {})
    token = secrets.get("bearer_token", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    batch_size = int(settings.get("batch_size", 500))

    period_ym = settings.get("period_ym", "")

    rows = await _load_source_rows(source_table, db, period_ym)
    policy = await _resolve_push_mapping_policy(
        source_table, field_mappings, db, source_field_ids=sorted({key for row in rows for key in row})
    )
    mapped_rows = [json_ready_row(row) for row in await execute_push_mapping(rows, field_mappings, policy=policy)]

    total = 0
    async with httpx.AsyncClient(timeout=60) as client:
        for i in range(0, len(mapped_rows), batch_size):
            batch = mapped_rows[i: i + batch_size]
            resp = await client.request(method, url, json=batch, headers=headers)
            resp.raise_for_status()
            total += len(batch)

    return total, f"HTTP 推送成功：{total} 行"


# ===== feishu_sheet 推送 =====

_feishu_token_cache: dict[str, tuple[str, float]] = {}


def _setting_str(source: dict, *keys: str, default: str = "") -> str:
    for key in keys:
        value = source.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return default


def _setting_int(source: dict, *keys: str, default: int) -> int:
    raw = _setting_str(source, *keys)
    try:
        value = int(raw)
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default


def _setting_bool(source: dict, *keys: str, default: bool = False) -> bool:
    raw = _setting_str(source, *keys)
    if not raw:
        return default
    return raw.lower() in ("true", "1", "yes", "y", "是")


def _col_name(index: int) -> str:
    if index <= 0:
        raise RuntimeError("列序号必须大于 0")
    chars: list[str] = []
    while index:
        index, rem = divmod(index - 1, 26)
        chars.append(chr(65 + rem))
    return "".join(reversed(chars))


def _parse_cell(cell: str) -> tuple[str, int]:
    m = re.fullmatch(r"\$?([A-Za-z]+)\$?(\d+)", (cell or "").strip())
    if not m:
        raise RuntimeError(f"飞书表格起始单元格格式不正确: {cell or '空'}，示例：A1")
    return m.group(1).upper(), int(m.group(2))


def _col_index(col: str) -> int:
    n = 0
    for ch in col.upper():
        n = n * 26 + (ord(ch) - 64)
    return n


def _extract_feishu_wiki_token_and_sheet_id(raw: str) -> tuple[str, str]:
    raw = (raw or "").strip()
    if not raw:
        return "", ""
    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        parts = [p for p in parsed.path.split("/") if p]
        token = ""
        for i, part in enumerate(parts):
            if part == "wiki" and i + 1 < len(parts):
                token = parts[i + 1]
                break
        qs = parse_qs(parsed.query or "")
        return token, (qs.get("sheet") or [""])[0]
    return raw, ""


async def _get_feishu_tenant_token(base_url: str, token_url: str, app_id: str, app_secret: str) -> str:
    import httpx

    if not app_id or not app_secret:
        raise RuntimeError("飞书推送配置缺失: App ID / App Secret")
    token_url = token_url or f"{base_url}/open-apis/auth/v3/tenant_access_token/internal"
    cache_key = f"feishu_push|{token_url}|{app_id}"
    now = time.time()
    cached = _feishu_token_cache.get(cache_key)
    if cached and cached[1] > now + 60:
        return cached[0]
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            token_url,
            json={"app_id": app_id, "app_secret": app_secret},
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        resp.raise_for_status()
        data = resp.json()
    if data.get("code") not in (0, "0", None) and "tenant_access_token" not in data:
        raise RuntimeError(f"飞书 token 接口返回错误: {data.get('msg') or data}")
    token = data.get("tenant_access_token")
    if not token:
        raise RuntimeError(f"飞书 token 接口返回异常: {data}")
    _feishu_token_cache[cache_key] = (token, now + int(data.get("expire", 7200)))
    return token


async def _resolve_feishu_spreadsheet_token(base_url: str, tenant_token: str, wiki_token: str) -> str:
    import httpx

    url = f"{base_url}/open-apis/wiki/v2/spaces/get_node"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            url,
            params={"token": wiki_token, "obj_type": "wiki"},
            headers={"Authorization": f"Bearer {tenant_token}"},
        )
        try:
            data = resp.json()
        except Exception:
            data = {}
        if resp.status_code >= 400 and not data:
            resp.raise_for_status()
    if str(data.get("code", "0")) != "0":
        raise RuntimeError(f"飞书 Wiki 节点解析失败 (code={data.get('code')}): {data.get('msg') or data}")
    node = (data.get("data") or {}).get("node") or {}
    obj_type = str(node.get("obj_type") or "")
    obj_token = str(node.get("obj_token") or "")
    if obj_type not in ("sheet", "sheets", "spreadsheet"):
        raise RuntimeError(f"该 Wiki 节点不是电子表格，当前类型为: {obj_type or '未知'}")
    if not obj_token:
        raise RuntimeError(f"飞书 Wiki 节点未返回电子表格 token: {data}")
    return obj_token


async def _ensure_feishu_sheet_id(base_url: str, tenant_token: str, spreadsheet_token: str, sheet_id: str) -> str:
    import httpx

    if sheet_id:
        return sheet_id
    url = f"{base_url}/open-apis/sheets/v3/spreadsheets/{spreadsheet_token}/sheets/query"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {tenant_token}"})
        try:
            data = resp.json()
        except Exception:
            data = {}
        if resp.status_code >= 400 and not data:
            resp.raise_for_status()
    if str(data.get("code", "0")) != "0":
        raise RuntimeError(f"飞书工作表列表读取失败 (code={data.get('code')}): {data.get('msg') or data}")
    sheets = ((data.get("data") or {}).get("sheets")) or []
    if not sheets:
        raise RuntimeError("飞书电子表格未返回任何工作表，请手动填写 Sheet ID")
    first = sheets[0] or {}
    resolved = first.get("sheet_id") or first.get("sheetId") or first.get("id")
    if not resolved:
        raise RuntimeError(f"无法从工作表列表中识别 Sheet ID: {first}")
    return str(resolved)


async def _put_feishu_values(
    base_url: str,
    tenant_token: str,
    spreadsheet_token: str,
    write_range: str,
    values: list[list[Any]],
) -> None:
    import httpx

    url = f"{base_url}/open-apis/sheets/v2/spreadsheets/{spreadsheet_token}/values"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.put(
            url,
            json={"valueRange": {"range": write_range, "values": values}},
            headers={"Authorization": f"Bearer {tenant_token}", "Content-Type": "application/json; charset=utf-8"},
        )
        try:
            data = resp.json()
        except Exception:
            data = {}
        if resp.status_code >= 400 and not data:
            resp.raise_for_status()
    if str(data.get("code", "0")) != "0":
        raise RuntimeError(f"飞书表格写入失败 (code={data.get('code')}): {data.get('msg') or data}")


async def push_feishu_sheet(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    """把本地业务表推送/覆盖写入飞书在线表格。"""
    base_url = _setting_str(settings, "base_url", "FEISHU_BASE_URL", default="https://open.feishu.cn").rstrip("/")
    token_url = _setting_str(settings, "token_url", "FEISHU_TOKEN_URL")
    app_id = _setting_str(secrets, "app_id", "FEISHU_APP_ID")
    app_secret = _setting_str(secrets, "app_secret", "FEISHU_APP_SECRET")
    spreadsheet_token = _setting_str(settings, "spreadsheet_token", "FEISHU_SPREADSHEET_TOKEN")
    wiki_url_or_token = _setting_str(settings, "wiki_url_or_token", "FEISHU_WIKI_URL_OR_TOKEN")
    sheet_id = _setting_str(settings, "sheet_id", "FEISHU_SHEET_ID")
    start_cell = _setting_str(settings, "start_cell", "FEISHU_START_CELL", default="A1")
    include_header = _setting_bool(settings, "include_header", "FEISHU_INCLUDE_HEADER", default=True)
    batch_size = min(_setting_int(settings, "batch_size", "FEISHU_BATCH_SIZE", default=1000), 5000)
    period_ym = _setting_str(settings, "period_ym")

    if not spreadsheet_token and not wiki_url_or_token:
        raise RuntimeError("飞书推送配置缺失: Spreadsheet Token 或 Wiki 链接/节点 Token")

    tenant_token = await _get_feishu_tenant_token(base_url, token_url, app_id, app_secret)
    if not spreadsheet_token:
        wiki_token, sheet_from_query = _extract_feishu_wiki_token_and_sheet_id(wiki_url_or_token)
        if sheet_from_query and not sheet_id:
            sheet_id = sheet_from_query
        if not wiki_token:
            raise RuntimeError("Wiki 链接/节点 Token 未识别到有效 token")
        spreadsheet_token = await _resolve_feishu_spreadsheet_token(base_url, tenant_token, wiki_token)
    sheet_id = await _ensure_feishu_sheet_id(base_url, tenant_token, spreadsheet_token, sheet_id)

    rows = await _load_source_rows(source_table, db, period_ym)
    policy = await _resolve_push_mapping_policy(
        source_table, field_mappings, db, source_field_ids=sorted({key for row in rows for key in row})
    )
    mapped_rows = [json_ready_row(row) for row in await execute_push_mapping(rows, field_mappings, policy=policy)]

    source_col_codes, label_by_code, _type_by_code = await _load_source_columns_meta(source_table, db)
    mapping_pairs = [
        (m.get("source"), m.get("target"))
        for m in field_mappings
        if m.get("source") and m.get("target")
    ]

    if mapping_pairs:
        data_keys = [target for _, target in mapping_pairs]
        # 字段映射的目标名通常就是用户希望写入飞书的表头名称；若目标名等于源字段编码，则兜底显示源字段名称。
        header_labels = [
            target if target != source else label_by_code.get(source, source)
            for source, target in mapping_pairs
        ]
    elif mapped_rows:
        data_keys = list(mapped_rows[0].keys())
        for row in mapped_rows[1:]:
            for key in row.keys():
                if key not in data_keys:
                    data_keys.append(key)
        header_labels = [label_by_code.get(key, key) for key in data_keys]
    else:
        data_keys = source_col_codes
        header_labels = [label_by_code.get(key, key) for key in data_keys]

    if not data_keys:
        return 0, "源表无可推送字段，飞书推送跳过"
    if len(data_keys) > 100:
        raise RuntimeError(f"飞书单次写入最多支持 100 列，当前 {len(data_keys)} 列；请通过字段映射减少列数")

    start_col, start_row = _parse_cell(start_cell)
    start_col_idx = _col_index(start_col)
    end_col = _col_name(start_col_idx + len(data_keys) - 1)

    total = 0
    current_row = start_row
    if include_header:
        header_range = f"{sheet_id}!{start_col}{current_row}:{end_col}{current_row}"
        await _put_feishu_values(base_url, tenant_token, spreadsheet_token, header_range, [header_labels])
        current_row += 1

    for i in range(0, len(mapped_rows), batch_size):
        batch = mapped_rows[i: i + batch_size]
        values = [[row.get(key, "") for key in data_keys] for row in batch]
        if not values:
            continue
        end_row = current_row + len(values) - 1
        write_range = f"{sheet_id}!{start_col}{current_row}:{end_col}{end_row}"
        await _put_feishu_values(base_url, tenant_token, spreadsheet_token, write_range, values)
        current_row = end_row + 1
        total += len(values)

    return total, f"飞书表格推送成功：{total} 行，写入 {sheet_id}!{start_cell} 起始区域"



# ===== api_expose（只读 token 接口，对方主动拉）=====
# 实际数据由 push_router 里的 GET /push-targets/{id}/data 接口提供
# 此处只做 token 生成占位
async def push_api_expose(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    rows = await _load_source_rows(source_table, db, settings.get("period_ym", ""))
    return len(rows), f"API 暴露就绪：{len(rows)} 行可供拉取"


def _column_fingerprint(cols: list) -> str:
    """根据字段列表生成稳定指纹，用于检测 schema 变化。"""
    parts = sorted(f"{col.column_code}:{col.column_label or ''}" for col in cols)
    return hashlib.md5("|".join(parts).encode()).hexdigest()


async def push_db_realtime(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    """为实体表创建隔离的实时只读 PostgreSQL View。
    
    通过字段指纹对比，仅在源表 schema 变化时重建 View，
    避免每次推送都 DROP/CREATE。
    """
    import secrets as py_secrets
    import string
    from sqlalchemy import select as sa_select
    from app.core.config import settings as app_settings

    is_report = is_report_source(source_table)
    if is_report:
        from app.reports.models import Report
        from app.reports.sql_builder import compile_report_realtime_sql
        report = await db.get(Report, parse_report_source_id(source_table))
        if report is None:
            raise RuntimeError(f"报表不存在: {source_table}")
        source_sql, report_meta = await compile_report_realtime_sql(report, db)
        view_name = make_identifier("", f"report_{report.id}")
    else:
        Model = DATA_TABLES.get(source_table)
        if Model is None:
            raise RuntimeError(f"未知数据表: {source_table}")
        _ensure_entity_model(Model, source_table)
        view_name = make_identifier("", source_table)

    pt_id = str(settings.get("_pt_id") or "").strip()
    if not pt_id:
        raise RuntimeError("实时数据库访问缺少推送目标标识")
    target_key = f"{source_table}_{pt_id}"
    schema_name = make_identifier("finebi_", target_key)
    readonly_user = settings.get("readonly_user") or make_identifier("ro_", target_key)
    password = secrets.get("readonly_password", "")
    if not password:
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*()_+-="
        password = "".join(py_secrets.choice(alphabet) for _ in range(20))

    current_fingerprint = ""
    if not is_report:
        cols = (
            await db.execute(
                sa_select(TableColumn)
                .where(TableColumn.table_name == source_table, TableColumn.is_visible.is_(True))
                .order_by(TableColumn.display_order)
            )
        ).scalars().all()
        if not cols:
            raise RuntimeError(f"table_columns 中找不到表 {source_table} 的可见字段定义")
        for col in cols:
            _entity_column(Model, source_table, col.column_code)
        current_fingerprint = _column_fingerprint(cols)
        labels = _dedupe_labels(cols)
        source_table_q = quote_ident(source_table, kind="table")
        projection = ", ".join(
            f"{quote_ident(col.column_code)} AS {_quote_pg_identifier(labels[col.column_code])}"
            for col in cols
        )

        period_ym = settings.get("period_ym", "")
        where_sql = ""
        period_cfg = PERIOD_TABLES.get(source_table)
        if period_cfg and period_ym:
            period_col = period_cfg["period_col"]
            _entity_column(Model, source_table, period_col)
            where_sql = f" WHERE {quote_ident(period_col)} = {_quote_pg_literal(str(period_ym))}"
        view_sql = f"SELECT {projection} FROM public.{source_table_q}{where_sql}"
    else:
        view_sql = source_sql

    schema_q = _quote_pg_identifier(schema_name)
    view_q = _quote_pg_identifier(view_name)
    user_q = _quote_pg_identifier(readonly_user)
    db_q = _quote_pg_identifier(app_settings.DB_NAME)

    # 指纹对比：字段无变化且 View 已存在时跳过重建
    from app.push.models import PushTarget
    target = await db.get(PushTarget, int(pt_id))
    stored_fingerprint = (target.settings or {}).get("_column_fingerprint", "") if target else ""

    view_exists = (await db.execute(text(
        "SELECT EXISTS (SELECT FROM pg_catalog.pg_views "
        "WHERE schemaname = :schema AND viewname = :view)"
    ), {"schema": schema_name, "view": view_name})).scalar_one()

    if not is_report and current_fingerprint and view_exists and current_fingerprint == stored_fingerprint:
        rows = (await db.execute(text(f"SELECT COUNT(*) FROM {schema_q}.{view_q}"))).scalar_one()
        return rows, f"视图字段无变化，无需重建（{schema_name}.{view_name}）"

    await db.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema_q}"))
    await db.execute(text(f"DROP VIEW IF EXISTS {schema_q}.{view_q}"))
    await db.execute(text(
        f"CREATE VIEW {schema_q}.{view_q} AS {view_sql}"
    ))

    exists = (await db.execute(
        text("SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = :rolname)"),
        {"rolname": readonly_user},
    )).scalar_one()
    if exists:
        await db.execute(text(f"ALTER USER {user_q} WITH PASSWORD {_quote_pg_literal(password)}"))
    else:
        await db.execute(text(f"CREATE USER {user_q} WITH PASSWORD {_quote_pg_literal(password)}"))
    await db.execute(text(f"GRANT CONNECT ON DATABASE {db_q} TO {user_q}"))
    await db.execute(text(f"REVOKE ALL ON SCHEMA public FROM {user_q}"))
    schemas = (await db.execute(text(
        "SELECT nspname FROM pg_namespace WHERE nspname = 'finebi' OR nspname LIKE 'finebi\\_%' ESCAPE '\\'"
    ))).scalars().all()
    for name in schemas:
        name_q = _quote_pg_identifier(name)
        await db.execute(text(f"REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA {name_q} FROM {user_q}"))
        await db.execute(text(f"REVOKE ALL PRIVILEGES ON SCHEMA {name_q} FROM {user_q}"))
    await db.execute(text(f"GRANT USAGE ON SCHEMA {schema_q} TO {user_q}"))
    await db.execute(text(f"GRANT SELECT ON {schema_q}.{view_q} TO {user_q}"))
    await db.execute(text(f"ALTER ROLE {user_q} SET search_path TO {schema_q}"))
    await db.execute(text(f"ALTER ROLE {user_q} CONNECTION LIMIT {app_settings.DB_READONLY_CONNECTION_LIMIT}"))
    await db.execute(text(f"ALTER ROLE {user_q} SET statement_timeout TO '{app_settings.DB_READONLY_STATEMENT_TIMEOUT_SECONDS}s'"))
    await db.execute(text(f"ALTER ROLE {user_q} SET idle_in_transaction_session_timeout TO '{app_settings.DB_READONLY_IDLE_TRANSACTION_TIMEOUT_SECONDS}s'"))

    from app.core.secret_box import encrypt
    from sqlalchemy.orm.attributes import flag_modified
    if target:
        conn_host = app_settings.DB_PUBLIC_HOST or app_settings.DB_HOST
        conn_url = (
            f"postgresql://{_quote_conn_part(readonly_user)}:{_quote_conn_part(password)}"
            f"@{conn_host}:{app_settings.DB_PUBLIC_PORT}/{app_settings.DB_NAME}"
            f"?options=-csearch_path%3D{_quote_conn_part(schema_name)}"
        )
        target.schema_history = _schema_history(target, schema_name)
        target.secrets_encrypted = {**(target.secrets_encrypted or {}), "readonly_password": encrypt(password)}
        target.settings = {
            **(target.settings or {}), "readonly_user": readonly_user,
            "host": conn_host, "port": app_settings.DB_PORT, "database": app_settings.DB_NAME,
            "schema": schema_name, "view": view_name, "conn_url": conn_url,
            "jdbc_url": f"jdbc:postgresql://{conn_host}:{app_settings.DB_PUBLIC_PORT}/{app_settings.DB_NAME}?currentSchema={_quote_conn_part(schema_name)}",
        }
        if not is_report:
            target.settings["_column_fingerprint"] = current_fingerprint
        flag_modified(target, "schema_history")
        flag_modified(target, "secrets_encrypted")
        flag_modified(target, "settings")
    from app.push.pg_hba import sync_pg_hba_rules
    await sync_pg_hba_rules(db)
    rows = (await db.execute(text(f"SELECT COUNT(*) FROM {schema_q}.{view_q}"))).scalar_one()
    return rows, f"实时视图已部署：{schema_name}.{view_name}，只读账号：{readonly_user}"


async def push_db_snapshot(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    """每个推送配置独立 schema/table，支持同一源表暴露多个只读账号。"""
    import secrets as py_secrets
    import string
    from sqlalchemy import text, select as sa_select
    from app.core.config import settings as app_settings

    Model = DATA_TABLES.get(source_table)
    if Model is None and not is_report_source(source_table):
        raise RuntimeError(f"未知数据表: {source_table}")
    if Model is not None:
        _ensure_entity_model(Model, source_table)

    # 报表来源 source_table 含冒号(report:3)，替换为下划线用于 PG 标识符
    safe_source = source_table.replace(":", "_") if is_report_source(source_table) else source_table
    pt_id = str(settings.get("_pt_id") or "").strip()
    target_key = f"{safe_source}_{pt_id}" if pt_id else safe_source
    readonly_user = settings.get("readonly_user") or f"ro_{target_key}_{py_secrets.token_hex(4)}"[:63]
    password = secrets.get("readonly_password", "")
    if not password:
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*()_+-="
        password = "".join(py_secrets.choice(alphabet) for _ in range(20))

    schema_name = make_identifier("finebi_", target_key)
    finebi_table = make_identifier("t_", target_key)
    schema_q = _quote_pg_identifier(schema_name)
    finebi_table_q = _quote_pg_identifier(finebi_table)
    readonly_user_q = _quote_pg_identifier(readonly_user)
    db_name_q = _quote_pg_identifier(app_settings.DB_NAME)

    # 1. 读取字段元数据，构建中文列名物理表
    is_report = is_report_source(source_table)
    if not is_report:
        source_table_q = quote_ident(source_table, kind="table")
    if is_report:
        # 报表来源：从 push columns 取字段，按原始 data_type 建表
        codes, label_by_code, type_by_code = await _load_source_columns_meta(source_table, db)
        if not codes:
            raise RuntimeError(f"报表 {source_table} 无推送字段定义")
        cols_def = ", ".join(
            f"{_quote_pg_identifier(label_by_code[c])} {postgres_type(type_by_code.get(c))}"
            for c in codes
        )
        insert_cols = ", ".join(_quote_pg_identifier(label_by_code[c]) for c in codes)
    else:
        cols = (
            await db.execute(
                sa_select(TableColumn)
                .where(TableColumn.table_name == source_table, TableColumn.is_visible.is_(True))
                .order_by(TableColumn.display_order)
            )
        ).scalars().all()
        if not cols:
            raise RuntimeError(f"table_columns 中找不到表 {source_table} 的字段定义")
        for col in cols:
            _entity_column(Model, source_table, col.column_code)
        label_by_code = _dedupe_labels(cols)
        cols_def = ", ".join(
            f"{_quote_pg_identifier(label_by_code[c.column_code])} {postgres_type(c.data_type)}"
            for c in cols
        )
        insert_cols = ", ".join(_quote_pg_identifier(label_by_code[c.column_code]) for c in cols)
        cols_sel = ", ".join(
            f"{quote_ident(c.column_code)} AS {_quote_pg_identifier(label_by_code[c.column_code])}"
            for c in cols
        )

    period_ym = settings.get("period_ym", "")
    where_sql = ""
    params: dict[str, Any] = {}
    if not is_report:
        period_cfg = PERIOD_TABLES.get(source_table)
        if period_cfg and period_ym:
            period_col = period_cfg["period_col"]
            _entity_column(Model, source_table, period_col)
            where_sql = f" WHERE {quote_ident(period_col)} = :period_ym"
            params["period_ym"] = period_ym

    # 2. 确保独立 schema 存在
    await db.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema_q}"))

    view_name = make_identifier("", safe_source)
    view_name_q = _quote_pg_identifier(view_name)
    staging_table = make_identifier("t_", f"{target_key}_{py_secrets.token_hex(4)}")
    staging_table_q = _quote_pg_identifier(staging_table)
    await db.execute(text(
        f"CREATE TABLE {schema_q}.{staging_table_q} "
        f"(id BIGINT, synced_at TIMESTAMPTZ, {cols_def})"
    ))
    if is_report:
        # 报表来源：先取数再逐行 INSERT，按 data_type 做类型转换
        rows = await _load_source_rows(source_table, db, period_ym)
        if rows:
            col_names = [c for c in rows[0].keys()]
            placeholders = ", ".join(f":col_{i}" for i in range(len(col_names)))
            insert_sql = f"INSERT INTO {schema_q}.{staging_table_q} (id, synced_at, {insert_cols}) VALUES (DEFAULT, NOW(), {placeholders})"
            for row in rows:
                typed_params = {
                    f"col_{i}": _coerce_pg_value(row.get(c), type_by_code.get(c, "string"))
                    for i, c in enumerate(col_names)
                }
                await db.execute(text(insert_sql), typed_params)
    else:
        await db.execute(text(
            f"INSERT INTO {schema_q}.{staging_table_q} "
            f"(id, synced_at, {insert_cols}) "
            f"SELECT id, synced_at, {cols_sel} FROM public.{source_table_q}{where_sql}"
        ), params)

    # 固定 View 在同一事务内切换到已完整写入的暂存表，读者始终查询同一对象。
    await db.execute(text(
        f"CREATE OR REPLACE VIEW {schema_q}.{view_name_q} AS "
        f"SELECT * FROM {schema_q}.{staging_table_q}"
    ))

    # 清理同目标旧暂存表，但保留当前 View 正在引用的表。
    old_tables = (await db.execute(text(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = :schema_name AND table_name LIKE :pattern"
    ), {"schema_name": schema_name, "pattern": f"t_{target_key}_%"})).scalars().all()
    for old_table in old_tables:
        if old_table != staging_table:
            await db.execute(text(f"DROP TABLE IF EXISTS {schema_q}.{_quote_pg_identifier(old_table)}"))

    # 3. 创建或更新只读账号密码（始终同步，避免重建推送时密码不一致）
    role_exists = (
        await db.execute(
            text("SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = :rolname)"),
            {"rolname": readonly_user},
        )
    ).scalar_one()
    if role_exists:
        await db.execute(text(f"ALTER USER {readonly_user_q} WITH PASSWORD {_quote_pg_literal(password)}"))
    else:
        await db.execute(text(f"CREATE USER {readonly_user_q} WITH PASSWORD {_quote_pg_literal(password)}"))
    await db.execute(text(f"GRANT CONNECT ON DATABASE {db_name_q} TO {readonly_user_q}"))

    # 4. 先撤销该账号对所有 FineBI 暴露 schema 的权限，再只授权当前表
    await db.execute(text(f"REVOKE ALL ON SCHEMA public FROM {readonly_user_q}"))
    finebi_schemas = (
        await db.execute(
            text("SELECT nspname FROM pg_namespace WHERE nspname = 'finebi' OR nspname LIKE 'finebi\\_%' ESCAPE '\\'")
        )
    ).scalars().all()
    for existing_schema in finebi_schemas:
        existing_schema_q = _quote_pg_identifier(existing_schema)
        await db.execute(text(f"REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA {existing_schema_q} FROM {readonly_user_q}"))
        await db.execute(text(f"REVOKE ALL PRIVILEGES ON SCHEMA {existing_schema_q} FROM {readonly_user_q}"))
    await db.execute(text(f"GRANT USAGE ON SCHEMA {schema_q} TO {readonly_user_q}"))
    await db.execute(text(f"GRANT SELECT ON {schema_q}.{staging_table_q} TO {readonly_user_q}"))
    await db.execute(text(f"GRANT SELECT ON {schema_q}.{view_name_q} TO {readonly_user_q}"))
    await db.execute(text(f"ALTER ROLE {readonly_user_q} SET search_path TO {schema_q}"))
    await db.execute(text(f"ALTER ROLE {readonly_user_q} CONNECTION LIMIT {app_settings.DB_READONLY_CONNECTION_LIMIT}"))
    await db.execute(text(f"ALTER ROLE {readonly_user_q} SET statement_timeout TO '{app_settings.DB_READONLY_STATEMENT_TIMEOUT_SECONDS}s'"))
    await db.execute(text(f"ALTER ROLE {readonly_user_q} SET idle_in_transaction_session_timeout TO '{app_settings.DB_READONLY_IDLE_TRANSACTION_TIMEOUT_SECONDS}s'"))

    await db.commit()

    conn_host = app_settings.DB_PUBLIC_HOST or app_settings.DB_HOST
    conn_url = (
        f"postgresql://{_quote_conn_part(readonly_user)}:{_quote_conn_part(password)}"
        f"@{conn_host}:{app_settings.DB_PUBLIC_PORT}/{app_settings.DB_NAME}"
        f"?options=-csearch_path%3D{_quote_conn_part(schema_name)}"
    )
    jdbc_url = f"jdbc:postgresql://{conn_host}:{app_settings.DB_PUBLIC_PORT}/{app_settings.DB_NAME}?currentSchema={_quote_conn_part(schema_name)}"

    # 5. 回写连接信息到 PushTarget（按 pt_id 精确匹配，防止同表多推送目标写错行）
    from app.push.models import PushTarget
    if pt_id:
        pts = await db.get(PushTarget, int(pt_id))
    else:
        pts = (await db.execute(
            sa_select(PushTarget).where(
                PushTarget.source_table == source_table,
                PushTarget.push_type == "db_snapshot",
            )
        )).scalars().first()
    if pts:
        from app.core.secret_box import encrypt
        from sqlalchemy.orm.attributes import flag_modified
        new_secrets = dict(pts.secrets_encrypted or {})
        new_secrets["readonly_password"] = encrypt(password)
        pts.secrets_encrypted = new_secrets
        pts.schema_history = _schema_history(pts, schema_name)
        pts.settings = {
            **(pts.settings or {}),
            "readonly_user": readonly_user,
            "host": conn_host,
            "port": app_settings.DB_PUBLIC_PORT,
            "database": app_settings.DB_NAME,
            "schema": schema_name,
            "table": staging_table,
            "view": view_name,
            "conn_url": conn_url,
            "jdbc_url": jdbc_url,
        }
        flag_modified(pts, "secrets_encrypted")
        flag_modified(pts, "schema_history")
        flag_modified(pts, "settings")
        await db.commit()

    rows = (await db.execute(text(f"SELECT COUNT(*) FROM {schema_q}.{staging_table_q}"))).scalar_one()
    return rows, f"FineBI 表已刷新：{schema_name}.{staging_table}，只读账号：{readonly_user}，连接：{conn_url}，JDBC：{jdbc_url}"


# ===== 统一调度入口 =====

PUSH_HANDLERS = {
    "external_db": push_external_db,
    "http_push": push_http,
    "api_expose": push_api_expose,
    "db_snapshot": push_db_snapshot,
    "db_realtime": push_db_realtime,
    "feishu_sheet": push_feishu_sheet,
}


async def execute_push(
    push_target_id: int,
    db: AsyncSession,
    period_ym: str = "",
) -> tuple[int, str]:
    from app.push.models import PushTarget
    from app.core.secret_box import decrypt

    pt = await db.get(PushTarget, push_target_id)
    if pt is None:
        raise RuntimeError(f"PushTarget {push_target_id} 不存在")
    if not pt.is_active:
        raise RuntimeError("推送目标已禁用")

    handler = PUSH_HANDLERS.get(pt.push_type)
    if handler is None:
        raise RuntimeError(f"不支持的推送类型: {pt.push_type}")

    secrets = {k: decrypt(v) for k, v in (pt.secrets_encrypted or {}).items()}
    settings = dict(pt.settings or {})

    # period_ym 优先取调用方传入的，其次取配置里的
    if period_ym:
        settings["period_ym"] = period_ym

    if pt.push_type in ("db_snapshot", "db_realtime"):
        settings.setdefault("_pt_id", pt.id)

    # P2: 统一来源协议 — 非 table 类型解析来源表名
    from app.warehouse.service_ref import resolve_source_table_name
    effective_source = pt.source_table
    if pt.source_type and pt.source_type != "table":
        effective_source = await resolve_source_table_name(pt.source_type, pt.source_id, db)

    rows, message = await handler(
        effective_source, settings, secrets, pt.field_mappings or [], db
    )

    # 回写状态
    pt.last_push_at = datetime.now(UTC)
    pt.last_status = "success"
    pt.last_rows = rows
    pt.last_message = message

    return rows, message
