"""阶段 A：配置驱动建树（tree_role 元数据）单元测试。

核心承诺：建树器只认 table_columns.tree_role 配置，不硬编码列名。
外部字段名（UCP 数据连接映射）可以是任意列（DeptID/DeptName/ParentDept/DeptStatus），
只要 table_columns 把这些列标成对应 tree_role，建树器就正确读列建树。
"""
from types import SimpleNamespace

import pytest

from app.datasources.sync_service import (
    _ORG_ROOT_CODE,
    _resolve_tree_roles,
    _sync_org_tree,
    _TREE_ROLE_ACTIVE,
    _TREE_ROLE_CODE,
    _TREE_ROLE_NAME,
    _TREE_ROLE_PARENT,
)


pytestmark = pytest.mark.asyncio


def _col(column_code: str, tree_role: str | None):
    return SimpleNamespace(table_name="org_tree", column_code=column_code, tree_role=tree_role)


class FakeResult:
    def __init__(self, rows):
        self._rows = list(rows)

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class FakeSession:
    """最小 FakeSession：支持 _sync_org_tree / _resolve_tree_roles 的 execute + get + add + flush。"""

    def __init__(self, *, table_columns: list | None = None, existing: list | None = None):
        self.table_columns = table_columns or []
        self.existing = list(existing or [])
        self.added: list = []
        self.deleted: list = []
        self.id_counter = 1000

    async def execute(self, statement, params=None):
        sql = str(statement).lower()
        if "table_columns" in sql:
            return FakeResult(self.table_columns)
        if "org_tree" in sql or "orgnode" in sql:
            return FakeResult(self.existing)
        return FakeResult([])

    async def get(self, model, obj_id):
        for n in self.existing + self.added:
            if n.id == obj_id:
                return n
        return None

    def add(self, obj):
        obj.id = obj.id or self.id_counter
        self.id_counter += 1
        self.added.append(obj)

    async def flush(self):
        # 模拟数据库分配 id：无 id 的对象分配递增 id
        for n in self.added:
            if n.id is None:
                n.id = self.id_counter
                self.id_counter += 1

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        pass


def _node(code, name, parent_id=None, is_active=True):
    return SimpleNamespace(
        id=None, code=code, name=name, parent_id=parent_id,
        level=0, is_leaf=False, is_active=is_active, synced_at=None,
    )


async def test_resolve_tree_roles_reads_metadata():
    """tree_role 元数据按角色映射回列名（不硬编码列名）。"""
    db = FakeSession(table_columns=[
        _col("DeptID", _TREE_ROLE_CODE),
        _col("DeptName", _TREE_ROLE_NAME),
        _col("ParentDept", _TREE_ROLE_PARENT),
        _col("DeptStatus", _TREE_ROLE_ACTIVE),
        _col("Remark", None),  # 普通列不参与
    ])
    mapping = await _resolve_tree_roles("org_tree", db)
    assert mapping == {
        _TREE_ROLE_CODE: "DeptID",
        _TREE_ROLE_NAME: "DeptName",
        _TREE_ROLE_PARENT: "ParentDept",
        _TREE_ROLE_ACTIVE: "DeptStatus",
    }


async def test_sync_org_tree_builds_with_configurable_columns():
    """建树器按 tree_role 配置读列：外部字段列名可非常规，仍正确建树。"""
    db = FakeSession(table_columns=[
        _col("DeptID", _TREE_ROLE_CODE),
        _col("DeptName", _TREE_ROLE_NAME),
        _col("ParentDept", _TREE_ROLE_PARENT),
        _col("DeptStatus", _TREE_ROLE_ACTIVE),
    ])
    rows = [
        {"DeptID": "D1", "DeptName": "研发中心", "ParentDept": "", "DeptStatus": "启用"},
        {"DeptID": "D1-1", "DeptName": "后端组", "ParentDept": "D1", "DeptStatus": "启用"},
        {"DeptID": "D1-2", "DeptName": "前端组", "ParentDept": "D1", "DeptStatus": "停用"},
        {"DeptID": "D2", "DeptName": "市场部", "ParentDept": "", "DeptStatus": "启用"},
    ]
    await _sync_org_tree(rows, db)
    await db.flush()

    nodes = {n.code: n for n in db.added}
    assert set(nodes) == {_ORG_ROOT_CODE, "D1", "D1-1", "D1-2", "D2"}

    # 虚拟根
    root = nodes[_ORG_ROOT_CODE]
    assert root.parent_id is None and root.level == 0 and root.is_active

    # D1 挂在根下（ParentDept 空 → 根），level=1
    d1 = nodes["D1"]
    assert d1.parent_id == root.id and d1.level == 1 and d1.is_active

    # D1-1 父=D1，level=2
    d1_1 = nodes["D1-1"]
    assert d1_1.parent_id == d1.id and d1_1.level == 2 and d1_1.is_active

    # D1-2 停用 → is_active=False
    d1_2 = nodes["D1-2"]
    assert d1_2.is_active is False

    # D2 独立根下，level=1
    d2 = nodes["D2"]
    assert d2.parent_id == root.id and d2.level == 1


async def test_sync_org_tree_fallback_to_default_columns():
    """未配置 tree_role 时回退默认列名（org_code/org_name/parent_org_code/org_status）。"""
    db = FakeSession(table_columns=[])  # 无 tree_role 配置
    rows = [
        {"org_code": "A", "org_name": "一级A", "parent_org_code": "", "org_status": "启用"},
        {"org_code": "A1", "org_name": "二级A1", "parent_org_code": "A", "org_status": "启用"},
    ]
    await _sync_org_tree(rows, db)
    await db.flush()
    nodes = {n.code: n for n in db.added}
    assert set(nodes) == {_ORG_ROOT_CODE, "A", "A1"}
    assert nodes["A1"].parent_id == nodes["A"].id
