"""补充迁移:allocation_schemes.config 的中文字段引用 → 英文 code。

主迁移(migrate_codes.py)遗漏了 allocation_schemes 表。其 config 结构与
reports.config 完全一致,复用同样的 remap 逻辑。

用法: python -m scripts.migrate_allocation_schemes [--apply]
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import text

from app.core.db import AsyncSessionLocal

BASE = Path(__file__).parent
MIG = json.loads((BASE / "code_migration.json").read_text(encoding="utf-8"))


def remap_qualified(ref: str, alias_map: dict) -> str:
    if not isinstance(ref, str) or "." not in ref:
        return ref
    alias, code = ref.split(".", 1)
    table = alias_map.get(alias)
    if not table or table not in MIG:
        return ref
    new = MIG[table].get(code)
    return f"{alias}.{new}" if new else ref


def migrate_config(cfg: dict, amap: dict) -> dict:
    def rm(ref):
        return remap_qualified(ref, amap)

    if isinstance(cfg.get("columns"), list):
        cfg["columns"] = [rm(c) for c in cfg["columns"]]
    for vr in cfg.get("value_rules", []) or []:
        if "target" in vr:
            vr["target"] = rm(vr["target"])
        if "factor" in vr:
            vr["factor"] = rm(vr["factor"])
    dsr = cfg.get("default_split_rule") or {}
    if dsr.get("factor"):
        dsr["factor"] = rm(dsr["factor"])
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
    if isinstance(cfg.get("rounding_group_by"), list):
        cfg["rounding_group_by"] = [rm(x) for x in cfg["rounding_group_by"]]
    for rc in cfg.get("rounding_corrections", []) or []:
        for key in ("target", "group_by"):
            if isinstance(rc.get(key), list):
                rc[key] = [rm(x) for x in rc[key]]
            elif rc.get(key):
                rc[key] = rm(rc[key])
    for f in cfg.get("filters", []) or []:
        if f.get("column"):
            f["column"] = rm(f["column"])
    for s in cfg.get("sorts", []) or []:
        if s.get("column"):
            s["column"] = rm(s["column"])
    return cfg


async def main():
    apply = "--apply" in sys.argv
    print(f"=== allocation_schemes 迁移 [{'APPLY' if apply else 'DRY-RUN'}] ===\n")
    async with AsyncSessionLocal() as db:
        # alias→table 映射(按 scheme 的 dataset_id)
        schemes = (await db.execute(text("SELECT id, name, dataset_id, config FROM allocation_schemes"))).all()
        for sid, name, ds_id, config in schemes:
            dts = (await db.execute(text(
                "SELECT alias, table_name FROM dataset_tables WHERE dataset_id=:d"
            ), {"d": ds_id})).all()
            amap = {a: t for a, t in dts}
            cfg = config if isinstance(config, dict) else json.loads(config)
            import re
            before = len(re.findall(r'[一-鿿]', json.dumps(cfg, ensure_ascii=False)))
            new_cfg = migrate_config(cfg, amap)
            after_refs = [r for r in (new_cfg.get("columns") or []) if re.search(r'\.[一-鿿]', r)]
            if apply:
                await db.execute(text("UPDATE allocation_schemes SET config=:c WHERE id=:i"),
                                 {"c": json.dumps(new_cfg, ensure_ascii=False), "i": sid})
            print(f"方案[{sid}] {name}: 迁移前中文字符≈{before} | 迁移后仍含中文的字段引用={len(after_refs)}")
            if after_refs:
                print("  未迁移的列引用:", after_refs[:8])
        if apply:
            await db.commit()
            print("\n✅ 已提交")
        else:
            await db.rollback()
            print("\n(dry-run)")


if __name__ == "__main__":
    asyncio.run(main())
