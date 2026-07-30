from app.ucp.capability_discovery import capability_test_run_summary, operation_summary
from app.ucp.routers.capabilities import route_verified_capability_catalog


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


async def test_capability_catalog_only_includes_unverified_rows_when_requested():
    verified = type("Capability", (), {"id": 1, "verification_status": "VERIFIED"})()
    pending = type("Capability", (), {"id": 2, "verification_status": "NOT_TESTED"})()
    operation = type("Operation", (), {"id": 3, "object_code": "OFFER", "operation_name": "查询 Offer", "version": "1.0.0", "source_type": "PACKAGE", "risk_level": "LOW", "output_schema": {}})()
    system = type("System", (), {"id": 4, "system_name": "招聘系统"})()

    class Result:
        def __init__(self, rows): self.rows = rows
        def all(self): return self.rows

    class Db:
        def __init__(self): self.statements = []
        async def execute(self, statement):
            self.statements.append(statement)
            has_verification_filter = any("verification_status" in str(criterion) for criterion in statement._where_criteria)
            rows = [(verified, operation, system)] if has_verification_filter else [(verified, operation, system), (pending, operation, system)]
            return Result(rows)

    db = Db()
    default_catalog = await route_verified_capability_catalog(False, db)
    editable_catalog = await route_verified_capability_catalog(True, db)

    assert [item["capability_id"] for item in default_catalog["items"]] == [1]
    assert [item["capability_id"] for item in editable_catalog["items"]] == [1, 2]
    assert editable_catalog["items"][1]["verification_status"] == "NOT_TESTED"
    assert "ucp_operation_definition.status" in str(db.statements[0]).partition("WHERE")[2]
    assert "ucp_operation_definition.status" not in str(db.statements[1]).partition("WHERE")[2]
