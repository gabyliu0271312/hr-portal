"""删除 org_level_1..10_id 标准字段（与 org_level_N_code 重复，保留 name）。

用户确认：
- org_level_N_id 删除（与 code 系列重复）
- org_level_N_name 保留（展示/分析用途）
- org_level_N_code 保留（10 级编码，0311/0312 已建）

现状已核实：10 个 org_level_N_id 无表单绑定、无 standard_field_bindings 引用，
可安全删除（0276 触发器保护 field_code UPDATE/绑定类型，不阻止 DELETE）。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0313_drop_org_level_ids"
down_revision = "0312_unify_org_field_codes"
branch_labels = None
depends_on = None

DROP_FIELDS = [
    "org_level_1_id",
    "org_level_2_id",
    "org_level_3_id",
    "org_level_4_id",
    "org_level_5_id",
    "org_level_6_id",
    "org_level_7_id",
    "org_level_8_id",
    "org_level_9_id",
    "org_level_10_id",
]


def upgrade() -> None:
    conn = op.get_bind()
    for code in DROP_FIELDS:
        row = conn.execute(
            sa.text("SELECT id FROM standard_fields WHERE field_code = :c"), {"c": code}
        ).fetchone()
        if row is None:
            continue
        fid = row[0]
        # 先删表单绑定（防御：现状已确认无引用，保留防御避免 RESTRICT 失败）
        conn.execute(
            sa.text("DELETE FROM form_field_bindings WHERE standard_field_id = :fid"),
            {"fid": fid},
        )
        conn.execute(
            sa.text("DELETE FROM standard_fields WHERE id = :fid"), {"fid": fid}
        )


def downgrade() -> None:
    raise RuntimeError("组织层级 id 字段删除为治理语义，不可自动降级")
