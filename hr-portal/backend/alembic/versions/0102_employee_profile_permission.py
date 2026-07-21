"""register the employee-profile permission menu

Revision ID: 0102
Revises: 0101
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0102"
down_revision = "0101"
branch_labels = None
depends_on = None

MENU_CODE = "employee.profile"
PARENT_CODE = "tools.hr"
SUPER_ROLE_NAME = "超级管理员"


def upgrade() -> None:
    conn = op.get_bind()
    menu = conn.execute(sa.text("SELECT id FROM menus WHERE code = :code"), {"code": MENU_CODE}).fetchone()
    if menu is None:
        parent = conn.execute(sa.text("SELECT id FROM menus WHERE code = :code"), {"code": PARENT_CODE}).fetchone()
        max_order = conn.execute(sa.text("SELECT COALESCE(MAX(display_order), 0) FROM menus")).scalar_one()
        conn.execute(
            sa.text("INSERT INTO menus (code, label, icon, parent_id, display_order) VALUES (:code, :label, :icon, :parent_id, :display_order)"),
            {"code": MENU_CODE, "label": "员工基础信息查询", "icon": "User", "parent_id": parent[0] if parent else None, "display_order": max_order + 10},
        )
        menu = conn.execute(sa.text("SELECT id FROM menus WHERE code = :code"), {"code": MENU_CODE}).fetchone()
    role = conn.execute(sa.text("SELECT id FROM roles WHERE name = :name"), {"name": SUPER_ROLE_NAME}).fetchone()
    if menu is not None and role is not None:
        exists = conn.execute(sa.text("SELECT 1 FROM role_menus WHERE role_id = :role_id AND menu_id = :menu_id"), {"role_id": role[0], "menu_id": menu[0]}).fetchone()
        if exists is None:
            conn.execute(sa.text("INSERT INTO role_menus (role_id, menu_id, scope_dimension, can_view, can_create, can_update, can_delete, can_export) VALUES (:role_id, :menu_id, 'none', true, false, false, false, false)"), {"role_id": role[0], "menu_id": menu[0]})


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM role_menus WHERE menu_id IN (SELECT id FROM menus WHERE code = :code)"), {"code": MENU_CODE})
    conn.execute(sa.text("DELETE FROM menus WHERE code = :code"), {"code": MENU_CODE})
