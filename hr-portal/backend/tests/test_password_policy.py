import pytest

from app.auth.password import PASSWORD_POLICY_HINT, is_strong_enough


def test_password_policy_accepts_required_character_classes():
    assert is_strong_enough("Abcdef1!") == (True, None)


@pytest.mark.parametrize(
    ("password", "expected_message"),
    [
        ("Ab1!", "密码至少 8 位"),
        ("abcdef1!", "大写字母"),
        ("ABCDEF1!", "小写字母"),
        ("Abcdefg!", "数字"),
        ("Abcdef12", "特殊符号"),
    ],
)
def test_password_policy_reports_missing_requirement(password: str, expected_message: str):
    ok, message = is_strong_enough(password)

    assert ok is False
    assert message is not None
    assert expected_message in message


def test_password_policy_hint_matches_required_character_classes():
    for word in ("大写字母", "小写字母", "数字", "特殊符号"):
        assert word in PASSWORD_POLICY_HINT
