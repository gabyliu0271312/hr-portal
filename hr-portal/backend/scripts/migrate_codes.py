"""第2+3步:字段编码中文→英文 一次性迁移(元数据 + raw + 所有引用)。

读取 backend/scripts/ 下:
  - code_migration.json: {table: {旧code: 新code}}
  - field_mapping.json:  {table: {新code: {old_code,label,uuid,source}}}
  - drop_fields.json:    {table: [脏字段code...]}

迁移内容(单事务):
  A. table_columns: 删脏字段 → 改 column_code → 回填 source_field_id
  B. 5张业务表 raw: JSON key 中→英 + 删脏key + 重算 pk_hash
  C. dataset_calculated_fields: formula(FIELD("alias.code")) + depends_on
  D. reports.config: columns/value_rules/default_split_rule/column_settings/aggregations/transpose
  E. dataset_relations.keys: left/right
  F. push_targets.field_mappings: source

用法: python -m scripts.migrate_codes [--apply]
  不带 --apply = dry-run(只统计不写库)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import sys
from pathlib import Path

from sqlalchemy import select, text

from app.core.db import AsyncSessionLocal

BASE = Path(__file__).parent
MIG = json.loads((BASE / "code_migration.json").read_text(encoding="utf-8"))
FMAP = json.loads((BASE / "field_mapping.json").read_text(encoding="utf-8"))
DROP = json.loads((BASE / "drop_fields.json").read_text(encoding="utf-8"))

TABLES = list(MIG.keys())  # 5 张业务表


def new_code_for(table: str, old: str) -> str | None:
    """返回该表旧 code 的新 code;脏字段返回 None(删除)"""
    return MIG.get(table, {}).get(old)


async def migrate_table_columns(db, apply: bool) -> dict:
    stats = {"renamed": 0, "dropped": 0, "anchored": 0}
    for table in TABLES:
        drops = set(DROP.get(table, []))
        # 删脏字段元数据
        for code in drops:
            if apply:
                await db.execute(text(
                    "DELETE FROM table_columns WHERE table_name=:t AND column_code=:c"
                ), {"t": table, "c": code})
            stats["dropped"] += 1
        # 改 code + 回填 uuid
        for new_code, info in FMAP.get(table, {}).items():
            old = info["old_code"]
            uuid = info.get("uuid") or None
            if old in drops:
                continue
            if apply:
                await db.execute(text(
                    "UPDATE table_columns SET column_code=:nc, source_field_id=:sf "
                    "WHERE table_name=:t AND column_code=:oc"
                ), {"nc": new_code, "sf": uuid, "t": table, "oc": old})
            stats["renamed"] += 1
            if uuid:
                stats["anchored"] += 1
    return stats


async def migrate_raw(db, apply: bool) -> dict:
    """5张表 raw JSON key 中→英 + 删脏key + 重算 pk_hash"""
    stats = {}
    for table in TABLES:
        mig = MIG[table]  # 旧→新(脏字段值为 None/缺失)
        drops = set(DROP.get(table, []))
        # 该表 PK 列(用新 code 算 hash),必须按 display_order,与生产 _get_pk_columns 一致
        pk_rows = (await db.execute(text(
            "SELECT column_code FROM table_columns WHERE table_name=:t AND is_pk_part=true "
            "ORDER BY display_order"
        ), {"t": table})).all()
        # 注意:此函数在 migrate_table_columns 之后调用,column_code 已是新值
        pk_cols = [r[0] for r in pk_rows]

        rows = (await db.execute(text(f'SELECT id, raw FROM "{table}"'))).all()
        # 先全量计算新 raw + 新 hash,检测冲突后再写,避免逐行 UPDATE 的瞬时撞约束
        planned = []  # (id, new_raw_json, new_hash)
        seen_hash: dict[str, int] = {}
        collisions = []
        for rid, raw in rows:
            if not isinstance(raw, dict):
                continue
            new_raw = {}
            for k, v in raw.items():
                if k in drops:
                    continue
                nk = mig.get(k, k)  # 中→英;已是英文(注入列_xxx)保持
                new_raw[nk] = v
            if pk_cols:
                material = "||".join(str(new_raw.get(c, "")) for c in pk_cols)
            else:
                material = json.dumps(new_raw, sort_keys=True, ensure_ascii=False)
            new_hash = hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]
            if new_hash in seen_hash:
                collisions.append((seen_hash[new_hash], rid, material[:80]))
                continue  # 跳过冲突行(同 PK 视为重复,保留先出现的)
            seen_hash[new_hash] = rid
            planned.append((rid, json.dumps(new_raw, ensure_ascii=False), new_hash))
        if collisions:
            print(f"  ⚠ {table} 有 {len(collisions)} 行 hash 冲突(将跳过),示例: {collisions[:3]}")
        # 两段式写:先把所有 pk_hash 置临时值避免与未更新行撞,再写终值
        if apply:
            for rid, raw_json, _ in planned:
                await db.execute(text(f'UPDATE "{table}" SET pk_hash=:h WHERE id=:i'),
                                 {"h": f"_tmp_{rid}", "i": rid})
            for rid, raw_json, new_hash in planned:
                await db.execute(text(f'UPDATE "{table}" SET raw=:r, pk_hash=:h WHERE id=:i'),
                                 {"r": raw_json, "h": new_hash, "i": rid})
            # 删除冲突行(重复数据)
            if collisions:
                dup_ids = [c[1] for c in collisions]
                await db.execute(text(f'DELETE FROM "{table}" WHERE id = ANY(:ids)'), {"ids": dup_ids})
        changed = len(planned)
        stats[table] = changed
    return stats


def build_alias_resolver(dataset_tables):
    """{dataset_id: {alias: table_name}}"""
    out = {}
    for ds_id, table_name, alias in dataset_tables:
        out.setdefault(ds_id, {})[alias] = table_name
    return out


def remap_qualified(ref: str, alias_map: dict) -> str:
    """'alias.旧code' → 'alias.新code';解析不了原样返回"""
    if "." not in ref:
        return ref
    alias, code = ref.split(".", 1)
    table = alias_map.get(alias)
    if not table or table not in MIG:
        return ref
    new = MIG[table].get(code)
    return f"{alias}.{new}" if new else ref


async def migrate_calculated_fields(db, apply: bool) -> int:
    dts = (await db.execute(text("SELECT dataset_id, table_name, alias FROM dataset_tables"))).all()
    alias_by_ds = build_alias_resolver(dts)
    rows = (await db.execute(text(
        "SELECT id, dataset_id, formula, formula_display, depends_on FROM dataset_calculated_fields"
    ))).all()
    n = 0
    for rid, ds_id, formula, fdisp, depends in rows:
        amap = alias_by_ds.get(ds_id, {})
        # formula: FIELD("alias.code")
        import re
        def repl(m):
            return f'FIELD("{remap_qualified(m.group(1), amap)}")'
        new_formula = re.sub(r'FIELD\(\s*"([^"]+)"\s*\)', repl, formula or "")
        new_disp = re.sub(r'FIELD\(\s*"([^"]+)"\s*\)', repl, fdisp or "") if fdisp else fdisp
        dep = depends if isinstance(depends, list) else (json.loads(depends) if depends else [])
        new_dep = [remap_qualified(d, amap) for d in dep]
        if apply:
            await db.execute(text(
                "UPDATE dataset_calculated_fields SET formula=:f, formula_display=:fd, depends_on=:d WHERE id=:i"
            ), {"f": new_formula, "fd": new_disp, "d": json.dumps(new_dep, ensure_ascii=False), "i": rid})
        n += 1
    return n


async def migrate_reports(db, apply: bool) -> int:
    dts = (await db.execute(text("SELECT dataset_id, table_name, alias FROM dataset_tables"))).all()
    alias_by_ds = build_alias_resolver(dts)
    rows = (await db.execute(text("SELECT id, dataset_id, config FROM reports"))).all()
    n = 0
    for rid, ds_id, config in rows:
        amap = alias_by_ds.get(ds_id, {})
        cfg = config if isinstance(config, dict) else json.loads(config)

        def rm(ref):
            return remap_qualified(ref, amap)

        if isinstance(cfg.get("columns"), list):
            cfg["columns"] = [rm(c) for c in cfg["columns"]]
        for vr in cfg.get("value_rules", []) or []:
            if "target" in vr: vr["target"] = rm(vr["target"])
            if "factor" in vr: vr["factor"] = rm(vr["factor"])
        dsr = cfg.get("default_split_rule") or {}
        if dsr.get("factor"): dsr["factor"] = rm(dsr["factor"])
        if isinstance(cfg.get("column_settings"), dict):
            cfg["column_settings"] = {rm(k): v for k, v in cfg["column_settings"].items()}
        if isinstance(cfg.get("aggregations"), dict):
            cfg["aggregations"] = {rm(k): v for k, v in cfg["aggregations"].items()}
        tr = cfg.get("transpose") or {}
        for sub in ("column_to_row", "row_to_column"):
            blk = tr.get(sub) or {}
            for key in ("group_by", "source_cols", "pivot_values"):
                if isinstance(blk.get(key), list):
                    blk[key] = [rm(x) for x in blk[key]]
            for key in ("pivot_col", "value_col"):
                if blk.get(key):
                    blk[key] = rm(blk[key])
        for rule in tr.get("rules", []) or []:
            for key in ("target", "source", "factor"):
                if rule.get(key):
                    rule[key] = rm(rule[key])
        if isinstance(cfg.get("rounding_group_by"), list):
            cfg["rounding_group_by"] = [rm(x) for x in cfg["rounding_group_by"]]
        for f in cfg.get("filters", []) or []:
            if f.get("column"):
                f["column"] = rm(f["column"])
        for s in cfg.get("sorts", []) or []:
            if s.get("column"):
                s["column"] = rm(s["column"])
        if apply:
            await db.execute(text("UPDATE reports SET config=:c WHERE id=:i"),
                             {"c": json.dumps(cfg, ensure_ascii=False), "i": rid})
        n += 1
    return n


async def migrate_relations(db, apply: bool) -> int:
    dts = (await db.execute(text("SELECT dataset_id, table_name, alias FROM dataset_tables"))).all()
    alias_by_ds = build_alias_resolver(dts)
    rows = (await db.execute(text(
        "SELECT id, dataset_id, left_alias, right_alias, keys FROM dataset_relations"
    ))).all()
    n = 0
    for rid, ds_id, la, ra, keys in rows:
        amap = alias_by_ds.get(ds_id, {})
        klist = keys if isinstance(keys, list) else json.loads(keys)
        new_keys = []
        for k in klist:
            nk = dict(k)
            lt = amap.get(la)
            rt = amap.get(ra)
            if lt in MIG and k.get("left") in MIG[lt]:
                nk["left"] = MIG[lt][k["left"]]
            if rt in MIG and k.get("right") in MIG[rt]:
                nk["right"] = MIG[rt][k["right"]]
            new_keys.append(nk)
        if apply:
            await db.execute(text("UPDATE dataset_relations SET keys=:k WHERE id=:i"),
                             {"k": json.dumps(new_keys, ensure_ascii=False), "i": rid})
        n += 1
    return n


async def migrate_push(db, apply: bool) -> int:
    rows = (await db.execute(text("SELECT id, source_table, field_mappings FROM push_targets"))).all()
    n = 0
    for rid, src_table, fm in rows:
        if src_table not in MIG:
            continue
        items = fm if isinstance(fm, list) else json.loads(fm)
        new_items = []
        for it in items:
            ni = dict(it)
            src = it.get("source")
            if src in MIG[src_table]:
                ni["source"] = MIG[src_table][src]
            new_items.append(ni)
        if apply:
            await db.execute(text("UPDATE push_targets SET field_mappings=:f WHERE id=:i"),
                             {"f": json.dumps(new_items, ensure_ascii=False), "i": rid})
        n += 1
    return n


async def preprocess_roster(db, apply: bool) -> dict:
    """花名册无业务主键 → 设 工号+生效日期 为 PK,并删除完全重复行。

    必须在 migrate_table_columns(改 code)之前跑,这里用旧中文 code。
    """
    table = "emp_realtime_roster"
    stats = {"set_pk": 0, "deduped": 0}
    # 1) 设 PK(工号、生效日期),display_order 决定 hash 拼接顺序:工号在前
    if apply:
        await db.execute(text(
            "UPDATE table_columns SET is_pk_part=true WHERE table_name=:t AND column_code IN ('工号','生效日期')"
        ), {"t": table})
    stats["set_pk"] = 2

    # 2) 删完全重复行(工号+生效日期相同的,保留 id 最小一行)
    dup_groups = (await db.execute(text(
        "SELECT raw->>'工号' g, raw->>'生效日期' d, array_agg(id ORDER BY id) ids "
        f'FROM "{table}" GROUP BY raw->>\'工号\', raw->>\'生效日期\' HAVING count(*)>1'
    ))).all()
    del_ids = []
    for g, d, ids in dup_groups:
        del_ids.extend(ids[1:])  # 保留第一个
    if del_ids and apply:
        await db.execute(text(f'DELETE FROM "{table}" WHERE id = ANY(:ids)'), {"ids": del_ids})
    stats["deduped"] = len(del_ids)
    return stats


async def main():
    apply = "--apply" in sys.argv
    mode = "APPLY(写库)" if apply else "DRY-RUN(只统计)"
    print(f"=== 字段编码迁移 [{mode}] ===\n")
    async with AsyncSessionLocal() as db:
        # 0. 花名册预处理:设 PK + 去重(必须最先,用旧中文 code)
        pr = await preprocess_roster(db, apply)
        print(f"0. 花名册预处理: 设PK {pr['set_pk']} 列 | 去重删除 {pr['deduped']} 行")
        # 顺序重要:先改 table_columns(让 PK 列变新 code),再改 raw
        c = await migrate_table_columns(db, apply)
        print(f"A. table_columns: 改名 {c['renamed']} | 删脏 {c['dropped']} | 回填UUID {c['anchored']}")
        r = await migrate_raw(db, apply)
        print(f"B. raw 数据重写: {r}")
        cf = await migrate_calculated_fields(db, apply)
        print(f"C. 计算字段: {cf}")
        rp = await migrate_reports(db, apply)
        print(f"D. 报表config: {rp}")
        rel = await migrate_relations(db, apply)
        print(f"E. 数据集relation: {rel}")
        pu = await migrate_push(db, apply)
        print(f"F. 推送映射: {pu}")
        if apply:
            await db.commit()
            print("\n✅ 已提交")
        else:
            await db.rollback()
            print("\n(dry-run,未写库)")


if __name__ == "__main__":
    asyncio.run(main())
