"""对外推送目标 CRUD + 手动触发

GET    /push-targets?source_table=  列表
POST   /push-targets                新建
GET    /push-targets/{id}           详情
PUT    /push-targets/{id}           更新
DELETE /push-targets/{id}           删除
POST   /push-targets/{id}/run       手动触发推送
GET    /push-targets/{id}/runs      推送历史
GET    /push-targets/{id}/data      api_expose 类型：返回数据（用 token 鉴权）
"""
from __future__ import annotations

from datetime import date, datetime, UTC
from decimal import Decimal
import hashlib
import json
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_any_op, require_op, user_has_op
from app.push.models import PushTarget
from app.users.models import User

router = APIRouter(prefix="/push-targets", tags=["push-targets"])


# ===== Schemas =====

class PushTargetIn(BaseModel):
    source_table: str = ""                # 旧字段，过渡期兼容
    name: str
    description: str | None = None
    push_type: str  # external_db / http_push / api_expose
    settings: dict = {}
    secrets: dict = {}           # 明文传入，后端加密存储
    field_mappings: list[dict] = []
    is_active: bool = True
    schedule: str = "手动触发"
    # P2：统一来源协议
    source_type: str = ""        # table / dataset / metric / ads / report
    source_id: str = ""
    source_label: str = ""


class PushTargetOut(BaseModel):
    id: int
    source_table: str
    name: str
    description: str | None
    push_type: str
    settings: dict
    field_mappings: list
    is_active: bool
    last_push_at: str | None
    last_status: str
    last_rows: int | None
    last_message: str | None
    created_at: str
    updated_at: str
    # P1 新增：统一来源协议（从 settings.source_ref 或旧 source_table 推导）
    source_type: str = ""
    source_id: str = ""
    source_label: str = ""


class RunIn(BaseModel):
    period_ym: str = ""   # 月度表指定月份，空则用配置里的


# ===== helpers =====

def _is_missing_or_physical_source_label(label: str | None, *physical_names: str | None) -> bool:
    """Return True when a stored label is blank or just the physical table/source id.

    Older rows and some frontend payloads may persist source_label as
    ``feishu_xxx``. In that case the API should re-resolve the friendly
    label before returning/saving it.
    """
    normalized_label = str(label or "").strip()
    if not normalized_label:
        return True
    return any(
        normalized_label == str(name or "").strip()
        for name in physical_names
        if str(name or "").strip()
    )


async def _resolve_table_source_label(db: AsyncSession, table_name: str, fallback: str | None = None) -> str:
    """Resolve the display label for a table source.

    Prefer registered_tables.table_label. If that metadata was also saved as
    the physical table name, fall back to datasources.table_label because
    source tables created from data integration often keep the business name
    there.
    """
    table_name = str(table_name or "").strip()
    label = str(fallback or "").strip()

    from app.data.models import RegisteredTable

    row = await db.execute(
        select(RegisteredTable.table_label).where(RegisteredTable.table_name == table_name)
    )
    registered_label = row.scalar_one_or_none()
    if registered_label and not _is_missing_or_physical_source_label(registered_label, table_name):
        return registered_label
    if registered_label and not label:
        label = registered_label

    try:
        from app.datasources.models import DataSource

        ds_row = await db.execute(
            select(DataSource.table_label)
            .where(DataSource.table_name == table_name)
            .order_by(DataSource.id.desc())
            .limit(1)
        )
        datasource_label = ds_row.scalar_one_or_none()
        if datasource_label and not _is_missing_or_physical_source_label(datasource_label, table_name):
            return datasource_label
    except Exception:
        pass

    return label or table_name


async def _to_out(pt: PushTarget, db: AsyncSession) -> PushTargetOut:
    label = pt.source_label
    effective_source_type = pt.source_type or "table"
    effective_source_id = pt.source_id or pt.source_table

    # 兼容生产历史数据：source_table 已经是 report:{id}，
    # 但 source_type/source_id/source_label 迁移未回填或仍被标记为 table。
    if str(pt.source_table or "").startswith("report:"):
        effective_source_type = "report"
        effective_source_id = str(pt.source_table).split(":", 1)[1]

    if effective_source_type == "report":
        report_id = effective_source_id
        if report_id and str(report_id).isdigit():
            from app.reports.models import Report
            report = await db.get(Report, int(report_id))
            if report:
                label = report.name
        if not label:
            label = f"报表 #{report_id}"

    elif effective_source_type == "table" and _is_missing_or_physical_source_label(label, pt.source_table, effective_source_id):
        label = await _resolve_table_source_label(db, str(effective_source_id or ""), label)

    return PushTargetOut(
        id=pt.id,
        source_table=pt.source_table,
        name=pt.name,
        description=pt.description,
        push_type=pt.push_type,
        settings=pt.settings or {},
        field_mappings=pt.field_mappings or [],
        is_active=pt.is_active,
        last_push_at=pt.last_push_at.isoformat() if pt.last_push_at else None,
        last_status=pt.last_status,
        last_rows=pt.last_rows,
        last_message=pt.last_message,
        created_at=pt.created_at.isoformat(),
        updated_at=pt.updated_at.isoformat(),
        source_type=effective_source_type,
        source_id=str(effective_source_id or ""),
        source_label=label or "",
    )

async def _ensure_report_push_editable(source_table: str, user: User, db: AsyncSession) -> None:
    if not str(source_table or "").startswith("report:"):
        return
    from app.reports.models import Report
    from app.reports.router import _can_edit

    try:
        report_id = int(str(source_table).split(":", 1)[1])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="报表推送源格式不正确") from exc
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if not await _can_edit(user, report, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="仅报表创建人可配置/执行该报表推送")


def _is_report_source(source_table: str | None) -> bool:
    from app.warehouse.service_ref import is_legacy_report_source
    return is_legacy_report_source(source_table)


_QUERY_PARAMETER_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")


def _report_source_id(source_table: str) -> int:
    try:
        return int(str(source_table).split(":", 1)[1])
    except (IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="报表推送源格式不正确") from exc


async def _report_filter_metadata(source_table: str, db: AsyncSession) -> list[dict[str, Any]]:
    from app.datasets.models import DatasetOutputField
    from app.reports.config import ReportConfig
    from app.reports.models import Report

    report = await db.get(Report, _report_source_id(source_table))
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    cfg = ReportConfig(**(report.config or {}))
    output_fields = []
    if report.dataset_id:
        output_fields = (
            await db.execute(
                select(DatasetOutputField).where(DatasetOutputField.dataset_id == report.dataset_id)
            )
        ).scalars().all()

    def field_meta(column: str) -> tuple[str, str]:
        tail = column.rsplit(".", 1)[-1]
        matched = next(
            (field for field in output_fields if field.output_code == column or field.source_column == column or field.source_column == tail),
            None,
        )
        return (
            (matched.output_label if matched else tail),
            (matched.data_type if matched else "string"),
        )

    return [
        {
            "column": item.column,
            "label": field_meta(item.column)[0],
            "data_type": field_meta(item.column)[1],
            "default_value": item.value,
            "visible": item.visible,
            "locked": item.locked,
        }
        for item in cfg.filters
        if item.visible and not item.locked
    ]


def _parameter_rule(column: str, label: str, data_type: str, used_names: set[str]) -> dict[str, Any]:
    tail = column.rsplit(".", 1)[-1]
    normalized = re.sub(r"[^A-Za-z0-9_]+", "_", tail).strip("_").lower()
    if tail in {"pay_month", "month"} or normalized in {"pay_month", "month"}:
        name, pattern, hint, example = "period_ym", r"^\d{6}$", "YYYYMM", "202606"
    else:
        name = normalized or f"p_{hashlib.sha1(column.encode()).hexdigest()[:8]}"
        if name[0].isdigit():
            name = f"p_{name}"
        kind = str(data_type or "string").lower()
        if kind == "date":
            pattern, hint, example = r"^\d{4}-\d{2}-\d{2}$", "YYYY-MM-DD", "2026-01-01"
        elif kind in {"datetime", "timestamp"}:
            pattern, hint, example = r"^\d{4}-\d{2}-\d{2}T.+$", "ISO 8601", "2026-01-01T00:00:00+00:00"
        elif kind in {"integer", "int"}:
            pattern, hint, example = r"^-?\d+$", "整数", "1"
        elif kind in {"number", "decimal", "numeric", "float", "double"}:
            pattern, hint, example = r"^-?\d+(\.\d+)?$", "数值", "1234.56"
        elif kind in {"boolean", "bool"}:
            pattern, hint, example = r"^(true|false)$", "true 或 false", "true"
        else:
            pattern, hint, example = None, None, "示例值"
    base_name = name
    suffix = 2
    while name in used_names:
        name = f"{base_name}_{suffix}"
        suffix += 1
    used_names.add(name)
    return {
        "name": name, "label": label or tail, "column": column, "op": "eq",
        "pattern": pattern, "format_hint": hint, "example": example,
    }


async def _normalize_query_parameters(
    source_table: str, settings: dict, db: AsyncSession, existing: list[dict] | None = None
) -> None:
    parameters = settings.get("query_parameters") or []
    if not parameters:
        settings["query_parameters"] = []
        return
    if not _is_report_source(source_table) or not isinstance(parameters, list):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="受控查询参数仅支持报表来源的只读 API")
    filters = {item["column"]: item for item in await _report_filter_metadata(source_table, db)}
    old_by_column = {str(item.get("column")): item for item in (existing or []) if isinstance(item, dict)}
    normalized: list[dict] = []
    seen_columns: set[str] = set()
    used_names: set[str] = set()
    for item in parameters:
        if not isinstance(item, dict):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="查询参数配置格式不正确")
        column = str(item.get("column") or "")
        if column not in filters or column in seen_columns:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="查询参数必须绑定唯一且可覆盖的报表筛选字段")
        seen_columns.add(column)
        old = old_by_column.get(column)
        rule = _parameter_rule(column, filters[column]["label"], filters[column]["data_type"], used_names)
        if old and _QUERY_PARAMETER_NAME_RE.fullmatch(str(old.get("name") or "")):
            rule.update({key: old[key] for key in ("name", "label", "pattern", "format_hint", "example") if key in old})
            used_names.add(rule["name"])
        rule["required"] = bool(item.get("required"))
        normalized.append(rule)
    settings["query_parameters"] = normalized


async def _validate_query_parameters(source_table: str, settings: dict, db: AsyncSession) -> None:
    parameters = settings.get("query_parameters") or []
    if not parameters:
        return
    if not _is_report_source(source_table):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="受控查询参数仅支持报表来源的只读 API")
    if not isinstance(parameters, list):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="query_parameters 必须为数组")
    filters = await _report_filter_metadata(source_table, db)
    allowed_columns = {item["column"] for item in filters}
    names: set[str] = set()
    for item in parameters:
        if not isinstance(item, dict):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="查询参数配置格式不正确")
        name = str(item.get("name") or "")
        column = str(item.get("column") or "")
        if not _QUERY_PARAMETER_NAME_RE.fullmatch(name) or name in names:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"查询参数名不合法或重复: {name}")
        if item.get("op", "eq") != "eq" or column not in allowed_columns:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"查询参数 {name} 未绑定可覆盖的报表筛选条件")
        pattern = item.get("pattern")
        if pattern:
            try:
                re.compile(str(pattern))
            except re.error as exc:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"查询参数 {name} 的格式规则无效") from exc
        names.add(name)


async def _runtime_filters_from_request(pt: PushTarget, request: Request, db: AsyncSession) -> list[dict[str, Any]]:
    settings = pt.settings or {}
    parameters = settings.get("query_parameters") or []
    query_params = getattr(request, "query_params", {})
    supplied = set(query_params.keys())
    if not _is_report_source(pt.source_table):
        if supplied:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="当前只读 API 不接受查询参数")
        return []
    await _validate_query_parameters(pt.source_table, settings, db)
    parameter_names = {str(item["name"]) for item in parameters}
    unknown = supplied - parameter_names
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"不支持的查询参数: {', '.join(sorted(unknown))}")
    runtime_filters: list[dict[str, Any]] = []
    for item in parameters:
        name = str(item["name"])
        value = query_params.get(name)
        if not value:
            if item.get("required"):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"缺少必填查询参数: {name}")
            continue
        pattern = item.get("pattern")
        if pattern and not re.fullmatch(str(pattern), value):
            hint = item.get("format_hint") or str(pattern)
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"查询参数 {name} 格式不正确，应为 {hint}")
        runtime_filters.append({"column": item["column"], "op": "eq", "value": value})
    return runtime_filters


def _validate_db_expose_password(payload: PushTargetIn) -> None:
    if payload.push_type != "db_expose" or not payload.secrets.get("readonly_password"):
        return
    from app.auth.password import is_strong_enough

    ok, message = is_strong_enough(payload.secrets["readonly_password"])
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=message or "密码不符合复杂度要求")


async def _ensure_system_op_for_non_report(
    source_table: str, user: User, db: AsyncSession, op: str
) -> None:
    if _is_report_source(source_table):
        return
    if not await user_has_op(user, db, "warehouse.service", op):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail=f"无权限执行 {op} 操作 (warehouse.service)",
        )

@router.get("/query-parameter-metadata")
async def query_parameter_metadata(
    source_table: str = Query(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await _ensure_report_push_editable(source_table, user, db)
    if not _is_report_source(source_table):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="当前来源不是报表，不能配置受控查询参数")
    return await _report_filter_metadata(source_table, db)


# ===== CRUD =====

@router.get("", response_model=list[PushTargetOut])
async def list_push_targets(
    source_table: str | None = Query(None),
    source_type: str | None = Query(None),
    source_id: str | None = Query(None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[PushTargetOut]:
    if _is_report_source(source_table):
        await _ensure_report_push_editable(source_table or "", user, db)
    stmt = select(PushTarget).order_by(desc(PushTarget.updated_at))
    if source_table:
        stmt = stmt.where(PushTarget.source_table == source_table)
    if source_type:
        stmt = stmt.where(PushTarget.source_type == source_type)
    if source_id:
        stmt = stmt.where(PushTarget.source_id == source_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [await _to_out(r, db) for r in rows]


@router.post("", response_model=PushTargetOut,
             dependencies=[Depends(require_any_op(("warehouse.service", "C")))])
async def create_push_target(
    payload: PushTargetIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> PushTargetOut:
    from app.core.secret_box import encrypt
    from app.warehouse.service_ref import ServiceSourceRef, SOURCE_TABLE, assert_not_ods_source, ALLOWED_SOURCE_TYPES

    # P2：统一来源协议 — 解析并写入独立列
    final_source_type = payload.source_type
    final_source_id = payload.source_id
    final_source_label = payload.source_label or ""

    if not final_source_type or not final_source_id:
        from app.warehouse.service_ref import parse_legacy_source
        ref = parse_legacy_source(payload.source_table)
        final_source_type = ref.source_type
        final_source_id = ref.source_id
        final_source_label = ref.source_label or ""

    if final_source_type and final_source_id:
        ref = ServiceSourceRef(source_type=final_source_type, source_id=final_source_id, source_label=final_source_label)
        payload.source_table = ref.to_legacy_source_table()

    # source_type 枚举校验
    if final_source_type not in ALLOWED_SOURCE_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"不支持的来源类型: {final_source_type}，允许: {sorted(ALLOWED_SOURCE_TYPES)}")

    # table 来源：查中文标签
    if final_source_type == SOURCE_TABLE and final_source_id and _is_missing_or_physical_source_label(final_source_label, payload.source_table, final_source_id):
        final_source_label = await _resolve_table_source_label(db, final_source_id, final_source_label)

    # ODS 消费红线
    if final_source_type == SOURCE_TABLE and final_source_id:
        try:
            ref = ServiceSourceRef(source_type=SOURCE_TABLE, source_id=final_source_id)
            await assert_not_ods_source(ref, db)
        except ValueError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await _ensure_report_push_editable(payload.source_table, user, db)
    await _ensure_system_op_for_non_report(payload.source_table, user, db, "C")
    await _normalize_query_parameters(payload.source_table, payload.settings, db)
    await _validate_query_parameters(payload.source_table, payload.settings, db)
    _validate_db_expose_password(payload)
    secrets_enc = {k: encrypt(v) for k, v in payload.secrets.items()}

    # api_expose：自动生成 AppID + AppSecret（如果未填）
    if payload.push_type == "api_expose":
        import secrets as py_secrets
        import string
        alnum = string.ascii_letters + string.digits
        special = string.ascii_letters + string.digits + "!@#$%^&*()_+-="
        if not payload.settings.get("app_id"):
            payload.settings["app_id"] = "".join(py_secrets.choice(alnum) for _ in range(20))
        if "app_secret" not in secrets_enc:
            raw_secret = "".join(py_secrets.choice(special) for _ in range(20))
            secrets_enc["app_secret"] = encrypt(raw_secret)

    pt = PushTarget(
        source_table=payload.source_table,
        source_type=final_source_type,
        source_id=final_source_id,
        source_label=final_source_label,
        name=payload.name,
        description=payload.description,
        push_type=payload.push_type,
        settings=payload.settings,
        secrets_encrypted=secrets_enc,
        field_mappings=payload.field_mappings,
        is_active=payload.is_active,
        created_by=user.id,
    )
    db.add(pt)
    await db.flush()

    # 自动创建调度任务
    if payload.schedule and payload.schedule != "手动触发":
        from app.scheduler.service import upsert_job
        await upsert_job(
            db, kind="push_target", business_id=pt.id,
            cron=payload.schedule, payload={"source_table": payload.source_table},
            enabled=payload.is_active,
        )

    # db_expose：先建只读账号再 commit，失败时 PushTarget 不残留
    if pt.push_type == "db_expose":
        from app.push.push_service import execute_push
        try:
            await execute_push(pt.id, db)
        except RuntimeError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await db.commit()
    await db.refresh(pt)

    return await _to_out(pt, db)


@router.get("/{pt_id}", response_model=PushTargetOut)
async def get_push_target(
    pt_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> PushTargetOut:
    pt = await db.get(PushTarget, pt_id)
    if pt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="推送目标不存在")
    await _ensure_report_push_editable(pt.source_table, user, db)
    return await _to_out(pt, db)


@router.put("/{pt_id}", response_model=PushTargetOut,
            dependencies=[Depends(require_any_op(("warehouse.service", "U")))])
async def update_push_target(
    pt_id: int,
    payload: PushTargetIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> PushTargetOut:
    from app.core.secret_box import encrypt
    from app.warehouse.service_ref import ServiceSourceRef, SOURCE_TABLE, assert_not_ods_source

    pt = await db.get(PushTarget, pt_id)
    if pt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="推送目标不存在")

    # P2：统一来源协议 — 解析并写入独立列 + source_table
    if payload.source_type and payload.source_id:
        pt.source_type = payload.source_type
        pt.source_id = payload.source_id
        pt.source_label = payload.source_label or ""
        ref = ServiceSourceRef(source_type=payload.source_type, source_id=payload.source_id, source_label=payload.source_label)
        pt.source_table = ref.to_legacy_source_table()
    elif payload.source_table:
        from app.warehouse.service_ref import parse_legacy_source
        ref = parse_legacy_source(payload.source_table)
        pt.source_type = ref.source_type
        pt.source_id = ref.source_id
        pt.source_label = ref.source_label or ""
        pt.source_table = payload.source_table

    # table 来源：查中文标签
    if pt.source_type == SOURCE_TABLE and pt.source_id and _is_missing_or_physical_source_label(pt.source_label, pt.source_table, pt.source_id):
        pt.source_label = await _resolve_table_source_label(db, pt.source_id, pt.source_label)

    # ODS 消费红线
    if pt.source_type == SOURCE_TABLE and pt.source_id:
        try:
            ref = ServiceSourceRef(source_type=SOURCE_TABLE, source_id=pt.source_id)
            await assert_not_ods_source(ref, db)
        except ValueError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await _ensure_report_push_editable(pt.source_table, user, db)
    await _ensure_report_push_editable(payload.source_table, user, db)
    await _ensure_system_op_for_non_report(pt.source_table, user, db, "U")
    await _ensure_system_op_for_non_report(payload.source_table, user, db, "U")
    await _normalize_query_parameters(pt.source_table, payload.settings, db, pt.settings.get("query_parameters") if pt.settings else None)
    await _validate_query_parameters(pt.source_table, payload.settings, db)
    _validate_db_expose_password(payload)

    pt.name = payload.name
    pt.description = payload.description
    pt.push_type = payload.push_type
    pt.settings = payload.settings
    pt.field_mappings = payload.field_mappings
    pt.is_active = payload.is_active
    if payload.secrets:
        pt.secrets_encrypted = {k: encrypt(v) for k, v in payload.secrets.items()}

    # db_expose：先建只读账号再 commit，失败时 PushTarget 不残留
    if pt.push_type == "db_expose":
        from app.push.push_service import execute_push
        try:
            await execute_push(pt.id, db)
        except RuntimeError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await db.commit()
    await db.refresh(pt)

    return await _to_out(pt, db)


@router.delete("/{pt_id}",
               dependencies=[Depends(require_any_op(("warehouse.service", "D")))])
async def delete_push_target(
    pt_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    from sqlalchemy import text
    pt = await db.get(PushTarget, pt_id)
    if pt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="推送目标不存在")
    await _ensure_report_push_editable(pt.source_table, user, db)
    await _ensure_system_op_for_non_report(pt.source_table, user, db, "D")

    if pt.push_type == "db_expose":
        from app.core.config import settings as app_settings
        from app.data.ddl import make_identifier
        from app.push.push_service import _quote_pg_identifier
        readonly_user = (pt.settings or {}).get("readonly_user")
        schema_name = (pt.settings or {}).get("schema") or make_identifier("finebi_", f"{pt.source_table}_{pt.id}")
        db_name_q = _quote_pg_identifier(app_settings.DB_NAME)
        if readonly_user:
            readonly_user_q = _quote_pg_identifier(readonly_user)
            role_exists = (
                await db.execute(
                    text("SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = :rolname)"),
                    {"rolname": readonly_user},
                )
            ).scalar_one()
            schema_exists = (
                await db.execute(
                    text("SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = :schema_name)"),
                    {"schema_name": schema_name},
                )
            ).scalar_one()
            schema_in_use = False
            if schema_exists:
                other_targets = (
                    await db.execute(
                        select(PushTarget).where(
                            PushTarget.id != pt_id,
                            PushTarget.push_type == "db_expose",
                        )
                    )
                ).scalars().all()
                schema_in_use = any((other.settings or {}).get("schema") == schema_name for other in other_targets)
            if role_exists and schema_exists:
                schema_q = _quote_pg_identifier(schema_name)
                await db.execute(text(f"REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA {schema_q} FROM {readonly_user_q}"))
                await db.execute(text(f"REVOKE ALL PRIVILEGES ON SCHEMA {schema_q} FROM {readonly_user_q}"))
            if role_exists:
                await db.execute(text(f"DROP OWNED BY {readonly_user_q}"))
            if schema_exists and not schema_in_use:
                schema_q = _quote_pg_identifier(schema_name)
                await db.execute(text(f"DROP SCHEMA IF EXISTS {schema_q} CASCADE"))
            if role_exists:
                await db.execute(text(f"REVOKE CONNECT ON DATABASE {db_name_q} FROM {readonly_user_q}"))
                await db.execute(text(f"DROP USER IF EXISTS {readonly_user_q}"))

    from app.scheduler.models import JobRun, ScheduledJob
    await db.execute(
        delete(JobRun).where(JobRun.kind == "push_target", JobRun.business_id == pt_id)
    )
    await db.execute(
        delete(ScheduledJob).where(ScheduledJob.kind == "push_target", ScheduledJob.business_id == pt_id)
    )
    await db.delete(pt)
    await db.commit()
    return {"ok": True}


# ===== 手动触发 =====

@router.post("/{pt_id}/run",
             dependencies=[Depends(require_any_op(("warehouse.service", "C")))])
async def run_push_target(
    pt_id: int,
    payload: RunIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.push.push_service import execute_push

    pt = await db.get(PushTarget, pt_id)
    if pt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="推送目标不存在")
    await _ensure_report_push_editable(pt.source_table, user, db)
    await _ensure_system_op_for_non_report(pt.source_table, user, db, "C")
    rows, message = await execute_push(pt_id, db, period_ym=payload.period_ym)
    await db.commit()
    return {"ok": True, "rows": rows, "message": message}


# ===== 推送历史 =====

@router.get("/{pt_id}/runs")
async def list_push_runs(
    pt_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    from app.scheduler.models import JobRun
    rows = (
        await db.execute(
            select(JobRun)
            .where(JobRun.kind == "push_target", JobRun.business_id == pt_id)
            .order_by(desc(JobRun.started_at))
            .limit(50)
        )
    ).scalars().all()
    return [
        {
            "id": r.id,
            "status": r.status,
            "rows": r.rows,
            "message": r.message,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "triggered_by": r.triggered_by,
        }
        for r in rows
    ]


@router.get("/{pt_id}/query-parameters")
async def get_query_parameter_metadata(
    pt_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    pt = await db.get(PushTarget, pt_id)
    if pt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="推送目标不存在")
    await _ensure_report_push_editable(pt.source_table, user, db)
    if not _is_report_source(pt.source_table):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="当前来源不是报表，不能配置受控查询参数")
    return await _report_filter_metadata(pt.source_table, db)


def _documentation_sample_value(data_type: str) -> Any:
    kind = str(data_type or "").lower()
    if kind in {"number", "integer", "decimal", "float", "double", "numeric"}:
        return 0
    if kind == "date":
        return "2026-01-01"
    if kind in {"datetime", "timestamp"}:
        return "2026-01-01T00:00:00+00:00"
    if kind in {"boolean", "bool"}:
        return False
    return "示例值"


def _mask_url(url: str) -> str:
    return str(url or "").split("?", 1)[0]


async def _build_integration_documentation(pt: PushTarget, db: AsyncSession) -> str:
    from app.push.push_service import _load_source_columns_meta

    settings = pt.settings or {}
    codes, labels, types = await _load_source_columns_meta(pt.source_table, db)
    mappings = {str(item.get("source")): str(item.get("target")) for item in (pt.field_mappings or []) if item.get("source") and item.get("target")}
    output_codes = [mappings.get(code, code) for code in codes]
    output_labels = {mappings.get(code, code): labels.get(code, code) for code in codes}
    output_types = {mappings.get(code, code): types.get(code, "string") for code in codes}
    sample = {code: _documentation_sample_value(output_types[code]) for code in output_codes}
    source_label = pt.source_label or pt.source_table
    from app.core.config import settings as app_settings

    lines = [
        f"{pt.name}—对接说明", "",
        "一、接口概览",
        f"接口名称：{pt.name}",
        f"推送方式：{pt.push_type}",
        f"来源资产：{source_label}",
        f"来源标识：{pt.source_table}",
        f"启用状态：{'启用' if pt.is_active else '停用'}",
    ]
    if pt.push_type == "api_expose":
        base_url = str(app_settings.PUBLIC_BASE_URL or "").rstrip("/")
        if not base_url.startswith("https://"):
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="请由 HR Portal 管理员配置 PUBLIC_BASE_URL 为 HTTPS 生产访问地址")
        parameters = settings.get("query_parameters") or []
        query = "&".join(
            f"{item.get('name')}={item.get('example')}"
            for item in parameters if item.get("name") and item.get("example")
        )
        endpoint = f"{base_url}/api/v1/push-targets/{pt.id}/data"
        request_url = f"{endpoint}?{query}" if query else endpoint
        lines += [
            "调用方式：对方系统主动拉取", "请求方法：GET",
            f"接口地址：{request_url}",
            "返回格式：JSON 数组；当前不分页。", "",
            "二、鉴权请求头",
            "Header：X-App-Id", "是否必传：是", "取值：由 HR Portal 管理员通过受控渠道单独提供。", "",
            "Header：X-App-Secret", "是否必传：是", "取值：由 HR Portal 管理员通过受控渠道单独提供。", "",
            "Header：Accept", "是否必传：建议", "取值：application/json", "",
            "三、查询参数",
        ]
        if parameters:
            for item in parameters:
                required = "是" if item.get("required") else "否"
                lines += [
                    f"参数名：{item.get('name')}",
                    f"中文名称：{item.get('label') or item.get('column')}",
                    f"是否必传：{required}",
                    f"格式：{item.get('format_hint') or '不限'}",
                    f"示例：{item.get('example') or ''}",
                    "",
                ]
            lines.append("说明：必填参数缺失、格式错误或传入未登记参数时，接口返回 HTTP 400。")
        else:
            lines.append("无。")
        lines += [
            "", "四、cURL 调用示例",
            f'curl --request GET "{request_url}" \\\n  --header "X-App-Id: 由HRPortal管理员单独提供的AppID" \\\n  --header "X-App-Secret: 由HRPortal管理员单独提供的AppSecret" \\\n  --header "Accept: application/json"', "",
            "五、Python 调用示例",
            "import requests\n\nresponse = requests.get(\n"
            f"    \"{request_url}\",\n"
            "    headers={\n"
            "        \"X-App-Id\": \"由HRPortal管理员单独提供的AppID\",\n"
            "        \"X-App-Secret\": \"由HRPortal管理员单独提供的AppSecret\",\n"
            "        \"Accept\": \"application/json\",\n"
            "    },\n    timeout=30,\n)\nresponse.raise_for_status()\nrows = response.json()",
        ]
    elif pt.push_type == "http_push":
        lines += ["", "二、鉴权请求头", "如配置 Bearer Token，由 HR Portal 在服务端发送；本文档不包含 Token。", "", "三、cURL 调用示例", f"平台将以 {settings.get('method', 'POST')} 请求 {_mask_url(settings.get('url', ''))}。", "", "四、Python 调用示例", "由 HR Portal 后台主动推送，无需对方调用。"]
    elif pt.push_type == "external_db":
        lines += ["", "二、鉴权请求头", "通过数据库账号鉴权；密码由管理员受控交付。", "", "三、cURL 调用示例", "不适用：平台主动写入对方数据库。", "", "四、Python 调用示例", f"目标：{settings.get('dialect', 'mysql')}://{settings.get('host', '')}:{settings.get('port', '')}/{settings.get('database', '')}，表：{settings.get('target_table', '')}。"]
    elif pt.push_type == "db_expose":
        lines += ["", "二、鉴权请求头", "通过只读数据库账号鉴权；密码由管理员受控交付。", "", "三、cURL 调用示例", "不适用：对方使用 PostgreSQL/JDBC 客户端连接。", "", "四、Python 调用示例", f"连接信息：host={settings.get('host', '')} port={settings.get('port', '')} database={settings.get('database', '')} schema={settings.get('schema', '')} table={settings.get('view') or settings.get('table', '')} user={settings.get('readonly_user', '')}。"]
    else:
        lines += ["", "二、鉴权请求头", "飞书应用凭证由管理员受控配置，本文档不包含 App Secret。", "", "三、cURL 调用示例", "不适用：平台主动写入飞书在线表格。", "", "四、Python 调用示例", f"目标 Sheet：{settings.get('sheet_id') or '默认工作表'}，起始单元格：{settings.get('start_cell', 'A1')}。"]

    response_start = 6 if pt.push_type == "api_expose" else 5
    lines += [
        f"", f"{['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][response_start]}、接口原始响应示例", json.dumps([sample], ensure_ascii=False, indent=2),
        "", f"{['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][response_start + 1]}、字段名称对照表",
    ]
    for code in output_codes:
        lines.append(f"{code}：{output_labels[code]}（{output_types[code]}）")
    lines += [
        "", f"{['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][response_start + 2]}、业务阅读版响应示例", json.dumps([{output_labels[code]: sample[code] for code in output_codes}], ensure_ascii=False, indent=2),
        "", f"{['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][response_start + 3]}、返回状态说明",
    ]
    if pt.push_type == "api_expose":
        lines += ["200：请求成功。", "400：查询参数缺失、格式错误或未登记。", "401：AppID 或 AppSecret 错误。", "403：来源 IP 不在白名单，或白名单为空。", "404：配置不存在、已停用或不是 API 暴露类型。", "500：服务端读取异常。"]
    else:
        lines += ["成功：以推送记录显示 success 为准。", "失败：以推送记录中的错误信息为准，由 HR Portal 管理员处理。"]
    lines += [
        "", f"{['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][response_start + 4]}、接入与安全约定",
        "1. X-App-Id、X-App-Secret、密码、Token 和 App Secret 必须通过受控渠道交付，不得写入文档、邮件、群聊、代码或日志。",
        "2. 请按最小权限、访问审计和数据留存要求处理数据。",
        "3. 配置停用后不应继续使用；只读 API 的 IP 白名单为空时拒绝所有访问。",
    ]
    return "\n".join(lines) + "\n"


@router.get("/{pt_id}/integration-documentation")
async def download_integration_documentation(
    pt_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    pt = await db.get(PushTarget, pt_id)
    if pt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="推送目标不存在")
    await _ensure_report_push_editable(pt.source_table, user, db)
    await _ensure_system_op_for_non_report(pt.source_table, user, db, "R")
    content = (await _build_integration_documentation(pt, db)).encode("utf-8")
    filename = f"push-target-{pt.id}-integration.txt"
    return StreamingResponse(
        iter([content]), media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ===== 查看敏感字段（管理员用）=====

@router.get("/{pt_id}/reveal",
            dependencies=[Depends(require_op("system.users", "U"))])
async def reveal_secrets(
    pt_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.core.secret_box import decrypt
    pt = await db.get(PushTarget, pt_id)
    if pt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="推送目标不存在")
    result = {k: decrypt(v) for k, v in (pt.secrets_encrypted or {}).items()}
    # api_expose：AppID 存在 settings 里，一并返回
    if pt.push_type == "api_expose" and (pt.settings or {}).get("app_id"):
        result["app_id"] = pt.settings["app_id"]
    return result


# ===== api_expose：对方拉取数据 =====

@router.get("/{pt_id}/data")
async def expose_data(
    pt_id: int,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    from app.core.secret_box import decrypt
    from app.push.push_service import _load_source_rows, apply_field_mappings, json_ready_row

    pt = await db.get(PushTarget, pt_id)
    if pt is None or pt.push_type != "api_expose" or not pt.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    secrets = {k: decrypt(v) for k, v in (pt.secrets_encrypted or {}).items()}
    s = pt.settings or {}

    # AppID + AppSecret 验证
    req_app_id = request.headers.get("X-App-Id", "")
    req_app_secret = request.headers.get("X-App-Secret", "")
    if not req_app_id or req_app_id != s.get("app_id", ""):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="AppID 无效")
    if secrets.get("app_secret") and req_app_secret != secrets.get("app_secret", ""):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="AppSecret 无效")

    # IP 白名单校验
    ip_whitelist: list[str] = s.get("ip_whitelist") or []
    if not ip_whitelist:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="未配置 IP 白名单")
    client_ip = request.client.host if request.client else ""
    if client_ip not in ip_whitelist:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"IP {client_ip} 不在白名单")

    runtime_filters = await _runtime_filters_from_request(pt, request, db)
    # P2: 统一来源协议 — 非 table 类型解析来源表名
    from app.warehouse.service_ref import resolve_source_table_name
    effective_source = pt.source_table
    if pt.source_type and pt.source_type != "table":
        effective_source = await resolve_source_table_name(pt.source_type, pt.source_id, db)
    if _is_report_source(effective_source):
        from app.reports.models import Report
        from app.reports.router import collect_report_push_rows

        report = await db.get(Report, _report_source_id(effective_source))
        if report is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
        rows, _ = await collect_report_push_rows(report, db, runtime_filters=runtime_filters)
    else:
        rows = await _load_source_rows(effective_source, db, s.get("period_ym", ""))
    return [
        json_ready_row(apply_field_mappings(r, pt.field_mappings or []))
        for r in rows
    ]
