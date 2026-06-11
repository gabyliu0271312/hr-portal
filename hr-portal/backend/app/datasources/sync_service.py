"""C1 动态列同步服务

- 写库：整行 JSON 入 raw + 算 pk_hash + upsert
- 自动发现：每次同步时检查 raw 的所有 key，没注册过的 INSERT 一条到 table_columns
- 业务主键：从 table_columns 中 is_pk_part=true 的列里取值，组合成 pk_hash
- 若没有任何 PK 列，回退到整行 JSON 的 hash
- 员工实时花名册按 snapshot 处理，每次同步仅保留最新快照
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, UTC, date

from sqlalchemy import cast, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert, JSONB

from app.core.config import settings as app_settings
from app.data.models import (
    DATA_TABLES,
    CostCenterNode,
    OrgNode,
    TableColumn,
)
from app.datasources.beisen_client import make_client
from app.data.formula import eval_formula


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
}


# 年月列强制规范化为 YYYYMM（便于跨表按月份 JOIN）。
# 如分摊表「成本归属年月」源端是 "2025-10"，统一成 "202510"，与成本中心「月份」对齐。
YEARMONTH_COLUMNS: dict[str, set[str]] = {
    "emp_monthly_allocation": {"cost_period"},
}


# 跨表查找填值（lookup/enrichment）：同步/重算时按规则从另一张表查出值填进 target。
# 只填空（target 为空才填）、保留手改；rules 按顺序优先级，命中即停。
# 注意:lookup_table(emp_monthly_cost_class)未迁移,其 type_col/value_col/result_col 仍是原 code
LOOKUP_FIELDS: dict[str, list[dict]] = {
    "emp_monthly_salary": [
        {
            "target": "expense_type",
            "lookup_table": "emp_monthly_cost_class",
            "type_col": "field type",          # 映射表「字段类型」列（值=工号/甲方对应的中文判别值）
            "value_col": "value",              # 映射表「值」列
            "result_col": "cost classification",  # 映射表「费用类型」列
            "rules": [                          # 先工号、后甲方
                {"match_type": "工号", "src_field": "employee_no"},
                {"match_type": "甲方", "src_field": "client"},
            ],
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
# 北森辅助列形态：xxx_数字_id / xxx_数字_alias / 任意_original / 任意_alias 结尾
_HELPER_COL_RE = re.compile(r"(_\d{4,}_(id|alias)|_original|_alias)$", re.IGNORECASE)


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


async def _ensure_columns(
    table_name: str,
    sample_row: dict,
    db: AsyncSession,
    column_labels: dict[str, str] | None = None,
) -> dict[str, str]:
    """从样本行扫描所有 key，对没注册过的字段 INSERT 一条 table_columns。

    返回 rename_map: {样本行里的中文key: 新生成的英文code}，
    供调用方把 raw 数据的中文 key 同步改成英文 code。
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
    for key, val in sample_row.items():
        if key in existing_by_code:
            label = column_labels.get(key) or key
            col = existing_by_code[key]
            if col.column_label == col.column_code and label != key:
                col.column_label = label
            continue
        # 新字段:key 可能是英文 code(已被 client 翻译但库内还没注册)或中文名(全新字段)
        # 含中文 → 三层定 code:① 同中文 label 复用已有 code ② AI 翻译 ③ 规则兜底
        import re as _re
        from app.codegen.rules import deterministic_code, unique_code
        from app.codegen.service import ai_translate_code
        if _re.search(r"[一-鿿]", key):
            label = key
            reused = label_to_code.get(label)
            if reused:
                # ① 复用同中文 label 的已有 code:列已存在,只记 rename_map,不重复建列
                rename_map[key] = reused
                used_codes.add(reused)
                continue
            ai_code, _expl, _usage = await ai_translate_code(
                db, label=label, scope="field", context=f"数据表 {table_name} 自动同步字段"
            )
            base = ai_code or deterministic_code(label)  # ② AI / ③ 规则兜底
            new_code = unique_code(base, used_codes)
            rename_map[key] = new_code
        else:
            label = column_labels.get(key) or key
            new_code = key
        used_codes.add(new_code)
        label_to_code.setdefault(label, new_code)
        max_order += 10
        dtype = _guess_data_type(val)
        new_cols.append(TableColumn(
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
        ))
    if new_cols:
        db.add_all(new_cols)
        await db.flush()
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
    """月度表元数据收口：把「月份」列置为主键并排到最前。

    业务实体键（如工号、编码）由管理员在字段管理里手动勾选 is_pk_part，此处只处理期间列。
    """
    cfg = PERIOD_TABLES.get(table_name)
    if not cfg:
        return
    period_col = cfg["period_col"]
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
        rows = (await db.execute(select(LM.raw))).all()
        m: dict[tuple[str, str], object] = {}
        for (raw,) in rows:
            if isinstance(raw, dict):
                key = (
                    str(raw.get(cfg["type_col"], "")),
                    str(raw.get(cfg["value_col"], "")),
                )
                m[key] = raw.get(cfg["result_col"])
        out.append((cfg, m))
    return out


def apply_lookups_to_row(merged: dict, lookup_maps: list[tuple[dict, dict]]) -> None:
    """对一行按 lookup 配置填值：仅当 target 为空时，按 rules 顺序查找，命中非空即填并停。"""
    for cfg, m in lookup_maps:
        if merged.get(cfg["target"]) not in (None, ""):
            continue
        for rule in cfg["rules"]:
            src_val = merged.get(rule["src_field"])
            if src_val in (None, ""):
                continue
            res = m.get((rule["match_type"], str(src_val)))
            if res not in (None, ""):
                merged[cfg["target"]] = res
                break


async def _dynamic_upsert(
    table_name: str, rows: list[dict], db: AsyncSession,
    period_ym: str = "",
    column_labels: dict[str, str] | None = None,
) -> int:
    Model = DATA_TABLES.get(table_name)
    if Model is None:
        raise RuntimeError(f"未知业务表: {table_name}")

    # 空批次：源端可能异常，不做任何删除，直接返回
    if not rows:
        return 0

    # 1) 自动注册新字段（用第一行作为样本）
    rename_map = await _ensure_columns(table_name, rows[0], db, column_labels=column_labels)

    # 1b) 全新中文字段已生成英文 code → 把所有行 raw 的中文 key 改成英文 code
    if rename_map:
        for r in rows:
            if isinstance(r, dict):
                for zh, en in rename_map.items():
                    if zh in r:
                        r[en] = r.pop(zh)

    # 2) 月度表：收口月份/编码主键
    await _ensure_period_meta(table_name, db)

    # 3) 取业务主键列
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
        ex_rows = (
            await db.execute(
                select(Model.pk_hash, Model.raw).where(Model.pk_hash.in_(hashes))
            )
        ).all()
        existing_map = {h: (raw or {}) for h, raw in ex_rows}

    # 上月行（按 is_pk_part 列中除 period_col 外的业务键匹配，仅复制上月需要）
    cfg = PERIOD_TABLES.get(table_name)
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
            pv_rows = (
                await db.execute(
                    select(Model.raw).where(
                        cast(Model.raw, JSONB)[period_col].astext == prev_ym
                    )
                )
            ).all()
            for (raw,) in pv_rows:
                if isinstance(raw, dict):
                    key = tuple(str(raw.get(k, "")) for k in entity_keys)
                    prev_map[key] = raw

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
        payload.append({
            "pk_hash": h,
            "raw": merged,
            "synced_at": datetime.now(UTC),
        })

    stmt = pg_insert(Model).values(payload)
    stmt = stmt.on_conflict_do_update(
        index_elements=["pk_hash"],
        set_={"raw": stmt.excluded.raw, "synced_at": stmt.excluded.synced_at},
    )
    await db.execute(stmt)

    # 7) 删孤儿：本次批次中不存在的行视为已失效，直接删除
    #    月度表：只删当月（保留历史月份）；其他表（含实时花名册）：全表范围
    current_hashes = [h for h, _ in deduped]
    cfg_period = PERIOD_TABLES.get(table_name)
    if cfg_period and deduped:
        period_col = cfg_period["period_col"]
        cur_ym = str(deduped[0][1].get(period_col, ""))
        if cur_ym:
            await db.execute(
                delete(Model).where(
                    cast(Model.raw, JSONB)[period_col].astext == cur_ym,
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
            raw=r,
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


# ===== 组织架构树（基于实时花名册的 7 层冗余字段构建）=====


_ORG_LEVEL_FIELDS = [
    # (level, column_code)
    (2, "company_org"),
    (3, "department"),
    (4, "department_2"),
    (5, "department_3"),
    (6, "department_4"),
    (7, "department_5"),
]


def _org_node_code(level: int, path_names: list[str]) -> str:
    """用 path 的 hash 作为稳定 code（源端没给每个部门编码）"""
    material = "/".join(path_names)
    h = hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]
    return f"L{level}_{h}"


async def _sync_org_tree(rows: list[dict], db: AsyncSession) -> None:
    """全量重建组织架构树。

    数据源：`emp_realtime_roster`，每行员工带 7 个层级字段（创梦天地虚拟根 → 公司级组织 → 一~五级部门）。
    遍历所有员工，DISTINCT 出每条层级路径，构建 7 层树。

    - 根节点固定：name = ORG_ROOT_NAME（默认"创梦天地"），level=1
    - code 由 path 的 SHA256 前 16 位 + level 前缀生成（稳定且去重）
    - 空字符串视为本层不存在，从那层起停止下钻
    - is_active：节点路径上至少有 1 个非「离职」员工 → True，全部「离职」→ False
    """
    await db.execute(delete(OrgNode))
    await db.flush()

    if rows is None:
        rows = []

    # (level, code) -> {name, parent_code, path_names}
    nodes_meta: dict[tuple[int, str], dict] = {}
    # 收集"路径上至少有 1 个在职员工"的 code 集合
    active_codes: set[str] = set()

    # 加根节点
    root_name = app_settings.ORG_ROOT_NAME
    root_code = _org_node_code(1, [root_name])
    nodes_meta[(1, root_code)] = {
        "name": root_name,
        "parent_code": None,
        "level": 1,
    }
    active_codes.add(root_code)  # 虚拟根固定有效

    for r in rows:
        if not isinstance(r, dict):
            continue
        is_active_emp = str(r.get("employee_status") or "").strip() != "离职"
        path_names = [root_name]
        parent_code = root_code
        for level, field in _ORG_LEVEL_FIELDS:
            v = r.get(field)
            if v is None or str(v).strip() == "":
                break
            name = str(v).strip()
            path_names = path_names + [name]
            code = _org_node_code(level, path_names)
            if (level, code) not in nodes_meta:
                nodes_meta[(level, code)] = {
                    "name": name,
                    "parent_code": parent_code,
                    "level": level,
                }
            if is_active_emp:
                active_codes.add(code)
            parent_code = code

    # 第一遍：先插所有节点（按 level 升序，确保父先于子，方便日后扩展）
    code_to_node: dict[str, OrgNode] = {}
    for (level, code), meta in sorted(nodes_meta.items(), key=lambda x: x[0][0]):
        node = OrgNode(
            code=code,
            name=meta["name"],
            parent_id=None,
            level=level,
            is_leaf=False,
            is_active=(code in active_codes),
            raw={"source": "emp_realtime_roster", "name": meta["name"], "level": level},
            synced_at=datetime.now(UTC),
        )
        db.add(node)
        code_to_node[code] = node
    await db.flush()

    # 第二遍：连父
    for (level, code), meta in nodes_meta.items():
        pcode = meta["parent_code"]
        if pcode and pcode in code_to_node:
            code_to_node[code].parent_id = code_to_node[pcode].id

    # is_leaf
    parents_with_children: set[int] = set()
    for n in code_to_node.values():
        if n.parent_id is not None:
            parents_with_children.add(n.parent_id)
    for n in code_to_node.values():
        n.is_leaf = n.id not in parents_with_children

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


def _inject_org_node_code(row: dict) -> None:
    """给员工行注入 `_org_node_code`：员工所在最深层级对应的 org_tree.code"""
    root_name = app_settings.ORG_ROOT_NAME
    path_names = [root_name]
    deepest_level = 1
    for level, field in _ORG_LEVEL_FIELDS:
        v = row.get(field)
        if v is None or str(v).strip() == "":
            break
        path_names.append(str(v).strip())
        deepest_level = level
    row["_org_node_code"] = _org_node_code(deepest_level, path_names)


def _inject_scope_codes(table_name: str, rows: list[dict]) -> None:
    if not rows:
        return
    if table_name == "emp_realtime_roster":
        for r in rows:
            if isinstance(r, dict):
                _inject_org_node_code(r)
    # 成本中心：不再注入 _cc_code。源端「编码」本身唯一，要做成本中心数据权限时
    # 直接把「编码」列标 scope_role=cc_code 即可（与树节点 code 一致）。


# ===== 派发：源端拉数据 → 落库 =====


async def sync_to_table(
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

    # 月度表：inject 类型自动注入「月份」列；field 类型接口自带，直接读第一行值
    period_cfg = PERIOD_TABLES.get(table_name)
    cur_ym = ""
    if period_cfg:
        period_col = period_cfg["period_col"]
        if period_cfg.get("period_source", "inject") == "inject":
            cur_ym = _resolve_period_ym(period_cfg, settings)
            if rows:
                rows = [
                    {period_col: cur_ym, **r} for r in rows if isinstance(r, dict)
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
    inserted = await _dynamic_upsert(table_name, rows or [], db, period_ym=cur_ym)

    # 派发到树构建：成本中心 → cc_tree；实时花名册 → org_tree
    if table_name == "cost_center_monthly":
        # 用落库后的当月数据建树（含本地手工「启用状态」+ 复制上月 + 新增默认启用），
        # 保证树的 is_active 与数据表一致
        await db.flush()
        Model = DATA_TABLES[table_name]
        if cur_ym:
            tree_src = (
                await db.execute(
                    select(Model.raw).where(
                        cast(Model.raw, JSONB)["month"].astext == cur_ym
                    )
                )
            ).all()
        else:
            tree_src = (await db.execute(select(Model.raw))).all()
        tree_rows = [raw for (raw,) in tree_src if isinstance(raw, dict)]
        await _sync_cc_tree(tree_rows, db)
    elif table_name == "emp_realtime_roster":
        await _sync_org_tree(rows or [], db)

    await db.commit()
    return inserted, f"成功同步 {inserted} 行"
