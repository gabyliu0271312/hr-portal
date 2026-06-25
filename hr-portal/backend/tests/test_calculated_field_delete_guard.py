import pytest
from fastapi import HTTPException

from app.datasets import calculated_fields as cf
from app.datasets.models import DatasetCalculatedField


pytestmark = pytest.mark.asyncio


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class FakeResult:
    def __init__(self, rows=None):
        self.rows = rows or []

    def scalars(self):
        return FakeScalarResult(self.rows)


class FakeSession:
    """按 execute 调用顺序返回预置结果；get 按 (model,id) 映射。"""

    def __init__(self, *, get_map=None, results=()):
        self.get_map = get_map or {}
        self.results = list(results)
        self.committed = False

    async def get(self, model, obj_id):
        return self.get_map.get((model, obj_id))

    async def execute(self, statement, params=None):
        return self.results.pop(0) if self.results else FakeResult()

    async def commit(self):
        self.committed = True


def make_calc(field_id, ds_id, code, depends_on=None):
    return DatasetCalculatedField(
        id=field_id,
        dataset_id=ds_id,
        code=code,
        label=code,
        formula="=1",
        data_type="number",
        agg_role="measure",
        depends_on=depends_on or [],
        used_functions=[],
        is_sensitive=False,
        is_active=True,
    )


class FakeReport:
    def __init__(self, name, config):
        self.name = name
        self.config = config


class FakeScheme:
    def __init__(self, name, config):
        self.name = name
        self.config = config


@pytest.fixture(autouse=True)
def bypass_access(monkeypatch):
    async def ok(ds_id, user, db):
        return object()

    monkeypatch.setattr(cf, "_ensure_dataset_access", ok)


async def test_delete_calc_field_blocked_when_referenced_by_report(monkeypatch):
    ds_id, fid = 1, 9
    field = make_calc(fid, ds_id, "field")
    # execute 顺序：reports 查询、schemes 查询、其它计算字段查询
    db = FakeSession(
        get_map={(DatasetCalculatedField, fid): field},
        results=[
            FakeResult(rows=[FakeReport("成本分摊表（测试）", {"columns": ["calc.field"]})]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
        ],
    )

    with pytest.raises(HTTPException) as exc:
        await cf.delete_calculated_field(ds_id, fid, user=object(), db=db)

    assert exc.value.status_code == 409
    assert "成本分摊表（测试）" in exc.value.detail
    assert db.committed is False


async def test_delete_calc_field_blocked_when_referenced_in_value_rules():
    ds_id, fid = 1, 9
    field = make_calc(fid, ds_id, "field")
    db = FakeSession(
        get_map={(DatasetCalculatedField, fid): field},
        results=[
            FakeResult(rows=[FakeReport("R", {"value_rules": [{"target": "calc.field"}]})]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
        ],
    )

    with pytest.raises(HTTPException) as exc:
        await cf.delete_calculated_field(ds_id, fid, user=object(), db=db)
    assert exc.value.status_code == 409


async def test_delete_calc_field_succeeds_when_unreferenced():
    ds_id, fid = 1, 9
    field = make_calc(fid, ds_id, "lonely")
    db = FakeSession(
        get_map={(DatasetCalculatedField, fid): field},
        results=[
            FakeResult(rows=[FakeReport("R", {"columns": ["calc.other"]})]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
        ],
    )

    out = await cf.delete_calculated_field(ds_id, fid, user=object(), db=db)
    assert out == {"ok": True}
    assert field.is_active is False
    assert db.committed is True
