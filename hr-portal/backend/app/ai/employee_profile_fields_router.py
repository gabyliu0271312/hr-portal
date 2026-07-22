from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.audit import record_ai_log
from app.ai.employee_profile_catalog import load_employee_profile_catalog
from app.ai.employee_profile_fields import EmployeeProfileFieldSetting
from app.ai.employee_profile_repository import EMPLOYEE_PROFILE_ROSTER_TABLE
from app.core.db import get_session
from app.core.deps import require_op, user_has_op
from app.field_category.models import FieldCategory, FieldCategoryAssignment, RoleVisibleCategory
from app.users.models import User

router = APIRouter(prefix="/admin/employee-profile-fields", tags=["employee-profile-fields"])


class FieldConfig(BaseModel):
    column_name: str = Field(pattern=r"^[a-z][a-z0-9_]{0,127}$")
    field_code: str = Field(pattern=r"^[a-z][a-z0-9_]{0,127}$")
    display_name: str = Field(min_length=1, max_length=64)
    is_queryable: bool = False
    is_default_card: bool
    default_display_order: int | None = Field(default=None, ge=1, le=5)
    append_display_order: int = Field(ge=1, le=9999)
    version: int | None = Field(default=None, ge=1)
    sensitive_category_names: list[str] = Field(default_factory=list)


class FieldConfigInput(BaseModel):
    column_name: str = Field(pattern=r"^[a-z][a-z0-9_]{0,127}$")
    field_code: str = Field(pattern=r"^[a-z][a-z0-9_]{0,127}$")
    display_name: str = Field(min_length=1, max_length=64)
    is_queryable: bool = False
    is_default_card: bool
    default_display_order: int | None = Field(default=None, ge=1, le=5)
    append_display_order: int = Field(ge=1, le=9999)
    version: int | None = Field(default=None, ge=1)


class FieldConfigUpdate(BaseModel):
    fields: list[FieldConfigInput] = Field(min_length=1, max_length=100)


class GovernanceIssue(BaseModel):
    code: str
    level: str = "warning"
    message: str
    column_name: str | None = None
    category_name: str | None = None


class GovernanceCheckResponse(BaseModel):
    issues: list[GovernanceIssue]
    warning_count: int


_HIGH_RISK_FIELD_TOKENS = (
    "id_number", "id_card", "identity", "passport", "bank_card", "bank_account",
    "mobile", "phone", "email", "salary", "wage", "compensation", "tax",
)


async def _settings(db: AsyncSession):
    return {row.column_name: row for row in (await db.execute(select(EmployeeProfileFieldSetting).where(EmployeeProfileFieldSetting.table_name == EMPLOYEE_PROFILE_ROSTER_TABLE))).scalars().all()}


async def _sensitive_category_names(db: AsyncSession) -> dict[str, list[str]]:
    rows = await db.execute(
        select(FieldCategoryAssignment.column_name, FieldCategory.name)
        .join(FieldCategory, FieldCategory.id == FieldCategoryAssignment.category_id)
        .where(
            FieldCategoryAssignment.table_name == EMPLOYEE_PROFILE_ROSTER_TABLE,
            FieldCategory.is_sensitive.is_(True),
        )
        .order_by(FieldCategory.name)
    )
    names: dict[str, list[str]] = {}
    for column_name, category_name in rows:
        names.setdefault(column_name, []).append(category_name)
    return names


async def _visible_sensitive_category_names(user: User, db: AsyncSession) -> dict[str, list[str]]:
    if not await user_has_op(user, db, "system.field_categories", "V"):
        return {}
    return await _sensitive_category_names(db)


async def _sensitive_category_assignments(db: AsyncSession) -> dict[int, tuple[str, set[str]]]:
    rows = await db.execute(
        select(FieldCategory.id, FieldCategory.name, FieldCategoryAssignment.column_name)
        .join(FieldCategoryAssignment, FieldCategoryAssignment.category_id == FieldCategory.id)
        .where(
            FieldCategoryAssignment.table_name == EMPLOYEE_PROFILE_ROSTER_TABLE,
            FieldCategory.is_sensitive.is_(True),
        )
    )
    categories: dict[int, tuple[str, set[str]]] = {}
    for category_id, category_name, column_name in rows:
        name, columns = categories.setdefault(category_id, (category_name, set()))
        columns.add(column_name)
    return categories


async def _categories_with_role_grants(db: AsyncSession, category_ids: set[int]) -> set[int]:
    if not category_ids:
        return set()
    rows = await db.execute(
        select(RoleVisibleCategory.category_id)
        .where(RoleVisibleCategory.category_id.in_(category_ids))
        .distinct()
    )
    return {row[0] for row in rows}


async def _governance_issues(db: AsyncSession) -> list[GovernanceIssue]:
    catalog = await load_employee_profile_catalog(db)
    settings = await _settings(db)
    categories = await _sensitive_category_assignments(db)
    sensitive_columns = {column_name for _, columns in categories.values() for column_name in columns}
    issues = [
        GovernanceIssue(
            code="missing_display_name",
            message="该业务字段尚未配置员工档案展示名称",
            column_name=item.column_name,
        )
        for item in catalog
        if item.column_name not in settings or not settings[item.column_name].display_name.strip()
    ]
    issues.extend(
        GovernanceIssue(
            code="unclassified_high_risk_field",
            message="疑似高风险业务字段尚未归入敏感分类",
            column_name=item.column_name,
        )
        for item in catalog
        if item.column_name not in sensitive_columns
        and any(token in f"{item.column_name} {item.field_code}".lower() for token in _HIGH_RISK_FIELD_TOKENS)
    )
    granted_categories = await _categories_with_role_grants(db, set(categories))
    issues.extend(
        GovernanceIssue(
            code="sensitive_category_without_role",
            message="敏感分类尚未分配给任何角色",
            category_name=category_name,
        )
        for category_id, (category_name, _) in categories.items()
        if category_id not in granted_categories
    )
    return issues


async def _response(db: AsyncSession, sensitive_category_names: dict[str, list[str]] | None = None) -> list[FieldConfig]:
    settings = await _settings(db)
    categories = sensitive_category_names or {}
    return [FieldConfig(column_name=item.column_name, field_code=item.field_code, display_name=item.display_name, is_queryable=item.is_queryable, is_default_card=item.is_default_card, default_display_order=item.default_display_order, append_display_order=item.append_display_order, version=settings[item.column_name].version if item.column_name in settings else None, sensitive_category_names=categories.get(item.column_name, [])) for item in await load_employee_profile_catalog(db)]


@router.get("", response_model=list[FieldConfig])
async def list_fields(user: User = Depends(require_op("warehouse.assets", "V")), db: AsyncSession = Depends(get_session)):
    return await _response(db, await _visible_sensitive_category_names(user, db))


@router.get("/governance-check", response_model=GovernanceCheckResponse)
async def governance_check(user: User = Depends(require_op("warehouse.assets", "V")), db: AsyncSession = Depends(get_session)):
    category_metadata_visible = await user_has_op(user, db, "system.field_categories", "V")
    issues = await _governance_issues(db)
    if not category_metadata_visible:
        issues = [issue for issue in issues if issue.code != "sensitive_category_without_role"]
    warning_count = len(issues)
    await record_ai_log(
        db=db,
        user=user,
        action="employee_profile_governance_check",
        request_summary="employee_profile_governance_check",
        response_summary=f"warnings:{warning_count}",
        input_payload={"capability_id": "employee.profile.governance"},
        output_payload={"warning_count": warning_count},
        status="success",
        metadata={
            "capability_id": "employee.profile.governance",
            "warning_count": warning_count,
            "issue_counts": {code: sum(issue.code == code for issue in issues) for code in sorted({issue.code for issue in issues})},
            "category_metadata_visible": category_metadata_visible,
        },
    )
    await db.commit()
    return GovernanceCheckResponse(issues=issues, warning_count=warning_count)


@router.put("", response_model=list[FieldConfig])
async def update_fields(payload: FieldConfigUpdate, user: User = Depends(require_op("warehouse.assets", "U")), db: AsyncSession = Depends(get_session)):
    if len({field.column_name for field in payload.fields}) != len(payload.fields) or len({field.field_code for field in payload.fields}) != len(payload.fields):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="字段列名和字段代码不得重复")
    catalog = {item.column_name for item in await load_employee_profile_catalog(db)}
    if {field.column_name for field in payload.fields} != catalog:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="提交字段必须与当前可配置目录一致")
    existing = await _settings(db)
    for field in payload.fields:
        row = existing.get(field.column_name)
        if row is not None and row.version != field.version:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="字段配置已更新，请刷新后重试")
        if row is None:
            row = EmployeeProfileFieldSetting(table_name=EMPLOYEE_PROFILE_ROSTER_TABLE, column_name=field.column_name, created_by=user.id, version=0)
            db.add(row)
        row.field_code = field.field_code; row.display_name = field.display_name.strip(); row.is_queryable = field.is_queryable; row.updated_by = user.id; row.version += 1
    await db.commit()
    return await _response(db, await _visible_sensitive_category_names(user, db))
