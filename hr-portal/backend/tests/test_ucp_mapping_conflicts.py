import pytest

from app.ucp.pipeline_engine import _apply_mapping_rules


def test_mapping_rules_preserve_full_code_value():
    result = _apply_mapping_rules(
        {"招聘组编码": "hr.zpyhrbpz"},
        [{"source": "招聘组编码", "target": "recruit_group_code"}],
    )

    assert result == {"recruit_group_code": "hr.zpyhrbpz"}


def test_mapping_rules_reject_duplicate_targets():
    with pytest.raises(ValueError, match="字段映射冲突"):
        _apply_mapping_rules(
            {"招聘组编码": "hr.zpyhrbpz", "岗位编码": "hr.zpyhrbp"},
            [
                {"source": "招聘组编码", "target": "code"},
                {"source": "岗位编码", "target": "code"},
            ],
        )
