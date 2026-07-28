"""backfill legacy systems into the SaaS template hierarchy"""

import sqlalchemy as sa
from alembic import op


revision = "0138"
down_revision = "0137"
branch_labels = None
depends_on = None


def _insert_package(bind, code: str, name: str, category: str, schema: str) -> None:
    bind.execute(
        sa.text(
            "INSERT INTO ucp_connector_package "
            "(package_code, package_name, category, connection_mode, version, status, "
            "host_allowlist, auth_policy, system_schema, feature_flags, owner) "
            "SELECT CAST(:code AS varchar), CAST(:name AS varchar), CAST(:category AS varchar), "
            "CAST(:category AS varchar), '1.0.0', 'PUBLISHED', CAST('[]' AS json), "
            "CAST('{}' AS json), CAST(:schema AS json), CAST('{}' AS json), 'system' "
            "WHERE NOT EXISTS (SELECT 1 FROM ucp_connector_package "
            "WHERE package_code = CAST(:code AS varchar))"
        ),
        {"code": code, "name": name, "category": category, "schema": schema},
    )


def upgrade() -> None:
    bind = op.get_bind()
    _insert_package(
        bind,
        "BEISEN",
        "\u5317\u68ee\u7cfb\u7edf",
        "STANDARD_SAAS",
        '{"base_url":"","fields":[]}',
    )
    _insert_package(
        bind,
        "BEISEN_REPORT_RESOURCE",
        "\u5317\u68ee\u62a5\u8868",
        "INSTANCE_RESOURCE",
        '{"parent_package_code":"BEISEN","resource_connector_type":"beisen_report"}',
    )

    bind.execute(
        sa.text(
            "UPDATE ucp_system SET package_id = "
            "(SELECT id FROM ucp_connector_package WHERE package_code = 'FEISHU_RECRUIT'), "
            "connection_mode = 'STANDARD_SAAS' "
            "WHERE package_id IS NULL AND UPPER(system_code) = 'FEISHU'"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE ucp_system SET package_id = "
            "(SELECT id FROM ucp_connector_package WHERE package_code = 'BEISEN'), "
            "connection_mode = 'STANDARD_SAAS' "
            "WHERE package_id IS NULL AND LOWER(system_code) = 'beisen'"
        )
    )

    bind.execute(
        sa.text(
            "UPDATE ucp_resource SET resource_code = 'FEISHU_BITABLE_RESOURCE', "
            "resource_name = '\u98de\u4e66\u591a\u7ef4\u8868\u683c', connector_type = 'feishu_bitable' "
            "WHERE adapter_code = 'FEISHU_BITABLE_PULL_ADAPTER' "
            "AND NOT EXISTS (SELECT 1 FROM ucp_resource existing "
            "WHERE existing.system_id = ucp_resource.system_id "
            "AND existing.resource_code = 'FEISHU_BITABLE_RESOURCE')"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE ucp_resource SET resource_code = 'BEISEN_REPORT_RESOURCE', "
            "resource_name = '\u5317\u68ee\u62a5\u8868', connector_type = 'beisen_report' "
            "WHERE adapter_code IN ('BEISEN_REPORT_ADAPTER', 'BEISEN_REPORT_PULL_ADAPTER') "
            "AND NOT EXISTS (SELECT 1 FROM ucp_resource existing "
            "WHERE existing.system_id = ucp_resource.system_id "
            "AND existing.resource_code = 'BEISEN_REPORT_RESOURCE')"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("UPDATE ucp_system SET package_id = NULL, connection_mode = NULL WHERE system_code IN ('FEISHU', 'beisen')"))
    op.execute(sa.text("DELETE FROM ucp_connector_package WHERE package_code IN ('BEISEN_REPORT_RESOURCE', 'BEISEN')"))
