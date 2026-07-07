# -*- coding: utf-8 -*-
"""分层安全策略 — DDL 校验 + 分层流转 + ODS 只读保护

P0 安全底线：
  - DDL 破坏性操作必须查真实 registered_tables，不信任入参 target_layer
  - ODS 一律只读
  - CREATE OR REPLACE → REPLACE 处理
  - 操作必须走白名单
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

# ── DDL 操作白名单 ──────────────────────────

DDL_CREATE   = "CREATE"
DDL_DROP     = "DROP"
DDL_REPLACE  = "REPLACE"
DDL_ALTER    = "ALTER"
DDL_TRUNCATE = "TRUNCATE"

ALLOWED_DDL_OPERATIONS = frozenset({DDL_CREATE, DDL_DROP, DDL_REPLACE, DDL_ALTER, DDL_TRUNCATE})

# 破坏性 DDL：DROP / REPLACE / ALTER / TRUNCATE 必须查真实元数据
DESTRUCTIVE_DDL = frozenset({DDL_DROP, DDL_REPLACE, DDL_ALTER, DDL_TRUNCATE})

# CREATE OR REPLACE / INSERT OVERWRITE 语义 → REPLACE（不是 CREATE）
REPLACE_ALIASES = frozenset({"CREATE OR REPLACE", "INSERT OVERWRITE", "CREATE_OR_REPLACE"})

WRITABLE_LAYERS = frozenset({"DWD", "DWS", "ADS"})

_IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')

# ── 分层流转矩阵 ─────────────────────────────

LAYER_ORDER = {"ODS": 0, "DWD": 1, "DWS": 2, "ADS": 3}

# 允许的流转路径 source→target
ALLOWED_TRANSITIONS = {
    ("ODS", "DWD"): "standardize",
    ("DWD", "DWS"): "aggregate",
    ("DWS", "ADS"): "consume",
    ("DWD", "ADS"): "consume",
    ("DWD", "DWD"): "snapshot",
    ("DWS", "DWS"): "snapshot",
    ("ADS", "ADS"): "snapshot",
}


@dataclass
class DdlValidationResult:
    allowed: bool
    reason: str = ""
    actual_layer: str | None = None


# ── 工具函数 ────────────────────────────────

def _validate_identifier(name: str) -> str:
    name = name.strip().strip('`').strip()
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"非法 SQL 标识符: {name!r}")
    return name


def _normalize_operation(op: str) -> str:
    """将 CREATE OR REPLACE / INSERT OVERWRITE 等别名归一化为标准操作"""
    upper = op.upper().strip()
    if upper in REPLACE_ALIASES:
        return DDL_REPLACE
    if upper not in ALLOWED_DDL_OPERATIONS:
        raise ValueError(f"DDL 操作不在白名单: {op!r}，允许: {sorted(ALLOWED_DDL_OPERATIONS)}")
    return upper


async def get_registered_layer(db: AsyncSession, table_name: str) -> str | None:
    """查询 registered_tables 中该表的真实 warehouse_layer"""
    from app.data.models import RegisteredTable
    r = await db.scalar(select(RegisteredTable).where(RegisteredTable.table_name == table_name))
    return r.warehouse_layer if r else None


async def _table_exists_physically(db: AsyncSession, table_name: str) -> bool:
    """检查物理表是否在数据库中实际存在"""
    try:
        result = await db.execute(
            sa_text("SELECT 1 FROM information_schema.tables WHERE table_name = :t")
            .bindparams(t=table_name)
        )
        return result.fetchone() is not None
    except Exception as e:
        raise ValueError(f"无法确认物理表是否存在，拒绝执行 DDL: {e}") from e


# ── 公共 API ─────────────────────────────────

def assert_not_ods_write(layer: str) -> None:
    """ODS 层禁止任何写入操作"""
    layer = layer.upper().strip()
    if layer == "ODS":
        raise ValueError("ODS 层只读，禁止写入/删除/修改")


def assert_writable_layer(layer: str) -> None:
    """校验目标层在允许写入的范围内"""
    layer = layer.upper().strip()
    if layer not in WRITABLE_LAYERS:
        raise ValueError(f"目标层 {layer!r} 不可写，仅允许: {sorted(WRITABLE_LAYERS)}")


def validate_layer_transition(source_layer: str, target_layer: str, operation: str) -> None:
    """校验分层流转是否合法"""
    src = source_layer.upper().strip()
    tgt = target_layer.upper().strip()
    key = (src, tgt)
    if key not in ALLOWED_TRANSITIONS:
        allowed = ", ".join([f"{s}→{t}" for s, t in ALLOWED_TRANSITIONS])
        raise ValueError(f"分层流转 {src}→{tgt} 不允许。合法路径: {allowed}")
    # 源层不能高于目标层（反向流转）
    src_order = LAYER_ORDER.get(src, -1)
    tgt_order = LAYER_ORDER.get(tgt, -1)
    if src_order > tgt_order and operation != "snapshot":
        raise ValueError(f"反向分层流转 {src}({src_order})→{tgt}({tgt_order}) 不允许")


async def validate_ddl_operation(
    db: AsyncSession,
    table_name: str,
    operation: str,
    target_layer: str | None = None,
) -> DdlValidationResult:
    """DDL 前置安全校验 — CREATE / DROP / REPLACE / ALTER / TRUNCATE 统一入口。

    原则：
    - 破坏性 DDL（DROP/REPLACE/ALTER/TRUNCATE）：查真实 registered_tables.warehouse_layer，不信任入参
    - CREATE：允许未注册，检查目标层 + 命名冲突 + 物理表冲突
    - CREATE OR REPLACE → REPLACE 处理
    """
    _validate_identifier(table_name)
    op = _normalize_operation(operation)

    # ── 破坏性 DDL：必须查真实元数据 ──
    if op in DESTRUCTIVE_DDL:
        actual_layer = await get_registered_layer(db, table_name)
        if actual_layer is None:
            raise ValueError(
                f"未注册资产 {table_name!r} 禁止 {op}。"
                f"破坏性 DDL 仅允许对已注册的 DWD/DWS/ADS 资产执行。"
            )
        if actual_layer.upper() == "ODS":
            raise ValueError(f"ODS 资产 {table_name!r} 禁止 {op}")
        assert_writable_layer(actual_layer)
        return DdlValidationResult(allowed=True, actual_layer=actual_layer)

    # ── CREATE：允许未注册，但需校验 target_layer ──
    if op == DDL_CREATE:
        if target_layer is None:
            raise ValueError("CREATE 操作必须提供 target_layer 参数")
        layer = target_layer.upper().strip()
        assert_writable_layer(layer)
        assert_not_ods_write(layer)

        # 命名冲突检查：不能与已有 ODS 资产同名
        existing_layer = await get_registered_layer(db, table_name)
        if existing_layer is not None and existing_layer.upper() == "ODS":
            raise ValueError(f"表名 {table_name!r} 与 ODS 资产冲突，禁止创建")

        # 物理表冲突：物理表存在但 registered_tables 不存在 → 拒绝
        if existing_layer is None:
            phys_exists = await _table_exists_physically(db, table_name)
            if phys_exists:
                raise ValueError(
                    f"物理表 {table_name!r} 已存在但缺少注册元数据，"
                    f"请先在数据资产中注册此表后再执行 DDL 操作"
                )

        return DdlValidationResult(allowed=True)

    raise ValueError(f"未处理的 DDL 操作: {op!r}")
