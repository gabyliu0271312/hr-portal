"""硬删除 org_level_1..10_id 标准字段（初始化期，用户明确授权）。

背景：
- org_level_N_id 与 org_level_N_code 重复，0313 已软删（is_active=false）。
- 用户确认系统初始化阶段、无任何引用，要求硬删除。
- standard_field_versions / standard_field_version_categories 上有多个
  保护触发器（protect_retired_field_history、protect_standard_field_version、
  protect_standard_field_categories），DELETE 会被挡。

本迁移按用户显式授权：动态禁用两张历史表上的全部 protect 触发器，
删除这 10 个字段的历史行与字段行后恢复触发器（无论成功失败都恢复）。

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

HISTORY_TABLES = [
    "standard_field_versions",
    "standard_field_version_categories",
]


def _protect_trigger_names(conn, table: str) -> list[str]:
    # table 来自 HISTORY_TABLES 常量（非用户输入），可安全内插；
    # 不能用绑定参数 + ::regclass（SQLAlchemy/asyncpg 语法冲突）。
    rows = conn.execute(
        sa.text(f"SELECT tgname FROM pg_trigger WHERE tgrelid = '{table}'::regclass AND NOT tgisinternal")
    ).fetchall()
    return [r[0] for r in rows]


def _disable_protect_triggers(conn, table: str) -> list[str]:
    names = _protect_trigger_names(conn, table)
    for name in names:
        conn.execute(sa.text(f"ALTER TABLE {table} DISABLE TRIGGER {name}"))
    return names


def _enable_protect_triggers(conn, table: str, names: list[str]) -> None:
    for name in names:
        conn.execute(sa.text(f"ALTER TABLE {table} ENABLE TRIGGER {name}"))


def upgrade() -> None:
    conn = op.get_bind()

    # 1. 动态禁用两张历史表上的全部保护触发器
    disabled: dict[str, list[str]] = {}
    for table in HISTORY_TABLES:
        disabled[table] = _disable_protect_triggers(conn, table)

    try:
        # 2. 删除历史版本行 + 字段行
        for code in DROP_FIELDS:
            row = conn.execute(
                sa.text("SELECT id FROM standard_fields WHERE field_code = :c"), {"c": code}
            ).fetchone()
            if row is None:
                continue
            fid = row[0]
            conn.execute(
                sa.text("DELETE FROM form_field_bindings WHERE standard_field_id = :fid"),
                {"fid": fid},
            )
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
        for table, names in disabled.items():
            _enable_protect_triggers(conn, table, names)


def downgrade() -> None:
    raise RuntimeError("org_level_N_id 硬删除为初始化期清理，不可自动降级")
