"""数据集模式的多表 SQL 拼接（spec U4 + KD-1）

输入：
- dataset (DataSet + tables + relations)
- ReportConfig.columns/filters/sorts，列名格式为 "<alias>.<column_code>"
- user（用于注入 scope_filter 与脱敏）

输出：
- columns_meta: 每列 (alias, column_code, label, data_type, is_sensitive) 元数据
- items: 每行 dict（key 是 "<alias>.<column_code>" 命名空间）
- total

实现思路：
- 5 张业务表都是 (id, pk_hash, raw, synced_at) 极简 schema
- SELECT t1.id, t1.raw, t2.id, t2.raw, ... FROM table1 t1 [LEFT JOIN table2 t2 ON ...] WHERE ...
- JOIN 条件：raw->>'left.col' = raw->>'right.col'
- 字段分类脱敏 + 数据范围权限按 alias 对应的 table 各自计算后 AND 进 where
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, desc, func, or_, select, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement, cast
from sqlalchemy.types import String as SAString

from app.data.models import DATA_TABLES, TableColumn
from app.datasets.models import DataSet, DataSetRelation, DataSetTable
from app.users.models import User


def _raw_text(model, col_code: str) -> ColumnElement:
    """raw->>'col_code' 的 SQL 表达式（兼容 aliased model）

    aliased 后 model.raw[code].astext 不可用，改用 func.jsonb_extract_path_text。
    若 raw 列是 JSON 而非 JSONB，先 cast 一下；这里 5 张业务表实际是 JSON，
    PostgreSQL 的 jsonb_extract_path_text 会自动 cast。
    """
    return func.jsonb_extract_path_text(cast(model.raw, JSONB), col_code)


async def _get_dataset_meta(
    dataset_id: int, db: AsyncSession
) -> tuple[DataSet, list[DataSetTable], list[DataSetRelation]]:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise RuntimeError(f"DataSet {dataset_id} 不存在")
    tables = (
        (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id)))
        .scalars()
        .all()
    )
    rels = (
        (
            await db.execute(
                select(DataSetRelation).where(DataSetRelation.dataset_id == dataset_id)
            )
        )
        .scalars()
        .all()
    )
    return ds, list(tables), list(rels)


async def _get_columns_for_aliases(
    tables: list[DataSetTable], db: AsyncSession
) -> dict[str, list[TableColumn]]:
    """每个 alias → 对应 table 的所有 TableColumn 元数据"""
    by_alias: dict[str, list[TableColumn]] = {}
    for t in tables:
        cols = (
            (
                await db.execute(
                    select(TableColumn)
                    .where(TableColumn.table_name == t.table_name)
                    .order_by(TableColumn.display_order, TableColumn.id)
                )
            )
            .scalars()
            .all()
        )
        by_alias[t.alias] = list(cols)
    return by_alias


def _num(v: Any) -> float:
    """转 float，容忍千分位逗号/首尾空白（如 "1,274.21"）；失败抛 ValueError/TypeError"""
    if isinstance(v, str):
        v = v.replace(",", "").strip()
    return float(v)


def _mul_round2(a: Any, b: Any) -> Any:
    """round(num(a) × num(b), 2)；任一非数值/空 → 空字符串"""
    try:
        return round(_num(a) * _num(b), 2)
    except (TypeError, ValueError):
        return ""


def _aggregate(values: list, func: str, row_count: int) -> Any:
    """对一组值做聚合：sum/avg/min/max/count；非数值跳过，无数值 → 空"""
    if func == "count":
        return row_count
    nums: list[float] = []
    for v in values:
        try:
            nums.append(_num(v))
        except (TypeError, ValueError):
            pass
    if not nums:
        return ""
    if func == "avg":
        r = sum(nums) / len(nums)
    elif func == "min":
        r = min(nums)
    elif func == "max":
        r = max(nums)
    else:  # sum
        r = sum(nums)
    return round(r, 2)


def _to_num(v: Any) -> float | None:
    """转数值；非数值/空 → None"""
    if v is None or v == "":
        return None
    try:
        return _num(v)
    except (TypeError, ValueError):
        return None


def _apply_transpose(
    full_items: list[dict[str, Any]],
    selected_quals: list[str],
    dim_quals: list[str],
    mea_quals: list[str],
    rules: list[dict[str, Any]],
    drop_zero_measures: bool,
) -> tuple[list[dict[str, Any]], set[str]]:
    """转置/重映射：把源度量从原维度组合搬到新维度组合，保留其余记录（清零源度量）。

    返回 (结果行, 被删除的全零度量列集合)
    """
    mea_set = set(mea_quals)
    dim_set = set(dim_quals)
    # 清洗规则：source/target 须是度量列；dim_updates 键须是维度列
    clean_rules: list[dict[str, Any]] = []
    for rule in rules or []:
        src = (rule or {}).get("source_col")
        if src not in mea_set:
            continue
        targets = [t for t in (rule.get("target_cols") or []) if t in mea_set]
        if not targets:
            continue
        dim_updates = {
            k: v for k, v in (rule.get("dim_updates") or {}).items() if k in dim_set
        }
        clean_rules.append(
            {"source_col": src, "target_cols": targets, "dim_updates": dim_updates}
        )

    if not clean_rules:
        return full_items, set()

    result: list[dict[str, Any]] = []
    # 收集所有被转置规则搬走的源列（这些列在原行中会被清零）
    transposed_sources: set[str] = {rule["source_col"] for rule in clean_rules}
    for row in full_items:
        # 复制原行（仅已选列），同时保留 __rawprod__ 隐藏键供余差收口用
        factor_extras = {k: v for k, v in row.items() if k.startswith("__rawprod__")}
        base = {q: row.get(q) for q in selected_quals}
        base.update(factor_extras)
        to_zero: set[str] = set()
        for rule in clean_rules:
            val = _to_num(row.get(rule["source_col"]))
            if val is None or val == 0:
                continue
            to_zero.add(rule["source_col"])
            # 新行：复制原行 → 覆盖维度 → 度量全置 0 → 写入目标度量
            new_row = dict(base)
            for dq, nv in rule["dim_updates"].items():
                new_row[dq] = nv
            for mq in mea_quals:
                new_row[mq] = 0
            for tc in rule["target_cols"]:
                new_row[tc] = val
            result.append(new_row)
        # 原行：源度量清零后保留
        kept = dict(base)
        for mq in to_zero:
            kept[mq] = 0
        result.append(kept)

    # 只删除「被转置规则明确搬走后全零」的源列，不误删用户配置的合法零值列
    dropped: set[str] = set()
    if drop_zero_measures:
        for mq in transposed_sources:
            all_zero = True
            for r in result:
                n = _to_num(r.get(mq))
                if n is not None and n != 0:
                    all_zero = False
                    break
            if all_zero:
                dropped.add(mq)
        if dropped:
            for r in result:
                for mq in dropped:
                    r.pop(mq, None)

    return result, dropped


def _split_qualified(qualified: str) -> tuple[str, str]:
    """'roster.工号' → ('roster', '工号')"""
    if "." not in qualified:
        raise RuntimeError(f"数据集模式下列名必须形如 alias.column，收到: {qualified}")
    alias, _, code = qualified.partition(".")
    return alias, code


async def run_dataset_query(
    dataset_id: int,
    columns: list[str],
    filters: list[dict[str, Any]],
    sorts: list[dict[str, Any]],
    page: int,
    page_size: int,
    user: User | None,
    db: AsyncSession,
    value_rules: list[dict[str, Any]] | None = None,
    aggregate: bool = False,
    aggregations: dict[str, str] | None = None,
    transpose: dict[str, Any] | None = None,
    rounding_corrections: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    """执行数据集多表查询

    Returns:
        (columns_meta_list, items, total)
    columns_meta_list: list of dict {alias, column_code, label, data_type, is_sensitive}
    items: list of dict, key = "alias.column_code"
    """
    ds, ds_tables, ds_rels = await _get_dataset_meta(dataset_id, db)
    if not ds_tables:
        return [], [], 0

    alias_to_table = {t.alias: t.table_name for t in ds_tables}
    alias_to_model = {t.alias: DATA_TABLES[t.table_name] for t in ds_tables}
    alias_columns = await _get_columns_for_aliases(ds_tables, db)

    # 选定列：未指定则取每张表的可见列
    selected: list[tuple[str, str]] = []
    if columns:
        for q in columns:
            selected.append(_split_qualified(q))
    else:
        for alias, cols in alias_columns.items():
            for c in cols:
                if c.is_visible:
                    selected.append((alias, c.column_code))

    # 构造 SELECT 列表：每个 alias 取其 raw 整列 + id（用于 dedupe）
    used_aliases = list({a for a, _ in selected} | {a for a in alias_to_model.keys()})
    # 至少把第一张表 id 作为基准
    primary_alias = ds_tables[0].alias
    primary_model = alias_to_model[primary_alias]

    # SQLAlchemy 对 alias 的 ORM 用法：用 aliased(Model)
    from sqlalchemy.orm import aliased, join as orm_join
    aliased_models: dict[str, Any] = {a: aliased(alias_to_model[a], name=a) for a in used_aliases}

    # 构造 select：把每个 aliased model 的 id 与 raw 都选出来
    select_cols: list[Any] = []
    for a in used_aliases:
        m = aliased_models[a]
        select_cols.append(m.id.label(f"__{a}__id"))
        select_cols.append(m.raw.label(f"__{a}__raw"))

    stmt = select(*select_cols)
    count_stmt = select(func.count()).select_from(aliased_models[primary_alias])

    # FROM = primary_alias, JOIN = relations
    from_clause = aliased_models[primary_alias]
    joined: set[str] = {primary_alias}

    # 简化：按 relations 顺序贪心 JOIN（要求左/右至少一边已经在 joined 里）
    for _ in range(len(ds_rels) + 1):
        progressed = False
        for r in ds_rels:
            if r.left_alias in joined and r.right_alias in joined:
                continue
            if r.left_alias in joined or r.right_alias in joined:
                # 让 known 在左侧
                if r.right_alias in joined:
                    known, new = r.right_alias, r.left_alias
                else:
                    known, new = r.left_alias, r.right_alias
                lm = aliased_models[known]
                rm = aliased_models[new]
                # join 条件
                conds: list[ColumnElement] = []
                for k in r.keys or []:
                    # k.left/k.right 是用户配置的字段名（属于关系定义里 left_alias / right_alias 对应表）
                    left_col = k.get("left")
                    right_col = k.get("right")
                    if known == r.left_alias:
                        conds.append(
                            _raw_text(lm, left_col) == _raw_text(rm, right_col)
                        )
                    else:
                        conds.append(
                            _raw_text(lm, right_col) == _raw_text(rm, left_col)
                        )
                join_cond = and_(*conds) if conds else true()
                join_kind = (r.join_type or "left").lower()
                # 按关系声明的 left/right 语义决定保留哪一侧（与遍历顺序无关）
                if join_kind == "left":
                    keep_left, keep_right = True, False
                elif join_kind == "right":
                    keep_left, keep_right = False, True
                elif join_kind == "full":
                    keep_left, keep_right = True, True
                else:  # inner
                    keep_left, keep_right = False, False
                # 映射到物理两侧：known=已累积的 from_clause，new=新表 rm
                known_is_left = known == r.left_alias
                preserve_known = keep_left if known_is_left else keep_right
                preserve_new = keep_right if known_is_left else keep_left
                # aliased 实体没有 .join，必须用 orm.join() 构造（左侧可为 aliased 实体或已有的 Join）
                if preserve_known and preserve_new:
                    from_clause = orm_join(from_clause, rm, join_cond, isouter=True, full=True)
                elif preserve_known:
                    from_clause = orm_join(from_clause, rm, join_cond, isouter=True)
                elif preserve_new:
                    # 真右外：把要保留的一侧(新表)放到 JOIN 左边，等价于 rm RIGHT JOIN from_clause
                    from_clause = orm_join(rm, from_clause, join_cond, isouter=True)
                else:  # 两侧都不保留 → 内连接
                    from_clause = orm_join(from_clause, rm, join_cond, isouter=False)
                joined.add(new)
                progressed = True
        if not progressed:
            break

    # 没 JOIN 的 alias 视为笛卡尔积（不应发生，spec 要求 UI 阻止）
    if joined != set(used_aliases):
        unjoined = set(used_aliases) - joined
        for a in unjoined:
            from_clause = orm_join(from_clause, aliased_models[a], true(), isouter=False)
            joined.add(a)

    stmt = stmt.select_from(from_clause)
    count_stmt = select(func.count()).select_from(from_clause)

    # 注入数据范围权限（每个 alias 各自算后 AND）
    if user is not None:
        from app.permissions.scope_filter import build_scope_filter, is_unrestricted
        for a in used_aliases:
            clause = await build_scope_filter(user, alias_to_table[a], db)
            if not is_unrestricted(clause):
                # 注意 build_scope_filter 引用的是原 Model，我们用了 aliased — 这里需要重新绑到 aliased model
                # 简化方案：直接用原 Model 的 raw 字段名规则 + 重写为对 aliased model 的引用
                # 这里实现一个粗糙但有效的版本：把过滤条件作用于 aliased.raw 而不是原 Model.raw
                # → 通过递归遍历表达式不现实；改为重新构造一遍过滤
                clause2 = await _rebuild_scope_filter_for_alias(
                    user, alias_to_table[a], aliased_models[a], db
                )
                if clause2 is not None:
                    stmt = stmt.where(clause2)
                    count_stmt = count_stmt.where(clause2)

    # 用户级 filters
    for f in filters:
        col_qual = f.get("column", "")
        op = (f.get("op") or "eq").lower()
        val = f.get("value")
        if "." not in col_qual:
            continue
        a, code = _split_qualified(col_qual)
        if a not in aliased_models:
            continue
        m = aliased_models[a]
        json_text = _raw_text(m, code)
        clause = _filter_clause(json_text, op, val)
        if clause is not None:
            stmt = stmt.where(clause)
            count_stmt = count_stmt.where(clause)

    # 排序
    for s in sorts:
        col_qual = s.get("column", "")
        if "." not in col_qual:
            continue
        a, code = _split_qualified(col_qual)
        if a not in aliased_models:
            continue
        m = aliased_models[a]
        order = (s.get("order") or "asc").lower()
        col_expr = _raw_text(m, code)
        stmt = stmt.order_by(desc(col_expr) if order == "desc" else col_expr)

    if not sorts:
        stmt = stmt.order_by(desc(aliased_models[primary_alias].id))

    # 维度/度量（来自字段管理的 agg_role）+ 是否聚合
    def _role(alias: str, code: str) -> str:
        col = next(
            (c for c in alias_columns.get(alias, []) if c.column_code == code), None
        )
        return getattr(col, "agg_role", "dimension") if col else "dimension"

    dim_quals = [f"{a}.{c}" for (a, c) in selected if _role(a, c) == "dimension"]
    mea_quals = [f"{a}.{c}" for (a, c) in selected if _role(a, c) == "measure"]
    agg_on = bool(aggregate) and len(mea_quals) > 0
    transpose_rules = (transpose or {}).get("rules") or []
    transpose_on = bool((transpose or {}).get("enabled")) and len(transpose_rules) > 0

    # 取数：聚合/转置要增删行，须取全量后 Python 分页；明细模式 SQL 分页
    need_all = agg_on or transpose_on
    total = 0
    if need_all:
        rows = (await db.execute(stmt)).all()
    else:
        total = (await db.execute(count_stmt)).scalar_one()
        if page_size > 0:
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(stmt)).all()

    # ===== 列元数据 =====
    columns_meta: list[dict[str, Any]] = []
    sensitive_by_alias: dict[str, set[str]] = {}
    if user is not None:
        from app.permissions.masker import get_sensitive_columns
        for a, table in alias_to_table.items():
            sensitive_by_alias[a] = await get_sensitive_columns(user, table, db)

    for alias, code in selected:
        col = next(
            (c for c in alias_columns.get(alias, []) if c.column_code == code), None
        )
        if col is None:
            columns_meta.append(
                {
                    "code": f"{alias}.{code}",
                    "label": code,
                    "data_type": "string",
                    "is_sensitive": False,
                }
            )
        else:
            mask = col.is_sensitive or (
                code in sensitive_by_alias.get(alias, set())
            )
            columns_meta.append(
                {
                    "code": f"{alias}.{code}",
                    "label": col.column_label,
                    "data_type": col.data_type,
                    "is_sensitive": mask,
                }
            )

    # ===== 行数据 =====
    # 数值拆分规则：target 列出值 = round(num(target) × num(factor), 2)，非数值/空 → 空
    rules_by_target: dict[str, str] = {}
    for vr in (value_rules or []):
        t = (vr or {}).get("target")
        f = (vr or {}).get("factor")
        if t and f and "." in t and "." in f:
            rules_by_target[t] = f

    full_items: list[dict[str, Any]] = []
    for r in rows:
        d = r._mapping if hasattr(r, "_mapping") else dict(zip(r.keys(), r))
        item: dict[str, Any] = {}
        # 提取每个 alias 的 raw
        alias_raws: dict[str, dict] = {}
        for a in used_aliases:
            raw = d.get(f"__{a}__raw") or {}
            alias_raws[a] = raw if isinstance(raw, dict) else {}
        for alias, code in selected:
            raw = alias_raws.get(alias, {})
            v = raw.get(code)
            if isinstance(v, datetime):
                v = v.isoformat()
            sens = sensitive_by_alias.get(alias, set())
            col = next(
                (c for c in alias_columns.get(alias, []) if c.column_code == code), None
            )
            masked = col is not None and (col.is_sensitive or code in sens)
            if masked:
                if v not in (None, ""):
                    v = "******"
            else:
                # 行级乘系数：round(target × factor, 2)；同时存未取整乘积供余差收口用
                qual = f"{alias}.{code}"
                factor_qual = rules_by_target.get(qual)
                if factor_qual is not None:
                    fa, _, fc = factor_qual.partition(".")
                    factor_val = alias_raws.get(fa, {}).get(fc)
                    try:
                        raw_prod = _num(v) * _num(factor_val)
                        item[f"__rawprod__{qual}"] = raw_prod  # 未取整，用于余差收口
                        v = round(raw_prod, 2)
                    except (TypeError, ValueError):
                        v = ""
            item[f"{alias}.{code}"] = v
        full_items.append(item)

    # ===== 转置/重映射（先拆分，已在上面完成）→ 行重塑 → 再聚合 =====
    if transpose_on:
        selected_quals = [f"{a}.{c}" for (a, c) in selected]
        full_items, dropped = _apply_transpose(
            full_items,
            selected_quals,
            dim_quals,
            mea_quals,
            transpose_rules,
            bool((transpose or {}).get("drop_zero_measures", True)),
        )
        if dropped:
            columns_meta = [cm for cm in columns_meta if cm["code"] not in dropped]
            mea_quals = [m for m in mea_quals if m not in dropped]

    if not agg_on:
        if transpose_on:
            total = len(full_items)
            if page_size > 0:
                full_items = full_items[(page - 1) * page_size: page * page_size]
        return columns_meta, full_items, total

    # ===== 聚合：先拆分（已在上面完成）→ 按维度分组 → 度量聚合 =====
    groups: dict[tuple, dict] = {}
    order_keys: list[tuple] = []
    for it in full_items:
        key = tuple(it.get(dq) for dq in dim_quals)
        g = groups.get(key)
        if g is None:
            g = {dq: it.get(dq) for dq in dim_quals}
            g["__rows__"] = []
            groups[key] = g
            order_keys.append(key)
        groups[key]["__rows__"].append(it)

    result: list[dict[str, Any]] = []
    for key in order_keys:
        g = groups[key]
        out = {dq: g[dq] for dq in dim_quals}
        rws = g["__rows__"]
        for mq in mea_quals:
            agg_fn = (aggregations or {}).get(mq, "sum")
            out[mq] = _aggregate([rw.get(mq) for rw in rws], agg_fn, len(rws))
        result.append(out)

    # ===== 余差收口：同组末行补差值，确保合计 = sum(rawprod) 取整 =====
    for rc in (rounding_corrections or []):
        group_col = rc.get("group_by")
        target_cols = rc.get("target_cols") or []
        if not group_col or not target_cols:
            continue
        # 按 group_col 把 result 分组
        rc_groups: dict[Any, list[dict]] = {}
        rc_order: list[Any] = []
        for row in result:
            gk = row.get(group_col)
            if gk not in rc_groups:
                rc_groups[gk] = []
                rc_order.append(gk)
            rc_groups[gk].append(row)
        # 期望合计 = sum(未取整乘积) 再 round(2)
        expected_sums: dict[Any, dict[str, float]] = {}
        for raw_row in full_items:
            gk = raw_row.get(group_col)
            if gk not in expected_sums:
                expected_sums[gk] = {}
            for tc in target_cols:
                rp = raw_row.get(f"__rawprod__{tc}")
                if rp is None:
                    # 无系数规则的列，直接用已取整值
                    rp = _to_num(raw_row.get(tc))
                if rp is None:
                    continue
                expected_sums[gk][tc] = expected_sums[gk].get(tc, 0.0) + rp
        # 对每组末行补差
        for gk in rc_order:
            rows_in_group = rc_groups[gk]
            last_row = rows_in_group[-1]
            for tc in target_cols:
                raw_sum = expected_sums.get(gk, {}).get(tc)
                if raw_sum is None:
                    continue
                expected = round(raw_sum, 2)
                actual_sum = round(sum(_to_num(row.get(tc)) or 0.0 for row in rows_in_group), 2)
                diff = round(expected - actual_sum, 2)
                if diff != 0:
                    cur = _to_num(last_row.get(tc)) or 0.0
                    last_row[tc] = round(cur + diff, 2)

    # Python 端排序（聚合结果上）
    for s in reversed(sorts or []):
        cq = s.get("column")
        if not cq:
            continue
        is_desc = (s.get("order") or "asc").lower() == "desc"

        def _k(it, _cq=cq):
            v = it.get(_cq)
            try:
                return (0, float(v))
            except (TypeError, ValueError):
                return (1, str(v) if v is not None else "")

        result.sort(key=_k, reverse=is_desc)

    total = len(result)
    if page_size > 0:
        items = result[(page - 1) * page_size: page * page_size]
    else:
        items = result
    return columns_meta, items, total


def _filter_clause(json_text, op: str, val: Any) -> ColumnElement | None:
    if op == "eq":
        return json_text == (str(val) if val is not None else None)
    if op == "neq":
        return json_text != (str(val) if val is not None else None)
    if op == "contains" and val:
        return json_text.ilike(f"%{val}%")
    if op == "gt":
        return json_text > str(val)
    if op == "gte":
        return json_text >= str(val)
    if op == "lt":
        return json_text < str(val)
    if op == "lte":
        return json_text <= str(val)
    if op == "between" and isinstance(val, (list, tuple)) and len(val) == 2:
        clauses = []
        if val[0] is not None:
            clauses.append(json_text >= str(val[0]))
        if val[1] is not None:
            clauses.append(json_text <= str(val[1]))
        return and_(*clauses) if clauses else None
    if op == "in" and isinstance(val, (list, tuple)) and val:
        return json_text.in_([str(x) for x in val])
    if op == "is_null":
        return or_(json_text.is_(None), json_text == "")
    if op == "is_not_null":
        return and_(json_text.isnot(None), json_text != "")
    return None


async def _rebuild_scope_filter_for_alias(
    user: User, table: str, aliased_model, db: AsyncSession
) -> ColumnElement | None:
    """复用 scope_filter 的语义，但 Model 换成 aliased

    返回值：
    - None      → 不约束（超管、表无 scope_role 字段、或当前所有标签对此表无约束）
    - false()   → 用户无权限（无标签）
    - 其它      → 拼接到 where 的 ColumnElement
    """
    from sqlalchemy import false, true
    from app.data.models import CostCenterNode, OrgNode
    from app.permissions.scope_filter import (
        _get_role_columns,
        _get_user_tags,
        _is_super_admin,
    )

    if await _is_super_admin(user, db):
        return None

    role_cols = await _get_role_columns(table, db)
    if not role_cols:
        return None

    tags = await _get_user_tags(user.id, db)
    if not tags:
        return false()

    def _txt(code: str):
        return _raw_text(aliased_model, code)

    tag_clauses: list[ColumnElement] = []
    for tag, sels, filters in tags:
        # ---- 组织范围 ----
        org_part: ColumnElement | None = None
        if tag.org_scope_enabled:
            if tag.org_scope_unlimited:
                org_part = true()
            else:
                if tag.dimension == "cost_center":
                    col_key = "cc_code"
                    NodeModel = CostCenterNode
                elif tag.dimension == "org":
                    col_key = "org_node_code"
                    NodeModel = OrgNode
                else:
                    col_key = None
                    NodeModel = None

                if col_key and col_key in role_cols and NodeModel is not None:
                    codes: set[str] = set()
                    for s in sels:
                        if s.node_id is None:
                            continue
                        node = await db.get(NodeModel, s.node_id)
                        if node is None:
                            continue
                        if s.include_descendants and node.path:
                            descendants = (
                                await db.execute(
                                    select(NodeModel.code).where(
                                        NodeModel.path.like(f"{node.path}%")
                                    )
                                )
                            ).all()
                            codes.update(r[0] for r in descendants)
                        else:
                            codes.add(node.code)
                    org_part = _txt(role_cols[col_key]).in_(codes) if codes else false()

        # ---- 人员范围 ----
        person_part: ColumnElement | None = None
        if tag.person_scope_enabled:
            if not filters:
                person_part = false()
            else:
                parts: list[ColumnElement] = []
                for f in filters:
                    col_code = role_cols.get(f.field_code)
                    if not col_code:
                        continue
                    vals = [v for v in (f.values or []) if v]
                    if not vals:
                        parts.append(false())
                        continue
                    expr = _txt(col_code).in_(vals)
                    parts.append(expr if f.operator == "eq" else ~expr)
                if parts:
                    person_part = and_(*parts)

        merged = [p for p in (org_part, person_part) if p is not None]
        if not merged:
            tag_clauses.append(true())
        else:
            tag_clauses.append(and_(*merged))

    if not tag_clauses:
        return false()
    return or_(*tag_clauses)
