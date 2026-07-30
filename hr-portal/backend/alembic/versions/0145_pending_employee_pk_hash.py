"""add standard pk_hash to pending employee full target

Revision ID: 0145_pending_employee_pk_hash
Revises: 0144
"""
from __future__ import annotations

import hashlib

from alembic import op
import sqlalchemy as sa


revision = "0145_pending_employee_pk_hash"
down_revision = "0144"
branch_labels = None
depends_on = None


TABLE_NAME = "hr_pending_employee_full"
PK_HASH_INDEX = "uq_hr_pending_employee_full_pk_hash"


def _application_id_hash(application_id: object) -> str:
    material = str(application_id or "")
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if TABLE_NAME not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns(TABLE_NAME)}
    if "pk_hash" not in columns:
        op.add_column(TABLE_NAME, sa.Column("pk_hash", sa.String(length=64), nullable=True))

    rows = bind.execute(
        sa.text(f"SELECT id, application_id FROM {TABLE_NAME} WHERE pk_hash IS NULL OR pk_hash = ''")
    ).mappings()
    for row in rows:
        bind.execute(
            sa.text(f"UPDATE {TABLE_NAME} SET pk_hash = :pk_hash WHERE id = :id"),
            {"id": row["id"], "pk_hash": _application_id_hash(row["application_id"])},
        )

    op.alter_column(TABLE_NAME, "pk_hash", existing_type=sa.String(length=64), nullable=False)
    indexes = {index["name"] for index in inspector.get_indexes(TABLE_NAME)}
    if PK_HASH_INDEX not in indexes:
        op.create_index(PK_HASH_INDEX, TABLE_NAME, ["pk_hash"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if TABLE_NAME not in inspector.get_table_names():
        return
    indexes = {index["name"] for index in inspector.get_indexes(TABLE_NAME)}
    if PK_HASH_INDEX in indexes:
        op.drop_index(PK_HASH_INDEX, table_name=TABLE_NAME)
    columns = {column["name"] for column in inspector.get_columns(TABLE_NAME)}
    if "pk_hash" in columns:
        op.drop_column(TABLE_NAME, "pk_hash")
