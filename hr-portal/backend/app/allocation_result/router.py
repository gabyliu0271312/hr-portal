"""薪酬 Tab → 分摊结果页：只读列表 + 字段后台可配。

- GET /allocation-result/fields : 分摊结果分组的标准字段清单（驱动前端列渲染）
- GET /allocation-result/rows   : 分摊表行（人员 D 过滤 + 字段脱敏 + 成本中心树编码校验）

主数据一致性：
- 工号/姓名语义 = 人员信息页标准字段（employee_no/full_name）
- 编码/名称语义 = 成本中心树权威（cost_center_tree.code/name）
- 分摊表 code 必须在成本中心树中存在，否则行标记 _cc_valid=false
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.allocation_result.service import list_allocation_rows, SOURCE_TABLE
from app.core.db import get_session
from app.core.deps import require_op
from app.data.models import DATA_TABLES, FieldGroup, StandardField
from app.users.models import User

router = APIRouter(prefix="/allocation-result", tags=["allocation-result"])

MENU_CODE = "people.salary.allocation_result"

# 分摊结果分组名（后台字段设置中新增的分组，与页面联动）
ALLOCATION_GROUP_NAME = "分摊结果"


class AllocationFieldOut(BaseModel):
    id: int
    field_code: str
    field_name: str
    data_type: str
    display_order: int
    is_active: bool


class AllocationFieldsOut(BaseModel):
    items: list[AllocationFieldOut]
    total: int


class AllocationRowsOut(BaseModel):
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int
    hidden_columns: list[str] = []


async def _resolve_group_id(db: AsyncSession) -> int | None:
    """按分组名解析分摊结果分组 ID；不存在则返回 None（未配置字段时前端显示空态）。"""
    row = (
        await db.execute(
            select(FieldGroup.id).where(FieldGroup.name == ALLOCATION_GROUP_NAME)
        )
    ).first()
    return row[0] if row else None


@router.get("/fields", response_model=AllocationFieldsOut)
async def list_allocation_fields(
    user: User = Depends(require_op(MENU_CODE, "V")),
    db: AsyncSession = Depends(get_session),
):
    """分摊结果页只读字段清单：标准字段目录中「分摊结果」分组的字段，按显示顺序。

    仅返回展示所需元数据（编码/名称/类型/顺序），不含敏感分类与枚举明细。
    未配置分组或字段时返回空清单，前端显示空态。
    """
    group_id = await _resolve_group_id(db)
    if group_id is None:
        return AllocationFieldsOut(items=[], total=0)

    stmt = (
        select(StandardField)
        .where(StandardField.group_id == group_id, StandardField.is_active.is_(True))
        .order_by(StandardField.display_order, StandardField.id)
    )
    fields = (await db.execute(stmt)).scalars().all()
    return AllocationFieldsOut(
        total=len(fields),
        items=[
            AllocationFieldOut(
                id=f.id,
                field_code=f.field_code,
                field_name=f.display_name,
                data_type=f.data_type,
                display_order=f.display_order,
                is_active=f.is_active,
            )
            for f in fields
        ],
    )


@router.get("/rows", response_model=AllocationRowsOut)
async def allocation_rows_endpoint(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    keyword: str | None = None,
    user: User = Depends(require_op(MENU_CODE, "V")),
    db: AsyncSession = Depends(get_session),
):
    """分摊表行查询：复用 service 查询链路（人员 D 过滤 + 脱敏 + 树校验）。"""
    if SOURCE_TABLE not in DATA_TABLES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"业务表 {SOURCE_TABLE} 未注册，请先完成来源同步",
        )
    result = await list_allocation_rows(
        db, user, page=page, page_size=page_size, keyword=keyword
    )
    return AllocationRowsOut(**result)
