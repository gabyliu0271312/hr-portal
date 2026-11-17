"""停用 org_level_1..10_id 标准字段（与 org_level_N_code 重复，保留 name）。

用户确认：
- org_level_N_id 停用（与 code 系列重复）
- org_level_N_name 保留（展示/分析用途）
- org_level_N_code 保留（10 级编码）

处理方式：UPDATE is_active=false（软删/停用），不物理 DELETE——
standard_field_versions 历史证据外键引用 standard_fields.id（0276 起只读保全），
物理删除违反 FK 且破坏历史证据。停用后前端按 is_active 过滤不再展示。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0313_drop_org_level_ids"
down_revision = "0312_unify_org_field_codes"
branch_labels = None
depends_on = None

DEACTIVATE_FIELDS = [
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
    for code in DEACTIVATE_FIELDS:
        conn.execute(
            sa.text("UPDATE standard_fields SET is_active = false WHERE field_code = :c"),
            {"c": code},
        )


def downgrade() -> None:
    raise RuntimeError("组织层级 id 字段停用为治理语义，不可自动降级")
