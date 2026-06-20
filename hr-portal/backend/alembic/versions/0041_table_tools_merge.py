"""0041 table_tools 归集模板库:merge_templates / merge_source_mappings / merge_jobs"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0041_table_tools_merge"
down_revision: Union[str, None] = "0040_roster_join_col"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "merge_templates",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("merge_keys", sa.JSON(), nullable=False),
        sa.Column("std_fields", sa.JSON(), nullable=False),
        sa.Column("aggregate", sa.String(length=16), nullable=False, server_default="sum"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("name", name="uq_merge_template_name"),
    )
    op.create_table(
        "merge_source_mappings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("template_id", sa.BigInteger(), sa.ForeignKey("merge_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("match_signature", sa.JSON(), nullable=False),
        sa.Column("sheet_kw", sa.String(length=128), nullable=True),
        sa.Column("header_start", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("header_end", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("key_map", sa.JSON(), nullable=False),
        sa.Column("column_map", sa.JSON(), nullable=False),
        sa.Column("derived_fields", sa.JSON(), nullable=False),
        sa.Column("derive_check", sa.JSON(), nullable=True),
        sa.Column("skip_tokens", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("template_id", "name", name="uq_merge_mapping_name"),
    )
    op.create_table(
        "merge_jobs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("template_id", sa.BigInteger(), nullable=True),
        sa.Column("file_names", sa.JSON(), nullable=False),
        sa.Column("stats", sa.JSON(), nullable=True),
        sa.Column("recognize_log", sa.JSON(), nullable=True),
        sa.Column("anomalies", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("merge_jobs")
    op.drop_table("merge_source_mappings")
    op.drop_table("merge_templates")
