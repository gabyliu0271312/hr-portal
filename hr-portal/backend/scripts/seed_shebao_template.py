"""阶段1c 端到端验证(容器内跑):
建社保模板存库 → 读库 → 引擎跑合并 → 校验 542 人。
文件路径由参数传入(容器内 /tmp/shebao)。
"""
import asyncio
import glob
import os
import sys

sys.path.insert(0, "/app")
from sqlalchemy import select, delete

from app.core.db import AsyncSessionLocal
from app.table_tools import engine
from app.table_tools.models import MergeTemplate, MergeSourceMapping

SRC = "/tmp/shebao"

STD_FIELDS = ["养老个人", "养老公司", "医疗个人", "医疗公司", "失业个人", "失业公司",
              "工伤公司", "生育公司", "大额互助个人", "大额互助公司",
              "公积金个人", "公积金公司", "服务费", "残保金"]

MAPPINGS = [
    {"name": "深圳-日常申报明细", "match_signature": ["序号", "姓名", "证件号码", "费款所属期起", "缴费工资"],
     "sheet_kw": "申报明细", "header_start": 1, "header_end": 2,
     "key_map": {"姓名": "姓名", "证件号码": "证件号码"},
     "column_map": {"基本养老保险（个人）/应缴费额": "养老个人", "基本养老保险（单位）/应缴费额": "养老公司",
                    "基本医疗保险（个人）/应缴费额": "医疗个人", "基本医疗保险（单位）/应缴费额": "医疗公司",
                    "失业保险（个人）/应缴费额": "失业个人", "失业保险（单位）/应缴费额": "失业公司",
                    "工伤保险（单位）/应缴费额": "工伤公司", "生育保险/应缴费额": "生育公司"},
     "derived_fields": [], "derive_check": None, "skip_tokens": ["合计", "小计", "总计"]},
    {"name": "亲亲小保托管-社保sheet", "match_signature": ["序号", "姓名", "证件号码", "缴费工资", "公司"],
     "sheet_kw": "社保", "header_start": 1, "header_end": 2,
     "key_map": {"姓名": "姓名", "证件号码": "证件号码"},
     "column_map": {"基本养老保险（个人）/应缴费额": "养老个人", "基本养老保险（单位）/应缴费额": "养老公司",
                    "基本医疗保险（个人）/应缴费额": "医疗个人", "基本医疗保险（单位）/应缴费额": "医疗公司",
                    "失业保险（个人）/应缴费额": "失业个人", "失业保险（单位）/应缴费额": "失业公司",
                    "工伤保险（单位）/应缴费额": "工伤公司", "生育保险/应缴费额": "生育公司"},
     "derived_fields": [], "derive_check": None, "skip_tokens": ["合计", "小计", "总计"]},
    {"name": "深圳-单笔缴存清单", "match_signature": ["姓名", "证件号码", "个人账号", "缴存基数（元）", "金额合计（元）"],
     "sheet_kw": "单笔缴存", "header_start": 4, "header_end": 4,
     "key_map": {"姓名": "姓名", "证件号码": "证件号码"}, "column_map": {},
     "derived_fields": [{"target": "公积金个人", "expr": "{缴存基数（元）}*{个人缴存比例}", "round": 2},
                        {"target": "公积金公司", "expr": "{缴存基数（元）}*{单位缴存比例}", "round": 2}],
     "derive_check": {"sum_of": ["公积金个人", "公积金公司"], "equals_col": "金额合计（元）", "tol": 0.05},
     "skip_tokens": ["合计", "小计", "总计"]},
    {"name": "亲亲小保托管-公积金sheet", "match_signature": ["姓名", "证件号码", "个人账号", "缴存基数（元）", "公司"],
     "sheet_kw": "公积金", "header_start": 2, "header_end": 2,
     "key_map": {"姓名": "姓名", "证件号码": "证件号码"}, "column_map": {},
     "derived_fields": [{"target": "公积金个人", "expr": "{缴存基数（元）}*{个人缴存比例}", "round": 2},
                        {"target": "公积金公司", "expr": "{缴存基数（元）}*{单位缴存比例}", "round": 2}],
     "derive_check": {"sum_of": ["公积金个人", "公积金公司"], "equals_col": "金额合计（元）", "tol": 0.05},
     "skip_tokens": ["合计", "小计", "总计"]},
    {"name": "香港强积金", "match_signature": ["Name", "Member Account No", "ID No.", "Total Contribution Amount"],
     "sheet_kw": None, "header_start": 1, "header_end": 1,
     "key_map": {"Name": "姓名", "ID No.": "证件号码"},
     "column_map": {"Employee mandatory contributions": "公积金个人", "Employer mandatory contributions": "公积金公司"},
     "derived_fields": [], "derive_check": None, "skip_tokens": ["合计", "小计", "总计"]},
    {"name": "异地代缴-社保明细", "match_signature": ["员工", "身份证号码", "实际缴费单位", "社保应缴金额"],
     "sheet_kw": "社保代缴明细表", "header_start": 1, "header_end": 2,
     "key_map": {"员工": "姓名", "身份证号码": "证件号码"},
     "column_map": {"养老/养老个人": "养老个人", "养老/养老单位": "养老公司", "医疗/医疗个人": "医疗个人",
                    "医疗/医疗单位": "医疗公司", "失业/失业个人": "失业个人", "失业/失业单位": "失业公司",
                    "工伤/工伤单位": "工伤公司", "生育/生育单位": "生育公司", "残保金/残保金合计金额": "残保金"},
     "derived_fields": [], "derive_check": None, "skip_tokens": ["合计", "小计", "总计"]},
    {"name": "异地代缴-公积金明细", "match_signature": ["员工", "身份证号码", "公积金应缴金额", "公积金/公积金个人"],
     "sheet_kw": "公积金代缴明细表", "header_start": 1, "header_end": 2,
     "key_map": {"员工": "姓名", "身份证号码": "证件号码"},
     "column_map": {"公积金/公积金个人": "公积金个人", "公积金/公积金单位": "公积金公司"},
     "derived_fields": [], "derive_check": None, "skip_tokens": ["合计", "小计", "总计"]},
    {"name": "异地代缴-服务费", "match_signature": ["姓名", "身份证号码", "服务月份", "金额"],
     "sheet_kw": "人事代理服务费", "header_start": 1, "header_end": 1,
     "key_map": {"姓名": "姓名", "身份证号码": "证件号码"},
     "column_map": {"金额": "服务费"},
     "derived_fields": [], "derive_check": None, "skip_tokens": ["合计", "小计", "总计"]},
    {"name": "北京分公司-社保", "match_signature": ["序号", "姓名", "身份证号", "应收金额/应收合计"],
     "sheet_kw": "社保缴交明细", "header_start": 2, "header_end": 3,
     "key_map": {"姓名": "姓名", "身份证号": "证件号码"},
     "column_map": {"养老保险/个人交": "养老个人", "养老保险/单位交": "养老公司", "医疗及生育保险/个人交": "医疗个人",
                    "医疗及生育保险/单位交": "医疗公司", "失业保险/个人交": "失业个人", "失业保险/单位交": "失业公司",
                    "工伤保险/单位交": "工伤公司", "大额互助资金/个人交": "大额互助个人", "大额互助资金/单位交": "大额互助公司"},
     "derived_fields": [], "derive_check": None, "skip_tokens": ["合计", "小计", "总计"]},
    {"name": "北京分公司-公积金", "match_signature": ["姓名", "证件号码", "个人缴存基数", "月缴存额合计"],
     "sheet_kw": "公积金", "header_start": 5, "header_end": 5,
     "key_map": {"姓名": "姓名", "证件号码": "证件号码"},
     "column_map": {"个人月缴存额": "公积金个人", "单位月缴存额": "公积金公司"},
     "derived_fields": [], "derive_check": None, "skip_tokens": ["合计", "小计", "总计"]},
]


async def main():
    async with AsyncSessionLocal() as db:
        # 清旧(幂等)
        old = (await db.execute(select(MergeTemplate).where(MergeTemplate.name == "社保月度归集"))).scalar_one_or_none()
        if old:
            await db.delete(old)
            await db.commit()
        t = MergeTemplate(name="社保月度归集", description="多源社保按人归集",
                          merge_keys=["姓名", "证件号码"], std_fields=STD_FIELDS, aggregate="sum")
        for m in MAPPINGS:
            t.mappings.append(MergeSourceMapping(**m))
        db.add(t)
        await db.commit()
        tid = t.id
        print(f"模板已建 id={tid}, 映射数={len(MAPPINGS)}")

        # 读库 → 引擎(模拟 router 路径)
        from sqlalchemy.orm import selectinload
        t2 = (await db.execute(select(MergeTemplate).where(MergeTemplate.id == tid)
                               .options(selectinload(MergeTemplate.mappings)))).scalar_one()
        files = []
        for f in sorted(glob.glob(os.path.join(SRC, "*.xlsx"))):
            if os.path.basename(f).startswith(("_", "~$")):
                continue
            files.append((os.path.basename(f), open(f, "rb").read()))
        template = {"merge_keys": t2.merge_keys, "std_fields": t2.std_fields, "aggregate": t2.aggregate}
        mappings = [{"name": m.name, "match": m.match_signature, "sheet_kw": m.sheet_kw,
                     "header": [m.header_start, m.header_end], "key_map": m.key_map,
                     "column_map": m.column_map, "derived_fields": m.derived_fields,
                     "derive_check": m.derive_check, "skip_tokens": m.skip_tokens} for m in t2.mappings]
        result = engine.run_merge(files, template, mappings)
        s = result["stats"]
        print(f"命中 sheet={len(result['recognize_log'])} | 文件{s['files']} 记录{s['records']} 人数{s['persons']} 异常{s['anomalies']}")
        hu = next((r for r in result["rows"] if r["姓名"] == "胡俊杰"), None)
        print("胡俊杰:", {k: v for k, v in (hu or {}).items() if v not in (None, "")})
        assert s["persons"] == 542, f"人数应542 实际{s['persons']}"
        assert len(result["recognize_log"]) == 17, f"命中应17 实际{len(result['recognize_log'])}"
        print("✅ 端到端(DB往返+引擎)正确:542人/17命中")


if __name__ == "__main__":
    asyncio.run(main())
