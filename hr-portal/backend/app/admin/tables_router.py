"""管理员：一键新建视图（数据表）

POST /admin/tables          新建视图
GET  /admin/tables          查询所有已注册表
DELETE /admin/tables/{name} 删除自定义表（内置表不允许删）
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.ddl import (
    DDLValidationError,
    SourceColumn,
    create_source_table,
    drop_source_table,
    validate_column_name,
    validate_table_name,
)
from app.data.dynamic_loader import (
    register_period_table,
    register_source_table_model,
    unregister_source_table_model,
)
from app.data.models import RegisteredTable
from app.datasources.sync_service import PERIOD_TABLES
from app.datasets.single_table import ensure_single_table_dataset, find_single_table_dataset
from app.users.models import User

router = APIRouter(prefix="/admin/tables", tags=["admin-tables"])


class InitialColumnIn(BaseModel):
    column_code: str = Field(min_length=1, max_length=63)
    column_label: str = Field(min_length=1, max_length=128)
    data_type: str = "string"
    is_pk_part: bool = False
    is_sensitive: bool = False
    is_visible: bool = True
    display_order: int = 999
    description: str | None = None
    scope_role: str | None = None
    enum_options: list[str] | None = None
    agg_role: str = "dimension"


class CreateTableIn(BaseModel):
    table_name: str
    table_label: str
    description: str | None = None
    is_period: bool = False
    period_col: str = "month"
    period_source: str = "field"   # field=接口自带 / inject=同步时自动注入
    is_result_table: bool = False
    icon: str = "Grid"
    display_order: int = 999
    create_datasource: bool = False
    datasource_source_type: str = "upload"
    columns: list[InitialColumnIn] = Field(default_factory=list)


class RegisteredTableOut(BaseModel):
    id: int
    table_name: str
    table_label: str
    description: str | None
    is_period: bool
    period_col: str
    period_source: str
    is_builtin: bool
    is_result_table: bool
    icon: str
    display_order: int
    created_at: str


def _to_out(rt: RegisteredTable) -> RegisteredTableOut:
    return RegisteredTableOut(
        id=rt.id,
        table_name=rt.table_name,
        table_label=rt.table_label,
        description=rt.description,
        is_period=rt.is_period,
        period_col=rt.period_col,
        period_source=rt.period_source,
        is_builtin=rt.is_builtin,
        is_result_table=rt.is_result_table,
        icon=rt.icon,
        display_order=rt.display_order,
        created_at=rt.created_at.isoformat(),
    )


@router.get("", response_model=list[RegisteredTableOut])
async def list_tables(
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[RegisteredTableOut]:
    rows = (
        await db.execute(
            select(RegisteredTable).order_by(RegisteredTable.display_order, RegisteredTable.id)
        )
    ).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=RegisteredTableOut,
             dependencies=[Depends(require_op("system.users", "C"))])
async def create_table(
    payload: CreateTableIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> RegisteredTableOut:
    # 1) 校验表名/初始字段：只允许受控 DDL 标识符
    try:
        table_name = validate_table_name(payload.table_name)
        period_col = validate_column_name(payload.period_col) if payload.is_period else "month"
        ddl_columns = [
            SourceColumn(c.column_code, c.data_type)
            for c in sorted(payload.columns, key=lambda x: (x.display_order, x.column_code))
        ]
    except DDLValidationError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # 2) 检查是否已存在
    existing = (
        await db.execute(
            select(RegisteredTable).where(RegisteredTable.table_name == table_name)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="表名已存在")

    # 3) 建物理表：实体表基础列 + 可选初始业务列
    try:
        await create_source_table(db, table_name, ddl_columns)
    except DDLValidationError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # 4) 写入 registered_tables
    rt = RegisteredTable(
        table_name=table_name,
        table_label=payload.table_label,
        description=payload.description,
        is_period=payload.is_period,
        period_col=period_col,
        period_source=payload.period_source,
        is_builtin=False,
        is_result_table=payload.is_result_table,
        icon=payload.icon,
        display_order=payload.display_order,
    )
    db.add(rt)
    await db.flush()

    # 5) 可选初始字段元数据
    if payload.columns:
        from app.data.models import TableColumn

        db.add_all([
            TableColumn(
                table_name=table_name,
                column_code=c.column_code,
                column_label=c.column_label,
                data_type=c.data_type,
                is_pk_part=c.is_pk_part,
                is_sensitive=c.is_sensitive,
                is_visible=c.is_visible,
                display_order=c.display_order,
                auto_discovered=False,
                description=c.description,
                scope_role=c.scope_role,
                enum_options=c.enum_options,
                agg_role=c.agg_role,
            )
            for c in payload.columns
        ])
        await db.flush()

    # 6) 热注册到运行时 DATA_TABLES / PERIOD_TABLES
    await register_source_table_model(db, table_name, force=True)
    register_period_table(rt, overwrite=True)

    # 7) 可选：创建 datasource 接口配置
    if payload.create_datasource:
        from app.datasources.models import DataSource
        ds_exists = (
            await db.execute(
                select(DataSource).where(DataSource.table_name == table_name)
            )
        ).scalar_one_or_none()
        if not ds_exists:
            ds = DataSource(
                table_name=table_name,
                table_label=payload.table_label,
                source_type=payload.datasource_source_type,
                schedule="手动触发",
                settings={},
                secrets_encrypted={},
                is_active=False,
                last_status="pending",
            )
            db.add(ds)

    await ensure_single_table_dataset(
        table_name,
        db,
        created_by=user.id,
        table_label=payload.table_label,
    )

    # 8) 超管自动获得全量权限（data.view 菜单已有，不需要额外操作）
    # 超管角色通过 seed 的 _ensure_super_role 已拥有所有菜单权限，
    # 数据视图的表级访问通过 data.view 菜单统一控制，无需追加。

    await db.commit()
    await db.refresh(rt)
    return _to_out(rt)


class UpdateTableIn(BaseModel):
    table_label: str | None = None
    description: str | None = None
    display_order: int | None = None


@router.patch("/{table_name}", response_model=RegisteredTableOut,
              dependencies=[Depends(require_op("system.users", "U"))])
async def update_table(
    table_name: str,
    payload: UpdateTableIn,
    db: AsyncSession = Depends(get_session),
) -> RegisteredTableOut:
    rt = (
        await db.execute(
            select(RegisteredTable).where(RegisteredTable.table_name == table_name)
        )
    ).scalar_one_or_none()
    if rt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="表不存在")
    if payload.table_label is not None:
        rt.table_label = payload.table_label
    if payload.description is not None:
        rt.description = payload.description
    if payload.display_order is not None:
        rt.display_order = payload.display_order
    await db.commit()
    await db.refresh(rt)
    return _to_out(rt)


@router.delete("/{table_name}",
               dependencies=[Depends(require_op("system.users", "D"))])
async def delete_table(
    table_name: str,
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    try:
        safe_table_name = validate_table_name(table_name)
    except DDLValidationError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    rt = (
        await db.execute(
            select(RegisteredTable).where(RegisteredTable.table_name == safe_table_name)
        )
    ).scalar_one_or_none()
    if rt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="表不存在")
    if rt.is_builtin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="内置表不允许删除")

    # 删物理表
    from app.allocation.models import AllocationScheme
    from app.datasets.models import DataSetTable
    from app.reports.models import Report

    ds = await find_single_table_dataset(safe_table_name, db)
    if ds is not None:
        report_ref = (
            await db.execute(select(Report.id).where(Report.dataset_id == ds.id).limit(1))
        ).scalar_one_or_none()
        allocation_ref = (
            await db.execute(
                select(AllocationScheme.id).where(AllocationScheme.dataset_id == ds.id).limit(1)
            )
        ).scalar_one_or_none()
        if report_ref is not None or allocation_ref is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="该视图的数据集已被报表或成本分摊方案引用，无法删除",
            )

    await drop_source_table(db, safe_table_name, cascade=True)
    # 清字段元数据
    from sqlalchemy import delete
    from app.data.models import TableColumn
    await db.execute(delete(TableColumn).where(TableColumn.table_name == safe_table_name))
    if ds is not None:
        dataset_has_other_tables = (
            await db.execute(
                select(DataSetTable.id)
                .where(
                    DataSetTable.dataset_id == ds.id,
                    DataSetTable.table_name != safe_table_name,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if dataset_has_other_tables is None:
            await db.delete(ds)
    await db.delete(rt)
    # 从运行时移除
    unregister_source_table_model(safe_table_name)
    PERIOD_TABLES.pop(safe_table_name, None)

    await db.commit()
    return {"ok": True}
