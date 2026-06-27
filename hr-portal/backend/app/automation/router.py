"""自动化规则 REST API"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.automation.models import AutomationExecution, AutomationRule
from app.automation.rule_service import create_rule, update_rule, validate_rule
from app.automation.schemas import (
    AutomationExecutionOut,
    AutomationRuleCreate,
    AutomationRuleOut,
    AutomationRuleUpdate,
)
from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.users.models import User


router = APIRouter(prefix="/automation", tags=["automation"])

# 菜单权限常量
MENU_CODE = "automation.rules"


@router.post("/rules/validate")
async def validate_rule_api(
    data: AutomationRuleCreate,
    user: User = Depends(current_user),
    _: None = Depends(require_op(MENU_CODE, "V")),
):
    """校验规则配置，不保存。"""
    errors = await validate_rule(data)
    return {"ok": len(errors) == 0, "errors": errors}


@router.post("/rules", response_model=AutomationRuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule_api(
    data: AutomationRuleCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _: None = Depends(require_op(MENU_CODE, "C")),
):
    """创建自动化规则。"""
    errors = await validate_rule(data)
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"errors": errors})
    rule = await create_rule(data, db, created_by=user.id)
    await db.commit()
    await db.refresh(rule)
    return AutomationRuleOut.model_validate(rule)


@router.get("/rules", response_model=list[AutomationRuleOut])
async def list_rules(
    enabled: bool | None = Query(None),
    trigger_type: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _: None = Depends(require_op(MENU_CODE, "V")),
):
    """查询自动化规则列表。"""
    stmt = select(AutomationRule).order_by(AutomationRule.created_at.desc())
    if enabled is not None:
        stmt = stmt.where(AutomationRule.enabled == enabled)
    if trigger_type:
        stmt = stmt.where(AutomationRule.trigger_type == trigger_type)
    rules = (await db.execute(stmt)).scalars().all()
    return [AutomationRuleOut.model_validate(r) for r in rules]


@router.get("/rules/{rule_id}", response_model=AutomationRuleOut)
async def get_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _: None = Depends(require_op(MENU_CODE, "V")),
):
    rule = await db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="规则不存在")
    return AutomationRuleOut.model_validate(rule)


@router.patch("/rules/{rule_id}", response_model=AutomationRuleOut)
async def update_rule_api(
    rule_id: int,
    data: AutomationRuleUpdate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _: None = Depends(require_op(MENU_CODE, "U")),
):
    rule = await db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="规则不存在")
    rule = await update_rule(rule, data, db, updated_by=user.id)
    await db.commit()
    await db.refresh(rule)
    return AutomationRuleOut.model_validate(rule)


@router.post("/rules/{rule_id}/enable", response_model=AutomationRuleOut)
async def enable_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _: None = Depends(require_op(MENU_CODE, "U")),
):
    rule = await db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="规则不存在")

    # 启用前校验配置完整度（防止前端绕过导致不完整规则被启用）
    check_data = AutomationRuleCreate(
        name=rule.name,
        trigger_type=rule.trigger_type,
        trigger_config=rule.trigger_config or {},
        condition_config=[],
        actions_config=rule.actions_config or [],
        enabled=True,
    )
    errors = await validate_rule(check_data)
    if errors:
        raise HTTPException(status_code=400, detail="无法启用：" + "; ".join(errors))

    rule.enabled = True
    rule.updated_by = user.id
    await db.commit()
    await db.refresh(rule)
    return AutomationRuleOut.model_validate(rule)


@router.post("/rules/{rule_id}/disable", response_model=AutomationRuleOut)
async def disable_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _: None = Depends(require_op(MENU_CODE, "U")),
):
    rule = await db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="规则不存在")
    rule.enabled = False
    rule.updated_by = user.id
    await db.commit()
    await db.refresh(rule)
    return AutomationRuleOut.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _: None = Depends(require_op(MENU_CODE, "D")),
):
    """删除自动化规则。同时删除关联的执行记录。"""
    rule = await db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="规则不存在")
    # 先删除关联的执行记录
    await db.execute(delete(AutomationExecution).where(AutomationExecution.rule_id == rule_id))
    # 再删除规则
    await db.delete(rule)
    await db.commit()


@router.get("/executions", response_model=list[AutomationExecutionOut])
async def list_executions(
    rule_id: int | None = Query(None),
    biz_type: str | None = Query(None),
    biz_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    _: None = Depends(require_op(MENU_CODE, "V")),
):
    """查询规则执行记录。"""
    stmt = select(AutomationExecution).order_by(AutomationExecution.started_at.desc())
    if rule_id is not None:
        stmt = stmt.where(AutomationExecution.rule_id == rule_id)
    if biz_type:
        stmt = stmt.where(AutomationExecution.biz_type == biz_type)
    if biz_id:
        stmt = stmt.where(AutomationExecution.biz_id == biz_id)

    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    execs = (await db.execute(stmt)).scalars().all()
    return [AutomationExecutionOut.model_validate(e) for e in execs]
