"""Phase 3-8: 流水线模板 + 版本快照

新增表:
- ucp_pipeline_template: 模板元数据
- ucp_pipeline_template_version: 每次更新的快照

Revision ID: 0067
Revises: 0066
"""
from alembic import op
import sqlalchemy as sa

revision = "0067"
down_revision = "0066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ucp_pipeline_template",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("template_code", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("nodes_json", sa.JSON(), nullable=True),
        sa.Column("edges_json", sa.JSON(), nullable=True),
        sa.Column("version", sa.String(32), nullable=False, server_default="1.0.0"),
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

    op.create_table(
        "ucp_pipeline_template_version",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("nodes_json", sa.JSON(), nullable=True),
        sa.Column("edges_json", sa.JSON(), nullable=True),
        sa.Column("change_note", sa.String(256), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=False, server_default="system"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["ucp_pipeline_template.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("template_id", "version", name="uq_tpl_version"),
    )
    op.create_index(
        "ix_pipeline_template_version_tpl",
        "ucp_pipeline_template_version",
        ["template_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_pipeline_template_version_tpl", table_name="ucp_pipeline_template_version"
    )
    op.drop_table("ucp_pipeline_template_version")
    op.drop_table("ucp_pipeline_template")
