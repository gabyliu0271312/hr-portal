"""新增组织单元表 org_unit + 收敛花名册 org_node_code（源端真编码上位）

本迁移原子完成两件事（spec 007）：
1. 注册并创建 `org_unit` 物理表，预 seed 9 个业务字段（org_code 为业务主键）。
   必须同时注册元数据 + 建物理表：启动会反射 registered_tables 对应的真实表，
   只注册不建表会让动态表反射阶段失败。
2. 花名册 `org_node_code` 收敛为唯一一列、源端真编码上位：
   - 删除系统派生的 `org_node_code`（存 L7_xxx hash，随派生函数退场作废）。
   - 把源端列 `org_node_code_2`（UUID 锚定「组织节点编码」）改名顶上为 `org_node_code`，
     设 scope_role=org_node_code，保留 source_field_id；后续同步稳定落此列、不再加后缀。
   - 源端列不存在时，保证 org_node_code 元数据 label=组织节点编码、scope_role 就位，
     并清掉旧 hash，让下次同步按表头映射回填。
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0044_add_org_unit"
down_revision: Union[str, None] = "0043_drop_global_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_ROSTER = "emp_realtime_roster"

# org_unit 9 个业务字段：(column_code, column_label, data_type, is_pk_part)
_ORG_UNIT_COLUMNS = [
    ("org_code", "编码", "string", True),
    ("org_name", "组织名称", "string", False),
    ("org_full_name", "组织全称", "string", False),
    ("parent_org_code", "行政上级组织编码", "string", False),
    ("parent_org_dim", "行政维度上级", "string", False),
    ("org_status", "状态", "string", False),
    ("effective_date", "生效日期", "date", False),
    ("change_date", "变动日期", "date", False),
    ("change_type", "变动类型", "string", False),
]

_TYPE_MAP = {
    "string": "TEXT",
    "text": "TEXT",
    "number": "NUMERIC",
    "integer": "INTEGER",
    "date": "DATE",
    "datetime": "TIMESTAMPTZ",
    "boolean": "BOOLEAN",
    "bool": "BOOLEAN",
    "enum": "TEXT",
}


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


# ===== 1. org_unit：注册 + 建表 + 预 seed 字段 =====


def _register_org_unit(bind) -> None:
    bind.execute(
        sa.text(
            """
            INSERT INTO registered_tables (
                table_name, table_label, description, is_period, period_col,
                period_source, is_builtin, is_result_table, roster_join_col,
                scope_strategy, icon, display_order
            ) VALUES (
                'org_unit', '组织单元', NULL, false, 'month',
                'field', true, false, NULL,
                'cross_filter', 'Share', 55
            )
            ON CONFLICT (table_name) DO NOTHING
            """
        )
    )


def _create_org_unit_table(bind) -> None:
    if _table_exists(bind, "org_unit"):
        return
    business_defs = [
        f"    {_quote(code)} {_TYPE_MAP[dtype]}"
        for code, _label, dtype, _pk in _ORG_UNIT_COLUMNS
    ]
    defs = [
        "    id BIGSERIAL PRIMARY KEY",
        "    pk_hash VARCHAR(64) NOT NULL",
        "    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        *business_defs,
        "    CONSTRAINT uq_org_unit_pk UNIQUE (pk_hash)",
    ]
    op.execute('CREATE TABLE IF NOT EXISTS "org_unit" (\n' + ",\n".join(defs) + "\n)")
    op.execute('CREATE INDEX IF NOT EXISTS ix_org_unit_pk_hash ON "org_unit" (pk_hash)')


def _seed_org_unit_columns(bind) -> None:
    order = 10
    for code, label, dtype, is_pk in _ORG_UNIT_COLUMNS:
        if not _metadata_exists(bind, "org_unit", code):
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
                        'org_unit', :code, :label, NULL,
                        :data_type, :is_pk, false, true,
                        :order, false, false,
                        NULL, 'dimension', false, NULL,
                        NULL, NULL
                    )
                    ON CONFLICT (table_name, column_code) DO NOTHING
                    """
                ),
                {
                    "code": code,
                    "label": label,
                    "data_type": dtype,
                    "is_pk": is_pk,
                    "order": order,
                },
            )
        order += 10


# ===== 2. 花名册 org_node_code 收敛 =====


def _converge_org_node_code(bind) -> None:
    if not _table_exists(bind, _ROSTER):
        return

    has_derived = _column_exists(bind, _ROSTER, "org_node_code")
    has_source = _column_exists(bind, _ROSTER, "org_node_code_2")
    roster_q = _quote(_ROSTER)

    if has_source:
        # 源端列存在：删派生列腾名字，再把源端列改名顶上
        if has_derived:
            op.execute(
                f'ALTER TABLE {roster_q} DROP COLUMN IF EXISTS "org_node_code" CASCADE'
            )
            bind.execute(
                sa.text(
                    "DELETE FROM table_columns "
                    "WHERE table_name = :t AND column_code = 'org_node_code'"
                ),
                {"t": _ROSTER},
            )
        op.execute(
            f'ALTER TABLE {roster_q} RENAME COLUMN "org_node_code_2" TO "org_node_code"'
        )
        bind.execute(
            sa.text(
                """
                UPDATE table_columns
                SET column_code = 'org_node_code',
                    column_label = '组织节点编码',
                    scope_role = 'org_node_code',
                    is_visible = true,
                    auto_discovered = true
                WHERE table_name = :t AND column_code = 'org_node_code_2'
                """
            ),
            {"t": _ROSTER},
        )
    else:
        # 源端列尚未同步进来：保留 org_node_code 物理列，清掉旧 hash，
        # 把元数据 label/scope_role 摆正，让下次同步按表头「组织节点编码」回填。
        if not has_derived:
            op.execute(
                f'ALTER TABLE {roster_q} ADD COLUMN IF NOT EXISTS "org_node_code" TEXT'
            )
        else:
            op.execute(f'UPDATE {roster_q} SET "org_node_code" = NULL')
        if _metadata_exists(bind, _ROSTER, "org_node_code"):
            bind.execute(
                sa.text(
                    """
                    UPDATE table_columns
                    SET column_label = '组织节点编码',
                        scope_role = 'org_node_code',
                        is_visible = true,
                        auto_discovered = true
                    WHERE table_name = :t AND column_code = 'org_node_code'
                    """
                ),
                {"t": _ROSTER},
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
                        :t, 'org_node_code', '组织节点编码', NULL,
                        'string', false, false, true,
                        999, true, false,
                        NULL, 'dimension', false, NULL,
                        'org_node_code', NULL
                    )
                    ON CONFLICT (table_name, column_code) DO NOTHING
                    """
                ),
                {"t": _ROSTER},
            )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("registered_tables") or not inspector.has_table(
        "table_columns"
    ):
        return

    _register_org_unit(bind)
    _create_org_unit_table(bind)
    _seed_org_unit_columns(bind)
    _converge_org_node_code(bind)


def downgrade() -> None:
    # org_unit 是应用拥有的数据容器；org_node_code 收敛是有意的口径对齐，均不回滚。
    pass
