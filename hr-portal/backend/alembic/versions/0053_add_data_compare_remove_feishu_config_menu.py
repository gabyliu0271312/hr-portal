"""数据对比菜单 + 移除飞书通知配置菜单

- 新增 system.data_compare 菜单（父节点 system.params）
- 删除 system.feishu_notification_config 菜单及对应 role_menus
- 为已有 system.params 权限的角色，同步授予 system.data_compare 权限
"""
import sqlalchemy as sa
from alembic import op

revision = "0053_add_data_compare_remove_feishu_config_menu"
down_revision = "0052_ai_skills"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ─── 1. 查询 system.params 的菜单 id ───
    params_id = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'system.params'")
    ).scalar()
    if params_id is None:
        raise RuntimeError("system.params menu not found, cannot add data_compare")

    # ─── 2. 新增 system.data_compare 菜单 ───
    conn.execute(
        sa.text(
            "INSERT INTO menus (code, label, icon, parent_id, display_order) "
            "VALUES ('system.data_compare', :label, :icon, :pid, :ord) "
            "ON CONFLICT (code) DO UPDATE SET icon = EXCLUDED.icon"
        ),
        {"label": "数据对比", "icon": "DataAnalysis", "pid": params_id, "ord": 260},
    )

    data_compare_row = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'system.data_compare'")
    ).first()

    # ─── 3. 为已有 system.params 权限的角色，授予 data_compare 权限 ───
    if data_compare_row:
        params_roles = conn.execute(
            sa.text(
                "SELECT DISTINCT role_id FROM role_menus rm "
                "JOIN menus m ON m.id = rm.menu_id "
                "WHERE m.code = 'system.params'"
            )
        ).fetchall()

        for (role_id,) in params_roles:
            existing = conn.execute(
                sa.text(
                    "SELECT 1 FROM role_menus WHERE role_id = :rid AND menu_id = :mid"
                ),
                {"rid": role_id, "mid": data_compare_row[0]},
            ).first()
            if not existing:
                conn.execute(
                    sa.text(
                        "INSERT INTO role_menus "
                        "(role_id, menu_id, can_view, can_create, can_update, can_delete, can_export) "
                        "VALUES (:rid, :mid, true, true, true, true, false)"
                    ),
                    {"rid": role_id, "mid": data_compare_row[0]},
                )

    # ─── 4. 移除 system.feishu_notification_config 菜单 ───
    feishu_row = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'system.feishu_notification_config'")
    ).first()
    if feishu_row:
        conn.execute(
            sa.text("DELETE FROM role_menus WHERE menu_id = :mid"),
            {"mid": feishu_row[0]},
        )
        conn.execute(
            sa.text("DELETE FROM menus WHERE id = :mid"),
            {"mid": feishu_row[0]},
        )


def downgrade() -> None:
    conn = op.get_bind()

    # ─── 还原 feishu_notification_config ───
    params_id = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'system.params'")
    ).scalar()
    if params_id:
        conn.execute(
            sa.text(
                "INSERT INTO menus (code, label, icon, parent_id, display_order) "
                "VALUES ('system.feishu_notification_config', :label, :icon, :pid, :ord) "
                "ON CONFLICT (code) DO NOTHING"
            ),
            {"label": "飞书通知配置", "icon": "ChatDotSquare", "pid": params_id, "ord": 250},
        )

    # ─── 移除 system.data_compare 菜单 ───
    dc_row = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'system.data_compare'")
    ).first()
    if dc_row:
        conn.execute(
            sa.text("DELETE FROM role_menus WHERE menu_id = :mid"),
            {"mid": dc_row[0]},
        )
        conn.execute(
            sa.text("DELETE FROM menus WHERE id = :mid"),
            {"mid": dc_row[0]},
        )
