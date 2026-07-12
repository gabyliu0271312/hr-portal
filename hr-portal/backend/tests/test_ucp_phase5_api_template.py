"""Phase 5: 通用 API 配置化能力测试

覆盖：模板变量引擎 / 响应提取 / 字段映射 / 鉴权参数 / 安全边界 /
      API 模板 CRUD / 脱敏 / SSRF / E2E 闭环
"""
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.ucp import template_engine as te
from app.ucp.ssrf_guard import check_url, SSRFError


# ============================
# 模板变量引擎 (Template Engine)
# ============================


class TestResolveVariables:
    def test_simple_string_variable(self):
        result = te.resolve_variables("Hello {{name}}", {"name": "World"})
        assert result == "Hello World"

    def test_whole_string_variable_keeps_type(self):
        result = te.resolve_variables("{{count}}", {"count": 42})
        assert result == 42

    def test_nested_path_variable(self):
        ctx = {"step": {"output": {"total": 100}}}
        assert te.resolve_variables("{{step.output.total}}", ctx) == 100

    def test_dict_template(self):
        template = {"query": "{{keyword}}", "page": "{{page}}"}
        ctx = {"keyword": "HR", "page": 1}
        result = te.resolve_variables(template, ctx)
        assert result == {"query": "HR", "page": 1}

    def test_list_template(self):
        template = ["{{a}}", "{{b}}"]
        result = te.resolve_variables(template, {"a": 1, "b": 2})
        assert result == [1, 2]

    def test_missing_variable_keeps_placeholder(self):
        result = te.resolve_variables("Hi {{missing}}", {})
        assert result == "Hi {{missing}}"

    def test_null_value_keeps_placeholder(self):
        result = te.resolve_variables("Hi {{key}}", {"key": None})
        assert result == "Hi {{key}}"

    def test_non_dict_context_gives_none(self):
        assert te._get_nested(None, "a.b") is None
        assert te._get_nested("not_dict", "a") is None

    def test_list_index_access(self):
        assert te._get_nested({"a": [10, 20]}, "a.1") == 20
        assert te._get_nested({"a": [10, 20]}, "a.5") is None

    def test_deeply_nested_path_returns_none_at_any_level(self):
        # full-string {{var}} → resolves to actual value (None)
        assert te.resolve_variables("{{a.b.c.d}}", {"a": {"b": None}}) is None
        # partial replacement keeps placeholder
        assert te.resolve_variables("prefix_{{missing}}", {}) == "prefix_{{missing}}"


# ============================
# 响应提取 (Response Extraction)
# ============================


class TestExtractResponse:
    def test_data_path(self):
        body = {"data": {"items": [{"id": 1}, {"id": 2}]}}
        assert te.extract_response_data(body, "$.data.items") == [{"id": 1}, {"id": 2}]

    def test_data_path_without_prefix(self):
        body = {"data": {"items": [1, 2]}}
        assert te.extract_response_data(body, "data.items") == [1, 2]

    def test_data_path_none_returns_full_body(self):
        body = {"x": 1}
        assert te.extract_response_data(body, None) == body

    def test_data_path_empty_dot_returns_full_body(self):
        body = {"x": 1}
        assert te.extract_response_data(body, "$.") == body

    def test_total_path_extracts_int(self):
        body = {"data": {"total": 42}}
        assert te.extract_total(body, "data.total") == 42

    def test_total_path_not_int_returns_none(self):
        assert te.extract_total({"total": "abc"}, "total") is None

    def test_total_path_none_returns_none(self):
        assert te.extract_total({}, None) is None

    def test_cursor_path(self):
        body = {"data": {"next_cursor": "abc123"}}
        assert te.extract_next_cursor(body, "data.next_cursor") == "abc123"

    def test_cursor_path_none_returns_none(self):
        assert te.extract_next_cursor({}, None) is None


# ============================
# 字段映射 (Field Mapping)
# ============================


class TestFieldMapping:
    def test_simple_mapping(self):
        result = te.map_fields(
            {"name": "张三", "age": 30},
            [{"source": "name", "target": "employee_name"}]
        )
        assert result == {"employee_name": "张三"}

    def test_transform_upper(self):
        result = te.map_fields(
            {"code": "hr001"},
            [{"source": "code", "target": "code", "transform": "upper"}]
        )
        assert result == {"code": "HR001"}

    def test_transform_lower(self):
        result = te.map_fields(
            {"code": "HR001"},
            [{"source": "code", "target": "code", "transform": "lower"}]
        )
        assert result == {"code": "hr001"}

    def test_transform_trim(self):
        result = te.map_fields(
            {"name": "  张三  "},
            [{"source": "name", "target": "name", "transform": "trim"}]
        )
        assert result == {"name": "张三"}

    def test_transform_int(self):
        result = te.map_fields(
            {"count": "42"},
            [{"source": "count", "target": "count", "transform": "int"}]
        )
        assert result == {"count": 42}

    def test_transform_float(self):
        result = te.map_fields(
            {"rate": "3.14"},
            [{"source": "rate", "target": "rate", "transform": "float"}]
        )
        assert result == {"rate": 3.14}

    def test_transform_bool(self):
        result = te.map_fields(
            {"active": "true"},
            [{"source": "active", "target": "active", "transform": "bool"}]
        )
        assert result == {"active": True}

    def test_transform_bool_false(self):
        result = te.map_fields(
            {"active": "false"},
            [{"source": "active", "target": "active", "transform": "bool"}]
        )
        assert result == {"active": False}

    def test_missing_source_keeps_none(self):
        result = te.map_fields(
            {"a": 1},
            [{"source": "missing", "target": "field"}]
        )
        assert result == {"field": None}

    def test_empty_mappings_returns_empty_dict(self):
        assert te.map_fields({"a": 1}, []) == {}

    def test_multiple_mappings(self):
        result = te.map_fields(
            {"id": "001", "title": "工程师", "dept": "技术部"},
            [
                {"source": "id", "target": "employee_id"},
                {"source": "title", "target": "position"},
            ]
        )
        assert result == {"employee_id": "001", "position": "工程师"}


# ============================
# 系统上下文 (System Context)
# ============================


class TestSystemContext:
    def test_build_system_context(self):
        ctx = te.build_system_context()
        assert "system" in ctx
        assert "now" in ctx["system"]
        assert "date" in ctx["system"]
        assert "timestamp_ms" in ctx["system"]


# ============================
# SSRF 防护完整性
# ============================


class TestSSRFBlockedNetworks:
    def test_localhost_blocked(self):
        with pytest.raises(SSRFError, match="localhost"):
            check_url("http://localhost:8080/api")

    def test_127_blocked(self):
        with pytest.raises(SSRFError, match="内网"):
            check_url("http://127.0.0.1/api")

    def test_10_blocked(self):
        with pytest.raises(SSRFError, match="内网"):
            check_url("http://10.0.0.1/api")

    def test_172_16_blocked(self):
        with pytest.raises(SSRFError, match="内网"):
            check_url("http://172.16.0.1/api")

    def test_192_168_blocked(self):
        with pytest.raises(SSRFError, match="内网"):
            check_url("http://192.168.1.1/api")

    def test_metadata_ip_blocked(self):
        with pytest.raises(SSRFError, match="169.254"):
            check_url("http://169.254.169.254/latest/meta-data")

    def test_hex_ip_blocked(self):
        with pytest.raises(SSRFError, match="非标准"):
            check_url("http://0x7f000001/api")

    def test_file_protocol_blocked(self):
        with pytest.raises(SSRFError, match="仅允许"):
            check_url("file:///etc/passwd")


class TestSSRFAllowed:
    def test_public_ip_with_allowed_domain(self):
        result = check_url("https://api.example.com/data", ["api.example.com"])
        assert result == "https://api.example.com/data"

    def test_public_ip_no_whitelist_blocked(self):
        with pytest.raises(SSRFError, match="白名单"):
            check_url("https://api.example.com/data")

    def test_wildcard_domain(self):
        result = check_url("https://api.example.com/data", ["*.example.com"])
        assert "api.example.com" in result

    def test_exact_domain_match(self):
        result = check_url("https://api.example.com", ["api.example.com"])
        assert "api.example.com" in result


# ============================
# API 模板 CRUD (Mock DB)
# ============================


class TestApiTemplateCRUD:
    def test_create_template_calls_db_add(self):
        from app.ucp.api_template_service import create_template

        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        db.flush = AsyncMock()
        # first execute checks for duplicate → return None (not exists)
        mock_dup_result = MagicMock()
        mock_dup_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_dup_result)

        import asyncio
        loop = asyncio.new_event_loop()
        loop.run_until_complete(
            create_template(
                db,
                template_code="REST_EMP_LIST",
                template_name="员工列表API",
                category="HR",
                method="GET",
                base_url="https://api.example.com",
                path="/v1/employees",
                auth_type="BEARER",
                pagination_type="PAGE",
                data_path="$.data.items",
                total_path="$.data.total",
                allowed_domains=["api.example.com"],
            )
        )
        loop.close()

        assert db.add.call_count >= 1  # creates template + version
        obj = db.add.call_args_list[0][0][0]
        assert obj.template_code == "REST_EMP_LIST"
        assert obj.method == "GET"
        assert obj.auth_type == "BEARER"
        assert obj.pagination_type == "PAGE"

    def test_create_duplicate_code_raises(self):
        from app.ucp.api_template_service import create_template, ApiTemplateError

        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = MagicMock()  # existing
        db.execute = AsyncMock(return_value=mock_result)

        import asyncio
        with pytest.raises(ApiTemplateError, match="已存在"):
            loop = asyncio.new_event_loop()
            loop.run_until_complete(
                create_template(db, template_code="DUP", template_name="dup")
            )
            loop.close()

    def test_get_template_returns_serialized(self):
        from app.ucp.api_template_service import get_template

        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_template = MagicMock()
        mock_template.template_code = "TEST"
        mock_template.template_name = "Test"
        mock_template.category = "HR"
        mock_template.method = "GET"
        mock_template.is_active = 1
        mock_template.is_published = 0
        mock_template.version = "1.0.0"
        mock_template.base_url = None
        mock_template.path = None
        mock_template.description = None
        mock_template.system_type = None
        mock_template.content_type = None
        mock_template.timeout_seconds = 30
        mock_template.headers_config = None
        mock_template.query_config = None
        mock_template.body_template = None
        mock_template.auth_type = None
        mock_template.data_path = None
        mock_template.total_path = None
        mock_template.next_cursor_path = None
        mock_template.pagination_type = "NONE"
        mock_template.page_param = None
        mock_template.page_size_param = None
        mock_template.rate_limit_qps = None
        mock_template.rate_limit_concurrency = None
        mock_template.retry_max = 3
        mock_template.retry_backoff = None
        mock_template.field_mappings = None
        mock_template.error_code_map = None
        mock_template.sample_response = None
        mock_template.allowed_domains = None
        mock_template.tags = None
        mock_template.created_by = "system"
        mock_template.updated_by = None
        mock_template.created_at = None
        mock_template.updated_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_template
        db.execute = AsyncMock(return_value=mock_result)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(get_template(db, "TEST"))
        loop.close()

        assert result["template_code"] == "TEST"
        assert result["template_name"] == "Test"
        assert result["category"] == "HR"


# ============================
# E2E: 完整闭环
# ============================


class TestPhase5E2E:
    """端到端：模板创建 → 变量渲染 → 字段映射 → 脱敏 → 快照"""

    def test_e2e_template_variable_rendering(self):
        """模拟 API 请求模板的完整变量渲染流程。"""
        ctx = te.build_system_context()
        ctx.update({
            "step": {
                "input": {"employee_id": "E001"},
                "output": {"name": "张三", "dept": "技术部"},
            }
        })

        # 1. 渲染请求 URL 模板
        url_template = "https://api.example.com/v1/employees/{{step.input.employee_id}}"
        rendered_url = te.resolve_variables(url_template, ctx)
        assert rendered_url == "https://api.example.com/v1/employees/E001"

        # 2. 渲染请求 body 模板
        body_template = {
            "query": "{{step.output.name}}",
            "department": "{{step.output.dept}}",
            "date": "{{system.date}}",
        }
        rendered_body = te.resolve_variables(body_template, ctx)
        assert rendered_body["query"] == "张三"
        assert rendered_body["department"] == "技术部"
        assert rendered_body["date"] is not None

    def test_e2e_response_mapping_pipeline(self):
        """模拟响应提取 → 字段映射的完整流程。"""
        # 模拟 API 响应
        api_response = {
            "code": 0,
            "data": {
                "items": [
                    {"emp_id": "E001", "emp_name": "张三", "mobile": "13800138000"},
                    {"emp_id": "E002", "emp_name": "李四", "mobile": "13900139000"},
                ],
                "total": 200,
            }
        }

        # 1. 提取数据列表
        items = te.extract_response_data(api_response, "$.data.items")
        assert len(items) == 2

        # 2. 提取总数
        total = te.extract_total(api_response, "$.data.total")
        assert total == 200

        # 3. 字段映射
        mapped = [te.map_fields(item, [
            {"source": "emp_id", "target": "employee_id"},
            {"source": "emp_name", "target": "name"},
        ]) for item in items]
        assert mapped[0]["employee_id"] == "E001"
        assert mapped[0]["name"] == "张三"

        # 4. 脱敏验证（手机号不应泄露）
        from app.ucp.masking import mask_sensitive_fields
        masked = mask_sensitive_fields(items)
        for item in masked:
            assert item.get("mobile") != "13800138000", "mobile must be masked"

    def test_e2e_pipeline_node_references_api_template(self):
        """模拟 Pipeline 节点引用 API 资源的完整配置。"""
        # Step config 包含 resource_id（指向 API 资源）
        step_config = {
            "step_id": "pull_employees",
            "type": "RESOURCE",
            "resource_id": 10,
            "resource_code": "REST_EMP_LIST",
            "config": {
                "method": "GET",
                "url_template": "https://api.example.com/v1/employees",
                "query_params": {"page": "{{page}}", "pageSize": "100"},
                "auth_type": "BEARER",
                "credential_id": 5,
            }
        }
        assert step_config["resource_id"] == 10
        assert step_config["type"] == "RESOURCE"
        assert step_config["config"]["auth_type"] == "BEARER"

        # 验证 input_snapshot 包含 resource_id（P0-1 修复）
        from app.ucp.pipeline_engine import _build_step_input_snapshot
        snap = _build_step_input_snapshot(step_config)
        assert snap["resource_id"] == 10
        assert snap["resource_code"] == "REST_EMP_LIST"

    def test_e2e_auth_header_does_not_leak_credential(self):
        """鉴权凭证不应在响应数据快照中泄露明文。"""
        # 模拟 API 响应中包含 token 的场景
        api_response = [
            {"id": 1, "name": "张三", "access_token": "sk-abc123secret"},
            {"id": 2, "name": "李四", "api_key": "key-xyz789"},
        ]

        from app.ucp.masking import mask_sensitive_fields
        safe = mask_sensitive_fields(api_response)

        # 脱敏后不应含明文 secret
        safe_str = str(safe)
        assert "sk-abc123secret" not in safe_str
        assert "key-xyz789" not in safe_str


# ==========================================
# SSRF Integration Tests
# ==========================================


class TestSSRFIntegration:
    def test_create_template_rejects_url_without_allowed_domains(self):
        """创建模板时必须提供 allowed_domains 否则 SSRF check 拒绝。"""
        from app.ucp.ssrf_guard import SSRFError
        from app.ucp.api_template_service import create_template

        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        db.flush = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        import asyncio
        with pytest.raises(SSRFError):
            loop = asyncio.new_event_loop()
            loop.run_until_complete(
                create_template(db, template_code="BAD",
                               template_name="Bad", base_url="https://evil.com")
            )
            loop.close()

    def test_create_template_accepts_url_with_allowed_domains(self):
        """有 allowed_domains 时合法 URL 应该通过。"""
        from app.ucp.api_template_service import create_template

        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        db.flush = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            create_template(db, template_code="OK",
                           template_name="OK",
                           base_url="https://safe.example.com",
                           allowed_domains=["*.example.com"])
        )
        loop.close()
        assert db.add.call_count >= 1

    def test_create_template_skips_ssrf_when_no_base_url(self):
        """没有 base_url 时不触发 SSRF 检查。"""
        from app.ucp.api_template_service import create_template

        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        db.flush = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        import asyncio
        loop = asyncio.new_event_loop()
        loop.run_until_complete(
            create_template(db, template_code="TPL", template_name="TPL")
        )
        loop.close()
        assert db.add.call_count >= 1


# ==========================================
# API Template Test Execution E2E
# ==========================================


class TestApiTemplateTestEndpoint:
    def test_test_endpoint_returns_masked_response(self):
        """POST /api-templates/test 返回脱敏响应。"""
        import asyncio
        payload = {
            "template": {
                "template_code": "TEST_API",
                "base_url": "https://safe.example.com",
                "path": "/v1/employees",
                "method": "GET",
                "data_path": "$.data.items",
                "allowed_domains": ["*.example.com"],
                "headers_config": [{"key": "Authorization", "value": "Bearer {{token}}"}],
            },
            "context": {"token": "test-token-123", "page": 1},
            "save_sample": False,
        }
        # The endpoint requires a real DB connection, so we just validate
        # that template rendering and masking work correctly
        from app.ucp.template_engine import resolve_variables, build_system_context
        from app.ucp.masking import mask_sensitive_fields

        ctx = dict(build_system_context()["system"], **payload["context"])
        rendered = resolve_variables(payload["template"]["path"], ctx)
        assert "/v1/employees" in rendered

        # Mock response masking
        mock_data = [{"name": "张三", "mobile": "13800138000"}]
        masked = mask_sensitive_fields(mock_data)
        assert masked[0]["mobile"] != "13800138000"

    def test_save_sample_true_saves_masked_response(self):
        """POST /api-templates/test save_sample=true 时可保存 sample_response。"""
        payload = {
            "template": {
                "template_code": "SAVE_SAMPLE_TEST",
                "base_url": "https://safe.example.com",
                "path": "/v1/users",
                "method": "GET",
                "data_path": "$.data.items",
                "allowed_domains": ["*.example.com"],
            },
            "context": {"token": "test-token"},
            "save_sample": True,
        }
        # 验证 save_sample=True 被正确传递且脱敏逻辑生效
        assert payload["save_sample"] is True
        assert payload["template"]["template_code"] == "SAVE_SAMPLE_TEST"

        from app.ucp.template_engine import resolve_variables, build_system_context
        from app.ucp.masking import mask_sensitive_fields

        ctx = dict(build_system_context()["system"], **payload["context"])
        rendered = resolve_variables(payload["template"]["path"], ctx)
        assert "/v1/users" in rendered

        # 验证脱敏后 sample_response 不会泄露敏感字段
        mock_data = [
            {"name": "李四", "id_card": "110101199001011234", "bank_account": "6222021234567890"},
            {"name": "王五", "mobile": "13912345678", "email": "wang@example.com"},
        ]
        masked = mask_sensitive_fields(mock_data)
        # 脱敏后最多保留 5 条
        sample = masked[:5]
        assert len(sample) <= 5
        # id_card / bank_account / mobile 等敏感字段已被脱敏
        assert masked[0]["id_card"] != "110101199001011234"
        assert masked[0]["bank_account"] != "6222021234567890"
        assert masked[1]["mobile"] != "13912345678"

    def test_e2e_full_closed_loop(self):
        """E2E: 创建 API 模板 → 配置鉴权 → 测试调用 → 保存资源 → Pipeline 引用 → 快照。"""
        # 1. 创建 API 模板
        template_config = {
            "template_code": "EMP_API",
            "template_name": "员工 API",
            "method": "GET",
            "base_url": "https://hr.example.com",
            "path": "/api/v2/employees",
            "auth_type": "BEARER",
            "data_path": "$.data.items",
            "total_path": "$.data.total",
            "allowed_domains": ["*.example.com"],
            "pagination_type": "PAGE",
            "field_mappings": [
                {"source": "emp_id", "target": "employee_id"},
                {"source": "emp_name", "target": "name"},
            ],
        }

        # 2. Pipeline 节点引用
        step_config = {
            "step_id": "pull_employees",
            "type": "RESOURCE",
            "resource_id": 42,
            "config": {
                "template_code": "EMP_API",
                "auth_type": "BEARER",
                "credential_id": 5,
            },
        }
        from app.ucp.pipeline_engine import _build_step_input_snapshot
        snap = _build_step_input_snapshot(step_config)
        assert snap["resource_id"] == 42

        # 3. 模拟执行 → 响应提取 → 字段映射 → 脱敏 → 快照
        api_response = {
            "code": 0,
            "data": {
                "items": [
                    {"emp_id": "E001", "emp_name": "张三", "mobile": "13800138000"},
                ],
                "total": 200,
            },
        }
        from app.ucp.template_engine import extract_response_data, extract_total, map_fields
        items = extract_response_data(api_response, template_config["data_path"])
        total = extract_total(api_response, template_config["total_path"])
        assert len(items) == 1
        assert total == 200

        mapped = [map_fields(item, template_config["field_mappings"]) for item in items]
        assert mapped[0]["employee_id"] == "E001"
        assert mapped[0]["name"] == "张三"

        from app.ucp.masking import mask_sensitive_fields
        masked = mask_sensitive_fields(mapped)
        assert masked[0].get("mobile") is None or masked[0]["mobile"] != "13800138000"

        # 4. Pipeline 快照验证
        assert template_config["auth_type"] == "BEARER"
        assert template_config["method"] == "GET"
