"""校验:抽出的通用引擎 engine.run_merge 能否复现 demo 结果(542人/17命中/拆分对)。
这是『引擎抽象正确性』的回归测试,用真实文件,临时脚本。
"""
import glob, os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding="utf-8")
from engine import run_merge  # noqa

SRC = r"D:\乐逗\Desktop\社保处理文件"

TEMPLATE = {
    "merge_keys": ["姓名", "证件号码"],
    "std_fields": ["养老个人","养老公司","医疗个人","医疗公司","失业个人","失业公司",
                   "工伤公司","生育公司","大额互助个人","大额互助公司",
                   "公积金个人","公积金公司","服务费","残保金"],
    "aggregate": "sum",
}

# 复用 demo 的 MAPPINGS(从 demo_merge.py 导入,避免重复维护)
demo_dir = r"D:\AI项目\HR提效工具搭建\specs\006-excel-table-tools"
sys.path.insert(0, demo_dir)
import importlib.util
spec = importlib.util.spec_from_file_location("demo_merge", os.path.join(demo_dir, "demo_merge.py"))
demo = importlib.util.module_from_spec(spec)
# demo_merge 顶层会 import openpyxl 等,但不会自动 run(有 __main__ guard)
spec.loader.exec_module(demo)
MAPPINGS = demo.MAPPINGS
# demo 用旧 key `col_map`,引擎用 spec §3 规范名 `column_map`,适配
for m in MAPPINGS:
    if "col_map" in m and "column_map" not in m:
        m["column_map"] = m.pop("col_map")

files = []
for f in sorted(glob.glob(os.path.join(SRC, "*.xlsx"))):
    if os.path.basename(f).startswith(("_", "~$")):
        continue
    with open(f, "rb") as fh:
        files.append((os.path.basename(f), fh.read()))

result = run_merge(files, TEMPLATE, MAPPINGS)
s = result["stats"]
print(f"命中 sheet 数: {len(result['recognize_log'])}")
print(f"文件 {s['files']} | 记录 {s['records']} | 人数 {s['persons']} | 异常 {s['anomalies']}")

# 抽样核对
idx = {tuple(r[k] for k in ["姓名","证件号码"]): r for r in result["rows"]}
for name in ["胡俊杰","骆臻","兰瑜"]:
    r = next((v for k,v in idx.items() if k[0]==name), None)
    if r:
        print(f"{name}: 公积金个人={r.get('公积金个人')} 公积金公司={r.get('公积金公司')} 服务费={r.get('服务费')} 来源={r.get('来源')}")

assert s["persons"] == 542, f"人数应为542,实际{s['persons']}"
assert len(result["recognize_log"]) == 17, f"命中应为17,实际{len(result['recognize_log'])}"
print("\n✅ 引擎抽象正确:542人/17命中 与 demo 一致")
