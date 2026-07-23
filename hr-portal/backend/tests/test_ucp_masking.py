from app.ucp.masking import mask_sensitive_fields


def test_mask_sensitive_fields_masks_nested_offer_salary_values():
    result = mask_sensitive_fields([{
        "application_id": "application-001",
        "offer_detail": {"salary_amount": 30000, "phone": "13812345678"},
    }])

    assert result == [{
        "application_id": "application-001",
        "offer_detail": {"salary_amount": "[已脱敏]", "phone": "138****5678"},
    }]
