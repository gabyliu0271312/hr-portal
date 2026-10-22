from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.data.models import StandardFieldBinding, StandardFieldVersion, TableColumn
from app.datasets.models import DataSet, DataSetTable, DatasetOutputField, DataProductAuthorizationContract
from app.warehouse.schemas import DatasetReleaseIssueOut, DatasetReleaseReadinessOut
from app.warehouse.service.standard_fields import _physical_source_identity
from app.warehouse.service.standardization import _normalized_metadata_type, _physical_metadata_type


async def check_dataset_release(db, dataset_id: int, *, verify_conversion=True) -> DatasetReleaseReadinessOut:
    dataset = await db.get(DataSet, dataset_id)
    if dataset is None:
        raise HTTPException(404, detail={"code": "dataset_not_found", "message": "数据集不存在"})
    issues = []

    def issue(code, message, output=None):
        issues.append(DatasetReleaseIssueOut(
            code=code, message=message,
            target_kind="dataset_output_field" if output else None,
            target_id=output.id if output else None,
        ))

    tables = (await db.execute(select(DataSetTable).where(
        DataSetTable.dataset_id == dataset_id,
    ))).scalars().all()
    aliases = {row.alias: row.table_name for row in tables}
    outputs = (await db.execute(select(DatasetOutputField).where(
        DatasetOutputField.dataset_id == dataset_id,
    ).order_by(DatasetOutputField.display_order, DatasetOutputField.id))).scalars().all()
    columns = (await db.execute(select(TableColumn).where(
        TableColumn.table_name.in_(set(aliases.values())),
    ))).scalars().all()
    column_map = {(column.table_name, column.column_code): column for column in columns}
    physical_rows = (await db.execute(text(
        "SELECT table_name,column_name,data_type FROM information_schema.columns "
        "WHERE table_schema=current_schema() AND table_name = ANY(:table_names)"
    ), {"table_names": list(set(aliases.values()))})).all()
    physical_types = {(table, code): _physical_metadata_type(kind) for table, code, kind in physical_rows}
    bindings = (await db.execute(select(StandardFieldBinding, StandardFieldVersion).outerjoin(
        StandardFieldVersion, StandardFieldVersion.id == StandardFieldBinding.standard_field_version_id,
    ).where(StandardFieldBinding.dataset_output_field_id.in_([output.id for output in outputs])))).all()
    binding_map = {binding.dataset_output_field_id: (binding, version) for binding, version in bindings}
    if not tables:
        issue("dataset_no_source", "数据集没有来源表")
    if not outputs:
        issue("dataset_no_business_output", "数据集没有业务输出字段")
    confirmed = 0
    for output in outputs:
        previous_issue_count = len(issues)
        if output.source_column in {"id", "pk_hash", "synced_at"} or output.output_code in {"id", "pk_hash", "synced_at"}:
            issue("technical_output_forbidden", "技术字段不能作为业务输出", output)
        table_name = aliases.get(output.source_alias)
        key = (table_name, output.source_column)
        column = column_map.get(key)
        if column is None or key not in physical_types:
            issue("output_source_missing", "输出字段来源物理字段或元数据不存在", output)
            continue
        types = {_normalized_metadata_type(column.data_type), _normalized_metadata_type(output.data_type), physical_types[key]}
        if len(types) != 1:
            issue("output_physical_type_drift", "实际物理字段、输出与字段元数据类型不一致", output)
        if column.is_sensitive and not output.is_sensitive:
            issue("output_sensitivity_weakened", "输出未继承来源字段敏感限制", output)
        if not column.is_visible and output.is_visible:
            issue("output_visibility_weakened", "输出未继承来源字段隐藏限制", output)
        match = binding_map.get(output.id)
        if match is None:
            issue("output_binding_missing", "输出字段没有标准字段确认绑定", output)
            continue
        binding, version = match
        if (binding.status != "confirmed" or binding.binding_version <= 0
                or binding.confirmed_by is None or binding.confirmed_at is None):
            issue("output_binding_not_confirmed", "输出字段绑定缺少完整确认", output)
            continue
        if (version is None or version.status != "active" or version.approved_by is None
                or version.approved_at is None or not (version.approval_reason or "").strip()):
            issue("output_semantic_version_invalid", "新发布要求active且批准证据完整的语义版本", output)
            continue
        identity = column.source_field_id or _physical_source_identity(column.table_name, column.column_code)
        if binding.observed_source_field_id != identity:
            issue("output_source_identity_drift", "输出字段来源身份已漂移", output)
        if (_normalized_metadata_type(binding.observed_data_type) != _normalized_metadata_type(column.data_type)
                or _normalized_metadata_type(version.data_type) != _normalized_metadata_type(column.data_type)):
            issue("output_type_invalid", "绑定快照、物理字段与标准语义类型不兼容", output)
        if len(issues) == previous_issue_count:
            confirmed += 1
    if dataset.status not in {"draft", "published"} or not dataset.is_active:
        issue("dataset_not_releasable", "数据集已归档、停用或状态无效")
    fields_eligible = bool(tables and outputs and confirmed == len(outputs) and not issues)
    contract = (await db.execute(select(DataProductAuthorizationContract).where(
        DataProductAuthorizationContract.dataset_id == dataset_id,
        DataProductAuthorizationContract.status == "active",
    ).order_by(DataProductAuthorizationContract.contract_version.desc()).limit(1))).scalar_one_or_none()
    authorization_verified = contract is not None
    external_export_count = 0
    try:
        async with db.begin_nested():
            external_export_count = int((await db.execute(text(
                "SELECT count(*) FROM push_targets pt "
                "JOIN reports r ON ("
                "    (pt.source_type = 'report' AND pt.source_id IN (r.id::text, 'report:' || r.id::text)) "
                " OR (pt.source_table = ('report:' || r.id::text))"
                ") "
                "WHERE pt.is_active IS TRUE AND r.dataset_id = :dataset_id"
            ), {"dataset_id": dataset_id})).scalar_one() or 0)
    except SQLAlchemyError:
        issue("external_export_reference_unchecked", "外部出口引用尚未完成校验")
    if external_export_count:
        issue("external_exports_not_isolated", "数据集存在外部推送出口，未完成版本隔离与结果对照")
    if contract is None:
        issue("authorization_contract_unverified", "事实归属、人员/中心授权路径和实际粒度合同尚未验证")
    else:
        from app.datasets.authorization_contract import (
            ProductAuthorizationDefinition, _snapshot_drift, _collect_contract_physical_drift,
        )
        from app.datasets.models import DataSetRelation
        relations = (await db.execute(select(DataSetRelation).where(
            DataSetRelation.dataset_id == dataset_id,
        ))).scalars().all()
        snapshot = contract.model_snapshot
        if not isinstance(snapshot, dict):
            authorization_verified = False
            issue("authorization_snapshot_invalid", "授权合同结构快照无效")
        elif _snapshot_drift(snapshot, tables, relations, outputs):
            authorization_verified = False
            issue("authorization_contract_drift", "已批准授权合同的结构快照已漂移，请创建新合同版本")
        try:
            definition = ProductAuthorizationDefinition.model_validate(contract.contract_json)
        except ValueError:
            authorization_verified = False
            issue("authorization_contract_invalid", "已批准授权合同定义无效")
        else:
            physical_issues = await _collect_contract_physical_drift(db, definition, tables, relations, outputs)
            if physical_issues:
                authorization_verified = False
                for item in physical_issues:
                    issue(item["code"], item["message"])
    # 转换批准是独立合同：只接受由标准化成功事务写入、且当前结构仍匹配的服务端证据。
    conversion_verified = False
    if verify_conversion:
        from app.warehouse.service.conversion import valid_conversion_approval
        conversion_approval, conversion_context = await valid_conversion_approval(db, dataset_id)
        conversion_verified = conversion_approval is not None and not conversion_context["issues"]
        if not conversion_verified:
            issue("conversion_contract_unverified", "转换及全业务输出批准合同尚未验证")
    eligible = bool(fields_eligible and authorization_verified and conversion_verified and not issues)
    return DatasetReleaseReadinessOut(
        dataset_id=dataset_id, dataset_status=dataset.status, eligible=eligible,
        fields_eligible=fields_eligible, authorization_verified=authorization_verified,
        conversion_verified=conversion_verified, checked_output_count=len(outputs),
        confirmed_output_count=confirmed, issues=issues,
    )


async def get_dataset_release_health(db, dataset_id):
    from app.warehouse.impact import get_impact_analyzer
    from app.warehouse.schemas import DatasetReleaseHealthOut
    readiness = await check_dataset_release(db, dataset_id)
    try:
        references, _ = await get_impact_analyzer(db).scan_model(dataset_id)
    except Exception as error:
        if "does not exist" in str(error):
            references = []
        else:
            raise
    return DatasetReleaseHealthOut(
        readiness=readiness, references=references,
        blocking=not readiness.eligible or any(row.get("blocking") for row in references),
        checked_areas=["output_fields", "report_references", "metric_references", "external_exports"],
        unchecked_areas=["authorization_contract", "conversion_contract"],
    )


async def request_dataset_release(db, dataset_id, expected_version):
    dataset = (await db.execute(select(DataSet).where(DataSet.id == dataset_id)
                               .with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if dataset is None:
        raise HTTPException(404, detail={"code": "dataset_not_found", "message": "数据集不存在"})
    if dataset.version != expected_version:
        await db.rollback()
        raise HTTPException(409, detail={"code": "dataset_release_version_conflict", "message": "数据集版本已变化，请重新检查"})
    readiness = await check_dataset_release(db, dataset_id, verify_conversion=False)
    await db.rollback()
    raise HTTPException(409, detail={
        "code": "dataset_release_blocked",
        "message": "完整发布准入尚未通过，字段资格不能替代授权与转换合同",
        "issues": [issue.model_dump() for issue in readiness.issues],
    })
