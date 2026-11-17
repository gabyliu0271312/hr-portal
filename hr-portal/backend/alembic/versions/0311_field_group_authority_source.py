"""Add authority_source to field_groups + org info group + payroll result menu.

- field_groups.authority_source: 分组承载校验权威源（org_tree / roster / None）。
  设计 B：表复用了某分组的字段 → 按该分组权威源做一致性校验。
- 新增「组织信息」分组（权威源=org_tree），组织类标准字段归入该分组（仅 group_id，不动 entity_id）。
- 新增「薪酬信息」分组（权威源=None，供用户后续在字段管理建薪酬字段）。
- people.salary 下新增「薪资结果」叶子菜单（people.salary.payroll_result）+ 超管授权。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0311_field_group_authority_source"
down_revision = "0310_pm_multiple_comparison_rules"
branch_labels = None
depends_on = None

SUPER_ROLE_NAME = "超级管理员"

# (分组名, display_order, authority_source)
NEW_GROUPS = [
    ("组织信息", 60, "org_tree"),
    ("薪酬信息", 80, None),
]

# 组织类标准字段（归入「组织信息」分组，仅改 group_id，不动 entity_id）
ORG_FIELD_CODES = [
    "company_org",
    "department",
    "department_2",
    "department_3",
    "department_4",
    "department_5",
    "org_node_code",
    "bu",
]

# 薪资结果菜单
NEW_MENUS = [
    ("people.salary.payroll_result", "薪资结果", "Money", "people.salary", 20),
]


def upgrade() -> None:
    conn = op.get_bind()

    op.add_column(
        "field_groups",
        sa.Column("authority_source", sa.String(32), nullable=True, server_default=None),
    )

    # 新增分组（幂等）
    group_ids: dict[str, int] = {}
    existing = {row[0]: row[1] for row in conn.execute(sa.text("SELECT name, id FROM field_groups")).fetchall()}
    for name, order, authority in NEW_GROUPS:
        if name in existing:
            gid = existing[name]
            conn.execute(
                sa.text("UPDATE field_groups SET authority_source = :auth WHERE id = :gid"),
                {"auth": authority, "gid": gid},
            )
        else:
            conn.execute(
                sa.text("INSERT INTO field_groups (name, display_order, is_active, authority_source) "
                        "VALUES (:name, :order, true, :auth)"),
                {"name": name, "order": order, "auth": authority},
            )
            gid = conn.execute(
                sa.text("SELECT id FROM field_groups WHERE name = :name"), {"name": name}
            ).fetchone()[0]
        group_ids[name] = gid

    # 组织类字段归入「组织信息」分组（幂等：已在该分组不动）
    org_group_id = group_ids["组织信息"]
    existing_fields = {row[0] for row in conn.execute(
        sa.text("SELECT field_code FROM standard_fields WHERE group_id = :gid"), {"gid": org_group_id}
    ).fetchall()}
    for code in ORG_FIELD_CODES:
        if code in existing_fields:
            continue
        conn.execute(
            sa.text("UPDATE standard_fields SET group_id = :gid WHERE field_code = :code"),
            {"gid": org_group_id, "code": code},
        )

    # 薪资结果菜单（幂等）+ 超管授权
    existing_menu_ids = {row[0]: row[1] for row in conn.execute(sa.text("SELECT code, id FROM menus")).fetchall()}
    for code, label, icon, parent_code, order in NEW_MENUS:
        if code in existing_menu_ids:
            continue
        conn.execute(
            sa.text("INSERT INTO menus (code, label, icon, parent_id, display_order) "
                    "VALUES (:code, :label, :icon, :parent_id, :order)"),
            {"code": code, "label": label, "icon": icon,
             "parent_id": existing_menu_ids.get(parent_code), "order": order},
        )
        existing_menu_ids[code] = conn.execute(
            sa.text("SELECT id FROM menus WHERE code = :code"), {"code": code}
        ).fetchone()[0]

    role = conn.execute(sa.text("SELECT id FROM roles WHERE name = :name"), {"name": SUPER_ROLE_NAME}).fetchone()
    if role is not None:
        assigned = {row[0] for row in conn.execute(
            sa.text("SELECT menu_id FROM role_menus WHERE role_id = :role_id"), {"role_id": role[0]}
        ).fetchall()}
        for code, *_ in NEW_MENUS:
            menu_id = existing_menu_ids.get(code)
            if menu_id is None or menu_id in assigned:
                continue
            conn.execute(
                sa.text("INSERT INTO role_menus (role_id, menu_id, scope_dimension, can_view, can_create, "
                        "can_update, can_delete, can_export) VALUES (:role_id, :menu_id, 'none', true, true, true, true, true)"),
                {"role_id": role[0], "menu_id": menu_id},
            )

    # 薪资结果表单初始绑定（form_key=payroll_result）：复用工号/姓名/组织编码/组织名称标准字段。
    # 薪酬金额字段由用户后续在字段管理「薪酬信息」分组下新建并绑定。
    payroll_bindings = [
        ("pay_month", "月份", "string", 10, "工资结果的期间月份"),
        ("employee_no", "工号", "string", 20, "员工工号（标准字段，与人员信息页一致）"),
        ("full_name", "姓名", "string", 30, "员工姓名（以人员信息页当前值为准）"),
        ("org_node_code", "末级组织编码", "string", 40, "员工末级组织编码（以组织树为准）"),
        ("org_level_1_code", "一级组织编码", "string", 50, "一级组织编码（由组织树投影回填）"),
        ("org_level_2_code", "二级组织编码", "string", 60, "二级组织编码（由组织树投影回填）"),
        ("org_level_3_code", "三级组织编码", "string", 70, "三级组织编码（由组织树投影回填）"),
        ("org_level_4_code", "四级组织编码", "string", 80, "四级组织编码（由组织树投影回填）"),
    ]
    existing_bindings = {row[0] for row in conn.execute(
        sa.text("SELECT standard_field_id FROM form_field_bindings WHERE form_key = 'payroll_result'")
    ).fetchall()}
    for field_code, name, dtype, order, definition in payroll_bindings:
        field_row = conn.execute(
            sa.text("SELECT id FROM standard_fields WHERE field_code = :c"), {"c": field_code}
        ).fetchone()
        if field_row is None:
            # 组织投影列等字段尚未在标准目录存在时，随本迁移创建（无实体归属，供薪资结果页展示）
            conn.execute(
                sa.text("INSERT INTO standard_fields (field_code, display_name, data_type, display_order, "
                        "business_definition, entity_id, group_id, is_active, created_by) "
                        "VALUES (:c, :n, :t, :o, :d, NULL, NULL, true, 1)"),
                {"c": field_code, "n": name, "t": dtype, "o": order, "d": definition},
            )
            field_row = conn.execute(
                sa.text("SELECT id FROM standard_fields WHERE field_code = :c"), {"c": field_code}
            ).fetchone()
        fid = field_row[0]
        if fid not in existing_bindings:
            conn.execute(
                sa.text("INSERT INTO form_field_bindings (form_key, standard_field_id, display_order) "
                        "VALUES ('payroll_result', :f, :o)"),
                {"f": fid, "o": order},
            )


def downgrade() -> None:
    raise RuntimeError("字段分组权威源与组织字段归属为治理语义，不可自动降级")
