from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio

from app.warehouse.service.standard_fields import list_people_fields


def _field(id, code, name, entity_id=None, group_id=None, data_type="string", active=True):
    field = MagicMock()
    field.id = id
    field.field_code = code
    field.display_name = name
    field.data_type = data_type
    field.entity_id = entity_id
    field.group_id = group_id
    field.is_active = active
    field.revision = 1
    field.business_definition = "定义"
    field.value_domain = None
    return field


class _Row:
    """模拟 SQLAlchemy Row：支持 ._mapping 下标访问。"""

    def __init__(self, mapping):
        self._mapping = mapping

    def __getitem__(self, key):
        return self._mapping[key]


class _ScalarsResult:
    """模拟 execute() 返回：service 调 .scalars() 得到 scalars，再 .all()。"""

    def __init__(self, items):
        self._items = items

    def scalars(self):
        return _ScalarSeq(self._items)


class _ScalarSeq:
    def __init__(self, items):
        self._items = items

    def all(self):
        return self._items


class _RowsResult:
    """模拟 execute() 返回：service 直接调 .all()。"""

    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeDb:
    """足够 list_people_fields 使用的 fake AsyncSession。

    list_form_fields 已被 mock，list_people_fields 内部只剩两次查询：
    第 1 次 execute → entity_names，之后 → group_map。
    """

    def __init__(self, fields, entity_rows, group_rows):
        self.fields = fields
        self.entity_rows = entity_rows
        self.group_rows = group_rows
        self._call = 0

    async def rollback(self):
        pass

    async def execute(self, stmt):
        self._call += 1
        if self._call == 1:
            return _RowsResult(self.entity_rows)
        return _RowsResult(self.group_rows)

    async def scalar(self, stmt):
        return None


@pytest_asyncio.fixture
def fields():
    # list_people_fields 通过 form_field_bindings(people_roster) 取字段
    return [
        _field(1, "employee_no", "工号", entity_id=1, group_id=1),
        _field(2, "chinese_name", "姓名", entity_id=1, group_id=1),
        _field(3, "work_location", "工作地", entity_id=1, group_id=2, data_type="enum"),
    ]


@pytest_asyncio.fixture
def group_rows():
    # _group_map 按 field_id → group_name 返回（field.id, group.name）
    return [
        (1, "工作信息"),
        (3, "个人信息"),
    ]


@pytest_asyncio.fixture
def entity_rows():
    return [
        (1, "人员(person)"),
    ]


@pytest.mark.asyncio
async def test_list_people_fields_returns_active_fields_with_group_and_entity(fields, group_rows, entity_rows, monkeypatch):
    from unittest.mock import AsyncMock
    from app.warehouse.service import standard_fields as svc
    monkeypatch.setattr(svc, "list_form_fields", AsyncMock(return_value=fields))
    db = _FakeDb(fields, entity_rows, group_rows)
    result = await list_people_fields(db, user=None)
    # 停用字段被过滤
    assert result.total == 3
    items = {item.field_code: item for item in result.items}
    assert "retired_field" not in items
    # 分组名与实体名回填
    assert items["employee_no"].group_name == "工作信息"
    assert items["employee_no"].entity_name == "人员(person)"
    assert items["work_location"].group_name == "个人信息"
    assert items["work_location"].entity_id == 1
    # 未归属字段分组为 None
    assert items["employee_no"].group_id == 1


@pytest.mark.asyncio
async def test_list_people_fields_filters_inactive_in_sql():
    """SQL 层必须过滤停用字段——人员页只展示有效字段，避免停用字段占列。"""
    import inspect
    from app.warehouse.service.standard_fields import list_form_fields as fn
    source = inspect.getsource(fn)
    assert "StandardField.is_active.is_(True)" in source


@pytest.mark.asyncio
async def test_list_people_fields_handles_empty_catalog(monkeypatch):
    from unittest.mock import AsyncMock
    from app.warehouse.service import standard_fields as svc
    monkeypatch.setattr(svc, "list_form_fields", AsyncMock(return_value=[]))
    db = _FakeDb([], [], [])
    result = await list_people_fields(db, user=None)
    assert result.total == 0
    assert result.items == []


@pytest.mark.asyncio
async def test_reorder_standard_fields_persists_display_order(monkeypatch):
    """拖拽排序：按传入顺序重写 display_order，并记录审计。"""
    from app.warehouse.service.standard_fields import reorder_standard_fields
    fields = [_field(1, "a", "A"), _field(2, "b", "B"), _field(3, "c", "C")]
    by_id = {f.id: f for f in fields}

    class _ReorderDb:
        def __init__(self):
            self.logs = []
            self.calls = 0

        async def execute(self, stmt):
            self.calls += 1
            return _ScalarsResult([f.id for f in fields])

        async def get(self, model, field_id):
            return by_id[field_id]

        def add(self, obj):
            self.logs.append(obj)

        async def flush(self):
            pass

        async def commit(self):
            pass

        async def rollback(self):
            pass

    monkeypatch.setattr("app.warehouse.service.standard_fields.user_has_op", AsyncMock(return_value=True))
    db = _ReorderDb()
    user = MagicMock(); user.id = 42
    result = await reorder_standard_fields(db, [3, 1, 2], user=user)
    assert result == {"ok": True}
    assert fields[2].display_order == 0  # id=3 → position 0
    assert fields[0].display_order == 1  # id=1 → position 1
    assert fields[1].display_order == 2  # id=2 → position 2
    assert any(getattr(log, "action", "") == "standard_field_reordered" for log in db.logs)


@pytest.mark.asyncio
async def test_reorder_standard_fields_denied_without_permission(monkeypatch):
    from app.warehouse.service.standard_fields import reorder_standard_fields
    from fastapi import HTTPException
    monkeypatch.setattr("app.warehouse.service.standard_fields.user_has_op", AsyncMock(return_value=False))
    user = MagicMock(); user.id = 42
    with pytest.raises(HTTPException) as exc:
        await reorder_standard_fields(_FakeDb([], [], []), [1], user=user)
    assert exc.value.status_code == 403
