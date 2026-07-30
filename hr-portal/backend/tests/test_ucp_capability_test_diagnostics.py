from types import SimpleNamespace

from app.ucp.routers.capabilities import _business_test_message


def test_business_test_message_includes_safe_http_diagnostic():
    operation = SimpleNamespace(error_rules=[])
    result = SimpleNamespace(
        status_code=None,
        error_code="HTTP_400",
        error_message="read request failed (HTTP 400; code=99991672; msg=permission denied; log_id=02123456789)",
    )

    message = _business_test_message(operation, result, success=False)

    assert message == "动作测试失败，请检查参数和系统凭证（read request failed (HTTP 400; code=99991672; msg=permission denied; log_id=02123456789)）"


def test_business_test_message_keeps_non_http_failures_generic():
    operation = SimpleNamespace(error_rules=[])
    result = SimpleNamespace(
        status_code=None,
        error_code="GENERIC_HTTP_POLICY",
        error_message="response must use a JSON content type",
    )

    message = _business_test_message(operation, result, success=False)

    assert message == "动作测试失败，请检查参数和系统凭证"
