"""Backfill resource-template configuration profiles."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0165_resource_template_configuration_profiles"
down_revision = "0164_resource_template_source_and_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            WITH template_schema AS (
                SELECT
                    id,
                    COALESCE(system_schema::jsonb, '{}'::jsonb) AS schema,
                    COALESCE(
                        NULLIF(system_schema::jsonb #>> '{resource_defaults,configuration_profile}', ''),
                        NULLIF(system_schema::jsonb ->> 'resource_connector_type', ''),
                        CASE UPPER(COALESCE(system_schema::jsonb #>> '{object_template,object_type}', ''))
                            WHEN 'EVENT_TYPE' THEN 'webhook_ingress'
                            WHEN 'REPORT' THEN 'beisen_report'
                            WHEN 'API_OBJECT' THEN 'generic_api_object'
                            ELSE NULL
                        END
                    ) AS configuration_profile
                FROM ucp_connector_package
                WHERE category = 'INSTANCE_RESOURCE'
            )
            UPDATE ucp_connector_package AS package
            SET system_schema = CAST(
                schema
                || jsonb_build_object(
                    'resource_defaults',
                    COALESCE(schema -> 'resource_defaults', '{}'::jsonb)
                    || jsonb_build_object('configuration_profile', configuration_profile)
                )
                || jsonb_build_object(
                    'object_template',
                    COALESCE(schema -> 'object_template', '{}'::jsonb)
                    || jsonb_build_object(
                        'object_type',
                        COALESCE(
                            NULLIF(schema #>> '{object_template,object_type}', ''),
                            CASE configuration_profile
                                WHEN 'webhook_ingress' THEN 'EVENT_TYPE'
                                WHEN 'beisen_report' THEN 'REPORT'
                                WHEN 'feishu_sheet' THEN 'TABLE'
                                WHEN 'feishu_bitable' THEN 'TABLE'
                                WHEN 'generic_api_object' THEN 'API_OBJECT'
                            END
                        )
                    )
                )
                AS json
            )
            FROM template_schema
            WHERE package.id = template_schema.id
              AND configuration_profile IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    pass