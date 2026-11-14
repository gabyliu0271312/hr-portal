"""配置驱动建树（阶段 A）：TableColumn.tree_role + org_tree 业务列

- TableColumn 新增 tree_role 列（树字段角色，沿 scope_role 模式，代码常量枚举）：
  tree_code / tree_name / tree_parent / tree_active / tree_leaf / tree_effective / tree_expire / None
- org_tree 表新增业务列 parent_org_code（上级编码）、org_status（启用状态），
  承接 UCP 数据连接直接写入；建树器按 tree_role 配置读列、不认硬编码列名。
- org_unit 表资产不动（保留其他用途）；不切正式输入（阶段 A 边界）。
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0303_tree_role_configurable_build"
down_revision: Union[str, None] = "0302_pm_shared_result_completion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. TableColumn 新增 tree_role 列
    op.add_column("table_columns", sa.Column("tree_role", sa.String(32), nullable=True))

    # 2. org_tree 表新增业务列（承接 UCP 直接写入）
    op.add_column("org_tree", sa.Column("parent_org_code", sa.String(64), nullable=True))
    op.add_column("org_tree", sa.Column("org_status", sa.String(32), nullable=True))

    # 3. org_tree 树字段角色元数据（记在列自己身上，沿 scope_role 模式）
    #    编码列 = org_code（已有列），名称列 = org_name（已有列），
    #    上级列 = parent_org_code（新列），启用态列 = org_status（新列）
    for column_code, tree_role, label, order in (
        ("org_code", "tree_code", "编码", 10),
        ("org_name", "tree_name", "组织名称", 20),
        ("parent_org_code", "tree_parent", "上级编码", 30),
        ("org_status", "tree_active", "启用状态", 40),
    ):
        bind.execute(
            sa.text(
                "UPDATE table_columns SET tree_role = :role "
                "WHERE table_name = 'org_tree' AND column_code = :code"
            ),
            {"role": tree_role, "code": column_code},
        )
        bind.execute(
            sa.text(
                "INSERT INTO table_columns (table_name, column_code, column_label, data_type, "
                "is_pk_part, is_sensitive, auto_discovered, display_order, agg_role, tree_role) "
                "SELECT 'org_tree', :code, :label, 'string', false, false, false, :order, 'dimension', :role "
                "WHERE NOT EXISTS (SELECT 1 FROM table_columns "
                "WHERE table_name = 'org_tree' AND column_code = :code)"
            ),
            {"code": column_code, "label": label, "order": order, "role": tree_role},
        )


def downgrade() -> None:
    bind = op.get_bind()
    # 保留数据防误删：org_tree 已有 UCP 写入的业务值则拒绝降级
    has_values = bind.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM org_tree "
            "WHERE parent_org_code IS NOT NULL OR org_status IS NOT NULL)"
        )
    ).scalar()
    if has_values:
        raise RuntimeError("ORG_TREE_BUSINESS_COLUMNS_HAS_DATA")
    for column in ("parent_org_code", "org_status"):
        op.drop_column("org_tree", column)
    op.drop_column("table_columns", "tree_role")
