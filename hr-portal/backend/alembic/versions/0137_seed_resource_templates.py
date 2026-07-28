"""seed published resource templates for the Feishu SaaS package"""

import sqlalchemy as sa
from alembic import op


revision = "0137"
down_revision = "0136_remove_legacy_system_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    parent_exists = bind.execute(
        sa.text(
            "SELECT 1 FROM ucp_connector_package "
            "WHERE package_code = 'FEISHU_RECRUIT'"
        )
    ).scalar_one_or_none()
    if not parent_exists:
        return

    templates = [
        ("FEISHU_SHEET_RESOURCE", "飞书在线表格", "feishu_sheet"),
        ("FEISHU_BITABLE_RESOURCE", "飞书多维表格", "feishu_bitable"),
    ]
    templates = [
        ("FEISHU_SHEET_RESOURCE", "\u98de\u4e66\u5728\u7ebf\u8868\u683c", "feishu_sheet"),
        ("FEISHU_BITABLE_RESOURCE", "\u98de\u4e66\u591a\u7ef4\u8868\u683c", "feishu_bitable"),
    ]
    for code, name, connector_type in templates:
        bind.execute(
            sa.text(
                "INSERT INTO ucp_connector_package "
                "(package_code, package_name, category, connection_mode, version, status, "
                "host_allowlist, auth_policy, system_schema, feature_flags, owner) "
                "SELECT CAST(:code AS varchar), CAST(:name AS varchar), 'INSTANCE_RESOURCE', 'INSTANCE_RESOURCE', '1.0.0', "
                "'PUBLISHED', CAST('[]' AS json), CAST('{}' AS json), "
                "CAST(:schema AS json), CAST('{}' AS json), 'system' "
                "WHERE NOT EXISTS (SELECT 1 FROM ucp_connector_package WHERE package_code = CAST(:code AS varchar))"
            ),
            {
                "code": code,
                "name": name,
                "schema": '{"parent_package_code":"FEISHU_RECRUIT","resource_connector_type":"' + connector_type + '"}',
            },
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM ucp_connector_package "
            "WHERE package_code IN ('FEISHU_SHEET_RESOURCE', 'FEISHU_BITABLE_RESOURCE')"
        )
    )
