"""Publish entity definitions and add controlled record authorization."""
from alembic import op
import sqlalchemy as sa

revision = "0282_master_entity_records"
down_revision = "0281_master_entity_definitions"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("master_entity_definitions", sa.Column("published_at", sa.DateTime(timezone=True)))
    op.add_column("master_entity_definitions", sa.Column("published_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT")))
    op.add_column("master_entity_definitions", sa.Column("published_fields", sa.JSON()))
    op.create_check_constraint("ck_master_entity_publication", "master_entity_definitions",
        "(published_at IS NULL AND published_by IS NULL AND published_fields IS NULL) OR "
        "(published_at IS NOT NULL AND published_by IS NOT NULL AND published_fields IS NOT NULL)")
    op.create_table("master_entity_sources",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("entity_id", sa.BigInteger(), sa.ForeignKey("master_entity_definitions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_system", sa.String(64), nullable=False),
        sa.Column("adapter_code", sa.String(64), nullable=False),
        sa.Column("field_ids", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("entity_id", "source_system", name="uq_master_entity_source"))
    op.create_table("master_entity_record_acl",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("entity_id", sa.BigInteger(), sa.ForeignKey("master_entity_definitions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("role_id", sa.BigInteger(), sa.ForeignKey("roles.id", ondelete="CASCADE")),
        sa.CheckConstraint("(user_id IS NULL) <> (role_id IS NULL)", name="ck_master_record_acl_subject"))
    op.create_table("scope_person_references",
        sa.Column("tag_id", sa.BigInteger(), sa.ForeignKey("scope_tags.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("entity_id", sa.BigInteger(), sa.ForeignKey("master_entity_definitions.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("record_id", sa.BigInteger(), primary_key=True),
        sa.CheckConstraint("record_id > 0", name="ck_scope_person_record_id"))


def downgrade():
    raise RuntimeError("Master record identities require a forward migration; automatic downgrade is disabled")
