import pytest

from app.ucp.bitable_table_service import BitableTableConfigError, _validate_payload
from app.ucp.feishu_bitable_adapter import _mapped_fields, feishu_bitable_pull_adapter


def test_bitable_payload_requires_reusable_table_identifiers():
    payload = _validate_payload({
        "object_code": "EMPLOYEE_ROSTER",
        "object_name": "员工花名册",
        "app_token": "bas_xxx",
        "table_id": "tbl_xxx",
    })
    assert payload["page_size"] == 100
    assert payload["max_records"] == 10000


def test_bitable_payload_rejects_invalid_object_code():
    with pytest.raises(BitableTableConfigError):
        _validate_payload({"object_code": "employee", "object_name": "x", "app_token": "a", "table_id": "t"})


def test_bitable_field_mapping_renames_only_configured_fields():
    assert _mapped_fields({"姓名": "张三", "工号": "001"}, {"姓名": "employee_name"}) == {
        "employee_name": "张三", "工号": "001"
    }


@pytest.mark.asyncio
async def test_bitable_adapter_rejects_missing_table_configuration():
    result = await feishu_bitable_pull_adapter({}, {}, None)
    assert result.status == "failed"
    assert result.error_code == "BITABLE_CONFIG_INVALID"