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


def _column():
    return SimpleNamespace(
        id=1,
        column_code="business_field",
        column_label="Business field",
        data_type="string",
        is_pk_part=False,
        is_sensitive=False,
        agg_role="dimension",
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
    columns = [_column()]
    session = _Session(columns)

    result = asyncio.run(
        WarehouseService(session).get_asset_columns(
            "test_asset",
            include_hidden=include_hidden,
        )
    )

    return result, str(session.statements[1])


def test_asset_columns_use_code_rule_without_visibility_flag():
    result, statement = _load_columns(include_hidden=False)
    assert result[0]["column_code"] == "business_field"
    assert "is_visible" not in statement


def test_asset_columns_include_hidden_compatibility_does_not_change_code_rule():
    result, statement = _load_columns(include_hidden=True)
    assert result[0]["column_code"] == "business_field"
    assert "is_visible" not in statement
