"""field_groups 全局分组 + standard_fields.group_id

Revision ID: 0287_field_groups
Revises: 0286_identity_switch_favorites
Create Date: 2026-10-30

全局一套字段业务分组（工作信息/个人信息/银行卡/证件/教育经历/工作经历/
紧急联系人/家庭成员/合同信息/资料附件），与 field_categories（敏感分类）
独立。标准字段通过 group_id 归属分组；既有字段 group_id 为空。
"""
from alembic import op
import sqlalchemy as sa

revision = "0287_field_groups"
down_revision = "0286_identity_switch_favorites"
branch_labels = None
depends_on = None

FIELD_GROUPS = [
    ("工作信息", 1),
    ("个人信息", 2),
    ("银行卡信息", 3),
    ("证件信息", 4),
    ("教育经历", 5),
    ("工作经历", 6),
    ("紧急联系人", 7),
    ("家庭成员", 8),
    ("合同信息", 9),
    ("资料附件", 10),
]


def upgrade() -> None:
    op.create_table(
        "field_groups",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column(
        "standard_fields",
        sa.Column("group_id", sa.BigInteger(), sa.ForeignKey("field_groups.id", ondelete="RESTRICT"), nullable=True),
    )
    op.create_index("ix_standard_fields_group_id", "standard_fields", ["group_id"])

    table = sa.table(
        "field_groups",
        sa.column("name", sa.String(64)),
        sa.column("display_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
    )
    op.bulk_insert(table, [{"name": n, "display_order": o, "is_active": True} for n, o in FIELD_GROUPS])


def downgrade() -> None:
    op.drop_index("ix_standard_fields_group_id", table_name="standard_fields")
    op.drop_column("standard_fields", "group_id")
    op.drop_table("field_groups")
