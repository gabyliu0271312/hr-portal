"""0025 document generation logs"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0025_document_generation_logs"
down_revision: Union[str, None] = "0024_document_template_word"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_generation_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("business_type", sa.String(64), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("template_code", sa.String(64), nullable=True),
        sa.Column("template_name", sa.String(128), nullable=True),
        sa.Column("subject_name", sa.String(128), nullable=True),
        sa.Column("manually_adjusted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("draft_hash", sa.String(64), nullable=True),
        sa.Column("draft_length", sa.Integer(), nullable=True),
        sa.Column("context", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_document_generation_logs_business_created",
        "document_generation_logs",
        ["business_type", "created_at"],
    )
    op.create_index(
        "ix_document_generation_logs_template_code",
        "document_generation_logs",
        ["template_code"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_generation_logs_template_code", table_name="document_generation_logs")
    op.drop_index("ix_document_generation_logs_business_created", table_name="document_generation_logs")
    op.drop_table("document_generation_logs")
