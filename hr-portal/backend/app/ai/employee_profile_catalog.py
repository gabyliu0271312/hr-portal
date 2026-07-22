"""Safe, reflected field catalog for the employee-profile capability."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.employee_profile_fields import EmployeeProfileFieldSetting
from app.ai.employee_profile_repository import EMPLOYEE_PROFILE_ROSTER_TABLE
from app.data.models import DATA_TABLES, TableColumn

_ALLOWED_TYPES = {"string", "number", "date", "datetime", "bool", "enum"}
_TECHNICAL_COLUMNS = {"id", "pk_hash", "synced_at", "created_at", "updated_at", "raw"}
_TECHNICAL_PREFIXES = ("_", "sys_", "sync_")
_DEFAULT_CARD_COLUMNS = ("department", "hire_date", "employee_type", "standard_position", "position_level")


class EmployeeProfileCatalogError(RuntimeError):
    pass


@dataclass(frozen=True)
class EmployeeProfileCatalogItem:
    field_code: str
    column_name: str
    display_name: str
    data_type: str
    is_default_card: bool
    default_display_order: int | None
    append_display_order: int
    is_queryable: bool = False


def _safe_column(column_name: str, data_type: str) -> bool:
    return (
        column_name not in _TECHNICAL_COLUMNS
        and not column_name.startswith(_TECHNICAL_PREFIXES)
        and data_type in _ALLOWED_TYPES
    )


async def load_employee_profile_catalog(db: AsyncSession) -> tuple[EmployeeProfileCatalogItem, ...]:
    model = DATA_TABLES.get(EMPLOYEE_PROFILE_ROSTER_TABLE)
    if model is None:
        raise EmployeeProfileCatalogError("employee profile roster is not registered")
    entity_columns = set(model.__table__.columns.keys())
    metadata_rows = (await db.execute(select(TableColumn).where(TableColumn.table_name == EMPLOYEE_PROFILE_ROSTER_TABLE))).scalars().all()
    metadata = {row.column_code: row for row in metadata_rows}
    settings_rows = (await db.execute(select(EmployeeProfileFieldSetting).where(EmployeeProfileFieldSetting.table_name == EMPLOYEE_PROFILE_ROSTER_TABLE))).scalars().all()
    settings = {row.column_name: row for row in settings_rows}
    items: list[EmployeeProfileCatalogItem] = []
    for column_name in sorted(entity_columns):
        column = metadata.get(column_name)
        data_type = column.data_type if column is not None else "string"
        if not _safe_column(column_name, data_type):
            continue
        setting = settings.get(column_name)
        default_order = _DEFAULT_CARD_COLUMNS.index(column_name) + 1 if column_name in _DEFAULT_CARD_COLUMNS else None
        items.append(EmployeeProfileCatalogItem(
            field_code=setting.field_code if setting else column_name,
            column_name=column_name,
            display_name=setting.display_name if setting else (column.column_label if column else column_name),
            data_type=data_type,
            is_queryable=getattr(setting, "is_queryable", False) if setting else False,
            is_default_card=default_order is not None,
            default_display_order=default_order,
            append_display_order=999,
        ))
    return tuple(sorted(items, key=lambda item: (not item.is_default_card, item.default_display_order or 999, item.append_display_order, item.field_code)))


async def resolve_employee_profile_codes(db: AsyncSession, codes: Iterable[str]) -> tuple[EmployeeProfileCatalogItem, ...]:
    catalog = await load_employee_profile_catalog(db)
    by_code = {item.field_code: item for item in catalog}
    resolved: list[EmployeeProfileCatalogItem] = []
    for code in codes:
        item = by_code.get(code)
        if item is None:
            raise EmployeeProfileCatalogError(f"unknown employee profile field: {code}")
        if item.field_code not in {existing.field_code for existing in resolved}:
            resolved.append(item)
    return tuple(resolved)


def _safe_display_name(value: str) -> str | None:
    normalized = value.strip()
    if not 1 <= len(normalized) <= 32:
        return None
    if not all(character.isalnum() or character in " _-()/（）" for character in normalized):
        return None
    return normalized


async def load_employee_profile_extractor_catalog(db: AsyncSession) -> tuple[EmployeeProfileCatalogItem, ...]:
    """Return metadata safe to disclose to the extractor, never personnel data or sensitive fields."""
    from app.permissions.masker import _table_sensitive_category_map

    catalog = await load_employee_profile_catalog(db)
    metadata_rows = (
        await db.execute(select(TableColumn).where(TableColumn.table_name == EMPLOYEE_PROFILE_ROSTER_TABLE))
    ).scalars().all()
    explicit_sensitive = {row.column_code for row in metadata_rows if row.is_sensitive}
    categorized_sensitive = set((await _table_sensitive_category_map(EMPLOYEE_PROFILE_ROSTER_TABLE, db)).keys())
    safe_items: list[EmployeeProfileCatalogItem] = []
    for item in catalog:
        display_name = _safe_display_name(item.display_name)
        if item.column_name in explicit_sensitive or item.column_name in categorized_sensitive or display_name is None:
            continue
        safe_items.append(EmployeeProfileCatalogItem(
            field_code=item.field_code,
            column_name=item.column_name,
            display_name=display_name,
            data_type=item.data_type,
            is_queryable=item.is_queryable,
            is_default_card=item.is_default_card,
            default_display_order=item.default_display_order,
            append_display_order=item.append_display_order,
        ))
    return tuple(safe_items[:50])
