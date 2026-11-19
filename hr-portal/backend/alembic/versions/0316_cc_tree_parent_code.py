"""cost_center_tree 增加 parent_code（上级编码）列与 table_columns 元数据。

背景（用户需求）：
- 北森「成本中心清单」报表的父级字段可能变化（可能有上级编码，也可能没有），
  资产写入需要「上级编码」这一可映射字段能力；源行无父编码时默认挂固定根。
- CostCenterNode 之前只靠 parent_id（内部 ID 外键）建树，无业务父编码列；
  org_tree 有 parent_org_code（tree_parent 角色），cost_center_tree 缺失。

本迁移：
1. ALTER TABLE cost_center_tree ADD COLUMN parent_code VARCHAR(64)（可空，仅记录源端父编码）。
2. table_columns 注册「上级编码」列并标 tree_role='tree_parent'，
   使 UCP 树资产写入分支（asset_sink_tree）按父编码挂父、缺省挂固定根。

存量节点 parent_code 置空（历史树由老同步链路 parent_id 建，无需回填）。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0316_cc_tree_parent_code"
down_revision = "0315_cc_tree_asset_registration"
branch_labels = None
depends_on = None

CC_TREE = "cost_center_tree"


def upgrade() -> None:
    conn = op.get_bind()

    # 1. 物理列（幂等保护：exists 检查再 ADD）
    cols = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": CC_TREE, "c": "parent_code"},
    ).fetchone()
    if cols is None:
        op.add_column(
            CC_TREE,
            sa.Column("parent_code", sa.String(64), nullable=True),
        )

    # 2. table_columns 元数据（幂等，对齐 0315 模式）
    conn.execute(
        sa.text(
            "INSERT INTO table_columns (table_name, column_code, column_label, data_type, "
            "is_pk_part, is_sensitive, auto_discovered, display_order, agg_role, tree_role) "
            "SELECT :t, 'parent_code', '上级编码', 'string', false, false, false, 25, 'dimension', 'tree_parent' "
            "WHERE NOT EXISTS (SELECT 1 FROM table_columns "
            "WHERE table_name = :t AND column_code = 'parent_code')"
        ).bindparams(
            sa.bindparam("t", type_=sa.String(64)),
        ),
        {"t": CC_TREE},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM table_columns WHERE table_name = :t AND column_code = 'parent_code'"
        ),
        {"t": CC_TREE},
    )
    op.drop_column(CC_TREE, "parent_code")
