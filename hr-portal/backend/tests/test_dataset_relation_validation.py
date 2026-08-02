from types import SimpleNamespace

import pytest

from app.datasets import relations


@pytest.fixture(autouse=True)
def registered_roster(monkeypatch):
    monkeypatch.setattr(
        relations,
        "DATA_TABLES",
        {
            "emp_realtime_roster": SimpleNamespace(
                __table__=SimpleNamespace(columns={"employee_no": object()})
            )
        },
    )


def test_relation_keys_accept_existing_business_columns():
    relations.validate_dataset_relation_keys(
        {"roster": "emp_realtime_roster", "roster_copy": "emp_realtime_roster"},
        [
            SimpleNamespace(
                left_alias="roster",
                right_alias="roster_copy",
                keys=[SimpleNamespace(left="employee_no", right="employee_no")],
            )
        ],
    )


def test_relation_keys_reject_invalid_column_code_before_index_creation():
    with pytest.raises(ValueError, match="连接字段无效"):
        relations.validate_dataset_relation_keys(
            {"left": "emp_realtime_roster", "right": "emp_realtime_roster"},
            [
                {
                    "left_alias": "left",
                    "right_alias": "right",
                    "keys": [{"left": "11", "right": "employee_no"}],
                }
            ],
        )


def test_relation_keys_reject_missing_physical_column():
    with pytest.raises(ValueError, match="不存在实体字段"):
        relations.validate_dataset_relation_keys(
            {"left": "emp_realtime_roster", "right": "emp_realtime_roster"},
            [
                {
                    "left_alias": "left",
                    "right_alias": "right",
                    "keys": [{"left": "missing_column", "right": "employee_no"}],
                }
            ],
        )


def test_relation_keys_reject_empty_key_list():
    with pytest.raises(ValueError, match="至少需要一个连接键"):
        relations.validate_dataset_relation_keys(
            {"left": "emp_realtime_roster", "right": "emp_realtime_roster"},
            [{"left_alias": "left", "right_alias": "right", "keys": []}],
        )