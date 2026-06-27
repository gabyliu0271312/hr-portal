"""Users 模块的 Pydantic schemas"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserListItem(BaseModel):
    id: int
    login_name: str
    display_name: str
    email: str | None
    is_active: bool
    last_login_at: datetime | None
    locked_until: datetime | None
    feishu_user_id: str | None = None
    role_names: list[str] = []
    org_scope_names: list[str] = []
    cost_center_scope_names: list[str] = []

    model_config = {"from_attributes": True}


class UserListResp(BaseModel):
    items: list[UserListItem]
    total: int
    page: int
    page_size: int


class UserCreateIn(BaseModel):
    login_name: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.\-]+$")
    display_name: str = Field(..., min_length=1, max_length=64)
    email: EmailStr | None = None
    password: str = Field(..., max_length=128)
    role_ids: list[int] = []


class UserUpdateIn(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=64)
    email: EmailStr | None = None


class UserDetail(BaseModel):
    id: int
    login_name: str
    display_name: str
    email: str | None
    is_active: bool
    last_login_at: datetime | None
    failed_login_count: int
    locked_until: datetime | None
    role_ids: list[int]
    role_names: list[str]
    org_scope_names: list[str] = []
    cost_center_scope_names: list[str] = []


class ResetPasswordIn(BaseModel):
    new_password: str = Field(..., max_length=128)


class SetRolesIn(BaseModel):
    role_ids: list[int] = []
