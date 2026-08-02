"""Dataset relation metadata validation shared by write paths."""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from app.data.ddl import DDLValidationError, validate_column_name
from app.data.models import DATA_TABLES


def _read(value: Mapping[str, Any] | Any, name: str) -> Any:
    if isinstance(value, Mapping):
        return value.get(name)
    return getattr(value, name, None)


def _validate_join_column(*, alias: str, table_name: str, column: Any) -> None:
    if not isinstance(column, str):
        raise ValueError(f"关联别名 {alias} 的连接字段必须是字符串")
    try:
        column_code = validate_column_name(column)
    except DDLValidationError as exc:
        raise ValueError(f"关联别名 {alias} 的连接字段无效: {exc}") from exc

    model = DATA_TABLES.get(table_name)
    if model is None:
        raise ValueError(f"关联别名 {alias} 对应的数据表未注册: {table_name}")
    if column_code not in model.__table__.columns:
        raise ValueError(
            f"关联别名 {alias} 对应的数据表 {table_name} 不存在实体字段: {column_code}"
        )


def validate_dataset_relation_keys(
    alias_to_table: Mapping[str, str], relations: Iterable[Mapping[str, Any] | Any]
) -> None:
    """Require every relation key to resolve to a valid physical business column."""
    for relation in relations:
        left_alias = _read(relation, "left_alias")
        right_alias = _read(relation, "right_alias")
        left_table = alias_to_table.get(left_alias)
        right_table = alias_to_table.get(right_alias)
        if not left_table or not right_table:
            raise ValueError(f"关联使用了未注册别名: {left_alias}/{right_alias}")

        keys = _read(relation, "keys")
        if not isinstance(keys, list) or not keys:
            raise ValueError(f"关联 {left_alias}/{right_alias} 至少需要一个连接键")

        for key in keys:
            _validate_join_column(
                alias=left_alias,
                table_name=left_table,
                column=_read(key, "left"),
            )
            _validate_join_column(
                alias=right_alias,
                table_name=right_table,
                column=_read(key, "right"),
            )