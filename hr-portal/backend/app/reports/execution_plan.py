from app.warehouse.schemas import ExecutionPlanIn, ExecutionPlanOut


def compile_execution_plan(
    dataset_id: int,
    payload: ExecutionPlanIn,
    *,
    allowed_fields: set[str],
    measures: set[str],
    approved_summary: bool = False,
    approved_measure_fields: set[str] | None = None,
    identifying_fields: set[str] | None = None,
) -> ExecutionPlanOut:
    issues: list[dict[str, str]] = []
    requested = set(payload.output_fields)
    personal_refs = set(payload.personal_fields) | set(payload.employee_keys)
    all_refs = (
        requested
        | set(payload.filters)
        | set(payload.group_by)
        | set(payload.order_by)
        | set(payload.aggregations)
        | personal_refs
    )
    unknown = sorted(all_refs - allowed_fields)
    if unknown:
        issues.append({"code": "plan_field_not_allowed", "message": "请求字段不在数据集输出白名单: " + ", ".join(unknown)})
    aggregate_requested = bool(payload.aggregations or payload.group_by)
    identifying = identifying_fields or set()
    approved_internal_measures = approved_measure_fields or set()
    allowed_count_keys = {
        field for field, aggregation in payload.aggregations.items()
        if aggregation == "count_distinct" and field in approved_internal_measures
        and field not in payload.group_by and field not in payload.filters and field not in payload.order_by
        and field not in personal_refs
    }
    locator_refs = ((requested - allowed_count_keys) | set(payload.group_by) | set(payload.order_by)) & identifying
    locator_refs |= (set(payload.aggregations) - allowed_count_keys) & identifying
    locator_refs |= (set(payload.filters) - allowed_count_keys) & identifying
    if aggregate_requested and (personal_refs or locator_refs):
        issues.append({"code": "personal_locator_requires_detail", "message": "个人定位字段不能通过汇总路径使用"})
    if aggregate_requested and set(payload.filters) & identifying:
        issues.append({"code": "personal_filter_requires_detail", "message": "个人定位筛选必须使用人员明细授权"})
    invalid_measures = sorted(set(payload.aggregations) - measures - allowed_count_keys)
    if invalid_measures:
        issues.append({"code": "aggregate_field_not_measure", "message": "只有批准度量可以聚合: " + ", ".join(invalid_measures)})
    if len(set(payload.group_by)) != len(payload.group_by):
        issues.append({"code": "duplicate_group_by", "message": "分组字段不可重复"})
    if payload.group_by and not payload.aggregations:
        issues.append({"code": "group_without_measure", "message": "分组查询必须声明批准度量"})
    if aggregate_requested and (
        not payload.aggregations or requested != set(payload.group_by) | set(payload.aggregations)
    ):
        issues.append({"code": "aggregate_projection_invalid", "message": "汇总输出只能包含分组维度和已聚合度量"})
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
