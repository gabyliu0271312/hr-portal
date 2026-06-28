"""元数据加载器 — 读取 registered_tables 和 table_columns。

提供表/字段白名单和关联键信息，是 SchemaValidator 和 CompareTemplateEngine
的数据源。所有标识符（表名/字段/关联键）校验都以这里的输出为准。
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class TableMeta:
    """单张表的元数据快照"""

    def __init__(self, table_name: str, table_label: str, is_period: bool,
                 period_col: str | None, scope_strategy: str, join_col: str | None):
        self.table_name = table_name
        self.table_label = table_label
        self.is_period = is_period
        self.period_col = period_col
        self.scope_strategy = scope_strategy
        self.join_col = join_col
        self.columns: dict[str, ColumnMeta] = {}

    def get_join_keys(self) -> list[str]:
        """返回 is_pk_part=true 的所有字段 code（默认关联键）"""
        return [c.column_code for c in self.columns.values() if c.is_pk_part]

    def has_column(self, column_code: str) -> bool:
        return column_code in self.columns


class ColumnMeta:
    """单个字段的元数据"""

    def __init__(self, column_code: str, column_label: str, data_type: str,
                 is_pk_part: bool, is_sensitive: bool, agg_role: str | None,
                 scope_role: str | None):
        self.column_code = column_code
        self.column_label = column_label
        self.data_type = data_type
        self.is_pk_part = is_pk_part
        self.is_sensitive = is_sensitive
        self.agg_role = agg_role
        self.scope_role = scope_role


class MetadataLoader:
    """从 registered_tables + table_columns 加载表结构元数据。

    内置简单缓存：同一 db session 中多次调用只查一次数据库。
    """

    def __init__(self, db: AsyncSession):
        self._db = db
        self._tables: dict[str, TableMeta] | None = None
        self._loaded = False

    async def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        from app.data.models import RegisteredTable, TableColumn

        # 加载所有注册表
        reg_rows = (await self._db.execute(
            select(RegisteredTable).order_by(RegisteredTable.display_order)
        )).scalars().all()

        self._tables = {}
        for row in reg_rows:
            self._tables[row.table_name] = TableMeta(
                table_name=row.table_name,
                table_label=row.table_label,
                is_period=bool(row.is_period),
                period_col=row.period_col,
                scope_strategy=row.scope_strategy or "cross_filter",
                join_col=row.roster_join_col,
            )

        # 加载所有字段
        col_rows = (await self._db.execute(
            select(TableColumn).where(TableColumn.is_visible.is_(True))
        )).scalars().all()

        for row in col_rows:
            table = self._tables.get(row.table_name)
            if table is None:
                continue
            table.columns[row.column_code] = ColumnMeta(
                column_code=row.column_code,
                column_label=row.column_label,
                data_type=row.data_type or "string",
                is_pk_part=bool(row.is_pk_part),
                is_sensitive=bool(row.is_sensitive),
                agg_role=row.agg_role,
                scope_role=row.scope_role,
            )

        self._loaded = True

    async def get_table(self, table_name: str) -> TableMeta | None:
        await self._ensure_loaded()
        return self._tables.get(table_name)

    async def list_tables(self) -> list[TableMeta]:
        await self._ensure_loaded()
        return list(self._tables.values())

    async def validate_table(self, table_name: str) -> TableMeta:
        """校验表名是否在 registered_tables 白名单中，不在则抛错。"""
        meta = await self.get_table(table_name)
        if meta is None:
            raise ValueError(f"表 '{table_name}' 未注册，不在白名单中")
        return meta

    async def validate_column(self, table_name: str, column_code: str) -> ColumnMeta:
        """校验字段是否在 table_columns 白名单中，不在则抛错。"""
        meta = await self.validate_table(table_name)
        col = meta.columns.get(column_code)
        if col is None:
            raise ValueError(
                f"字段 '{column_code}' 不存在于表 '{table_name}' 的字段白名单中"
            )
        return col

    def _table_names(self) -> set[str]:
        if self._tables is None:
            return set()
        return set(self._tables.keys())
