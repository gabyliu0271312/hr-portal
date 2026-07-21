"""grant employee-profile view permission to the super role

Revision ID: 0103
Revises: 0102
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0103"
down_revision = "0102"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    menu = conn.execute(sa.text("SELECT id FROM menus WHERE code = 'employee.profile'")).fetchone()
    role = conn.execute(sa.text("SELECT id FROM roles WHERE name = :name"), {"name": "\u8d85\u7ea7\u7ba1\u7406\u5458"}).fetchone()
    if menu is None or role is None:
        return
    exists = conn.execute(
        sa.text("SELECT 1 FROM role_menus WHERE role_id = :role_id AND menu_id = :menu_id"),
        {"role_id": role[0], "menu_id": menu[0]},
    ).fetchone()
    if exists is None:
        conn.execute(
            sa.text("INSERT INTO role_menus (role_id, menu_id, scope_dimension, can_view, can_create, can_update, can_delete, can_export) VALUES (:role_id, :menu_id, 'none', true, false, false, false, false)"),
            {"role_id": role[0], "menu_id": menu[0]},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM role_menus WHERE role_id IN (SELECT id FROM roles WHERE name = :name) AND menu_id IN (SELECT id FROM menus WHERE code = 'employee.profile')"),
        {"name": "\u8d85\u7ea7\u7ba1\u7406\u5458"},
    )
