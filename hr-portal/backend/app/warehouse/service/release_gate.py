from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.data.models import StandardFieldBinding, StandardFieldVersion, TableColumn
from app.datasets.models import DataSet, DataSetTable, DatasetOutputField, DataProductAuthorizationContract
from app.warehouse.schemas import DatasetIsolationOut, DatasetReleaseIssueOut, DatasetReleaseReadinessOut
from app.warehouse.service.standard_fields import _physical_source_identity
from app.warehouse.service.standardization import _normalized_metadata_type, _physical_metadata_type
from app.warehouse.service_ref import LEGACY_REPORT_PREFIX, SOURCE_DATASET, SOURCE_REPORT, SOURCE_TABLE


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
                "WITH bound_tables AS ("
                "    SELECT table_name FROM dataset_tables WHERE dataset_id = :dataset_id"
                "), affected_tables AS ("
                "    SELECT table_name FROM bound_tables "
                "    UNION "
                "    SELECT cr.source_table FROM bound_tables dt "
                "    JOIN LATERAL ("
                "        SELECT source_table FROM warehouse_conversion_runs "
                "        WHERE target_table = dt.table_name ORDER BY id DESC LIMIT 1"
                "    ) cr ON TRUE"
                "), affected_datasets AS ("
                "    SELECT :dataset_id AS id "
                "    UNION "
                "    SELECT dataset_id FROM dataset_tables "
                "    WHERE table_name IN (SELECT table_name FROM affected_tables)"
                ") "
                "SELECT count(*) FROM push_targets pt "
                "WHERE pt.is_active IS TRUE AND ("
                "    EXISTS ("
                "        SELECT 1 FROM reports r "
                "        WHERE r.dataset_id IN (SELECT id FROM affected_datasets) AND ("
                "            (pt.source_type = :report_type AND pt.source_id IN ("
                "                r.id::text, :report_prefix || r.id::text)) "
                "            OR pt.source_table = :report_prefix || r.id::text"
                "        )"
                "    ) "
                "    OR (pt.source_type IN (:dataset_type, 'model') "
                "        AND pt.source_id IN (SELECT id::text FROM affected_datasets)) "
                "    OR (pt.source_type = :table_type "
                "        AND pt.source_id IN (SELECT table_name FROM affected_tables)) "
                "    OR pt.source_table IN (SELECT table_name FROM affected_tables)"
                ")"
            ), {"dataset_id": dataset_id, "report_type": SOURCE_REPORT,
                "report_prefix": LEGACY_REPORT_PREFIX, "dataset_type": SOURCE_DATASET,
                "table_type": SOURCE_TABLE})).scalar_one() or 0)
    except SQLAlchemyError:
        issue("external_export_reference_unchecked", "外部出口引用尚未完成校验")
    if external_export_count:
        issue("external_exports_not_isolated", "数据集存在外部推送出口，未完成版本隔离与结果对照")
    automation_conflicts = []
    try:
        from app.warehouse.models import OdsDwdAutomationConfig
        async with db.begin_nested():
            automation_conflicts = (await db.execute(select(OdsDwdAutomationConfig.id).where(
                OdsDwdAutomationConfig.target_dwd_table_name.in_(set(aliases.values())),
                OdsDwdAutomationConfig.enabled.is_(True),
            ))).scalars().all()
    except SQLAlchemyError:
        automation_conflicts = []
    if automation_conflicts:
        issue("automation_target_not_evidenced", "目标表仍启用 ODS→DWD 自动任务，会自动写入且不产生转换证据；请先停用该自动配置")
    isolation = None
    try:
        async with db.begin_nested():
            row = (await db.execute(text(
                "WITH bound_tables AS ("
                "    SELECT table_name FROM dataset_tables WHERE dataset_id = :dataset_id"
                "), source_tables AS ("
                "    SELECT DISTINCT cr.source_table FROM bound_tables bt "
                "    JOIN LATERAL ("
                "        SELECT source_table FROM warehouse_conversion_runs "
                "        WHERE target_table = bt.table_name ORDER BY id DESC LIMIT 1"
                "    ) cr ON TRUE"
                ") "
                "SELECT "
                "    (SELECT coalesce(array_agg(table_name ORDER BY table_name), '{}') "
                "        FROM bound_tables) AS target_tables, "
                "    (SELECT coalesce(array_agg(source_table ORDER BY source_table), '{}') "
                "        FROM source_tables) AS source_tables, "
                "    (SELECT count(*) FROM dataset_tables WHERE dataset_id <> :dataset_id "
                "        AND table_name IN (SELECT table_name FROM bound_tables)"
                "    ) AS shared_target_dataset_count, "
                "    (SELECT count(*) FROM dataset_tables WHERE dataset_id <> :dataset_id "
                "        AND table_name IN (SELECT source_table FROM source_tables)"
                "    ) AS shared_source_dataset_count, "
                "    (SELECT count(*) FROM warehouse_conversion_runs cr "
                "        WHERE cr.source_table IN (SELECT source_table FROM source_tables) "
                "        AND cr.target_table NOT IN (SELECT table_name FROM bound_tables)"
                "    ) AS source_other_target_count"
            ), {"dataset_id": dataset_id})).mappings().one()
        isolation = DatasetIsolationOut(
            target_tables=list(row["target_tables"] or []),
            source_tables=list(row["source_tables"] or []),
            shared_target_dataset_count=int(row["shared_target_dataset_count"] or 0),
            shared_source_dataset_count=int(row["shared_source_dataset_count"] or 0),
            source_other_target_count=int(row["source_other_target_count"] or 0),
            active_export_count=external_export_count,
            isolated=not (row["shared_target_dataset_count"] or row["shared_source_dataset_count"]
                          or row["source_other_target_count"] or external_export_count),
        )
    except SQLAlchemyError:
        isolation = None
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
        confirmed_output_count=confirmed, issues=issues, isolation=isolation,
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


async def request_dataset_release(db, dataset_id, expected_version, user):
    from datetime import UTC, datetime
    from app.datasets.router import _can_access
    from app.datasets.authorization_contract import execution_readiness
    from app.system.models import SystemLog
    from sqlalchemy.orm.attributes import set_committed_value

    try:
        dataset = (await db.execute(select(DataSet).where(DataSet.id == dataset_id)
                                   .execution_options(populate_existing=True))).scalar_one_or_none()
        if dataset is None:
            raise HTTPException(404, detail={"code": "dataset_not_found", "message": "数据集不存在"})
        if not await _can_access(user, dataset, db):
            raise HTTPException(403, detail={"code": "dataset_acl_denied", "message": "当前用户不具备数据集资源访问权"})
        if dataset.version != expected_version:
            raise HTTPException(409, detail={"code": "dataset_release_version_conflict", "message": "数据集版本已变化，请重新检查"})
        previous_status = dataset.status
        observed_state = (dataset.version, dataset.status, dataset.is_active, dataset.warehouse_layer)
        with db.no_autoflush:
            set_committed_value(dataset, "status", "published")
            try:
                execution = await execution_readiness(db, dataset_id, user)
                if not execution.eligible or not execution.runtime_enabled:
                    raise HTTPException(409, detail={
                        "code": "dataset_release_blocked", "message": "当前数据集不满足限定汇总执行资格",
                        "issues": execution.issues,
                    })
                readiness = await check_dataset_release(db, dataset_id)
                if not readiness.eligible:
                    raise HTTPException(409, detail={
                        "code": "dataset_release_blocked", "message": "完整发布准入尚未通过",
                        "issues": [issue.model_dump() for issue in readiness.issues],
                    })
            finally:
                set_committed_value(dataset, "status", previous_status)
            dataset = (await db.execute(select(DataSet).where(DataSet.id == dataset_id)
                .with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
        if dataset is None or dataset.version != expected_version:
            raise HTTPException(409, detail={"code": "dataset_release_version_conflict", "message": "数据集版本已变化，请重新检查"})
        if (dataset.version, dataset.status, dataset.is_active, dataset.warehouse_layer) != observed_state:
            raise HTTPException(409, detail={"code": "dataset_release_state_conflict", "message": "数据集状态已变化，请重新检查"})
        dataset.status = "published"
        # 发布序号与结构版本分离：结构版本被转换批准绑定，不能因发布递增
        dataset.release_version = (dataset.release_version or 0) + 1
        if previous_status != "published":
            dataset.published_by = user.id
            dataset.published_at = datetime.now(UTC)
        db.add(SystemLog(
            category="scope_governance", action="dataset_release", status="success", user_id=user.id,
            metadata_json={"dataset_id": dataset_id, "version": dataset.version,
                           "release_version": dataset.release_version,
                           "previous_status": previous_status, "status": "published",
                           "contract_id": execution.contract_id, "contract_version": execution.contract_version},
        ))
        await db.commit()
        return readiness.model_copy(update={"dataset_status": "published"})
    except Exception:
        await db.rollback()
        raise
