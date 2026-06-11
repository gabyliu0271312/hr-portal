"""补丁:修 dataset 4 计算字段的旧别名/旧 code 引用(命名迁移漏网)。

dataset_calculated_fields 的 depends_on / formula / formula_display 三字段在
表/别名/字段 code 规范化时未被处理,导致计算时 KeyError(旧别名)。

用法:
  python -m scripts.fix_calc_fields_dataset4            # dry-run
  python -m scripts.fix_calc_fields_dataset4 --apply
"""
from __future__ import annotations

import asyncio
import json
import re
import sys

from sqlalchemy import text

from app.core.db import AsyncSessionLocal

DATASET_ID = 4

ALIAS_RENAME = {
    "salary": "emp_monthly_salary",
    "realtime": "emp_monthly_allocation",
    "roster": "cost_center_monthly",
    "allocation": "emp_year_end_bonus",
    "cc": "emp_severance_installment",
}

# 旧别名 → 指向物理表新名(决定该 alias 下字段 code 怎么映射)
ALIAS_TO_TABLE = {
    "salary": "emp_monthly_salary",
    "realtime": "emp_monthly_allocation",
    "roster": "cost_center_monthly",
    "allocation": "emp_year_end_bonus",
    "cc": "emp_severance_installment",
}

# 字段 code 迁移(英文旧 code → 新 code),按物理表
FIELD_CODE = {
    "emp_severance_installment": {
        "field": "installment_1", "field_2": "installment_2",
        "field_3": "installment_3", "field_4": "installment_4",
    },
    "emp_year_end_bonus": {"bonus": "bonus_year", "field": "currency"},
}

# 中文 code → 英文 code(formula_display 用),按物理表
ZH_CODE = {
    "emp_monthly_salary": {
        "工号": "employee_no",
        "应发工资（含补偿金）": "gross_salary_including_compensation",
        "实发工资": "net_salary",
    },
    "emp_severance_installment": {
        "第二期发放": "installment_2", "第三期发放": "installment_3", "第四期发放": "installment_4",
    },
    "emp_year_end_bonus": {"奖金发放金额": "bonus_amount"},
}


def _remap_token(alias: str, code: str, *, zh: bool) -> str:
    new_alias = ALIAS_RENAME.get(alias, alias)
    table = ALIAS_TO_TABLE.get(alias)
    new_code = code
    if table:
        if zh:
            new_code = ZH_CODE.get(table, {}).get(code, code)
        else:
            new_code = FIELD_CODE.get(table, {}).get(code, code)
    return f"{new_alias}.{new_code}"


def remap_english(s: str) -> str:
    """替换 alias.englishcode(depends_on / formula 里的 FIELD("..."))。"""
    pattern = re.compile(r"\b(salary|realtime|roster|allocation|cc)\.([a-zA-Z_][a-zA-Z0-9_]*)")
    return pattern.sub(lambda m: _remap_token(m.group(1), m.group(2), zh=False), s)


def remap_display(s: str) -> str:
    """替换 alias.中文code(formula_display)。

    中文字段名含全角括号等符号,正则切词不可靠 → 用「已知 alias.中文全名」整串替换,
    按 key 长度降序避免短串先匹配。
    """
    pairs: list[tuple[str, str]] = []
    for alias, table in ALIAS_TO_TABLE.items():
        new_alias = ALIAS_RENAME.get(alias, alias)
        for zh, en in ZH_CODE.get(table, {}).items():
            pairs.append((f"{alias}.{zh}", f"{new_alias}.{en}"))
    out = s
    for old, new in sorted(pairs, key=lambda p: len(p[0]), reverse=True):
        out = out.replace(old, new)
    return out


async def main():
    apply = "--apply" in sys.argv
    print(f"=== 计算字段引用迁移 [{'APPLY' if apply else 'DRY-RUN'}] ===\n")
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text(
            "SELECT id, code, depends_on, formula, formula_display "
            "FROM dataset_calculated_fields WHERE dataset_id = :d"
        ), {"d": DATASET_ID})).all()
        for fid, code, depends_on, formula, fdisplay in rows:
            dep = depends_on if isinstance(depends_on, list) else json.loads(depends_on or "[]")
            new_dep = [remap_english(d) if isinstance(d, str) else d for d in dep]
            new_formula = remap_english(formula or "")
            new_display = remap_display(fdisplay or "") if fdisplay else fdisplay
            print(f"[字段 {fid}] {code}")
            print(f"  depends_on: {dep} → {new_dep}")
            print(f"  formula:    {formula}")
            print(f"           →  {new_formula}")
            print(f"  display:    {fdisplay}")
            print(f"           →  {new_display}\n")
            if apply:
                await db.execute(text(
                    "UPDATE dataset_calculated_fields SET depends_on = CAST(:dep AS json), "
                    "formula = :f, formula_display = :fd WHERE id = :i"
                ), {
                    "dep": json.dumps(new_dep, ensure_ascii=False),
                    "f": new_formula, "fd": new_display, "i": fid,
                })
        if apply:
            await db.commit()
            print("✅ 已提交")
        else:
            await db.rollback()
            print("(dry-run)")


if __name__ == "__main__":
    asyncio.run(main())
