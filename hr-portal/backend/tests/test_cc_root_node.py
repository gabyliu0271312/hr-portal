"""成本中心固定根（code='root costcenter'，level=0）：ensure 幂等、结构计算、健康豁免、CRUD 保护。"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.trees import router as trees_router
from app.trees.service import (
    CC_ROOT_CODE, business_path_of, chain_depth, cost_center_structure,
)


def _node(id_, code, name, parent_id, level, path, is_active=True, source_mode="local"):
    return SimpleNamespace(
        id=id_, code=code, name=name, parent_id=parent_id, level=level,
        path=path, is_active=is_active, is_leaf=False, source_mode=source_mode,
        synced_at=datetime(2026, 11, 11, 8, 0, tzinfo=timezone.utc),
    )


def _rows_with_root():
    return [
        _node(1, CC_ROOT_CODE, "成本中心", None, 0, "/成本中心/"),
        _node(2, "C1", "一级成本中心A", 1, 1, "/一级成本中心A/"),
        _node(3, "C1-1", "二级成本中心A1", 2, 2, "/一级成本中心A/二级成本中心A1/"),
    ]


def test_cost_center_structure_ignores_fixed_root_in_depth_and_path():
    structure = cost_center_structure(_rows_with_root())
    # 固定根：level=0，path 仅自身名称
    assert structure[1][0] == 0
    assert structure[1][1] == "/成本中心/"
    # 业务根：不拼固定根前缀，depth=1
    assert structure[2][0] == 1
    assert structure[2][1] == "/一级成本中心A/"
    # 二级：depth=2
    assert structure[3][0] == 2
    assert structure[3][1] == "/一级成本中心A/二级成本中心A1/"


def test_cost_center_structure_without_root_keeps_legacy_semantics():
    rows = [
        _node(1, "C1", "一级成本中心A", None, 1, "/一级成本中心A/"),
        _node(2, "C1-1", "二级成本中心A1", 1, 2, "/一级成本中心A/二级成本中心A1/"),
    ]
    structure = cost_center_structure(rows)
    assert structure[1] == (1, "/一级成本中心A/", [rows[0]])
    assert structure[2] == (2, "/一级成本中心A/二级成本中心A1/", [rows[1], rows[0]])


def test_business_path_of_does_not_prefix_fixed_root():
    root = _node(1, CC_ROOT_CODE, "成本中心", None, 0, "/成本中心/")
    structure = cost_center_structure([root])
    assert business_path_of(root, "新中心", structure) == "/新中心/"
    assert business_path_of(None, "新中心", structure) == "/新中心/"
    parent = _node(2, "C1", "一级", 1, 1, "/一级/")
    structure2 = cost_center_structure([root, parent])
    assert business_path_of(parent, "子", structure2) == "/一级/子/"


def test_chain_depth_counts_business_nodes_only():
    root = _node(1, CC_ROOT_CODE, "成本中心", None, 0, "/成本中心/")
    parent = _node(2, "C1", "一级", 1, 1, "/一级/")
    leaf = _node(3, "C1-1", "二级", 2, 2, "/一级/二级/")
    structure = cost_center_structure([root, parent, leaf])
    assert chain_depth(structure[1][2]) == 0  # 固定根自身
    assert chain_depth(structure[2][2]) == 1  # 业务根
    assert chain_depth(structure[3][2]) == 2  # 二级


def test_tree_health_accepts_fixed_root_when_exempt():
    from app.warehouse.service.tree_health import analyze_tree
    result = analyze_tree("cost_center", _rows_with_root(), frozenset({CC_ROOT_CODE}))
    assert result.eligible is True, result.issues
    assert result.root_count == 1  # 仅固定根


def test_tree_health_still_rejects_fixed_root_without_exempt():
    from app.warehouse.service.tree_health import analyze_tree
    result = analyze_tree("cost_center", _rows_with_root())
    codes = {issue.code for issue in result.issues}
    assert not result.eligible
    assert {"root_level_invalid", "invalid_level"} <= codes


class RootSession:
    """模拟 DB 会话：支持 add/flush/commit，记录节点操作。"""

    def __init__(self, rows):
        self.rows = list(rows)
        self.added = []
        self.committed = False
        self.rolled_back = False
        self.next_id = max((r.id for r in self.rows), default=0) + 1

    async def execute(self, statement, params=None):
        from types import SimpleNamespace as NS
        return NS(all=lambda: list(self.rows), scalars=lambda: NS(all=lambda: list(self.rows)))

    def add(self, node):
        self.added.append(node)

    async def flush(self):
        for node in self.added:
            if not node.id:
                node.id = self.next_id
                self.next_id += 1
        self.rows.extend(self.added)

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    def delete(self, node):
        self.rows = [row for row in self.rows if row.id != node.id]


@pytest.mark.asyncio
async def test_ensure_cc_root_creates_root_and_hangs_business_roots():
    from app.trees.service import ensure_cc_root
    rows = [
        _node(2, "C1", "一级成本中心A", None, 1, "/一级成本中心A/"),
        _node(3, "C1-1", "二级成本中心A1", 2, 2, "/一级成本中心A/二级成本中心A1/"),
    ]
    db = RootSession(rows)
    root_id = await ensure_cc_root(db)
    assert root_id == 4
    root = next(n for n in db.rows if n.code == CC_ROOT_CODE)
    assert root.level == 0 and root.parent_id is None and root.path == "/成本中心/"
    assert root.source_mode == "local"
    # 业务根挂到固定根下
    business_root = next(n for n in db.rows if n.code == "C1")
    assert business_root.parent_id == 4


@pytest.mark.asyncio
async def test_ensure_cc_root_is_idempotent():
    from app.trees.service import ensure_cc_root
    rows = _rows_with_root()
    db = RootSession(rows)
    root_id = await ensure_cc_root(db)
    assert root_id == 1
    assert len([n for n in db.rows if n.code == CC_ROOT_CODE]) == 1


@pytest.mark.asyncio
async def test_create_without_parent_hangs_under_fixed_root():
    db = RootSession(_rows_with_root())
    out = await trees_router.create_cc_directory(
        trees_router.CostCenterCreate(name="新中心", code="NEW"), _=SimpleNamespace(id=7), db=db,
    )
    assert out.parent_id == 1  # 固定根
    assert out.level == 1
    added = db.added[0]
    assert added.path == "/新中心/"
    assert db.committed


@pytest.mark.asyncio
async def test_create_rejects_reserved_root_code():
    db = RootSession(_rows_with_root())
    with pytest.raises(HTTPException) as exc:
        await trees_router.create_cc_directory(
            trees_router.CostCenterCreate(name="根", code=CC_ROOT_CODE), _=SimpleNamespace(id=7), db=db,
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_update_fixed_root_renames_only():
    rows = _rows_with_root()
    db = RootSession(rows)
    out = await trees_router.update_cc_directory(
        1, trees_router.CostCenterUpdate(name="新根名"), _=SimpleNamespace(id=7), db=db,
    )
    assert out.name == "新根名"
    assert out.parent_id is None and out.level == 0
    root = next(n for n in db.rows if n.code == CC_ROOT_CODE)
    assert root.path == "/新根名/"


@pytest.mark.asyncio
async def test_update_fixed_root_rejects_reparent():
    db = RootSession(_rows_with_root())
    with pytest.raises(HTTPException) as exc:
        await trees_router.update_cc_directory(
            1, trees_router.CostCenterUpdate(name="新根名", parent_id=2), _=SimpleNamespace(id=7), db=db,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_delete_fixed_root_rejected():
    db = RootSession(_rows_with_root())
    with pytest.raises(HTTPException) as exc:
        await trees_router.delete_cc_directory(1, _=SimpleNamespace(id=7), db=db)
    assert exc.value.status_code == 409
    assert exc.value.detail == "固定根节点不允许删除"
