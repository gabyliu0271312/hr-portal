"""硬删除 org_level_1..10_id 标准字段（初始化期，用户明确授权）。

背景：
- org_level_N_id 与 org_level_N_code 重复，0313 已软删（is_active=false）。
- 用户确认系统初始化阶段、无任何引用，要求硬删除。
- 硬删需同时清理 standard_field_versions 历史行（0276 起只读证据，
  触发器 protect_retired_field_history 禁止写历史表）——本迁移按用户
  显式授权临时禁用触发器，删除这 10 个字段的历史行与字段行，再恢复触发器。

仅针对 org_level_1..10_id，不动其他字段/历史证据。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0314_hard_drop_org_level_ids"
down_revision = "0313_drop_org_level_ids"
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

HISTORY_TRIGGERS = [
    ("standard_field_versions", "protect_retired_field_history"),
    ("standard_field_version_categories", "protect_retired_field_history"),
]


def upgrade() -> None:
    conn = op.get_bind()

    # 1. 临时禁用历史保护触发器
    for table, trigger in HISTORY_TRIGGERS:
        conn.execute(sa.text(f"ALTER TABLE {table} DISABLE TRIGGER {trigger}"))

    try:
        # 2. 删除历史版本行 + 字段行
        for code in DROP_FIELDS:
            row = conn.execute(
                sa.text("SELECT id FROM standard_fields WHERE field_code = :c"), {"c": code}
            ).fetchone()
            if row is None:
                continue
            fid = row[0]
            # 表单绑定（防御：已确认无引用）
            conn.execute(
                sa.text("DELETE FROM form_field_bindings WHERE standard_field_id = :fid"),
                {"fid": fid},
            )
            # 历史版本行（含版本分类表关联，防御：现状无关联）
            conn.execute(
                sa.text("DELETE FROM standard_field_version_categories "
                        "WHERE standard_field_version_id IN "
                        "(SELECT id FROM standard_field_versions WHERE standard_field_id = :fid)"),
                {"fid": fid},
            )
            conn.execute(
                sa.text("DELETE FROM standard_field_versions WHERE standard_field_id = :fid"),
                {"fid": fid},
            )
            conn.execute(
                sa.text("DELETE FROM standard_fields WHERE id = :fid"), {"fid": fid}
            )
    finally:
        # 3. 恢复历史保护触发器（无论成功失败都恢复）
        for table, trigger in HISTORY_TRIGGERS:
            conn.execute(sa.text(f"ALTER TABLE {table} ENABLE TRIGGER {trigger}"))


def downgrade() -> None:
    raise RuntimeError("org_level_N_id 硬删除为初始化期清理，不可自动降级")
