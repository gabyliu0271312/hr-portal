"""工资费用类型 reference_lookup 双跑与切换门禁。

本模块只处理内存行，不访问数据库、不写 ODS/DWD、不控制事务。
旧 LOOKUP_FIELDS evaluator 由调用方注入，确保兼容期仍执行真实 Legacy 逻辑。
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Literal, Sequence

from app.mapping.dto import (
    MappingDocumentV1,
    MappingRuleSetV1,
    MatchRule,
    ReferenceLookupRule,
    ReferenceLookupRuleConfig,
    LookupConfig,
    UNMATCHED_SET_DEFAULT,
)
from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.executor import MappingExecutor
from app.mapping.policy import build_policy
from app.mapping.validator import MappingValidator

WAGE_SOURCE_ASSET = "emp_monthly_salary"
WAGE_TARGET_ASSET = "dwd_emp_monthly_salary"
WAGE_REFERENCE_DATASET = "emp_monthly_cost_class"
WAGE_TARGET_FIELD = "expense_type"
WAGE_RESULT_FIELD = "cost_classification"
WAGE_DEFAULT_VALUE = "工资"

WAGE_CATEGORY_EMPLOYEE = "employee_no_match"
WAGE_CATEGORY_CLIENT = "client_match"
WAGE_CATEGORY_DEFAULT = "default"
WAGE_CATEGORY_DUPLICATE = "duplicate_key"
WAGE_CATEGORY_EMPTY = "empty_value"
WAGE_CATEGORIES = (
    WAGE_CATEGORY_EMPLOYEE,
    WAGE_CATEGORY_CLIENT,
    WAGE_CATEGORY_DEFAULT,
    WAGE_CATEGORY_DUPLICATE,
    WAGE_CATEGORY_EMPTY,
)

WageRolloutMode = Literal["shadow", "gray", "rollback"]
LegacyEvaluator = Callable[[dict[str, Any], list[tuple[dict, dict]]], None] | None


class ReferenceLookupMap(dict):
    """保持旧 dict 接口，同时携带一次查询得到的原始参考行。"""

    def __init__(self, *args, reference_rows: Iterable[dict[str, Any]] = (), **kwargs):
        super().__init__(*args, **kwargs)
        self.reference_rows = [dict(row) for row in reference_rows]


@dataclass(frozen=True)
class WageReferenceWarning:
    code: str
    key: tuple[str, str]
    message: str


@dataclass
class WageReferenceSnapshot:
    data: dict[str, dict[tuple[str, str], dict[str, Any]]]
    warnings: list[WageReferenceWarning] = field(default_factory=list)
    duplicate_keys: set[tuple[str, str]] = field(default_factory=set)
    empty_result_keys: set[tuple[str, str]] = field(default_factory=set)


@dataclass(frozen=True)
class WageRowDiff:
    businessKey: dict[str, Any]
    category: str
    matchPath: str
    legacyValue: Any
    componentValue: Any
    same: bool


@dataclass
class WageDualRunReport:
    mode: WageRolloutMode
    componentPercent: int
    selectedEvaluator: str
    total: int
    same: int
    different: int
    componentRows: int
    legacyRows: int
    categoryCounts: dict[str, int]
    diffs: list[WageRowDiff]
    warnings: list[WageReferenceWarning]
    publishBlocked: bool = False
    blockCode: str | None = None
    blockReason: str | None = None

    def to_log_dict(self) -> dict[str, Any]:
        """只输出计数和稳定错误码，禁止把完整工资 payload 写日志。"""
        return {
            "mode": self.mode,
            "component_percent": self.componentPercent,
            "selected_evaluator": self.selectedEvaluator,
            "total": self.total,
            "same": self.same,
            "different": self.different,
            "component_rows": self.componentRows,
            "legacy_rows": self.legacyRows,
            "category_counts": dict(self.categoryCounts),
            "warning_count": len(self.warnings),
            "publish_blocked": self.publishBlocked,
            "block_code": self.blockCode,
        }


@dataclass
class WageDualRunOutcome:
    selectedRows: list[dict[str, Any]]
    legacyRows: list[dict[str, Any]]
    componentRows: list[dict[str, Any]]
    report: WageDualRunReport


def build_wage_mapping_document(
    rule_config: dict[str, Any] | None = None,
    *,
    source_asset: str = WAGE_SOURCE_ASSET,
    target_asset: str = WAGE_TARGET_ASSET,
    source_fields: Sequence[str] = ("employee_no", "client"),
    target_field: str = WAGE_TARGET_FIELD,
) -> MappingDocumentV1:
    """B0501: 从 standardization_rules 的配置生成公共 wage reference_lookup DTO。

    不复制规则正文：调用方传入的 ``rule_config`` 仍来自权威
    ``standardization_rules``；缺省配置仅用于兼容旧调用和单元测试。
    """
    config = rule_config or {}
    raw_rules = config.get("rules") or [
        {
            "id": "employee-no-first",
            "priority": 10,
            "source_field": "employee_no",
            "reference_field": "value",
            "conditions": {"field_type": "工号"},
        },
        {
            "id": "client-second",
            "priority": 20,
            "source_field": "client",
            "reference_field": "value",
            "conditions": {"field_type": "甲方"},
        },
    ]
    match_rules = [
        MatchRule(
            id=str(item.get("id", index)),
            priority=int(item.get("priority", index * 10)),
            sourceField=item.get("source_field", item.get("src_field", "")),
            referenceField=item.get("reference_field", config.get("value_col", "value")),
            conditions=dict(item.get("conditions") or ({"field_type": item["match_type"]} if item.get("match_type") else {})),
            onMatch=item.get("on_match", "use_and_stop"),
        )
        for index, item in enumerate(raw_rules)
    ]
    output_target = config.get("target", target_field)
    result_field = config.get("result_col", WAGE_RESULT_FIELD)
    return MappingDocumentV1(
        ruleSet=MappingRuleSetV1(
            code="wage_expense_type_v1",
            name="工资费用类型",
            sourceAsset=source_asset,
            targetAsset=target_asset,
            rules=[
                ReferenceLookupRule(
                    id="wage-expense-type-reference-lookup",
                    displayOrder=10,
                    sourceFields=list(source_fields),
                    targetFields=[output_target],
                    config=ReferenceLookupRuleConfig(
                        lookupConfigs=[
                            LookupConfig(
                                id=match_rule.id,
                                priority=match_rule.priority,
                                referenceDatasetId=config.get("lookup_table", WAGE_REFERENCE_DATASET),
                                sourceField=match_rule.sourceField,
                                referenceMatchField=match_rule.referenceField,
                                referenceReturnField=result_field,
                                targetField=output_target,
                                conditions=dict(match_rule.conditions),
                            )
                            for match_rule in match_rules
                        ],
                        referenceDatasetId=config.get("lookup_table", WAGE_REFERENCE_DATASET),
                        outputMap={output_target: result_field},
                        matchRules=match_rules,
                        unmatched=config.get("unmatched", UNMATCHED_SET_DEFAULT),
                        defaultValue=config.get("default", WAGE_DEFAULT_VALUE),
                    ),
                )
            ],
        )
    )


def build_wage_reference_snapshot(
    reference_rows: Sequence[dict[str, Any]],
    *,
    type_field: str = "field_type",
    value_field: str = "value",
    result_field: str = WAGE_RESULT_FIELD,
) -> WageReferenceSnapshot:
    """批量参考行转 Executor 快照；同结果重复 warning，异结果冲突阻断。"""
    values_by_key: dict[tuple[str, str], list[Any]] = {}
    empty_result_keys: set[tuple[str, str]] = set()

    for row in reference_rows:
        type_value = row.get(type_field)
        lookup_value = row.get(value_field)
        if type_value in (None, "") or lookup_value in (None, ""):
            continue
        key = (str(type_value), str(lookup_value))
        result = row.get(result_field)
        if result in (None, ""):
            empty_result_keys.add(key)
            continue
        values_by_key.setdefault(key, []).append(result)

    data: dict[tuple[str, str], dict[str, Any]] = {}
    warnings: list[WageReferenceWarning] = []
    duplicate_keys: set[tuple[str, str]] = set()

    for key, values in values_by_key.items():
        unique_values = []
        for value in values:
            if value not in unique_values:
                unique_values.append(value)
        if len(unique_values) > 1:
            raise MappingException(
                MappingErrorCode.MAPPING_LOOKUP_CONFLICT,
                "工资费用类型参考键存在多个不同结果，禁止发布或灰度切换",
                details={"referenceKey": list(key), "resultCount": len(unique_values)},
            )
        if len(values) > 1:
            duplicate_keys.add(key)
            warnings.append(WageReferenceWarning(
                code=MappingErrorCode.MAPPING_LOOKUP_DUPLICATE_KEY.value,
                key=key,
                message="参考键重复但结果相同，保留单一结果并记录 warning",
            ))
        data[key] = {result_field: unique_values[0]}

    for key in sorted(empty_result_keys):
        warnings.append(WageReferenceWarning(
            code=MappingErrorCode.MAPPING_LOOKUP_NO_MATCH.value,
            key=key,
            message="参考键结果为空，公共 Executor 将继续匹配下一优先级或使用默认值",
        ))

    return WageReferenceSnapshot(
        data={WAGE_REFERENCE_DATASET: data},
        warnings=warnings,
        duplicate_keys=duplicate_keys,
        empty_result_keys=empty_result_keys,
    )


def extract_wage_reference_rows(
    lookup_maps: list[tuple[dict, dict]],
) -> list[dict[str, Any]]:
    """从兼容 lookup_maps 中取同批预加载的原始参考行，不触发第二次查询。"""
    for cfg, lookup_map in lookup_maps:
        if (
            cfg.get("target") == WAGE_TARGET_FIELD
            and cfg.get("lookup_table") == WAGE_REFERENCE_DATASET
        ):
            raw_rows = getattr(lookup_map, "reference_rows", None)
            if raw_rows is not None:
                return [dict(row) for row in raw_rows]
            return [
                {
                    cfg.get("type_col", "field_type"): key[0],
                    cfg.get("value_col", "value"): key[1],
                    cfg.get("result_col", WAGE_RESULT_FIELD): value,
                }
                for key, value in lookup_map.items()
            ]
    return []


def _business_key(row: dict[str, Any], fields: Sequence[str]) -> dict[str, Any]:
    return {field: row.get(field) for field in fields}


def _business_key_token(row: dict[str, Any], fields: Sequence[str]) -> str:
    return json.dumps(_business_key(row, fields), ensure_ascii=False, sort_keys=True, default=str)


def _component_bucket(row: dict[str, Any], fields: Sequence[str]) -> int:
    digest = hashlib.sha256(_business_key_token(row, fields).encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _classify_row(
    row: dict[str, Any],
    snapshot: WageReferenceSnapshot,
) -> tuple[str, str]:
    data = snapshot.data[WAGE_REFERENCE_DATASET]
    employee = row.get("employee_no")
    client = row.get("client")
    employee_key = ("工号", str(employee)) if employee not in (None, "") else None
    client_key = ("甲方", str(client)) if client not in (None, "") else None

    if employee_key and employee_key in data:
        category = WAGE_CATEGORY_DUPLICATE if employee_key in snapshot.duplicate_keys else WAGE_CATEGORY_EMPLOYEE
        return category, WAGE_CATEGORY_EMPLOYEE
    if client_key and client_key in data:
        category = WAGE_CATEGORY_DUPLICATE if client_key in snapshot.duplicate_keys else WAGE_CATEGORY_CLIENT
        return category, WAGE_CATEGORY_CLIENT
    if employee in (None, "") and client in (None, ""):
        return WAGE_CATEGORY_EMPTY, WAGE_CATEGORY_DEFAULT
    return WAGE_CATEGORY_DEFAULT, WAGE_CATEGORY_DEFAULT


def _blocked_report(
    *,
    mode: WageRolloutMode,
    percent: int,
    rows: Sequence[dict[str, Any]],
    code: MappingErrorCode,
    reason: str,
) -> WageDualRunReport:
    return WageDualRunReport(
        mode=mode,
        componentPercent=percent,
        selectedEvaluator="legacy",
        total=len(rows),
        same=0,
        different=0,
        componentRows=0,
        legacyRows=len(rows),
        categoryCounts={category: 0 for category in WAGE_CATEGORIES},
        diffs=[],
        warnings=[],
        publishBlocked=True,
        blockCode=code.value,
        blockReason=reason,
    )


async def run_wage_dual_run(
    rows: Sequence[dict[str, Any]],
    lookup_maps: list[tuple[dict, dict]],
    *,
    business_key_fields: Sequence[str],
    legacy_evaluator: LegacyEvaluator = None,
    mode: WageRolloutMode = "shadow",
    component_percent: int = 0,
    component_document: MappingDocumentV1 | None = None,
) -> WageDualRunOutcome:
    """同一批工资行运行真实 Legacy evaluator 与公共 MappingExecutor。

    shadow: 计算两套结果，继续使用 Legacy。
    gray: 仅在零差异、无参考冲突时，按稳定业务键灰度选择 Component。
    rollback: 计算两套结果但强制使用 Legacy，作为立即回滚路径。
    """
    if mode not in {"shadow", "gray", "rollback"}:
        raise ValueError(f"不支持的工资映射模式: {mode}")
    if not business_key_fields:
        raise ValueError("工资双跑必须提供稳定业务主键字段")
    percent = max(0, min(int(component_percent), 100))

    clean_rows = []
    for row in rows:
        copied = dict(row)
        copied.pop(WAGE_TARGET_FIELD, None)
        clean_rows.append(copied)

    legacy_rows = [dict(row) for row in clean_rows]
    if legacy_evaluator is not None:
        for row in legacy_rows:
            legacy_evaluator(row, lookup_maps)

    reference_rows = extract_wage_reference_rows(lookup_maps)
    try:
        snapshot = build_wage_reference_snapshot(reference_rows)
    except MappingException as exc:
        report = _blocked_report(
            mode=mode,
            percent=percent,
            rows=clean_rows,
            code=exc.code,
            reason=exc.message,
        )
        if mode == "gray" and percent > 0:
            raise
        return WageDualRunOutcome(
            selectedRows=legacy_rows,
            legacyRows=legacy_rows,
            componentRows=[],
            report=report,
        )

    document = component_document or build_wage_mapping_document()
    policy = build_policy(
        "warehouse",
        source_asset_id=WAGE_SOURCE_ASSET,
        source_field_ids=["employee_no", "client", *business_key_fields],
        target_asset_id=WAGE_TARGET_ASSET,
        target_field_ids=[WAGE_TARGET_FIELD],
        allowed_reference_datasets=[WAGE_REFERENCE_DATASET],
        allowed_reference_fields=["field_type", "value", WAGE_RESULT_FIELD],
    )
    MappingValidator().validate(document, policy)
    component_result = await MappingExecutor().execute(
        document,
        clean_rows,
        reference_snapshot=snapshot.data,
        policy=policy,
    )
    if component_result.errors or len(component_result.outputRows) != len(clean_rows):
        raise MappingException(
            MappingErrorCode.MAPPING_LOOKUP_CONFLICT,
            "工资公共映射执行未返回完整行集，禁止切换",
            details={"input": len(clean_rows), "output": len(component_result.outputRows)},
        )
    component_rows = component_result.outputRows

    diffs: list[WageRowDiff] = []
    categories = Counter({category: 0 for category in WAGE_CATEGORIES})
    same_count = 0
    for source, legacy, component in zip(clean_rows, legacy_rows, component_rows, strict=True):
        category, match_path = _classify_row(source, snapshot)
        categories[category] += 1
        legacy_value = legacy.get(WAGE_TARGET_FIELD)
        component_value = component.get(WAGE_TARGET_FIELD)
        same = legacy_value == component_value
        same_count += int(same)
        diffs.append(WageRowDiff(
            businessKey=_business_key(source, business_key_fields),
            category=category,
            matchPath=match_path,
            legacyValue=legacy_value,
            componentValue=component_value,
            same=same,
        ))

    different = len(clean_rows) - same_count
    if mode == "gray" and percent > 0 and different:
        raise MappingException(
            MappingErrorCode.MAPPING_LOOKUP_CONFLICT,
            "工资新旧 evaluator 存在未解释差异，禁止灰度切换",
            details={"different": different, "total": len(clean_rows)},
        )

    selected_rows: list[dict[str, Any]] = []
    component_selected = 0
    if mode == "gray" and percent > 0:
        for source, legacy, component in zip(clean_rows, legacy_rows, component_rows, strict=True):
            if _component_bucket(source, business_key_fields) < percent:
                selected_rows.append(dict(component))
                component_selected += 1
            else:
                selected_rows.append(dict(legacy))
        selected_evaluator = "component" if percent == 100 else "mixed"
    else:
        selected_rows = [dict(row) for row in legacy_rows]
        selected_evaluator = "legacy"

    report = WageDualRunReport(
        mode=mode,
        componentPercent=percent,
        selectedEvaluator=selected_evaluator,
        total=len(clean_rows),
        same=same_count,
        different=different,
        componentRows=component_selected,
        legacyRows=len(clean_rows) - component_selected,
        categoryCounts=dict(categories),
        diffs=diffs,
        warnings=snapshot.warnings,
        publishBlocked=different > 0,
        blockCode=(MappingErrorCode.MAPPING_LOOKUP_CONFLICT.value if different else None),
        blockReason=("新旧 evaluator 存在差异" if different else None),
    )
    return WageDualRunOutcome(
        selectedRows=selected_rows,
        legacyRows=legacy_rows,
        componentRows=component_rows,
        report=report,
    )
