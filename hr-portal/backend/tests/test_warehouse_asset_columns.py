import asyncio
from types import SimpleNamespace

from app.warehouse.service.assets import WarehouseService


class _RegisteredTableResult:
    def scalar_one_or_none(self):
        return object()


class _ColumnsResult:
    def __init__(self, columns):
        self._columns = columns

    def scalars(self):
        return SimpleNamespace(all=lambda: self._columns)


class _Session:
    def __init__(self, columns):
        self.columns = columns
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        if len(self.statements) == 1:
            return _RegisteredTableResult()
        return _ColumnsResult(self.columns)


def _column(*, is_visible: bool):
    return SimpleNamespace(
        id=1,
        column_code="hidden_field",
        column_label="Hidden field",
        data_type="string",
        is_pk_part=False,
        is_sensitive=False,
        agg_role="dimension",
        is_visible=is_visible,
        description=None,
        auto_discovered=True,
        is_computed=False,
        formula_expr=None,
        display_order=10,
        scope_role=None,
        copy_from_last_month=False,
        enum_options=None,
    )


def _load_columns(*, include_hidden: bool):
    columns = [_column(is_visible=False)]
    session = _Session(columns)

    result = asyncio.run(
        WarehouseService(session).get_asset_columns(
            "test_asset",
            include_hidden=include_hidden,
        )
    )

    return result, str(session.statements[1])


def test_asset_columns_default_to_visible_fields_only():
    result, statement = _load_columns(include_hidden=False)

    assert result[0]["is_visible"] is False
    assert "table_columns.is_visible = true" in statement


def test_asset_columns_include_hidden_for_field_management():
    result, statement = _load_columns(include_hidden=True)

    assert result[0]["is_visible"] is False
    assert "table_columns.is_visible = true" not in statement
