"""Add automation and feishu notification menus + super admin permissions

Revision ID: 0050_automation_feishu_menus
Revises: 0049_feishu_notification_completions
Create Date: 2026-06-27

新增菜单节点：
  system.automation              — 自动化（二级分组）
  automation.rules               — 自动化规则（三级叶子）
  automation.executions          — 执行记录（三级叶子）
  system.feishu_notification_config — 飞书通知配置（三级叶子）

并给"超级管理员"角色授予全部操作权限（V/C/U/D/E）。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0050_automation_feishu_menus"
down_revision = "0049_feishu_notification_completions"
branch_labels = None
depends_on = None

# 新菜单定义：(code, label, icon, parent_code)
NEW_MENUS = [
    # 自动化分组及其子节点
    ("system.automation", "自动化", "SetUp", "system"),
    ("automation.rules", "自动化规则", "Operation", "system.automation"),
    ("automation.executions", "执行记录", "List", "system.automation"),
    # 飞书通知配置（挂在参数配置下）
    ("system.feishu_notification_config", "飞书通知配置", "ChatDotSquare", "system.params"),
]

SUPER_ROLE_NAME = "超级管理员"


def upgrade() -> None:
    conn = op.get_bind()

    # 查询已有菜单 code → (id, display_order)
    rows = conn.execute(
        sa.text("SELECT code, id, display_order FROM menus")
    ).fetchall()
    existing_menus = {row[0]: (row[1], row[2]) for row in rows}

    # 计算新菜单的 display_order
    max_order = max((o for _, o in existing_menus.values()), default=0)

    new_menu_ids: dict[str, int] = {}

    for code, label, icon, parent_code in NEW_MENUS:
        if code in existing_menus:
            new_menu_ids[code] = existing_menus[code][0]
            continue
        max_order += 10
        parent_id = None
        if parent_code:
            pid_from_existing = existing_menus.get(parent_code)
            pid_from_new = new_menu_ids.get(parent_code)
            if pid_from_existing:
                parent_id = pid_from_existing[0]
            elif pid_from_new:
                parent_id = pid_from_new

        conn.execute(
            sa.text(
                "INSERT INTO menus (code, label, icon, parent_id, display_order) "
                "VALUES (:code, :label, :icon, :parent_id, :display_order)"
            ),
            {
                "code": code,
                "label": label,
                "icon": icon,
                "parent_id": parent_id,
                "display_order": max_order,
            },
        )
        # 获取新插入的 id
        rid = conn.execute(
            sa.text("SELECT id FROM menus WHERE code = :code"), {"code": code}
        ).fetchone()
        if rid:
            new_menu_ids[code] = rid[0]

    # 查询超级管理员角色
    role_row = conn.execute(
        sa.text("SELECT id FROM roles WHERE name = :name"), {"name": SUPER_ROLE_NAME}
    ).fetchone()
    if role_row is None:
        return

    role_id = role_row[0]

    # 查询已有 role_menus 关联
    existing_rms = set(
        row[0]
        for row in conn.execute(
            sa.text("SELECT menu_id FROM role_menus WHERE role_id = :role_id"),
            {"role_id": role_id},
        ).fetchall()
    )

    # 给新菜单授予全部操作权限
    for code, _label, _icon, _parent_code in NEW_MENUS:
        menu_id = new_menu_ids.get(code)
        if menu_id is None:
            existing = existing_menus.get(code)
            if existing:
                menu_id = existing[0]
        if menu_id is None or menu_id in existing_rms:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO role_menus "
                "(role_id, menu_id, scope_dimension, can_view, can_create, can_update, can_delete, can_export) "
                "VALUES (:role_id, :menu_id, :scope_dimension, :can_view, :can_create, :can_update, :can_delete, :can_export)"
            ),
            {
                "role_id": role_id,
                "menu_id": menu_id,
                "scope_dimension": "none",
                "can_view": True,
                "can_create": True,
                "can_update": True,
                "can_delete": True,
                "can_export": True,
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    # 删除新菜单的 role_menus 关联
    for code, _label, _icon, _parent_code in NEW_MENUS:
        conn.execute(
            sa.text(
                "DELETE FROM role_menus WHERE menu_id IN "
                "(SELECT id FROM menus WHERE code = :code)"
            ),
            {"code": code},
        )
    # 删除菜单记录（从叶子到根，避免外键约束）
    for code, _label, _icon, _parent_code in reversed(NEW_MENUS):
        conn.execute(
            sa.text("DELETE FROM menus WHERE code = :code"), {"code": code}
        )
