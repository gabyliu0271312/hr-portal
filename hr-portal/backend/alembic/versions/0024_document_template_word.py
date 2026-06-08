"""0024 document template word files"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0024_document_template_word"
down_revision: Union[str, None] = "0023_document_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("document_templates", sa.Column("template_file_name", sa.String(255), nullable=True))
    op.add_column("document_templates", sa.Column("template_file_content_type", sa.String(128), nullable=True))
    op.add_column("document_templates", sa.Column("template_file_size", sa.BigInteger(), nullable=True))
    op.add_column("document_templates", sa.Column("template_file", sa.LargeBinary(), nullable=True))
    op.add_column(
        "document_templates",
        sa.Column("parsed_variables", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column("document_templates", sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("document_templates", "uploaded_at")
    op.drop_column("document_templates", "parsed_variables")
    op.drop_column("document_templates", "template_file")
    op.drop_column("document_templates", "template_file_size")
    op.drop_column("document_templates", "template_file_content_type")
    op.drop_column("document_templates", "template_file_name")
