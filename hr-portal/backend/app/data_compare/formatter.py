"""ResultFormatter — 将原始查询结果格式化为结构化对比报告。"""
from __future__ import annotations

from app.data_compare.schemas import (
    CompareResult,
    CompareResultSummary,
    CompareType,
)


def format_result(
    rows: list[dict],
    compare_type: CompareType,
    table_a_label: str,
    table_b_label: str,
    period_a: str | None,
    period_b: str | None,
    duration_ms: int | None = None,
    max_detail: int = 200,
    sensitive_columns: set[str] | None = None,
) -> CompareResult:
    """Format raw query rows into a structured CompareResult.

    max_detail controls how many detail rows are included in the result.

    sensitive_columns: set of output-column names whose values should be
    masked (replaced with "***") in the output details, to prevent
    leaking PII/敏感数据.  Must use output-column names (e.g.
    "salary_a", "amount_a"), NOT original column codes.
    """
    summary = CompareResultSummary(total_compared=len(rows))

    # Format first (before masking) so summary aggregation uses real values
    if compare_type == CompareType.ROSTER:
        _format_roster(rows, summary, table_a_label, table_b_label)
    elif compare_type == CompareType.FIELD:
        _format_field(rows, summary)
    elif compare_type == CompareType.AMOUNT:
        _format_amount(rows, summary)

    # Now mask sensitive columns in details AFTER summary aggregation
    effective_mask: set[str] = set(sensitive_columns or [])
    if compare_type == CompareType.AMOUNT:
        # If either amount column is sensitive, diff also reveals sensitive info
        if "amount_a" in effective_mask or "amount_b" in effective_mask:
            effective_mask.add("diff")

    if effective_mask:
        masked_rows = []
        for row in rows:
            masked = {
                k: "***" if k in effective_mask else v
                for k, v in row.items()
            }
            masked_rows.append(masked)
        rows = masked_rows

        # Also clear summary monetary fields if metric columns are sensitive
        if "amount_a" in (sensitive_columns or set()):
            summary.total_amount_a = None
        if "amount_b" in (sensitive_columns or set()):
            summary.total_amount_b = None
        if summary.total_amount_a is None or summary.total_amount_b is None:
            summary.amount_diff = None

    # Determine status
    if summary.diff_count == 0:
        status = "consistent"
    elif summary.diff_count / max(summary.total_compared, 1) > 0.3:
        status = "significant_diff"
    else:
        status = "partial_diff"

    conclusion = _build_conclusion(compare_type, summary, table_a_label, table_b_label)

    return CompareResult(
        compare_type=compare_type.value,
        table_a=table_a_label,
        table_b=table_b_label,
        period_a=period_a,
        period_b=period_b,
        status=status,
        summary=summary,
        details=rows[:max_detail],  # use spec-configured limit
        conclusion=conclusion,
        duration_ms=duration_ms,
    )


def _format_roster(
    rows: list[dict],
    summary: CompareResultSummary,
    table_a_label: str,
    table_b_label: str,
) -> None:
    summary.diff_count = len(rows)
    summary.matched_count = 0  # 名单对比中 rows 只有差异（FULL OUTER JOIN + WHERE IS NULL）
    summary.only_in_a_count = sum(
        1 for r in rows if table_a_label in str(r.get("diff_type", ""))
    )
    summary.only_in_b_count = sum(
        1 for r in rows if table_b_label in str(r.get("diff_type", ""))
    )
    summary.total_compared = summary.diff_count


def _format_field(rows: list[dict], summary: CompareResultSummary) -> None:
    summary.diff_count = len(rows)
    summary.total_compared = len(rows)


def _format_amount(rows: list[dict], summary: CompareResultSummary) -> None:
    diff_rows = [r for r in rows if r.get("status") != "一致"]
    summary.diff_count = len(diff_rows)
    summary.matched_count = len(rows) - summary.diff_count
    summary.total_compared = len(rows)

    # 汇总金额
    summary.total_amount_a = sum(
        (r.get("amount_a") or 0) for r in rows if r.get("amount_a") is not None
    )
    summary.total_amount_b = sum(
        (r.get("amount_b") or 0) for r in rows if r.get("amount_b") is not None
    )
    if summary.total_amount_a is not None and summary.total_amount_b is not None:
        summary.amount_diff = summary.total_amount_a - summary.total_amount_b


def _build_conclusion(
    compare_type: CompareType,
    summary: CompareResultSummary,
    table_a_label: str,
    table_b_label: str,
) -> str:
    if summary.diff_count == 0:
        return f"✅ {table_a_label} 与 {table_b_label} 数据完全一致。"

    parts: list[str] = []
    if compare_type == CompareType.ROSTER:
        parts.append(f"{table_a_label} 与 {table_b_label} 名单存在差异。")
        if summary.only_in_a_count:
            parts.append(f"仅在{table_a_label}中有 {summary.only_in_a_count} 人")
        if summary.only_in_b_count:
            parts.append(f"仅在{table_b_label}中有 {summary.only_in_b_count} 人")
    elif compare_type == CompareType.FIELD:
        parts.append(f"{table_a_label} 与 {table_b_label} 共 {summary.diff_count} 条字段不一致。")
    elif compare_type == CompareType.AMOUNT:
        parts.append(f"{table_a_label} 与 {table_b_label} 共 {summary.diff_count} 个维度金额不一致。")
        if summary.amount_diff is not None:
            parts.append(f"总差额: ¥{summary.amount_diff:,.2f}")

    return " ".join(parts)
