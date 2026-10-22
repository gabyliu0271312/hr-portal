"""受控 ODS→DWD 转换证据与批准。"""
import hashlib
import hmac
import json
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.data.models import RegisteredTable, TableColumn
from app.datasets.authorization_contract import ProductAuthorizationDefinition, _snapshot_drift
from app.datasets.models import (
    DataProductAuthorizationContract, DataSet, DataSetRelation, DataSetTable,
    DatasetCalculatedField, DatasetOutputField,
)
from app.system.models import SystemLog
from app.warehouse.models import (
    StandardizationRule, WarehouseConversionApproval, WarehouseConversionRun, WarehouseLineageEdge,
)
from app.warehouse.service.standardization import _quote_ident, _coerce_insert_value


def _fingerprint(value):
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


async def schema_fingerprint(db, table_name):
    rows = (await db.execute(text(
        "SELECT ordinal_position,column_name,data_type,udt_name,is_nullable,"
        "character_maximum_length,numeric_precision,numeric_scale,datetime_precision "
        "FROM information_schema.columns "
        "WHERE table_schema=current_schema() AND table_name=:table_name ORDER BY ordinal_position"
    ), {"table_name": table_name})).mappings().all()
    columns = (await db.execute(select(TableColumn).where(
        TableColumn.table_name == table_name,
    ).order_by(TableColumn.id).execution_options(populate_existing=True))).scalars().all()
    schema = {
        "physical": [dict(row) for row in rows],
        "metadata": [{"id": column.id, "code": column.column_code,
                      "source_id": column.source_field_id, "type": column.data_type}
                     for column in columns],
    }
    return _fingerprint(schema) if rows else None


def _row_fingerprint(row):
    payload = json.dumps(dict(row), sort_keys=True, separators=(",", ":"), default=str)
    return hmac.new(settings.JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _rules_fingerprint(rules):
    return _fingerprint([{
        "id": rule.id, "asset_type": rule.asset_type, "rule_type": rule.rule_type,
        "source_field": rule.source_field, "target_field": rule.target_field,
        "rule_config": rule.rule_config, "display_order": rule.display_order,
    } for rule in rules])


async def _data_fingerprint(db, table_name):
    # Only keyed, whole-table digests persist; no row values or row hashes leave this service.
    result = await db.stream(text(f"SELECT * FROM {_quote_ident(table_name)}"))
    hashes = []
    try:
        async for row in result.mappings():
            hashes.append(_row_fingerprint(row))
    finally:
        await result.close()
    return _fingerprint(sorted(hashes)), len(hashes)


async def _rule_fingerprint(db, source_table):
    rules = (await db.execute(select(StandardizationRule).where(
        StandardizationRule.asset_code == source_table, StandardizationRule.enabled.is_(True),
    ).order_by(StandardizationRule.display_order, StandardizationRule.id))).scalars().all()
    return _rules_fingerprint(rules)


def _projection_fingerprint(row, column_types):
    values = {}
    for column, sql_type in column_types.items():
        value = _coerce_insert_value(row.get(column), sql_type)
        if value is not None and sql_type == "NUMERIC":
            number = Decimal(value) if isinstance(value, float) else Decimal(str(value))
            canonical = format(number, "f") if number.is_finite() else str(number)
            if "." in canonical:
                canonical = canonical.rstrip("0").rstrip(".")
            value = {"numeric": canonical if number else "0"}
        values[column] = value
    return _fingerprint(values)


async def record_conversion_run(db, *, source_table, target_table, lineage, rules,
                                input_rows, output_rows, output_columns, source_rows,
                                source_schema_fingerprint, rules_fingerprint, column_types):
    source = await db.scalar(select(RegisteredTable).where(RegisteredTable.table_name == source_table))
    if (source is None or source.warehouse_layer != "ODS" or source_table == target_table
            or not rules or any(rule.asset_type != "table" or rule.rule_type != "rename"
                                or rule.source_field != rule.target_field for rule in rules)):
        return None
    projected = [{column: row.get(column) for column in output_columns} for row in source_rows]
    target = (await db.execute(text(
        f"SELECT {', '.join(_quote_ident(column) for column in output_columns)} "
        f"FROM {_quote_ident(target_table)}"
    ))).mappings().all()
    if sorted(_projection_fingerprint(row, column_types) for row in projected) != sorted(_projection_fingerprint(dict(row), column_types) for row in target):
        raise ValueError("DWD_REFRESH_CONVERSION_MISMATCH: 转换结果与输入投影不一致")
    source_digest, source_count = await _data_fingerprint(db, source_table)
    target_digest, target_count = await _data_fingerprint(db, target_table)
    source_snapshot = _fingerprint(sorted(_row_fingerprint(row) for row in source_rows))
    if (source_count != input_rows or target_count != output_rows or source_digest != source_snapshot
            or await schema_fingerprint(db, source_table) != source_schema_fingerprint
            or await _rule_fingerprint(db, source_table) != rules_fingerprint):
        raise ValueError("DWD_REFRESH_CONVERSION_CHANGED: 转换输入或规则已变化")
    await db.flush()
    run = WarehouseConversionRun(
        source_table=source_table, target_table=target_table, lineage_id=lineage.id,
        evidence={
            "version": 1, "status": "success", "kind": "same_name_full_refresh",
            "rule_ids": [rule.id for rule in rules],
            "rules_fingerprint": rules_fingerprint,
            "projection": list(output_columns),
            "input_rows": input_rows, "output_rows": output_rows,
            "source_schema_fingerprint": await schema_fingerprint(db, source_table),
            "target_schema_fingerprint": await schema_fingerprint(db, target_table),
            "source_data_fingerprint": source_digest, "target_data_fingerprint": target_digest,
        },
    )
    db.add(run)
    await db.flush()
    lineage.run_id = run.id
    await db.flush()
    return run


def model_fingerprint(dataset, tables, relations, outputs, contract, run):
    return _fingerprint({
        "dataset_id": dataset.id, "version": dataset.version,
        "tables": [{"id": row.id, "table_name": row.table_name, "alias": row.alias}
                   for row in sorted(tables, key=lambda row: row.id)],
        "relations": [row.id for row in relations],
        "outputs": [{"id": row.id, "source_alias": row.source_alias, "source_column": row.source_column,
                     "output_code": row.output_code, "data_type": row.data_type,
                     "is_sensitive": row.is_sensitive, "is_visible": row.is_visible}
                    for row in sorted(outputs, key=lambda row: row.id)],
        "contract": {"id": contract.id, "version": contract.contract_version}, "run": run.id,
    })


async def _evaluate(db, dataset_id, user=None, expected_run_id=None, expected_contract_id=None):
    from app.datasets.router import _can_access
    dataset = await db.get(DataSet, dataset_id)
    if dataset is None:
        raise HTTPException(404, detail={"code": "dataset_not_found", "message": "数据集不存在"})
    if user is not None and not await _can_access(user, dataset, db):
        raise HTTPException(403, detail={"code": "dataset_acl_denied", "message": "当前用户不具备数据集资源访问权"})
    context = {"dataset": dataset, "contract": None, "run": None, "fingerprint": None, "issues": []}

    def issue(code, message):
        context["issues"].append({"code": code, "message": message})

    if dataset.is_active is not True or dataset.status not in {"draft", "published"} or dataset.warehouse_layer != "DWD":
        issue("dataset_inactive", "仅可批准有效的DWD数据集")
    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id))).scalars().all()
    relations = (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == dataset_id))).scalars().all()
    calculated = await db.scalar(select(DatasetCalculatedField.id).where(DatasetCalculatedField.dataset_id == dataset_id).limit(1))
    outputs = (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == dataset_id))).scalars().all()
    if len(tables) != 1 or relations or calculated or not outputs:
        issue("conversion_scope_not_supported", "转换批准仅支持有业务输出、无关联或计算字段的单表数据集")
        return context
    contracts = (await db.execute(select(DataProductAuthorizationContract).where(
        DataProductAuthorizationContract.dataset_id == dataset_id, DataProductAuthorizationContract.status == "active",
    ).order_by(DataProductAuthorizationContract.contract_version.desc()).limit(2))).scalars().all()
    if len(contracts) != 1:
        issue("authorization_contract_unverified", "必须有且只有一个active授权合同")
        return context
    contract = context["contract"] = contracts[0]
    try:
        definition = ProductAuthorizationDefinition.model_validate(contract.contract_json)
    except ValueError:
        issue("authorization_contract_invalid", "授权合同无效")
        return context
    if (not isinstance(contract.model_snapshot, dict)
            or _snapshot_drift(contract.model_snapshot, tables, relations, outputs)):
        issue("authorization_contract_drift", "授权合同结构已漂移")
    if (len(definition.facts) != 1 or definition.facts[0].role not in {"person_fact", "allocation_fact"}
            or definition.facts[0].table_name != tables[0].table_name or definition.facts[0].alias != tables[0].alias
            or set(definition.output_fields) != {output.output_code for output in outputs}
            or contract.approved_by is None or contract.approved_at is None or not (contract.approval_reason or "").strip()):
        issue("authorization_contract_invalid", "事实、输出白名单或批准信息不完整")
    if expected_contract_id is not None and contract.id != expected_contract_id:
        issue("authorization_contract_mismatch", "授权合同版本已变化")
    target_table = tables[0].table_name
    run = context["run"] = await db.scalar(select(WarehouseConversionRun).where(
        WarehouseConversionRun.target_table == target_table,
    ).order_by(WarehouseConversionRun.id.desc()).limit(1))
    if run is None:
        issue("conversion_run_missing", "没有成功的服务端转换证据")
        return context
    if expected_run_id is not None and run.id != expected_run_id:
        issue("conversion_run_mismatch", "指定运行不是当前最新成功运行")
    evidence = run.evidence if isinstance(run.evidence, dict) else {}
    if (evidence.get("status") != "success" or evidence.get("version") != 1
            or evidence.get("kind") != "same_name_full_refresh"
            or not isinstance(evidence.get("projection"), list)
            or any(output.source_column not in evidence["projection"] for output in outputs)):
        issue("conversion_evidence_invalid", "转换证据或批准投影无效")
        return context
    latest_lineage = await db.scalar(select(WarehouseLineageEdge).where(
        WarehouseLineageEdge.target_asset == target_table,
    ).order_by(WarehouseLineageEdge.id.desc()).limit(1))
    if (latest_lineage is None or latest_lineage.id != run.lineage_id or latest_lineage.run_id != run.id
            or latest_lineage.source_asset != run.source_table or latest_lineage.operation != "standardize"):
        issue("conversion_lineage_stale", "目标已重新加工，须重新生成和批准证据")
    for table, layer in ((run.source_table, "ODS"), (run.target_table, "DWD")):
        registered = await db.scalar(select(RegisteredTable).where(RegisteredTable.table_name == table))
        if registered is None or registered.warehouse_layer != layer:
            issue("conversion_layer_invalid", "转换来源或目标分层已变化")
    source_schema = await schema_fingerprint(db, run.source_table)
    target_schema = await schema_fingerprint(db, run.target_table)
    if not source_schema or source_schema != evidence.get("source_schema_fingerprint"):
        issue("conversion_source_schema_drift", "转换来源结构或身份已漂移")
    if not target_schema or target_schema != evidence.get("target_schema_fingerprint"):
        issue("conversion_target_schema_drift", "转换目标结构或身份已漂移")
    if context["issues"]:
        return context
    await db.execute(text(f"LOCK TABLE {_quote_ident(run.source_table)}, {_quote_ident(run.target_table)} IN SHARE MODE"))
    latest_run_id = await db.scalar(select(WarehouseConversionRun.id).where(
        WarehouseConversionRun.target_table == target_table,
    ).order_by(WarehouseConversionRun.id.desc()).limit(1))
    latest_lineage_id = await db.scalar(select(WarehouseLineageEdge.id).where(
        WarehouseLineageEdge.target_asset == target_table,
    ).order_by(WarehouseLineageEdge.id.desc()).limit(1))
    if latest_run_id != run.id or latest_lineage_id != run.lineage_id:
        issue("conversion_run_mismatch", "目标已重新加工，请重新检查最新证据")
    if (await schema_fingerprint(db, run.source_table) != source_schema
            or await schema_fingerprint(db, run.target_table) != target_schema):
        issue("conversion_schema_changed", "转换结构在校验期间发生变化")
    source_digest, source_count = await _data_fingerprint(db, run.source_table)
    target_digest, target_count = await _data_fingerprint(db, run.target_table)
    if source_digest != evidence.get("source_data_fingerprint") or source_count != evidence.get("input_rows"):
        issue("conversion_source_data_drift", "来源数据已变化，须重新转换")
    if target_digest != evidence.get("target_data_fingerprint") or target_count != evidence.get("output_rows"):
        issue("conversion_target_data_drift", "目标数据已变化，须重新转换")
    if await _rule_fingerprint(db, run.source_table) != evidence.get("rules_fingerprint"):
        issue("conversion_rules_drift", "转换规则已变化，须重新转换")
    context["fingerprint"] = model_fingerprint(dataset, tables, relations, outputs, contract, run)
    return context


async def valid_conversion_approval(db, dataset_id, user=None):
    context = await _evaluate(db, dataset_id, user)
    approval = None
    if not context["issues"]:
        approval = await db.scalar(select(WarehouseConversionApproval).where(
            WarehouseConversionApproval.dataset_id == dataset_id,
            WarehouseConversionApproval.contract_id == context["contract"].id,
            WarehouseConversionApproval.run_id == context["run"].id,
            WarehouseConversionApproval.dataset_version == context["dataset"].version,
            WarehouseConversionApproval.model_fingerprint == context["fingerprint"],
        ).limit(1))
        if approval is None:
            context["issues"].append({"code": "conversion_approval_missing", "message": "最新转换证据尚未批准"})
    return approval, context


async def conversion_readiness(db, dataset_id, user):
    approval, context = await valid_conversion_approval(db, dataset_id, user)
    from app.warehouse.service.release_gate import check_dataset_release
    release = await check_dataset_release(db, dataset_id, verify_conversion=False)
    context["issues"].extend({"code": issue.code, "message": issue.message} for issue in release.issues)
    return {
        "dataset_id": dataset_id, "dataset_version": context["dataset"].version,
        "eligible": not context["issues"], "conversion_verified": approval is not None and not context["issues"],
        "run_id": context["run"].id if context["run"] else None,
        "contract_id": context["contract"].id if context["contract"] else None,
        "model_fingerprint": context["fingerprint"], "approval_id": approval.id if approval else None,
        "issues": context["issues"],
        "checked_areas": ["dataset_acl", "conversion_run", "source_schema", "target_schema", "data_fingerprint", "rules", "authorization_contract"],
    }


async def approve_conversion(db, dataset_id, payload, user):
    try:
        context = await _evaluate(db, dataset_id, user, payload.expected_run_id, payload.expected_contract_id)
        dataset = await db.scalar(select(DataSet).where(DataSet.id == dataset_id)
                                  .with_for_update().execution_options(populate_existing=True))
        if dataset.version != payload.expected_dataset_version:
            raise HTTPException(409, detail={"code": "conversion_dataset_version_conflict", "message": "数据集版本已变化"})
        if context["issues"]:
            raise HTTPException(409, detail={"code": "conversion_approval_blocked", "message": "转换证据未通过校验", "issues": context["issues"]})
        locked_context = await _evaluate(db, dataset_id, user, payload.expected_run_id, payload.expected_contract_id)
        if locked_context["issues"] or locked_context["fingerprint"] != context["fingerprint"]:
            raise HTTPException(409, detail={"code": "conversion_approval_conflict", "message": "批准期间配置已变化，请重新检查"})
        from app.warehouse.service.release_gate import check_dataset_release
        release = await check_dataset_release(db, dataset_id, verify_conversion=False)
        if release.issues:
            raise HTTPException(409, detail={"code": "conversion_approval_blocked", "message": "字段或授权准入未通过",
                                            "issues": [issue.model_dump() for issue in release.issues]})
        row = WarehouseConversionApproval(
            dataset_id=dataset_id, contract_id=context["contract"].id, run_id=context["run"].id,
            dataset_version=dataset.version, model_fingerprint=context["fingerprint"],
            approved_by=user.id, reason=payload.reason,
        )
        db.add(row)
        await db.flush()
        db.add(SystemLog(
            category="scope_governance", action="conversion_approval_created", status="success", user_id=user.id,
            request_summary="批准转换运行证据", response_summary="转换证据批准已记录，运行资格另行校验",
            metadata_json={"dataset_id": dataset_id, "contract_id": row.contract_id,
                           "run_id": row.run_id, "approval_id": row.id, "reason_supplied": True},
        ))
        result = {"id": row.id, "dataset_id": dataset_id, "contract_id": row.contract_id, "run_id": row.run_id,
                  "dataset_version": row.dataset_version, "model_fingerprint": row.model_fingerprint,
                  "approved_by": row.approved_by, "reason": row.reason, "created_at": row.created_at}
        await db.commit()
        return result
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(409, detail={"code": "conversion_approval_conflict", "message": "转换批准已存在或状态冲突"}) from error
    except Exception:
        await db.rollback()
        raise
