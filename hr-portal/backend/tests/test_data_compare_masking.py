"""回归测试：脱敏逻辑覆盖派生列名（P0 修复验证）"""
import pytest
from app.data_compare.formatter import format_result
from app.data_compare.schemas import CompareType


# ── Field 对比脱敏 ────────────────────────────────────────────────

class TestFieldSensitiveMasking:
    """字段对比：原始字段标记敏感 → 派生列名 {field}_a / {field}_b 应被脱敏"""

    def test_salary_sensitive_masks_both_a_and_b(self):
        rows = [
            {"employee_no": "E001", "salary_a": 10000, "salary_b": 12000, "diff_type": "字段不一致"},
            {"employee_no": "E002", "salary_a": 15000, "salary_b": 15000, "diff_type": "字段不一致"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.FIELD,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"salary_a", "salary_b"},
        )
        # 明细行中派生列应被脱敏
        assert result.details[0]["salary_a"] == "***"
        assert result.details[0]["salary_b"] == "***"
        # 非敏感列不受影响
        assert result.details[0]["employee_no"] == "E001"
        assert result.details[1]["salary_a"] == "***"
        assert result.details[1]["salary_b"] == "***"

    def test_non_sensitive_field_not_masked(self):
        rows = [
            {"employee_no": "E001", "salary_a": 10000, "bonus_a": 5000, "salary_b": 12000, "bonus_b": 5000},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.FIELD,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"salary_a", "salary_b"},
        )
        # salary 被脱敏
        assert result.details[0]["salary_a"] == "***"
        assert result.details[0]["salary_b"] == "***"
        # bonus 未标记敏感，不脱敏
        assert result.details[0]["bonus_a"] == 5000
        assert result.details[0]["bonus_b"] == 5000

    def test_only_field_a_sensitive(self):
        rows = [
            {"employee_no": "E001", "salary_a": 10000, "salary_b": 12000},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.FIELD,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"salary_a"},  # 只脱敏 field_a 侧
        )
        assert result.details[0]["salary_a"] == "***"
        assert result.details[0]["salary_b"] == 12000  # 不脱敏


# ── Amount 对比脱敏 ───────────────────────────────────────────────

class TestAmountSensitiveMasking:
    """金额对比：metric 字段标记敏感 → amount_a/amount_b 应被脱敏，summary 对应字段为 None"""

    def test_amount_a_sensitive_masks_amount_a_and_clears_summary(self):
        rows = [
            {"cost_center": "CC001", "amount_a": 100000, "amount_b": 120000, "diff": 20000, "status": "金额不一致"},
            {"cost_center": "CC002", "amount_a": 50000, "amount_b": 50000, "diff": 0, "status": "一致"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.AMOUNT,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"amount_a"},
        )
        # amount_a 被脱敏
        assert result.details[0]["amount_a"] == "***"
        # amount_b 未标记敏感，不脱敏
        assert result.details[0]["amount_b"] == 120000
        # summary: total_amount_a 应被清除（因为 amount_a 敏感）
        assert result.summary.total_amount_a is None
        # total_amount_b 仍有值（amount_b 不敏感）
        assert result.summary.total_amount_b is not None
        # amount_diff 应为 None（因为 total_amount_a 为 None）
        assert result.summary.amount_diff is None

    def test_both_amounts_sensitive_clears_summary_completely(self):
        rows = [
            {"cost_center": "CC001", "amount_a": 100000, "amount_b": 120000, "diff": 20000, "status": "金额不一致"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.AMOUNT,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"amount_a", "amount_b"},
        )
        assert result.details[0]["amount_a"] == "***"
        assert result.details[0]["amount_b"] == "***"

        # summary 应全部清除
        assert result.summary.total_amount_a is None
        assert result.summary.total_amount_b is None
        assert result.summary.amount_diff is None

    def test_amount_a_sensitive_also_masks_diff(self):
        """P0 验证：amount_a 敏感时，diff 列也应被脱敏（diff 由敏感金额计算得出）"""
        rows = [
            {"cost_center": "CC001", "amount_a": 100000, "amount_b": 120000, "diff": 20000, "status": "金额不一致"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.AMOUNT,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"amount_a"},  # 只标记 amount_a 敏感
        )
        # amount_a 被脱敏
        assert result.details[0]["amount_a"] == "***"
        # diff 由敏感金额计算得出，也应脱敏
        assert result.details[0]["diff"] == "***"
        # amount_b 未标记敏感，不脱敏
        assert result.details[0]["amount_b"] == 120000
        # summary: total_amount_a 清除，amount_diff 清除
        assert result.summary.total_amount_a is None
        assert result.summary.amount_diff is None
        # total_amount_b 仍有值
        assert result.summary.total_amount_b is not None

    def test_amount_b_sensitive_also_masks_diff(self):
        """P0 验证：amount_b 敏感时，diff 列也应被脱敏"""
        rows = [
            {"cost_center": "CC001", "amount_a": 100000, "amount_b": 120000, "diff": 20000, "status": "金额不一致"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.AMOUNT,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"amount_b"},
        )
        assert result.details[0]["amount_b"] == "***"
        assert result.details[0]["diff"] == "***"
        assert result.details[0]["amount_a"] == 100000  # 不脱敏

    def test_group_by_column_sensitive(self):
        """group_by 中的列如果敏感，也应被脱敏"""
        rows = [
            {"cost_center": "敏感成本中心", "amount_a": 100000, "amount_b": 120000, "diff": 20000, "status": "金额不一致"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.AMOUNT,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"cost_center"},
        )
        assert result.details[0]["cost_center"] == "***"
        assert result.details[0]["amount_a"] == 100000  # 未标记敏感


# ── Roster 对比脱敏 ──────────────────────────────────────────────

class TestRosterSensitiveMasking:
    """名单对比：join_key 标记敏感 → employee_no 应被脱敏"""

    def test_employee_no_sensitive(self):
        rows = [
            {"employee_no": "E001", "diff_type": "仅存在于表A"},
            {"employee_no": "E002", "diff_type": "仅存在于表B"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.ROSTER,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"employee_no"},
        )
        assert result.details[0]["employee_no"] == "***"
        assert result.details[1]["employee_no"] == "***"
        # diff_type 未标记敏感，不脱敏
        assert result.details[0]["diff_type"] == "仅存在于表A"

    def test_composite_key_sensitive(self):
        """P0 验证：roster 复合键中任一 key 敏感，输出列名本身应脱敏

        Engine output columns for composite keys are named after each join key,
        e.g. join_keys=["employee_no", "id_card_no"] → output has
        columns "employee_no" and "id_card_no".
        """
        # Simulating composite key output: both join keys appear as columns
        rows = [
            {"employee_no": "E001", "id_card_no": "350001199001011234", "diff_type": "仅存在于表A"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.ROSTER,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"id_card_no"},  # id_card_no 敏感
        )
        # id_card_no 应被脱敏
        assert result.details[0]["id_card_no"] == "***"
        # employee_no 未标记敏感，不脱敏
        assert result.details[0]["employee_no"] == "E001"

    def test_composite_key_both_sensitive(self):
        """复合键中两个 key 都敏感，两个输出列都应脱敏"""
        rows = [
            {"employee_no": "E001", "id_card_no": "350001199001011234", "diff_type": "仅存在于表A"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.ROSTER,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"employee_no", "id_card_no"},
        )
        assert result.details[0]["employee_no"] == "***"
        assert result.details[0]["id_card_no"] == "***"

    def test_roster_no_sensitive_columns(self):
        """没有敏感字段时，不脱敏"""
        rows = [
            {"employee_no": "E001", "diff_type": "仅存在于表A"},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.ROSTER,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns=None,
        )
        assert result.details[0]["employee_no"] == "E001"  # 不脱敏


# ── 边界情况 ──────────────────────────────────────────────────────

class TestSensitiveMaskingEdgeCases:
    """边界情况：空 rows、空 sensitive_columns"""

    def test_empty_rows(self):
        result = format_result(
            rows=[],
            compare_type=CompareType.FIELD,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"salary_a"},
        )
        assert result.summary.total_compared == 0
        assert result.details == []

    def test_sensitive_columns_not_in_rows(self):
        """sensitive_columns 中的列名不在 rows 中，不应报错"""
        rows = [
            {"employee_no": "E001", "salary_a": 10000},
        ]
        result = format_result(
            rows=rows,
            compare_type=CompareType.FIELD,
            table_a_label="表A",
            table_b_label="表B",
            period_a="202401",
            period_b="202401",
            sensitive_columns={"nonexistent_column"},
        )
        # 不应报错，且 salary_a 不脱敏
        assert result.details[0]["salary_a"] == 10000
