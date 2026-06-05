"""Roles 模块 Pydantic schemas"""
from datetime import datetime

from pydantic import BaseModel, Field


class RoleMenuItem(BaseModel):
    """角色配置中"菜单 × 操作权限"矩阵的一行"""
    menu_id: int
    scope_dimension: str = "none"  # cost_center | org | none
    can_view: bool = True
    can_create: bool = False
    can_update: bool = False
    can_delete: bool = False
    can_export: bool = False


class RoleListItem(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool
    user_count: int = 0
    menu_count: int = 0
    created_at: datetime


class RoleListResp(BaseModel):
    items: list[RoleListItem]
    total: int


class RoleDetail(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool
    user_count: int
    menus: list[RoleMenuItem]


class RoleCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    description: str | None = None
    menus: list[RoleMenuItem] = []


class RoleUpdateIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    description: str | None = None
    is_active: bool | None = None
    menus: list[RoleMenuItem] | None = None  # 提供时整体替换