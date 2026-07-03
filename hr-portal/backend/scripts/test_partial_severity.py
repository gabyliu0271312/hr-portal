"""Phase 2-3：PARTIAL_SUCCESS 严重度单元测试"""
import sys
sys.path.insert(0, '.')
sys.path.insert(0, '.venv/Lib/site-packages')

from app.ucp.pipeline_engine import (
    calculate_partial_severity,
    aggregate_pipeline_severity,
    PARTIAL_SEVERITY_NONE,
    PARTIAL_SEVERITY_WARNING,
    PARTIAL_SEVERITY_CRITICAL,
    PARTIAL_WARNING_THRESHOLD,
    PARTIAL_CRITICAL_THRESHOLD,
)


def assert_eq(actual, expected, label):
    if actual == expected:
        print(f"[OK] {label}: {actual}")
    else:
        print(f"[FAIL] {label}: expected={expected}, actual={actual}")
        raise AssertionError(label)


print("=" * 60)
print("Case 1: 全部成功 (10/10)")
print("=" * 60)
r = calculate_partial_severity(total=10, failed=0, not_found=0)
assert_eq(r["severity"], PARTIAL_SEVERITY_NONE, "severity")
assert_eq(r["failed_count"], 0, "failed_count")
assert_eq(r["failure_rate"], 0.0, "failure_rate")
assert_eq(r["success_count"], 10, "success_count")

print()
print("=" * 60)
print("Case 2: 仅 1 条失败 (1/10 = 10%)")
print("=" * 60)
r = calculate_partial_severity(total=10, failed=1, not_found=0)
assert_eq(r["severity"], PARTIAL_SEVERITY_WARNING, "severity")
assert_eq(r["failure_rate"], 0.1, "failure_rate")
assert "少量失败" in r["label"], f"label={r['label']}"

print()
print("=" * 60)
print("Case 3: 40% 失败 (4/10) - WARNING")
print("=" * 60)
r = calculate_partial_severity(total=10, failed=4, not_found=0)
assert_eq(r["severity"], PARTIAL_SEVERITY_WARNING, "severity")
assert_eq(r["failure_rate"], 0.4, "failure_rate")
assert "部分失败" in r["label"], f"label={r['label']}"

print()
print("=" * 60)
print("Case 4: 60% 失败 (6/10) - CRITICAL")
print("=" * 60)
r = calculate_partial_severity(total=10, failed=6, not_found=0)
assert_eq(r["severity"], PARTIAL_SEVERITY_CRITICAL, "severity")
assert_eq(r["failure_rate"], 0.6, "failure_rate")
assert "严重失败" in r["label"], f"label={r['label']}"

print()
print("=" * 60)
print("Case 5: 仅 not_found (3/10) - 业务预期失败，WARNING 不升级")
print("=" * 60)
r = calculate_partial_severity(total=10, failed=0, not_found=3)
assert_eq(r["severity"], PARTIAL_SEVERITY_WARNING, "severity")
assert_eq(r["not_found_count"], 3, "not_found_count")
assert "未找到" in r["label"], f"label={r['label']}"

print()
print("=" * 60)
print("Case 6: 50% 失败 (5/10) - 边界，WARNING（>50% 才算 CRITICAL）")
print("=" * 60)
r = calculate_partial_severity(total=10, failed=5, not_found=0)
assert_eq(r["severity"], PARTIAL_SEVERITY_WARNING, "severity (5/10 = 50% 边界)")

print()
print("=" * 60)
print("Case 6b: 60% 失败 (6/10) - CRITICAL")
print("=" * 60)
r = calculate_partial_severity(total=10, failed=6, not_found=0)
assert_eq(r["severity"], PARTIAL_SEVERITY_CRITICAL, "severity (6/10 = 60% > 50%)")

print()
print("=" * 60)
print("Case 7: 30% 失败 (3/10) - 边界，WARNING")
print("=" * 60)
r = calculate_partial_severity(total=10, failed=3, not_found=0)
assert_eq(r["severity"], PARTIAL_SEVERITY_WARNING, "severity")
assert_eq(r["failure_rate"], 0.3, "failure_rate")

print()
print("=" * 60)
print("Case 8: 全部失败 (10/10) - CRITICAL")
print("=" * 60)
r = calculate_partial_severity(total=10, failed=10, not_found=0)
assert_eq(r["severity"], PARTIAL_SEVERITY_CRITICAL, "severity")
assert_eq(r["success_count"], 0, "success_count")

print()
print("=" * 60)
print("Case 9: total=0 (空数据)")
print("=" * 60)
r = calculate_partial_severity(total=0, failed=0)
assert_eq(r["severity"], PARTIAL_SEVERITY_NONE, "severity")
assert_eq(r["total"], 0, "total")

print()
print("=" * 60)
print("聚合测试: 步骤级严重度 -> 流水线级")
print("=" * 60)
steps = [
    calculate_partial_severity(10, 0, 0),  # NONE
    calculate_partial_severity(10, 1, 0),  # WARNING
    calculate_partial_severity(10, 0, 0),  # NONE
]
agg = aggregate_pipeline_severity(steps)
assert_eq(agg["severity"], PARTIAL_SEVERITY_WARNING, "agg severity")
assert_eq(agg["total_failed"], 1, "agg total_failed")

steps2 = [
    calculate_partial_severity(10, 0, 0),
    calculate_partial_severity(10, 8, 0),  # CRITICAL
    calculate_partial_severity(10, 0, 0),
]
agg2 = aggregate_pipeline_severity(steps2)
assert_eq(agg2["severity"], PARTIAL_SEVERITY_CRITICAL, "agg2 severity (任一 CRITICAL 即 CRITICAL)")

steps3 = [calculate_partial_severity(10, 0, 0), calculate_partial_severity(10, 0, 0)]
agg3 = aggregate_pipeline_severity(steps3)
assert_eq(agg3["severity"], PARTIAL_SEVERITY_NONE, "agg3 severity (全 NONE)")

print()
print("=" * 60)
print("All 12 PARTIAL severity tests passed")
print("=" * 60)
print(f"  阈值: WARNING > {PARTIAL_WARNING_THRESHOLD*100:.0f}%, CRITICAL > {PARTIAL_CRITICAL_THRESHOLD*100:.0f}%")
