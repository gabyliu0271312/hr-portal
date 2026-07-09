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
    # P1 新增：统一来源协议（过渡期与 source_table 并存，优先用新字段）
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

def _to_out(pt: PushTarget) -> PushTargetOut:
    # P1：优先从 settings.source_ref 读取，其次从旧 source_table 推导
    source_ref = (pt.settings or {}).get("source_ref")
    if source_ref and isinstance(source_ref, dict):
        st, sid, sl = source_ref.get("source_type", ""), source_ref.get("source_id", ""), source_ref.get("source_label", "")
    else:
        from app.warehouse.service_ref import parse_legacy_source
        ref = parse_legacy_source(pt.source_table)
        st, sid, sl = ref.source_type, ref.source_id, ref.source_label or ""

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
        source_type=st,
        source_id=sid,
        source_label=sl,
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
    return str(source_table or "").startswith("report:")


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
    if not await user_has_op(user, db, "system.users", op):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail=f"无权限执行 {op} 操作 (system.users)",
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
    rows = (await db.execute(stmt)).scalars().all()

    # P1: settings JSON 中的 source_ref 不支持 DB 层过滤，Python 后过滤
    results = [_to_out(r) for r in rows]
    if source_type:
        results = [r for r in results if r.source_type == source_type]
    if source_id:
        results = [r for r in results if str(r.source_id) == source_id]
    return results


@router.post("", response_model=PushTargetOut,
             dependencies=[Depends(require_any_op(("system.users", "C"), ("report.list", "C")))])
async def create_push_target(
    payload: PushTargetIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> PushTargetOut:
    from app.core.secret_box import encrypt
    from app.warehouse.service_ref import ServiceSourceRef, SOURCE_TABLE, assert_not_ods_source

    # P1：统一来源协议 — 优先用新字段，否则从 source_table 推导
    if payload.source_type and payload.source_id:
        source_ref = {
            "source_type": payload.source_type,
            "source_id": payload.source_id,
            "source_label": payload.source_label or "",
        }
        if not payload.source_table:
            ref = ServiceSourceRef(
                source_type=payload.source_type,
                source_id=payload.source_id,
                source_label=payload.source_label,
            )
            payload.source_table = ref.to_legacy_source_table()
    else:
        from app.warehouse.service_ref import parse_legacy_source
        ref = parse_legacy_source(payload.source_table)
        source_ref = {
            "source_type": ref.source_type,
            "source_id": ref.source_id,
            "source_label": ref.source_label or "",
        }

    # ODS 消费红线：table 类型且来源为 ODS → 拒绝
    if source_ref["source_type"] == SOURCE_TABLE and source_ref["source_id"]:
        try:
            ref = ServiceSourceRef(
                source_type=SOURCE_TABLE,
                source_id=source_ref["source_id"],
            )
            await assert_not_ods_source(ref, db)
        except ValueError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    # 存到 settings.source_ref（P2 迁移到独立列）
    payload.settings["source_ref"] = source_ref

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

    await db.commit()
    await db.refresh(pt)

    # db_expose：保存时自动创建只读账号
    if pt.push_type == "db_expose":
        try:
            from app.push.push_service import execute_push
            await execute_push(pt.id, db)
            await db.commit()
            await db.refresh(pt)
        except Exception as e:
            import logging
            logging.getLogger("push").error("[db_expose] 账号创建失败: %s", e, exc_info=True)

    return _to_out(pt)


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
    return _to_out(pt)


@router.put("/{pt_id}", response_model=PushTargetOut,
            dependencies=[Depends(require_any_op(("system.users", "U"), ("report.list", "U")))])
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

    # P1：统一来源协议 — 优先用新字段
    if payload.source_type and payload.source_id:
        source_ref = {
            "source_type": payload.source_type,
            "source_id": payload.source_id,
            "source_label": payload.source_label or "",
        }
        if not payload.source_table:
            ref = ServiceSourceRef(
                source_type=payload.source_type,
                source_id=payload.source_id,
                source_label=payload.source_label,
            )
            payload.source_table = ref.to_legacy_source_table()
    else:
        from app.warehouse.service_ref import parse_legacy_source
        ref = parse_legacy_source(payload.source_table or pt.source_table)
        source_ref = {
            "source_type": ref.source_type,
            "source_id": ref.source_id,
            "source_label": ref.source_label or "",
        }

    # ODS 消费红线
    if source_ref["source_type"] == SOURCE_TABLE and source_ref["source_id"]:
        try:
            ref = ServiceSourceRef(
                source_type=SOURCE_TABLE,
                source_id=source_ref["source_id"],
            )
            await assert_not_ods_source(ref, db)
        except ValueError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    # 存到 settings.source_ref
    payload.settings["source_ref"] = source_ref

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

    await db.commit()
    await db.refresh(pt)

    # db_expose：保存时自动创建/更新只读账号
    if pt.push_type == "db_expose":
        try:
            from app.push.push_service import execute_push
            await execute_push(pt.id, db)
            await db.commit()
            await db.refresh(pt)
        except Exception as e:
            import logging
            logging.getLogger("push").error("[db_expose] 账号创建失败: %s", e, exc_info=True)

    return _to_out(pt)


@router.delete("/{pt_id}",
               dependencies=[Depends(require_any_op(("system.users", "D"), ("report.list", "D")))])
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
             dependencies=[Depends(require_any_op(("system.users", "C"), ("report.list", "C")))])
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
    rows = await _load_source_rows(pt.source_table, db, period_ym)
    return [
        json_ready_row(apply_field_mappings(r, pt.field_mappings or []))
        for r in rows
    ]
