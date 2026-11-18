"""UCP 树资产直写：cost_center_tree 注册资产列元数据（方案乙-1）。

背景：
- org_tree 已在 0303 注册 table_columns.tree_role（tree_code/tree_name/
  tree_parent/tree_active），asset_sink 树分支按 tree_role 识别并写入。
- cost_center_tree 从未注册资产/列元数据，资产写入下拉选不到。
- 本迁移给 cost_center_tree 补 table_columns 行 + tree_role 元数据
  （对齐 0303 模式），并登记 RegisteredTable 资产（seed _BUILTIN_TABLES
  已在下次 seed 幂等写入，这里显式补一行保证迁移即资产可见）。

列角色：
- code（编码）→ tree_code
- name（名称）→ tree_name
- is_active（启用状态）→ tree_active（源可提供；缺失默认启用）
- 无父列：成本中心源无父字段，全部挂固定根（tree_parent 不配置）
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0315_cc_tree_asset_registration"
down_revision = "0314_hard_drop_org_level_ids"
branch_labels = None
depends_on = None

CC_TREE = "cost_center_tree"

# (column_code, label, data_type, is_pk_part, tree_role, display_order)
_COLUMNS = [
    ("code", "编码", "string", True, "tree_code", 10),
    ("name", "名称", "string", False, "tree_name", 20),
    ("is_active", "启用状态", "boolean", False, "tree_active", 30),
]


def upgrade() -> None:
    conn = op.get_bind()

    # 1. 资产行（幂等；seed 也会补，这里保证迁移即生效）
    exists_asset = conn.execute(
        sa.text("SELECT 1 FROM registered_tables WHERE table_name = :t"), {"t": CC_TREE}
    ).fetchone()
    if exists_asset is None:
        conn.execute(
            sa.text(
                "INSERT INTO registered_tables (table_name, table_label, is_period, period_col, "
                "period_source, is_builtin, is_result_table, scope_strategy, warehouse_layer, "
                "asset_status, last_quality_status, icon, display_order) "
                "VALUES (:t, '成本中心', false, 'month', 'field', true, false, "
                "'cc_first', 'ODS', 'published', 'unknown', 'Wallet', 57)"
            ),
            {"t": CC_TREE},
        )

    # 2. table_columns 列元数据 + tree_role（幂等）
    for code, label, dtype, is_pk, role, order in _COLUMNS:
        conn.execute(
            sa.text(
                "INSERT INTO table_columns (table_name, column_code, column_label, data_type, "
                "is_pk_part, is_sensitive, auto_discovered, display_order, agg_role, tree_role) "
                "SELECT :t, :c, :l, :d, :pk, false, false, :o, 'dimension', :r "
                "WHERE NOT EXISTS (SELECT 1 FROM table_columns "
                "WHERE table_name = :t AND column_code = :c)"
            ).bindparams(
                sa.bindparam("t", type_=sa.String(64)),
                sa.bindparam("c", type_=sa.String(128)),
                sa.bindparam("l", type_=sa.String(128)),
                sa.bindparam("d", type_=sa.String(32)),
                sa.bindparam("pk", type_=sa.Boolean()),
                sa.bindparam("o", type_=sa.Integer()),
                sa.bindparam("r", type_=sa.String(32)),
            ),
            {"t": CC_TREE, "c": code, "l": label, "d": dtype, "pk": is_pk, "o": order, "r": role},
        )


def downgrade() -> None:
    raise RuntimeError("成本中心树资产注册为 UCP 直写依赖，不可自动降级")
