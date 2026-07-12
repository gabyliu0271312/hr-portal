"""test_ucp_credentials_masking — 凭证脱敏与敏感字段检测"""
import pytest

from app.ucp.masking import (
    is_sensitive_field,
    mask_value,
    mask_dict,
    mask_phone,
    mask_name,
    mask_sensitive_fields,
)


class TestSensitiveFieldDetection:
    def test_salary_keywords_are_sensitive(self):
        for field in ("salary", "base_salary", "annual_salary", "compensation",
                       "bonus", "bonus_amount", "offer_salary", "月薪", "年薪"):
            assert is_sensitive_field(field), f"'{field}' should be sensitive"

    def test_phone_fields_are_sensitive(self):
        for field in ("mobile", "phone", "phone_number", "mobile_phone",
                       "cellphone", "telephone", "contact_phone", "手机", "联系电话"):
            assert is_sensitive_field(field)

    def test_id_card_fields_are_sensitive(self):
        for field in ("id_card", "id_number", "identity_card", "身份证"):
            assert is_sensitive_field(field)

    def test_bank_card_fields_are_sensitive(self):
        for field in ("bank_card", "bank_account", "银行卡"):
            assert is_sensitive_field(field)

    def test_token_secret_fields_are_sensitive(self):
        for field in ("token", "api_key", "api_secret", "app_secret",
                       "access_token", "secret", "password", "credential"):
            assert is_sensitive_field(field)

    def test_normal_fields_are_not_sensitive(self):
        for field in ("name", "email", "department", "title", "status", "created_at"):
            assert not is_sensitive_field(field)


class TestMaskValue:
    def test_mask_phone_number_field(self):
        assert mask_value("13812345678", "mobile") == "138****5678"

    def test_short_value_masks_to_stars(self):
        assert mask_value("abc", "mobile") == "****"

    def test_salary_masked_as_redacted(self):
        assert mask_value(50000, "salary") == "[已脱敏]"

    def test_token_secret_masked_as_redacted(self):
        assert mask_value("sk-abc123def456", "token") == "[已脱敏]"

    def test_non_sensitive_value_unchanged(self):
        assert mask_value("张三", "name") == "张三"
        assert mask_value("Engineer", "title") == "Engineer"

    def test_none_unchanged(self):
        assert mask_value(None, "mobile") is None

    def test_empty_string_unchanged(self):
        assert mask_value("", "mobile") == ""


class TestMaskPhone:
    def test_standard_mobile(self):
        assert mask_phone("13812345678") == "138****5678"

    def test_none_returns_none(self):
        assert mask_phone(None) is None

    def test_short_number_masked(self):
        assert mask_phone("123") == "****"


class TestMaskName:
    def test_two_char_name(self):
        assert mask_name("张三") == "张*"

    def test_three_char_name(self):
        assert mask_name("张小明") == "张*明"

    def test_none_returns_none(self):
        assert mask_name(None) is None

    def test_single_char_name(self):
        assert mask_name("张") == "张*"


class TestMaskDict:
    def test_sensitive_fields_masked(self):
        data = {"name": "张三", "mobile": "13812345678", "salary": 50000}
        result = mask_dict(data)
        assert result["name"] == "张三"
        assert result["mobile"] != "13812345678"
        assert result["salary"] != 50000

    def test_nested_dict_not_recursed(self):
        """mask_dict 仅处理顶层字段，不递归嵌套。"""
        data = {"user": {"name": "李四", "mobile": "13900001111"}}
        result = mask_dict(data)
        assert isinstance(result["user"], dict)


class TestMaskSensitiveFields:
    def test_list_of_records_masked(self):
        data = [
            {"name": "张三", "mobile": "13812345678"},
            {"name": "李四", "mobile": "13900001111"},
        ]
        result = mask_sensitive_fields(data, max_rows=10)
        assert result[0]["name"] == "张三"
        assert result[0]["mobile"] != "13812345678"

    def test_max_rows_limits_output(self):
        data = [{"name": f"员工{i}", "mobile": f"1380000{i:04d}"} for i in range(100)]
        result = mask_sensitive_fields(data, max_rows=20)
        assert len(result) == 20

    def test_dict_input_wrapped_in_list(self):
        result = mask_sensitive_fields({"key": "val"}, max_rows=10)
        assert result == [{"key": "val"}]

    def test_non_dict_non_list_returns_empty(self):
        assert mask_sensitive_fields("string", max_rows=10) == []
