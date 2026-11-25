"""Store private performance report notes with optimistic versions."""
from alembic import op
import sqlalchemy as sa

revision = "0325_performance_report_notes"
down_revision = "0324_feishu_user_document_grants"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_report_notes",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(), primary_key=True),
        sa.Column("owner_type", sa.String(32), nullable=False),
        sa.Column("owner_ref", sa.String(64), nullable=False),
        sa.Column("cycle_id", sa.BigInteger(), sa.ForeignKey("performance_cycles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_key", sa.String(32), nullable=False),
        sa.Column("project_scope", sa.BigInteger(), nullable=False),
        sa.Column("section", sa.String(32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("owner_type", "owner_ref", "cycle_id", "entry_key", "project_scope", "section", name="uq_performance_report_note_scope"),
        sa.CheckConstraint("version >= 1", name="ck_performance_report_note_version"),
        sa.CheckConstraint("length(content) <= 2000", name="ck_performance_report_note_content"),
    )


def downgrade():
    op.drop_table("performance_report_notes")
