"""Phase 2-3：端到端 PARTIAL 严重度验证 - 模拟真实 execute_pipeline 写入流程"""
import sys
sys.path.insert(0, '.')
sys.path.insert(0, '.venv/Lib/site-packages')

from app.ucp.pipeline_engine import (
    calculate_partial_severity,
    aggregate_pipeline_severity,
)


# 模拟步骤执行结果（来自 _execute_loop_step）
def make_step_result(total, failed, not_found):
    step_status = (
        "SUCCESS" if failed == 0 and not_found == 0
        else "FAILED" if failed == total
        else "PARTIAL_SUCCESS"
    )
    detail = calculate_partial_severity(total, failed, not_found)
    detail["step_status"] = step_status
    return {
        "status": step_status,
        "data": [],
        "row_count": total,
        "success_count": max(0, total - failed - not_found),
        "failed_count": failed,
        "not_found_count": not_found,
        "partial_detail": detail,
    }


def make_pipeline_summary(steps_results):
    """模拟 execute_pipeline 末尾聚合"""
    step_severities = [r["partial_detail"] for r in steps_results]
    pipeline_severity = aggregate_pipeline_severity(step_severities)
    return {"partial_severity": pipeline_severity}


def assert_eq(a, b, msg):
    if a == b:
        print(f"[OK] {msg}: {a}")
    else:
        print(f"[FAIL] {msg}: expected={b}, actual={a}")
        sys.exit(1)


# === Case A: 典型 Offer 同步（10 条 pending，1 条 Offer 失败）===
print("=" * 60)
print("Case A: 10 pending, 1 Offer fail (10% 失败)")
print("=" * 60)
step_pull = make_step_result(10, 0, 0)         # 拉取待入职成功
step_loop = make_step_result(10, 1, 0)         # Offer 拉取 1 失败
step_merge = make_step_result(9, 0, 0)         # 合并 9 条全部成功

steps = [step_pull, step_loop, step_merge]
summary = make_pipeline_summary(steps)
sev = summary["partial_severity"]
assert_eq(sev["severity"], "WARNING", "pipeline severity")
assert_eq(sev["total_failed"], 1, "total failed")
assert "1/10" in sev["step_severities"][1]["label"], f"step label: {sev['step_severities'][1]['label']}"

# === Case B: 高失败率 - 60% 失败（CRITICAL）===
print()
print("=" * 60)
print("Case B: 10 pending, 7 Offer fail (70% 失败 -> CRITICAL)")
print("=" * 60)
step_pull = make_step_result(10, 0, 0)
step_loop = make_step_result(10, 7, 0)
step_merge = make_step_result(3, 0, 0)

steps = [step_pull, step_loop, step_merge]
summary = make_pipeline_summary(steps)
sev = summary["partial_severity"]
assert_eq(sev["severity"], "CRITICAL", "pipeline severity (CRITICAL)")
assert_eq(sev["total_failed"], 7, "total failed")
# 验证告警文案
assert "严重失败" in sev["label"], f"label: {sev['label']}"

# === Case C: 多步骤混合 ===
print()
print("=" * 60)
print("Case C: 多步骤混合 - step1 1 fail, step2 0 fail")
print("=" * 60)
step1 = make_step_result(5, 1, 0)
step2 = make_step_result(4, 0, 0)
steps = [step1, step2]
summary = make_pipeline_summary(steps)
sev = summary["partial_severity"]
assert_eq(sev["severity"], "WARNING", "pipeline severity (任一 WARNING)")

# === Case D: 全成功 ===
print()
print("=" * 60)
print("Case D: 全成功")
print("=" * 60)
step1 = make_step_result(10, 0, 0)
step2 = make_step_result(10, 0, 0)
steps = [step1, step2]
summary = make_pipeline_summary(steps)
sev = summary["partial_severity"]
assert_eq(sev["severity"], "NONE", "pipeline severity (全 NONE)")

# === Case E: 业务预期失败（not_found）===
print()
print("=" * 60)
print("Case E: 5 pending, 0 fail, 3 not_found (业务预期失败)")
print("=" * 60)
step_pull = make_step_result(5, 0, 0)
step_loop = make_step_result(5, 0, 3)  # 3 个 Offer 未找到
step_merge = make_step_result(2, 0, 0)

steps = [step_pull, step_loop, step_merge]
summary = make_pipeline_summary(steps)
sev = summary["partial_severity"]
assert_eq(sev["severity"], "WARNING", "pipeline severity (not_found WARNING)")
assert "未找到" in sev["step_severities"][1]["label"], f"step label: {sev['step_severities'][1]['label']}"

# === Case F: 5/10 边界 ===
print()
print("=" * 60)
print("Case F: 5/10 失败 (50% 边界)")
print("=" * 60)
step = make_step_result(10, 5, 0)
summary = make_pipeline_summary([step])
sev = summary["partial_severity"]
assert_eq(sev["severity"], "WARNING", "pipeline severity (50% 边界 = WARNING)")

print()
print("=" * 60)
print("All 6 end-to-end PARTIAL scenarios passed")
print("=" * 60)
