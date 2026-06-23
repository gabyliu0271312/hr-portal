"""org_unit 字段调整：删「变动日期」、新增「设立日期」(放生效日期前)

spec 007 后续调整。0044 已建表 + 9 字段；本迁移把组织单元的日期字段口径改为
「设立日期 → 生效日期」，去掉「变动日期」：
- 删除 change_date 物理列 + table_columns 元数据。
- 新增 establish_date（设立日期）物理列 + 元数据，display_order=65 排在
  effective_date(70) 之前。
- establish_date 靠中文表头「设立日期」匹配（source_field_id 暂为 NULL），
  下次同步北森按 title_to_code 落到此列。

幂等：列已存在/已删均安全跳过；可重复执行。
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0045_org_unit_establish_date"
down_revision: Union[str, None] = "0044_add_org_unit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLE = "org_unit"


def _quote(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) * 2)}"'


def _table_exists(bind, table: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = :t
                )
                """
            ),
            {"t": table},
        ).scalar_one()
    )


def _column_exists(bind, table: str, column: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = :t AND column_name = :c
                )
                """
            ),
            {"t": table, "c": column},
        ).scalar_one()
    )


def _metadata_exists(bind, table: str, code: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                "SELECT EXISTS (SELECT 1 FROM table_columns "
                "WHERE table_name = :t AND column_code = :c)"
            ),
            {"t": table, "c": code},
        ).scalar_one()
    )


def upgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(bind, _TABLE):
        return
    table_q = _quote(_TABLE)

    # 1) 删「变动日期」change_date：物理列 + 元数据
    if _column_exists(bind, _TABLE, "change_date"):
        op.execute(f'ALTER TABLE {table_q} DROP COLUMN IF EXISTS "change_date" CASCADE')
    bind.execute(
        sa.text(
            "DELETE FROM table_columns "
            "WHERE table_name = :t AND column_code = 'change_date'"
        ),
        {"t": _TABLE},
    )

    # 2) 新增「设立日期」establish_date：物理列
    if not _column_exists(bind, _TABLE, "establish_date"):
        op.execute(
            f'ALTER TABLE {table_q} ADD COLUMN IF NOT EXISTS "establish_date" DATE'
        )

    # 3) 元数据：display_order=65（排在 effective_date=70 之前）
    if _metadata_exists(bind, _TABLE, "establish_date"):
        bind.execute(
            sa.text(
                """
                UPDATE table_columns
                SET column_label = '设立日期', data_type = 'date',
                    display_order = 65, is_visible = true, auto_discovered = true
                WHERE table_name = :t AND column_code = 'establish_date'
                """
            ),
            {"t": _TABLE},
        )
    else:
        bind.execute(
            sa.text(
                """
                INSERT INTO table_columns (
                    table_name, column_code, column_label, source_field_id,
                    data_type, is_pk_part, is_sensitive, is_visible,
                    display_order, auto_discovered, copy_from_last_month,
                    enum_options, agg_role, is_computed, formula_expr,
                    scope_role, description
                ) VALUES (
                    :t, 'establish_date', '设立日期', NULL,
                    'date', false, false, true,
                    65, true, false,
                    NULL, 'dimension', false, NULL,
                    NULL, NULL
                )
                ON CONFLICT (table_name, column_code) DO NOTHING
                """
            ),
            {"t": _TABLE},
        )


def downgrade() -> None:
    # 字段口径调整不回滚。
    pass
