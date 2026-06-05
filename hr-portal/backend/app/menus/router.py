"""菜单清单：给角色配置时勾选用"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user
from app.users.models import Menu, User


router = APIRouter(prefix="/menus", tags=["menus"])


class MenuNode(BaseModel):
    id: int
    code: str
    label: str
    parent_id: int | None
    order: int
    icon: str | None


@router.get("", response_model=list[MenuNode])
async def list_menus(
    db: AsyncSession = Depends(get_session),
    _: User = Depends(current_user),
) -> list[MenuNode]:
    """全量菜单清单（仅登录即可访问，用于角色配置抽屉等场景的勾选数据源）"""
    rows = (
        await db.execute(select(Menu).order_by(Menu.display_order, Menu.id))
    ).scalars().all()
    return [
        MenuNode(
            id=m.id,
            code=m.code,
            label=m.label,
            parent_id=m.parent_id,
            order=m.display_order,
            icon=m.icon,
        )
        for m in rows
    ]