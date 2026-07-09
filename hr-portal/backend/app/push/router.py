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

from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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
    RegisteredTable.table_label before returning/saving it.
    """
    normalized_label = str(label or "").strip()
    if not normalized_label:
        return True
    return any(
        normalized_label == str(name or "").strip()
        for name in physical_names
        if str(name or "").strip()
    )


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
        from app.data.models import RegisteredTable
        row = await db.execute(
            select(RegisteredTable.table_label).where(RegisteredTable.table_name == effective_source_id)
        )
        tl = row.scalar_one_or_none()
        label = tl or effective_source_id

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
        try:
            from app.data.models import RegisteredTable
            row = await db.execute(
                select(RegisteredTable.table_label).where(RegisteredTable.table_name == final_source_id)
            )
            tl = row.scalar_one_or_none()
            if tl:
                final_source_label = tl
        except Exception:
            pass

    # ODS 消费红线
    if final_source_type == SOURCE_TABLE and final_source_id:
        try:
            ref = ServiceSourceRef(source_type=SOURCE_TABLE, source_id=final_source_id)
            await assert_not_ods_source(ref, db)
        except ValueError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await _ensure_report_push_editable(payload.source_table, user, db)
    await _ensure_system_op_for_non_report(payload.source_table, user, db, "C")
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
        try:
            from app.data.models import RegisteredTable
            row = await db.execute(
                select(RegisteredTable.table_label).where(RegisteredTable.table_name == pt.source_id)
            )
            tl = row.scalar_one_or_none()
            if tl:
                pt.source_label = tl
        except Exception:
            pass

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
    if pt is None or pt.push_type != "api_expose":
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
    if ip_whitelist:
        client_ip = request.client.host if request.client else ""
        if client_ip not in ip_whitelist:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"IP {client_ip} 不在白名单")

    period_ym = s.get("period_ym", "")
    # P2: 统一来源协议 — 非 table 类型解析来源表名
    from app.warehouse.service_ref import resolve_source_table_name
    effective_source = pt.source_table
    if pt.source_type and pt.source_type != "table":
        effective_source = await resolve_source_table_name(pt.source_type, pt.source_id, db)
    rows = await _load_source_rows(effective_source, db, period_ym)
    return [
        json_ready_row(apply_field_mappings(r, pt.field_mappings or []))
        for r in rows
    ]
