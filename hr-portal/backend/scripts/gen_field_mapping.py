"""第1步(UUID基准版):生成字段迁移映射,供人工审核。

北森表(4张):以表头 {UUID: title} 为基准
  - source_field_id = UUID
  - column_label    = title(中文)
  - column_code     = 英文(canonical > 推送配置映射 > 词典 > AI > 兜底)
internal 表(emp_monthly_cost_result):无北森源,基于库内现有 column_code
  - 已是英文占位(field_N)或中文,中文的走同样的 code 生成

产出两份(backend/scripts/ 下):
  - field_mapping.json:  {table: {uuid_or_curcode: {code,label,uuid,source}}}
  - code_migration.json: {table: {旧column_code: 新column_code}}  ← 存量迁移用
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

import httpx
from sqlalchemy import select, text

from app.codegen.rules import deterministic_code, unique_code
from app.core.db import AsyncSessionLocal
from app.core.secret_box import decrypt
from app.datasources.beisen_client import _get_token
from app.datasources.models import DataSource
from app.ai.provider import generate_json_openai_compatible

BEISEN_TABLES = ["emp_realtime_roster", "emp_monthly_salary", "emp_monthly_allocation", "cost_center_monthly"]
INTERNAL_TABLES = ["emp_monthly_cost_result"]

CANONICAL = {
    "工号": "employee_no", "姓名": "full_name", "姓名（中文名）": "chinese_name", "英文名": "english_name",
    "月份": "month", "发薪月份": "pay_month", "成本归属年月": "cost_period",
    "甲方": "client", "费用类型": "expense_type", "编码": "code", "名称": "name",
    "生效日期": "effective_date", "岗位工资": "position_salary", "基本工资": "base_salary",
    "职位族": "job_family", "职位类": "job_category", "标准职位": "standard_position",
    "直接上级": "direct_supervisor", "岗位层级": "position_level", "管理职级": "management_level",
    "目标年终奖": "target_year_end_bonus", "证件号码": "id_number", "工作地": "work_location",
    "变动原因": "change_reason", "维度值": "dimension_value",
    "汇率(自定义)": "custom_exchange_rate", "外包费用": "outsourcing_fee",
    "员工性质": "employee_nature", "游戏项目明细": "game_project_detail",
    "标准游戏项目": "standard_game_project", "工作室": "studio",
    "工作室群": "studio_group", "组织节点编码（权限用）": "org_node_code",
}

# internal 表 field_N 的语义化映射(按 column_label 业务含义,用户确认)
# key 用旧 column_code
INTERNAL_CODE_OVERRIDE = {
    "field": "current_month_paid",      # 本月实发
    "field_2": "second_installment",    # 第二期发放
    "field_3": "third_installment",     # 第三期发放
    "field_4": "fourth_installment",    # 第四期发放
}


def clean_code(c: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", (c or "").lower()).strip("_")


def is_good(code: str) -> bool:
    return bool(code) and not re.fullmatch(r"field(_\d+)?", code)


async def fetch_header(db, tname) -> list[tuple[str, str]]:
    """返回 [(uuid, title)] 顺序保留"""
    ds = (await db.execute(select(DataSource).where(DataSource.table_name == tname))).scalar_one()
    s = ds.settings or {}
    secrets = {k: decrypt(v) for k, v in (ds.secrets_encrypted or {}).items()}
    token = await _get_token(s["BEISEN_TOKEN_URL"], secrets.get("BEISEN_APP_KEY"), secrets.get("BEISEN_APP_SECRET"))
    async with httpx.AsyncClient(timeout=40) as c:
        r = await c.get(s["BEISEN_HEADER_URL"], params={"reportId": s["BEISEN_REPORT_ID"]}, headers={"Authorization": f"Bearer {token}"})
        cols = r.json().get("data", {}).get("columns") or []
    return [(col["id"], col.get("title", col["id"])) for col in cols if "id" in col]


async def push_mapping(db) -> dict[str, str]:
    out: dict[str, str] = {}
    rows = (await db.execute(text("SELECT field_mappings FROM push_targets"))).all()
    for (fm,) in rows:
        if not fm:
            continue
        items = fm if isinstance(fm, list) else json.loads(fm)
        for it in items:
            src, tgt = it.get("source"), it.get("target")
            if src and tgt and is_good(tgt):
                out.setdefault(src, clean_code(tgt))
    return out


async def ai_translate(zh_names: list[str], db) -> dict[str, str]:
    if not zh_names:
        return {}
    cfg = (await db.execute(text("SELECT base_url, api_key_encrypted, model_fast_json FROM ai_provider_configs WHERE is_enabled LIMIT 1"))).first()
    if not cfg:
        return {}
    base_url, key_enc, model = cfg
    api_key = decrypt(key_enc)
    sys = (
        "You are a strict JSON API converting Chinese HR/payroll field names into snake_case English DB column codes. "
        "Rules: lowercase, underscore-separated, ascii only, concise but meaningful, no ambiguous abbreviation. "
        "Respond ONLY a JSON object mapping each input Chinese name to its english code. No questions/explanation/markdown."
    )
    result: dict[str, str] = {}
    for i in range(0, len(zh_names), 40):
        batch = zh_names[i:i + 40]
        msg = [{"role": "system", "content": sys},
               {"role": "user", "content": "Convert, return JSON {chinese: english_code}:\n" + json.dumps(batch, ensure_ascii=False)}]
        try:
            out, _ = await generate_json_openai_compatible(api_key=api_key, base_url=base_url, model=model, messages=msg, timeout=60)
            for k, v in (out or {}).items():
                if isinstance(v, str):
                    result[k] = clean_code(v)
        except Exception as e:
            print(f"[warn] AI 批次失败: {e}")
    return result


def pick_code(label, push_map, ai_map):
    if label in CANONICAL:
        return CANONICAL[label], "canonical"
    if label in push_map:
        return push_map[label], "push_config"
    d = deterministic_code(label)
    if is_good(d):
        return d, "dict"
    if label in ai_map and is_good(ai_map[label]):
        return ai_map[label], "ai"
    return (d or "field"), "fallback"


async def main():
    async with AsyncSessionLocal() as db:
        push_map = await push_mapping(db)

        # 库内现有 code(用于 code_migration:旧→新)
        cur = (await db.execute(text(
            "SELECT table_name, column_code, column_label, auto_discovered FROM table_columns "
            "WHERE table_name = ANY(:t) ORDER BY table_name, display_order"
        ), {"t": BEISEN_TABLES + INTERNAL_TABLES})).all()
        # cols_meta[table] = [(code, label, auto_discovered)]
        cols_meta: dict[str, list[tuple[str, str, bool]]] = {}
        cur_codes: dict[str, list[str]] = {}
        for tn, cc, lbl, auto in cur:
            cols_meta.setdefault(tn, []).append((cc, lbl, auto))
            cur_codes.setdefault(tn, []).append(cc)

        # 拉北森表头 {title: uuid}
        headers: dict[str, list[tuple[str, str]]] = {}
        title_uuid: dict[str, dict[str, str]] = {}
        for tn in BEISEN_TABLES:
            try:
                headers[tn] = await fetch_header(db, tn)
                await asyncio.sleep(1.3)
            except Exception as e:
                print(f"[warn] {tn} 表头失败: {e}")
                headers[tn] = []
            title_uuid[tn] = {title: uuid for uuid, title in headers[tn]}

        # 脏字段判定:auto_discovered=true 且 key 是北森辅助列形态
        #   - 纯 UUID / UUID_original / UUID_Id / xxx_id / xxx_alias
        def is_dirty_helper(code: str, auto: bool) -> bool:
            if not auto:
                return False  # 手工字段一律保留
            if code.startswith("_"):
                return False  # 系统注入列(_org_node_code)保留
            if re.fullmatch(r"[0-9a-fA-F-]{36}(_original|_Id|_id)?", code):
                return True
            if re.search(r"_\d{6,}_(id|alias)$", code):
                return True
            if code.endswith(("_original", "_alias")):
                return True
            return False

        # 收集需 AI 翻译的 label(库内字段的中文 label,三源未覆盖的)
        all_labels: set[str] = set()
        for tn in BEISEN_TABLES + INTERNAL_TABLES:
            for code, lbl, auto in cols_meta.get(tn, []):
                if tn in BEISEN_TABLES and is_dirty_helper(code, auto):
                    continue
                name = lbl or code
                if re.search(r"[一-鿿]", name) and name not in CANONICAL and name not in push_map and not is_good(deterministic_code(name)):
                    all_labels.add(name)
        ai_map = await ai_translate(sorted(all_labels), db)

        field_mapping: dict[str, dict] = {}
        code_migration: dict[str, dict] = {}
        drop_fields: dict[str, list[str]] = {}

        # 北森表:以库内字段为基准(保留手工/注入列),叠加表头 UUID 锚点
        for tn in BEISEN_TABLES:
            used: set[str] = set()
            tbl: dict[str, dict] = {}
            mig: dict[str, str] = {}
            drops: list[str] = []
            for code, lbl, auto in cols_meta.get(tn, []):
                if is_dirty_helper(code, auto):
                    drops.append(code)
                    continue
                name = lbl or code
                uuid = title_uuid.get(tn, {}).get(name, "")
                new_code, src = pick_code(name, push_map, ai_map)
                new_code = unique_code(clean_code(new_code) or "field", used)
                used.add(new_code)
                # field_mapping 以新 code 为 key,带 uuid 锚点
                tbl[new_code] = {"old_code": code, "code": new_code, "label": name, "uuid": uuid, "source": src}
                mig[code] = new_code
            field_mapping[tn] = tbl
            code_migration[tn] = mig
            if drops:
                drop_fields[tn] = drops

        # internal 表:基于现有 code(无北森源)
        for tn in INTERNAL_TABLES:
            used = set()
            tbl = {}
            mig = {}
            for code, lbl, auto in cols_meta.get(tn, []):
                if code in INTERNAL_CODE_OVERRIDE:
                    new_code, src = INTERNAL_CODE_OVERRIDE[code], "override"
                elif re.search(r"[一-鿿]", code):
                    new_code, src = pick_code(lbl or code, push_map, ai_map)
                else:
                    new_code, src = code, "keep"
                new_code = unique_code(clean_code(new_code) or code, used)
                used.add(new_code)
                tbl[new_code] = {"old_code": code, "code": new_code, "label": lbl or code, "uuid": "", "source": src}
                mig[code] = new_code
            field_mapping[tn] = tbl
            code_migration[tn] = mig

        base = Path(__file__).parent
        (base / "field_mapping.json").write_text(json.dumps(field_mapping, ensure_ascii=False, indent=2), encoding="utf-8")
        (base / "code_migration.json").write_text(json.dumps(code_migration, ensure_ascii=False, indent=2), encoding="utf-8")
        (base / "drop_fields.json").write_text(json.dumps(drop_fields, ensure_ascii=False, indent=2), encoding="utf-8")

        # 统计
        by_src: dict[str, int] = {}
        unresolved = []
        no_uuid = []
        for tn, tbl in field_mapping.items():
            for key, info in tbl.items():
                by_src[info["source"]] = by_src.get(info["source"], 0) + 1
                if info["source"] == "fallback" or re.fullmatch(r"field(_\d+)?", info["code"]):
                    unresolved.append(f"{tn} | {info['label']} -> {info['code']}")
                if tn in BEISEN_TABLES and not info["uuid"]:
                    no_uuid.append(f"{tn} | {info['label']}({info['old_code']}) -> {info['code']}")
        total = sum(len(v) for v in field_mapping.values())
        total_drop = sum(len(v) for v in drop_fields.values())
        print(f"映射字段总数: {total} | 清掉脏字段: {total_drop}")
        print("来源分布:", by_src)
        print(f"\n弱 code 待确认({len(unresolved)}):")
        for u in unresolved:
            print("  ", u)
        print(f"\n北森表无UUID锚点的字段({len(no_uuid)})(手工/注入列正常无UUID):")
        for u in no_uuid:
            print("  ", u)
        print("\n各表清掉的脏字段数:")
        for tn, drops in drop_fields.items():
            print(f"  {tn}: {len(drops)}")


if __name__ == "__main__":
    asyncio.run(main())
