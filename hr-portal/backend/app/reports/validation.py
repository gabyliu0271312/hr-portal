from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import User


def validate_report_config_references(config: Any) -> Any:
    instance_ids = {column.instance_id for column in config.columns}
    source_codes = {column.source_code for column in config.columns}

    def require_instance(value: Any, path: str) -> None:
        if isinstance(value, str) and value and value not in instance_ids:
            raise ValueError(f'{path} must reference an active instance_id: {value}')

    def require_instances(values: Any, path: str) -> None:
        if isinstance(values, list):
            for index, value in enumerate(values):
                require_instance(value, f'{path}[{index}]')

    def require_source(value: Any, path: str) -> None:
        if not isinstance(value, str) or not value:
            return
        if value in instance_ids and value not in source_codes:
            raise ValueError(f'{path} must reference source_code, not instance_id: {value}')
        if any(value.startswith(f'{source}#') for source in source_codes):
            raise ValueError(f'{path} must reference source_code, not an instance suffix: {value}')

    for sort in config.sorts:
        require_instance(sort.column, 'sorts.column')
    for key in config.aggregations:
        require_instance(key, 'aggregations')
    for key, setting in config.column_settings.items():
        require_instance(key, 'column_settings')
        if not isinstance(setting, dict):
            continue
        for index, factor in enumerate(setting.get('split_factors') or []):
            require_instance(factor, f'column_settings.{key}.split_factors[{index}]')
        require_instance(setting.get('split_factor'), f'column_settings.{key}.split_factor')
        for index, metric_filter in enumerate(setting.get('metric_filters') or []):
            if isinstance(metric_filter, dict):
                require_source(metric_filter.get('column'), f'column_settings.{key}.metric_filters[{index}].column')
    for index, factor in enumerate(config.default_split_rule.get('factors') or []):
        require_instance(factor, f'default_split_rule.factors[{index}]')
    require_instance(config.default_split_rule.get('factor'), 'default_split_rule.factor')
    for index, rule in enumerate(config.value_rules):
        if not isinstance(rule, dict):
            continue
        require_instance(rule.get('target'), f'value_rules[{index}].target')
        require_instances(rule.get('factors'), f'value_rules[{index}].factors')
        require_instance(rule.get('factor'), f'value_rules[{index}].factor')

    transpose = config.transpose or {}
    for index, rule in enumerate(transpose.get('rules') or []):
        if not isinstance(rule, dict):
            continue
        require_instance(rule.get('source_col'), f'transpose.rules[{index}].source_col')
        require_instances(rule.get('target_cols'), f'transpose.rules[{index}].target_cols')
        for key in (rule.get('dim_updates') or {}):
            require_instance(key, f'transpose.rules[{index}].dim_updates')
        for dim_index, dim in enumerate(rule.get('dims') or []):
            if isinstance(dim, dict):
                require_instance(dim.get('dim'), f'transpose.rules[{index}].dims[{dim_index}].dim')
    column_to_row = transpose.get('column_to_row') or {}
    require_instances(column_to_row.get('source_cols'), 'transpose.column_to_row.source_cols')
    require_instances(column_to_row.get('group_by'), 'transpose.column_to_row.group_by')
    row_to_column = transpose.get('row_to_column') or {}
    require_instances(row_to_column.get('group_by'), 'transpose.row_to_column.group_by')
    require_instance(row_to_column.get('pivot_col'), 'transpose.row_to_column.pivot_col')
    require_instance(row_to_column.get('value_col'), 'transpose.row_to_column.value_col')
    for index, correction in enumerate(config.rounding_corrections):
        if not isinstance(correction, dict):
            continue
        group_by = correction.get('group_by')
        require_instances(group_by if isinstance(group_by, list) else [group_by], f'rounding_corrections[{index}].group_by')
        require_instances(correction.get('target_cols'), f'rounding_corrections[{index}].target_cols')
    for item in config.filters:
        require_source(item.column, 'filters.column')
    lookup = config.list_lookup or {}
    lookup_config = lookup.get('lookup') or {}
    require_source(lookup_config.get('target_field'), 'list_lookup.lookup.target_field')
    for index, source in enumerate(lookup.get('sources') or []):
        if not isinstance(source, dict):
            continue
        require_source(source.get('source_field'), f'list_lookup.sources[{index}].source_field')
        require_source(source.get('return_field'), f'list_lookup.sources[{index}].return_field')
        resolver = source.get('resolver') or {}
        require_source(resolver.get('match_field'), f'list_lookup.sources[{index}].resolver.match_field')
        require_source(resolver.get('return_field'), f'list_lookup.sources[{index}].resolver.return_field')
        for filter_index, filter_item in enumerate(source.get('filters') or []):
            if isinstance(filter_item, dict):
                require_source(filter_item.get('column'), f'list_lookup.sources[{index}].filters[{filter_index}].column')
    return config


def ensure_valid_report_config(config: Any) -> Any:
    try:
        return validate_report_config_references(config)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


def iter_report_source_references(config: Any) -> list[tuple[str, str]]:
    references: list[tuple[str, str]] = []

    def add(path: str, value: Any) -> None:
        if isinstance(value, str) and value:
            references.append((path, value))

    for index, column in enumerate(config.columns):
        add(f'columns[{index}].source_code', column.source_code)
    for index, item in enumerate(config.filters):
        add(f'filters[{index}].column', item.column)
    for instance_id, setting in config.column_settings.items():
        if not isinstance(setting, dict):
            continue
        for index, item in enumerate(setting.get('metric_filters') or []):
            if isinstance(item, dict):
                add(f'column_settings.{instance_id}.metric_filters[{index}].column', item.get('column'))

    lookup = config.list_lookup or {}
    lookup_config = lookup.get('lookup') or {}
    add('list_lookup.lookup.target_field', lookup_config.get('target_field'))
    for source_index, source in enumerate(lookup.get('sources') or []):
        if not isinstance(source, dict):
            continue
        path = f'list_lookup.sources[{source_index}]'
        add(f'{path}.source_field', source.get('source_field'))
        add(f'{path}.return_field', source.get('return_field'))
        resolver = source.get('resolver') or {}
        add(f'{path}.resolver.match_field', resolver.get('match_field'))
        add(f'{path}.resolver.return_field', resolver.get('return_field'))
        for filter_index, item in enumerate(source.get('filters') or []):
            if isinstance(item, dict):
                add(f'{path}.filters[{filter_index}].column', item.get('column'))
    return references


async def ensure_valid_report_field_references(
    config: Any, dataset_id: int, user: User, db: AsyncSession,
    runtime_filters: list[dict[str, Any]] | None = None,
) -> None:
    from app.data.models import TableColumn
    from app.datasets.calculated_fields import active_calculated_fields
    from app.datasets.models import DataSetTable
    from app.permissions.masker import get_hidden_columns

    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id))).scalars().all()
    tables_by_alias = {table.alias: table for table in tables}
    columns_by_alias: dict[str, dict[str, Any]] = {}
    hidden_by_alias: dict[str, set[str]] = {}
    for alias, table in tables_by_alias.items():
        columns = (await db.execute(select(TableColumn).where(TableColumn.table_name == table.table_name))).scalars().all()
        columns_by_alias[alias] = {column.column_code: column for column in columns}
        hidden_by_alias[alias] = await get_hidden_columns(user, table.table_name, db)

    calculated_fields = {f'calc.{field.code}': field for field in await active_calculated_fields(dataset_id, db)}
    checked: set[str] = set()

    async def validate_source(source_code: str, path: str) -> None:
        if source_code in checked:
            return
        checked.add(source_code)
        if source_code.startswith('calc.'):
            field = calculated_fields.get(source_code)
            if field is None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f'{path} 引用的计算字段不存在或已停用: {source_code}')
            for dependency in field.depends_on or []:
                if isinstance(dependency, str) and dependency:
                    await validate_source(dependency, f'{path} 的计算字段依赖')
            return
        if '.' not in source_code:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f'{path} 字段格式无效: {source_code}')
        alias, column_code = source_code.split('.', 1)
        table = tables_by_alias.get(alias)
        column = columns_by_alias.get(alias, {}).get(column_code)
        if table is None or column is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f'{path} 引用的数据集字段不存在: {source_code}')
        if not getattr(column, 'is_visible', True):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f'{path} 引用的数据集字段不可见: {source_code}')
        if column_code in hidden_by_alias.get(alias, set()):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f'{path} 引用的数据集字段无权限: {source_code}')

    references = iter_report_source_references(config)
    for index, item in enumerate(runtime_filters or []):
        if isinstance(item, dict):
            source_code = item.get('column')
            if isinstance(source_code, str) and source_code:
                references.append((f'runtime_filters[{index}].column', source_code))
    for path, source_code in references:
        await validate_source(source_code, path)
