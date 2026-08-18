"""受控 DWD 关联：优先使用数据集权限，兼容历史报表来源。"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.datasets.models import DataSet
from app.datasets.router import _can_access as dataset_can_access
from app.permissions.masker import get_hidden_columns
from app.reports.config import ReportConfig
from app.reports.models import Report
from app.reports.router import _can_access as report_can_access
from app.reports.sql_builder import run_dataset_query
from app.reports.validation import ensure_valid_report_field_references
from app.table_tools.models import MergeDwdRelation
from app.users.models import User


_ALLOWED_MISSING = {"anomaly", "skip"}
_ALLOWED_MULTIPLE = {"anomaly", "first"}


async def load_dataset_dwd_context(
    dataset_id: int, user: User, db: AsyncSession
) -> DataSet:
    dataset = await db.get(DataSet, dataset_id)
    if dataset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="DWD 数据集不存在或无权访问")
    if not await dataset_can_access(user, dataset, db):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="DWD 数据集不存在或无权访问")
    if dataset.warehouse_layer != "DWD":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="关联来源必须是 DWD 数据集")
    if not dataset.is_active or dataset.status != "published":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="DWD 数据集未启用或未发布")
    return dataset


async def load_dwd_context(
    report_id: int, user: User, db: AsyncSession
) -> tuple[Report, DataSet]:
    report = await db.get(Report, report_id)
    if report is None or not await report_can_access(user, report, db):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在或无权访问")
    dataset = await load_dataset_dwd_context(report.dataset_id, user, db)
    return report, dataset


async def list_dwd_sources(user: User, db: AsyncSession) -> list[dict[str, Any]]:
    datasets = (await db.execute(select(DataSet))).scalars().all()
    result: list[dict[str, Any]] = []
    seen: set[int] = set()
    for dataset in datasets:
        try:
            dataset = await load_dataset_dwd_context(dataset.id, user, db)
        except HTTPException:
            continue
        if dataset.id in seen:
            continue
        seen.add(dataset.id)
        result.append({
            "dataset_id": dataset.id,
            "dataset_name": dataset.name,
            "dataset_label": dataset.label,
            "report_id": None,
            "report_name": None,
        })
    return result


async def list_dwd_fields_by_dataset(
    dataset_id: int, user: User, db: AsyncSession
) -> list[dict[str, Any]]:
    dataset = await load_dataset_dwd_context(dataset_id, user, db)
    from app.data.models import TableColumn
    from app.datasets.models import DataSetTable

    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset.id))).scalars().all()
    result: list[dict[str, Any]] = []
    for table in tables:
        hidden = await get_hidden_columns(user, table.table_name, db)
        columns = (await db.execute(select(TableColumn).where(TableColumn.table_name == table.table_name))).scalars().all()
        for column in columns:
            if not column.is_visible or column.column_code in hidden:
                continue
            result.append({
                "code": f"{table.alias}.{column.column_code}",
                "label": column.column_label,
                "data_type": column.data_type,
                "is_sensitive": bool(column.is_sensitive),
            })
    return result


async def list_dwd_fields(report_id: int, user: User, db: AsyncSession) -> list[dict[str, Any]]:
    _, dataset = await load_dwd_context(report_id, user, db)
    return await list_dwd_fields_by_dataset(dataset.id, user, db)


def validate_relation_payload(
    payload: dict[str, Any], template_fields: list[str], dwd_fields: list[str]
) -> dict[str, Any]:
    left = [str(value).strip() for value in payload.get("left_fields", [])]
    right = [str(value).strip() for value in payload.get("right_fields", [])]
    select_fields = [str(value).strip() for value in payload.get("select_fields", [])]
    if not left or len(left) != len(right):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="DWD 关联键必须成对配置")
    if any(value not in template_fields for value in left):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="左侧关联字段必须属于模板字段")
    if any(value not in dwd_fields for value in [*right, *select_fields]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="右侧关联字段必须属于当前用户可见的 DWD 字段")
    if len(set(right)) != len(right) or len(set(select_fields)) != len(select_fields):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="DWD 字段不能重复")
    missing_policy = payload.get("missing_policy", "anomaly")
    multiple_policy = payload.get("multiple_policy", "anomaly")
    if missing_policy not in _ALLOWED_MISSING or multiple_policy not in _ALLOWED_MULTIPLE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="DWD 关联策略不受支持")
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="DWD 关联名称不能为空")
    dataset_id = payload.get("dataset_id")
    report_id = payload.get("report_id")
    if dataset_id is None and report_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="必须指定 DWD 数据集")
    return {
        "name": name,
        "report_id": report_id,
        "dataset_id": dataset_id,
        "left_fields": left,
        "right_fields": right,
        "select_fields": select_fields,
        "missing_policy": missing_policy,
        "multiple_policy": multiple_policy,
        "enabled": bool(payload.get("enabled", True)),
    }


async def apply_dwd_relation(
    rows: list[dict[str, Any]], relation: MergeDwdRelation, user: User, db: AsyncSession
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not relation.enabled or not rows:
        return rows, []
    if relation.dataset_id is not None:
        dataset = await load_dataset_dwd_context(relation.dataset_id, user, db)
    elif relation.report_id is not None:
        _, dataset = await load_dwd_context(relation.report_id, user, db)
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="DWD 关联缺少来源")
    fields = list(dict.fromkeys([*relation.right_fields, *relation.select_fields]))
    await ensure_valid_report_field_references(
        ReportConfig(columns=fields), dataset.id, user, db
    )
    keys: list[tuple[str, ...]] = []
    for row in rows:
        key = tuple(str(row.get(field, "") or "").strip() for field in relation.left_fields)
        if any(key):
            keys.append(key)
    if not keys:
        return rows, []
    unique_keys = list(dict.fromkeys(keys))
    # 逐列 IN 只产生联合键候选集，不能单独作为关联判定；最终命中必须由完整 tuple 再校验。
    filters = [
        {"column": field, "op": "in_text", "value": [key[index] for key in unique_keys]}
        for index, field in enumerate(relation.right_fields)
    ]
    dwd_rows: list[dict[str, Any]] = []
    page = 1
    page_size = min(max(len(unique_keys) * 20, 100), 1000)
    try:
        while True:
            _, batch, total = await run_dataset_query(
                dataset.id, columns=fields, filters=filters, page=page,
                page_size=page_size, user=user, db=db,
            )
            batch = batch or []
            dwd_rows.extend(batch)
            if not batch or len(dwd_rows) >= (total or 0):
                break
            page += 1
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"DWD 查询失败: {exc}") from exc

    requested_keys = set(unique_keys)
    index: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for dwd_row in dwd_rows:
        key = tuple(str(dwd_row.get(field, "") or "").strip() for field in relation.right_fields)
        if key in requested_keys and all(key):
            index[key].append(dwd_row)
    anomalies: list[dict[str, Any]] = []
    output: list[dict[str, Any]] = []
    for row in rows:
        key = tuple(str(row.get(field, "") or "").strip() for field in relation.left_fields)
        matches = index.get(key, [])
        if not matches:
            if relation.missing_policy == "anomaly":
                anomalies.append({"type": "DWD 未命中", "key": dict(zip(relation.left_fields, key)), "detail": relation.name})
            output.append(row)
            continue
        matches = sorted(
            matches,
            key=lambda item: tuple(str(item.get(field, "") or "") for field in fields),
        )
        if len(matches) > 1:
            selected_values = {
                tuple(str(item.get(field, "") or "") for field in relation.select_fields)
                for item in matches
            }
            if len(selected_values) > 1:
                anomalies.append({
                    "type": "DWD 字段冲突",
                    "key": dict(zip(relation.left_fields, key)),
                    "detail": relation.name,
                })
            if relation.multiple_policy == "anomaly":
                anomalies.append({"type": "DWD 多命中", "key": dict(zip(relation.left_fields, key)), "detail": relation.name})
                output.append(row)
                continue
        enriched = dict(row)
        for field in relation.select_fields:
            enriched[field] = matches[0].get(field)
        output.append(enriched)
    return output, anomalies
