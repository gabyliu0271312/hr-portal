"""C1 动态列同步服务

- 写库：业务字段写入实体列 + 算 pk_hash + upsert
- 自动发现：每次同步时检查源端 key，没注册过的先 ALTER TABLE ADD COLUMN，再 INSERT table_columns
- 业务主键：从 table_columns 中 is_pk_part=true 的列里取值，组合成 pk_hash
- 若没有任何 PK 列，回退到整行 dict 的稳定 hash
- 员工实时花名册按 snapshot 处理，每次同步仅保留最新快照
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, UTC, date
from decimal import Decimal, InvalidOperation

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings as app_settings
from app.data.ddl import (
    DDLValidationError,
    add_source_column,
    validate_column_name,
)
from app.data.dynamic_loader import register_source_table_model
from app.data.models import (
    DATA_TABLES,
    CostCenterNode,
    OrgNode,
    TableColumn,
)
from app.datasources.beisen_client import make_client
from app.data.formula import eval_formula

logger = logging.getLogger(__name__)


# ===== 月度表配置（通用）=====
# 在这里登记的表：is_period=True，同步时按 period_source 决定是否注入月份列。
# 业务实体键（entity_keys）已移到字段管理 is_pk_part，此处不再维护。
PERIOD_TABLES: dict[str, dict] = {
    "cost_center_monthly": {
        "period_col": "month",
        "offset_key": "MONTH_OFFSET",
        "period_source": "inject",  # 接口无月份，同步时自动注入
    },
    "emp_monthly_cost_result": {
        "period_col": "month",
        "offset_key": "MONTH_OFFSET",
        "period_source": "inject",
    },
}


# 源端字段永久黑名单：这些列即使源端返回也丢弃、不入库（改由本地手工字段维护）。
# 成本中心「启用状态」改为本地手工维护，北森不再同步该字段。
SOURCE_DROP_COLUMNS: dict[str, set[str]] = {
    "cost_center_monthly": {"status"},
    # 组织单元「变动日期」不入库（仅保留设立日期/生效日期）；删元数据后源端会退回中文名，
    # 这里按中文名拦截，避免下次同步把它当新字段重建。
    "org_unit": {"变动日期", "change_date"},
}


# 年月列强制规范化为 YYYYMM（便于跨表按月份 JOIN）。
# 如分摊表「成本归属年月」源端是 "2025-10"，统一成 "202510"，与成本中心「月份」对齐。
YEARMONTH_COLUMNS: dict[str, set[str]] = {
    "emp_monthly_allocation": {"cost_period"},
    "emp_monthly_salary": {"pay_month"},
}


# 跨表查找填值（lookup/enrichment）：同步/重算时按规则从另一张表查出值填进 target。
# 只填空（target 为空才填）、保留手改；rules 按顺序优先级，命中即停。
# default：所有规则都未命中时填入的兜底值（可选）。
LOOKUP_FIELDS: dict[str, list[dict]] = {
    "emp_monthly_salary": [
        {
            "target": "expense_type",
            "lookup_table": "emp_monthly_cost_class",
            "type_col": "field_type",          # 映射表「字段类型」列（值=工号/甲方对应的中文判别值）
            "value_col": "value",              # 映射表「值」列
            "result_col": "cost_classification",  # 映射表「费用类型」列
            "rules": [                          # 先工号、后甲方
                {"match_type": "工号", "src_field": "employee_no"},
                {"match_type": "甲方", "src_field": "client"},
            ],
            "default": "工资",                  # 都未命中时默认归为工资
        }
    ],
}

_YM_RE = re.compile(r"^\D*(\d{4})\D?(\d{1,2})")


def _normalize_yyyymm(value) -> str:
    """'2025-10' / '2025/10' / '202510' / '2025-1' → '202510'；不认识则原样返回"""
    s = str(value).strip()
    m = _YM_RE.match(s)
    if not m:
        return s
    return f"{m.group(1)}{int(m.group(2)):02d}"


def _resolve_period_ym(cfg: dict, settings: dict) -> str:
    """按 settings 的偏移算出本期 YYYYMM"""
    try:
        offset = int(settings.get(cfg["offset_key"]) or 0)
    except (ValueError, TypeError):
        offset = 0
    today = date.today()
    m = today.year * 12 + (today.month - 1) + offset
    y, mm = divmod(m, 12)
    return f"{y:04d}{mm + 1:02d}"


def _prev_ym(ym: str) -> str:
    """上一月 YYYYMM；解析失败返回空串"""
    try:
        y, mm = int(ym[:4]), int(ym[4:6])
    except (ValueError, IndexError):
        return ""
    idx = y * 12 + (mm - 1) - 1
    yy, m2 = divmod(idx, 12)
    return f"{yy:04d}{m2 + 1:02d}"


# 表头接口没翻译成中文名的列，key 里会带北森报表列的 UUID（如 "<guid>_Id"）
# 或北森内部字段标识（如 "corehr_..._id" / "..._alias" / "..._original"）。
# 这类列对业务无意义，落库前一律丢弃（含将来接口新增的同类列）。
_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
# 北森辅助列形态：xxx_数字_id / xxx_数字_数字_id / xxx_alias / xxx_original 结尾
_HELPER_COL_RE = re.compile(r"(_\d{4,}(?:_\d+)*_(id|alias)|_original|_alias)$", re.IGNORECASE)


def _strip_uuid_columns(rows: list[dict]) -> None:
    """就地删除未被翻译的北森噪音列(UUID列 + corehr_/_id/_alias/_original 辅助列)。

    已翻译成英文 column_code 的业务字段是干净标识(employee_no 等),不受影响。
    """
    for r in rows:
        if not isinstance(r, dict):
            continue
        for k in [k for k in r if _UUID_RE.search(k) or _HELPER_COL_RE.search(k)]:
            del r[k]




# ===== 字段元数据：自动发现 + 注册 =====


def _guess_data_type(value) -> str:
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        # 尝试日期解析（容错北森常见格式）
        s = value.strip()
        if len(s) >= 8:
            for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
                try:
                    datetime.strptime(s[:10], fmt)
                    return "date"
                except ValueError:
                    pass
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
                try:
                    datetime.strptime(s[:19], fmt)
                    return "datetime"
                except ValueError:
                    pass
        # 数字字符串
        try:
            float(s)
            return "number"
        except ValueError:
            pass
    return "string"


def _model_has_column(model, column_code: str) -> bool:
    return column_code in model.__table__.columns


def _assert_entity_model(model, table_name: str) -> None:
    if "raw" in model.__table__.columns:
        raise RuntimeError(
            f"业务表 {table_name} 不是实体列结构，请先执行阶段 3 重建为实体列业务表"
        )


async def _source_columns(table_name: str, db: AsyncSession) -> list[TableColumn]:
    return (
        await db.execute(
            select(TableColumn)
            .where(TableColumn.table_name == table_name)
            .order_by(TableColumn.display_order, TableColumn.id)
        )
    ).scalars().all()


def _row_to_dict(row, columns: list[TableColumn]) -> dict:
    out: dict = {}
    for col in columns:
        if hasattr(row, col.column_code):
            out[col.column_code] = _normalize_db_value(getattr(row, col.column_code))
    return out


def _normalize_db_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _coerce_db_value(value, data_type: str):
    if value in (None, ""):
        return None
    key = (data_type or "string").strip().lower()
    if key in {"string", "text", "enum"}:
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)
    if key == "number":
        try:
            return Decimal(str(value).replace(",", "").strip())
        except (InvalidOperation, ValueError):
            return None
    if key == "integer":
        try:
            return int(Decimal(str(value).replace(",", "").strip()))
        except (InvalidOperation, ValueError):
            return None
    if key == "date":
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        text = str(value).strip().replace("/", "-")
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None
    if key == "datetime":
        if isinstance(value, datetime):
            return value
        text = str(value).strip().replace("/", "-").replace("T", " ")
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(text[:19 if " " in fmt else 10], fmt).replace(tzinfo=UTC)
            except ValueError:
                pass
        return None
    if key in {"boolean", "bool"}:
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"1", "true", "t", "yes", "y", "是", "启用"}:
            return True
        if text in {"0", "false", "f", "no", "n", "否", "停用"}:
            return False
        return None
    return value


def _field_key_needs_codegen(key: str) -> bool:
    try:
        validate_column_name(key)
        return False
    except DDLValidationError:
        return True


async def _field_code_for_key(
    *,
    table_name: str,
    key: str,
    label: str,
    used_codes: set[str],
    label_to_code: dict[str, str],
    db: AsyncSession,
) -> tuple[str, bool]:
    """Return (column_code, renamed) for a source key under strict entity schema."""
    reused = label_to_code.get(label)
    if reused:
        used_codes.add(reused)
        return reused, reused != key

    from app.codegen.rules import deterministic_code, unique_code
    from app.codegen.service import ai_translate_code

    ai_code, _expl, _usage = await ai_translate_code(
        db,
        label=label,
        scope="field",
        context=f"数据表 {table_name} 自动同步字段",
    )
    base = ai_code or deterministic_code(label)
    new_code = unique_code(base, used_codes)
    validate_column_name(new_code)
    used_codes.add(new_code)
    label_to_code.setdefault(label, new_code)
    return new_code, new_code != key


def _payload_for_entity_row(
    *,
    model,
    merged: dict,
    columns_by_code: dict[str, TableColumn],
    pk_hash: str,
) -> dict:
    payload = {
        "pk_hash": pk_hash,
        "synced_at": datetime.now(UTC),
    }
    for code, col in columns_by_code.items():
        if not _model_has_column(model, code):
            raise RuntimeError(f"业务表 {model.__tablename__} 缺少实体列: {code}")
        payload[code] = _coerce_db_value(merged.get(code), col.data_type)
    return payload


async def _ensure_columns(
    table_name: str,
    sample_row: dict,
    db: AsyncSession,
    column_labels: dict[str, str] | None = None,
) -> dict[str, str]:
    """从样本行扫描所有 key，对没注册过的字段创建实体列并写入 table_columns。

    返回 rename_map: {样本行里的中文key: 新生成的英文code}，
    供调用方把源端 key 同步改成实体列 column_code。
    """
    if not sample_row:
        return {}

    existing_cols = (
        await db.execute(
            select(TableColumn).where(TableColumn.table_name == table_name)
        )
    ).scalars().all()
    existing_by_code = {col.column_code: col for col in existing_cols}
    # 中文 label → 已有 code(同 label 多条时取 display_order 最小=最早建的,稳定可复现)
    label_to_code: dict[str, str] = {}
    for col in sorted(existing_cols, key=lambda c: c.display_order):
        if col.column_label and col.column_label not in label_to_code:
            label_to_code[col.column_label] = col.column_code
    column_labels = column_labels or {}
    # 当前库内最大 display_order
    max_order = (
        await db.execute(
            select(TableColumn.display_order)
            .where(TableColumn.table_name == table_name)
            .order_by(TableColumn.display_order.desc())
            .limit(1)
        )
    ).scalar_one_or_none() or 0

    new_cols = []
    rename_map: dict[str, str] = {}
    used_codes = set(existing_by_code.keys())
    added_physical_columns = False
    for key, val in sample_row.items():
        if key in existing_by_code:
            label = column_labels.get(key) or key
            col = existing_by_code[key]
            if col.column_label == col.column_code and label != key:
                col.column_label = label
            continue

        # 新字段:key 可能是合法英文 code，也可能是中文名/带空格旧 code。
        # 实体表只接受合法 column_code；非合法 key 必须生成合法 code 后再建物理列。
        label = column_labels.get(key) or key
        if _field_key_needs_codegen(key):
            new_code, renamed = await _field_code_for_key(
                table_name=table_name,
                key=key,
                label=label,
                used_codes=used_codes,
                label_to_code=label_to_code,
                db=db,
            )
            if renamed:
                rename_map[key] = new_code
        else:
            new_code = key
            validate_column_name(new_code)
            used_codes.add(new_code)
        label_to_code.setdefault(label, new_code)
        # 中文/非法 key 反查到已有 code 时（如"成本归属年月"→cost_period），
        # 只写 rename_map，不重复建物理列和元数据。
        if new_code in existing_by_code:
            continue
        max_order += 10
        dtype = _guess_data_type(val)
        try:
            await add_source_column(db, table_name, new_code, dtype)
        except DDLValidationError as exc:
            raise RuntimeError(f"自动新增实体列失败: {table_name}.{new_code}: {exc}") from exc
        added_physical_columns = True
        new_cols.append(
            TableColumn(
                table_name=table_name,
                column_code=new_code,
                column_label=label,
                data_type=dtype,
                is_pk_part=False,
                is_sensitive=False,
                is_visible=True,
                display_order=max_order,
                auto_discovered=True,
                # 自动预标聚合角色：数字→度量，其余→维度（管理员可在字段管理改）
                agg_role="measure" if dtype == "number" else "dimension",
            )
        )
    if new_cols:
        db.add_all(new_cols)
        await db.flush()
    if added_physical_columns:
        await register_source_table_model(db, table_name, force=True)
    return rename_map


# ===== 业务主键计算 =====


async def _get_pk_columns(table_name: str, db: AsyncSession) -> list[str]:
    rows = (
        await db.execute(
            select(TableColumn.column_code)
            .where(
                TableColumn.table_name == table_name,
                TableColumn.is_pk_part.is_(True),
            )
            .order_by(TableColumn.display_order)
        )
    ).all()
    return [r[0] for r in rows]


def _calc_pk_hash(row: dict, pk_columns: list[str]) -> str:
    """根据 PK 列的值算稳定 hash；没设 PK 时退化为整行 hash"""
    if pk_columns:
        parts = [str(row.get(c, "")) for c in pk_columns]
        material = "||".join(parts)
    else:
        material = json.dumps(row, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]


# ===== 通用 upsert =====


async def _ensure_period_meta(table_name: str, db: AsyncSession) -> None:
    """月度表元数据收口：把期间实体列置为主键并排到最前。

    业务实体键（如工号、编码）由管理员在字段管理里手动勾选 is_pk_part，此处只处理期间列。
    """
    cfg = PERIOD_TABLES.get(table_name)
    if not cfg:
        return
    period_col = cfg["period_col"]
    try:
        validate_column_name(period_col)
    except DDLValidationError as exc:
        raise RuntimeError(
            f"月度表 {table_name} 的 period_col 必须是实体列编码，当前值: {period_col}"
        ) from exc
    cols = (
        await db.execute(
            select(TableColumn).where(
                TableColumn.table_name == table_name,
                TableColumn.column_code == period_col,
            )
        )
    ).scalars().all()
    for c in cols:
        c.is_pk_part = True
        c.display_order = 0
    await db.flush()


async def _get_manual_columns(table_name: str, db: AsyncSession) -> list[dict]:
    """手工字段（auto_discovered=false）：[{code, copy, default}, ...]

    default：值列表(enum)字段取第一个可选项作为默认值；其它类型为 None。
    新增行（上月没有、复制不到值）落库时用 default 兜底。
    """
    rows = (
        await db.execute(
            select(
                TableColumn.column_code,
                TableColumn.copy_from_last_month,
                TableColumn.data_type,
                TableColumn.enum_options,
            ).where(
                TableColumn.table_name == table_name,
                TableColumn.auto_discovered.is_(False),
            )
        )
    ).all()
    out = []
    for code, cp, dtype, opts in rows:
        default = None
        if dtype == "enum" and isinstance(opts, list) and opts:
            default = opts[0]
        out.append({"code": code, "copy": bool(cp), "default": default})
    return out


async def _get_computed_columns(table_name: str, db: AsyncSession) -> list[dict]:
    """计算字段（is_computed=true 且公式非空）：[{code, formula}, ...]"""
    rows = (
        await db.execute(
            select(TableColumn.column_code, TableColumn.formula_expr).where(
                TableColumn.table_name == table_name,
                TableColumn.is_computed.is_(True),
            )
        )
    ).all()
    return [
        {"code": code, "formula": expr}
        for code, expr in rows
        if expr
    ]


async def build_lookup_maps(table_name: str, db: AsyncSession) -> list[tuple[dict, dict]]:
    """为某表的 lookup 配置预加载映射字典。

    返回 [(cfg, {(type_val, value_val): result_val}), ...]；一次同步/重算只读一次映射表。
    """
    out: list[tuple[dict, dict]] = []
    for cfg in LOOKUP_FIELDS.get(table_name, []):
        LM = DATA_TABLES.get(cfg["lookup_table"])
        if LM is None:
            continue
        _assert_entity_model(LM, cfg["lookup_table"])
        lookup_columns = await _source_columns(cfg["lookup_table"], db)
        required = [cfg["type_col"], cfg["value_col"], cfg["result_col"]]
        missing = [code for code in required if not _model_has_column(LM, code)]
        if missing:
            raise RuntimeError(f"lookup 表 {cfg['lookup_table']} 缺少实体列: {missing}")

        rows = (await db.execute(select(LM))).scalars().all()
        m: dict[tuple[str, str], object] = {}
        for row in rows:
            values = _row_to_dict(row, lookup_columns)
            key = (
                str(values.get(cfg["type_col"], "")),
                str(values.get(cfg["value_col"], "")),
            )
            m[key] = values.get(cfg["result_col"])
        out.append((cfg, m))
    return out


def apply_lookups_to_row(merged: dict, lookup_maps: list[tuple[dict, dict]]) -> None:
    """对一行按 lookup 配置填值：仅当 target 为空时，按 rules 顺序查找，命中非空即填并停；
    全部未命中则填 cfg['default']（若配置）。"""
    for cfg, m in lookup_maps:
        if merged.get(cfg["target"]) not in (None, ""):
            continue
        hit = False
        for rule in cfg["rules"]:
            src_val = merged.get(rule["src_field"])
            if src_val in (None, ""):
                continue
            res = m.get((rule["match_type"], str(src_val)))
            if res not in (None, ""):
                merged[cfg["target"]] = res
                hit = True
                break
        if not hit and cfg.get("default") not in (None, ""):
            merged[cfg["target"]] = cfg["default"]


async def _dynamic_upsert(
    table_name: str, rows: list[dict], db: AsyncSession,
    period_ym: str = "",
    column_labels: dict[str, str] | None = None,
) -> int:
    Model = DATA_TABLES.get(table_name)
    if Model is None:
        raise RuntimeError(f"未知业务表: {table_name}")
    _assert_entity_model(Model, table_name)

    # 空批次：源端可能异常，不做任何删除，直接返回
    if not rows:
        return 0

    # 内部归档调用可通过 period_ym 显式给月度表补期间列。
    cfg = PERIOD_TABLES.get(table_name)
    if cfg and period_ym:
        period_col = cfg["period_col"]
        validate_column_name(period_col)
        normalized_period = _normalize_yyyymm(period_ym)
        for r in rows:
            if not isinstance(r, dict):
                continue
            existing_period = r.get(period_col)
            if existing_period in (None, ""):
                r[period_col] = normalized_period
                continue
            normalized_existing = _normalize_yyyymm(existing_period)
            if normalized_existing != normalized_period:
                raise RuntimeError(
                    f"月度表 {table_name} 行数据期间 {normalized_existing} "
                    f"与请求期间 {normalized_period} 不一致"
                )
            r[period_col] = normalized_existing

    # 1) 自动注册新字段（扫描全批次 key，避免第一行为空列导致漏建）
    sample_row: dict = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        for key, value in r.items():
            if key not in sample_row or sample_row[key] in (None, ""):
                sample_row[key] = value
    rename_map = await _ensure_columns(table_name, sample_row, db, column_labels=column_labels)

    # 1b) 全新中文/非法 key 已生成英文 code → 把所有行 key 改成实体列 code
    if rename_map:
        for r in rows:
            if isinstance(r, dict):
                for zh, en in rename_map.items():
                    if zh in r:
                        r[en] = r.pop(zh)
    Model = DATA_TABLES.get(table_name)
    if Model is None:
        raise RuntimeError(f"未知业务表: {table_name}")
    _assert_entity_model(Model, table_name)

    if cfg:
        period_col = cfg["period_col"]
        validate_column_name(period_col)
        for r in rows:
            if not isinstance(r, dict):
                continue
            if r.get(period_col) in (None, ""):
                raise RuntimeError(f"月度表 {table_name} 缺少期间字段: {period_col}")
            r[period_col] = _normalize_yyyymm(r[period_col])

    # 2) 月度表：收口期间列主键
    await _ensure_period_meta(table_name, db)

    # 3) 取字段元数据/业务主键列，并要求元数据字段都有实体列
    table_columns = await _source_columns(table_name, db)
    columns_by_code = {col.column_code: col for col in table_columns}
    missing_physical = [
        col.column_code for col in table_columns if not _model_has_column(Model, col.column_code)
    ]
    if missing_physical:
        raise RuntimeError(f"业务表 {table_name} 缺少实体列: {missing_physical}")
    pk_columns = await _get_pk_columns(table_name, db)

    # 4) 同批次去重（多行同 PK 取最后一行），保留顺序
    deduped: list[tuple[str, dict]] = []
    index_of: dict[str, int] = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        h = _calc_pk_hash(r, pk_columns)
        if h in index_of:
            deduped[index_of[h]] = (h, r)
        else:
            index_of[h] = len(deduped)
            deduped.append((h, r))
    _valid_cnt = len([r for r in rows if isinstance(r, dict)])
    if _valid_cnt != len(deduped):
        logger.info(
            "[upsert] table=%s 入参=%d 按主键去重后=%d 主键列=%s",
            table_name, _valid_cnt, len(deduped), pk_columns,
        )
    if not deduped:
        return 0

    # 5) 手工字段：保留已维护值（同期重拉不被源端冲掉）+ 复制上月（新行只填空）+ 新行默认值
    manual = await _get_manual_columns(table_name, db)
    manual_codes = [m["code"] for m in manual]
    copy_codes = [m["code"] for m in manual if m["copy"]]
    defaults = {m["code"]: m["default"] for m in manual if m["default"] is not None}

    existing_map: dict[str, dict] = {}
    if manual_codes:
        hashes = [h for h, _ in deduped]
        existing_rows = (
            await db.execute(
                select(Model).where(Model.pk_hash.in_(hashes))
            )
        ).scalars().all()
        existing_map = {
            row.pk_hash: _row_to_dict(row, table_columns)
            for row in existing_rows
        }

    # 上月行（按 is_pk_part 列中除 period_col 外的业务键匹配，仅复制上月需要）
    prev_map: dict[tuple, dict] = {}
    entity_keys: list[str] = []
    if cfg and copy_codes and deduped:
        period_col = cfg["period_col"]
        # 从字段管理取业务实体键（is_pk_part 且不是 period_col）
        entity_keys = [
            code for code in pk_columns if code != period_col
        ]
        cur_ym = str(deduped[0][1].get(period_col, ""))
        prev_ym = _prev_ym(cur_ym)
        if prev_ym:
            previous_rows = (
                await db.execute(
                    select(Model).where(getattr(Model, period_col) == prev_ym)
                )
            ).scalars().all()
            for row in previous_rows:
                values = _row_to_dict(row, table_columns)
                key = tuple(str(values.get(k, "")) for k in entity_keys)
                prev_map[key] = values

    # 6) 组装 payload（合并手工值）
    computed = await _get_computed_columns(table_name, db)
    lookup_maps = await build_lookup_maps(table_name, db)
    payload = []
    for h, r in deduped:
        merged = dict(r)
        ex = existing_map.get(h)
        if ex is not None:
            # 同期重拉：保留已维护的手工值
            for code in manual_codes:
                if code in ex:
                    merged[code] = ex[code]
        else:
            # 新行：复制上月（只填空）
            if cfg and copy_codes and entity_keys:
                key = tuple(str(r.get(k, "")) for k in entity_keys)
                pv = prev_map.get(key)
                if pv:
                    for code in copy_codes:
                        if merged.get(code) in (None, ""):
                            merged[code] = pv.get(code)
            # 新行：手工字段仍为空 → 默认值兜底（如启用状态默认"启用"）
            for code, dv in defaults.items():
                if merged.get(code) in (None, ""):
                    merged[code] = dv
        # 跨表查找填值：强制重算（不保留旧值），确保映射表更新后能同步
        # 先清空 lookup target 字段，再重新查找填值
        for cfg_lk, _ in lookup_maps:
            merged.pop(cfg_lk["target"], None)
        apply_lookups_to_row(merged, lookup_maps)
        # 计算字段：用已组装好的行值算出结果写回（覆盖任何残留旧值）
        for comp in computed:
            merged[comp["code"]] = eval_formula(comp["formula"], merged)
        payload.append(
            _payload_for_entity_row(
                model=Model,
                merged=merged,
                columns_by_code=columns_by_code,
                pk_hash=h,
            )
        )

    # 分批插入：asyncpg 单条语句参数上限 32767，按每行列数算安全批大小
    if payload:
        cols_per_row = max(len(payload[0]), 1)
        chunk_size = max(1, 30000 // cols_per_row)
        for i in range(0, len(payload), chunk_size):
            chunk = payload[i : i + chunk_size]
            stmt = pg_insert(Model).values(chunk)
            update_set = {
                code: getattr(stmt.excluded, code)
                for code in columns_by_code
            }
            update_set["synced_at"] = stmt.excluded.synced_at
            stmt = stmt.on_conflict_do_update(
                index_elements=["pk_hash"],
                set_=update_set,
            )
            await db.execute(stmt)

    # 提前提取 period 列的 data_type（expire_all 后不可再访问 ORM 属性）
    cfg_period = PERIOD_TABLES.get(table_name)
    period_col_dtype: str = "string"
    if cfg_period:
        _meta = columns_by_code.get(cfg_period["period_col"])
        if _meta:
            period_col_dtype = _meta.data_type or "string"

    db.expire_all()

    # 7) 删孤儿：本次批次中不存在的行视为已失效，直接删除
    #    月度表：只删当月（保留历史月份）；其他表（含实时花名册）：全表范围
    current_hashes = [h for h, _ in deduped]
    if cfg_period and deduped:
        period_col = cfg_period["period_col"]
        cur_ym = str(deduped[0][1].get(period_col, ""))
        if cur_ym:
            period_val = _coerce_db_value(cur_ym, period_col_dtype)
            await db.execute(
                delete(Model).where(
                    getattr(Model, period_col) == period_val,
                    Model.pk_hash.not_in(current_hashes),
                )
            )
    else:
        await db.execute(
            delete(Model).where(Model.pk_hash.not_in(current_hashes))
        )

    return len(payload)


# ===== 成本中心树（基于"业务层级Id" + "N级成本中心"路径名构建）=====


_CC_LEVEL_NAME_FIELDS = {
    1: "一级成本中心",
    2: "二级成本中心",
    3: "三级成本中心",
    4: "四级成本中心",
}


async def _sync_cc_tree(rows: list[dict], db: AsyncSession) -> None:
    """全量重建成本中心树。

    源端 `cost_center_monthly` 字段语义（北森导出）：
    - `编码` 唯一标识
    - `名称` 节点名
    - `业务层级Id` 1=根 / 2 / 3 / 4，决定父级在哪一层
    - `一级成本中心 / 二级成本中心 / 三级成本中心 / 四级成本中心` 是冗余路径名
      → 父节点 = (lvl-1) 层中 name 等于上一级路径名的节点
    - `启用状态` "启用" / "停用"

    同 (level, name) 在源端可能多条（编码不同），按 code 分别建节点；父子靠"父级层级 + 父级名字"匹配。
    """
    await db.execute(delete(CostCenterNode))
    await db.flush()

    if not rows:
        return

    # 第一遍：插节点
    nodes_by_code: dict[str, CostCenterNode] = {}
    # (level, name) -> [CostCenterNode]，用于父匹配
    by_level_name: dict[tuple[int, str], list[CostCenterNode]] = {}

    for r in rows:
        code = _first(r, "编码", "Code", "code", "cc_code")
        name = _first(r, "名称", "Name", "name", "cc_name")
        if not code or not name:
            continue
        try:
            level = int(_first(r, "业务层级Id", "Level", "level", default=1) or 1)
        except (ValueError, TypeError):
            level = 1
        # is_active 由本地手工「启用状态」决定：== "启用" 才算启用；
        # 空 / 未维护 / 停用 一律按停用（新增成本中心落库时已默认写为"启用"）
        is_active = (str(_first(r, "status", "启用状态", default="") or "").strip() == "启用")

        node = CostCenterNode(
            code=str(code),
            name=str(name),
            parent_id=None,
            level=level,
            is_leaf=False,  # 第二遍根据 children 数推算
            is_active=is_active,
            synced_at=datetime.now(UTC),
        )
        db.add(node)
        nodes_by_code[str(code)] = node
        by_level_name.setdefault((level, str(name)), []).append(node)
    await db.flush()  # 拿 id

    # 第二遍：连父
    for r in rows:
        code = _first(r, "编码", "Code", "code")
        if not code or str(code) not in nodes_by_code:
            continue
        node = nodes_by_code[str(code)]
        if node.level <= 1:
            continue  # 根节点无父
        parent_level = node.level - 1
        parent_name_field = _CC_LEVEL_NAME_FIELDS.get(parent_level)
        if not parent_name_field:
            continue
        parent_name = _first(r, parent_name_field)
        if not parent_name:
            continue
        candidates = by_level_name.get((parent_level, str(parent_name)), [])
        if candidates:
            node.parent_id = candidates[0].id

    # 标记 is_leaf：没有 child 的节点
    parents_with_children: set[int] = set()
    for n in nodes_by_code.values():
        if n.parent_id is not None:
            parents_with_children.add(n.parent_id)
    for n in nodes_by_code.values():
        n.is_leaf = n.id not in parents_with_children

    await db.flush()
    await _recompute_tree_paths(CostCenterNode, db)


# ===== 组织架构树（基于组织单元表 org_unit 的「行政上级组织编码」显式建树）=====


_ORG_ROOT_CODE = "RootOrg"


async def _sync_org_tree(rows: list[dict], db: AsyncSession) -> None:
    """全量重建组织架构树。

    数据源：`org_unit`（落库后的实体行），按源端真实编码显式建父子。

    - 固定一个虚拟根 `code='RootOrg'`，name = ORG_ROOT_NAME（默认"创梦天地"），level=1。
    - 每个有效 `org_code` 建一个节点：code=org_code，name=org_name，
      level 按 parent_org_code 链路从 RootOrg 向下推算，is_active=(org_status 为启用态)。
    - parent_org_code == 'RootOrg' 或为空 → 父为虚拟根；否则连到对应编码节点。
    - 异常数据（org_code 空、parent 找不到、成环）跳过并 warning，不静默造错树。
    """
    await db.execute(delete(OrgNode))
    await db.flush()

    if rows is None:
        rows = []

    root_name = app_settings.ORG_ROOT_NAME

    # 收集有效单元行：org_code -> (name, parent_code, is_active)
    units: dict[str, dict] = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        code = str(r.get("org_code") or "").strip()
        if not code:
            logger.warning("[org_tree] 跳过 org_code 为空的组织单元行")
            continue
        if code == _ORG_ROOT_CODE:
            continue  # 虚拟根由系统固定生成，源端同名行忽略
        parent_code = str(r.get("parent_org_code") or "").strip()
        is_active = str(r.get("org_status") or "").strip() in ("启用", "生效", "正常")
        units[code] = {
            "name": str(r.get("org_name") or code).strip() or code,
            "parent_code": parent_code,
            "is_active": is_active,
        }

    # 推算 level：沿 parent_org_code 链路回溯到 RootOrg/空，RootOrg=1，其直接子=2
    def _level_of(code: str) -> int:
        depth = 2
        cur = units.get(code, {}).get("parent_code", "")
        guard = 0
        while cur and cur != _ORG_ROOT_CODE and cur in units and guard < 50:
            depth += 1
            cur = units[cur]["parent_code"]
            guard += 1
        return depth

    # 虚拟根
    root = OrgNode(
        code=_ORG_ROOT_CODE,
        name=root_name,
        parent_id=None,
        level=1,
        is_leaf=False,
        is_active=True,
        synced_at=datetime.now(UTC),
    )
    db.add(root)

    # 第一遍：插所有单元节点
    code_to_node: dict[str, OrgNode] = {}
    for code, meta in units.items():
        node = OrgNode(
            code=code,
            name=meta["name"],
            parent_id=None,
            level=_level_of(code),
            is_leaf=False,
            is_active=meta["is_active"],
            synced_at=datetime.now(UTC),
        )
        db.add(node)
        code_to_node[code] = node
    await db.flush()  # 拿 id

    # 第二遍：连父
    for code, meta in units.items():
        pcode = meta["parent_code"]
        if not pcode or pcode == _ORG_ROOT_CODE:
            code_to_node[code].parent_id = root.id
        elif pcode in code_to_node:
            code_to_node[code].parent_id = code_to_node[pcode].id
        else:
            logger.warning(
                "[org_tree] 组织单元 %s 的行政上级 %s 不存在，挂到虚拟根", code, pcode
            )
            code_to_node[code].parent_id = root.id

    # is_leaf：没有 child 的节点
    parents_with_children: set[int] = set()
    for n in code_to_node.values():
        if n.parent_id is not None:
            parents_with_children.add(n.parent_id)
    for n in code_to_node.values():
        n.is_leaf = n.id not in parents_with_children
    root.is_leaf = root.id not in parents_with_children

    await db.flush()
    await _recompute_tree_paths(OrgNode, db)


async def _recompute_tree_paths(model, db: AsyncSession) -> None:
    """全量重算树 path，格式: /<name1>/<name2>/.../<name_leaf>/"""
    rows = (await db.execute(select(model))).scalars().all()
    by_id = {n.id: n for n in rows}

    def build(n) -> str:
        parts = []
        cur = n
        guard = 0
        while cur is not None and guard < 50:
            parts.append(cur.name)
            cur = by_id.get(cur.parent_id) if cur.parent_id else None
            guard += 1
        return "/" + "/".join(reversed(parts)) + "/"

    for n in rows:
        n.path = build(n)
    await db.flush()


def _first(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default


# ===== scope_role 用的稳定 code 注入（同步前一次性算好，方便权限引擎按列 IN 过滤）=====


def _inject_scope_codes(table_name: str, rows: list[dict]) -> None:
    # 花名册 org_node_code 现直接来自源端「组织节点编码」列，无需派生注入。
    # 成本中心：源端「编码」本身唯一，做数据权限时把「编码」列标 scope_role=cc_code 即可。
    return


# ===== 派发：源端拉数据 → 落库 =====


async def _publish_ods_data_changed_event(table_name: str, change_type: str, affected_rows: int) -> None:
    """发布 ods_table_data_changed 事件（独立 session）。"""
    try:
        from datetime import UTC, datetime as dt
        from app.automation.events import AutomationEvent, publish_event
        from app.core.db import get_session_factory
        async with get_session_factory()() as new_db:
            await publish_event(AutomationEvent(
                trigger_type="ods_table_data_changed",
                biz_type="ods_table",
                biz_id=table_name,
                payload={
                    "trigger_type": "ods_table_data_changed",
                    "table_name": table_name,
                    "source": "api_sync",
                    "change_type": change_type,
                    "affected_row_count": affected_rows,
                    "changed_at": dt.now(UTC).strftime("%Y-%m-%d %H:%M:%S"),
                },
            ), new_db)
    except Exception:
        logger.warning("[sync] 发布 ods_table_data_changed 失败 table=%s", table_name)


async def _publish_sync_completed_event(
    table_name: str, sync_status: str, sync_rows: int, sync_message: str, error_message: str,
) -> None:
    """发布 datasource_sync_completed 事件（独立 session）。"""
    try:
        from datetime import UTC, datetime as dt
        from app.automation.events import AutomationEvent, publish_event
        from app.core.db import get_session_factory

        async with get_session_factory()() as new_db:
            await publish_event(
                AutomationEvent(
                    trigger_type="datasource_sync_completed",
                    biz_type="datasource",
                    biz_id=table_name,
                    payload={
                        "trigger_type": "datasource_sync_completed",
                        "table_name": table_name,
                        "sync_status": sync_status,
                        "sync_rows": sync_rows,
                        "sync_message": sync_message,
                        "error_message": error_message,
                        "synced_at": dt.now(UTC).strftime("%Y-%m-%d %H:%M:%S"),
                    },
                ),
                new_db,
            )
        logger.info(
            "[sync] 发布 datasource_sync_completed table=%s status=%s rows=%s",
            table_name, sync_status, sync_rows,
        )
    except Exception:
        logger.exception(
            "[sync] 发布 datasource_sync_completed 失败 table=%s", table_name,
        )


async def sync_to_table(
    table_name: str,
    source_type: str,
    settings: dict,
    secrets: dict,
    db: AsyncSession,
) -> tuple[int, str]:
    """同步入口。失败时回滚并按物理表真实结构重建内存模型。

    _ensure_columns 在新增列时会立即把模型反射进 DATA_TABLES，但 DDL 随事务
    回滚后，内存模型可能残留本次未提交的列，导致后续数据视图查询引用不存在的列
    （UndefinedColumnError）。这里在失败路径上重新反射，保证内存模型与库一致。
    """
    try:
        inserted, msg = await _sync_to_table_impl(table_name, source_type, settings, secrets, db)
        # 发布 datasource_sync_completed + 派生统一 ods_table_data_changed
        await _publish_sync_completed_event(table_name, "success", inserted, msg, "")
        await _publish_ods_data_changed_event(table_name, "bulk_replaced", inserted)
        return inserted, msg
    except Exception as e:
        error_msg = str(e)[:500]
        try:
            await db.rollback()
            if table_name in DATA_TABLES:
                await register_source_table_model(db, table_name, force=True)
        except Exception:
            logger.exception("[sync] 失败回滚后重建模型失败 table=%s", table_name)
        # 发布失败事件（独立 session）
        await _publish_sync_completed_event(table_name, "failed", 0, "", error_msg)
        raise


async def _sync_to_table_impl(
    table_name: str,
    source_type: str,
    settings: dict,
    secrets: dict,
    db: AsyncSession,
) -> tuple[int, str]:
    if table_name not in DATA_TABLES:
        raise RuntimeError(f"暂不支持的业务表: {table_name}")

    if source_type == "upload":
        return 0, "内部上传类型暂不支持「立即拉取」，请使用 Excel 上传接口"

    # 拉数据
    client = make_client(source_type, settings, secrets)
    if hasattr(client, "get_grid_data"):
        # 预加载 UUID→英文code、中文名→英文code 映射,让 client 把北森数据 key 翻译成英文 code
        col_rows = (
            await db.execute(
                select(
                    TableColumn.column_code,
                    TableColumn.source_field_id,
                    TableColumn.column_label,
                ).where(TableColumn.table_name == table_name)
            )
        ).all()
        uuid_to_code = {sf: code for code, sf, _ in col_rows if sf}
        title_to_code = {lbl: code for code, _, lbl in col_rows if lbl}
        rows = await client.get_grid_data(
            uuid_to_code=uuid_to_code, title_to_code=title_to_code
        )
    elif hasattr(client, "fetch"):
        rows = await client.fetch()
    else:
        raise RuntimeError(f"客户端不支持数据拉取: {type(client).__name__}")

    # 丢弃表头未翻译的 UUID 噪音列（含将来接口新增的同类列）
    _strip_uuid_columns(rows or [])

    # 年月列强制规范化为 YYYYMM（便于跨表按月份 JOIN）
    ym_cols = YEARMONTH_COLUMNS.get(table_name)
    if ym_cols and rows:
        for r in rows:
            if isinstance(r, dict):
                for c in ym_cols:
                    if c in r and r[c] not in (None, ""):
                        r[c] = _normalize_yyyymm(r[c])

    # 注入 scope_role 用的稳定 code（落库前一次性算好）
    _inject_scope_codes(table_name, rows or [])

    # 月度表：inject 类型自动注入期间实体列；field 类型接口自带，直接读第一行值
    period_cfg = PERIOD_TABLES.get(table_name)
    cur_ym = ""
    if period_cfg:
        period_col = period_cfg["period_col"]
        validate_column_name(period_col)
        if period_cfg.get("period_source", "inject") == "inject":
            cur_ym = _resolve_period_ym(period_cfg, settings)
            if rows:
                rows = [
                    {**r, period_col: cur_ym} for r in rows if isinstance(r, dict)
                ]
        else:
            # field 模式：从第一行数据里读月份值（用于孤儿删除范围）
            if rows:
                first = rows[0] if isinstance(rows[0], dict) else {}
                raw_ym = str(first.get(period_col, ""))
                cur_ym = _normalize_yyyymm(raw_ym) if raw_ym else ""

    # 源端字段黑名单：永久丢弃（如成本中心「启用状态」改本地手工维护，北森不再同步）
    drop_set = SOURCE_DROP_COLUMNS.get(table_name)
    if drop_set and rows:
        for r in rows:
            if isinstance(r, dict):
                for k in drop_set:
                    r.pop(k, None)

    # 写入业务表（统一走 upsert + 删孤儿）
    # field 模式下源端可能含多月数据（如北森一次返回多月），分组分别写入
    if period_cfg and period_cfg.get("period_source", "inject") == "field" and rows:
        _groups: dict[str, list] = {}
        for _r in rows:
            if isinstance(_r, dict):
                _rv = _normalize_yyyymm(str(_r.get(period_col, "")))
                _groups.setdefault(_rv or cur_ym, []).append(_r)
        inserted = 0
        for _ym, _grp in sorted(_groups.items()):
            inserted += await _dynamic_upsert(table_name, _grp, db, period_ym=_ym)
        if _groups:
            cur_ym = max(_groups)  # 最近期（供后续树构建用）
    else:
        inserted = await _dynamic_upsert(table_name, rows or [], db, period_ym=cur_ym)

    # 派发到树构建：成本中心 → cc_tree；组织单元 → org_tree
    if table_name == "cost_center_monthly":
        # 用落库后的当月数据建树（含本地手工「启用状态」+ 复制上月 + 新增默认启用），
        # 保证树的 is_active 与数据表一致
        await db.flush()
        Model = DATA_TABLES[table_name]
        _assert_entity_model(Model, table_name)
        table_columns = await _source_columns(table_name, db)
        if cur_ym:
            tree_rows_orm = (
                await db.execute(
                    select(Model).where(getattr(Model, "month") == cur_ym)
                )
            ).scalars().all()
        else:
            tree_rows_orm = (await db.execute(select(Model))).scalars().all()
        tree_rows = [_row_to_dict(row, table_columns) for row in tree_rows_orm]
        await _sync_cc_tree(tree_rows, db)
    elif table_name == "org_unit":
        # 用落库后的组织单元实体行建树（吃到同批去重、字段映射、类型转换）
        await db.flush()
        Model = DATA_TABLES[table_name]
        _assert_entity_model(Model, table_name)
        table_columns = await _source_columns(table_name, db)
        tree_rows_orm = (await db.execute(select(Model))).scalars().all()
        tree_rows = [_row_to_dict(row, table_columns) for row in tree_rows_orm]
        await _sync_org_tree(tree_rows, db)

    await db.commit()

    # 同步完成后自动刷新该表关联的 db_expose finebi 物理表
    try:
        from app.push.models import PushTarget
        from app.push.push_service import execute_push
        from sqlalchemy import select as sa_select
        pts = (await db.execute(
            sa_select(PushTarget).where(
                PushTarget.source_table == table_name,
                PushTarget.push_type == "db_expose",
                PushTarget.is_active.is_(True),
            )
        )).scalars().all()
        for pt in pts:
            await execute_push(pt.id, db)
            await db.commit()
    except Exception as e:
        logger.warning("[sync] finebi 自动刷新失败 table=%s: %s", table_name, e)

    return inserted, f"成功同步 {inserted} 行"
