"""统一组织字段编码语义（org_unit_code + org_level_1..10_code）。

用户确认字段清理：
- org_unit_id → org_unit_code（末级组织用编码表达，id 不变）
- 补齐 org_level_5_code ~ org_level_10_code（0311 只建了 1-4）
- 删除 org_node_code（被 org_unit_code / org_level_N_code 取代）
- 旧 org_level_N_id / org_level_N_name 保留不动（展示/分析用途）

范围：标准字段目录（standard_fields）+ 表单绑定（form_field_bindings）。
不动物理表列（同步/权限 scope_role 是另一层），不动 org_level_N_id/name。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0312_unify_org_field_codes"
down_revision = "0311_field_group_authority_source"
branch_labels = None
depends_on = None

ORG_GROUP_NAME = "组织信息"

# (field_code, display_name, display_order)
NEW_LEVEL_CODES = [
    ("org_level_5_code", "五级组织编码", 24),
    ("org_level_6_code", "六级组织编码", 25),
    ("org_level_7_code", "七级组织编码", 26),
    ("org_level_8_code", "八级组织编码", 27),
    ("org_level_9_code", "九级组织编码", 28),
    ("org_level_10_code", "十级组织编码", 29),
]

REMOVE_FIELD = "org_node_code"

RENAME_FIELD = ("org_unit_id", "org_unit_code", "组织单元编码")


def _group_id(conn) -> int:
    row = conn.execute(
        sa.text("SELECT id FROM field_groups WHERE name = :n"), {"n": ORG_GROUP_NAME}
    ).fetchone()
    if row is None:
        raise RuntimeError(f"字段分组 {ORG_GROUP_NAME} 不存在，先应用 0311")
    return row[0]


def upgrade() -> None:
    conn = op.get_bind()
    gid = _group_id(conn)

    # 1. org_unit_id → org_unit_code（幂等：仅当存在 org_unit_id 且无 org_unit_code 时改名）
    unit_id_row = conn.execute(
        sa.text("SELECT id FROM standard_fields WHERE field_code = 'org_unit_id'")
    ).fetchone()
    unit_code_row = conn.execute(
        sa.text("SELECT id FROM standard_fields WHERE field_code = 'org_unit_code'")
    ).fetchone()
    if unit_id_row is not None and unit_code_row is None:
        conn.execute(
            sa.text("UPDATE standard_fields SET field_code = 'org_unit_code', display_name = :n "
                    "WHERE id = :id"),
            {"n": "组织单元编码", "id": unit_id_row[0]},
        )

    # 2. 补齐 org_level_5..10_code（幂等：已存在不建）
    existing_codes = {row[0] for row in conn.execute(
        sa.text("SELECT field_code FROM standard_fields WHERE group_id = :gid"), {"gid": gid}
    ).fetchall()}
    for code, name, order in NEW_LEVEL_CODES:
        if code in existing_codes:
            continue
        conn.execute(
            sa.text("INSERT INTO standard_fields (field_code, display_name, data_type, display_order, "
                    "business_definition, entity_id, group_id, is_active, created_by) "
                    "VALUES (:c, :n, 'string', :o, :d, NULL, :gid, true, 1)"),
            {"c": code, "n": name, "o": order, "d": f"{name}（由组织树投影回填）", "gid": gid},
        )

    # 3. 删除 org_node_code：先删表单绑定（RESTRICT 外键），再删字段行
    node_row = conn.execute(
        sa.text("SELECT id FROM standard_fields WHERE field_code = :c"), {"c": REMOVE_FIELD}
    ).fetchone()
    if node_row is not None:
        node_id = node_row[0]
        conn.execute(
            sa.text("DELETE FROM form_field_bindings WHERE standard_field_id = :fid"),
            {"fid": node_id},
        )
        conn.execute(
            sa.text("DELETE FROM standard_fields WHERE id = :fid"), {"fid": node_id}
        )

    # 4. 薪资结果页绑定：org_node_code 删除后，末级组织编码绑定切到 org_unit_code
    unit_code_row = conn.execute(
        sa.text("SELECT id FROM standard_fields WHERE field_code = 'org_unit_code'")
    ).fetchone()
    if unit_code_row is not None:
        bound = {row[0] for row in conn.execute(
            sa.text("SELECT standard_field_id FROM form_field_bindings WHERE form_key = 'payroll_result'")
        ).fetchall()}
        if unit_code_row[0] not in bound:
            order_row = conn.execute(
                sa.text("SELECT display_order FROM form_field_bindings WHERE form_key = 'payroll_result' "
                        "AND standard_field_id = (SELECT id FROM standard_fields WHERE field_code = 'org_level_1_code')")
            ).fetchone()
            conn.execute(
                sa.text("INSERT INTO form_field_bindings (form_key, standard_field_id, display_order) "
                        "VALUES ('payroll_result', :fid, :order)"),
                {"fid": unit_code_row[0], "order": order_row[0] if order_row else 40},
            )


def downgrade() -> None:
    raise RuntimeError("组织字段编码统一为治理语义，不可自动降级")
