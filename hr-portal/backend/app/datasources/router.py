"""数据源 / 接口配置 路由

- GET    /datasources             列出所有数据源（带最近同步状态）
- GET    /datasources/{id}        详情（不返回密文）
- PUT    /datasources/{id}        更新配置（settings + secrets，secrets 加密）
- DELETE /datasources/{id}        删除数据源（级联清理 SyncRun + 调度任务）
- POST   /datasources/{id}/test   测试连接（不存库，仅调 token）
- POST   /datasources/{id}/sync   触发拉取，落库到对应业务表
- GET    /datasources/{id}/runs   同步历史
"""
from datetime import datetime, UTC
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.core.secret_box import decrypt, encrypt
from app.datasources.beisen_client import make_client
from app.data.models import RegisteredTable, TableColumn
from app.datasources.models import DataSource, SyncRun
from app.datasources.sync_service import sync_to_table
from app.users.models import User

router = APIRouter(prefix="/datasources", tags=["datasources"])

_SYNC_SEMANTICS = {"full_snapshot", "incremental_append", "incremental_upsert"}
_WRITE_STRATEGIES = {"full_refresh", "incremental_upsert", "append"}
_MISSING_ROW_STRATEGIES = {"hard_delete", "mark_inactive", "keep_history"}


_INGESTION_MODES = {"current_snapshot", "incremental_upsert", "append", "period_full_snapshot"}
_MODE_POLICIES = {
    "current_snapshot": ("full_snapshot", "incremental_upsert", "mark_inactive"),
    "incremental_upsert": ("incremental_upsert", "incremental_upsert", "keep_history"),
    "append": ("incremental_append", "append", "keep_history"),
    "period_full_snapshot": ("full_snapshot", "incremental_upsert", "hard_delete"),
}


def _validate_write_policy(
    sync_semantics: str | None,
    write_strategy: str | None,
    missing_row_strategy: str | None,
    business_key_fields: list[str],
) -> None:
    if any(value is not None for value in (sync_semantics, write_strategy, missing_row_strategy)):
        if sync_semantics not in _SYNC_SEMANTICS or write_strategy not in _WRITE_STRATEGIES or missing_row_strategy not in _MISSING_ROW_STRATEGIES:
            raise HTTPException(422, "入仓更新策略无效")
        if write_strategy == "incremental_upsert" and not business_key_fields:
            raise HTTPException(422, "增量更新策略必须配置业务主键")


async def _resolve_ingestion_policy(
    db: AsyncSession, table_name: str, ingestion_mode: str | None
) -> tuple[str | None, str | None, str | None, list[str]]:
    if ingestion_mode is None:
        return None, None, None, []
    if ingestion_mode not in _INGESTION_MODES:
        raise HTTPException(422, "入仓方式无效")
    asset = await db.scalar(select(RegisteredTable).where(RegisteredTable.table_name == table_name))
    if asset is None:
        raise HTTPException(422, "目标数据资产不存在")
    if ingestion_mode == "period_full_snapshot" and not asset.is_period:
        raise HTTPException(422, "按期间覆盖仅适用于已登记期间字段的月度资产")
    keys = list((await db.execute(
        select(TableColumn.column_code)
        .where(TableColumn.table_name == table_name, TableColumn.is_pk_part.is_(True))
        .order_by(TableColumn.display_order)
    )).scalars())
    if ingestion_mode in {"current_snapshot", "incremental_upsert", "period_full_snapshot"} and not keys:
        raise HTTPException(422, "请先在字段管理中标记业务主键")
    return (*_MODE_POLICIES[ingestion_mode], keys)

# ===== 哪些字段是敏感字段（需加密）=====
SECRET_KEYS = {
    "BEISEN_APP_KEY",
    "BEISEN_APP_SECRET",
    "BEISEN_API_APP_KEY",
    "BEISEN_API_APP_SECRET",
    "HTTP_CREDENTIAL",
    "WEBHOOK_TOKEN",
    "DB_PASSWORD",
    "FEISHU_APP_ID",
    "FEISHU_APP_SECRET",
}


# ===== Schemas =====


class DataSourceOut(BaseModel):
    id: int
    table_name: str
    table_label: str
    source_type: str
    schedule: str
    settings: dict[str, Any]
    # 不返回密文，仅返回是否已配置
    has_secret: dict[str, bool]
    is_active: bool
    ingestion_mode: str | None
    sync_semantics: str | None
    write_strategy: str | None
    missing_row_strategy: str | None
    business_key_fields: list[str]
    last_sync_at: datetime | None
    last_status: str
    last_rows: int | None
    last_message: str | None


class DataSourceCreateIn(BaseModel):
    """创建 DataSource（T0211）"""
    table_name: str
    table_label: str = ""
    source_type: str = "http_api"
    schedule: str = ""
    is_active: bool = True
    ingestion_mode: str | None = None
    sync_semantics: str | None = None
    write_strategy: str | None = None
    missing_row_strategy: str | None = None
    business_key_fields: list[str] = Field(default_factory=list)


class DataSourceUpdateIn(BaseModel):
    table_label: str | None = None
    source_type: str | None = None
    schedule: str = "手动触发"
    settings: dict[str, Any] = Field(default_factory=dict)
    # secrets 是明文输入；后端加密后存
    secrets: dict[str, str] = Field(default_factory=dict)
    is_active: bool = True
    ingestion_mode: str | None = None
    sync_semantics: str | None = None
    write_strategy: str | None = None
    missing_row_strategy: str | None = None
    business_key_fields: list[str] = Field(default_factory=list)


class TestResult(BaseModel):
    ok: bool
    message: str
    token_preview: str | None = None


class SyncResult(BaseModel):
    ok: bool
    rows: int = 0
    message: str
    started_at: datetime
    finished_at: datetime | None = None


class SyncRunOut(BaseModel):
    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    rows: int | None
    message: str | None
    triggered_by: str


class DiscoveredFieldOut(BaseModel):
    source_key: str
    label: str
    column_code: str
    sample_values: list[Any] = Field(default_factory=list)
    is_yearmonth: bool = False


# ===== 工具：把 ORM → DTO =====


def _to_out(ds: DataSource) -> DataSourceOut:
    return DataSourceOut(
        id=ds.id,
        table_name=ds.table_name,
        table_label=ds.table_label,
        source_type=ds.source_type,
        schedule=ds.schedule,
        settings=ds.settings or {},
        has_secret={k: bool(v) for k, v in (ds.secrets_encrypted or {}).items()},
        is_active=ds.is_active,
        ingestion_mode=getattr(ds, "ingestion_mode", None),
        sync_semantics=ds.sync_semantics,
        write_strategy=ds.write_strategy,
        missing_row_strategy=ds.missing_row_strategy,
        business_key_fields=list(ds.business_key_fields or []),
        last_sync_at=ds.last_sync_at,
        last_status=ds.last_status,
        last_rows=ds.last_rows,
        last_message=ds.last_message,
    )


def _decrypt_secrets(ds: DataSource) -> dict[str, str]:
    return {k: decrypt(v) for k, v in (ds.secrets_encrypted or {}).items()}


# ===== Endpoints =====


@router.get("/types")
async def list_connector_types_endpoint(
    consumer: str | None = Query(None, pattern="^(warehouse|ucp)$"),
    _: User = Depends(current_user),
) -> dict[str, list[dict[str, Any]]]:
    """Return non-sensitive connector metadata shared by product modules."""
    from app.connectors.catalog import list_connector_types

    return {"items": list_connector_types(consumer)}


@router.get("", response_model=list[DataSourceOut])
async def list_datasources(
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[DataSourceOut]:
    rows = (
        (await db.execute(select(DataSource).order_by(DataSource.id))).scalars().all()
    )
    return [_to_out(r) for r in rows]


@router.post("", response_model=DataSourceOut,
              dependencies=[Depends(require_op("datasource.endpoints", "C"))])
async def create_datasource(
    body: DataSourceCreateIn,
    response: Response,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> DataSourceOut:
    """确保一张表拥有唯一 DataSource；已有记录直接复用，完整配置由 PUT 保存。"""
    if body.ingestion_mode:
        sync_semantics, write_strategy, missing_row_strategy, business_key_fields = await _resolve_ingestion_policy(db, body.table_name, body.ingestion_mode)
    else:
        _validate_write_policy(body.sync_semantics, body.write_strategy, body.missing_row_strategy, body.business_key_fields)
        sync_semantics, write_strategy, missing_row_strategy, business_key_fields = body.sync_semantics, body.write_strategy, body.missing_row_strategy, body.business_key_fields
    insert_stmt = (
        pg_insert(DataSource)
        .values(
            table_name=body.table_name,
            table_label=body.table_label or body.table_name,
            source_type=body.source_type,
            schedule=body.schedule or "",
            is_active=body.is_active,
            ingestion_mode=body.ingestion_mode,
            sync_semantics=sync_semantics,
            write_strategy=write_strategy,
            missing_row_strategy=missing_row_strategy,
            business_key_fields=business_key_fields,
        )
        .on_conflict_do_nothing(index_elements=["table_name"])
        .returning(DataSource.id)
    )
    created_id = (await db.execute(insert_stmt)).scalar_one_or_none()
    await db.commit()
    if created_id is None:
        response.status_code = status.HTTP_200_OK
        ds = await db.scalar(select(DataSource).where(DataSource.table_name == body.table_name))
    else:
        ds = await db.get(DataSource, created_id)
    if ds is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="数据源创建冲突，请重试")
    return _to_out(ds)


@router.get("/{ds_id}", response_model=DataSourceOut)
async def get_datasource(
    ds_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> DataSourceOut:
    ds = await db.get(DataSource, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据源不存在")
    return _to_out(ds)


@router.put(
    "/{ds_id}",
    response_model=DataSourceOut,
    dependencies=[Depends(require_op("datasource.endpoints", "U"))],
)
async def update_datasource(
    ds_id: int,
    payload: DataSourceUpdateIn,
    db: AsyncSession = Depends(get_session),
) -> DataSourceOut:
    ds = await db.get(DataSource, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据源不存在")

    ds.source_type = payload.source_type
    ds.schedule = payload.schedule
    ds.is_active = payload.is_active
    ds.settings = dict(payload.settings)
    if payload.ingestion_mode:
        sync_semantics, write_strategy, missing_row_strategy, business_key_fields = await _resolve_ingestion_policy(db, ds.table_name, payload.ingestion_mode)
    else:
        _validate_write_policy(payload.sync_semantics, payload.write_strategy, payload.missing_row_strategy, payload.business_key_fields)
        sync_semantics, write_strategy, missing_row_strategy, business_key_fields = payload.sync_semantics, payload.write_strategy, payload.missing_row_strategy, payload.business_key_fields
    ds.ingestion_mode = payload.ingestion_mode
    ds.sync_semantics = sync_semantics
    ds.write_strategy = write_strategy
    ds.missing_row_strategy = missing_row_strategy
    ds.business_key_fields = business_key_fields

    # 凭证处理：保留原密文 + 覆盖新提交的字段（空串忽略 = 不变更）
    new_secrets: dict[str, str] = dict(ds.secrets_encrypted or {})
    for k, v in payload.secrets.items():
        if v:
            new_secrets[k] = encrypt(v)
        elif k in new_secrets:
            # 显式传空字符串 = 清空该凭证（取消禁用判断让它变 stub）
            new_secrets.pop(k, None)
    ds.secrets_encrypted = new_secrets

    await db.commit()
    await db.refresh(ds)

    # 同步到调度器：upsert scheduled_jobs + 热加载
    from app.scheduler.engine import get_engine
    from app.scheduler.service import upsert_job
    job = await upsert_job(
        db,
        kind="datasource_sync",
        business_id=ds.id,
        cron=ds.schedule,
        payload={"table_name": ds.table_name},
        enabled=ds.is_active,
    )
    await db.commit()
    try:
        await get_engine().reload_job(job.id)
    except RuntimeError:
        # scheduler 未启动（如测试环境），忽略
        pass

    return _to_out(ds)


@router.delete(
    "/{ds_id}",
    dependencies=[Depends(require_op("datasource.endpoints", "D"))],
)
async def delete_datasource(
    ds_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    """删除数据源配置。

    - 级联清理 SyncRun（数据库 ondelete=CASCADE）
    - 清理关联的 ScheduledJob（kind=datasource_sync, business_id=ds_id）
    - 从 APScheduler 移除运行中的 cron job
    """
    from app.scheduler.engine import get_engine
    from app.scheduler.models import ScheduledJob
    from app.scheduler.service import get_job_by_business

    ds = await db.get(DataSource, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据源不存在")

    # 1. 清理调度任务
    job = await get_job_by_business(db, "datasource_sync", ds_id)
    if job:
        # 从 APScheduler 移除
        try:
            engine = get_engine()
            if engine._scheduler is not None:
                existing = engine._scheduler.get_job(engine._job_key(job.id))
                if existing:
                    existing.remove()
        except RuntimeError:
            pass  # scheduler 未启动，忽略
        # 删除 DB 记录
        await db.delete(job)

    # 2. 删除 DataSource（SyncRun 通过 ondelete=CASCADE 自动清理）
    await db.delete(ds)
    await db.commit()

    return {"ok": True}


@router.post(
    "/{ds_id}/test",
    response_model=TestResult,
    dependencies=[Depends(require_op("datasource.endpoints", "U"))],
)
async def test_datasource(
    ds_id: int,
    payload: DataSourceUpdateIn | None = None,
    db: AsyncSession = Depends(get_session),
) -> TestResult:
    """测试连接：仅调 token 接口验证凭证可用，不存库

    支持两种调用：
    - 不带 body：使用已保存的配置
    - 带 body：使用抽屉里临时填写的配置（未保存）
    """
    ds = await db.get(DataSource, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据源不存在")

    if payload:
        source_type = payload.source_type
        settings = dict(payload.settings)
        # 临时凭证：明文 + 已加密的 fallback
        secrets = {**_decrypt_secrets(ds)}
        for k, v in payload.secrets.items():
            if v:
                secrets[k] = v
    else:
        source_type = ds.source_type
        settings = ds.settings or {}
        secrets = _decrypt_secrets(ds)

    try:
        client = make_client(source_type, settings, secrets)
        if hasattr(client, "get_token"):
            token = await client.get_token()
            return TestResult(
                ok=True,
                message="连接成功",
                token_preview=token[:8] + "..." if token else None,
            )
        return TestResult(ok=True, message="该接入类型无 token 概念，跳过测试")
    except Exception as e:
        return TestResult(ok=False, message=str(e))


@router.post(
    "/{ds_id}/discover-fields",
    response_model=list[DiscoveredFieldOut],
    dependencies=[Depends(require_op("datasource.endpoints", "U"))],
)
async def discover_datasource_fields(
    ds_id: int,
    db: AsyncSession = Depends(get_session),
) -> list[DiscoveredFieldOut]:
    from app.codegen.rules import deterministic_code, unique_code
    from app.datasources.sync_service import _normalize_yyyymm
    from app.data.models import TableColumn

    ds = await db.get(DataSource, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据源不存在")
    client = make_client(ds.source_type, ds.settings or {}, _decrypt_secrets(ds))
    if not hasattr(client, "discover_fields"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="该数据源类型暂不支持字段发现")
    fields = await client.discover_fields()
    existing = (
        await db.execute(select(TableColumn).where(TableColumn.table_name == ds.table_name))
    ).scalars().all()
    label_codes = {column.column_label: column.column_code for column in existing}
    used_codes = {column.column_code for column in existing}
    result = []
    for field in fields:
        label = str(field["label"])
        code = label_codes.get(label) or unique_code(deterministic_code(label), used_codes)
        used_codes.add(code)
        samples = list(field.get("sample_values") or [])
        result.append(DiscoveredFieldOut(
            source_key=str(field["source_key"]),
            label=label,
            column_code=code,
            sample_values=samples,
            is_yearmonth=any(bool(_normalize_yyyymm(value)) for value in samples),
        ))
    return result


@router.post(
    "/{ds_id}/sync",
    response_model=SyncResult,
    dependencies=[Depends(require_op("datasource.endpoints", "U"))],
)
async def sync_datasource(
    ds_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> SyncResult:
    """触发拉取 — 走通用 scheduler.engine.run_job_now，与 cron 触发同一路径"""
    from app.data.models import RegisteredTable, TableColumn
    from app.scheduler.engine import get_engine
    from app.scheduler.service import get_job_by_business, upsert_job

    ds = await db.get(DataSource, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据源不存在")

    table = await db.scalar(
        select(RegisteredTable).where(RegisteredTable.table_name == ds.table_name)
    )
    if table and table.is_period and table.period_source == "field":
        period_column = await db.scalar(
            select(TableColumn).where(
                TableColumn.table_name == ds.table_name,
                TableColumn.column_code == table.period_col,
                TableColumn.is_pk_part.is_(True),
            )
        )
        if period_column is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="请先在来源与开放中发现字段并保存实际期间字段，再同步",
            )

    # 兜底：若该 ds 还没对应的 scheduled_job（历史数据 / 首次启动），现场建一条
    job = await get_job_by_business(db, "datasource_sync", ds.id)
    if job is None:
        job = await upsert_job(
            db,
            kind="datasource_sync",
            business_id=ds.id,
            cron=ds.schedule or "手动触发",
            payload={"table_name": ds.table_name},
            enabled=ds.is_active,
        )
        await db.commit()

    started = datetime.now(UTC)
    run = await get_engine().run_job_now(job.id, triggered_by=user.login_name)
    return SyncResult(
        ok=run.status == "success",
        rows=run.rows or 0,
        message=run.message or "",
        started_at=started,
        finished_at=run.finished_at,
    )


@router.get("/{ds_id}/runs", response_model=list[SyncRunOut])
async def list_runs(
    ds_id: int,
    limit: int = 20,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SyncRunOut]:
    rows = (
        (
            await db.execute(
                select(SyncRun)
                .where(SyncRun.datasource_id == ds_id)
                .order_by(desc(SyncRun.started_at))
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [
        SyncRunOut(
            id=r.id,
            started_at=r.started_at,
            finished_at=r.finished_at,
            status=r.status,
            rows=r.rows,
            message=r.message,
            triggered_by=r.triggered_by,
        )
        for r in rows
    ]
