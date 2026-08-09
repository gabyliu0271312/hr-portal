"""Built-in pure rule plugins for MappingExecutor."""

from __future__ import annotations

from typing import Any

from app.mapping.dto import (
    MappingRuleV1, MappingTraceEntry,
    RULE_TYPE_FIELD, RULE_TYPE_VALUE_MAP, RULE_TYPE_REFERENCE_LOOKUP,
    RULE_TYPE_IDENTITY_WITH_OVERRIDES, RULE_TYPE_TYPE_CONVERT, RULE_TYPE_FORMAT,
    RULE_TYPE_SPLIT_MERGE, ON_MATCH_USE_AND_STOP, ON_MATCH_CONTINUE,
    ON_MATCH_ONLY_FILL_EMPTY, UNMATCHED_SET_DEFAULT, UNMATCHED_SET_NULL,
    UNMATCHED_FLAG, UNMATCHED_REJECT, ON_ERROR_KEEP, ON_ERROR_SET_NULL,
    ON_ERROR_FLAG, ON_ERROR_REJECT,
)
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.mask import mask_value
from app.mapping.rule_registry import RulePlugin
from app.mapping.rules.common import build_reference_key, convert_type, format_value


def _trace(trace, rule, row_idx, outcome, *, before=None, after=None, reference_key=None, error_code=None):
    trace.append(MappingTraceEntry(
        rowIndex=row_idx, ruleId=rule.id, outcome=outcome, before=before,
        after=after, referenceKey=reference_key, errorCode=error_code,
    ))


class _Plugin:
    label = ""

    def validate(self, rule: MappingRuleV1) -> list[str]:
        return []


class FieldPlugin(_Plugin):
    rule_type = RULE_TYPE_FIELD
    label = "字段映射"

    def apply(self, rule, row, row_idx, reference_snapshot, trace, sensitive_fields):
        src = rule.sourceFields[0] if rule.sourceFields else ""
        tgt = rule.targetFields[0] if rule.targetFields else ""
        before = row.get(src)
        sensitive = src in sensitive_fields or tgt in sensitive_fields
        if src not in row:
            _trace(trace, rule, row_idx, "unmatched", before=mask_value(before) if sensitive else before)
            return "unmatched"
        row[tgt] = before
        if rule.config.mode == "rename" and src != tgt:
            del row[src]
        _trace(trace, rule, row_idx, "matched", before=mask_value(before) if sensitive else before, after=mask_value(row.get(tgt)) if sensitive else row.get(tgt))
        return "matched"


class ValueMapPlugin(_Plugin):
    rule_type = RULE_TYPE_VALUE_MAP
    label = "值映射"

    def apply(self, rule, row, row_idx, reference_snapshot, trace, sensitive_fields):
        cfg = rule.config
        src = rule.sourceFields[0] if rule.sourceFields else ""
        tgt = rule.targetFields[0] if rule.targetFields else src
        before = row.get(src)
        sensitive = src in sensitive_fields
        mapped = cfg.mappings.get(str(before)) if before is not None else None
        if mapped is not None:
            row[tgt] = mapped
            _trace(trace, rule, row_idx, "matched", before=mask_value(before) if sensitive else before, after=mask_value(mapped) if sensitive else mapped)
            return "matched"
        if cfg.unmatched == UNMATCHED_SET_DEFAULT:
            row[tgt] = cfg.defaultValue
        elif cfg.unmatched == UNMATCHED_SET_NULL:
            row[tgt] = None
        elif cfg.unmatched == UNMATCHED_FLAG:
            row[tgt] = before
            row[f"_unmapped_{tgt}"] = True
        elif cfg.unmatched == UNMATCHED_REJECT:
            raise MappingException(MappingErrorCode.MAPPING_VALUE_UNMAPPED, f"值 '{before}' 未在映射表中找到且策略为 reject", field=src)
        _trace(trace, rule, row_idx, "unmatched", before=mask_value(before) if sensitive else before)
        return "unmatched"


class ReferenceLookupPlugin(_Plugin):
    rule_type = RULE_TYPE_REFERENCE_LOOKUP
    label = "参考查找"

    def apply(self, rule, row, row_idx, reference_snapshot, trace, sensitive_fields):
        cfg = rule.config
        ref_data = (reference_snapshot or {}).get(cfg.referenceDatasetId, {})
        for match_rule in sorted(cfg.matchRules, key=lambda item: item.priority):
            source_value = row.get(match_rule.sourceField)
            if source_value is None or str(source_value).strip() == "":
                continue
            reference_key = build_reference_key(match_rule, source_value)
            result = ref_data.get(reference_key)
            if result is None:
                continue
            for output_field, reference_field in cfg.outputMap.items():
                if match_rule.onMatch == ON_MATCH_ONLY_FILL_EMPTY and row.get(output_field) not in (None, ""):
                    continue
                row[output_field] = result.get(reference_field) if isinstance(result, dict) else result
            sensitive = match_rule.sourceField in sensitive_fields
            _trace(trace, rule, row_idx, "matched", before=mask_value(source_value) if sensitive else source_value, reference_key=mask_value(reference_key) if sensitive else reference_key)
            if match_rule.onMatch == ON_MATCH_USE_AND_STOP:
                return "matched"
            if match_rule.onMatch in {ON_MATCH_CONTINUE, ON_MATCH_ONLY_FILL_EMPTY}:
                continue
        if cfg.unmatched == UNMATCHED_SET_DEFAULT:
            for output_field in cfg.outputMap:
                row.setdefault(output_field, cfg.defaultValue)
        elif cfg.unmatched == UNMATCHED_SET_NULL:
            for output_field in cfg.outputMap:
                row[output_field] = None
        elif cfg.unmatched == UNMATCHED_FLAG:
            for output_field in cfg.outputMap:
                row[f"_unmapped_{output_field}"] = True
        elif cfg.unmatched == UNMATCHED_REJECT:
            raise MappingException(MappingErrorCode.MAPPING_LOOKUP_NO_MATCH, "参考 Lookup 未命中且策略为 reject")
        _trace(trace, rule, row_idx, "unmatched")
        return "unmatched"


class IdentityWithOverridesPlugin(_Plugin):
    rule_type = RULE_TYPE_IDENTITY_WITH_OVERRIDES
    label = "默认映射与例外"

    def apply(self, rule, row, row_idx, reference_snapshot, trace, sensitive_fields):
        cfg = rule.config
        src = rule.sourceFields[0] if rule.sourceFields else ""
        tgt = rule.targetFields[0] if rule.targetFields else src
        before = row.get(src)
        sensitive = src in sensitive_fields
        if before is None:
            _trace(trace, rule, row_idx, "unmatched")
            return "unmatched"
        source_text = str(before)
        if source_text in cfg.overrides:
            row[tgt], outcome = cfg.overrides[source_text], "matched"
        elif cfg.defaultBehavior == "keep_source":
            if src != tgt:
                row[tgt] = before
            outcome = "matched"
        else:
            if cfg.unmatched == UNMATCHED_SET_DEFAULT:
                row[tgt] = cfg.overrides.get(source_text, source_text)
            elif cfg.unmatched == UNMATCHED_SET_NULL:
                row[tgt] = None
            elif cfg.unmatched == UNMATCHED_REJECT:
                raise MappingException(MappingErrorCode.MAPPING_VALUE_UNMAPPED, f"编码 '{source_text}' 未配置覆盖且策略为 reject", field=src)
            outcome = "unmatched"
        _trace(trace, rule, row_idx, outcome, before=mask_value(before) if sensitive else before, after=mask_value(row.get(tgt)) if sensitive else row.get(tgt))
        return outcome


class TypeConvertPlugin(_Plugin):
    rule_type = RULE_TYPE_TYPE_CONVERT
    label = "类型转换"

    def apply(self, rule, row, row_idx, reference_snapshot, trace, sensitive_fields):
        cfg = rule.config
        src = rule.sourceFields[0] if rule.sourceFields else ""
        tgt = rule.targetFields[0] if rule.targetFields else src
        before = row.get(src)
        sensitive = src in sensitive_fields
        try:
            converted = convert_type(before, cfg.targetType)
            row[tgt] = converted
            _trace(trace, rule, row_idx, "matched", before=mask_value(before) if sensitive else before, after=mask_value(converted) if sensitive else converted)
            return "matched"
        except (ValueError, TypeError) as exc:
            if cfg.onError == ON_ERROR_KEEP:
                row[tgt] = before
            elif cfg.onError == ON_ERROR_SET_NULL:
                row[tgt] = None
            elif cfg.onError == ON_ERROR_FLAG:
                row[tgt], row[f"_error_{tgt}"] = before, str(exc)
            elif cfg.onError == ON_ERROR_REJECT:
                raise MappingException(MappingErrorCode.MAPPING_TYPE_CONVERSION_FAILED, f"类型转换失败: {exc}", field=src)
            _trace(trace, rule, row_idx, "error", before=mask_value(before) if sensitive else before, error_code=MappingErrorCode.MAPPING_TYPE_CONVERSION_FAILED.value)
            return "error"


class FormatPlugin(_Plugin):
    rule_type = RULE_TYPE_FORMAT
    label = "格式化"

    def apply(self, rule, row, row_idx, reference_snapshot, trace, sensitive_fields):
        cfg = rule.config
        src = rule.sourceFields[0] if rule.sourceFields else ""
        tgt = rule.targetFields[0] if rule.targetFields else src
        before = row.get(src)
        sensitive = src in sensitive_fields
        try:
            formatted = format_value(before, cfg.formatType, cfg.options)
            row[tgt] = formatted
            _trace(trace, rule, row_idx, "matched", before=mask_value(before) if sensitive else before, after=mask_value(formatted) if sensitive else formatted)
            return "matched"
        except (ValueError, TypeError) as exc:
            if cfg.onError == ON_ERROR_KEEP:
                row[tgt] = before
            elif cfg.onError == ON_ERROR_SET_NULL:
                row[tgt] = None
            elif cfg.onError == ON_ERROR_FLAG:
                row[tgt], row[f"_error_{tgt}"] = before, str(exc)
            elif cfg.onError == ON_ERROR_REJECT:
                raise MappingException(MappingErrorCode.MAPPING_FORMAT_INVALID, f"格式转换失败: {exc}", field=src)
            _trace(trace, rule, row_idx, "error", error_code=MappingErrorCode.MAPPING_FORMAT_INVALID.value)
            return "error"


class SplitMergePlugin(_Plugin):
    rule_type = RULE_TYPE_SPLIT_MERGE
    label = "拆分合并"

    def apply(self, rule, row, row_idx, reference_snapshot, trace, sensitive_fields):
        cfg = rule.config
        if cfg.action == "split":
            src = rule.sourceFields[0] if rule.sourceFields else ""
            before = row.get(src)
            sensitive = src in sensitive_fields
            if before is None and cfg.nullBehavior == "keep_null":
                for target in rule.targetFields:
                    row[target] = None
                _trace(trace, rule, row_idx, "unmatched")
                return "unmatched"
            if before is not None:
                parts = str(before).split(cfg.delimiter)
                for index, target in enumerate(rule.targetFields):
                    row[target] = parts[index] if index < len(parts) else None
            _trace(trace, rule, row_idx, "matched", before=mask_value(before) if sensitive else before)
            return "matched"
        if cfg.action == "merge":
            source_values = [row.get(source) for source in rule.sourceFields]
            tgt = rule.targetFields[0] if rule.targetFields else ""
            sensitive = any(source in sensitive_fields for source in rule.sourceFields)
            if all(value is None for value in source_values) and cfg.nullBehavior == "keep_null":
                row[tgt] = None
                _trace(trace, rule, row_idx, "unmatched")
                return "unmatched"
            row[tgt] = cfg.delimiter.join(str(value) if value is not None else "" for value in source_values)
            _trace(trace, rule, row_idx, "matched", before=mask_value(source_values) if sensitive else source_values, after=mask_value(row.get(tgt)) if sensitive else row.get(tgt))
            return "matched"
        raise MappingException(MappingErrorCode.MAPPING_SPLIT_MERGE_INVALID, f"不支持的 action: {cfg.action}")


BUILTIN_PLUGINS: tuple[RulePlugin, ...] = (
    FieldPlugin(), ValueMapPlugin(), ReferenceLookupPlugin(), IdentityWithOverridesPlugin(),
    TypeConvertPlugin(), FormatPlugin(), SplitMergePlugin(),
)
