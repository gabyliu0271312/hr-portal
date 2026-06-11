"""命名规范化原子迁移(一次性)。

将动态表 field/bonus 重命名为语义化表名,修正字段 code,
并把 dataset 4 的别名规范化为「别名=物理表名」,同步重写所有 config。

全程单事务;先 dry-run 打印,--apply 才落库。

用法:
  python -m scripts.migrate_rename_normalize           # dry-run
  python -m scripts.migrate_rename_normalize --apply    # 落库
"""
from __future__ import annotations

import asyncio
import json
import sys

from sqlalchemy import text

from app.core.db import AsyncSessionLocal

# ── 映射定义 ────────────────────────────────────────────────────────────
TABLE_RENAME = {
    "field": "emp_severance_installment",
    "bonus": "emp_year_end_bonus",
}

# 字段 code 迁移(按物理表新名归类)
FIELD_CODE = {
    "emp_severance_installment": {
        "field": "installment_1",
        "field_2": "installment_2",
        "field_3": "installment_3",
        "field_4": "installment_4",
    },
    "emp_year_end_bonus": {
        "bonus": "bonus_year",
        "field": "currency",
    },
}

# dataset 4 别名规范化:旧别名 → 新别名(=物理表名)
ALIAS_RENAME = {
    "salary": "emp_monthly_salary",
    "realtime": "emp_monthly_allocation",
    "roster": "cost_center_monthly",
    "allocation": "emp_year_end_bonus",
    "cc": "emp_severance_installment",
}

DATASET_ID = 4


def _seq_name(t: str) -> str:
    return f"{t}_id_seq"


async def rename_physical(db, apply: bool, log: list):
    """A. 物理表/序列/约束/索引改名 + raw key 重写。"""
    for old, new in TABLE_RENAME.items():
        log.append(f"[A] RENAME TABLE {old} → {new}")
        if apply:
            await db.execute(text(f'ALTER TABLE "{old}" RENAME TO "{new}"'))
            # 序列
            await db.execute(text(f'ALTER SEQUENCE IF EXISTS "{_seq_name(old)}" RENAME TO "{_seq_name(new)}"'))
            await db.execute(text(f'ALTER TABLE "{new}" ALTER COLUMN id SET DEFAULT nextval(\'"{_seq_name(new)}"\')'))
            # 约束改名
            await db.execute(text(f'ALTER TABLE "{new}" RENAME CONSTRAINT "{old}_pkey" TO "{new}_pkey"'))
            await db.execute(text(f'ALTER TABLE "{new}" RENAME CONSTRAINT "uq_{old}_pk" TO "uq_{new}_pk"'))
            # 普通索引改名
            await db.execute(text(f'ALTER INDEX IF EXISTS "ix_{old}_pk_hash" RENAME TO "ix_{new}_pk_hash"'))

        # raw key 重写(字段 code 迁移)
        fmap = FIELD_CODE.get(new, {})
        if fmap:
            log.append(f"[A] {new}: rewrite raw keys {fmap}")
            if apply:
                rows = (await db.execute(text(f'SELECT id, raw FROM "{new}"'))).all()
                for rid, raw in rows:
                    d = raw if isinstance(raw, dict) else json.loads(raw)
                    nd = {fmap.get(k, k): v for k, v in d.items()}
                    if nd != d:
                        await db.execute(
                            text(f'UPDATE "{new}" SET raw = CAST(:r AS json) WHERE id = :i'),
                            {"r": json.dumps(nd, ensure_ascii=False), "i": rid},
                        )


async def rebuild_jk_indexes(db, apply: bool, log: list):
    """A2. 删除旧表达式索引(ix_jk_*,key 含旧表名/旧字段)并按新 key 重建。"""
    for old, new in TABLE_RENAME.items():
        # 旧表上的表达式索引现已随表迁到 new 名下,但索引名仍是 ix_jk_*(随机 hash),
        # 且其表达式锚定的是旧字段 code。逐个 drop 再按新字段重建。
        idx = (await db.execute(text(
            "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = :t AND indexname LIKE 'ix_jk_%'"
        ), {"t": new})).all()
        for name, _ in idx:
            log.append(f"[A2] DROP old expr index {name} on {new}")
            if apply:
                await db.execute(text(f'DROP INDEX IF EXISTS "{name}"'))
        # 按新字段 code 为常用 PK 列重建(employee_no + 期间列)
        cols = (await db.execute(text(
            "SELECT column_code FROM table_columns WHERE table_name = :t AND is_pk_part = true"
        ), {"t": new})).all()
        for (code,) in cols:
            log.append(f"[A2] CREATE expr index on {new}.{code}")
            if apply:
                await db.execute(text(
                    f"CREATE INDEX ON \"{new}\" ((raw::jsonb ->> '{code}'))"
                ))


async def update_metadata(db, apply: bool, log: list):
    """B. registered_tables / table_columns 表名与字段 code。"""
    for old, new in TABLE_RENAME.items():
        log.append(f"[B] registered_tables {old} → {new}")
        if apply:
            await db.execute(text("UPDATE registered_tables SET table_name = :n WHERE table_name = :o"),
                             {"n": new, "o": old})
            await db.execute(text("UPDATE table_columns SET table_name = :n WHERE table_name = :o"),
                             {"n": new, "o": old})
        # 字段 code
        for oc, nc in FIELD_CODE.get(new, {}).items():
            log.append(f"[B] table_columns {new}.{oc} → {nc}")
            if apply:
                await db.execute(text(
                    "UPDATE table_columns SET column_code = :nc WHERE table_name = :t AND column_code = :oc"
                ), {"nc": nc, "t": new, "oc": oc})


async def update_dataset_tables(db, apply: bool, log: list):
    """C1. dataset_tables:表名 + 别名规范化。"""
    for old, new in TABLE_RENAME.items():
        log.append(f"[C1] dataset_tables.table_name {old} → {new}")
        if apply:
            await db.execute(text(
                "UPDATE dataset_tables SET table_name = :n WHERE dataset_id = :d AND table_name = :o"
            ), {"n": new, "o": old, "d": DATASET_ID})
    for oa, na in ALIAS_RENAME.items():
        log.append(f"[C1] dataset_tables.alias {oa} → {na}")
        if apply:
            await db.execute(text(
                "UPDATE dataset_tables SET alias = :na WHERE dataset_id = :d AND alias = :oa"
            ), {"na": na, "oa": oa, "d": DATASET_ID})


async def update_relations(db, apply: bool, log: list):
    """C2. dataset_relations:left/right_alias 同步;keys 字段 code 同步。"""
    rows = (await db.execute(text(
        "SELECT id, left_alias, right_alias, keys FROM dataset_relations WHERE dataset_id = :d"
    ), {"d": DATASET_ID})).all()
    # 旧别名 → 指向的物理表新名(用于 keys 字段 code 映射)
    alias_to_newtable = {
        "salary": "emp_monthly_salary",
        "realtime": "emp_monthly_allocation",
        "roster": "cost_center_monthly",
        "allocation": "emp_year_end_bonus",
        "cc": "emp_severance_installment",
    }
    for rid, la, ra, keys in rows:
        nla, nra = ALIAS_RENAME.get(la, la), ALIAS_RENAME.get(ra, ra)
        klist = keys if isinstance(keys, list) else json.loads(keys)
        new_keys = []
        for k in klist:
            lk, rk = k.get("left"), k.get("right")
            lmap = FIELD_CODE.get(alias_to_newtable.get(la, ""), {})
            rmap = FIELD_CODE.get(alias_to_newtable.get(ra, ""), {})
            new_keys.append({"left": lmap.get(lk, lk), "right": rmap.get(rk, rk)})
        log.append(f"[C2] relation {rid}: ({la},{ra})→({nla},{nra}) keys {klist}→{new_keys}")
        if apply:
            await db.execute(text(
                "UPDATE dataset_relations SET left_alias = :la, right_alias = :ra, keys = CAST(:k AS json) WHERE id = :i"
            ), {"la": nla, "ra": nra, "k": json.dumps(new_keys, ensure_ascii=False), "i": rid})


# ── config 重写 ─────────────────────────────────────────────────────────
# 旧别名 → 指向物理表新名(用于字段 code 映射)
_ALIAS_OLD_TO_NEWTABLE = {
    "salary": "emp_monthly_salary",
    "realtime": "emp_monthly_allocation",
    "roster": "cost_center_monthly",
    "allocation": "emp_year_end_bonus",
    "cc": "emp_severance_installment",
}
# 工资表中文 code → 英文(今天主迁移遗漏的 transpose.rules 中文残留)
_ZH_SALARY = {
    "推荐奖": "referral_bonus",
    "应发工资(含补偿金)": "gross_salary_including_compensation",
    "应发工资（含补偿金）": "gross_salary_including_compensation",
}
_ZH_BY_TABLE = {
    "emp_monthly_salary": _ZH_SALARY,
    "cost_center_monthly": {"名称": "name", "编码": "code"},
}


def _remap_ref(ref):
    """'旧别名.code' → '新别名.新code'。别名换成物理表名;字段 code 走 FIELD_CODE / 中文残留映射。"""
    if not isinstance(ref, str) or "." not in ref:
        return ref
    alias, code = ref.split(".", 1)
    new_alias = ALIAS_RENAME.get(alias, alias)
    table = _ALIAS_OLD_TO_NEWTABLE.get(alias)
    new_code = code
    if table:
        new_code = FIELD_CODE.get(table, {}).get(code, code)
        new_code = _ZH_BY_TABLE.get(table, {}).get(new_code, new_code)
    return f"{new_alias}.{new_code}"


def rewrite_config(cfg: dict) -> dict:
    rm = _remap_ref
    if isinstance(cfg.get("columns"), list):
        cfg["columns"] = [rm(c) for c in cfg["columns"]]
    for s in cfg.get("sorts", []) or []:
        if s.get("column"):
            s["column"] = rm(s["column"])
    for f in cfg.get("filters", []) or []:
        if f.get("column"):
            f["column"] = rm(f["column"])
    for vr in cfg.get("value_rules", []) or []:
        for key in ("target", "factor"):
            if vr.get(key):
                vr[key] = rm(vr[key])
    dsr = cfg.get("default_split_rule") or {}
    if dsr.get("factor"):
        dsr["factor"] = rm(dsr["factor"])
    if isinstance(cfg.get("column_settings"), dict):
        cfg["column_settings"] = {rm(k): v for k, v in cfg["column_settings"].items()}
    if isinstance(cfg.get("aggregations"), dict):
        cfg["aggregations"] = {rm(k): v for k, v in cfg["aggregations"].items()}
    if isinstance(cfg.get("rounding_group_by"), list):
        cfg["rounding_group_by"] = [rm(x) for x in cfg["rounding_group_by"]]
    for rc in cfg.get("rounding_corrections", []) or []:
        for key in ("target", "group_by", "target_cols"):
            if isinstance(rc.get(key), list):
                rc[key] = [rm(x) for x in rc[key]]
            elif rc.get(key):
                rc[key] = rm(rc[key])
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
        if rule.get("source_col"):
            rule["source_col"] = rm(rule["source_col"])
        if isinstance(rule.get("target_cols"), list):
            rule["target_cols"] = [rm(x) for x in rule["target_cols"]]
        if isinstance(rule.get("dims"), list):
            for d in rule["dims"]:
                if d.get("dim"):
                    d["dim"] = rm(d["dim"])
        if isinstance(rule.get("dim_updates"), dict):
            rule["dim_updates"] = {rm(k): v for k, v in rule["dim_updates"].items()}
    return cfg


async def update_configs(db, apply: bool, log: list):
    """D. scheme + report 的 config 全量重写。"""
    for tbl, label in (("allocation_schemes", "scheme"), ("reports", "report")):
        rows = (await db.execute(text(
            f"SELECT id, config FROM {tbl} WHERE dataset_id = :d"
        ), {"d": DATASET_ID})).all()
        for rid, config in rows:
            cfg = config if isinstance(config, dict) else json.loads(config)
            new_cfg = rewrite_config(json.loads(json.dumps(cfg)))  # deep copy
            import re
            zh = len(re.findall(r"\.[一-鿿]", json.dumps(new_cfg, ensure_ascii=False)))
            log.append(f"[D] {label} {rid}: rewritten | 残留中文字段引用={zh}")
            if apply:
                await db.execute(text(f"UPDATE {tbl} SET config = CAST(:c AS json) WHERE id = :i"),
                                 {"c": json.dumps(new_cfg, ensure_ascii=False), "i": rid})


async def main():
    apply = "--apply" in sys.argv
    log: list[str] = []
    print(f"=== 命名规范化迁移 [{'APPLY' if apply else 'DRY-RUN'}] ===\n")
    async with AsyncSessionLocal() as db:
        await rename_physical(db, apply, log)
        await update_metadata(db, apply, log)
        await rebuild_jk_indexes(db, apply, log)
        await update_dataset_tables(db, apply, log)
        await update_relations(db, apply, log)
        await update_configs(db, apply, log)
        for line in log:
            print(line)
        if apply:
            await db.commit()
            print("\n✅ 已提交(单事务)")
        else:
            await db.rollback()
            print("\n(dry-run,未改动)")


if __name__ == "__main__":
    asyncio.run(main())
