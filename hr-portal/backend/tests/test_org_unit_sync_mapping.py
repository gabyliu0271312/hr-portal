from app.datasources.sync_service import _canonicalize_org_unit_rows


def test_org_unit_rows_are_canonicalized_before_entity_sync():
    rows = _canonicalize_org_unit_rows([{
        "Code": "ORG-1",
        "Name": "总部",
        "FullName": "公司/总部",
        "ParentOrgCode": "RootOrg",
        "OrgAdmin": "行政",
        "Status": "启用",
        "EstablishDate": "2020-01-01",
        "StartDate": "2020-01-01",
        "ChangeType": "新增",
    }])
    assert rows == [{
        "org_code": "ORG-1",
        "org_name": "总部",
        "org_full_name": "公司/总部",
        "parent_org_code": "RootOrg",
        "parent_org_dim": "行政",
        "org_status": "启用",
        "establish_date": "2020-01-01",
        "effective_date": "2020-01-01",
        "change_type": "新增",
    }]


def test_org_unit_canonical_field_wins_over_alias():
    rows = _canonicalize_org_unit_rows([{"org_code": "CANONICAL", "Code": "ALIAS", "Name": "组织"}])
    assert rows[0]["org_code"] == "CANONICAL"
    assert "Code" not in rows[0]
