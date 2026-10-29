"""Add the top-level master data module menu and its overview page."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0285_master_data_module_menus"
down_revision = "0283_performance_template_draft"
branch_labels = None
depends_on = None

# (code, label, icon, parent_code, display_order)
NEW_MENUS = [
    ("master_data", "主数据", "Collection", None, 570),
    ("master_data.overview", "主数据概览", "DataAnalysis", "master_data", 10),
]
SUPER_ROLE_NAME = "超级管理员"


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


def downgrade() -> None:
    conn = op.get_bind()
    for code, *_ in reversed(NEW_MENUS):
        conn.execute(sa.text("DELETE FROM role_menus WHERE menu_id IN (SELECT id FROM menus WHERE code = :code)"), {"code": code})
        conn.execute(sa.text("DELETE FROM menus WHERE code = :code"), {"code": code})
