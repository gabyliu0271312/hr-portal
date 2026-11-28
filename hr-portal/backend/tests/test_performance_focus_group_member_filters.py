"""人员组成员筛选契约与匹配口径（REA emp_list filters）。"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.performance.focus_group_members_router import (
    _matches_category,
    _matches_department,
    _parse_member_filters,
)


def test_parse_member_filters_accepts_measured_contract():
    raw = (
        '{"leaderIds":["E1"],"departmentIds":["技术中台/效率工具组"],'
        '"categoryIds":["研发类/客户端"],"operator_ids":["E2"],'
        '"start_time":1793462400000,"end_time":1794758399999}'
    )
    assert _parse_member_filters(raw) == {
        "leaderIds": ["E1"],
        "departmentIds": ["技术中台/效率工具组"],
        "categoryIds": ["研发类/客户端"],
        "operator_ids": ["E2"],
        "start_time": 1793462400000,
        "end_time": 1794758399999,
    }


@pytest.mark.parametrize("raw", [
    '{"unknown":["E1"]}',
    '{"leaderIds":"E1"}',
    '{"start_time":true}',
    '{"start_time":-1}',
    '{"departmentIds":[""]}',
])
def test_parse_member_filters_rejects_invalid(raw):
    with pytest.raises(HTTPException) as error:
        _parse_member_filters(raw)
    assert error.value.status_code == 422


def test_parse_member_filters_empty_is_none_effect():
    assert _parse_member_filters(None) == {}
    assert _parse_member_filters("{}") == {}


def test_department_matches_parent_path():
    person = {"organization_ref": "技术中台/效率工具组"}
    assert _matches_department(person, ["技术中台"])
    assert _matches_department(person, ["技术中台/效率工具组"])
    assert not _matches_department(person, ["技术中台/运维中心"])
    assert not _matches_department({"organization_ref": None}, ["技术中台"])


def test_category_matches_family_or_leaf():
    person = {"job_family": "研发类", "job_category": "客户端"}
    assert _matches_category(person, ["研发类"])
    assert _matches_category(person, ["研发类/客户端"])
    assert not _matches_category(person, ["研发类/服务端"])
    assert not _matches_category(person, ["产品类"])
