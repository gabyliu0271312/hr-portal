"""Persist strict resource-template runtime bindings without legacy projections."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0166_resource_template_runtime_binding"
down_revision = "0165_resource_template_configuration_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        WITH template_schema AS (
            SELECT id,
                   COALESCE(system_schema::jsonb, '{}'::jsonb) AS schema,
                   NULLIF(system_schema::jsonb #>> '{resource_defaults,configuration_profile}', '') AS profile
            FROM ucp_connector_package
            WHERE category = 'INSTANCE_RESOURCE'
        )
        UPDATE ucp_connector_package AS package
        SET system_schema = CAST((
            schema
            || jsonb_build_object('runtime_binding', jsonb_build_object(
                'adapter_code', CASE profile
                    WHEN 'feishu_sheet' THEN 'FEISHU_SHEET_PULL_ADAPTER'
                    WHEN 'feishu_bitable' THEN 'FEISHU_BITABLE_PULL_ADAPTER'
                    WHEN 'beisen_report' THEN 'BEISEN_REPORT_PULL_ADAPTER'
                    ELSE NULL
                END
            ))
            || jsonb_build_object(
                'object_template',
                COALESCE(schema -> 'object_template', '{}'::jsonb)
                || jsonb_build_object('config_schema', CASE profile
                    WHEN 'beisen_report' THEN '[{"key":"report_id","label":"Report ID","required"\:true}]'::jsonb
                    WHEN 'feishu_sheet' THEN '[{"key":"spreadsheet_token","label":"Spreadsheet Token","required"\:true},{"key":"sheet_id","label":"Sheet ID","required"\:true},{"key":"range","label":"Range","required"\:true}]'::jsonb
                    WHEN 'feishu_bitable' THEN '[{"key":"app_token","label":"App Token","required"\:true},{"key":"table_id","label":"Table ID","required"\:true},{"key":"view_id","label":"View ID","required"\:false}]'::jsonb
                    WHEN 'generic_api_object' THEN '[{"key":"path","label":"Object path","required"\:true}]'::jsonb
                    ELSE '[]'::jsonb
                END)
            )
        ) - 'resource_connector_type' AS json)
        FROM template_schema
        WHERE package.id = template_schema.id
          AND profile IS NOT NULL
    """))


def downgrade() -> None:
    pass