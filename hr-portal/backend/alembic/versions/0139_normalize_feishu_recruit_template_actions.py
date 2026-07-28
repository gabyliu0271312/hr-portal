"""normalize Feishu Recruiting preset actions as template-backed drafts"""

import sqlalchemy as sa
from alembic import op


revision = "0139"
down_revision = "0138"
branch_labels = None
depends_on = None


_ACTIONS = [
    ("OFFER", "QUERY_BY_CANDIDATE_ID", "FEISHU_RECRUIT_OFFER_QUERY_BY_CANDIDATE_ID", "/open-apis/hire/v1/applications/{{application_id}}/offer"),
    ("CANDIDATE", "QUERY_LIST", "FEISHU_RECRUIT_CANDIDATE_QUERY_LIST", "/open-apis/hire/v1/candidates"),
    ("CANDIDATE", "QUERY_DETAIL", "FEISHU_RECRUIT_CANDIDATE_QUERY_DETAIL", "/open-apis/hire/v1/candidates/{{candidate_id}}"),
    ("JOB", "QUERY_LIST", "FEISHU_RECRUIT_JOB_QUERY_LIST", "/open-apis/hire/v1/jobs"),
    ("JOB", "QUERY_DETAIL", "FEISHU_RECRUIT_JOB_QUERY_DETAIL", "/open-apis/hire/v1/jobs/{{job_id}}"),
]


def upgrade() -> None:
    bind = op.get_bind()
    package_id = bind.execute(sa.text("SELECT id FROM ucp_connector_package WHERE package_code = 'FEISHU_RECRUIT'" )).scalar_one_or_none()
    if not package_id:
        return
    for object_code, operation_code, template_code, path in _ACTIONS:
        operation_id = bind.execute(sa.text(
            "SELECT id FROM ucp_operation_definition WHERE package_id = :package_id AND object_code = :object_code AND operation_code = :operation_code"
        ), {"package_id": package_id, "object_code": object_code, "operation_code": operation_code}).scalar_one_or_none()
        if not operation_id:
            continue
        bind.execute(sa.text(
            "INSERT INTO ucp_api_template (template_code, template_name, category, method, base_url, path, headers_config, query_config, auth_type, data_path, pagination_type, version, is_published, is_active, allowed_domains, tags, package_id, operation_definition_id, allowed_domains_snapshot, auth_policy_snapshot) "
            "SELECT CAST(:template_code AS varchar), operation_name, 'PACKAGE_PRESET', 'GET', 'https://open.feishu.cn', CAST(:path AS varchar), CAST('[]' AS json), CAST('[]' AS json), 'FEISHU_TENANT_APP', '$.data', 'NONE', '1.0.0', 0, 1, CAST('[\"open.feishu.cn\"]' AS json), CAST('[\"package-preset\"]' AS json), :package_id, id, CAST('[\"open.feishu.cn\"]' AS json), CAST('{\"auth_type\":\"FEISHU_TENANT_APP\"}' AS json) "
            "FROM ucp_operation_definition WHERE id = :operation_id AND NOT EXISTS (SELECT 1 FROM ucp_api_template WHERE template_code = CAST(:template_code AS varchar))"
        ), {"template_code": template_code, "path": path, "package_id": package_id, "operation_id": operation_id})
        template_id = bind.execute(sa.text("SELECT id FROM ucp_api_template WHERE template_code = :template_code"), {"template_code": template_code}).scalar_one()
        bind.execute(sa.text(
            "UPDATE ucp_operation_definition SET adapter_code = 'GENERIC_HTTP_ACTION_ADAPTER', executor_template_id = :template_id, status = CASE WHEN status = 'PUBLISHED' THEN status ELSE 'DRAFT' END, approval_status = CASE WHEN status = 'PUBLISHED' THEN approval_status ELSE 'DRAFT' END WHERE id = :operation_id"
        ), {"template_id": template_id, "operation_id": operation_id})


def downgrade() -> None:
    return None
