"""MappingExecutor - 纯映射执行内核"""

from __future__ import annotations

from typing import Any, Optional

from app.mapping.dto import (
    MappingDocumentV1, MappingResultV1, MappingTraceEntry, MappingStats, MappingError,
)
from app.mapping.policy import MappingCallerPolicyV1
from app.mapping.errors import MappingException
from app.mapping.mask import mask_value
from app.mapping.rule_registry import get_registry
from app.mapping import rules as _rules  # noqa: F401 - 注册内置插件


class MappingExecutor:
    """纯映射执行器；规则实现只能通过唯一 Registry 调度。"""

    async def preview(
        self,
        document: MappingDocumentV1,
        rows: list[dict[str, Any]],
        reference_snapshot: Optional[dict[str, dict[tuple, Any]]] = None,
        policy: Optional[MappingCallerPolicyV1] = None,
    ) -> MappingResultV1:
        return self._run(document, rows, reference_snapshot, policy, redact_output=True)

    async def execute(
        self,
        document: MappingDocumentV1,
        rows: list[dict[str, Any]],
        reference_snapshot: Optional[dict[str, dict[tuple, Any]]] = None,
        policy: Optional[MappingCallerPolicyV1] = None,
    ) -> MappingResultV1:
        return self._run(document, rows, reference_snapshot, policy)

    def _run(
        self,
        document: MappingDocumentV1,
        rows: list[dict[str, Any]],
        reference_snapshot: Optional[dict[str, dict[tuple, Any]]],
        policy: Optional[MappingCallerPolicyV1],
        *,
        redact_output: bool = False,
    ) -> MappingResultV1:
        rules = sorted(
            [rule for rule in document.ruleSet.rules if rule.enabled],
            key=lambda rule: rule.displayOrder,
        )
        sensitive_fields = policy.sensitive_field_ids() if policy else set()
        output_rows: list[dict[str, Any]] = []
        trace: list[MappingTraceEntry] = []
        errors: list[MappingError] = []
        stats = MappingStats(input=len(rows))

        for row_idx, row in enumerate(rows):
            current = dict(row)
            has_error = False
            for rule in rules:
                try:
                    result = self._apply_rule(
                        rule, current, row_idx, reference_snapshot, trace, sensitive_fields
                    )
                    if result == "matched":
                        stats.matched += 1
                    elif result == "unmatched":
                        stats.unmatched += 1
                except MappingException as exc:
                    stats.errors += 1
                    errors.append(MappingError(
                        code=exc.code.value,
                        message=exc.message,
                        rowIndex=row_idx,
                        ruleId=rule.id,
                        field=exc.field,
                    ))
                    trace.append(MappingTraceEntry(
                        rowIndex=row_idx,
                        ruleId=rule.id,
                        outcome="error",
                        errorCode=exc.code.value,
                    ))
                    has_error = True
                    break
            if not has_error:
                output_rows.append(current)
                stats.output += 1

        if redact_output:
            output_rows = [self._redact_row(row, sensitive_fields) for row in output_rows]
            errors = [self._redact_error(error, sensitive_fields) for error in errors]
        return MappingResultV1(outputRows=output_rows, trace=trace, stats=stats, errors=errors)

    @staticmethod
    def _redact_row(row: dict[str, Any], sensitive_fields: set[str]) -> dict[str, Any]:
        return {key: mask_value(value) if key in sensitive_fields else value for key, value in row.items()}

    @staticmethod
    def _redact_error(error: MappingError, sensitive_fields: set[str]) -> MappingError:
        if error.field not in sensitive_fields:
            return error
        return MappingError(
            code=error.code,
            message="敏感字段处理失败",
            rowIndex=error.rowIndex,
            ruleId=error.ruleId,
            field=error.field,
        )

    @staticmethod
    def _apply_rule(
        rule,
        row: dict[str, Any],
        row_idx: int,
        reference_snapshot: Optional[dict[str, dict[tuple, Any]]],
        trace: list[MappingTraceEntry],
        sensitive_fields: set[str],
    ) -> str:
        plugin = get_registry().get(rule.type)
        if plugin is None:
            trace.append(MappingTraceEntry(
                rowIndex=row_idx,
                ruleId=rule.id,
                outcome="error",
                errorCode="UNKNOWN_RULE_TYPE",
            ))
            return "error"
        return plugin.apply(rule, row, row_idx, reference_snapshot, trace, sensitive_fields)
