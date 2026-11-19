"""UCP 树资产直写分支测试（方案乙-1：asset_sink 树分支，双树复用）。

覆盖：
- _is_tree_asset / _resolve_tree_roles 识别树资产
- cost_center_tree 增量 upsert：同 code 复用旧 ID/更新名称、新 code 插入、不删已有
- 无父字段 → 全部挂固定根；无状态 → 默认启用
- 重复编码整批拒绝（不静默跳过）
- local 节点保留不删
- org_tree 同分支（带 parent/status 列时正确挂父/解析状态）
"""
from types import SimpleNamespace
from datetime import datetime, timezone

import pytest

from app.datasources.sync_service import (
    _TREE_ROLE_CODE,
    _TREE_ROLE_NAME,
    _TREE_ROLE_PARENT,
    _TREE_ROLE_ACTIVE,
)
from app.warehouse.asset_sink_tree import (
    _is_tree_asset,
    _resolve_tree_roles,
    _write_tree_upsert,
)

pytestmark = pytest.mark.asyncio


class FakeResult:
    def __init__(self, rows=None):
        self._rows = list(rows or [])

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class FakeSession:
    """最小 FakeSession：支撑 _write_tree_upsert（select / execute / add / flush）。"""

    def __init__(self, *, columns=None, existing=None):
        self.columns = columns or []
        self.existing = list(existing or [])
        self.added: list = []
        self.deleted: list = []
        self.executed_sql: list[str] = []
        self.id_counter = 1000

    async def execute(self, statement, params=None):
        sql = str(statement).lower()
        self.executed_sql.append(sql)
        if "table_columns" in sql:
            return FakeResult(self.columns)
        if "cost_center_tree" in sql or "costcenternode" in sql:
            return FakeResult(self.existing + self.added)
        if "org_tree" in sql or "orgnode" in sql:
            return FakeResult(self.existing + self.added)
        return FakeResult([])

    async def scalar(self, statement):
        return None

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = self.id_counter
            self.id_counter += 1
        self.added.append(obj)

    async def flush(self):
        for n in self.added:
            if getattr(n, "id", None) is None:
                n.id = self.id_counter
                self.id_counter += 1

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        pass


def _col(code, role):
    return SimpleNamespace(table_name="cost_center_tree", column_code=code, tree_role=role)


def _cc_cols():
    return [
        _col("code", _TREE_ROLE_CODE),
        _col("name", _TREE_ROLE_NAME),
        _col("is_active", _TREE_ROLE_ACTIVE),
    ]


def _cc_node(id_, code, name, parent_id=None, source_mode="external_sync", active=True, parent_code=None):
    return SimpleNamespace(
        id=id_, code=code, name=name, parent_id=parent_id, parent_code=parent_code,
        level=1, is_leaf=True, is_active=active, path=f"/{name}/",
        source_mode=source_mode,
        synced_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


async def test_resolve_tree_roles_reads_cc_metadata():
    db = FakeSession(columns=_cc_cols())
    mapping = await _resolve_tree_roles("cost_center_tree", db)
    assert mapping.get(_TREE_ROLE_CODE) == "code"
    assert mapping.get(_TREE_ROLE_NAME) == "name"
    assert mapping.get(_TREE_ROLE_ACTIVE) == "is_active"
    assert _is_tree_asset("cost_center_tree", mapping)


async def test_write_cc_tree_upsert_all_hang_on_root_default_active():
    """成本中心源无父字段/无状态 → 全部挂固定根、默认启用。"""
    from app.data.models import CostCenterNode
    db = FakeSession(columns=_cc_cols(), existing=[_cc_node(1, "root costcenter", "成本中心")])
    result = await _write_tree_upsert(
        db,
        table_name="cost_center_tree",
        rows=[
            {"code": "1001", "name": "研发中心"},
            {"code": "1002", "name": "市场部"},
        ],
        field_whitelist=["code", "name"],
    )
    assert result["written_count"] == 2
    nodes = {n.code: n for n in db.added if n.code != "root costcenter"}
    assert set(nodes) == {"1001", "1002"}
    assert nodes["1001"].parent_id == 1          # 挂固定根
    assert nodes["1001"].is_active is True       # 默认启用
    assert nodes["1002"].parent_id == 1


async def test_write_cc_tree_upsert_reuses_existing_id_no_delete():
    """同 code 更新复用旧 ID/名称，不删已有节点（含 local）。"""
    existing = [
        _cc_node(1, "root costcenter", "成本中心"),
        _cc_node(2, "1001", "研发中心旧名"),
        _cc_node(3, "L", "本地节点", 1, "local"),
    ]
    db = FakeSession(columns=_cc_cols(), existing=existing)
    result = await _write_tree_upsert(
        db,
        table_name="cost_center_tree",
        rows=[{"code": "1001", "name": "研发中心新名"}],
        field_whitelist=["code", "name"],
    )
    assert result["written_count"] == 1
    # 复用旧 ID：existing 里的 1001 被更新名称，不新增节点
    updated = next(n for n in db.existing if n.code == "1001")
    assert updated.id == 2
    assert updated.name == "研发中心新名"
    # 无新增（复用旧 ID 不新建）、无删除（local 与旧节点都保留）
    assert len(db.added) == 0
    assert db.deleted == []


async def test_write_cc_tree_rejects_duplicate_code():
    """重复编码整批拒绝（不静默跳过）。"""
    db = FakeSession(columns=_cc_cols(), existing=[_cc_node(1, "root costcenter", "成本中心")])
    with pytest.raises(ValueError, match="编码重复"):
        await _write_tree_upsert(
            db,
            table_name="cost_center_tree",
            rows=[
                {"code": "1001", "name": "A"},
                {"code": "1001", "name": "B"},
            ],
            field_whitelist=["code", "name"],
        )


def _cc_cols_with_parent():
    return [
        _col("code", _TREE_ROLE_CODE),
        _col("name", _TREE_ROLE_NAME),
        _col("parent_code", _TREE_ROLE_PARENT),
        _col("is_active", _TREE_ROLE_ACTIVE),
    ]


async def test_write_cc_tree_hangs_parent_code_when_matched():
    """成本中心源带父编码 → 命中树内节点时挂父，并记录 parent_code 列。"""
    db = FakeSession(
        columns=_cc_cols_with_parent(),
        existing=[_cc_node(1, "root costcenter", "成本中心")],
    )
    result = await _write_tree_upsert(
        db,
        table_name="cost_center_tree",
        rows=[
            {"code": "1001", "name": "研发中心"},
            {"code": "1002", "name": "研发二部", "parent_code": "1001"},
        ],
        field_whitelist=["code", "name", "parent_code", "is_active"],
    )
    assert result["written_count"] == 2
    nodes = {n.code: n for n in db.added if n.code != "root costcenter"}
    assert nodes["1001"].parent_id == 1            # 无父编码 → 挂固定根
    assert nodes["1002"].parent_id == nodes["1001"].id  # 命中本次行父 → 挂父
    assert nodes["1002"].parent_code == "1001"


async def test_write_cc_tree_parent_code_hits_existing_tree():
    """父编码指向存量树节点（父不在本次报表行）→ 仍按存量父挂，不误挂根。"""
    existing = [
        _cc_node(1, "root costcenter", "成本中心"),
        _cc_node(2, "1001", "研发中心"),
    ]
    db = FakeSession(columns=_cc_cols_with_parent(), existing=existing)
    await _write_tree_upsert(
        db,
        table_name="cost_center_tree",
        rows=[{"code": "1002", "name": "研发二部", "parent_code": "1001"}],
        field_whitelist=["code", "name", "parent_code", "is_active"],
    )
    nodes = {n.code: n for n in db.added if n.code != "root costcenter"}
    assert nodes["1002"].parent_id == 2            # 命中存量父 1001 的 id
    assert nodes["1002"].parent_code == "1001"


async def test_write_cc_tree_parent_code_unmatched_hangs_root():
    """父编码未命中任何树内节点 → 缺省挂固定根，parent_code 仍记录。"""
    db = FakeSession(
        columns=_cc_cols_with_parent(),
        existing=[_cc_node(1, "root costcenter", "成本中心")],
    )
    await _write_tree_upsert(
        db,
        table_name="cost_center_tree",
        rows=[{"code": "1001", "name": "研发中心", "parent_code": "NOT_EXIST"}],
        field_whitelist=["code", "name", "parent_code", "is_active"],
    )
    nodes = {n.code: n for n in db.added if n.code != "root costcenter"}
    assert nodes["1001"].parent_id == 1            # 未命中 → 挂根
    assert nodes["1001"].parent_code == "NOT_EXIST"  # 父编码仍记录待溯源


async def test_write_org_tree_with_parent_and_status():
    """org_tree 同分支：带 parent/status 列时正确挂父/解析状态。"""
    from app.data.models import OrgNode

    org_cols = [
        SimpleNamespace(table_name="org_tree", column_code="org_code", tree_role=_TREE_ROLE_CODE),
        SimpleNamespace(table_name="org_tree", column_code="org_name", tree_role=_TREE_ROLE_NAME),
        SimpleNamespace(table_name="org_tree", column_code="parent_org_code", tree_role=_TREE_ROLE_PARENT),
        SimpleNamespace(table_name="org_tree", column_code="org_status", tree_role=_TREE_ROLE_ACTIVE),
    ]
    root = SimpleNamespace(
        id=1, code="RootOrg", name="根", parent_id=None, level=0,
        is_leaf=False, is_active=True, synced_at=None,
    )
    db = FakeSession(columns=org_cols, existing=[root])
    await _write_tree_upsert(
        db,
        table_name="org_tree",
        rows=[
            {"org_code": "D1", "org_name": "研发中心", "parent_org_code": "", "org_status": "启用"},
            {"org_code": "D1-1", "org_name": "后端组", "parent_org_code": "D1", "org_status": "停用"},
        ],
        field_whitelist=["org_code", "org_name", "parent_org_code", "org_status"],
    )
    nodes = {n.code: n for n in db.added if n.code != "RootOrg"}
    d1 = nodes["D1"]
    d1_1 = nodes["D1-1"]
    # D1 挂根、level=1、启用；D1-1 父=D1、停用
    assert d1.parent_id == 1
    assert d1.is_active is True
    assert d1_1.parent_id == d1.id
    assert d1_1.is_active is False
