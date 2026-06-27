"""迁移自动化菜单：移至提效工具 / 更名自动通知 / 合并执行记录到操作日志

- automation.rules: parent_id → tools.hr (18)，label → "自动通知"
- 删除 automation.executions / system.automation 菜单节点及对应 role_menus
- 为所有拥有 tools.hr 菜单权限的角色，同步授予 automation.rules 的查看权限
"""

import sqlalchemy as sa
from alembic import op

revision = "0051_move_automation_to_tools"
down_revision = "0050_automation_feishu_menus"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ─── 1. 查询 tools.hr 的菜单 id ───
    hr_id = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'tools.hr'")
    ).scalar()
    if hr_id is None:
        raise RuntimeError("菜单 tools.hr 不存在，无法迁移")

    # ─── 2. 更新 automation.rules ───
    rules_row = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'automation.rules'")
    ).first()
    if rules_row:
        conn.execute(
            sa.text(
                "UPDATE menus SET parent_id = :pid, label = '自动通知', display_order = 335 WHERE code = 'automation.rules'"
            ),
            {"pid": hr_id},
        )

    # ─── 3. 删除 automation.executions 菜单及其角色权限 ───
    exec_row = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'automation.executions'")
    ).first()
    if exec_row:
        conn.execute(
            sa.text("DELETE FROM role_menus WHERE menu_id = :mid"),
            {"mid": exec_row[0]},
        )
        conn.execute(
            sa.text("DELETE FROM menus WHERE id = :mid"),
            {"mid": exec_row[0]},
        )

    # ─── 4. 删除 system.automation 分组节点 ───
    auto_row = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'system.automation'")
    ).first()
    if auto_row:
        conn.execute(
            sa.text("DELETE FROM role_menus WHERE menu_id = :mid"),
            {"mid": auto_row[0]},
        )
        conn.execute(
            sa.text("DELETE FROM menus WHERE id = :mid"),
            {"mid": auto_row[0]},
        )

    # ─── 5. 为已有 tools.hr 权限的角色，授予 automation.rules 查看权限 ───
    if rules_row:
        # 获取所有拥有 tools.hr 权限的角色
        hr_roles = conn.execute(
            sa.text(
                "SELECT DISTINCT role_id FROM role_menus rm JOIN menus m ON m.id = rm.menu_id WHERE m.code = 'tools.hr'"
            )
        ).fetchall()

        for (role_id,) in hr_roles:
            existing = conn.execute(
                sa.text(
                    "SELECT 1 FROM role_menus WHERE role_id = :rid AND menu_id = :mid"
                ),
                {"rid": role_id, "mid": rules_row[0]},
            ).first()
            if not existing:
                conn.execute(
                    sa.text(
                        "INSERT INTO role_menus (role_id, menu_id, can_view, can_create, can_update, can_delete, can_export) "
                        "VALUES (:rid, :mid, true, true, true, true, false)"
                    ),
                    {"rid": role_id, "mid": rules_row[0]},
                )


def downgrade() -> None:
    conn = op.get_bind()

    # 还原 system.automation 分组
    conn.execute(
        sa.text(
            "INSERT INTO menus (code, label, icon, parent_id, display_order) "
            "VALUES ('system.automation', '自动化', 'SetUp', 1, 210) "
            "ON CONFLICT (code) DO NOTHING"
        )
    )
    auto_row = conn.execute(
        sa.text("SELECT id FROM menus WHERE code = 'system.automation'")
    ).scalar()

    # 还原 automation.rules 的 parent_id
    if auto_row:
        conn.execute(
            sa.text(
                "UPDATE menus SET parent_id = :pid, label = '自动化规则', display_order = 220 WHERE code = 'automation.rules'"
            ),
            {"pid": auto_row},
        )

    # 还原 automation.executions
    if auto_row:
        conn.execute(
            sa.text(
                "INSERT INTO menus (code, label, icon, parent_id, display_order) "
                "VALUES ('automation.executions', '执行记录', 'List', :pid, 230) "
                "ON CONFLICT (code) DO NOTHING"
            ),
            {"pid": auto_row},
        )
