"""X0207 OpenAPI import and controlled publication regression tests."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.ucp.api_template_service import ApiTemplateError, create_openapi_drafts, publish_template
from app.ucp.openapi_import_service import OpenApiImportError, preview_openapi


def _document():
    return {
        "openapi": "3.0.3",
        "servers": [{"url": "https://api.example.com/v1"}],
        "paths": {
            "/employees": {"get": {"operationId": "listEmployees", "summary": "员工列表"}},
            "/search": {"post": {"operationId": "searchEmployees", "x-ucp-operation-type": "QUERY"}},
            "/employees/{id}": {"delete": {"operationId": "deleteEmployee"}},
        },
    }


def test_preview_only_exposes_safe_read_operations():
    result = preview_openapi(_document(), allowed_domains=["api.example.com"])

    assert [item["operation_id"] for item in result["operations"]] == ["listEmployees", "searchEmployees"]
    assert result["operations"][1]["tags"] == ["OPENAPI_IMPORT", "QUERY_POST"]
    assert result["rejected"] == [{"path": "/employees/{id}", "method": "DELETE", "reason": "write operations are not supported"}]


def test_preview_rejects_external_refs_and_unknown_authentication():
    external = _document() | {"components": {"schemas": {"Employee": {"$ref": "https://evil.example/schema"}}}}
    with pytest.raises(OpenApiImportError, match="external"):
        preview_openapi(external, allowed_domains=["api.example.com"])

    unknown_auth = _document() | {"security": [{"oauth": []}], "components": {"securitySchemes": {"oauth": {"type": "oauth2"}}}}
    result = preview_openapi(unknown_auth, allowed_domains=["api.example.com"])
    assert result["operations"] == []
    assert len(result["rejected"]) == 3


@pytest.mark.asyncio
async def test_import_creates_only_selected_drafts(monkeypatch):
    candidates = preview_openapi(_document(), allowed_domains=["api.example.com"])["operations"]
    result = MagicMock(); result.scalars.return_value = []
    db = SimpleNamespace(execute=AsyncMock(return_value=result))
    created = []

    async def fake_create(_db, **kwargs):
        created.append(kwargs["template_code"])
        return kwargs

    monkeypatch.setattr("app.ucp.api_template_service.create_template", fake_create)
    drafts = await create_openapi_drafts(db, candidates, ["listEmployees"], "admin")

    assert len(drafts) == 1
    assert created == ["OPENAPI_LISTEMPLOYEES"]
    with pytest.raises(ApiTemplateError, match="至少选择"):
        await create_openapi_drafts(db, candidates, [], "admin")


@pytest.mark.asyncio
async def test_publish_validates_policy_and_creates_a_version(monkeypatch):
    template = MagicMock()
    template.template_code = "SAFE_EMPLOYEES"
    template.template_name = "员工"
    template.method = "GET"
    template.base_url = "https://api.example.com"
    template.path = "/employees"
    template.allowed_domains = ["api.example.com"]
    template.tags = ["OPENAPI_IMPORT"]
    template.description = None
    template.category = "CUSTOM"
    template.system_type = None
    template.content_type = "application/json"
    template.timeout_seconds = 30
    template.headers_config = []
    template.query_config = []
    template.body_template = None
    template.auth_type = None
    template.data_path = None
    template.total_path = None
    template.next_cursor_path = None
    template.pagination_type = "NONE"
    template.page_param = "page"
    template.page_size_param = "page_size"
    template.rate_limit_qps = None
    template.rate_limit_concurrency = None
    template.retry_max = 3
    template.retry_backoff = "exponential"
    template.field_mappings = []
    template.error_code_map = None
    template.sample_response = None
    template.is_active = 1
    template.created_by = "admin"
    template.updated_by = None
    template.created_at = None
    template.updated_at = None
    template.version = "1.0.0"
    template.is_published = 0
    template.id = 1
    result = MagicMock(); result.scalar_one_or_none.return_value = template
    db = SimpleNamespace(execute=AsyncMock(return_value=result), add=MagicMock(), flush=AsyncMock())

    published = await publish_template(db, "SAFE_EMPLOYEES", "admin")

    assert template.is_published == 1
    assert template.version == "1.0.1"
    assert published["is_published"] is True
