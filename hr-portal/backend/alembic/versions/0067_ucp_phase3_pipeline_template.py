"""0067 UCP Phase 3-8: pipeline templates.

Idempotent for legacy/prod schemas.
"""
from alembic import op
import sqlalchemy as sa

revision = "0067"
down_revision = "0066"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(c["name"] == column_name for c in _inspector().get_columns(table_name))


def _index_exists(table_name: str, index_name: str) -> bool:
    # PostgreSQL indexes are relations in the schema namespace.  In drifted
    # production DBs an index name can already exist even when SQLAlchemy
    # inspector does not report it for the expected table, so check pg_class
    # globally to avoid DuplicateTableError on CREATE INDEX.
    result = op.get_bind().execute(
        sa.text(
            """
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = :name
              AND n.nspname = current_schema()
              AND c.relkind IN ('i', 'I')
            LIMIT 1
            """
        ),
        {"name": index_name},
    ).scalar()
    return result is not None


def _fk_exists(table_name: str, fk_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(fk.get("name") == fk_name for fk in _inspector().get_foreign_keys(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], **kwargs) -> None:
    if _table_exists(table_name) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, **kwargs)


def upgrade() -> None:
    if not _table_exists("ucp_pipeline_template"):
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
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if not _table_exists("ucp_pipeline_template_version"):
        op.create_table(
            "ucp_pipeline_template_version",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("template_id", sa.Integer(), nullable=False),
            sa.Column("version", sa.String(32), nullable=False),
            sa.Column("nodes_json", sa.JSON(), nullable=True),
            sa.Column("edges_json", sa.JSON(), nullable=True),
            sa.Column("change_note", sa.String(256), nullable=True),
            sa.Column("created_by", sa.String(64), nullable=False, server_default="system"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["template_id"], ["ucp_pipeline_template.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("template_id", "version", name="uq_tpl_version"),
        )
    _create_index_if_missing("ix_pipeline_template_version_tpl", "ucp_pipeline_template_version", ["template_id"])


def downgrade() -> None:
    if _table_exists("ucp_pipeline_template_version"):
        op.drop_table("ucp_pipeline_template_version")
    if _table_exists("ucp_pipeline_template"):
        op.drop_table("ucp_pipeline_template")
