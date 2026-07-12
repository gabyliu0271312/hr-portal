"""Phase 3-7: 适配器注册机制

新增表: adapter_definition
- adapter_code: 唯一业务 code (e.g. CUSTOM_DIDI_BILL_PULL)
- adapter_type: HTTP / DB / FILE / EVENT / TRANSFORM / CUSTOM
- schema_json: 字段定义 (简化 JSON Schema)
- sample_payload: 测试样例
- is_active: 是否启用 (默认 False, 需审核)

Revision ID: 0066
Revises: 0065
"""
from alembic import op
import sqlalchemy as sa

revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "adapter_definition",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("adapter_code", sa.String(64), nullable=False, unique=True),
        sa.Column("adapter_type", sa.String(16), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("schema_json", sa.JSON(), nullable=True),
        sa.Column("sample_payload", sa.JSON(), nullable=True),
        sa.Column("version", sa.String(32), nullable=False, server_default="1.0.0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", sa.String(64), nullable=False, server_default="system"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_adapter_definition_type", "adapter_definition", ["adapter_type"])
    op.create_index("ix_adapter_definition_active", "adapter_definition", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_adapter_definition_active", table_name="adapter_definition")
    op.drop_index("ix_adapter_definition_type", table_name="adapter_definition")
    op.drop_table("adapter_definition")
