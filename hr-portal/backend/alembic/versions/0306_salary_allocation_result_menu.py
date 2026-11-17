"""Add salary tab + allocation result menu under people app.

- people.salary (二级分组「薪酬」) → people.salary.allocation_result (叶子「分摊结果」)
- 新菜单仅供「创梦人力 → 薪酬 → 分摊结果」页面使用，随创梦人力入口一起授权。
- 建「分摊结果」字段分组 + 初始标准字段（供后台字段设置直接使用/排序）。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0306_salary_allocation_result_menu"
down_revision = "0305_standard_field_display_order"
branch_labels = None
depends_on = None

# (code, label, icon, parent_code, display_order)
NEW_MENUS = [
    ("people.salary", "薪酬", "Money", "people.access", 225),
    ("people.salary.allocation_result", "分摊结果", "Histogram", "people.salary", 10),
]
SUPER_ROLE_NAME = "超级管理员"

# 分摊结果分组 + 初始标准字段（field_code, 显示名, 类型, 排序, 业务含义）
ALLOCATION_GROUP_NAME = "分摊结果"
ALLOCATION_FIELDS = [
    ("cost_period", "月份", "string", 10, "分摊结果的期间月份"),
    ("employee_no", "工号", "string", 20, "员工工号（标准字段，与人员信息页一致）"),
    ("full_name", "姓名", "string", 30, "员工姓名（以人员信息页当前值为准）"),
    ("cost_center_code", "成本中心编码", "string", 40, "成本中心编码（以成本中心树为准）"),
    ("cost_center_name", "成本中心名称", "string", 50, "成本中心名称（以成本中心树为准）"),
    ("allocation_percentage", "分摊比例", "number", 60, "员工在该成本中心的分摊比例"),
    ("synced_at", "更新时间", "datetime", 70, "分摊结果同步落库时间"),
]


def upgrade() -> None:
    conn = op.get_bind()
    existing = {row[0]: row[1] for row in conn.execute(sa.text("SELECT code, id FROM menus")).fetchall()}
    for code, label, icon, parent_code, order in NEW_MENUS:
        if code in existing:
            continue
        conn.execute(
            sa.text("INSERT INTO menus (code, label, icon, parent_id, display_order) "
                    "VALUES (:code, :label, :icon, :parent_id, :order)"),
            {"code": code, "label": label, "icon": icon,
             "parent_id": existing.get(parent_code) if parent_code else None, "order": order},
        )
        existing[code] = conn.execute(sa.text("SELECT id FROM menus WHERE code = :code"), {"code": code}).fetchone()[0]

    role = conn.execute(sa.text("SELECT id FROM roles WHERE name = :name"), {"name": SUPER_ROLE_NAME}).fetchone()
    if role is None:
        return
    assigned = {row[0] for row in conn.execute(
        sa.text("SELECT menu_id FROM role_menus WHERE role_id = :role_id"), {"role_id": role[0]}).fetchall()}
    for code, *_ in NEW_MENUS:
        menu_id = existing.get(code)
        if menu_id is None or menu_id in assigned:
            continue
        conn.execute(
            sa.text("INSERT INTO role_menus (role_id, menu_id, scope_dimension, can_view, can_create, "
                    "can_update, can_delete, can_export) VALUES (:role_id, :menu_id, 'none', true, true, true, true, true)"),
            {"role_id": role[0], "menu_id": menu_id},
        )

    # 分摊结果字段分组（幂等：已存在不重复建）
    group_row = conn.execute(
        sa.text("SELECT id FROM field_groups WHERE name = :name"), {"name": ALLOCATION_GROUP_NAME}
    ).fetchone()
    if group_row is None:
        conn.execute(
            sa.text("INSERT INTO field_groups (name, display_order, is_active) "
                    "VALUES (:name, :order, true)"),
            {"name": ALLOCATION_GROUP_NAME, "order": 70},
        )
        group_id = conn.execute(
            sa.text("SELECT id FROM field_groups WHERE name = :name"), {"name": ALLOCATION_GROUP_NAME}
        ).fetchone()[0]
    else:
        group_id = group_row[0]

    # 初始标准字段（幂等：已存在 field_code 不重复建）
    existing_fields = {row[0] for row in conn.execute(
        sa.text("SELECT field_code FROM standard_fields WHERE group_id = :gid"), {"gid": group_id}
    ).fetchall()}
    for field_code, name, data_type, order, definition in ALLOCATION_FIELDS:
        if field_code in existing_fields:
            continue
        conn.execute(
            sa.text("INSERT INTO standard_fields (field_code, display_name, data_type, display_order, "
                    "business_definition, entity_id, group_id, is_active, created_by) "
                    "VALUES (:code, :name, :type, :order, :def, NULL, :gid, true, 1)"),
            {"code": field_code, "name": name, "type": data_type, "order": order,
             "def": definition, "gid": group_id},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for code, *_ in reversed(NEW_MENUS):
        conn.execute(sa.text("DELETE FROM role_menus WHERE menu_id IN (SELECT id FROM menus WHERE code = :code)"), {"code": code})
        conn.execute(sa.text("DELETE FROM menus WHERE code = :code"), {"code": code})
    # 分摊结果分组与初始字段一并回退（仅当为本迁移创建的）
    conn.execute(
        sa.text("DELETE FROM standard_fields WHERE group_id IN "
                "(SELECT id FROM field_groups WHERE name = :name)"),
        {"name": ALLOCATION_GROUP_NAME},
    )
    conn.execute(
        sa.text("DELETE FROM field_groups WHERE name = :name"), {"name": ALLOCATION_GROUP_NAME}
    )
