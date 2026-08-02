"""Repair partially applied resource-template source columns."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0167_repair_resource_template_source_schema"
down_revision = "0166_resource_template_runtime_binding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("ALTER TABLE ucp_resource ADD COLUMN IF NOT EXISTS source_template_id BIGINT"))
    bind.execute(sa.text("ALTER TABLE ucp_resource ADD COLUMN IF NOT EXISTS source_template_code VARCHAR(64)"))
    bind.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'fk_ucp_resource_source_template'
                  AND conrelid = 'ucp_resource'::regclass
            ) THEN
                ALTER TABLE ucp_resource
                ADD CONSTRAINT fk_ucp_resource_source_template
                FOREIGN KEY (source_template_id)
                REFERENCES ucp_connector_package(id)
                ON DELETE SET NULL;
            END IF;
        END $$
    """))
    bind.execute(sa.text("DROP INDEX IF EXISTS ix_ucp_resource_source_template"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ucp_resource_source_template ON ucp_resource (system_id, source_template_id)"))
    bind.execute(sa.text("""
        UPDATE ucp_resource AS resource
        SET source_template_id = package.id
        FROM ucp_connector_package AS package
        WHERE resource.source_template_id IS NULL
          AND resource.source_template_code = package.package_code
    """))


def downgrade() -> None:
    op.drop_index("ix_ucp_resource_source_template", table_name="ucp_resource")
    op.drop_constraint("fk_ucp_resource_source_template", "ucp_resource", type_="foreignkey")
    op.drop_column("ucp_resource", "source_template_id")