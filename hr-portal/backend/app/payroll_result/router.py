"""薪酬 Tab → 薪资结果页：只读列表 + 字段后台可配。

- GET /payroll-result/fields : 薪资结果表单绑定字段（驱动列渲染，普通人员页只读）
- GET /payroll-result/rows   : 工资表行（人员 D 过滤 + 字段脱敏）

主数据一致性：
- 员工编号/姓名语义 = 花名册（工作信息分组权威源）
- 组织编码/名称语义 = 组织树（组织信息分组权威源）
- 工资表行由资产写入（WarehouseAssetSink）落库时完成权威校验与 org_level_1..4_code 投影回填
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.payroll_result.service import list_payroll_rows, SOURCE_TABLE
from app.core.db import get_session
from app.core.deps import require_op
from app.data.models import DATA_TABLES
from app.users.models import User

router = APIRouter(prefix="/payroll-result", tags=["payroll-result"])

MENU_CODE = "people.salary.payroll_result"

# 薪资结果表单键（后台字段设置中绑定的表单，与页面联动）
PAYROLL_FORM_KEY = "payroll_result"


class PayrollFieldOut(BaseModel):
    id: int
    field_code: str
    field_name: str
    data_type: str
    display_order: int
    is_active: bool


class PayrollFieldsOut(BaseModel):
    items: list[PayrollFieldOut]
    total: int


class PayrollRowsOut(BaseModel):
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int
    hidden_columns: list[str] = []


@router.get("/fields", response_model=PayrollFieldsOut)
async def list_payroll_fields(
    user: User = Depends(require_op(MENU_CODE, "V")),
    db: AsyncSession = Depends(get_session),
):
    """薪资结果页只读字段清单：form_field_bindings 中 form_key=payroll_result 绑定的字段。

    面向普通人员页用户，不需要 warehouse.standard_fields.catalog 权限；
    取值来源由数据连接（UCP 同步）配置，未配置时前端显示空态。
    """
    from app.warehouse.service.standard_fields import list_form_fields

    fields = await list_form_fields(db, PAYROLL_FORM_KEY, user=user)
    return PayrollFieldsOut(
        total=len(fields),
        items=[
            PayrollFieldOut(
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


@router.get("/rows", response_model=PayrollRowsOut)
async def payroll_rows_endpoint(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    keyword: str | None = None,
    user: User = Depends(require_op(MENU_CODE, "V")),
    db: AsyncSession = Depends(get_session),
):
    """工资表行查询：复用 service 查询链路（人员 D 过滤 + 脱敏）。"""
    if SOURCE_TABLE not in DATA_TABLES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"业务表 {SOURCE_TABLE} 未注册，请先完成来源同步",
        )
    result = await list_payroll_rows(
        db, user, page=page, page_size=page_size, keyword=keyword
    )
    return PayrollRowsOut(**result)
