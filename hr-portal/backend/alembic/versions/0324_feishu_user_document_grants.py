"""Retain encrypted short-lived Feishu document metadata grants per Portal session."""
from alembic import op
import sqlalchemy as sa

revision = "0324_feishu_user_document_grants"
down_revision = "0323_pm_workbench_announcements"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "feishu_user_grants",
        sa.Column("session_digest", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("open_id", sa.String(64), nullable=False),
        sa.Column("app_id", sa.String(128), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_feishu_user_grants_user_id", "feishu_user_grants", ["user_id"])


def downgrade():
    op.drop_index("ix_feishu_user_grants_user_id", table_name="feishu_user_grants")
    op.drop_table("feishu_user_grants")
