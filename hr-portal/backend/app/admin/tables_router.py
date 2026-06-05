"""管理员：一键新建视图（数据表）

POST /admin/tables          新建视图
GET  /admin/tables          查询所有已注册表
DELETE /admin/tables/{name} 删除自定义表（内置表不允许删）
"""
from __future__ import annotations

from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.models import RegisteredTable, DATA_TABLES
from app.data.dynamic_loader import _make_dynamic_model
from app.datasources.sync_service import PERIOD_TABLES
from app.users.models import User

router = APIRouter(prefix="/admin/tables", tags=["admin-tables"])


class CreateTableIn(BaseModel):
    table_name: str
    table_label: str
    description: str | None = None
    is_period: bool = False
    period_col: str = "月份"
    period_source: str = "field"   # field=接口自带 / inject=同步时自动注入
    is_result_table: bool = False
    icon: str = "Grid"
    display_order: int = 999
    create_datasource: bool = False
    datasource_source_type: str = "upload"


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
    # 1) 校验表名：只允许小写字母、数字、下划线
    import re
    if not re.match(r"^[a-z][a-z0-9_]{1,62}$", payload.table_name):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="表名只允许小写字母、数字、下划线，且以字母开头")

    # 2) 检查是否已存在
    existing = (
        await db.execute(
            select(RegisteredTable).where(RegisteredTable.table_name == payload.table_name)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="表名已存在")

    # 3) 建物理表（极简 schema，与内置表完全一致）
    await db.execute(text(f"""
        CREATE TABLE IF NOT EXISTS "{payload.table_name}" (
            id        BIGSERIAL PRIMARY KEY,
            pk_hash   VARCHAR(64) NOT NULL,
            raw       JSON NOT NULL DEFAULT '{{}}',
            synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT "uq_{payload.table_name}_pk" UNIQUE (pk_hash)
        )
    """))
    await db.execute(text(
        f'CREATE INDEX IF NOT EXISTS "ix_{payload.table_name}_pk_hash" ON "{payload.table_name}" (pk_hash)'
    ))

    # 4) 写入 registered_tables
    rt = RegisteredTable(
        table_name=payload.table_name,
        table_label=payload.table_label,
        description=payload.description,
        is_period=payload.is_period,
        period_col=payload.period_col,
        period_source=payload.period_source,
        is_builtin=False,
        is_result_table=payload.is_result_table,
        icon=payload.icon,
        display_order=payload.display_order,
    )
    db.add(rt)
    await db.flush()

    # 5) 热注册到运行时 DATA_TABLES / PERIOD_TABLES
    model = _make_dynamic_model(payload.table_name)
    DATA_TABLES[payload.table_name] = model
    if payload.is_period:
        PERIOD_TABLES[payload.table_name] = {
            "period_col": payload.period_col,
            "offset_key": "MONTH_OFFSET",
            "period_source": payload.period_source,
        }

    # 6) 可选：创建 datasource 接口配置
    if payload.create_datasource:
        from app.datasources.models import DataSource
        ds_exists = (
            await db.execute(
                select(DataSource).where(DataSource.table_name == payload.table_name)
            )
        ).scalar_one_or_none()
        if not ds_exists:
            ds = DataSource(
                table_name=payload.table_name,
                table_label=payload.table_label,
                source_type=payload.datasource_source_type,
                schedule="手动触发",
                settings={},
                secrets_encrypted={},
                is_active=False,
                last_status="pending",
            )
            db.add(ds)

    # 7) 超管自动获得全量权限（data.view 菜单已有，不需要额外操作）
    # 超管角色通过 seed 的 _ensure_super_role 已拥有所有菜单权限，
    # 数据视图的表级访问通过 data.view 菜单统一控制，无需追加。

    await db.commit()
    await db.refresh(rt)
    return _to_out(rt)


@router.delete("/{table_name}",
               dependencies=[Depends(require_op("system.users", "D"))])
async def delete_table(
    table_name: str,
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    rt = (
        await db.execute(
            select(RegisteredTable).where(RegisteredTable.table_name == table_name)
        )
    ).scalar_one_or_none()
    if rt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="表不存在")
    if rt.is_builtin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="内置表不允许删除")

    # 删物理表
    await db.execute(text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))
    # 清字段元数据
    from sqlalchemy import delete
    from app.data.models import TableColumn
    await db.execute(delete(TableColumn).where(TableColumn.table_name == table_name))
    # 删注册记录
    await db.delete(rt)
    # 从运行时移除
    DATA_TABLES.pop(table_name, None)
    PERIOD_TABLES.pop(table_name, None)

    await db.commit()
    return {"ok": True}
