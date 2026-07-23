from app.ucp.capability_discovery import capability_test_run_summary, operation_summary


class _Operation:
    id = 8
    object_code = "OFFER"
    operation_code = "QUERY_BY_CANDIDATE_ID"
    operation_name = "按应聘者 ID 查询 Offer"
    input_schema = {"required": ["candidate_id"]}
    output_schema = {"properties": {"offer_id": {"type": "string"}}}


class _Capability:
    enabled = True
    credential_id = 3
    connection_status = "PENDING_TEST_PARAMETERS"
    verification_status = "NOT_TESTED"


def test_operation_summary_only_returns_business_fields_and_pending_test_status():
    result = operation_summary(_Operation(), _Capability())

    assert result["operation_name"] == "按应聘者 ID 查询 Offer"
    assert result["test_status"] == "待补充测试参数"
    assert result["input_fields"] == ["candidate_id"]
    assert "adapter_code" not in result
    assert "required_scopes" not in result


def test_capability_test_run_summary_only_exposes_masked_snapshot_fields():
    run = type("TestRun", (), {
        "id": 7,
        "status": "SUCCESS",
        "request_summary": {"application_id": "application-001"},
        "response_summary": {"rows": [{"salary_amount": "[已脱敏]"}]},
        "error_code": None,
        "error_message": "Offer 查询成功",
        "trace_id": "trace-001",
        "created_at": None,
    })()

    result = capability_test_run_summary(run)

    assert result["trace_id"] == "trace-001"
    assert result["response_summary"]["rows"][0]["salary_amount"] == "[已脱敏]"
