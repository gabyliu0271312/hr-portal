from fastapi import HTTPException

from app.warehouse.schemas import ExecutionPlanIn, ExecutionPlanOut


def compile_execution_plan(dataset_id: int, payload: ExecutionPlanIn, *, allowed_fields: set[str], measures: set[str], approved_summary: bool = False) -> ExecutionPlanOut:
    issues: list[dict[str, str]] = []
    requested = set(payload.output_fields)
    all_refs = requested | set(payload.filters) | set(payload.group_by) | set(payload.order_by) | set(payload.aggregations)
    unknown = sorted(all_refs - allowed_fields)
    if unknown:
        issues.append({"code": "plan_field_not_allowed", "message": "请求字段不在数据集输出白名单: " + ", ".join(unknown)})
    aggregate_requested = bool(payload.aggregations or payload.group_by)
    personal_refs = set(payload.personal_fields) | set(payload.employee_keys)
    if personal_refs and aggregate_requested:
        issues.append({"code": "personal_locator_requires_detail", "message": "个人定位字段不能通过汇总路径使用"})
    invalid_measures = sorted(set(payload.aggregations) - measures)
    if invalid_measures:
        issues.append({"code": "aggregate_field_not_measure", "message": "只有批准度量可以聚合: " + ", ".join(invalid_measures)})
    if len(set(payload.group_by)) != len(payload.group_by):
        issues.append({"code": "duplicate_group_by", "message": "分组字段不可重复"})
    if payload.group_by and not payload.aggregations:
        issues.append({"code": "group_without_measure", "message": "分组查询必须声明批准度量"})
    if issues:
        return ExecutionPlanOut(
            dataset_id=dataset_id, shape="blocked", detail_path="not_allowed", summary_path="not_allowed",
            output_fields=payload.output_fields, group_by=payload.group_by,
            aggregations=payload.aggregations, eligible=False, issues=issues,
        )
    if aggregate_requested:
        return ExecutionPlanOut(
            dataset_id=dataset_id, shape="summary", detail_path="not_allowed",
            summary_path="person_or_cost_center_scope" if approved_summary else "person_scope",
            output_fields=payload.output_fields, group_by=payload.group_by,
            aggregations=payload.aggregations, eligible=True, issues=[],
        )
    return ExecutionPlanOut(
        dataset_id=dataset_id, shape="detail", detail_path="person_scope", summary_path="not_allowed",
        output_fields=payload.output_fields, group_by=[], aggregations={}, eligible=True, issues=[],
    )
