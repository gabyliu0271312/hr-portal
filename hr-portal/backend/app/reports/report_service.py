"""报表执行服务（可被 scheduler handler 和 router 共同调用）

提取自 reports/router.py run_report 逻辑，支持：
  - 定时任务调用（无 user 对象，用 triggered_by 字符串标识）
  - 手动运行调用（有 user 对象）

返回 (total_rows, run_url)，供 handler 使用。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.reports.models import Report
from app.reports.validation import ensure_valid_report_config, ensure_valid_report_field_references
from app.users.models import User


logger = logging.getLogger("reports.service")


def execution_fingerprint(report):
    import hashlib
    import json
    value = {"report_id": report.id, "dataset_id": report.dataset_id, "owner_id": report.owner_id,
             "scope_strategy": report.scope_strategy, "config": report.config}
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


async def require_authorized_report_readiness(report, user, db):
    from app.datasets.models import DataSet
    from app.datasets.router import _can_consume
    from app.datasets.authorization_contract import execution_readiness
    from app.warehouse.service.release_gate import check_dataset_release

    if user is None:
        raise HTTPException(403, detail={"code": "authorized_subject_required", "message": "缺少当前执行主体"})
    dataset = await db.get(DataSet, report.dataset_id)
    if dataset is None or not await _can_consume(user, dataset, db):
        raise HTTPException(403, detail={"code": "authorized_dataset_denied", "message": "当前数据集不可消费"})
    from sqlalchemy import select, or_, literal
    from app.push.models import PushTarget
    report_ids = select(Report.id).where(Report.dataset_id == report.dataset_id)
    from sqlalchemy import String, cast
    related_reports = report_ids.subquery()
    references = select(PushTarget.id).where(PushTarget.is_active.is_(True), or_(
        PushTarget.source_table.in_(select(literal("report:") + cast(related_reports.c.id, String))),
        (PushTarget.source_type == "report") & PushTarget.source_id.in_(
            select(cast(related_reports.c.id, String))),
        (PushTarget.source_type == "report") & PushTarget.source_id.in_(
            select(literal("report:") + cast(related_reports.c.id, String)))
    )).limit(1)
    if await db.scalar(references) is not None:
        raise HTTPException(409, detail={"code": "external_exports_not_isolated", "message": "关联数据集存在未隔离外部出口"})
    release = await check_dataset_release(db, report.dataset_id)
    readiness = await execution_readiness(db, report.dataset_id, user)
    if not (release.eligible and release.fields_eligible and release.authorization_verified
            and release.conversion_verified and readiness.eligible and readiness.runtime_enabled):
        raise HTTPException(409, detail={"code": "authorized_execution_not_ready", "message": "发布、转换或授权执行准入尚未通过"})
    return readiness


async def run_authorized_report_query(*, report, channel, **query):
    if getattr(report, "execution_version", None) != "authorized_v1":
        raise HTTPException(409, detail={"code": "execution_version_invalid", "message": "报表执行版本无效"})
    if channel not in {"run", "csv", "xlsx"}:
        raise HTTPException(409, detail={"code": "authorized_channel_not_supported", "message": "此渠道尚未获准使用新执行版本"})
    if query.get("dataset_id") != report.dataset_id:
        raise HTTPException(409, detail={"code": "execution_dataset_mismatch", "message": "报表与执行数据集不一致"})
    binding = getattr(report, "execution_binding", None)
    if (not isinstance(binding, dict) or binding.get("fingerprint") != execution_fingerprint(report)
            or type(binding.get("approved_by")) is not int or not binding.get("approved_at")
            or not isinstance(binding.get("reason"), str) or not binding["reason"].strip()):
        raise HTTPException(409, detail={"code": "execution_binding_invalid", "message": "报表执行绑定缺失或已失效"})
    readiness = await require_authorized_report_readiness(report, query.get("user"), query["db"])
    if (binding.get("contract_id") != readiness.contract_id
            or binding.get("contract_version") != readiness.contract_version):
        raise HTTPException(409, detail={"code": "execution_binding_stale", "message": "授权合同版本已变化，请重新批准"})
    from app.reports.config import ReportConfig
    try:
        config = ReportConfig(**report.config)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, detail={"code": "authorized_config_invalid", "message": "报表配置无效"}) from exc
    if config.aggregate:
        return await _execute_authorized_summary(report, channel, query, readiness)
    return await _execute_authorized_detail(report, channel, query, readiness)


async def _resolve_report_columns(config, dataset_id, outputs, db):
    """把报表列解析为数据集输出；支持 output_code、alias.column 和标准字段编码。"""
    from app.datasets.models import DatasetOutputField
    from sqlalchemy import select

    by_source = {}
    for output in outputs:
        for key in (output.output_code, f"{output.source_alias}.{output.source_column}"):
            by_source.setdefault(key, []).append(output)
    standard_to_output: dict[str, str] = {}
    ambiguous_semantic: set[str] = set()
    semantic_loaded = False

    async def load_semantic_map():
        nonlocal semantic_loaded
        if semantic_loaded:
            return
        semantic_loaded = True
        from app.data.models import StandardField, StandardFieldBinding, StandardFieldVersion
        semantic_rows = (await db.execute(
            select(DatasetOutputField.id, StandardField.field_code)
            .select_from(DatasetOutputField)
            .join(StandardFieldBinding, StandardFieldBinding.dataset_output_field_id == DatasetOutputField.id)
            .join(StandardFieldVersion, StandardFieldVersion.id == StandardFieldBinding.standard_field_version_id)
            .join(StandardField, StandardField.id == StandardFieldVersion.standard_field_id)
            .where(DatasetOutputField.dataset_id == dataset_id,
                   StandardFieldBinding.status == "confirmed",
                   StandardFieldVersion.status == "active")
        )).all()
        outputs_by_id = {output.id: output for output in outputs}
        for output_id, field_code in semantic_rows:
            output = outputs_by_id.get(output_id)
            if output is None:
                continue
            if field_code in standard_to_output and standard_to_output[field_code] != output.output_code:
                ambiguous_semantic.add(field_code)
            standard_to_output.setdefault(field_code, output.output_code)

    selected = []
    for column in config.columns:
        candidates = {row.id: row for row in by_source.get(column.source_code, [])}
        if not candidates:
            await load_semantic_map()
            target_code = standard_to_output.get(column.source_code)
            if column.source_code in ambiguous_semantic or target_code is None:
                candidates = {}
            else:
                candidates = {row.id: row for row in by_source.get(target_code, [])}
        if len(candidates) != 1:
            raise HTTPException(422, detail={"code": "authorized_output_unresolved", "message": "报表字段不属于唯一批准输出"})
        selected.append((column, next(iter(candidates.values()))))
    return selected


async def _compile_authorized_summary_plan(report, readiness, user, db, page=1, page_size=50):
    from app.datasets.models import DataProductAuthorizationContract, DatasetOutputField
    from app.datasets.d_execution import SExecutionBindingIn, compile_allocation_fact_s_result_statements_for_user
    from app.reports.config import ReportConfig
    from app.warehouse.schemas import ExecutionPlanIn
    from sqlalchemy import select

    try:
        config = ReportConfig(**report.config)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, detail={"code": "authorized_config_invalid", "message": "报表配置无效"}) from exc
    unsupported = (config.filters or config.sorts or config.value_rules or config.filter_logic
        or config.transpose or config.rounding_corrections or config.list_lookup
        or config.dimension_merge_rules or config.default_split_rule or not config.aggregate)
    unsupported_settings = any(set(setting) - {"display_name", "hidden", "display_format"}
                               for setting in config.column_settings.values())
    if unsupported or unsupported_settings:
        raise HTTPException(422, detail={"code": "authorized_config_unsupported", "message": "新执行版本暂不支持当前筛选、排序或派生配置"})
    outputs = (await db.execute(select(DatasetOutputField).where(
        DatasetOutputField.dataset_id == report.dataset_id))).scalars().all()
    selected = await _resolve_report_columns(config, report.dataset_id, outputs, db)
    if len({output.output_code for _, output in selected}) != len(selected):
        raise HTTPException(422, detail={"code": "authorized_instances_unsupported", "message": "新执行版本不支持重复字段实例"})
    aggregate_by_output = {}
    for instance, output in selected:
        if instance.instance_id in config.aggregations:
            aggregate_by_output[output.output_code] = config.aggregations[instance.instance_id]
    if set(config.aggregations) - {instance.instance_id for instance, _ in selected}:
        raise HTTPException(422, detail={"code": "authorized_aggregation_invalid", "message": "聚合引用不属于报表输出"})
    try:
        plan = ExecutionPlanIn(output_fields=[output.output_code for _, output in selected],
            group_by=[output.output_code for _, output in selected if output.output_code not in aggregate_by_output],
            aggregations=aggregate_by_output)
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "authorized_plan_invalid", "message": "报表聚合计划无效"}) from exc
    row = await db.get(DataProductAuthorizationContract, readiness.contract_id)
    if row is None or row.status != "active" or row.dataset_id != report.dataset_id or row.contract_version != readiness.contract_version:
        raise HTTPException(409, detail={"code": "execution_contract_invalid", "message": "授权合同不可用"})
    snapshot = {"id": row.id, "dataset_id": row.dataset_id, "contract_version": row.contract_version,
                "status": row.status, "contract_json": row.contract_json, "model_snapshot": row.model_snapshot}
    request = SExecutionBindingIn(dataset_id=report.dataset_id, contract_id=row.id,
        contract_version=row.contract_version, plan=plan)
    statements, issues = await compile_allocation_fact_s_result_statements_for_user(
        contract=snapshot, request=request, user=user, db=db, page=page, page_size=page_size)
    if issues:
        denied = any(issue["code"] in {"s_execution_scope_denied", "s_execution_hidden_field_forbidden"} for issue in issues)
        raise HTTPException(403 if denied else 409, detail={
            "code": "authorized_query_denied" if denied else "authorized_query_blocked", "message": "当前授权或查询配置不满足执行条件"})
    return config, selected, aggregate_by_output, statements


async def validate_authorized_report_plan(*, report, readiness, user, db):
    from app.reports.config import ReportConfig
    try:
        config = ReportConfig(**report.config)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, detail={"code": "authorized_config_invalid", "message": "报表配置无效"}) from exc
    if config.aggregate:
        await _compile_authorized_summary_plan(report, readiness, user, db)
    else:
        await _compile_authorized_detail_plan(report, readiness, user, db)


async def _execute_authorized_summary(report, channel, query, readiness):
    if query.get("filters") or query.get("sorts"):
        raise HTTPException(422, detail={"code": "authorized_config_unsupported", "message": "新执行版本暂不支持当前筛选、排序或派生配置"})
    config, selected, aggregate_by_output, statements = await _compile_authorized_summary_plan(
        report, readiness, query["user"], query["db"],
        page=query.get("page", 1), page_size=query.get("page_size", 50))
    total = await query["db"].scalar(statements["count"])
    rows = (await query["db"].execute(statements["preview"] if channel == "run" else statements["export"])).mappings().all()
    from datetime import date, datetime
    from decimal import Decimal
    def serialize(value):
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, (date, datetime)):
            return value.isoformat()
        return value
    columns = [{"code": instance.instance_id, "source_code": instance.source_code,
                "label": instance.label or output.output_label,
                "data_type": "number" if aggregate_by_output.get(output.output_code) in {"sum", "avg", "count", "count_distinct"} else output.data_type,
                "is_sensitive": output.is_sensitive} for instance, output in selected]
    items = [{instance.instance_id: serialize(result[output.output_code]) for instance, output in selected} for result in rows]
    if query.get("warnings_sink") is not None:
        query["warnings_sink"].append("当前授权范围内汇总：人员范围与获准成本中心范围合并")
    return columns, items, total


async def _compile_authorized_detail_plan(report, readiness, user, db, page=1, page_size=50):
    from app.datasets.models import DataProductAuthorizationContract, DatasetOutputField
    from app.datasets.d_execution import DExecutionBindingIn, compile_allocation_fact_d_result_statements_for_user
    from app.datasets.authorization_contract import ProductAuthorizationDefinition
    from app.reports.config import ReportConfig
    from app.warehouse.schemas import ExecutionPlanIn
    from sqlalchemy import select

    try:
        config = ReportConfig(**report.config)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, detail={"code": "authorized_config_invalid", "message": "报表配置无效"}) from exc
    unsupported = (config.filters or config.sorts or config.value_rules or config.filter_logic
        or config.transpose or config.rounding_corrections or config.list_lookup
        or config.dimension_merge_rules or config.default_split_rule or config.aggregate
        or config.aggregations)
    unsupported_settings = any(set(setting) - {"display_name", "hidden", "display_format"}
                               for setting in config.column_settings.values())
    if unsupported or unsupported_settings:
        raise HTTPException(422, detail={"code": "authorized_config_unsupported", "message": "新执行版本暂不支持当前筛选、排序或派生配置"})
    outputs = (await db.execute(select(DatasetOutputField).where(
        DatasetOutputField.dataset_id == report.dataset_id))).scalars().all()
    selected = await _resolve_report_columns(config, report.dataset_id, outputs, db)
    if len({output.output_code for _, output in selected}) != len(selected):
        raise HTTPException(422, detail={"code": "authorized_instances_unsupported", "message": "新执行版本不支持重复字段实例"})
    row = await db.get(DataProductAuthorizationContract, readiness.contract_id)
    if (row is None or row.status != "active" or row.dataset_id != report.dataset_id
            or row.contract_version != readiness.contract_version):
        raise HTTPException(409, detail={"code": "execution_contract_invalid", "message": "授权合同不可用"})
    try:
        definition = ProductAuthorizationDefinition.model_validate(row.contract_json)
    except ValueError as exc:
        raise HTTPException(409, detail={"code": "execution_contract_invalid", "message": "授权合同定义无效"}) from exc
    planned = [output.output_code for _, output in selected]
    if not set(planned) <= set(definition.detail_output_fields):
        raise HTTPException(403, detail={"code": "authorized_detail_field_denied", "message": "字段不在合同明细白名单"})
    snapshot = {"id": row.id, "dataset_id": row.dataset_id, "contract_version": row.contract_version,
                "status": row.status, "contract_json": row.contract_json, "model_snapshot": row.model_snapshot}
    request = DExecutionBindingIn(dataset_id=report.dataset_id, contract_id=row.id,
        contract_version=row.contract_version, plan=ExecutionPlanIn(output_fields=planned))
    statements, issues = await compile_allocation_fact_d_result_statements_for_user(
        contract=snapshot, request=request, user=user, db=db, page=page, page_size=page_size)
    if issues:
        denied = any(issue["code"] in {"d_execution_scope_denied", "d_execution_hidden_field_forbidden",
                                       "d_execution_membership_unrestricted"} for issue in issues)
        raise HTTPException(403 if denied else 409, detail={
            "code": "authorized_detail_denied" if denied else "authorized_detail_blocked",
            "message": "当前授权或查询配置不满足明细执行条件"})
    return config, selected, statements


async def _execute_authorized_detail(report, channel, query, readiness):
    if query.get("filters") or query.get("sorts"):
        raise HTTPException(422, detail={"code": "authorized_config_unsupported", "message": "新执行版本暂不支持当前筛选、排序或派生配置"})
    config, selected, statements = await _compile_authorized_detail_plan(
        report, readiness, query["user"], query["db"],
        page=query.get("page", 1), page_size=query.get("page_size", 50))
    total = await query["db"].scalar(statements["count"])
    rows = (await query["db"].execute(statements["preview"] if channel == "run" else statements["export"])).mappings().all()
    from datetime import date, datetime
    from decimal import Decimal
    def serialize(value):
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, (date, datetime)):
            return value.isoformat()
        return value
    columns = [{"code": instance.instance_id, "source_code": instance.source_code,
                "label": instance.label or output.output_label,
                "data_type": output.data_type, "is_sensitive": output.is_sensitive}
               for instance, output in selected]
    items = [{instance.instance_id: serialize(result[output.output_code]) for instance, output in selected} for result in rows]
    if query.get("warnings_sink") is not None:
        query["warnings_sink"].append("当前授权范围内明细：仅人员范围，不含成本中心汇总")
    return columns, items, total


async def run_audited_dataset_query(*, channel, report_id=None, report=None, **query):
    if report is None and report_id is not None:
        report = await query["db"].get(Report, report_id)
        if report is None:
            raise HTTPException(404, detail="报表不存在")
    if (getattr(report, "execution_version", None) or "legacy_v1") != "legacy_v1":
        from app.reports.audit import record_authorized_scope_audit
        query_status = "failed"
        try:
            result = await run_authorized_report_query(report=report, channel=channel, **query)
            query_status = "success"
            return result
        finally:
            await record_authorized_scope_audit(user=query.get("user"), report=report,
                channel=channel, query_status=query_status)
    from app.reports.audit import record_scope_audit
    from app.reports.sql_builder import run_dataset_query

    decisions = []
    query_status = "failed"
    try:
        result = await run_dataset_query(**query, scope_decisions_sink=decisions)
        query_status = "success"
        return result
    finally:
        await record_scope_audit(
            user=query.get("user"), dataset_id=query["dataset_id"], report_id=report_id,
            channel=channel, query_status=query_status,
            requested_aggregate=query.get("aggregate", False), decisions=decisions,
        )


async def run_report_query(
    report: Report,
    db: AsyncSession,
    triggered_by: str = "cron",
    runtime_filters: list[dict[str, Any]] | None = None,
    period: str | None = None,
) -> tuple[int, str]:
    """执行报表查询，返回 (total_rows, run_url)。

    此函数不分页，返回总行数。适合定时任务场景。
    实际数据不需要返回，只记录运行结果。
    """
    from datetime import datetime
    from app.reports.config import ReportConfig
    from app.reports.runtime import apply_runtime_overrides, validate_runtime_filters
    if report.dataset_id is None:
        raise RuntimeError(f"报表 {report.id} 未绑定数据集")

    if report.owner_id is None:
        raise RuntimeError(f'报表 {report.id} 缺少创建人，无法按报表权限范围执行')
    owner = await db.get(User, report.owner_id)
    if owner is None:
        raise RuntimeError(f'报表 {report.id} 创建人不存在，无法执行')
    from app.datasets.models import DataSet
    from app.datasets.router import _can_consume
    dataset = await db.get(DataSet, report.dataset_id)
    if dataset is None or not await _can_consume(owner, dataset, db):
        raise RuntimeError(f'报表 {report.id} 绑定数据集当前不可消费')

    try:
        config_model = ReportConfig(**(report.config or {}))
    except ValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    validate_runtime_filters(config_model, runtime_filters)
    config_model = ensure_valid_report_config(apply_runtime_overrides(config_model, runtime_filters))
    if period:
        period_filters = [item for item in config_model.filters if item.column in {"period", "month", "pay_month"}]
        if len(period_filters) != 1:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="定时报表指定 period 时必须配置唯一的 period/month/pay_month 筛选条件",
            )
        period_filter = period_filters[0]
        if period_filter.locked:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="定时报表期间筛选不可锁定")
        config_model = ensure_valid_report_config(apply_runtime_overrides(
            config_model,
            [{"column": period_filter.column, "op": "eq", "value": period}],
        ))
    from app.reports.quality_gate import enforce_report_quality
    await enforce_report_quality(
        db,
        report_id=report.id,
        dataset_id=report.dataset_id,
        config=config_model,
        filters=config_model.filters,
        explicit_period=period,
        action="run",
    )
    await ensure_valid_report_field_references(config_model, report.dataset_id, owner, db, runtime_filters)
    config = config_model.model_dump()
    columns = config.get("columns", [])
    filters = config.get("filters", [])
    filter_logic = config.get("filter_logic")
    sorts = config.get("sorts", [])
    value_rules = config.get("value_rules", [])
    aggregate = config.get("aggregate", False)
    aggregations = config.get("aggregations", {})
    column_settings = config.get("column_settings", {})
    transpose = config.get("transpose", {})
    rounding_corrections = config.get("rounding_corrections", [])
    list_lookup = config.get("list_lookup", {})
    dimension_merge_rules = config.get("dimension_merge_rules", [])

    # 定时任务下使用 page_size=1 只获取 total，避免大量数据占内存
    warnings: list[str] = []
    _, _, total = await run_audited_dataset_query(
        channel="scheduled", report_id=report.id, report=report,
        dataset_id=report.dataset_id,
        columns=columns,
        filters=filters if isinstance(filters, list) else [],
        filter_logic=filter_logic,
        sorts=sorts if isinstance(sorts, list) else [],
        value_rules=value_rules if isinstance(value_rules, list) else [],
        aggregate=aggregate,
        aggregations=aggregations if isinstance(aggregations, dict) else {},
        column_settings=column_settings if isinstance(column_settings, dict) else {},
        transpose=transpose if isinstance(transpose, dict) else {},
        rounding_corrections=rounding_corrections if isinstance(rounding_corrections, list) else [],
        list_lookup=list_lookup if isinstance(list_lookup, dict) else {},
        dimension_merge_rules=dimension_merge_rules if isinstance(dimension_merge_rules, list) else [],
        page=1,
        page_size=1,
        user=owner,
        db=db,
        scope_strategy=report.scope_strategy,
        warnings_sink=warnings,
    )

    # 更新 last_run_at
    from datetime import datetime, UTC
    report.last_run_at = datetime.now(UTC)
    report.run_count = (report.run_count or 0) + 1

    run_url = f"/reports/{report.id}"
    logger.info("[report_service] report %d (%s) 执行完成 total=%d", report.id, report.name, total)
    return total, run_url
